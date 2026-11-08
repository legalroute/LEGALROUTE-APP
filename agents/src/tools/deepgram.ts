
// Deepgram REST: pre-recorded transcription (Nova-3) and text-to-speech (Aura-2).
const BASE_URL = "https://api.deepgram.com/v1";
const STT_MODEL = "nova-3";
const DEFAULT_VOICE = "aura-2-thalia-en";

export class DeepgramError extends Error {}

function authHeader() {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) throw new DeepgramError("DEEPGRAM_API_KEY is not set in .env.local.");
  return { Authorization: `Token ${key}` };
}

async function failure(res: Response, what: string) {
  const body = await res.text().catch(() => "");
  return new DeepgramError(`Deepgram ${what} failed (${res.status}): ${body.slice(0, 300)}`);
}

export async function transcribe(audio: Blob): Promise<string> {
  const params = new URLSearchParams({ model: STT_MODEL, smart_format: "true", punctuate: "true" });
  const res = await fetch(`${BASE_URL}/listen?${params}`, {
    method: "POST",
    headers: { ...authHeader(), "Content-Type": audio.type || "audio/webm" },
    body: audio,
  });
  if (!res.ok) throw await failure(res, "transcription");
  const data = await res.json();
  return (data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "").trim();
}

// Returns MP3 bytes.
export async function synthesize(text: string): Promise<Buffer> {
  const params = new URLSearchParams({ model: process.env.DEEPGRAM_TTS_VOICE || DEFAULT_VOICE, encoding: "mp3" });
  const res = await fetch(`${BASE_URL}/speak?${params}`, {
    method: "POST",
    headers: { ...authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw await failure(res, "text-to-speech");
  return Buffer.from(await res.arrayBuffer());
}
