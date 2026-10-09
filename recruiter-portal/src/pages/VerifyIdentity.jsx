import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import VerificationProgress from '../components/VerificationProgress';
import DiditFaceVerification from '../components/DiditFaceVerification';
import VerifiedFacePhoto from '../components/VerifiedFacePhoto';
import { auth, verify as verifyApi } from '../services/api';

// Server-provided `error` strings are shown verbatim; the fallback only
// covers network failures where the backend never replied.
const errMsg = (err, fallback) => err?.response?.data?.error || fallback;

// The backend reports each step as 'verified' | 'pending' | 'failed' in
// `checks`; fall back to the legacy boolean columns if checks is absent.
const isVerified = (rec, checkKey, flagKey) => {
  const check = rec?.checks?.[checkKey];
  if (check) return check === 'verified';
  return !!rec?.[flagKey];
};

const readStatus = (rec) => ({
  emailVerified: isVerified(rec, 'email', 'is_email_verified'),
  phoneVerified: isVerified(rec, 'phone', 'is_phone_verified'),
  identityVerified: isVerified(rec, 'identity', 'is_identity_verified'),
  faceVerified: isVerified(rec, 'face', 'is_face_verified'),
});

const VerifyIdentity = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [recruiter, setRecruiter] = useState(null);
  const [status, setStatus] = useState({
    emailVerified: false,
    phoneVerified: false,
    identityVerified: false,
    faceVerified: false,
  });
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Step 1 (email)
  const [emailOtp, setEmailOtp] = useState('');

  // Step 2 (phone OTP)
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneDebugOtp, setPhoneDebugOtp] = useState(null);

  // Step 3 (government ID)
  const [idType, setIdType] = useState('NIN');
  const [idNumber, setIdNumber] = useState('');

  // Pulls the authoritative state from GET /api/verify/status and opens the
  // wizard on the first step that still needs attention. Never throws.
  const loadStatus = async ({ showError = false } = {}) => {
    try {
      const res = await verifyApi.getStatus();
      const rec = res.data?.data;
      if (!rec) return null;
      setRecruiter(rec);
      if (rec.phone_number) setPhoneNumber((prev) => prev || rec.phone_number);
      const next = readStatus(rec);
      setStatus(next);
      if (!next.emailVerified) setCurrentStep(1);
      else if (!next.phoneVerified) setCurrentStep(2);
      else if (!next.identityVerified) setCurrentStep(3);
      else setCurrentStep(4);
      return next;
    } catch (err) {
      if (showError) {
        setErrorMsg(errMsg(err, 'Could not load your verification status. Please refresh the page and try again.'));
      }
      return null;
    }
  };

  useEffect(() => {
    loadStatus({ showError: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Step 1: Email (link or 6-digit OTP) ──────────────────────────────────
  const handleEmailOtp = async (e) => {
    e.preventDefault();
    if (emailOtp.length !== 6) {
      setErrorMsg('Please enter the 6-digit verification code from your email.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await auth.verifyEmailOtp({ email: recruiter?.email, otp: emailOtp });
      if (res.data?.data?.token) {
        localStorage.setItem('token', res.data.data.token);
      }
      const next = await loadStatus();
      if (next?.emailVerified) {
        setSuccessMsg('Email verified successfully!');
        setEmailOtp('');
      } else {
        setErrorMsg(res.data?.error || 'The code was accepted but email verification is not complete yet.');
      }
    } catch (err) {
      setErrorMsg(errMsg(err, 'Invalid email verification code.'));
    } finally {
      setLoading(false);
    }
  };

  const handleResendEmail = async () => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await auth.resendVerification({ email: recruiter?.email });
      setSuccessMsg(res.data?.message || 'Verification link & code resent! Please check your inbox.');
      if (res.data?.debugOtp) setSuccessMsg((msg) => `${msg} (Code: ${res.data.debugOtp})`);
    } catch (err) {
      setErrorMsg(errMsg(err, 'Failed to resend the verification email.'));
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Phone (send OTP → verify OTP) ────────────────────────────────
  const handleSendPhoneOtp = async () => {
    const target = phoneNumber || recruiter?.phone_number;
    if (!target) {
      setErrorMsg('Please enter a valid phone number.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await verifyApi.sendPhoneOtp({ phoneNumber: target });
      setPhoneOtpSent(true);
      setPhoneDebugOtp(res.data?.data?.debugOtp || null);
      setSuccessMsg(res.data?.message || 'Verification code sent to your phone number!');
    } catch (err) {
      // Real failure: show the server message and do NOT advance the step.
      setPhoneOtpSent(false);
      setErrorMsg(errMsg(err, 'Failed to send the phone verification code. Please check the number.'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPhoneOtp = async (e) => {
    e.preventDefault();
    if (!phoneOtp) {
      setErrorMsg('Please enter the verification code sent to your phone.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await verifyApi.verifyPhoneOtp({ otp: phoneOtp });
      const next = await loadStatus();
      if (next?.phoneVerified) {
        setSuccessMsg(res.data?.message || 'Phone number verified successfully!');
        setPhoneOtp('');
        setPhoneDebugOtp(null);
      } else {
        setErrorMsg(res.data?.error || 'The code was accepted but phone verification is not complete yet.');
      }
    } catch (err) {
      setErrorMsg(errMsg(err, 'Invalid or expired phone verification code.'));
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: Government ID (NIN / BVN) ────────────────────────────────────
  const handleVerifyIdentity = async () => {
    if (!idNumber) return;
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await verifyApi.verifyIdentity({ type: idType.toLowerCase(), number: idNumber });
      const next = await loadStatus();
      if (next?.identityVerified) {
        setSuccessMsg(`${idType} registry match verified!`);
        setIdNumber('');
      } else {
        setErrorMsg(`${idType} verification did not complete. Please check the 11-digit number and try again.`);
      }
    } catch (err) {
      // Real failure: show the server error, stay on this step.
      setErrorMsg(errMsg(err, `${idType} verification failed. Check the 11-digit number.`));
    } finally {
      setLoading(false);
    }
  };

  // Step 4 (Didit face/liveness): the component drives the whole session
  // flow internally and only reports back once the backend approved it.
  const handleFaceVerified = async () => {
    setStatus((prev) => ({ ...prev, faceVerified: true }));
    await loadStatus();
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900">Step 1: Email Verification</h3>
            <p className="text-sm text-gray-500">We sent an activation link and a 6-digit code to your email address. Open the link or enter the code below.</p>
            <div className="bg-gray-50 p-4 rounded-md">
              <span className="text-sm font-medium text-gray-700">{recruiter?.email || 'Your registered email'}</span>
            </div>
            {status.emailVerified ? (
              <div className="text-emerald-600 flex items-center text-sm font-semibold">
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path></svg>
                Email Verified & Screened
              </div>
            ) : (
              <div className="space-y-3">
                <form onSubmit={handleEmailOtp} className="flex items-end gap-2">
                  <div>
                    <label htmlFor="emailOtp" className="block text-xs font-medium text-gray-700 mb-1">6-digit email code</label>
                    <input
                      id="emailOtp"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="123456"
                      value={emailOtp}
                      onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, ''))}
                      className="w-40 px-3 py-2 text-center text-lg font-mono tracking-widest border border-gray-300 rounded-md shadow-sm sm:text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading || emailOtp.length !== 6}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {loading ? 'Verifying...' : 'Confirm Code'}
                  </button>
                </form>
                <div className="flex items-center gap-3 text-sm">
                  <Link to="/verify-email" className="text-indigo-600 font-medium hover:text-indigo-800">
                    Open the verification page
                  </Link>
                  <span className="text-gray-300">|</span>
                  <button type="button" onClick={handleResendEmail} disabled={loading} className="text-indigo-600 font-medium hover:text-indigo-800 disabled:opacity-50">
                    Resend email
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900">Step 2: Phone Verification</h3>
            <p className="text-sm text-gray-500">We send a one-time code to your phone to confirm ownership and screen the number for SIM-swap and VoIP risk.</p>
            {status.phoneVerified ? (
              <div className="text-emerald-600 flex items-center text-sm font-semibold">
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path></svg>
                Phone Verified
                {recruiter?.phone_number && <span className="ml-2 font-mono font-normal text-gray-500">{recruiter.phone_number}</span>}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex gap-2 items-end">
                  <div className="flex-1 max-w-sm">
                    <label htmlFor="phoneNumber" className="block text-xs font-medium text-gray-700 mb-1">Phone number</label>
                    <input
                      id="phoneNumber"
                      type="tel"
                      placeholder="e.g. 08012345678"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      disabled={phoneOtpSent}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSendPhoneOtp}
                    disabled={loading || !phoneNumber}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {loading ? 'Sending...' : phoneOtpSent ? 'Resend OTP' : 'Send Code'}
                  </button>
                </div>

                {phoneOtpSent && (
                  <form onSubmit={handleVerifyPhoneOtp} className="flex items-end gap-2 bg-white p-4 rounded-md border border-gray-200">
                    <div>
                      <label htmlFor="phoneOtp" className="block text-xs font-medium text-gray-700 mb-1">SMS verification code</label>
                      <input
                        id="phoneOtp"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="123456"
                        value={phoneOtp}
                        onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, ''))}
                        className="w-40 px-3 py-2 text-center text-lg font-mono tracking-widest border border-gray-300 rounded-md shadow-sm sm:text-sm"
                        autoFocus
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading || !phoneOtp}
                      className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {loading ? 'Verifying...' : 'Verify Code'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPhoneOtpSent(false)}
                      className="text-xs text-gray-500 hover:text-gray-700 pb-2"
                    >
                      Change number
                    </button>
                    {phoneDebugOtp && (
                      <p className="text-xs font-mono text-indigo-700 bg-indigo-50 p-2 rounded w-full basis-full">
                        Development OTP code: <strong>{phoneDebugOtp}</strong>
                      </p>
                    )}
                  </form>
                )}
              </div>
            )}
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900">Step 3: Government ID Lookup</h3>
            <p className="text-sm text-gray-500">Validate your identity against Nigerian government registries (NIN or BVN).</p>

            <div className="flex space-x-4 mb-4">
              <label className="flex items-center text-sm font-medium text-gray-700 cursor-pointer">
                <input type="radio" name="idType" value="NIN" checked={idType === 'NIN'} onChange={() => setIdType('NIN')} className="mr-2" />
                National Identity Number (NIN)
              </label>
              <label className="flex items-center text-sm font-medium text-gray-700 cursor-pointer">
                <input type="radio" name="idType" value="BVN" checked={idType === 'BVN'} onChange={() => setIdType('BVN')} className="mr-2" />
                Bank Verification Number (BVN)
              </label>
            </div>

            <input
              type="text"
              maxLength={11}
              placeholder={`Enter your 11-digit ${idType}`}
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, ''))}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm font-mono"
            />

            {status.identityVerified ? (
              <div className="text-emerald-600 flex items-center text-sm font-semibold">
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path></svg>
                Government Identity Verified
              </div>
            ) : (
              <button
                onClick={handleVerifyIdentity}
                disabled={loading || idNumber.length < 11}
                className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? 'Checking Registry...' : `Verify ${idType}`}
              </button>
            )}
          </div>
        );
      case 4:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900">Step 4: Live Biometric Face Capture</h3>

            {status.faceVerified ? (
              <div className="bg-emerald-50 border border-emerald-200 p-6 rounded-xl text-center space-y-3">
                <div className="flex justify-center">
                  <VerifiedFacePhoto size="h-16 w-16" />
                </div>
                <h4 className="font-bold text-emerald-900 text-base">Facial Liveness Check Passed!</h4>
                <p className="text-xs text-emerald-700 max-w-md mx-auto">
                  Your facial biometric verification is complete and securely recorded in the platform audit trail. You are now authorized to register verified companies and publish verifiable job ads.
                </p>
                <div className="pt-2 flex justify-center gap-3">
                  <Link to="/companies/new" className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700">
                    Register Your Company
                  </Link>
                  <Link to="/dashboard" className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50">
                    Dashboard
                  </Link>
                </div>
              </div>
            ) : (
              <DiditFaceVerification onComplete={handleFaceVerified} />
            )}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Recruiter Verification Wizard</h1>

        <VerificationProgress {...status} />

        {errorMsg && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm" role="alert">
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-md text-sm" role="status">
            {successMsg}
          </div>
        )}

        <div className="mt-8 bg-gray-50 p-6 rounded-lg border border-gray-100 min-h-[300px]">
          {renderStepContent()}
        </div>

        <div className="mt-6 flex justify-between">
          <button
            onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))}
            disabled={currentStep === 1}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            onClick={() => setCurrentStep(prev => Math.min(4, prev + 1))}
            disabled={currentStep === 4 || (currentStep === 1 && !status.emailVerified) || (currentStep === 2 && !status.phoneVerified) || (currentStep === 3 && !status.identityVerified)}
            className="px-4 py-2 bg-indigo-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default VerifyIdentity;
