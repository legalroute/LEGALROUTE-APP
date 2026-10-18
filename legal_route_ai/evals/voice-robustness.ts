// Voice robustness eval: synthetic client speech in several voices, degraded with noise, background
// talkers and phone-quality audio, run through the real transcription. Scores word accuracy and whether
// the details that matter (names, dates, numbers) survive. Also times each step of one spoken turn.
//   npm run eval:voice
// Calls Deepgram and the AI provider; writes nothing to the database.
import "./env";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { synthesize, transcribe } from "@/lib/deepgram";
import { STARTER_PERSONAL_INJURY } from "@/lib/intake-config";
import { getSettings } from "@/lib/settings";
import { greetingFor, templateIntakeTurn } from "@/lib/template-intake";

const RATE = 48000;

// What clients say, and the details that must come through intact.
const UTTERANCES = [
  { text: "My name is Sarah Johnson, and the best number to reach me is 555-201-4477.", key: ["sarah", "johnson", "5552014477"] },
  { text: "I was rear-ended at a red light on March 14th on Main Street and Fifth Avenue.", key: ["rear", "march 14", "main street"] },
  { text: "I went to Springfield General the same day, and I still see a chiropractor twice a week.", key: ["springfield general", "chiropractor"] },
  { text: "I missed two weeks of work, which is about $3,000 in lost pay.", key: ["two weeks", "3000"] },
  { text: "My insurance is State Farm and the other driver had Geico.", key: ["state farm", "geico"] },
  { text: "No, I don't have any prior injuries to my neck or back.", key: ["no", "prior", "neck"] },
];

// US female, US male, British male, Australian female (Deepgram Aura-2 voices).
const VOICES = ["aura-2-thalia-en", "aura-2-apollo-en", "aura-2-draco-en", "aura-2-theia-en"];

type Condition = { id: string; label: string; apply: (speech: Int16Array, babble: Int16Array) => { pcm: Int16Array; rate: number } };

