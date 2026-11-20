/**
 * Duration estimates from measured ggwave 0.4.0 output at 48 kHz.
 *
 * The six data points per protocol fit a straight line very closely; a frame's
 * fixed sound markers dominate short payloads. These are estimates for the UI,
 * never protocol limits.
 */

import { SFT_DATA_BYTES, SFT_DEFAULT_GAP_MS, type SftProtocol } from "./types";

type Fit = { intercept: number; slope: number };

const FITS: Record<SftProtocol, Fit> = {
  fastest: { intercept: 0.79, slope: 0.029867 },
  fast: { intercept: 0.896, slope: 0.059733 },
  normal: { intercept: 1.003, slope: 0.0896 },
};

/** Seconds of sound for one ggwave transmission of `bytes` bytes. */
export function frameSeconds(bytes: number, protocol: SftProtocol): number {
  const fit = FITS[protocol];
  const safeBytes = Math.max(0, Math.min(140, Math.floor(bytes)));
  return Math.max(0.5, fit.intercept + safeBytes * fit.slope);
}

/** Seconds for a sequence, including the silence gaps the receiver needs. */
export function sequenceSeconds(frameSizes: readonly number[], protocol: SftProtocol, gapMs = SFT_DEFAULT_GAP_MS): number {
  if (frameSizes.length === 0) return 0;
  const sound = frameSizes.reduce((sum, size) => sum + frameSeconds(size, protocol), 0);
  const gaps = ((frameSizes.length - 1) * Math.max(0, gapMs)) / 1000;
  return sound + gaps;
}

/**
 * Estimate a whole transfer without materialising its frames: a multi-gigabyte
 * file would otherwise allocate millions of arrays just to show a warning.
 */
export function estimateSequenceSeconds(input: {
  byteLength: number;
  headerFrames: number;
  protocol: SftProtocol;
  gapMs?: number | undefined;
}): number {
  const bytes = Math.max(0, Math.floor(input.byteLength));
  const dataFrames = Math.ceil(bytes / SFT_DATA_BYTES);
  const fullFrames = Math.max(0, dataFrames - 1);
  const lastBytes = dataFrames > 0 ? bytes - fullFrames * SFT_DATA_BYTES : 0;
  const sound =
    fullFrames * frameSeconds(SFT_DATA_BYTES, input.protocol) +
    (dataFrames > 0 ? frameSeconds(lastBytes, input.protocol) : 0) +
    Math.max(0, input.headerFrames) * frameSeconds(60, input.protocol);
  const gaps = (Math.max(0, dataFrames + input.headerFrames - 1) * (input.gapMs ?? SFT_DEFAULT_GAP_MS)) / 1000;
  return sound + gaps;
}

/**
 * Split a duration for the UI, which owns the localized unit words. Rounds to
 * the nearest second first so 59.6 s becomes "1 min" rather than "59 s".
 */
export function durationParts(seconds: number): { hours: number; minutes: number; seconds: number } {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
  return {
    hours: Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}
