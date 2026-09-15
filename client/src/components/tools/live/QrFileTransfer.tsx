/**
 * Pure optical QR file transfer: screen -> camera, no network.
 * Send renders an animated QR sequence; Receive decodes it with ZXing
 * (BarcodeDetector fast-path where available) and reassembles the file.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Download, Pause, Play, RotateCcw, Send, Square, StepBack, StepForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/contexts/AppSettingsContext";
import { mapGetUserMediaError, probeBrowserCameraSupport, stopStream } from "@/lib/qr-transfer/camera";
import { sanitizeFilename } from "@/lib/qr-transfer/filename";
import { QftReceiver } from "@/lib/qr-transfer/receiver";
import { prepareTransfer, senderSequence, type PreparedTransfer } from "@/lib/qr-transfer/sender";
import { QFT_MAX_FILE_BYTES } from "@/lib/qr-transfer/types";
import { QrCanvas } from "./QrCanvas";

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

type View = "home" | "send" | "receive";

export function QrFileTransfer() {
  const { t } = useTranslation();
  const [view, setView] = useState<View>("home");

  // Reset everything when switching modes: no cross-session contamination.
  const switchView = useCallback((next: View) => {
    setView(next);
  }, []);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="bench-actions" role="tablist" aria-label={t("qr.title")}>
        <Button size="sm" variant={view === "send" ? "default" : "outline"} onClick={() => switchView("send")}>
          <Send className="mr-2 size-3.5" aria-hidden="true" />
          {t("qr.send")}
        </Button>
        <Button size="sm" variant={view === "receive" ? "default" : "outline"} onClick={() => switchView("receive")}>
          <Camera className="mr-2 size-3.5" aria-hidden="true" />
          {t("qr.receive")}
        </Button>
      </div>

      {view === "home" && <QrIntro />}
      {view === "send" && <SenderPane key="send" onBack={() => switchView("home")} />}
      {view === "receive" && <ReceiverPane key="receive" onBack={() => switchView("home")} />}
    </div>
  );
}

function QrIntro() {
  const { t } = useTranslation();
  return (
    <section className="bench-panel" style={{ display: "grid", gap: 8 }}>
      <p style={{ margin: 0 }}>{t("qr.intro")}</p>
      <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>{t("qr.privacy")}</p>
      <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>{t("qr.visibilityWarning")}</p>
      <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>{t("qr.brightnessTip")}</p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Sender                                                              */
/* ------------------------------------------------------------------ */

