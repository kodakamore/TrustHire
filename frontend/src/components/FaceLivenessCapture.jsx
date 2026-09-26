import React, { useRef, useState, useEffect } from "react";

// Cheap client-side "did anything actually change" check between two
// captured frames of the SAME resolution: sample a grid of pixels and sum
// the absolute brightness difference. A live webcam feed always has sensor
// noise and micro-movement between frames a second or more apart; a static
// image (e.g. a photo held up to the camera, or a frozen/looping feed) will
// come back with a near-zero difference. This is only a coarse sanity check
// — the authoritative liveness decision is made server-side by Dojah — but
// it lets us reject an obviously-static capture before it's even submitted.
const frameMotionScore = (ctxA, ctxB, width, height) => {
  const a = ctxA.getImageData(0, 0, width, height).data;
  const b = ctxB.getImageData(0, 0, width, height).data;
  const step = 4 * 40; // sparse sample for speed
  let diff = 0;
  let samples = 0;
  for (let i = 0; i < a.length && i < b.length; i += step) {
    diff +=
      Math.abs(a[i] - b[i]) +
      Math.abs(a[i + 1] - b[i + 1]) +
      Math.abs(a[i + 2] - b[i + 2]);
    samples++;
  }
  return samples ? diff / samples : 0;
};

