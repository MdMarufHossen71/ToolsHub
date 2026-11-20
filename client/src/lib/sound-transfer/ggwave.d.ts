/**
 * Types for the CSP-safe ggwave module emitted by `scripts/ggwave-csp-plugin.ts`.
 * The upstream package ships no typings; these mirror
 * `node_modules/ggwave/emscripten.cpp`.
 */
declare module "virtual:ggwave-csp" {
  /** Embind enums arrive as objects that must be passed as-is, never as numbers. */
  export type GgwaveEnum = { readonly value: number; readonly name: string };

  export type GgwaveParameters = {
    payloadLength: number;
    sampleRateInp: number;
    sampleRateOut: number;
    sampleRate: number;
    samplesPerFrame: number;
    soundMarkerThreshold: number;
    sampleFormatInp: GgwaveEnum;
    sampleFormatOut: GgwaveEnum;
    operatingMode: number;
  };

  export type GgwaveModule = {
    getDefaultParameters(): GgwaveParameters;
    init(params: GgwaveParameters): number;
    free(instance: number): void;
    /** Returns a view into WASM memory; copy before the next call. */
    encode(instance: number, payload: Uint8Array, protocol: GgwaveEnum, volume: number): Int8Array;
    /** Returns a view into WASM memory; empty when nothing decoded. */
    decode(instance: number, samples: Uint8Array): Int8Array;
    disableLog(): void;
    enableLog(): void;
    ProtocolId: Record<string, GgwaveEnum>;
    SampleFormat: Record<string, GgwaveEnum>;
  };

  export type GgwaveFactory = (options?: {
    print?: (text: string) => void;
    printErr?: (text: string) => void;
  }) => Promise<GgwaveModule>;

  const factory: GgwaveFactory;
  export default factory;
}
