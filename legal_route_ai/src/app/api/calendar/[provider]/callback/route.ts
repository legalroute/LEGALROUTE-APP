import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { calendarConnections, db } from "@/db";
import { appOrigin, getCurrentUser } from "@/lib/auth";
import { exchangeCode, isOAuthProvider, providerConfigured } from "@/lib/calendar";
import { logActivity } from "@/lib/firm";

export async function GET(request: Request, ctx: RouteContext<"/api/calendar/[provider]/callback">) {
  const { provider } = await ctx.params;
  const url = new URL(request.url);
  // Every outcome clears the one-time state cookie.
  const back = (query: string) => {
    const response = NextResponse.redirect(new URL(`/calendar?${query}`, request.url));
    response.cookies.set(`lr_oauth_${provider}`, "", { path: "/api/calendar", maxAge: 0 });
    return response;
  };

  const user = await getCurrentUser();
  if (!user) return Response.redirect(new URL("/login?next=/calendar", request.url));
  if (!isOAuthProvider(provider) || !providerConfigured(provider)) return back("error=not_configured");

  const expected = (await cookies()).get(`lr_oauth_${provider}`)?.value;
  if (url.searchParams.get("error")) return back("error=denied");
  const code = url.searchParams.get("code");
  if (!code || !expected || url.searchParams.get("state") !== expected) return back("error=state");

  try {
    const conn = await exchangeCode(provider, await appOrigin(), code);
    await db
      .insert(calendarConnections)
      .values({ userId: user.id, provider, ...conn })
      .onConflictDoUpdate({ target: [calendarConnections.userId, calendarConnections.provider], set: conn });
    await logActivity(user.firm.id, "calendar", `${provider === "google" ? "Google Calendar" : "Calendly"} connected`);
    return back(`connected=${provider}`);
  } catch (e) {
    console.error("[calendar] connect failed", e);
    return back("error=exchange");
  }
}
