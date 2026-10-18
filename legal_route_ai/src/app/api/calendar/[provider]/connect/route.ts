import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { appOrigin, getCurrentUser } from "@/lib/auth";
import { authorizationUrl, isOAuthProvider, providerConfigured } from "@/lib/calendar";

// Sends the attorney to the provider's consent screen. A random state cookie guards the callback.
export async function GET(request: Request, ctx: RouteContext<"/api/calendar/[provider]/connect">) {
  const { provider } = await ctx.params;
  if (!(await getCurrentUser())) return Response.redirect(new URL("/login?next=/calendar", request.url));
  if (!isOAuthProvider(provider) || !providerConfigured(provider)) {
    return Response.redirect(new URL("/calendar?error=not_configured", request.url));
  }
  const state = randomBytes(24).toString("base64url");
  const response = NextResponse.redirect(authorizationUrl(provider, await appOrigin(), state));
  response.cookies.set(`lr_oauth_${provider}`, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/calendar",
    maxAge: 600,
  });
  return response;
}
