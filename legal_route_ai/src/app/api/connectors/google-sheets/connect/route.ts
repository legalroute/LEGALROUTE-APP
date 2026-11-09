import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { beginConnection } from "@legalroute/backend/connectors/service";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/connections", request.url));
  try {
    const result = await beginConnection(user);
    const response = NextResponse.redirect(result.url);
    response.cookies.set("lr_sheets_oauth", result.state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/connectors/google-sheets", maxAge: 600 });
    return response;
  } catch { return NextResponse.redirect(new URL("/connections?error=configuration", request.url)); }
}
