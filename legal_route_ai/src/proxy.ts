import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: no session cookie means straight to /login. Pages, Server Actions and
// route handlers still verify the session against the database (requireUser).
export function proxy(request: NextRequest) {
  if (request.cookies.has("lr_session")) return NextResponse.next();
  const login = new URL("/login", request.url);
  const next = request.nextUrl.pathname + request.nextUrl.search;
  if (next !== "/home") login.searchParams.set("next", next);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/home/:path*",
    "/clients/:path*",
    "/intakes/:path*",
    "/intake-builder/:path*",
    "/calendar/:path*",
    "/firm-settings/:path*",
  ],
};
