"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, RotateCcw } from "lucide-react";
import type { StartResponse, TurnEvent, VoiceErrorResponse, VoiceMessageDto } from "@/lib/voice-types";
import { createPcmCapture, encodeWav, PcmRing } from "./pcm-capture";

// Live conversation: after the microphone is tapped it stays open. Voice activity detection
// ends the client's turn after a pause, and listening resumes when Scribe finishes speaking.
type Phase =
  | "consent"
  | "starting"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "paused"
  | "complete";

const phaseLabel = (name: string): Record<Phase, string> => ({
  consent: "Ready when you are",
  starting: "Starting…",
  listening: "Listening…",
  transcribing: "Transcribing…",
  thinking: "Thinking…",
  speaking: `${name} is speaking…`,
  paused: "Stopped",
  complete: "Intake complete",
});

const phaseDetail = (name: string, completeDetail: string): Record<Phase, string> => ({
  consent: "Waiting to start",
  starting: "Connecting…",
  listening: `Your turn. Speak naturally and ${name} will reply when you pause`,
  transcribing: "Transcribing…",
  thinking: `${name} is thinking…`,
  speaking: `${name} is speaking`,
  paused: "Stopped. Tap the microphone to continue",
  complete: completeDetail,
});

const DEFAULT_COMPLETE_DETAIL = "Thank you. An attorney will review your information";
const DEFAULT_DESCRIPTION =
  "A short spoken conversation about your injury. Just talk naturally; Scribe replies when you pause. It takes about five minutes.";

// Resting bar heights (px) for one side of the waveform, outermost first.
const BAR_BASE = [4, 8, 14, 22, 30, 20, 34, 16, 26];

// Voice activity detection tuning.
const VAD_TICK_MS = 50;
const SPEECH_START_MS = 250; // voiced audio needed before we treat it as speech
const INTERRUPT_MS = 350; // sustained louder speech needed to interrupt Scribe
const MAX_TURN_MS = 90_000; // send long monologues anyway
const PREROLL_SECONDS = 1.5; // audio kept from before speech is detected, so first words aren't clipped
const MIN_THRESHOLD = 0.012; // RMS floor for "voiced"

