/**
 * Splits a continuous microphone stream into one transmission per burst of
 * sound. ggwave's JS binding decodes one complete waveform at a time, so this
 * silence gate is what turns a stream into decodable packets.
 *
 * The implementation is deliberately small and testable: RMS per block, a short
 * pre-roll so the start marker is not clipped, and a quiet gap before finalizing.
 */

export type SegmenterOptions = {
  sampleRate: number;
  chunkSamples?: number;
  /** How much louder than the measured room floor counts as sound. */
  thresholdMultiplier?: number;
  preRollSeconds?: number;
  silenceSeconds?: number;
  minSeconds?: number;
  maxSeconds?: number;
  cooldownSeconds?: number;
  calibrationSeconds?: number;
};

const DEFAULTS = {
  chunkSamples: 4096,
  thresholdMultiplier: 4,
  preRollSeconds: 0.5,
  silenceSeconds: 0.7,
  minSeconds: 0.7,
  maxSeconds: 22,
  cooldownSeconds: 0.15,
  calibrationSeconds: 1,
};

function rmsOf(chunk: Float32Array): number {
  if (chunk.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < chunk.length; i += 1) {
    const value = chunk[i] ?? 0;
    sum += value * value;
  }
  return Math.sqrt(sum / chunk.length);
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0.0005;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * fraction)))] ?? 0.0005;
}

export class SoundSegmenter {
  readonly sampleRate: number;
  private chunkSamples: number;
  private thresholdMultiplier: number;
  private preRollChunks: number;
  private silenceChunks: number;
  private minSamples: number;
  private maxSamples: number;
  private cooldownChunks: number;
  private calibrationChunks: number;

  private preRoll: Float32Array[] = [];
  private recording: Float32Array[] | null = null;
  private recordedSamples = 0;
  private quietChunks = 0;
  private loudStreak = 0;
  private cooldownLeft = 0;
  private elapsedChunks = 0;
  private calibration: number[] = [];
  private noiseFloor = 0.0005;
  private lastRms = 0;

  constructor(options: SegmenterOptions) {
    if (!Number.isFinite(options.sampleRate) || options.sampleRate <= 0) throw new Error("bad-sample-rate");
    this.sampleRate = options.sampleRate;
    this.chunkSamples = Math.max(64, Math.floor(options.chunkSamples ?? DEFAULTS.chunkSamples));
    this.thresholdMultiplier = clamp(options.thresholdMultiplier ?? DEFAULTS.thresholdMultiplier, 1.5, 12);
    const chunkSeconds = this.chunkSamples / this.sampleRate;
    this.preRollChunks = Math.max(1, Math.ceil((options.preRollSeconds ?? DEFAULTS.preRollSeconds) / chunkSeconds));
    this.silenceChunks = Math.max(1, Math.ceil((options.silenceSeconds ?? DEFAULTS.silenceSeconds) / chunkSeconds));
    this.minSamples = Math.floor((options.minSeconds ?? DEFAULTS.minSeconds) * this.sampleRate);
    this.maxSamples = Math.floor((options.maxSeconds ?? DEFAULTS.maxSeconds) * this.sampleRate);
    this.cooldownChunks = Math.max(0, Math.ceil((options.cooldownSeconds ?? DEFAULTS.cooldownSeconds) / chunkSeconds));
    this.calibrationChunks = Math.max(0, Math.ceil((options.calibrationSeconds ?? DEFAULTS.calibrationSeconds) / chunkSeconds));
  }

  get rms(): number {
    return this.lastRms;
  }

  get noise(): number {
    return this.noiseFloor;
  }

  get threshold(): number {
    return Math.max(0.0015, this.noiseFloor * this.thresholdMultiplier);
  }

  get calibrating(): boolean {
    return this.elapsedChunks < this.calibrationChunks;
  }

  get listening(): boolean {
    return this.recording !== null;
  }

  setThresholdMultiplier(value: number): void {
    this.thresholdMultiplier = clamp(value, 1.5, 12);
  }

  /** Feed one block. Usually returns no segment; returns one when a burst ends. */
  push(chunk: Float32Array): Float32Array | null {
    if (chunk.length === 0) return null;
    const rms = rmsOf(chunk);
    this.lastRms = rms;

    if (this.calibration.length < this.calibrationChunks) {
      this.elapsedChunks += 1;
      this.calibration.push(rms);
      this.noiseFloor = Math.max(0.0002, percentile(this.calibration, 0.25));
      return null;
    }

    if (this.recording) {
      this.recording.push(chunk);
      this.recordedSamples += chunk.length;
      if (rms < this.threshold) {
        this.quietChunks += 1;
      } else {
        this.quietChunks = 0;
      }
      if (this.quietChunks >= this.silenceChunks) {
        return this.finalize(true);
      }
      if (this.recordedSamples >= this.maxSamples) {
        return this.finalize(false);
      }
      return null;
    }

    if (this.cooldownLeft > 0) {
      this.cooldownLeft -= 1;
      return null;
    }

    // Slowly track the room while idle, but never let a transmission raise the
    // floor enough to hide itself.
    this.noiseFloor = 0.95 * this.noiseFloor + 0.05 * Math.min(rms, this.noiseFloor * 3 + 0.001);

    this.preRoll.push(chunk);
    if (this.preRoll.length > this.preRollChunks) this.preRoll.shift();

    if (rms > this.threshold) {
      this.loudStreak += 1;
    } else {
      this.loudStreak = 0;
    }

    if (this.loudStreak >= 2) {
      this.recording = this.preRoll.slice();
      this.recordedSamples = this.recording.reduce((sum, part) => sum + part.length, 0);
      this.preRoll = [];
      this.quietChunks = 0;
      this.loudStreak = 0;
    }
    return null;
  }

  /** Finish an in-progress burst (used when the user stops listening). */
  flush(): Float32Array | null {
    if (!this.recording) return null;
    return this.finalize(false);
  }

  reset(): void {
    this.preRoll = [];
    this.recording = null;
    this.recordedSamples = 0;
    this.quietChunks = 0;
    this.loudStreak = 0;
    this.cooldownLeft = 0;
    this.elapsedChunks = 0;
    this.calibration = [];
    this.noiseFloor = 0.0005;
    this.lastRms = 0;
  }

  private finalize(trimQuiet: boolean): Float32Array | null {
    const parts = this.recording;
    const trailingQuiet = this.quietChunks;
    this.recording = null;
    this.quietChunks = 0;
    this.loudStreak = 0;
    this.cooldownLeft = this.cooldownChunks;
    if (!parts || parts.length === 0) return null;

    // Keep a little tail so a decoder never sees the end marker cut in half.
    if (trimQuiet && trailingQuiet > 4) {
      const remove = Math.min(parts.length - 1, trailingQuiet - 4);
      for (let i = 0; i < remove; i += 1) {
        const removed = parts.pop();
        if (removed) this.recordedSamples -= removed.length;
      }
    }

    if (this.recordedSamples < this.minSamples) return null;
    const out = new Float32Array(this.recordedSamples);
    let offset = 0;
    for (const part of parts) {
      out.set(part, offset);
      offset += part.length;
    }
    this.recordedSamples = 0;
    return out;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
