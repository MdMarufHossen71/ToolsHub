/**
 * Web Audio plumbing for the sound channel: microphone capture and speaker
 * playback. No network, no MediaRecorder - raw PCM in and out.
 *
 * The receiver disables echo cancellation, noise suppression and automatic
 * gain: all three are speech optimisations that mangle FSK tones.
 */

import { resampleLinear } from "../transfer/shared";

const PREFERRED_RATE = 48000;

export type MicSupport = { ok: true } | { ok: false; reason: "unsupported" | "insecure-context" };

export function describeMicrophoneSupport(input: {
  hasMediaDevices: boolean;
  hasGetUserMedia: boolean;
  isSecureContext: boolean;
}): MicSupport {
  if (!input.hasMediaDevices || !input.hasGetUserMedia) return { ok: false, reason: "unsupported" };
  if (!input.isSecureContext) return { ok: false, reason: "insecure-context" };
  return { ok: true };
}

export function probeBrowserMicrophoneSupport(): MicSupport {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  return describeMicrophoneSupport({
    hasMediaDevices: Boolean(nav?.mediaDevices),
    hasGetUserMedia: typeof nav?.mediaDevices?.getUserMedia === "function",
    isSecureContext: typeof window === "undefined" ? true : window.isSecureContext,
  });
}

export type MicError = "denied" | "no-device" | "unsupported" | "insecure-context" | "failed";

export function mapGetUserMediaError(error: unknown): MicError {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "denied";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") {
    return "no-device";
  }
  if (name === "NotReadableError" || name === "TrackStartError") return "failed";
  return "failed";
}

type AudioContextCtor = new (options?: AudioContextOptions) => AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  const scope = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

export function isAudioSupported(): boolean {
  return typeof window !== "undefined" && audioContextCtor() !== null;
}

/**
 * Ask for 48 kHz (ggwave's native rate). Browsers that refuse the constraint
 * fall back to the device rate; callers resample with `resampleLinear`.
 */
export function createAudioContext(): AudioContext {
  const Ctor = audioContextCtor();
  if (!Ctor) throw new Error("unsupported");
  try {
    return new Ctor({ sampleRate: PREFERRED_RATE, latencyHint: "interactive" });
  } catch {
    return new Ctor();
  }
}

export type MicrophoneSession = {
  stream: MediaStream;
  sampleRate: number;
  stop: () => void;
};

/**
 * Open the microphone and deliver fixed 4096-sample blocks. The processor is
 * wired to a muted gain node because some browsers only run ScriptProcessor
 * callbacks when the node reaches the destination.
 */
export async function openMicrophone(
  onChunk: (chunk: Float32Array, sampleRate: number) => void,
): Promise<MicrophoneSession> {
  const support = probeBrowserMicrophoneSupport();
  if (!support.ok) throw Object.assign(new Error(support.reason), { name: "NotSupportedError" });
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
      sampleRate: { ideal: PREFERRED_RATE },
    },
  });

  const ctx = createAudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const sink = ctx.createGain();
  sink.gain.value = 0;

  processor.onaudioprocess = (event) => {
    const data = event.inputBuffer.getChannelData(0);
    try {
      onChunk(new Float32Array(data), ctx.sampleRate);
    } catch {
      // A UI error must not tear down the audio graph mid-transfer.
    }
  };

  source.connect(processor);
  processor.connect(sink);
  sink.connect(ctx.destination);
  await ctx.resume().catch(() => undefined);

  let stopped = false;
  return {
    stream,
    sampleRate: ctx.sampleRate,
    stop: () => {
      if (stopped) return;
      stopped = true;
      processor.onaudioprocess = null;
      try {
        source.disconnect();
        processor.disconnect();
        sink.disconnect();
      } catch {
        // Already disconnected.
      }
      for (const track of stream.getTracks()) track.stop();
      void ctx.close().catch(() => undefined);
    },
  };
}

export type PlaybackHooks = {
  encode: (payload: Uint8Array) => Promise<Float32Array>;
  onFrame: (index: number) => void;
  onError?: ((index: number) => void) | undefined;
};

/**
 * Sequential frame player. Encodes one frame at a time (a full file's audio
 * would be gigabytes of Float32), keeps a silence gap between frames so the
 * receiver can split them, and honours pause/cancel at frame boundaries.
 */
export class SoundPlayer {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private current: AudioBufferSourceNode | null = null;
  private gapTimer: number | null = null;
  private gapResolve: (() => void) | null = null;
  private pauseWaiters: Array<() => void> = [];
  private paused = false;
  private cancelled = true;
  private interrupted = false;
  private volume = 1;
  /**
   * Increments on every play/stop. An old loop that wakes from a timer or an
   * ended buffer must not continue into a newer run (e.g. replay pressed right
   * after stop), so every await is followed by a run check.
   */
  private run = 0;

  constructor(private readonly gapMs: () => number) {}

  setVolume(value: number): void {
    this.volume = Math.min(1, Math.max(0, value));
    if (this.ctx && this.gain) {
      this.gain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    }
  }

