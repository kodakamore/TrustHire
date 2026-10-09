import React, { useEffect, useRef, useState } from 'react';
import FaceLivenessCapture from './FaceLivenessCapture';
import VerifiedFacePhoto from './VerifiedFacePhoto';
import { verify as verifyApi } from '../services/api';

// ===========================================================================
// Step 4 — recruiter face/liveness verification, powered by Didit.
//
// Two modes, one state machine:
//   live : we create a Didit session server-side, open Didit's HOSTED
//          real-camera capture in a new tab, and poll the verdict endpoint
//          until the signed webhook flips the record to approved/declined.
//   mock : no Didit keys configured — capture happens in-portal with the
//          existing webcam component and drives the same backend flow.
//
// The backend tells us which mode applies; the UI adapts with no config
// switches. Adding real keys to backend/.env turns this component into the
// real camera flow automatically.
// ===========================================================================

const DiditFaceVerification = ({ onComplete }) => {
  // idle | starting | live-waiting | mock | approved | declined | in_review | error
  const [phase, setPhase] = useState('idle');
  const [sessionUrl, setSessionUrl] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef(null);

  const start = async () => {
    setErrorMsg(null);
    setPhase('starting');
    // MOBILE: window.open() must run while the click "user gesture" is still
    // active — after an await, iOS Safari/Android Chrome block it as a
    // popup. Open the placeholder now, navigate it to Didit's URL once the
    // session comes back. If popups are blocked entirely, popup is null and
    // the visible "Open camera check" link below becomes the way through.
    let popup = null;
    try {
      popup = window.open('about:blank', '_blank');
      const res = await verifyApi.startFaceSession();
      const data = res.data?.data || {};

      if (data.alreadyVerified) {
        if (popup && !popup.closed) popup.close();
        setPhase('approved');
        onComplete?.();
        return;
      }
      if (data.mode === 'mock') {
        if (popup && !popup.closed) popup.close();
        setPhase('mock');
        return;
      }
      if (!data.url) {
        // Never navigate to a missing URL — that's how you get a literal
        // "broken" about:blank/undefined tab.
        if (popup && !popup.closed) popup.close();
        setErrorMsg('The verification service did not return a capture link. Please try again.');
        setPhase('error');
        return;
      }
      setSessionUrl(data.url);
      if (popup && !popup.closed) {
        popup.location.href = data.url;
        popup.focus?.();
      }
      // popup === null (blocked): the anchor in live-waiting is the fallback.
      setPhase('live-waiting');
    } catch (err) {
      if (popup && !popup.closed) popup.close();
      setErrorMsg(err.response?.data?.error || err.message || 'Could not start verification');
      setPhase('error');
    }
  };

  // Poll the verdict while a live session is outstanding. The webhook is the
  // source of truth; polling just makes the UI converge without a reload.
  useEffect(() => {
    if (phase !== 'live-waiting') return undefined;

    const check = async () => {
      try {
        const res = await verifyApi.getFaceStatus();
        const rec = res.data?.data?.faceVerification;
        if (rec?.status === 'approved') {
          setPhase('approved');
          onComplete?.();
        } else if (rec?.status === 'declined') {
          setPhase('declined');
        } else if (rec?.status === 'in_review') {
          setPhase('in_review');
        }
      } catch {
        // transient network error — keep polling
      }
    };

    check();
    pollRef.current = setInterval(check, 3500);
    return () => clearInterval(pollRef.current);
  }, [phase, onComplete]);

  const handleMockCapture = async (base64Selfie) => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      // The captured webcam frame becomes the stored verified-face image —
      // same dashboard result as the live Didit flow.
      await verifyApi.completeMockFaceSession({ selfieBase64: base64Selfie });
      const res = await verifyApi.getFaceStatus();
      if (res.data?.data?.faceVerification?.status === 'approved') {
        setPhase('approved');
        onComplete?.();
      } else {
        setPhase('declined');
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Mock verification failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (phase === 'approved') {
    return (
      <div className="bg-emerald-50 border border-emerald-200 p-6 rounded-xl text-center space-y-3">
        <div className="flex justify-center">
          <VerifiedFacePhoto size="h-16 w-16" />
        </div>
        <h4 className="font-bold text-emerald-900 text-base">Liveness Verification Passed</h4>
        <p className="text-xs text-emerald-700 max-w-md mx-auto">
          Your face and liveness were verified by Didit and the result is recorded in the platform audit trail. You are now authorized to register verified companies and publish verifiable job ads.
        </p>
      </div>
    );
  }

  if (phase === 'mock') {
    return (
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3 rounded-md">
          <strong>Mock mode:</strong> Didit keys are not configured, so liveness capture runs in this window
          with your webcam. Add <code>DIDIT_API_KEY</code> / <code>DIDIT_WORKFLOW_ID</code> to{' '}
          <code>backend/.env</code> to switch to the real Didit camera flow — no code changes needed.
        </div>
        <FaceLivenessCapture onCaptureComplete={handleMockCapture} />
        {submitting && <p className="text-sm text-gray-500">Recording verification…</p>}
        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
      </div>
    );
  }

  if (phase === 'live-waiting') {
    return (
      <div className="bg-indigo-50 border border-indigo-200 p-6 rounded-xl text-center space-y-4">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto" />
        <h4 className="font-bold text-indigo-900 text-base">Complete the check in the Didit window</h4>
        <p className="text-xs text-indigo-700 max-w-md mx-auto">
          A secure Didit tab was opened for real-camera liveness. Follow the prompts there
          (blink, turn your head), then return here — this page updates automatically once the
          verified result arrives.
        </p>
        <div className="flex flex-col items-center gap-3 text-xs">
          {sessionUrl && (
            <a
              href={sessionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-indigo-600 text-white px-4 py-2 rounded-md font-medium hover:bg-indigo-700"
            >
              Open the camera check →
            </a>
          )}
          <p className="text-[11px] text-indigo-500">
            Nothing opened? Tap the button above — your browser may be blocking the pop-up tab.
          </p>
          <button
            onClick={() => setPhase('idle')}
            className="text-gray-500 underline"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // idle / starting / error / declined / in_review
  return (
    <div className="space-y-4">
      {phase === 'declined' && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-md">
          The verification was not successful. This usually means the camera could not confirm a live
          person (photo/screen replay attempts are rejected). Please try again in good lighting.
        </div>
      )}
      {phase === 'in_review' && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3 rounded-md">
          Your verification is under manual review. We will update your status once it is assessed.
        </div>
      )}
      {errorMsg && phase === 'error' && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-md">{errorMsg}</div>
      )}
      <p className="text-sm text-gray-500">
        You will complete a short, secure liveness check powered by <strong>Didit</strong> — guided
        camera challenges (blink, head turn) that prove a real person is present. It takes about
        30 seconds. Your face images stay with Didit; TrustHire stores only the pass/fail result.
      </p>
      <button
        onClick={start}
        disabled={phase === 'starting'}
        className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
      >
        {phase === 'starting' ? 'Preparing camera check…' : phase === 'declined' ? 'Retry Liveness Check' : 'Start Liveness Check'}
      </button>
    </div>
  );
};

export default DiditFaceVerification;
