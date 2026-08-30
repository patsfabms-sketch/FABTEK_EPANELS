import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

// Live camera QR scanner — decodes with jsQR against raw video frames
// rather than the browser's native BarcodeDetector API, since iOS Safari's
// support for that API is still inconsistent across the phone/OS versions
// technicians are actually carrying. Calls onDetect(rawString) once for the
// first code it recognizes; the caller decides what to do with it (and can
// unmount this component to stop the camera, or it stops on its own on
// unmount either way).
export default function QrScanner({ onDetect, onCancel }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const lastAttemptRef = useRef(0);
  const detectedRef = useRef(false);
  const [status, setStatus] = useState("starting"); // starting | scanning | denied | unsupported | error

  useEffect(() => {
    let cancelled = false;
    if (!canvasRef.current) canvasRef.current = document.createElement("canvas");

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("unsupported");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
        setStatus("scanning");
        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        if (!cancelled) setStatus(err?.name === "NotAllowedError" ? "denied" : "error");
      }
    }

    // Grabs a frame and hands it to jsQR, throttled to roughly 8x/second —
    // decoding every animation frame (up to 60x/second) burns battery for
    // no real gain in scan speed on a printed sticker that isn't moving.
    function tick(timestamp) {
      if (cancelled || detectedRef.current) return;
      const video = videoRef.current;
      if (video && video.readyState === video.HAVE_ENOUGH_DATA && timestamp - lastAttemptRef.current > 120) {
        lastAttemptRef.current = timestamp;
        // Cap the decode resolution — a printed panel sticker doesn't need
        // full camera resolution to read, and scanning a smaller frame is
        // noticeably faster on lower-end phones.
        const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
        const w = Math.round(video.videoWidth * scale);
        const h = Math.round(video.videoHeight * scale);
        const canvas = canvasRef.current;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(video, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        const code = jsQR(imageData.data, w, h, { inversionAttempts: "dontInvert" });
        if (code?.data) {
          detectedRef.current = true;
          onDetect(code.data);
          return;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    start();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative rounded-xl2 overflow-hidden bg-black aspect-square">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />

      {status === "scanning" && (
        <div className="absolute inset-8 border-2 border-white/80 rounded-2xl pointer-events-none" />
      )}
      {status === "starting" && (
        <div className="absolute inset-0 flex items-center justify-center text-white text-xs">Starting camera…</div>
      )}
      {status === "denied" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-white text-xs text-center px-6">
          <p className="font-semibold">Camera access was denied.</p>
          <p className="text-white/60">Allow camera access for AssemblyOS in your phone's settings, or pick a panel manually below.</p>
        </div>
      )}
      {status === "unsupported" && (
        <div className="absolute inset-0 flex items-center justify-center text-white text-xs text-center px-6">
          Camera scanning isn't supported in this browser — pick a panel manually below.
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center text-white text-xs text-center px-6">
          Couldn't start the camera — pick a panel manually below.
        </div>
      )}

      <button
        onClick={onCancel}
        aria-label="Close scanner"
        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 text-white text-sm flex items-center justify-center"
      >
        ✕
      </button>
    </div>
  );
}
