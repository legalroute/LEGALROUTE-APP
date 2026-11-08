// Shared configuration is safe to import without opening a database connection.
export const DEFAULT_OPENAI_MODEL = "gpt-5.5";
export type Provider = "anthropic" | "openai";
export type ResolvedSettings = {
  provider: Provider;
  openaiModel: string;
  firmName: string | null;
  silenceMs: number;
  allowInterrupt: boolean;
};
