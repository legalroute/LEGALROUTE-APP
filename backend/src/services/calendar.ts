import { and, eq } from "drizzle-orm";
import { calendarConnections, db, type CalendarConnection } from "../db/index.ts";

// Google Calendar and Calendly over OAuth 2.0. Each is enabled once its client id/secret are in .env.local.

export type OAuthProvider = "google" | "calendly";

export const PROVIDERS: Record<OAuthProvider, { authUrl: string; tokenUrl: string; scope?: string; env: [string, string] }> = {
  google: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "openid email https://www.googleapis.com/auth/calendar.events",
    env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  },
  calendly: {
    authUrl: "https://auth.calendly.com/oauth/authorize",
    tokenUrl: "https://auth.calendly.com/oauth/token",
    env: ["CALENDLY_CLIENT_ID", "CALENDLY_CLIENT_SECRET"],
  },
};

export function isOAuthProvider(value: string): value is OAuthProvider {
  return value === "google" || value === "calendly";
}

export function providerConfigured(provider: OAuthProvider) {
  const [id, secret] = PROVIDERS[provider].env;
  return Boolean(process.env[id] && process.env[secret]);
}

function credentials(provider: OAuthProvider) {
  const [id, secret] = PROVIDERS[provider].env;
  return { clientId: process.env[id]!, clientSecret: process.env[secret]! };
}

export function redirectUri(origin: string, provider: OAuthProvider) {
  return `${origin}/api/calendar/${provider}/callback`;
}

export function authorizationUrl(provider: OAuthProvider, origin: string, state: string) {
  const p = PROVIDERS[provider];
  const params = new URLSearchParams({
    client_id: credentials(provider).clientId,
    redirect_uri: redirectUri(origin, provider),
    response_type: "code",
    state,
    ...(p.scope && { scope: p.scope }),
    // Google: ask for a refresh token so events can be created later without re-consent.
    ...(provider === "google" && { access_type: "offline", prompt: "consent", include_granted_scopes: "true" }),
  });
  return `${p.authUrl}?${params}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in?: number; id_token?: string };

async function tokenRequest(provider: OAuthProvider, body: Record<string, string>): Promise<TokenResponse> {
  const { clientId, clientSecret } = credentials(provider);
  const res = await fetch(PROVIDERS[provider].tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...body, client_id: clientId, client_secret: clientSecret }),
  });
  if (!res.ok) throw new Error(`${provider} token request failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

export async function exchangeCode(provider: OAuthProvider, origin: string, code: string) {
  const tokens = await tokenRequest(provider, { grant_type: "authorization_code", code, redirect_uri: redirectUri(origin, provider) });
  const profile = provider === "google" ? await googleProfile(tokens.access_token) : await calendlyProfile(tokens.access_token);
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
    accountEmail: profile.email,
    schedulingUrl: profile.schedulingUrl,
  };
}

async function googleProfile(accessToken: string) {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = res.ok ? ((await res.json()) as { email?: string }) : {};
  return { email: data.email ?? null, schedulingUrl: null };
}

async function calendlyProfile(accessToken: string) {
  const res = await fetch("https://api.calendly.com/users/me", { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = res.ok ? ((await res.json()) as { resource?: { email?: string; scheduling_url?: string } }) : {};
  return { email: data.resource?.email ?? null, schedulingUrl: data.resource?.scheduling_url ?? null };
}

export async function getConnections(userId: string) {
  return db.select().from(calendarConnections).where(eq(calendarConnections.userId, userId));
}

// A usable Google access token, refreshed when it is about to expire.
async function googleAccessToken(conn: CalendarConnection) {
  if (!conn.expiresAt || conn.expiresAt.getTime() > Date.now() + 60_000) return conn.accessToken;
  if (!conn.refreshToken) throw new Error("Google access expired. Reconnect Google Calendar.");
  const tokens = await tokenRequest("google", { grant_type: "refresh_token", refresh_token: conn.refreshToken });
  const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;
  await db
    .update(calendarConnections)
    .set({ accessToken: tokens.access_token, expiresAt })
    .where(and(eq(calendarConnections.id, conn.id)));
  return tokens.access_token;
}

export async function createGoogleEvent(
  conn: CalendarConnection,
  event: { summary: string; description: string; start: string; end: string; timeZone: string; attendeeEmail?: string | null },
) {
  const token = await googleAccessToken(conn);
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.start, timeZone: event.timeZone },
      end: { dateTime: event.end, timeZone: event.timeZone },
      ...(event.attendeeEmail && { attendees: [{ email: event.attendeeEmail }] }),
    }),
  });
  if (!res.ok) throw new Error(`Google Calendar rejected the event (${res.status}).`);
  return (await res.json()) as { htmlLink?: string };
}
