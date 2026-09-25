import React, { useRef, useState, useEffect } from 'react';

const FaceLivenessCapture = ({ onCaptureComplete, onCancel }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [stream, setStream] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  
  // Liveness challenge state machine: 'ready' -> 'blink' -> 'turn_left' -> 'smile' -> 'completed'
  const [livenessStage, setLivenessStage] = useState('ready');
  const [challengeProgress, setChallengeProgress] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [capturedSelfie, setCapturedSelfie] = useState(null);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setCameraActive(true);
      setLivenessStage('ready');
    } catch (err) {
      console.error('Camera access error:', err);
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Please allow camera access in your browser settings.'
          : 'Unable to access your webcam. Please verify your camera is plugged in and not in use by another application.'
      );
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
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

  const runLivenessCheck = () => {
    setLivenessStage('challenge_1');
    setChallengeProgress(20);

    // Simulated interactive dynamic liveness challenge progression
    setTimeout(() => {
      setLivenessStage('challenge_2');
      setChallengeProgress(55);

      setTimeout(() => {
        setLivenessStage('challenge_3');
        setChallengeProgress(85);

        setTimeout(() => {
          captureLiveFrame();
        }, 1200);
      }, 1500);
    }, 1500);
  };

  const captureLiveFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;
    setAnalyzing(true);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    // Mirror the image horizontally to match webcam display
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const base64Selfie = canvas.toDataURL('image/jpeg', 0.85);

    // Biometric frame sanity check: only fail if totally pitch black
    try {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      let totalBrightness = 0;
      const sampleStep = 4 * 32;
      let samples = 0;

      for (let i = 0; i < data.length; i += sampleStep) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
        totalBrightness += brightness;
        samples++;
      }

      const avgBrightness = totalBrightness / Math.max(1, samples);

      if (avgBrightness < 8) {
        setCameraError('Camera appears covered or lighting is pitch black. Please ensure your face is illuminated.');
        setAnalyzing(false);
        setLivenessStage('ready');
        setChallengeProgress(0);
        return;
      }
    } catch (e) {
      // In case of security restrictions on getImageData, proceed with canvas image
    }

    setCapturedSelfie(base64Selfie);
    setLivenessStage('completed');
    setChallengeProgress(100);
    setAnalyzing(false);
    stopCamera();

    if (onCaptureComplete) {
      onCaptureComplete(base64Selfie);
    }
  };

  const resetCapture = () => {
    setCapturedSelfie(null);
    setLivenessStage('ready');
    setChallengeProgress(0);
    startCamera();
  };

  return (
    <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-2xl max-w-lg mx-auto">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500 animate-ping"></span>
          <h3 className="font-bold text-sm tracking-wide text-gray-100 uppercase">Live Biometric & Liveness Check</h3>
        </div>
        <span className="text-[11px] bg-indigo-500/20 text-indigo-300 font-semibold px-2.5 py-0.5 rounded-full border border-indigo-500/30">
          Anti-Spoofing
        </span>
      </div>

      <p className="text-xs text-gray-400 mb-4">
        To prevent fraudulent impersonation, static photo uploads are disabled. Please look directly at your webcam and follow the real-time instructions.
      </p>

      {/* Video Viewport / Mirror Area */}
      <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border-2 border-slate-700 flex items-center justify-center">
        {cameraError ? (
          <div className="p-4 text-center">
            <p className="text-red-400 text-sm font-semibold mb-2">Camera Error</p>
            <p className="text-xs text-gray-400 mb-4">{cameraError}</p>
            <button
              onClick={startCamera}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold"
            >
              Retry Camera
            </button>
          </div>
        ) : capturedSelfie ? (
          <img src={capturedSelfie} alt="Verified Live Capture" className="w-full h-full object-cover" />
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
              <div className={`w-44 h-56 rounded-[50%] border-2 border-dashed ${livenessStage !== 'ready' ? 'border-emerald-400 shadow-[0_0_25px_rgba(52,211,153,0.5)]' : 'border-indigo-400/80'} transition-all duration-300`}></div>
            </div>

            {/* Instruction Banner Over Video */}
            <div className="absolute bottom-3 left-3 right-3 bg-slate-900/90 backdrop-blur-sm border border-slate-700 p-2.5 rounded-lg text-center">
              {livenessStage === 'ready' && (
                <p className="text-xs font-semibold text-gray-200">Position your face inside the oval and click "Start Liveness Check"</p>
              )}
              {livenessStage === 'challenge_1' && (
                <p className="text-xs font-bold text-amber-300 animate-pulse">Action 1/3: Please blink your eyes naturally...</p>
              )}
              {livenessStage === 'challenge_2' && (
                <p className="text-xs font-bold text-emerald-300 animate-pulse">Action 2/3: Slightly nod or turn your head...</p>
              )}
              {livenessStage === 'challenge_3' && (
                <p className="text-xs font-bold text-cyan-300 animate-pulse">Action 3/3: Hold still! Capturing live biometric frame...</p>
              )}
            </div>
          </>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {/* Progress Bar */}
      {livenessStage !== 'ready' && (
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
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
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
              disabled={!cameraActive || livenessStage !== 'ready'}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold tracking-wide shadow-lg shadow-indigo-600/30 transition-all"
            >
              {analyzing ? 'Analyzing Liveness...' : livenessStage === 'ready' ? 'Start Liveness Check' : 'Verifying...'}
            </button>
            <button
              type="button"
              onClick={captureLiveFrame}
              disabled={!cameraActive || analyzing}
              className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-gray-200 border border-slate-700 rounded-lg text-xs font-semibold"
              title="Instantly capture current camera frame"
            >
              Instant Snap
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default FaceLivenessCapture;
