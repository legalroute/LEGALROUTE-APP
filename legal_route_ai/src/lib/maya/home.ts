import "server-only";
import { homeTurn as runHomeTurn } from "@legalroute/agents/agents/maya/home";
import { firmSnapshot } from "@legalroute/backend/services/maya/home-context";

export async function homeTurn(opts: Omit<Parameters<typeof runHomeTurn>[0], "snapshot">) {
  return runHomeTurn({ ...opts, snapshot: await firmSnapshot(opts.user.firm.id) });
}
