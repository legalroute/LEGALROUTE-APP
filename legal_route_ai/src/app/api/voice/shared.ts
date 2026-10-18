import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { synthesize } from "@/lib/deepgram";
import { INTAKE_TOPICS } from "@/lib/intake";
import type { VoiceMessage } from "@/db";
import type { VoiceMessageDto } from "@/lib/voice-types";

// Audio is kept on local disk (gitignored): recordings/<conversationId>/<file>.
const RECORDINGS_DIR = path.join(process.cwd(), "recordings");

export async function saveAudio(conversationId: string, fileName: string, bytes: Buffer) {
  const dir = path.join(RECORDINGS_DIR, conversationId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fileName), bytes);
  return `recordings/${conversationId}/${fileName}`;
}

export function toDto(m: VoiceMessage): VoiceMessageDto {
  return { id: m.id, role: m.role, text: m.text, createdAt: m.createdAt.toISOString() };
}

export function progressPercent(coveredTopics: string[]) {
  return Math.round((coveredTopics.length / INTAKE_TOPICS.length) * 100);
}

// Speech is best-effort: if TTS fails the conversation continues as text.
export async function trySynthesize(text: string) {
  try {
    return { bytes: await synthesize(text) };
  } catch (e) {
    return { warning: e instanceof Error ? e.message : "Text-to-speech failed." };
  }
}