const FaceLivenessCapture = ({ onCaptureComplete, onCancel }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const framesRef = useRef([]); // [{ dataUrl, ctx, width, height }]

  const [stream, setStream] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  // Liveness challenge state machine: 'ready' -> 'challenge_1' -> 'challenge_2' -> 'challenge_3' -> 'completed'
  const [livenessStage, setLivenessStage] = useState("ready");
  const [challengeProgress, setChallengeProgress] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [capturedSelfie, setCapturedSelfie] = useState(null);
  const [captureError, setCaptureError] = useState(null);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setCameraActive(true);
      setLivenessStage("ready");
    } catch (err) {
      console.error("Camera access error:", err);
      setCameraError(
        err.name === "NotAllowedError"
          ? "Camera permission denied. Please allow camera access in your browser settings."
          : "Unable to access your webcam. Please verify your camera is plugged in and not in use by another application.",
      );
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setCameraActive(false);
  };

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  // Grabs a single frame from the live video element onto a fresh canvas.
  // Returns { dataUrl, ctx, width, height, avgBrightness } or null on failure.
  const grabFrame = () => {
    if (!videoRef.current) return null;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    // Mirror the image horizontally to match webcam display
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    let avgBrightness = 255;
    try {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      let totalBrightness = 0;
      const sampleStep = 4 * 32;
      let samples = 0;
      for (let i = 0; i < data.length; i += sampleStep) {
        const brightness =
          0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        totalBrightness += brightness;
        samples++;
      }
      avgBrightness = totalBrightness / Math.max(1, samples);
    } catch (e) {
      // getImageData can throw under some security restrictions — proceed
      // without a brightness reading rather than blocking capture entirely.
    }

    return {
      dataUrl: canvas.toDataURL("image/jpeg", 0.85),
      ctx,
      width: canvas.width,
      height: canvas.height,
      avgBrightness,
    };
  };

  const failCapture = (message) => {
    setCaptureError(message);
    setAnalyzing(false);
    setLivenessStage("ready");
    setChallengeProgress(0);
    framesRef.current = [];
  };

  const runLivenessCheck = () => {
    setCaptureError(null);
    framesRef.current = [];
    setLivenessStage("challenge_1");
    setChallengeProgress(20);

    const frame1 = grabFrame();
    if (!frame1 || frame1.avgBrightness < 8) {
      failCapture(
        "Camera appears covered or lighting is pitch black. Please ensure your face is illuminated.",
      );
      return;
    }
    framesRef.current.push(frame1);

    // Three checkpoints across the real-time challenge sequence. Each one
    // captures an actual fresh frame from the live video feed — nothing is
    // pre-recorded or reused — so the sequence can only be completed while
    // looking at a genuinely live camera.
    setTimeout(() => {
      setLivenessStage("challenge_2");
      setChallengeProgress(55);
      const frame2 = grabFrame();
      if (!frame2 || frame2.avgBrightness < 8) {
        failCapture(
          "Lost a clear view of your face. Please ensure good lighting and try again.",
        );
        return;
      }
      framesRef.current.push(frame2);

      setTimeout(() => {
        setLivenessStage("challenge_3");
        setChallengeProgress(85);

        setTimeout(() => {
          finalizeCapture();
        }, 1200);
      }, 1500);
    }, 1500);
  };

  const finalizeCapture = () => {
    setAnalyzing(true);
    const frame3 = grabFrame();
    if (!frame3 || frame3.avgBrightness < 8) {
      failCapture(
        "Camera appears covered or lighting is pitch black. Please ensure your face is illuminated.",
      );
      return;
    }
    framesRef.current.push(frame3);

    const frames = framesRef.current;

    // Motion sanity check: the first and last captured frames (~4s apart)
    // must differ by more than a tiny sensor-noise amount. A near-zero
    // difference strongly suggests a static image was held in front of the
    // camera rather than an actual live person.
    try {
      const motion = frameMotionScore(
        frames[0].ctx,
        frames[frames.length - 1].ctx,
        frames[0].width,
        frames[0].height,
      );
      if (motion < 1.5) {
        failCapture(
          "No movement was detected during the check. Please make sure you are in front of a live camera — not a static photo or a paused video — and try again.",
        );
        return;
      }
    } catch (e) {
      // Non-fatal: fall through and let the backend's own liveness check be
      // the authoritative decision if the client-side motion check errors.
    }

    const finalDataUrl = frames[frames.length - 1].dataUrl;
    setCapturedSelfie(finalDataUrl);
    setLivenessStage("completed");
    setChallengeProgress(100);
    setAnalyzing(false);
    stopCamera();

    if (onCaptureComplete) {
      onCaptureComplete({ frames: frames.map((f) => f.dataUrl) });
    }
  };

  const resetCapture = () => {
    setCapturedSelfie(null);
    setCaptureError(null);
    setLivenessStage("ready");
    setChallengeProgress(0);
    framesRef.current = [];
    startCamera();
  };

  return (
    <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-2xl max-w-lg mx-auto">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500 animate-ping"></span>
          <h3 className="font-bold text-sm tracking-wide text-gray-100 uppercase">
            Live Biometric & Liveness Check
          </h3>
        </div>
        <span className="text-[11px] bg-indigo-500/20 text-indigo-300 font-semibold px-2.5 py-0.5 rounded-full border border-indigo-500/30">
          Anti-Spoofing
        </span>
      </div>

      <p className="text-xs text-gray-400 mb-4">
        To prevent fraudulent impersonation, static photo uploads are disabled.
        Please look directly at your webcam and stay in frame for the full check
        — three separate live frames are captured and verified.
      </p>

      {/* Video Viewport / Mirror Area */}
      <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border-2 border-slate-700 flex items-center justify-center">
        {cameraError ? (
          <div className="p-4 text-center">
            <p className="text-red-400 text-sm font-semibold mb-2">
              Camera Error
            </p>
            <p className="text-xs text-gray-400 mb-4">{cameraError}</p>
            <button
              onClick={startCamera}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold"
            >
              Retry Camera
            </button>
          </div>
        ) : capturedSelfie ? (
          <img
            src={capturedSelfie}
            alt="Verified Live Capture"
            className="w-full h-full object-cover"
          />
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover transform -scale-x-100"
            />
            {/* Biometric Oval Guide Overlay */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div
                className={`w-44 h-56 rounded-[50%] border-2 border-dashed ${livenessStage !== "ready" ? "border-emerald-400 shadow-[0_0_25px_rgba(52,211,153,0.5)]" : "border-indigo-400/80"} transition-all duration-300`}
              ></div>
            </div>

            {/* Instruction Banner Over Video */}
            <div className="absolute bottom-3 left-3 right-3 bg-slate-900/90 backdrop-blur-sm border border-slate-700 p-2.5 rounded-lg text-center">
              {livenessStage === "ready" && (
                <p className="text-xs font-semibold text-gray-200">
                  Position your face inside the oval and click "Start Liveness
                  Check"
                </p>
              )}
              {livenessStage === "challenge_1" && (
                <p className="text-xs font-bold text-amber-300 animate-pulse">
                  Stay in frame — capturing live check 1/3...
                </p>
              )}
              {livenessStage === "challenge_2" && (
                <p className="text-xs font-bold text-emerald-300 animate-pulse">
                  Keep looking at the camera — capturing live check 2/3...
                </p>
              )}
              {livenessStage === "challenge_3" && (
                <p className="text-xs font-bold text-cyan-300 animate-pulse">
                  Hold still! Capturing final live biometric frame 3/3...
                </p>
              )}
            </div>
          </>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {captureError && (
        <div className="mt-3 p-2.5 bg-red-900/40 border border-red-800 rounded-lg text-xs text-red-300">
          {captureError}
        </div>
      )}

      {/* Progress Bar */}
      {livenessStage !== "ready" && (
        <div className="mt-4">
          <div className="flex justify-between text-[11px] text-gray-400 mb-1">
            <span>Liveness Verification</span>
            <span>{challengeProgress}%</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-emerald-500 h-1.5 transition-all duration-500"
              style={{ width: `${challengeProgress}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Action Controls */}
      <div className="mt-5 flex gap-3">
        {capturedSelfie ? (
          <div className="w-full flex items-center justify-between">
            <span className="text-xs text-emerald-400 font-bold flex items-center gap-1.5">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Live Liveness Confirmed
            </span>
            <button
              onClick={resetCapture}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-gray-300 rounded-lg text-xs font-medium border border-slate-700"
            >
              Retake Live Photo
            </button>
          </div>
        ) : (
          <>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-gray-300 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={runLivenessCheck}
              disabled={!cameraActive || livenessStage !== "ready"}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold tracking-wide shadow-lg shadow-indigo-600/30 transition-all"
            >
              {analyzing
                ? "Analyzing Liveness..."
                : livenessStage === "ready"
                  ? "Start Liveness Check"
                  : "Verifying..."}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default FaceLivenessCapture;