function initials(name: string | null) {
  if (!name) return "C";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "C";
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// The optional props let the firm intake link (/intake/<slug>) reuse this component; the defaults are /voice.
export function VoiceIntake({
  silenceMs,
  allowInterrupt,
  assistantName = "Scribe",
  startUrl = "/api/voice/start",
  turnUrl = "/api/voice/turn",
  startBody,
  newIntakeUrl,
  showProgress = true,
  description = DEFAULT_DESCRIPTION,
  completeDetail = DEFAULT_COMPLETE_DETAIL,
  reviewerName = "LegalRoute",
}: {
  silenceMs: number;
  allowInterrupt: boolean;
  assistantName?: string;
  startUrl?: string;
  turnUrl?: string;
  startBody?: Record<string, string>;
  newIntakeUrl?: string;
  showProgress?: boolean;
  description?: string;
  completeDetail?: string;
  reviewerName?: string;
}) {
  const PHASE_LABEL = phaseLabel(assistantName);
  const PHASE_DETAIL = phaseDetail(assistantName, completeDetail);
  const [phase, setPhaseState] = useState<Phase>("consent");
  const [consented, setConsented] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [resumeUrl, setResumeUrl] = useState<string>();
  const accessTokenRef = useRef<string | undefined>(undefined);
  const [conversationId, setConversationId] = useState<string>();
  const [messages, setMessages] = useState<VoiceMessageDto[]>([]);
  const [percent, setPercent] = useState(0);
  const [clientName, setClientName] = useState<string | null>(null);
  const [endedEarly, setEndedEarly] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  // Timers and audio callbacks read these refs, not React state, to avoid stale closures.
  const phaseRef = useRef<Phase>("consent");
  const conversationRef = useRef<string | null>(null);
  const completeRef = useRef(false);
  const settingsRef = useRef({ silenceMs, allowInterrupt });

  const audioCtxRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const playAnalyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const playerRef = useRef<HTMLAudioElement | null>(null);
  const playSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const captureRef = useRef<AudioWorkletNode | null>(null);
  const ringRef = useRef<PcmRing | null>(null);
  // Audio for the client's current turn; null until speech is detected.
  const turnRef = useRef<Float32Array[] | null>(null);
  const vadTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const vadRef = useRef({ speechMs: 0, silenceMs: 0, hadSpeech: false, startedAt: 0, interruptMs: 0, noiseFloor: 0.005 });
  // Set below; lets audio callbacks call the latest sendTurn without re-creating them.
  const sendTurnRef = useRef<(blob: Blob) => void>(() => {});

  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // ---- Audio graph ----

  const audioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const ctx = new AudioContext();
      const mic = ctx.createAnalyser();
      mic.fftSize = 512;
      mic.smoothingTimeConstant = 0.6;
      const play = ctx.createAnalyser();
      play.fftSize = 64;
      play.smoothingTimeConstant = 0.7;
      play.connect(ctx.destination);
      audioCtxRef.current = ctx;
      micAnalyserRef.current = mic;
      playAnalyserRef.current = play;
    }
    void audioCtxRef.current.resume();
    return audioCtxRef.current;
  }, []);

  const openMic = useCallback(async () => {
    if (micStreamRef.current) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const ctx = audioContext();
      micStreamRef.current = stream;
      micSourceRef.current = ctx.createMediaStreamSource(stream);
      micSourceRef.current.connect(micAnalyserRef.current!);
      const ring = new PcmRing(Math.round(ctx.sampleRate * PREROLL_SECONDS));
      ringRef.current = ring;
      captureRef.current = await createPcmCapture(ctx, micSourceRef.current, (chunk) => {
        ring.push(chunk);
        turnRef.current?.push(chunk);
      });
      return true;
    } catch {
      setError("Microphone access was blocked. Allow it in your browser's site settings and try again.");
      return false;
    }
  }, [audioContext]);

  // ---- Capturing a client turn ----

  // Wait for the client to speak. Audio is only kept once speech is detected.
  const startRecording = useCallback(() => {
    if (!micStreamRef.current || completeRef.current) return;
    turnRef.current = null;
    vadRef.current = { ...vadRef.current, speechMs: 0, silenceMs: 0, hadSpeech: false, startedAt: Date.now(), interruptMs: 0 };
    setHearing(false);
    setPhase("listening");
  }, [setPhase]);

  // Speech detected: start the turn with the pre-roll so the first words are included.
  const beginTurn = useCallback(() => {
    turnRef.current = ringRef.current?.snapshot() ?? [];
    vadRef.current.hadSpeech = true;
    setHearing(true);
  }, []);

  const stopRecording = useCallback((send: boolean) => {
    const chunks = turnRef.current;
    turnRef.current = null;
    const ctx = audioCtxRef.current;
    if (send && chunks?.length && ctx) sendTurnRef.current(encodeWav(chunks, ctx.sampleRate));
  }, []);

  // ---- Playback ----

  const stopPlayback = useCallback(() => {
    const player = playerRef.current;
    playerRef.current = null;
    if (player) {
      player.onended = null;
      player.pause();
    }
    playSourceRef.current?.disconnect();
    playSourceRef.current = null;
  }, []);

  // What happens once Scribe has finished (or skipped) speaking.
  const afterScribe = useCallback(() => {
    if (completeRef.current) setPhase("complete");
    else if (phaseRef.current !== "paused") startRecording();
  }, [setPhase, startRecording]);

  const play = useCallback(
    (base64: string | null) => {
      stopPlayback();
      if (!base64 || phaseRef.current === "paused") return afterScribe();
      const ctx = audioContext();
      const player = new Audio(`data:audio/mpeg;base64,${base64}`);
      playerRef.current = player;
      playSourceRef.current = ctx.createMediaElementSource(player);
      playSourceRef.current.connect(playAnalyserRef.current!);
      vadRef.current.interruptMs = 0;
      setPhase("speaking");
      const done = () => {
        if (playerRef.current !== player) return;
        stopPlayback();
        afterScribe();
      };
      player.onended = done;
      // Autoplay blocked or decode failed: the reply text is still on screen.
      player.play().catch(done);
    },
    [afterScribe, audioContext, setPhase, stopPlayback],
  );

  // ---- Voice activity detection + waveform ----

  const vadTick = useCallback(() => {
    const analyser = micAnalyserRef.current;
    if (!analyser) return;
    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += v * v;
    const rms = Math.sqrt(sum / buf.length);

    const vad = vadRef.current;
    const phase = phaseRef.current;
    const threshold = Math.max(MIN_THRESHOLD, vad.noiseFloor * 3);
    const voiced = rms > threshold;

    if (phase === "listening") {
      // Track background noise only while nobody is talking.
      if (!voiced) vad.noiseFloor = Math.max(0.002, vad.noiseFloor * 0.97 + rms * 0.03);

      if (voiced) {
        vad.speechMs += VAD_TICK_MS;
        vad.silenceMs = 0;
        if (!vad.hadSpeech && vad.speechMs >= SPEECH_START_MS) beginTurn();
      } else if (vad.hadSpeech) {
        vad.silenceMs += VAD_TICK_MS;
      } else {
        vad.speechMs = Math.max(0, vad.speechMs - VAD_TICK_MS);
      }

      const elapsed = Date.now() - vad.startedAt;
      if (vad.hadSpeech && (vad.silenceMs >= settingsRef.current.silenceMs || elapsed >= MAX_TURN_MS)) {
        setPhase("transcribing");
        stopRecording(true);
      }
    } else if (phase === "speaking" && settingsRef.current.allowInterrupt) {
      // Needs louder, sustained speech so Scribe's own voice leaking into the mic doesn't trigger it.
      vad.interruptMs = rms > Math.max(0.03, vad.noiseFloor * 5) ? vad.interruptMs + VAD_TICK_MS : 0;
      if (vad.interruptMs >= INTERRUPT_MS) {
        stopPlayback();
        startRecording();
        // The client has already started talking; the pre-roll holds their first words.
        beginTurn();
      }
    }
  }, [beginTurn, setPhase, startRecording, stopPlayback, stopRecording]);

  const drawBars = useCallback(() => {
    const phase = phaseRef.current;
    const analyser =
      phase === "speaking" ? playAnalyserRef.current : phase === "listening" ? micAnalyserRef.current : null;
    const data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    if (analyser && data) analyser.getByteFrequencyData(data);
    barsRef.current.forEach((bar, i) => {
      if (!bar) return;
      const side = i % BAR_BASE.length;
      // Inner bars (higher index) follow lower, louder frequency bins.
      const level = data ? data[Math.min(data.length - 1, BAR_BASE.length - side)] / 255 : 0;
      bar.style.height = `${Math.max(3, BAR_BASE[side] * (data ? 0.35 + level * 1.6 : 0.45))}px`;
    });
    rafRef.current = requestAnimationFrame(drawBars);
  }, []);

  const startLoops = useCallback(() => {
    if (vadTimerRef.current === null) vadTimerRef.current = window.setInterval(vadTick, VAD_TICK_MS);
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(drawBars);
  }, [drawBars, vadTick]);

  // Tear down everything live: loops, recorder, playback, and the mic itself.
  const endSession = useCallback(() => {
    if (vadTimerRef.current !== null) clearInterval(vadTimerRef.current);
    vadTimerRef.current = null;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    stopRecording(false);
    stopPlayback();
    captureRef.current?.port.close();
    captureRef.current?.disconnect();
    captureRef.current = null;
    ringRef.current = null;
    micSourceRef.current?.disconnect();
    micSourceRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    barsRef.current.forEach((bar, i) => {
      if (bar) bar.style.height = `${BAR_BASE[i % BAR_BASE.length] * 0.45}px`;
    });
  }, [stopPlayback, stopRecording]);

  // ---- Conversation ----

  async function startIntake() {
    setError(undefined);
    setNotice(undefined);
    setPhase("starting");
    audioContext(); // create/resume inside the click so playback is allowed
    if (!(await openMic())) return setPhase("consent");
    try {
      const res = await fetch(startUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...startBody, consent: true }),
      });
      const data = (await res.json()) as StartResponse | VoiceErrorResponse;
      if (!res.ok || "error" in data) throw new Error("error" in data ? data.error : `Request failed (${res.status})`);
      completeRef.current = false;
      conversationRef.current = data.conversationId;
      setConversationId(data.conversationId);
      setMessages(data.messages ?? [data.message]);
      accessTokenRef.current = data.accessToken;
      setResumeUrl(data.resumeUrl);
      setPercent(data.percent);
      setClientName(data.clientName);
      setNotice(data.warning);
      startLoops();
      play(data.audio);
    } catch (e) {
      endSession();
      setError(e instanceof Error ? e.message : "Couldn't start the intake.");
      setPhase("consent");
    }
  }

  async function sendTurn(blob: Blob) {
    const id = conversationRef.current;
    if (!id) return;
    setError(undefined);
    setNotice(undefined);
    setPhase("transcribing");
    const form = new FormData();
    form.append("conversationId", id);
    form.append("audio", blob, "message");

    let gotAudio = false;
    try {
      const res = await fetch(turnUrl, { method: "POST", body: form, headers: accessTokenRef.current ? { Authorization: `Bearer ${accessTokenRef.current}` } : undefined });
      if (res.status === 422) {
        // Nothing intelligible (noise, a cough): quietly keep listening.
        if (conversationRef.current === id) afterScribe();
        return;
      }
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as Partial<VoiceErrorResponse>;
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        // "Start over" was pressed mid-request: drop the rest.
        if (conversationRef.current !== id) return;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as TurnEvent;
          if (event.type === "transcript") {
            setMessages((m) => [...m, event.clientMessage]);
            if (phaseRef.current !== "paused") setPhase("thinking");
          } else if (event.type === "reply") {
            setMessages((m) => [...m, event.scribeMessage]);
            setPercent(event.percent);
            setClientName(event.clientName);
            completeRef.current = event.complete;
            setEndedEarly(event.endedEarly);
            if (event.complete) {
              // Stop listening now, not after the goodbye plays, so nothing more is recorded.
              stopRecording(false);
              micStreamRef.current?.getTracks().forEach((t) => (t.enabled = false));
            }
          } else if (event.type === "audio") {
            gotAudio = true;
            setNotice(event.warning);
            play(event.audio);
          } else if (event.type === "error") {
            throw new Error(event.error);
          }
        }
      }
      if (!gotAudio) afterScribe();
    } catch (e) {
      if (conversationRef.current !== id) return;
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      afterScribe();
    }
  }

  // Keep the refs the audio callbacks read in sync with the latest render.
  useEffect(() => {
    settingsRef.current = { silenceMs, allowInterrupt };
    sendTurnRef.current = (blob) => void sendTurn(blob);
  });

  // Stop the mic once the intake is finished.
  useEffect(() => {
    if (phase === "complete") endSession();
  }, [phase, endSession]);

  // The microphone button starts the intake, then stops and resumes listening.
  function onMicClick() {
    const p = phaseRef.current;
    if (p === "consent") {
      if (consented) void startIntake();
    } else if (p === "paused") {
      micStreamRef.current?.getTracks().forEach((t) => (t.enabled = true));
      startRecording();
    } else if (p === "listening" || p === "speaking") {
      stopRecording(false);
      stopPlayback();
      micStreamRef.current?.getTracks().forEach((t) => (t.enabled = false));
      setPhase("paused");
    }
  }

  function newIntake() {
    if (newIntakeUrl) { window.location.assign(newIntakeUrl); return; }
    accessTokenRef.current = undefined;
    setResumeUrl(undefined);
    endSession();
    conversationRef.current = null;
    completeRef.current = false;
    setConversationId(undefined);
    setMessages([]);
    setPercent(0);
    setClientName(null);
    setEndedEarly(false);
    setError(undefined);
    setNotice(undefined);
    setConsented(false);
    setHearing(false);
    setPhase("consent");
  }

  useEffect(
    () => () => {
      endSession();
      void audioCtxRef.current?.close();
    },
    [endSession],
  );

  const paused = phase === "paused";
  const live = phase === "listening" || phase === "speaking";
  const busy = phase === "transcribing" || phase === "thinking" || phase === "starting";
  const idle = phase === "consent" || phase === "starting";
  const micEnabled = (phase === "consent" && consented) || live || paused;
  const label =
    phase === "listening" && hearing ? "Hearing you…" : phase === "complete" && endedEarly ? "Intake ended" : PHASE_LABEL[phase];
  const hint =
    phase === "consent" ? (consented ? "Tap the microphone to start" : "Agree below, then tap the microphone to start")
    : live ? "Tap to stop"
    : paused ? "Tap to continue"
    : null;

  return (
    <section className="rounded-[2rem] border border-white bg-white/70 p-3 shadow-[0_20px_60px_-20px_var(--intake-card-shadow,rgba(234,88,12,0.25))] backdrop-blur-xl sm:p-5">
      {/* Progress */}
      {showProgress && (
        <div className="mb-3 flex items-center gap-4 rounded-2xl border border-slate-200/70 bg-white/80 px-5 py-4 sm:gap-6">
          <span className="text-slate-600">Progress</span>
          <div
            className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Intake progress"
          >
            <div
              className="h-full rounded-full bg-linear-to-r from-orange-600 to-orange-400 transition-[width] duration-700"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-sm whitespace-nowrap text-slate-500">{percent}% complete</span>
        </div>
      )}

      <div className="grid min-h-[30rem] grid-cols-1 overflow-hidden rounded-2xl border border-slate-200/70 bg-linear-to-br from-white/90 to-orange-50/40 md:grid-cols-2">
        {/* Left: microphone */}
        <div className="flex flex-col items-center justify-center gap-8 px-4 py-10 md:border-r md:border-slate-200/80">
          <div className="flex items-center gap-3 sm:gap-5">
            <Waveform side="left" barsRef={barsRef} />
            <div className="relative grid place-items-center">
              <span
                aria-hidden
                className={`absolute size-64 rounded-full bg-orange-200/30 transition-opacity ${live ? "animate-pulse opacity-100" : "opacity-40"}`}
              />
              <span aria-hidden className="absolute size-52 rounded-full border border-orange-200/70 bg-orange-100/40" />
              <button
                type="button"
                onClick={onMicClick}
                disabled={!micEnabled}
                aria-label={idle ? "Start intake" : paused ? "Continue conversation" : "Stop listening"}
                aria-pressed={live || paused ? live : undefined}
                className={`relative grid size-40 place-items-center rounded-full border-4 border-white/70 text-white shadow-[0_0_50px_var(--intake-glow,rgba(234,88,12,0.45))] transition hover:brightness-105 focus-visible:ring-4 focus-visible:ring-orange-300 focus-visible:outline-none disabled:cursor-default sm:size-44 ${
                  live || busy ? "bg-linear-to-b from-orange-500 to-orange-600" : "bg-linear-to-b from-orange-300 to-orange-400"
                } ${phase === "consent" && !consented ? "opacity-60" : ""}`}
              >
                <Mic className={`size-16 ${phase === "starting" ? "animate-pulse" : ""}`} strokeWidth={1.75} aria-hidden />
              </button>
            </div>
            <Waveform side="right" barsRef={barsRef} />
          </div>
          <div className="flex flex-col items-center gap-1">
            <p className="text-2xl font-medium" aria-live="polite">
              {label}
            </p>
            {hint && <p className="text-sm text-slate-400">{hint}</p>}
          </div>
          {idle && (
            <ConsentNotice
              consented={consented}
              onConsentChange={setConsented}
              disabled={phase === "starting"}
              assistantName={assistantName}
              description={description}
              reviewerName={reviewerName}
            />
          )}
          {phase === "complete" && (
            <button
              type="button"
              onClick={newIntake}
              className="flex items-center gap-2 rounded-full border border-orange-200 bg-white px-4 py-2 text-sm font-medium text-orange-700 hover:bg-orange-50"
            >
              <RotateCcw className="size-4" aria-hidden /> Start a new intake
            </button>
          )}
        </div>

        {/* Right: conversation */}
        <div className="flex min-h-0 flex-col px-4 py-5 sm:px-6">
          {resumeUrl && phase !== "complete" && <div className="mb-4 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm"><p className="font-medium">Your private resume link</p><p className="mb-2 text-xs">Expires 7 days after issue unless the firm replaces or revokes it. Keep it private.</p><a href={resumeUrl} className="mr-3 text-orange-800 underline">Open saved intake</a><button type="button" className="font-semibold text-orange-800" onClick={async () => { try { await navigator.clipboard.writeText(new URL(resumeUrl, window.location.origin).href); setNotice("Private intake link copied."); } catch { setNotice("Use Open saved intake and copy its address."); } }}>Copy link</button></div>}
          <div className="flex max-h-[26rem] min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
            {messages.length === 0 && (
              <p className="m-auto max-w-xs text-center text-slate-400">
                Your conversation with {assistantName} will appear here.
              </p>
            )}
            {messages.map((m) => (
              <MessageCard key={m.id} message={m} clientInitials={initials(clientName)} assistantName={assistantName} />
            ))}
            <div ref={listEndRef} />
          </div>

          {(error || notice) && (
            <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${error ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`} role="alert">
              {error ?? notice}
            </p>
          )}

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <div className="flex items-center gap-3 text-slate-500">
              <span className="relative grid size-6 place-items-center">
                <span className={`absolute size-6 rounded-full ${busy || live ? "animate-ping bg-green-400/40" : "bg-green-400/20"}`} />
                <span className={`relative size-3 rounded-full ${paused ? "bg-slate-400" : "bg-green-500"}`} />
              </span>
              <span aria-live="polite">
                {phase === "listening" && hearing
                  ? "Hearing you…"
                  : phase === "complete" && endedEarly
                    ? "Thank you. An attorney will review what you shared"
                    : PHASE_DETAIL[phase]}
              </span>
            </div>
            {conversationId && phase !== "complete" && (
              <button type="button" onClick={newIntake} className="text-sm text-slate-400 hover:text-orange-600">
                Start over
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Waveform({ side, barsRef }: { side: "left" | "right"; barsRef: React.RefObject<(HTMLSpanElement | null)[]> }) {
  const offset = side === "left" ? 0 : BAR_BASE.length;
  // Left side runs outer→inner; right side mirrors it so the tallest bars hug the button.
  const order = side === "left" ? BAR_BASE.map((_, i) => i) : BAR_BASE.map((_, i) => BAR_BASE.length - 1 - i);
  return (
    <div aria-hidden className="hidden h-16 items-center gap-1.5 sm:flex">
      {order.map((i) => (
        <span
          key={i}
          ref={(el) => {
            barsRef.current[offset + i] = el;
          }}
          className="w-1 rounded-full bg-linear-to-b from-orange-400 to-rose-400 transition-[height] duration-75"
          style={{ height: `${BAR_BASE[i] * 0.45}px` }}
        />
      ))}
    </div>
  );
}

function MessageCard({ message, clientInitials, assistantName }: { message: VoiceMessageDto; clientInitials: string; assistantName: string }) {
  const scribe = message.role === "scribe";
  return (
    <article
      className={`flex gap-4 rounded-2xl border p-4 shadow-sm sm:p-5 ${
        scribe ? "border-orange-100 bg-white/90" : "border-slate-200 bg-slate-50/80"
      }`}
    >
      <span
        className={`grid size-12 shrink-0 place-items-center rounded-full text-lg font-semibold ${
          scribe ? "bg-orange-100 text-slate-900" : "bg-slate-100 text-slate-800"
        }`}
        aria-hidden
      >
        {scribe ? assistantName[0] : clientInitials}
      </span>
      <div className="min-w-0">
        <p className="font-semibold">{scribe ? assistantName : "Client"}</p>
        <p className="mt-1 leading-relaxed whitespace-pre-wrap text-slate-700">{message.text}</p>
        <p className="mt-2 text-sm text-slate-400">{formatTime(message.createdAt)}</p>
      </div>
    </article>
  );
}

function ConsentNotice({
  consented,
  onConsentChange,
  disabled,
  assistantName,
  description,
  reviewerName,
}: {
  consented: boolean;
  onConsentChange: (v: boolean) => void;
  disabled: boolean;
  assistantName: string;
  description: string;
  reviewerName: string;
}) {
  return (
    <div className="flex max-w-sm flex-col items-center gap-4 text-center">
      <p className="text-slate-500">{description}</p>
      <label className="flex items-start gap-3 text-left text-sm text-slate-600">
        <input
          type="checkbox"
          checked={consented}
          disabled={disabled}
          onChange={(e) => onConsentChange(e.target.checked)}
          className="mt-0.5 size-4 accent-orange-600"
        />
        <span>
          I agree that this conversation will be recorded, transcribed and processed by AI services so {reviewerName} can
          review my case. {assistantName} does not give legal advice.
        </span>
      </label>
    </div>
  );
}
