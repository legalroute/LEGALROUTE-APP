// Raw microphone capture for the live intake. Unlike MediaRecorder, raw PCM can be trimmed,
// so a turn can start with the audio from just *before* speech was detected (pre-roll).

const WORKLET_SOURCE = `
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(2048);
    this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i];
        if (this.n === this.buf.length) {
          this.port.postMessage(this.buf.slice());
          this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
`;

const loaded = new WeakSet<AudioContext>();

// Streams mono Float32 chunks (~43 ms at 48 kHz) from `source` to `onChunk`.
export async function createPcmCapture(ctx: AudioContext, source: AudioNode, onChunk: (chunk: Float32Array) => void) {
  if (!loaded.has(ctx)) {
    const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "text/javascript" }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    loaded.add(ctx);
  }
  // No outputs: the browser still runs it, and nothing is played back.
  const node = new AudioWorkletNode(ctx, "pcm-capture", { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 1 });
  node.port.onmessage = (e: MessageEvent<Float32Array>) => onChunk(e.data);
  source.connect(node);
  return node;
}

// Keeps roughly the most recent `seconds` of audio.
export class PcmRing {
  private chunks: Float32Array[] = [];
  private length = 0;
  constructor(private maxSamples: number) {}

  push(chunk: Float32Array) {
    this.chunks.push(chunk);
    this.length += chunk.length;
    while (this.chunks.length > 1 && this.length - this.chunks[0].length >= this.maxSamples) {
      this.length -= this.chunks.shift()!.length;
    }
  }

  snapshot() {
    return [...this.chunks];
  }
}

// 16 kHz mono 16-bit WAV: plenty for speech recognition and ~3x smaller than 48 kHz.
export function encodeWav(chunks: Float32Array[], inputRate: number, outputRate = 16000): Blob {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const input = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    input.set(c, offset);
    offset += c.length;
  }

  const ratio = inputRate / outputRate;
  const outLength = Math.floor(total / ratio);
  const pcm = new Int16Array(outLength);
  for (let i = 0; i < outLength; i++) {
    // Average the input samples that fall in this output sample (a cheap low-pass).
    const start = Math.floor(i * ratio);
    const end = Math.min(total, Math.floor((i + 1) * ratio)) || start + 1;
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    const v = Math.max(-1, Math.min(1, sum / (end - start)));
    pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }

  const header = new DataView(new ArrayBuffer(44));
  const write = (pos: number, s: string) => [...s].forEach((ch, k) => header.setUint8(pos + k, ch.charCodeAt(0)));
  write(0, "RIFF");
  header.setUint32(4, 36 + pcm.byteLength, true);
  write(8, "WAVE");
  write(12, "fmt ");
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true); // PCM
  header.setUint16(22, 1, true); // mono
  header.setUint32(24, outputRate, true);
  header.setUint32(28, outputRate * 2, true);
  header.setUint16(32, 2, true);
  header.setUint16(34, 16, true);
  write(36, "data");
  header.setUint32(40, pcm.byteLength, true);
  return new Blob([header, pcm], { type: "audio/wav" });
}
