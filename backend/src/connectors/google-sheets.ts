import { z } from "zod";
import { ConnectorError, LIMITS } from "./values.ts";

export const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const tokenSchema = z.object({ access_token: z.string().min(1), refresh_token: z.string().optional(), expires_in: z.number().positive().default(3600), scope: z.string().optional() });
export type Tokens = { accessToken: string; refreshToken: string; expiresAt: number };
export type Source = { spreadsheetId: string; title: string; sheetId: number; sheetTitle: string; values: string[][] };

export async function googleJson(url: string, init: RequestInit = {}, fetcher: typeof fetch = fetch): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    try { response = await fetcher(url, { ...init, signal: AbortSignal.timeout(15000), cache: "no-store" }); }
    catch { throw new ConnectorError("Google could not be reached. Please retry."); }
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await response.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 401 || response.status === 403) throw new ConnectorError("Google access was denied. Reconnect the account or check spreadsheet access.");
      if (response.status === 404) throw new ConnectorError("Spreadsheet or tab not found. Check its link and sharing permissions.");
      throw new ConnectorError("Google rejected this request. Check the connection and try again.");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new ConnectorError("Google returned an empty response.");
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > LIMITS.bytes) { await reader.cancel(); throw new ConnectorError("Sheet response exceeds 5 MB. Choose a smaller tab."); }
      chunks.push(part.value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new ConnectorError("Google returned an invalid response."); }
  }
  throw new ConnectorError("Google is temporarily unavailable.");
}
export function callbackUri() {
  const raw = process.env.APP_URL;
  if (!raw) throw new ConnectorError("Configure APP_URL before connecting Google Sheets.");
  const url = new URL(raw);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new ConnectorError("APP_URL must use HTTPS (or localhost for development).");
  return `${url.origin}/api/connectors/google-sheets/callback`;
}
export function consentUrl(state: string, challenge: string) {
  return "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
    client_id: process.env.GOOGLE_SHEETS_CLIENT_ID!, redirect_uri: callbackUri(), response_type: "code",
    scope: `openid email ${SHEETS_SCOPE}`, state, code_challenge: challenge, code_challenge_method: "S256",
    access_type: "offline", prompt: "consent",
  });
}
async function tokens(body: Record<string, string>, fetcher: typeof fetch) {
  return tokenSchema.parse(await googleJson("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...body, client_id: process.env.GOOGLE_SHEETS_CLIENT_ID!, client_secret: process.env.GOOGLE_SHEETS_CLIENT_SECRET! }),
  }, fetcher));
}
export async function exchange(code: string, verifier: string, redirectUri: string, fetcher: typeof fetch = fetch) {
  const result = await tokens({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri }, fetcher);
  if (!result.scope?.split(" ").includes(SHEETS_SCOPE)) throw new ConnectorError("Read access to Google Sheets was not granted.");
  if (!result.refresh_token) throw new ConnectorError("Google did not grant offline access. Remove the old app grant in Google and reconnect.");
  const profile = z.object({ sub: z.string().min(1), email: z.email(), email_verified: z.literal(true) }).parse(await googleJson("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${result.access_token}` } }, fetcher));
  return { accountId: profile.sub, email: profile.email, scopes: result.scope.split(" "), tokens: { accessToken: result.access_token, refreshToken: result.refresh_token, expiresAt: Date.now() + result.expires_in * 1000 } };
}
export async function usableTokens(value: Tokens, fetcher: typeof fetch = fetch): Promise<Tokens> {
  if (value.expiresAt > Date.now() + 60000) return value;
  const result = await tokens({ grant_type: "refresh_token", refresh_token: value.refreshToken }, fetcher);
  return { accessToken: result.access_token, refreshToken: result.refresh_token ?? value.refreshToken, expiresAt: Date.now() + result.expires_in * 1000 };
}
const metadataSchema = z.object({ spreadsheetId: z.string(), properties: z.object({ title: z.string() }), sheets: z.array(z.object({ properties: z.object({ sheetId: z.number().int().nonnegative(), title: z.string(), gridProperties: z.object({ rowCount: z.number().int().positive(), columnCount: z.number().int().positive() }).optional() }) })) });
export async function metadata(token: string, id: string, fetcher: typeof fetch = fetch) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=spreadsheetId,properties(title),sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))`;
  const data = metadataSchema.parse(await googleJson(url, { headers: { Authorization: `Bearer ${token}` } }, fetcher));
  return { spreadsheetId: data.spreadsheetId, title: data.properties.title, tabs: data.sheets.filter((s) => s.properties.gridProperties).map((s) => s.properties) };
}
export async function readTab(token: string, id: string, sheetId: number, fetcher: typeof fetch = fetch): Promise<Source> {
  const data = await metadata(token, id, fetcher), tab = data.tabs.find((t) => t.sheetId === sheetId);
  if (!tab?.gridProperties) throw new ConnectorError("This tab is missing or is not a standard grid.");
  const { rowCount, columnCount } = tab.gridProperties;
  if (rowCount > LIMITS.rows + 1 || columnCount > LIMITS.columns || rowCount * columnCount > LIMITS.cells) throw new ConnectorError("Resize this tab to at most 10,001 rows, 100 columns and 200,000 grid cells before connecting.");
  const range = `'${tab.title.replaceAll("'", "''")}'!A1:CV${rowCount}`;
  const values = z.object({ values: z.array(z.array(z.union([z.string(), z.number(), z.boolean()]).transform(String))).optional() }).parse(await googleJson(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`, { headers: { Authorization: `Bearer ${token}` } }, fetcher));
  return { spreadsheetId: id, title: data.title, sheetId, sheetTitle: tab.title, values: values.values ?? [] };
}
