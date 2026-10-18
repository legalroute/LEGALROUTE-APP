import type { IntakeTurn } from "@/lib/intake";

export type ChatTurn = { role: "user" | "assistant"; text: string };

export type LlmResult = IntakeTurn & { model: string };

export class LlmError extends Error {}
