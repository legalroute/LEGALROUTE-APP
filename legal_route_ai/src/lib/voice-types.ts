// Shapes shared between the /api/voice routes and the browser.

// Allowed range for the live-conversation pause setting (ms of silence that ends a client turn).
export const SILENCE_MS_RANGE = { min: 600, max: 3000, default: 1200 } as const;

export type VoiceMessageDto = {
  id: string;
  role: "client" | "scribe";
  text: string;
  createdAt: string;
};

export type VoiceState = {
  percent: number;
  clientName: string | null;
  complete: boolean;
  endedEarly: boolean; // the client asked to stop before every topic was covered
};

export type StartResponse = VoiceState & {
  conversationId: string;
  message: VoiceMessageDto;
  audio: string | null; // base64 MP3
  warning?: string;
};

// /api/voice/turn streams newline-delimited JSON events so the page can show each stage.
export type TurnEvent =
  | { type: "transcript"; clientMessage: VoiceMessageDto }
  | ({ type: "reply"; scribeMessage: VoiceMessageDto } & VoiceState)
  | { type: "audio"; audio: string | null; warning?: string }
  | { type: "error"; error: string };

export type VoiceErrorResponse = { error: string };
