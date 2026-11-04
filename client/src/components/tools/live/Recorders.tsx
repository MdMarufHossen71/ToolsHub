/** Camera and screen recorders: permission-gated capture with cleanup. */
import { useEffect, useRef, useState } from "react";
import { Download, Mic, Square, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/contexts/AppSettingsContext";

function useRecorder() {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const urlRef = useRef<string | null>(null);
  const [live, setLive] = useState(false);
  const [recording, setRecording] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  // The stream dies with the component: no hot mic or camera left behind on
  // navigation, and the preview URL is revoked with it.
  useEffect(
    () => () => {
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const setPreviewUrl = (next: string | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = next;
    setUrl(next);
  };

  const attach = async (stream: MediaStream) => {
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => undefined);
    }
    // A screen share ended from the browser bar looks like an idle preview;
    // surface it as stopped instead.
    stream.getVideoTracks()[0]?.addEventListener("ended", () => {
      setLive(false);
      setRecording(false);
    });
    setLive(true);
  };

  const startCamera = async () => {
    setDenied(false);
    setPreviewUrl(null);
    try {
      await attach(await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 } }, audio: true }));
    } catch {
      setDenied(true);
    }
  };

  const startScreen = async () => {
    setDenied(false);
    setPreviewUrl(null);
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        setDenied(true);
        return;
      }
      await attach(await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }));
    } catch {
      setDenied(true);
    }
  };

  const toggleRecord = () => {
    const stream = streamRef.current;
    if (!stream) return;
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    chunks.current = [];
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType: mime });
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.current.push(event.data);
    };
    recorder.onstop = () => {
      setPreviewUrl(URL.createObjectURL(new Blob(chunks.current, { type: "video/webm" })));
    };
    recorderRef.current = recorder;
    recorder.start(250);
    setRecording(true);
  };

  return { t, videoRef, live, recording, url, denied, startCamera, startScreen, toggleRecord };
}

function RecorderPanel({
  fileName,
  onAllow,
  recorder,
}: {
  fileName: string;
  onAllow: () => void;
  recorder: Omit<ReturnType<typeof useRecorder>, "t" | "startCamera" | "startScreen">;
}) {
  const { t } = useTranslation();
  const { videoRef, live, recording, url, denied, toggleRecord } = recorder;
  return (
    <div className="live-stage">
      <video ref={videoRef} muted playsInline className="recorder-video" aria-label={t("tool.live.preview")} />
      {!live && (
        <div className="bench-actions bench-actions-center">
          {/* Names the permission, not a game: nothing records until access is allowed. */}
          <Button size="sm" onClick={onAllow}>
            <Video className="mr-2 size-3.5" aria-hidden="true" />
            {t("tool.live.allow")}
          </Button>
        </div>
      )}
      {denied && (
        <p className="form-error" role="alert">
          {t("tool.live.allow")}
        </p>
      )}
      {live && (
        <div className="bench-actions bench-actions-center">
          <Button size="sm" variant={recording ? "destructive" : "default"} onClick={toggleRecord}>
            {recording ? <Square className="mr-2 size-3.5" aria-hidden="true" /> : <Video className="mr-2 size-3.5" aria-hidden="true" />}
            {recording ? t("tool.live.stop") : t("game.start")}
          </Button>
          {url && (
            <a href={url} download={fileName} rel="noopener" className="file-download" aria-label={`${t("common.download")} ${fileName}`}>
              <Download className="size-3.5" aria-hidden="true" />
              <span aria-hidden="true">.webm</span>
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export function CameraRecorder() {
  const { startCamera, ...rest } = useRecorder();
  return <RecorderPanel fileName="recording.webm" onAllow={() => void startCamera()} recorder={rest} />;
}

export function ScreenRecorder() {
  const { startScreen, ...rest } = useRecorder();
  return <RecorderPanel fileName="screen.webm" onAllow={() => void startScreen()} recorder={rest} />;
}

/** Browser-native audio capture; it uses the original MediaRecorder format without transcoding. */
export function VoiceRecorder() {
  const { t } = useTranslation();
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const objectUrlRef = useRef<string | null>(null);
  const disposedRef = useRef(false);
  const [live, setLive] = useState(false);
  const [recording, setRecording] = useState(false);
  const [denied, setDenied] = useState(false);
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const revokeDownload = () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    setDownload(null);
  };

  const allowMicrophone = async () => {
    setDenied(false);
    revokeDownload();
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("unsupported");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (disposedRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      setLive(true);
    } catch {
      if (!disposedRef.current) setDenied(true);
    }
  };

  const toggleRecord = () => {
    const stream = streamRef.current;
    if (!stream) return;
    if (recording) {
      recorderRef.current?.stop();
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setLive(false);
      setRecording(false);
      return;
    }
    chunksRef.current = [];
    const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    const mimeType = types.find((type) => MediaRecorder.isTypeSupported(type));
    try {
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        if (disposedRef.current) return;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "application/octet-stream" });
        if (!blob.size) { setDenied(true); return; }
        const extension = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        setDownload({ url, name: `voice-recording.${extension}` });
      };
      recorderRef.current = recorder;
      recorder.start(250);
      setRecording(true);
    } catch {
      setDenied(true);
    }
  };

  return (
    <div className="live-stage">
      <div className="bench-actions bench-actions-center">
        {!live ? (
          <Button size="sm" onClick={() => void allowMicrophone()}>
            <Mic className="mr-2 size-3.5" aria-hidden="true" />{t("tool.live.allow")}
          </Button>
        ) : (
          <Button size="sm" variant={recording ? "destructive" : "default"} onClick={toggleRecord}>
            {recording ? <Square className="mr-2 size-3.5" aria-hidden="true" /> : <Mic className="mr-2 size-3.5" aria-hidden="true" />}
            {recording ? t("tool.live.stop") : t("game.start")}
          </Button>
        )}
        {download && <a href={download.url} download={download.name} rel="noopener" className="file-download" aria-label={`${t("common.download")} ${download.name}`}><Download className="size-3.5" aria-hidden="true" /><span>{download.name}</span></a>}
      </div>
      {recording && <p role="status">{t("tool.live.text")}: {t("tool.live.recording")}</p>}
      {denied && <p className="form-error" role="alert">{t("tool.live.allow")}</p>}
    </div>
  );
}
