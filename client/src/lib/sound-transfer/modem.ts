/**
 * Thin wrapper around ggwave: payload -> 48 kHz mono waveform, and back.
 *
 * ggwave is loaded lazily so its ~154 KB WASM module never reaches the initial
 * bundle, and through `virtual:ggwave-csp` because the published Emscripten
 * build uses `new Function`, which ToolsHub's CSP forbids.
 */
import type { GgwaveModule, GgwaveParameters } from "virtual:ggwave-csp";
import type { SftProtocol } from "./types";

/** ggwave's native rate. The web audio layer resamples to/from the device rate. */
export const GGWAVE_SAMPLE_RATE = 48000;

const PROTOCOL_NAMES: Record<SftProtocol, string> = {
  normal: "GGWAVE_PROTOCOL_AUDIBLE_NORMAL",
  fast: "GGWAVE_PROTOCOL_AUDIBLE_FAST",
  fastest: "GGWAVE_PROTOCOL_AUDIBLE_FASTEST",
};

let modulePromise: Promise<GgwaveModule> | null = null;

export function loadGgwave(): Promise<GgwaveModule> {
  modulePromise ??= import("virtual:ggwave-csp")
    .then((mod) => mod.default({ print: () => undefined, printErr: () => undefined }))
    .then((ggwave) => {
      // The binding prints every encode/decode to stdout by default.
      ggwave.disableLog();
      return ggwave;
    })
    .catch((error: unknown) => {
      // A transient chunk-load failure should not poison every later attempt.
      modulePromise = null;
      throw error;
    });
  return modulePromise;
}

/**
 * Emscripten's `getDefaultParameters` already returns 48 kHz / F32 / 140-byte
 * payloads, but the fields are set explicitly so a library update cannot
 * silently change the wire format underneath us.
 */
function parametersFor(ggwave: GgwaveModule): GgwaveParameters {
  const params = ggwave.getDefaultParameters();
  params.sampleRate = GGWAVE_SAMPLE_RATE;
  params.sampleRateInp = GGWAVE_SAMPLE_RATE;
  params.sampleRateOut = GGWAVE_SAMPLE_RATE;
  params.sampleFormatInp = ggwave.SampleFormat.GGWAVE_SAMPLE_FORMAT_F32 ?? params.sampleFormatInp;
  params.sampleFormatOut = ggwave.SampleFormat.GGWAVE_SAMPLE_FORMAT_F32 ?? params.sampleFormatOut;
  return params;
}

function protocolFor(ggwave: GgwaveModule, protocol: SftProtocol) {
  const id = ggwave.ProtocolId[PROTOCOL_NAMES[protocol]];
  if (!id) throw new Error(`unknown-protocol:${protocol}`);
  return id;
}

function bytesOf(view: Int8Array): Uint8Array {
  // Copy immediately: the view points into WASM memory and the next call (or
  // `free`) can detach or overwrite it.
  return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
}

/** Encode one framed payload into 48 kHz mono float samples. */
export async function encodePayload(payload: Uint8Array, protocol: SftProtocol): Promise<Float32Array> {
  if (payload.length === 0 || payload.length > 140) throw new Error("bad-payload-size");
  const ggwave = await loadGgwave();
  const params = parametersFor(ggwave);
  const instance = ggwave.init(params);
  // Instance 0 is valid in this embind build; only a missing handle is failure.
  if (instance === undefined || instance === null) throw new Error("ggwave-init-failed");
  try {
    const raw = bytesOf(ggwave.encode(instance, payload, protocolFor(ggwave, protocol), 80));
    if (raw.byteLength === 0 || raw.byteLength % 4 !== 0) throw new Error("ggwave-empty-waveform");
    return new Float32Array(raw.buffer, 0, raw.byteLength / 4).slice();
  } finally {
    ggwave.free(instance);
  }
}

/**
 * Decode a burst of 48 kHz float samples. A fresh instance is used per call:
 * ggwave's decoder keeps state between calls and reusing one was observed to
 * suppress later packets. Returns null for silence or unreadable audio.
 */
export async function decodePayload(samples: Float32Array): Promise<Uint8Array | null> {
  if (samples.length === 0) return null;
  const ggwave = await loadGgwave();
  const params = parametersFor(ggwave);
  const instance = ggwave.init(params);
  if (instance === undefined || instance === null) return null;
  try {
    const input = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
    const payload = bytesOf(ggwave.decode(instance, input));
    return payload.length > 0 ? payload : null;
  } catch {
    // A single unreadable burst is expected audio, not an application error.
    return null;
  } finally {
    ggwave.free(instance);
  }
}

