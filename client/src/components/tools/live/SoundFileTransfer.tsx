/**
 * Sound-only file transfer: speaker -> microphone, no network.
 *
 * The sender turns framed bytes into ggwave audio and plays them in sequence;
 * the receiver splits the microphone stream on silence and decodes each burst.
 * There is no return channel, so the UI is explicit about what is still
 * missing and lets the sender replay selected frames by number.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Mic, Pause, Play, RotateCcw, Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/contexts/AppSettingsContext";
import {
  isAudioSupported,
  mapGetUserMediaError,
  openMicrophone,
  probeBrowserMicrophoneSupport,
  SoundPlayer,
  toGgwaveRate,
  type MicrophoneSession,
} from "@/lib/sound-transfer/audio";
import { durationParts, estimateSequenceSeconds } from "@/lib/sound-transfer/estimate";
import { decodePayload, encodePayload } from "@/lib/sound-transfer/modem";
import { SftReceiver, type SftIngest } from "@/lib/sound-transfer/receiver";
import { SoundSegmenter } from "@/lib/sound-transfer/segmenter";
import { parseFrameList, prepareTransfer, type SftPreparedTransfer } from "@/lib/sound-transfer/sender";
import {
  SFT_DATA_BYTES,
  SFT_DEFAULT_GAP_MS,
  SFT_MAX_FILE_BYTES,
  SFT_MAX_FRAMES,
  type SftProtocol,
} from "@/lib/sound-transfer/types";

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

type View = "home" | "send" | "receive";

export function SoundFileTransfer() {
  const { t } = useTranslation();
  const [view, setView] = useState<View>("home");

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="bench-actions" aria-label={t("snd.title")}>
        <Button size="sm" variant={view === "send" ? "default" : "outline"} onClick={() => setView("send")}>
          <Send className="mr-2 size-3.5" aria-hidden="true" />
          {t("snd.send")}
        </Button>
        <Button size="sm" variant={view === "receive" ? "default" : "outline"} onClick={() => setView("receive")}>
          <Mic className="mr-2 size-3.5" aria-hidden="true" />
          {t("snd.receive")}
        </Button>
      </div>

      {view === "home" && <SoundIntro />}
      {view === "send" && <SenderPane key="send" onBack={() => setView("home")} />}
      {view === "receive" && <ReceiverPane key="receive" onBack={() => setView("home")} />}
    </div>
  );
}

function SoundIntro() {
  const { t } = useTranslation();
  return (
    <section className="bench-panel" style={{ display: "grid", gap: 8 }}>
      <p style={{ margin: 0 }}>{t("snd.intro")}</p>
      <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>{t("snd.privacy")}</p>
      <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>{t("snd.slow")}</p>
      <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>{t("snd.quiet")}</p>
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
  const [protocol, setProtocol] = useState<SftProtocol>("fastest");
  const [volume, setVolume] = useState(1);
  const [prepared, setPrepared] = useState<SftPreparedTransfer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [position, setPosition] = useState({ current: 0, total: 0 });
  const [finished, setFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replayText, setReplayText] = useState("");
  const [replayError, setReplayError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<SoundPlayer | null>(null);
  const preparedRef = useRef<SftPreparedTransfer | null>(null);
  const runRef = useRef(0);

  const formatDuration = useCallback(
    (seconds: number) => {
      const parts = durationParts(seconds);
      if (parts.hours > 0) return t("snd.durationHour", { hours: parts.hours, minutes: parts.minutes });
      if (parts.minutes > 0 && parts.seconds > 0) {
        return t("snd.durationMinSec", { minutes: parts.minutes, seconds: parts.seconds });
      }
      if (parts.minutes > 0) return t("snd.durationMin", { minutes: parts.minutes });
      return t("snd.durationSec", { seconds: parts.seconds });
    },
    [t],
  );

  const getPlayer = useCallback(() => {
    if (!playerRef.current) {
      playerRef.current = new SoundPlayer(() => preparedRef.current?.gapMs ?? SFT_DEFAULT_GAP_MS);
    }
    return playerRef.current;
  }, []);

  useEffect(
    () => () => {
      runRef.current += 1;
      void playerRef.current?.dispose();
    },
    [],
  );

  const stopPlayback = useCallback(() => {
    runRef.current += 1;
    playerRef.current?.stop();
    setPlaying(false);
    setPaused(false);
  }, []);

  const resetTransfer = useCallback(() => {
    stopPlayback();
    preparedRef.current = null;
    setPrepared(null);
    setFinished(false);
    setPosition({ current: 0, total: 0 });
    setReplayText("");
    setReplayError(null);
  }, [stopPlayback]);

  const pickFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setError(null);
      resetTransfer();
      // A rejected pick must not leave the previous file showing as selected.
      setFileBytes(null);
      setFileName("");
      setFileMime("");
      if (file.size > SFT_MAX_FILE_BYTES || Math.ceil(file.size / SFT_DATA_BYTES) > SFT_MAX_FRAMES) {
        setError(t("snd.tooLarge"));
        return;
      }
      try {
        const buffer = await file.arrayBuffer();
        setFileBytes(new Uint8Array(buffer));
        setFileName(file.name || "download.bin");
        setFileMime(file.type || "application/octet-stream");
      } catch {
        setFileBytes(null);
        setError(t("common.error"));
      }
    },
    [resetTransfer, t],
  );

  const startPlayback = useCallback(
    async (payloads: Uint8Array[]) => {
      if (payloads.length === 0) return;
      if (!isAudioSupported()) {
        setError(t("snd.audioUnsupported"));
        return;
      }
      const player = getPlayer();
      player.setVolume(volume);
      const run = runRef.current + 1;
      runRef.current = run;
      setPlaying(true);
      setPaused(false);
      setFinished(false);
      setPosition({ current: 0, total: payloads.length });

      try {
        const outcome = await player.play(payloads, 0, {
          encode: (payload) => encodePayload(payload, protocol),
          onFrame: (index) => {
            if (runRef.current === run) setPosition({ current: index + 1, total: payloads.length });
          },
          onError: () => {
            if (runRef.current === run) setError(t("common.error"));
          },
        });
        if (runRef.current !== run) return;
        // Only a full run earns "all frames played"; replaying a subset must
        // not tell the user the whole file went out.
        if (outcome === "done" && payloads.length === preparedRef.current?.frames.length) setFinished(true);
      } catch {
        if (runRef.current === run) setError(t("common.error"));
      } finally {
        if (runRef.current === run) {
          setPlaying(false);
          setPaused(false);
        }
      }
    },
    [getPlayer, protocol, t, volume],
  );

  const buildAndPlay = useCallback(async () => {
    if (!fileBytes) {
      setError(t("snd.noFile"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const out = await prepareTransfer({
        name: fileName,
        mime: fileMime,
        bytes: fileBytes,
        passphrase: passphrase.trim() ? passphrase : undefined,
        protocol,
      });
      preparedRef.current = out;
      setPrepared(out);
      setPosition({ current: 0, total: out.frames.length });
      // Playback can run for hours; it owns its own error and state handling.
      void startPlayback(out.frames.map((frame) => frame.payload));
    } catch (e) {
      setError(e instanceof Error && e.message === "too-large" ? t("snd.tooLarge") : t("common.error"));
    } finally {
      setBusy(false);
    }
  }, [fileBytes, fileName, fileMime, passphrase, protocol, startPlayback, t]);

  const togglePause = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (paused) {
      player.resume();
      setPaused(false);
    } else {
      player.pause();
      setPaused(true);
    }
  }, [paused]);

  const replaySelected = useCallback(() => {
    if (!prepared) return;
    const indices = parseFrameList(replayText, prepared.dataFrames.length);
    if (indices.length === 0) {
      setReplayError(t("snd.replayInvalid"));
      return;
    }
    setReplayError(null);
    const payloads = indices
      .map((index) => prepared.dataFrames[index]?.payload)
      .filter((payload): payload is Uint8Array => Boolean(payload));
    void startPlayback(payloads);
  }, [prepared, replayText, startPlayback, t]);

  const headerFrames = useMemo(() => {
    const nameBytes = new TextEncoder().encode(fileName || "x").length;
    return 2 * (2 + Math.max(1, Math.ceil(nameBytes / SFT_DATA_BYTES)));
  }, [fileName]);

  const estimateSeconds = useMemo(() => {
    if (!fileBytes) return 0;
    return estimateSequenceSeconds({
      byteLength: fileBytes.length + (passphrase.trim() ? 16 : 0),
      headerFrames,
      protocol,
      gapMs: SFT_DEFAULT_GAP_MS,
    });
  }, [fileBytes, headerFrames, passphrase, protocol]);

  const playbackTotal = prepared ? prepared.frames.length : 0;
  const shownSeconds = prepared
    ? prepared.estimatedSeconds
    : estimateSeconds;

  return (
    <section className="bench-panel" style={{ display: "grid", gap: 12 }} aria-label={t("snd.send")}>
      <div className="bench-actions">
        <Button size="sm" variant="outline" onClick={onBack}>
          {t("common.back")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={playing}>
          {t("snd.chooseFile")}
        </Button>
        <input
          ref={fileRef}
          type="file"
          className="sr-only"
          aria-label={t("snd.chooseFile")}
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Allow re-selecting the same path after clearing the state.
            e.target.value = "";
            void pickFile(file);
          }}
        />
      </div>

      {fileBytes && (
        <p style={{ margin: 0, fontSize: 13 }} aria-live="polite">
          {t("snd.selected", { name: fileName, size: formatSize(fileBytes.length) })}
        </p>
      )}

      <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
        {t("snd.protocol")}
        <select
          value={protocol}
          onChange={(e) => setProtocol(e.target.value === "normal" || e.target.value === "fast" ? e.target.value : "fastest")}
          aria-label={t("snd.protocol")}
          disabled={playing || prepared !== null}
        >
          <option value="fastest">{t("snd.protocolFastest")}</option>
          <option value="fast">{t("snd.protocolFast")}</option>
          <option value="normal">{t("snd.protocolNormal")}</option>
        </select>
        <span style={{ opacity: 0.8 }}>{t("snd.protocolHint")}</span>
      </label>

      <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
        {t("snd.passphraseOptional")}
        <Input
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder={t("snd.passphraseHint")}
          autoComplete="off"
          disabled={playing || prepared !== null}
        />
      </label>

      {fileBytes && (
        <p style={{ margin: 0, fontSize: 13 }} aria-live="polite">
          {t("snd.estimated", {
            duration: formatDuration(shownSeconds),
            frames: prepared ? playbackTotal : Math.ceil(fileBytes.length / SFT_DATA_BYTES) + headerFrames,
          })}
        </p>
      )}
      {fileBytes && shownSeconds > 120 && (
        <p className="game-turn" role="status" style={{ margin: 0 }}>
          {t("snd.estimateLong")}
        </p>
      )}

      <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
        {t("snd.volume")}
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => {
            const next = Number(e.target.value);
            setVolume(next);
            playerRef.current?.setVolume(next);
          }}
          aria-label={t("snd.volume")}
        />
      </label>

      <div className="bench-actions">
        {!prepared && (
          <Button size="sm" onClick={() => void buildAndPlay()} disabled={!fileBytes || busy}>
            <Play className="mr-2 size-3.5" aria-hidden="true" />
            {busy ? t("common.loading") : t("snd.prepare")}
          </Button>
        )}
        {prepared && !playing && (
          <Button size="sm" onClick={() => void startPlayback(prepared.frames.map((frame) => frame.payload))}>
            <RotateCcw className="mr-2 size-3.5" aria-hidden="true" />
            {t("snd.replay")}
          </Button>
        )}
        {prepared && playing && (
          <Button size="sm" variant="outline" onClick={togglePause} aria-pressed={paused}>
            {paused ? <Play className="mr-2 size-3.5" aria-hidden="true" /> : <Pause className="mr-2 size-3.5" aria-hidden="true" />}
            {paused ? t("snd.resume") : t("snd.pause")}
          </Button>
        )}
        {prepared && (
          <Button size="sm" variant="outline" onClick={stopPlayback} disabled={!playing}>
            <Square className="mr-2 size-3.5" aria-hidden="true" />
            {t("snd.stop")}
          </Button>
        )}
        {prepared && (
          <Button size="sm" variant="outline" onClick={resetTransfer}>
            {t("common.clear")}
          </Button>
        )}
      </div>

      {error && (
        <p className="game-turn" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      )}

      {prepared && (
        <div style={{ display: "grid", gap: 8 }}>
          <p style={{ margin: 0, fontSize: 13 }} aria-live="polite">
            {t("snd.sending", { name: prepared.name, size: formatSize(prepared.plainSize) })}
          </p>
          <p style={{ margin: 0, fontSize: 13 }}>
            {t("snd.frameOf", { current: position.current, total: position.total || playbackTotal })} ·{" "}
            {t("snd.dataFrames", { count: prepared.dataFrames.length })}
            {prepared.meta.enc === 1 ? ` · ${t("snd.encrypted")}` : ""}
          </p>
          <progress
            value={position.current}
            max={Math.max(1, position.total || playbackTotal)}
            style={{ width: "100%" }}
            aria-label={t("snd.frameOf", { current: position.current, total: position.total || playbackTotal })}
          />
          <p style={{ margin: 0, fontSize: 12, opacity: 0.85 }}>{t("snd.speakerTip")}</p>
          {finished && (
            <p style={{ margin: 0, fontSize: 13 }} role="status">
              {t("snd.done")}
            </p>
          )}

          {prepared.dataFrames.length > 0 && (
            <div style={{ display: "grid", gap: 6 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{t("snd.replayTitle")}</p>
              <p style={{ margin: 0, fontSize: 12, opacity: 0.85 }}>{t("snd.replayHint")}</p>
              <div className="bench-actions">
                <Input
                  value={replayText}
                  onChange={(e) => {
                    setReplayText(e.target.value);
                    setReplayError(null);
                  }}
                  placeholder="12-15, 40"
                  aria-label={t("snd.replayTitle")}
                  style={{ maxWidth: 220 }}
                />
                <Button size="sm" variant="outline" onClick={replaySelected} disabled={playing || !replayText.trim()}>
                  {t("snd.replayFrames")}
                </Button>
              </div>
              {replayError && (
                <p className="game-turn" role="alert" style={{ margin: 0 }}>
                  {replayError}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <SoundHow />
    </section>
  );
}

function SoundHow() {
  const { t } = useTranslation();
  return (
    <details style={{ fontSize: 13 }}>
      <summary>{t("snd.howTitle")}</summary>
      <ol style={{ margin: "8px 0 0", paddingLeft: 20, display: "grid", gap: 4 }}>
        <li>{t("snd.how1")}</li>
        <li>{t("snd.how2")}</li>
        <li>{t("snd.how3")}</li>
        <li>{t("snd.how4")}</li>
        <li>{t("snd.how5")}</li>
        <li>{t("snd.how6")}</li>
      </ol>
      <p style={{ opacity: 0.85 }}>{t("snd.limitations")}</p>
    </details>
  );
}

/* ------------------------------------------------------------------ */
/* Receiver                                                            */
/* ------------------------------------------------------------------ */

