/** Camera capability detection and error mapping for the QR receiver. */

export type CameraSupport =
  | { ok: true }
  | { ok: false; reason: "unsupported" | "insecure-context" | "no-devices" };

export function describeCameraSupport(input: {
  hasMediaDevices: boolean;
  hasGetUserMedia: boolean;
  isSecureContext: boolean;
}): CameraSupport {
  if (!input.hasMediaDevices || !input.hasGetUserMedia) return { ok: false, reason: "unsupported" };
  if (!input.isSecureContext) return { ok: false, reason: "insecure-context" };
  return { ok: true };
}

export function probeBrowserCameraSupport(): CameraSupport {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  return describeCameraSupport({
    hasMediaDevices: Boolean(nav?.mediaDevices),
    hasGetUserMedia: typeof nav?.mediaDevices?.getUserMedia === "function",
    isSecureContext: typeof window === "undefined" ? true : window.isSecureContext,
  });
}

export type CameraStartError = "denied" | "no-camera" | "unsupported" | "insecure-context" | "failed";

export function mapGetUserMediaError(error: unknown): CameraStartError {
  const name = typeof error === "object" && error !== null ? String((error as { name?: unknown }).name ?? "") : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "no-camera";
  if (name === "NotSupportedError") return "unsupported";
  return "failed";
}

export function stopStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // Tracks may already be ended; cleanup must never throw.
    }
  }
}