function SenderPane({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const [fileName, setFileName] = useState("");
  const [fileMime, setFileMime] = useState("");
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [prepared, setPrepared] = useState<PreparedTransfer | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<number | null>(null);
  const qrBoxRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const sequence = useMemo(() => (prepared ? senderSequence(prepared) : []), [prepared]);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => stopTimer, [stopTimer]);

  useEffect(() => {
    stopTimer();
    if (playing && sequence.length > 0) {
      const ms = prepared?.frameMs ?? 800;
      timerRef.current = window.setInterval(() => {
        setFrameIndex((i) => (i + 1) % sequence.length);
      }, ms);
    }
    return stopTimer;
  }, [playing, sequence.length, prepared, stopTimer]);

  const pickFile = useCallback(
    async (file: File | undefined) => {
      setError(null);
      setPrepared(null);
      setPlaying(false);
      setFrameIndex(0);
      if (!file) return;
      if (file.size > QFT_MAX_FILE_BYTES) {
        setError(t("qr.tooLarge"));
        return;
      }
      try {
        const buffer = await file.arrayBuffer();
        setFileBytes(new Uint8Array(buffer));
        setFileName(file.name || "download.bin");
        setFileMime(file.type || "application/octet-stream");
      } catch {
        setError(t("common.error"));
      }
    },
    [t],
  );

  const build = useCallback(async () => {
    if (!fileBytes) {
      setError(t("qr.noFile"));
      return;
    }
    setPreparing(true);
    setError(null);
    try {
      const out = await prepareTransfer({
        name: sanitizeFilename(fileName),
        mime: fileMime,
        bytes: fileBytes,
        passphrase: passphrase.trim() ? passphrase : undefined,
      });
      setPrepared(out);
      setFrameIndex(0);
      setPlaying(true);
    } catch (e) {
      setError(e instanceof Error && e.message === "too-large" ? t("qr.tooLarge") : t("common.error"));
    } finally {
      setPreparing(false);
    }
  }, [fileBytes, fileName, fileMime, passphrase, t]);

  const cancel = useCallback(() => {
    stopTimer();
    setPrepared(null);
    setPlaying(false);
    setFrameIndex(0);
    setFileBytes(null);
    setFileName("");
    setPassphrase("");
    setError(null);
  }, [stopTimer]);

  const fullscreen = useCallback(() => {
    const el = qrBoxRef.current;
    if (el?.requestFullscreen) void el.requestFullscreen().catch(() => undefined);
  }, []);

  const total = sequence.length;
  const dataFrames = prepared?.meta.n ?? 0;

  return (
    <section className="bench-panel" style={{ display: "grid", gap: 12 }} aria-label={t("qr.send")}>
      <div className="bench-actions">
        <Button size="sm" variant="outline" onClick={onBack}>
          {t("common.back")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
          {t("qr.chooseFile")}
        </Button>
        <input
          ref={fileRef}
          type="file"
          className="sr-only"
          aria-label={t("qr.chooseFile")}
          onChange={(e) => void pickFile(e.target.files?.[0])}
        />
      </div>

      {fileBytes && (
        <p style={{ margin: 0, fontSize: 13 }} aria-live="polite">
          {t("qr.selected", { name: fileName, size: formatSize(fileBytes.length) })}
        </p>
      )}

      <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
        {t("qr.passphraseOptional")}
        <Input
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder={t("qr.passphraseHint")}
          autoComplete="off"
        />
      </label>

      <div className="bench-actions">
        <Button size="sm" onClick={() => void build()} disabled={!fileBytes || preparing}>
          <Play className="mr-2 size-3.5" aria-hidden="true" />
          {preparing ? t("common.loading") : t("qr.prepare")}
        </Button>
        {prepared && (
          <Button size="sm" variant="outline" onClick={cancel}>
            <Square className="mr-2 size-3.5" aria-hidden="true" />
            {t("qr.cancel")}
          </Button>
        )}
      </div>

      {error && (
        <p className="game-turn" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      )}

      {prepared && total > 0 && (
        <div style={{ display: "grid", gap: 8, justifyItems: "center" }}>
          <p style={{ margin: 0, fontSize: 13 }} aria-live="polite">
            {t("qr.sending", { name: prepared.meta.name, size: formatSize(fileBytes?.length ?? 0) })}
          </p>
          <p style={{ margin: 0, fontSize: 13 }}>
            {t("qr.frame", { current: frameIndex + 1, total })} ·{" "}
            {t("qr.chunks", { count: dataFrames })}
            {prepared.meta.enc === 1 ? ` · ${t("qr.encrypted")}` : ""}
          </p>
          <div ref={qrBoxRef} style={{ background: "#fff", padding: 16, borderRadius: 16, display: "grid", justifyItems: "center" }}>
            <QrCanvas text={sequence[frameIndex] ?? ""} size={320} />
          </div>
          <div className="bench-actions" role="group" aria-label={t("qr.frame", { current: frameIndex + 1, total })}>
            <Button size="sm" variant="outline" onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>
              {playing ? <Pause className="mr-2 size-3.5" aria-hidden="true" /> : <Play className="mr-2 size-3.5" aria-hidden="true" />}
              {playing ? t("qr.pause") : t("qr.resume")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setFrameIndex((i) => (i - 1 + total) % total)} aria-label={t("qr.prev")}>
              <StepBack className="size-3.5" aria-hidden="true" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => setFrameIndex((i) => (i + 1) % total)} aria-label={t("qr.next")}>
              <StepForward className="size-3.5" aria-hidden="true" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => setFrameIndex(0)}>
              <RotateCcw className="mr-2 size-3.5" aria-hidden="true" />
              {t("qr.replay")}
            </Button>
            <Button size="sm" variant="outline" onClick={fullscreen}>
              {t("qr.fullscreen")}
            </Button>
          </div>
          <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>{t("qr.brightnessTip")}</p>
          <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>{t("qr.keepVisible")}</p>
        </div>
      )}

      <QrHow />
    </section>
  );
}