function ReceiverPane({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const receiverRef = useRef<SftReceiver | null>(null);
  if (!receiverRef.current) receiverRef.current = new SftReceiver();
  const receiver = receiverRef.current;

  const [tick, setTick] = useState(0);
  const [starting, setStarting] = useState(false);
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [calibrating, setCalibrating] = useState(false);
  const [pendingSid, setPendingSid] = useState<number | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [done, setDone] = useState<{ name: string; mime: string; size: number; url: string } | null>(null);
  const [announce, setAnnounce] = useState("");

  const sessionRef = useRef<MicrophoneSession | null>(null);
  const segmenterRef = useRef<SoundSegmenter | null>(null);
  const queueRef = useRef<Float32Array[]>([]);
  const pumpingRef = useRef(false);
  const mountedRef = useRef(true);
  /** Bumped on stop; an in-flight decode from before a Clear must not land. */
  const captureRef = useRef(0);
  const lastAnnounceRef = useRef(0);
  const lastLevelRef = useRef(0);
  const urlRef = useRef<string | null>(null);

  const meta = receiver.meta;
  const received = receiver.received;
  const total = receiver.total;
  void tick;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sessionRef.current?.stop();
      sessionRef.current = null;
      segmenterRef.current = null;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const handleIngest = useCallback(
    (result: SftIngest) => {
      if (!mountedRef.current) return;
      setTick((n) => n + 1);
      if (result.kind === "wrong-session" && result.meta) setPendingSid(result.sid);
      const now = Date.now();
      if (receiver.meta && now - lastAnnounceRef.current > 2000) {
        lastAnnounceRef.current = now;
        setAnnounce(t("snd.receiving", { received: receiver.received, total: receiver.total }));
      }
    },
    [receiver, t],
  );

  const pump = useCallback(async () => {
    if (pumpingRef.current) return;
    pumpingRef.current = true;
    const capture = captureRef.current;
    try {
      while (queueRef.current.length > 0 && mountedRef.current) {
        const segment = queueRef.current.shift();
        if (!segment) break;
        let payload: Uint8Array | null = null;
        try {
          payload = await decodePayload(segment);
        } catch {
          payload = null;
        }
        if (payload && mountedRef.current && capture === captureRef.current) {
          handleIngest(receiver.ingest(payload));
        }
      }
    } finally {
      pumpingRef.current = false;
    }
  }, [handleIngest, receiver]);

  const stopListening = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
    segmenterRef.current = null;
    session?.stop();
    captureRef.current += 1;
    queueRef.current = [];
    setListening(false);
    setCalibrating(false);
    setLevel(0);
  }, []);

  const startListening = useCallback(async () => {
    setMicError(null);
    captureRef.current += 1;
    const support = probeBrowserMicrophoneSupport();
    if (!support.ok || !isAudioSupported()) {
      setMicError(
        t(
          support.ok
            ? "snd.micUnsupported"
            : support.reason === "insecure-context"
              ? "snd.micInsecure"
              : "snd.micUnsupported",
        ),
      );
      return;
    }

    setStarting(true);
    segmenterRef.current = new SoundSegmenter({ sampleRate: 48000 });
    try {
      const session = await openMicrophone((chunk, rate) => {
        const segmenter = segmenterRef.current;
        if (!segmenter) return;
        const segment = segmenter.push(toGgwaveRate(chunk, rate));
        const now = performance.now();
        if (now - lastLevelRef.current > 100) {
          lastLevelRef.current = now;
          setLevel(segmenter.rms);
          setCalibrating(segmenter.calibrating);
        }
        if (!segment) return;
        queueRef.current.push(segment);
        // Decoding a 5 s burst takes ~20 ms, so this never fills in practice;
        // the cap only stops a stalled decoder from eating memory.
        if (queueRef.current.length > 32) queueRef.current.shift();
        void pump();
      });
      if (!mountedRef.current) {
        session.stop();
        return;
      }
      sessionRef.current = session;
      setListening(true);
    } catch (e) {
      segmenterRef.current = null;
      const kind = mapGetUserMediaError(e);
      setMicError(
        t(kind === "denied" ? "snd.micDenied" : kind === "no-device" ? "snd.micNoDevice" : "snd.micFailed"),
      );
    } finally {
      if (mountedRef.current) setStarting(false);
    }
  }, [pump, t]);

  const cancelAll = useCallback(() => {
    stopListening();
    receiver.reset();
    setPendingSid(null);
    setPassphrase("");
    setVerifyError(null);
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setDone(null);
    setAnnounce("");
    setTick((n) => n + 1);
  }, [receiver, stopListening]);

  const verify = useCallback(async () => {
    setVerifyError(null);
    try {
      const out = await receiver.reassemble(passphrase.trim() ? passphrase : undefined);
      const blob = new Blob([out.bytes as BlobPart], { type: out.mime });
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setDone({ name: out.name, mime: out.mime, size: out.bytes.length, url });
      // The file is complete and verified; release the microphone instead of
      // leaving the tab listening (and recording) in the background.
      stopListening();
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      setVerifyError(
        t(
          message === "passphrase-required"
            ? "snd.passphraseRequired"
            : message === "wrong-passphrase" || message === "checksum-mismatch"
              ? "snd.verifyFailed"
              : message === "incomplete"
                ? "snd.incomplete"
                : "common.error",
        ),
      );
    }
  }, [passphrase, receiver, stopListening, t]);

  const missing = meta ? receiver.missing() : [];
  const missingText = missing
    .slice(0, 20)
    .map((index) => index + 1)
    .join(", ");

  return (
    <section className="bench-panel" style={{ display: "grid", gap: 12 }} aria-label={t("snd.receive")}>
      <div className="bench-actions">
        <Button size="sm" variant="outline" onClick={onBack}>
          {t("common.back")}
        </Button>
        {!listening ? (
          <Button size="sm" onClick={() => void startListening()} disabled={starting}>
            <Mic className="mr-2 size-3.5" aria-hidden="true" />
            {starting ? t("common.loading") : t("snd.startListening")}
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={stopListening}>
            <Square className="mr-2 size-3.5" aria-hidden="true" />
            {t("snd.stopListening")}
          </Button>
        )}
        {(meta || received > 0) && (
          <Button size="sm" variant="outline" onClick={cancelAll}>
            {t("common.clear")}
          </Button>
        )}
      </div>

      {micError && (
        <p className="game-turn" role="alert" style={{ margin: 0 }}>
          {micError}
        </p>
      )}

      {listening && (
        <div style={{ display: "grid", gap: 4 }}>
          <label style={{ fontSize: 13 }}>{t("snd.level")}</label>
          <progress
            value={Math.min(1, level / 0.15)}
            max={1}
            style={{ width: "100%" }}
            aria-label={t("snd.level")}
          />
          {calibrating && (
            <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }} role="status">
              {t("snd.calibrating")}
            </p>
          )}
        </div>
      )}

      {listening && !meta && (
        <p style={{ margin: 0, fontSize: 13 }} role="status">
          {t("snd.waitingHeader")}
        </p>
      )}

      {meta && (
        <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
          <p style={{ margin: 0 }} aria-live="polite">
            {receiver.nameComplete && receiver.name ? `${receiver.name} — ` : ""}
            {t("snd.receiving", { received, total })}
          </p>
          <progress
            value={total === 0 ? 1 : received}
            max={total === 0 ? 1 : total}
            style={{ width: "100%" }}
            aria-label={t("snd.receiving", { received, total })}
          />
          {!receiver.nameComplete && (
            <p style={{ margin: 0, opacity: 0.85 }}>{t("snd.waitingName")}</p>
          )}
          <p style={{ margin: 0, opacity: 0.85 }}>
            {t("snd.duplicates", { count: receiver.duplicates })} · {t("snd.invalid", { count: receiver.invalid })}
            {receiver.wrongSession > 0 ? ` · ${t("snd.wrongSession", { count: receiver.wrongSession })}` : ""}
          </p>
          {missing.length > 0 && (
            <p style={{ margin: 0 }} role="status">
              {t("snd.missing", { list: missingText + (missing.length > 20 ? "…" : "") })} — {t("snd.missingHint")}
            </p>
          )}
          {receiver.complete && (
            <p style={{ margin: 0 }} role="status">
              {t("snd.allReceived")}
            </p>
          )}
        </div>
      )}

      {pendingSid !== null && (
        <div className="game-turn" role="alert" style={{ display: "grid", gap: 8 }}>
          <span>{t("snd.newSession")}</span>
          <div className="bench-actions">
            <Button
              size="sm"
              onClick={() => {
                receiver.acceptPending();
                setPendingSid(null);
                if (urlRef.current) {
                  URL.revokeObjectURL(urlRef.current);
                  urlRef.current = null;
                }
                setDone(null);
                setVerifyError(null);
                setPassphrase("");
                setTick((n) => n + 1);
              }}
            >
              {t("snd.switchSession")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                receiver.dismissPending();
                setPendingSid(null);
              }}
            >
              {t("snd.keepSession")}
            </Button>
          </div>
        </div>
      )}

      <span className="sr-only" aria-live="polite">
        {announce}
      </span>

      {meta?.enc === 1 && !done && (
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          {t("snd.passphrase")}
          <Input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} autoComplete="off" />
        </label>
      )}

      {meta && !done && (
        <div className="bench-actions">
          <Button size="sm" onClick={() => void verify()} disabled={!receiver.complete}>
            <Download className="mr-2 size-3.5" aria-hidden="true" />
            {t("snd.verifyDownload")}
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
            {t("snd.verified", { name: done.name, size: formatSize(done.size) })}
          </p>
          <div className="bench-actions">
            <a
              href={done.url}
              download={done.name}
              className="tool-file-remove"
              style={{ width: "auto", padding: "0 12px", fontSize: 12 }}
            >
              <Download className="size-3.5" aria-hidden="true" />
              <span>{t("common.download")}</span>
            </a>
            <Button size="sm" variant="outline" onClick={cancelAll}>
              {t("snd.another")}
            </Button>
          </div>
        </div>
      )}

      <SoundHow />
    </section>
  );
}