  pause(): void {
    this.paused = true;
    this.interrupted = true;
    this.stopSource();
    this.releaseGap();
  }

  resume(): void {
    this.paused = false;
    const waiters = this.pauseWaiters;
    this.pauseWaiters = [];
    for (const wake of waiters) wake();
  }

  stop(): void {
    this.cancelled = true;
    this.run += 1;
    this.paused = false;
    this.interrupted = true;
    this.stopSource();
    this.releaseGap();
    const waiters = this.pauseWaiters;
    this.pauseWaiters = [];
    for (const wake of waiters) wake();
  }

  async dispose(): Promise<void> {
    this.stop();
    const ctx = this.ctx;
    this.ctx = null;
    this.gain = null;
    if (ctx) await ctx.close().catch(() => undefined);
  }

  /** Resolves "done" when the last frame finishes, "cancelled" on stop(). */
  async play(frames: readonly Uint8Array[], from: number, hooks: PlaybackHooks): Promise<"done" | "cancelled"> {
    if (frames.length === 0) return "done";
    const run = ++this.run;
    this.cancelled = false;
    this.paused = false;
    this.interrupted = false;
    // Wake any loop left over from the previous run; it will see the new run id
    // and return instead of racing this one for the audio output.
    const waiters = this.pauseWaiters;
    this.pauseWaiters = [];
    for (const wake of waiters) wake();
    this.releaseGap();

    const ctx = this.ensureContext();
    await ctx.resume().catch(() => undefined);
    if (run !== this.run) return "cancelled";

    let index = Math.min(Math.max(0, Math.floor(from)), frames.length - 1);
    while (index < frames.length) {
      if (!(await this.waitWhilePaused(run))) return "cancelled";
      const payload = frames[index];
      if (!payload) break;
      hooks.onFrame(index);

      let wave: Float32Array;
      try {
        wave = await hooks.encode(payload);
      } catch {
        if (run !== this.run) return "cancelled";
        hooks.onError?.(index);
        index += 1;
        continue;
      }

      if (!(await this.waitWhilePaused(run))) return "cancelled";
      const outcome = await this.playBuffer(wave);
      if (run !== this.run || this.cancelled) return "cancelled";
      if (outcome === "failed") {
        hooks.onError?.(index);
        index += 1;
        continue;
      }
      if (outcome === "interrupted") {
        // Paused inside a frame; replay it from the start so the receiver never
        // sees half a transmission.
        continue;
      }

      index += 1;
      if (index < frames.length) {
        await this.waitGap();
        if (run !== this.run || this.cancelled) return "cancelled";
      }
    }
    return "done";
  }

  private ensureContext(): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = createAudioContext();
    const gain = ctx.createGain();
    gain.gain.value = this.volume;
    gain.connect(ctx.destination);
    this.ctx = ctx;
    this.gain = gain;
    return ctx;
  }

  private playBuffer(wave: Float32Array): Promise<"ended" | "interrupted" | "failed"> {
    const ctx = this.ensureContext();
    const gain = this.gain;
    if (!gain) return Promise.resolve("failed");

    const samples = resampleLinear(wave, PREFERRED_RATE, ctx.sampleRate);
    return new Promise<"ended" | "interrupted" | "failed">((resolve) => {
      const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
      buffer.copyToChannel(samples, 0);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      this.current = source;
      this.interrupted = false;
      source.onended = () => {
        if (this.current === source) this.current = null;
        resolve(this.interrupted ? "interrupted" : "ended");
      };
      try {
        source.start();
      } catch {
        this.current = null;
        resolve("failed");
      }
    });
  }

  private stopSource(): void {
    const source = this.current;
    this.current = null;
    if (!source) return;
    try {
      source.stop();
    } catch {
      // Already ended.
    }
    try {
      source.disconnect();
    } catch {
      // Already disconnected.
    }
  }

  private releaseGap(): void {
    if (this.gapTimer !== null) {
      window.clearTimeout(this.gapTimer);
      this.gapTimer = null;
    }
    const resolve = this.gapResolve;
    this.gapResolve = null;
    resolve?.();
  }

  private waitGap(): Promise<void> {
    this.releaseGap();
    return new Promise<void>((resolve) => {
      this.gapResolve = resolve;
      this.gapTimer = window.setTimeout(() => {
        this.gapTimer = null;
        this.gapResolve = null;
        resolve();
      }, Math.max(0, this.gapMs()));
    });
  }

  private async waitWhilePaused(run: number): Promise<boolean> {
    if (this.cancelled || run !== this.run) return false;
    while (this.paused && !this.cancelled && run === this.run) {
      await new Promise<void>((resolve) => this.pauseWaiters.push(resolve));
    }
    return !this.cancelled && run === this.run;
  }
}

/** Feed incoming device-rate blocks to the segmenter at ggwave's rate. */
export function toGgwaveRate(samples: Float32Array, deviceRate: number): Float32Array {
  return resampleLinear(samples, deviceRate, PREFERRED_RATE);
}
