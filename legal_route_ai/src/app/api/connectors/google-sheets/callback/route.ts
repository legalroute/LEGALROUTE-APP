import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { finishConnection } from "@legalroute/backend/connectors/service";

export async function GET(request: Request) {
  const url = new URL(request.url), user = await getCurrentUser();
  const back = (query: string) => {
    const response = NextResponse.redirect(new URL(`/connections?${query}`, request.url));
    response.cookies.set("lr_sheets_oauth", "", { path: "/api/connectors/google-sheets", maxAge: 0 });
    return response;
  };
  const state = url.searchParams.get("state"), code = url.searchParams.get("code");
  const expected = (await cookies()).get("lr_sheets_oauth")?.value;
  if (!user || !expected || !state || expected !== state || !code || url.searchParams.has("error")) return back("error=authorization");
  try { await finishConnection(user, state, code); return back("connected=1"); }
  catch { return back("error=authorization"); }
}