async function ttsPcm(text: string, voice: string) {
  const res = await fetch(`https://api.deepgram.com/v1/speak?model=${voice}&encoding=linear16&container=none&sample_rate=${RATE}`, {
    method: "POST",
    headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`TTS ${voice} failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  return new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2).slice();
}

function rms(x: ArrayLike<number>) {
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += x[i] * x[i];
  return Math.sqrt(sum / Math.max(1, x.length));
}

// Mix noise under speech at a target signal-to-noise ratio (dB).
function mix(speech: Int16Array, noise: Float64Array, snrDb: number) {
  const scale = rms(speech) / Math.max(1e-9, rms(noise)) / 10 ** (snrDb / 20);
  const out = new Int16Array(speech.length);
  for (let i = 0; i < speech.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(speech[i] + noise[i % noise.length] * scale)));
  return out;
}

// Pink-ish noise (Paul Kellet's filter) with slow loudness swells, like a busy room.
function roomNoise(n: number) {
  const out = new Float64Array(n);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    out[i] = (b0 + b1 + b2 + w * 0.1848) * (0.7 + 0.3 * Math.sin((2 * Math.PI * i) / (RATE * 1.7)));
  }
  return out;
}

// Phone line: 8 kHz with a crude low-pass (averaging) and a little hiss.
function phone(speech: Int16Array) {
  const factor = RATE / 8000;
  const out = new Int16Array(Math.floor(speech.length / factor));
  for (let i = 0; i < out.length; i++) {
    let s = 0;
    for (let j = 0; j < factor; j++) s += speech[i * factor + j];
    out[i] = Math.max(-32768, Math.min(32767, Math.round(s / factor + (Math.random() * 2 - 1) * 300)));
  }
  return out;
}

const CONDITIONS: Condition[] = [
  { id: "clean", label: "Clean", apply: (s) => ({ pcm: s, rate: RATE }) },
  { id: "room-10db", label: "Busy room (SNR 10 dB)", apply: (s) => ({ pcm: mix(s, roomNoise(s.length), 10), rate: RATE }) },
  { id: "room-0db", label: "Loud room (SNR 0 dB)", apply: (s) => ({ pcm: mix(s, roomNoise(s.length), 0), rate: RATE }) },
  { id: "talkers", label: "Other people talking (SNR 6 dB)", apply: (s, b) => ({ pcm: mix(s, Float64Array.from(b), 6), rate: RATE }) },
  { id: "phone", label: "Phone line (8 kHz)", apply: (s) => ({ pcm: phone(mix(s, roomNoise(s.length), 20)), rate: 8000 }) },
];

function wav(pcm: Int16Array, rate: number) {
  const data = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return new Blob([Buffer.concat([h, data])], { type: "audio/wav" });
}

// Lowercase, strip punctuation, write numbers as digits so "$3,000" and "3000" compare equal.
function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/(\d)[,-](?=\d)/g, "$1")
    .replace(/(\d+)(st|nd|rd|th)\b/g, "$1")
    .replace(/\bfifth\b/g, "5th")
    .replace(/\bfourteenth\b/g, "14")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordErrorRate(ref: string, hyp: string) {
  const r = normalize(ref).split(" ");
  const h = normalize(hyp).split(" ");
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++)
    for (let j = 1; j <= h.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  return d[r.length][h.length] / r.length;
}

function keyDetailsKept(key: string[], hyp: string) {
  const n = normalize(hyp);
  const digits = n.replace(/\s/g, "");
  return key.filter((k) => {
    const nk = normalize(k);
    return /^\d+$/.test(nk) ? digits.includes(nk) : n.includes(nk);
  }).length;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

async function main() {
  console.log(`Generating ${UTTERANCES.length} sentences × ${VOICES.length} voices…`);
  const speech = new Map<string, Int16Array>();
  for (const v of VOICES) {
    for (const [i, u] of UTTERANCES.entries()) {
      try {
        speech.set(`${v}|${i}`, await ttsPcm(u.text, v));
      } catch (e) {
        console.log(`  skipped ${v}: ${e instanceof Error ? e.message : e}`);
        break;
      }
    }
  }

  const rows: { voice: string; condition: string; utterance: number; wer: number; kept: number; total: number; transcript: string }[] = [];
  for (const [k, pcm] of speech) {
    const [voice, idx] = k.split("|");
    const i = Number(idx);
    // Background talkers: two other sentences in other voices, offset in time.
    const others = [...speech.entries()].filter(([kk]) => !kk.startsWith(voice) && !kk.endsWith(`|${i}`)).slice(0, 2).map(([, p]) => p);
    const babble = new Int16Array(pcm.length);
    others.forEach((o, n) => o.forEach((v, j) => { const t = j + n * RATE * 0.4; if (t < babble.length) babble[t] += v; }));
    for (const c of CONDITIONS) {
      const { pcm: degraded, rate } = c.apply(pcm, babble);
      const transcript = await transcribe(wav(degraded, rate)).catch((e) => `ERROR ${e.message}`);
      const u = UTTERANCES[i];
      rows.push({ voice, condition: c.id, utterance: i, wer: wordErrorRate(u.text, transcript), kept: keyDetailsKept(u.key, transcript), total: u.key.length, transcript });
    }
  }

  console.log("\nTranscription by condition (all voices):");
  console.log("Condition                        Word accuracy   Key details kept");
  for (const c of CONDITIONS) {
    const r = rows.filter((x) => x.condition === c.id);
    const acc = 1 - r.reduce((n, x) => n + Math.min(1, x.wer), 0) / r.length;
    const kept = r.reduce((n, x) => n + x.kept, 0) / r.reduce((n, x) => n + x.total, 0);
    console.log(`${c.label.padEnd(33)}${pct(acc).padStart(8)}${pct(kept).padStart(18)}`);
  }
  console.log("\nBy voice (all conditions):");
  for (const v of [...new Set(rows.map((r) => r.voice))]) {
    const r = rows.filter((x) => x.voice === v);
    console.log(`${v.padEnd(33)}${pct(1 - r.reduce((n, x) => n + Math.min(1, x.wer), 0) / r.length).padStart(8)}${pct(r.reduce((n, x) => n + x.kept, 0) / r.reduce((n, x) => n + x.total, 0)).padStart(18)}`);
  }
  const lost = rows.filter((r) => r.kept < r.total);
  console.log(`\nSentences that lost a key detail: ${lost.length}/${rows.length}`);
  for (const r of lost.slice(0, 12)) console.log(`  [${r.condition}, ${r.voice.replace("aura-2-", "").replace("-en", "")}] "${UTTERANCES[r.utterance].text}"\n      heard: "${r.transcript}"`);

  // One spoken turn, step by step.
  console.log("\nTiming one spoken turn (5 runs):");
  const settings = await getSettings();
  const greeting = greetingFor("Davis Law Group", STARTER_PERSONAL_INJURY);
  const sample = wav(speech.get(`${VOICES[0]}|1`)!, RATE);
  const timing: { stt: number; llm: number; tts: number; total: number }[] = [];
  for (let n = 0; n < 5; n++) {
    const t0 = Date.now();
    const heard = await transcribe(sample);
    const t1 = Date.now();
    const turn = await templateIntakeTurn({
      firmName: "Davis Law Group",
      config: STARTER_PERSONAL_INJURY,
      answered: new Map([["full_name", "Sarah Johnson"]]),
      greeting,
      history: [{ role: "user", text: "My name is Sarah Johnson." }, { role: "assistant", text: "Thanks, Sarah. Can you tell me what happened?" }, { role: "user", text: heard }],
      settings,
    });
    const t2 = Date.now();
    await synthesize(turn.reply);
    const t3 = Date.now();
    timing.push({ stt: t1 - t0, llm: t2 - t1, tts: t3 - t2, total: t3 - t0 });
  }
  const med = (k: keyof (typeof timing)[number]) => [...timing.map((t) => t[k])].sort((a, b) => a - b)[2];
  const pause = settings.silenceMs;
  console.log(`  End-of-speech pause setting  ${pause} ms`);
  console.log(`  Transcription                ${med("stt")} ms`);
  console.log(`  Maya's reply (AI)            ${med("llm")} ms`);
  console.log(`  Voice generation (full)      ${med("tts")} ms`);
  console.log(`  Client waits ≈               ${pause + med("total")} ms before Maya starts speaking`);

  const dir = path.join(process.cwd(), "evals", "results");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `voice-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await writeFile(file, JSON.stringify({ rows, timing, silenceMs: pause }, null, 2));
  console.log(`\nDetails: ${path.relative(process.cwd(), file)}`);
  process.exit(0);
}

main();