function QrHow() {
  const { t } = useTranslation();
  return (
    <details style={{ fontSize: 13 }}>
      <summary>{t("qr.howTitle")}</summary>
      <ol style={{ margin: "8px 0 0", paddingLeft: 20, display: "grid", gap: 4 }}>
        <li>{t("qr.how1")}</li>
        <li>{t("qr.how2")}</li>
        <li>{t("qr.how3")}</li>
        <li>{t("qr.how4")}</li>
        <li>{t("qr.how5")}</li>
        <li>{t("qr.how6")}</li>
      </ol>
      <p style={{ opacity: 0.85 }}>{t("qr.limitations")}</p>
    </details>
  );
}

/* ------------------------------------------------------------------ */
/* Receiver                                                             */
/* ------------------------------------------------------------------ */

function ReceiverPane({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const receiverRef = useRef<QftReceiver | null>(null);
  if (!receiverRef.current) receiverRef.current = new QftReceiver();
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const readerRef = useRef<{ reset: () => void } | null>(null);
  const urlRef = useRef<string | null>(null);
  const lastAnnounceRef = useRef(0);

  const [scanning, setScanning] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [announce, setAnnounce] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [done, setDone] = useState<{ name: string; mime: string; size: number; url: string } | null>(null);
  const [decodingImage, setDecodingImage] = useState(false);
  const imageRef = useRef<HTMLInputElement>(null);

  const receiver = receiverRef.current;
  const meta = receiver.meta;
  const received = receiver.received;
  const total = receiver.total;
  const missing = meta ? receiver.missing() : [];
  void tick;

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  const throttledAnnounce = useCallback(
    (message: string) => {
      const now = Date.now();
      if (now - lastAnnounceRef.current < 2000) return;
      lastAnnounceRef.current = now;
      setAnnounce(message);
    },
    [],
  );

  const ingestText = useCallback(
    (text: string) => {
      const result = receiver.ingest(text);
      if (result.kind === "stored" || result.kind === "meta" || result.kind === "duplicate") {
        refresh();
        if (receiver.meta) {
          throttledAnnounce(t("qr.received", { received: receiver.received, total: receiver.total }));
        }
      } else if (result.kind === "invalid") {
        refresh(); // already counted inside ingest
      } else {
        refresh();
      }
    },
    [receiver, refresh, throttledAnnounce, t],
  );

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    try {
      readerRef.current?.reset();
    } catch {
      // Reader may not have started; cleanup must never throw.
    }
    readerRef.current = null;
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  }, []);

  useEffect(
    () => () => {
      stopCamera();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [stopCamera],
  );

  const startBarcodeLoop = useCallback(() => {
    const Detector = (window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    if (!Detector) return false;
    try {
      const detector = new Detector({ formats: ["qr_code"] });
      const loop = async () => {
        const video = videoRef.current;
        const canvas = scanCanvasRef.current;
        if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) {
          rafRef.current = requestAnimationFrame(() => void loop());
          return;
        }
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          try {
            const codes = await detector.detect(canvas);
            for (const code of codes) {
              if (code.rawValue) ingestText(code.rawValue);
            }
          } catch {
            // A single frame failing must not stop the loop.
          }
        }
        rafRef.current = requestAnimationFrame(() => void loop());
      };
      rafRef.current = requestAnimationFrame(() => void loop());
      return true;
    } catch {
      return false;
    }
  }, [ingestText]);

  const startZxing = useCallback(async () => {
    const { BrowserQRCodeReader } = (await import("@zxing/browser")) as unknown as {
      BrowserQRCodeReader: new () => {
        decodeFromVideoDevice: (id: string | undefined, el: HTMLVideoElement, cb: (r: { getText: () => string } | undefined, e: unknown) => void) => Promise<void>;
        reset: () => void;
      };
    };
    const reader = new BrowserQRCodeReader();
    readerRef.current = reader;
    const video = videoRef.current;
    if (!video) return;
    await reader.decodeFromVideoDevice(undefined, video, (result) => {
      if (result) {
        try {
          ingestText(result.getText());
        } catch {
          // Corrupt decode results are ignored; the loop continues.
        }
      }
    });
  }, [ingestText]);

  const startCamera = useCallback(async () => {
    setCamError(null);
    const support = probeBrowserCameraSupport();
    if (!support.ok) {
      setCamError(t(support.reason === "insecure-context" ? "qr.cameraInsecure" : "qr.cameraUnsupported"));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
      setScanning(true);
      if (!startBarcodeLoop()) {
        await startZxing().catch(() => {
          setCamError(t("qr.cameraFailed"));
          stopCamera();
        });
      }
    } catch (e) {
      const kind = mapGetUserMediaError(e);
      setCamError(t(kind === "denied" ? "qr.cameraDenied" : kind === "no-camera" ? "qr.cameraNoDevice" : "qr.cameraFailed"));
    }
  }, [startBarcodeLoop, startZxing, stopCamera, t]);

  const decodeImageFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setDecodingImage(true);
      try {
        const url = URL.createObjectURL(file);
        try {
          const Detector = (window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => { detect: (src: HTMLImageElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
          const img = new Image();
          img.src = url;
          await img.decode();
          if (Detector) {
            const detector = new Detector({ formats: ["qr_code"] });
            const codes = await detector.detect(img);
            for (const code of codes) if (code.rawValue) ingestText(code.rawValue);
            if (codes.length === 0) setCamError(t("qr.invalidFrame"));
          } else {
            const { BrowserQRCodeReader } = (await import("@zxing/browser")) as unknown as {
              BrowserQRCodeReader: new () => { decodeFromImageElement: (el: HTMLImageElement) => Promise<{ getText: () => string }> };
            };
            const reader = new BrowserQRCodeReader();
            const result = await reader.decodeFromImageElement(img);
            ingestText(result.getText());
          }
        } finally {
          URL.revokeObjectURL(url);
        }
      } catch {
        setCamError(t("qr.invalidFrame"));
      } finally {
        setDecodingImage(false);
      }
    },
    [ingestText, t],
  );

  const cancelAll = useCallback(() => {
    stopCamera();
    receiver.reset();
    setPassphrase("");
    setVerifyError(null);
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setDone(null);
    refresh();
  }, [receiver, refresh, stopCamera]);

  const verify = useCallback(async () => {
    setVerifyError(null);
    try {
      const out = await receiver.reassemble(passphrase.trim() ? passphrase : undefined);
      const blob = new Blob([out.bytes as BlobPart], { type: out.mime });
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setDone({ name: out.name, mime: out.mime, size: out.bytes.length, url });
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      setVerifyError(
        t(
          message === "passphrase-required"
            ? "qr.passphraseRequired"
            : message === "wrong-passphrase" || message === "checksum-mismatch"
              ? "qr.verifyFailed"
              : message === "incomplete"
                ? "qr.incomplete"
                : "common.error",
        ),
      );
    }
  }, [passphrase, receiver, t]);

  return (
    <section className="bench-panel" style={{ display: "grid", gap: 12 }} aria-label={t("qr.receive")}>
      <div className="bench-actions">
        <Button size="sm" variant="outline" onClick={onBack}>
          {t("common.back")}
        </Button>
        {!scanning ? (
          <Button size="sm" onClick={() => void startCamera()}>
            <Camera className="mr-2 size-3.5" aria-hidden="true" />
            {t("qr.startCamera")}
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={stopCamera}>
            <Square className="mr-2 size-3.5" aria-hidden="true" />
            {t("tool.live.stop")}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => imageRef.current?.click()} disabled={decodingImage}>
          {t("qr.scanImage")}
        </Button>
        <input
          ref={imageRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label={t("qr.scanImage")}
          onChange={(e) => void decodeImageFile(e.target.files?.[0])}
        />
        {(meta || received > 0) && (
          <Button size="sm" variant="outline" onClick={cancelAll}>
            {t("qr.cancel")}
          </Button>
        )}
      </div>

      <video
        ref={videoRef}
        muted
        playsInline
        style={{ width: "100%", maxWidth: 480, borderRadius: 8, background: "var(--surface-sunken)" }}
        aria-label={t("tool.live.preview")}
      />
      <canvas ref={scanCanvasRef} className="sr-only" aria-hidden="true" />

      {camError && (
        <p className="game-turn" role="alert" style={{ margin: 0 }}>
          {camError}
        </p>
      )}
      {scanning && !meta && (
        <p style={{ margin: 0, fontSize: 13 }} role="status">
          {t("qr.scanning")}
        </p>
      )}

      {meta && (
        <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
          <p style={{ margin: 0 }} aria-live="polite">
            {t("qr.receiving", { name: meta.name })} — {t("qr.received", { received, total })}
          </p>
          <progress value={total === 0 ? 1 : received} max={total === 0 ? 1 : total} style={{ width: "100%" }} aria-label={t("qr.received", { received, total })} />
          <p style={{ margin: 0, opacity: 0.85 }}>
            {t("qr.duplicates", { count: receiver.duplicates })} · {t("qr.invalid", { count: receiver.invalid })}
            {receiver.wrongSession > 0 ? ` · ${t("qr.wrongSession", { count: receiver.wrongSession })}` : ""}
          </p>
          {missing.length > 0 && (
            <p style={{ margin: 0 }} role="status">
              {t("qr.missing", { list: missing.slice(0, 12).join(", ") + (missing.length > 12 ? "…" : "") })} — {t("qr.missingHint")}
            </p>
          )}
          {receiver.complete && (
            <p style={{ margin: 0 }} role="status">
              {t("qr.allReceived")}
            </p>
          )}
        </div>
      )}

      <span className="sr-only" aria-live="polite">
        {announce}
      </span>

      {meta?.enc === 1 && !done && (
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          {t("qr.passphrase")}
          <Input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} autoComplete="off" />
        </label>
      )}

      {meta && !done && (
        <div className="bench-actions">
          <Button size="sm" onClick={() => void verify()} disabled={!receiver.complete}>
            <Download className="mr-2 size-3.5" aria-hidden="true" />
            {t("qr.verifyDownload")}
          </Button>
        </div>
      )}

      {verifyError && (
        <p className="game-turn" role="alert" style={{ margin: 0 }}>
          {verifyError}
        </p>
      )}

      {done && (
        <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
          <p style={{ margin: 0 }} role="status">
            {t("qr.verified", { name: done.name, size: formatSize(done.size) })}
          </p>
          <div className="bench-actions">
            <a href={done.url} download={done.name} className="tool-file-remove" style={{ width: "auto", padding: "0 12px", fontSize: 12 }}>
              <Download className="size-3.5" aria-hidden="true" />
              <span>{t("common.download")}</span>
            </a>
            <Button size="sm" variant="outline" onClick={cancelAll}>
              {t("qr.another")}
            </Button>
          </div>
        </div>
      )}

      <QrHow />
    </section>
  );
}
