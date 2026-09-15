/** Camera and screen recorders: permission-gated capture with cleanup. */
import { useEffect, useRef, useState } from "react";
import { Download, Square, Video } from "lucide-react";
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
