import { describe, expect, it, vi } from "vitest";
import { describeCameraSupport, mapGetUserMediaError, stopStream } from "./camera";

describe("camera helpers", () => {
  it("detects unsupported, insecure and supported browsers", () => {
    expect(describeCameraSupport({ hasMediaDevices: false, hasGetUserMedia: false, isSecureContext: true })).toEqual({
      ok: false,
      reason: "unsupported",
    });
    expect(describeCameraSupport({ hasMediaDevices: true, hasGetUserMedia: true, isSecureContext: false })).toEqual({
      ok: false,
      reason: "insecure-context",
    });
    expect(describeCameraSupport({ hasMediaDevices: true, hasGetUserMedia: true, isSecureContext: true })).toEqual({
      ok: true,
    });
  });

  it("maps permission and device errors without throwing", () => {
    expect(mapGetUserMediaError({ name: "NotAllowedError" })).toBe("denied");
    expect(mapGetUserMediaError({ name: "NotFoundError" })).toBe("no-camera");
    expect(mapGetUserMediaError({ name: "NotSupportedError" })).toBe("unsupported");
    expect(mapGetUserMediaError(new Error("boom"))).toBe("failed");
    expect(mapGetUserMediaError(null)).toBe("failed");
  });

  it("stops every track and tolerates null", () => {
    const stopA = vi.fn();
    const stopB = vi.fn();
    stopStream({ getTracks: () => [{ stop: stopA }, { stop: stopB }] } as unknown as MediaStream);
    expect(stopA).toHaveBeenCalled();
    expect(stopB).toHaveBeenCalled();
    expect(() => stopStream(null)).not.toThrow();
  });
});
