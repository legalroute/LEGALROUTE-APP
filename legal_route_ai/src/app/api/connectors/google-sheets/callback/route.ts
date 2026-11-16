import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ConnectorError, finishConnection } from "@legalroute/backend/connectors/service";

export async function GET(request: Request) {
  const url = new URL(request.url), user = await getCurrentUser();
  const back = (query: string) => {
    const response = NextResponse.redirect(new URL(`/connections?${query}`, request.url));
    response.cookies.set("lr_sheets_oauth", "", { path: "/api/connectors/google-sheets", maxAge: 0 });
    return response;
  };
  const state = url.searchParams.get("state"), code = url.searchParams.get("code");
  const expected = (await cookies()).get("lr_sheets_oauth")?.value;
  if (url.searchParams.has("error")) return back(url.searchParams.get("error") === "access_denied" ? "error=google_denied" : "error=authorization");
  if (!user || !expected || !state || expected !== state || !code) return back("error=oauth_state");
  try { await finishConnection(user, state, code); return back("connected=1"); }
  catch (error) {
    // Expose only fixed categories, never codes, tokens, Google response bodies or database errors.
    const reason = error instanceof ConnectorError ? new Map([
      ["The connection request expired. Please reconnect.", "oauth_state"],
      ["Read access to Google Sheets was not granted.", "sheets_scope"],
      ["Google did not grant offline access. Remove the old app grant in Google and reconnect.", "offline_access"],
      ["Google could not be reached. Please retry.", "google_unreachable"],
      ["Google rejected this request. Check the connection and try again.", "google_exchange"],
      ["Google access was denied. Reconnect the account or check spreadsheet access.", "google_exchange"],
    ]).get(error.message) : undefined;
    console.error("[google-sheets OAuth] Completion failed", { category: reason ?? "completion", errorType: error instanceof Error ? error.name : "unknown" });
    return back(`error=${reason ?? "authorization"}`);
  }
}
