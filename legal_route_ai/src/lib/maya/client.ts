import "server-only";
import type { Client } from "@legalroute/backend/db/schema";
import { clientTurn as runClientTurn } from "@legalroute/agents/agents/maya/client";
import { clientContext } from "@legalroute/backend/services/maya/client-context";
export { clientContext } from "@legalroute/backend/services/maya/client-context";

export async function clientTurn(opts: Omit<Parameters<typeof runClientTurn>[0], "context"> & { client: Client }) {
  const { client, ...input } = opts;
  return runClientTurn({ ...input, context: await clientContext(client) });
}
