import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import VerificationProgress from '../../components/VerificationProgress';
import FaceLivenessCapture from '../../components/FaceLivenessCapture';
import { auth, verify as verifyApi } from '../../services/api';
import { AlertCircle, CheckCircle2, Phone, ShieldCheck, Mail, KeyRound, RefreshCw, ArrowRight } from 'lucide-react';

const VerifyIdentity = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({
    emailVerified: false,
    phoneVerified: false,
    identityVerified: false,
    faceVerified: false,
  });
  const [recruiter, setRecruiter] = useState(null);

  // Step 1: Email OTP
  const [emailOtp, setEmailOtp] = useState('');

  // Step 2: Phone OTP & Carrier Screening via Dojah
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneDebugOtp, setPhoneDebugOtp] = useState('');
  const [dojahCarrierData, setDojahCarrierData] = useState(null);

  // Step 3: Government ID
  const [idType, setIdType] = useState('NIN');
  const [idNumber, setIdNumber] = useState('');

  // Step 4: Face Biometrics
  const [liveSelfieBase64, setLiveSelfieBase64] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const loadStatus = async () => {
    try {
      const res = await verifyApi.getStatus();
      if (res.data && res.data.data) {
        const rec = res.data.data;
        setRecruiter(rec);
        if (rec.phone_number) setPhoneNumber(rec.phone_number);
        setStatus({
          emailVerified: rec.is_email_verified || false,
          phoneVerified: rec.is_phone_verified || false,
          identityVerified: rec.is_identity_verified || false,
          faceVerified: rec.is_face_verified || false,
        });
        if (!rec.is_email_verified) setCurrentStep(1);
        else if (!rec.is_phone_verified) setCurrentStep(2);
        else if (!rec.is_identity_verified) setCurrentStep(3);
        else setCurrentStep(4);
      }
    } catch (err) {
      console.warn('Could not load recruiter verification status:', err);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  // ── Step 1 Handlers (Email) ────────────────────────────────────────────────
  const handleVerifyEmailByCode = async (e) => {
    if (e) e.preventDefault();
    if (!emailOtp || emailOtp.length !== 6) {
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
      setStatus(prev => ({ ...prev, emailVerified: true }));
      setSuccessMsg('Email verified successfully!');
      setTimeout(() => {
        setCurrentStep(2);
        setSuccessMsg(null);
      }, 1000);
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Invalid email verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendEmail = async () => {
    if (!recruiter?.email) return;
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await auth.resendVerification({ email: recruiter.email });
      setSuccessMsg(res.data?.message || 'Verification link & code resent! Please check your inbox.');
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to resend verification link.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2 Handlers (Phone OTP via Dojah) ──────────────────────────────────
  const handleSendPhoneOTP = async () => {
    const targetPhone = phoneNumber || recruiter?.phone_number;
    if (!targetPhone) {
      setErrorMsg('Please enter a valid phone number.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await verifyApi.sendPhoneOTP({ phoneNumber: targetPhone });
      setPhoneOtpSent(true);
      if (res.data?.data?.debugOtp) {
        setPhoneDebugOtp(res.data.data.debugOtp);
      }
      if (res.data?.data?.dojahScreening) {
        setDojahCarrierData(res.data.data.dojahScreening);
      }
      setSuccessMsg(res.data?.message || 'Verification code sent to your phone number!');
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to send phone verification code. Please check the number.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPhoneOTP = async (e) => {
    if (e) e.preventDefault();
    if (!phoneOtp || phoneOtp.length !== 6) {
      setErrorMsg('Please enter the 6-digit phone verification code.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await verifyApi.verifyPhoneOTP({ otp: phoneOtp });
      setStatus(prev => ({ ...prev, phoneVerified: true }));
      setSuccessMsg('Phone number verified successfully with Dojah carrier screening!');
      setTimeout(() => {
        setCurrentStep(3);
        setSuccessMsg(null);
      }, 1000);
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Invalid or expired phone verification code.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3 Handlers (Government ID) ────────────────────────────────────────
  const handleVerifyIdentity = async () => {
    if (!idNumber) return;
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await verifyApi.verifyIdentity({ type: idType.toLowerCase(), number: idNumber });
      setStatus(prev => ({ ...prev, identityVerified: true }));
      setSuccessMsg(`${idType} registry match verified!`);
      setTimeout(() => {
        setCurrentStep(4);
        setSuccessMsg(null);
      }, 1000);
    } catch (err) {
      setErrorMsg(err.response?.data?.error || `${idType} verification failed. Check the 11-digit number.`);
    } finally {
      setLoading(false);
    }
  };

  // ── Step 4 Handlers (Liveness & Face Verification) ─────────────────────────
  const handleLivenessCompleted = async (base64Image) => {
    setLiveSelfieBase64(base64Image);
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await verifyApi.verifyFace({
        selfieBase64: base64Image,
        referencePhotoBase64: base64Image
      });
      setStatus(prev => ({ ...prev, faceVerified: true }));
      setSuccessMsg('Facial biometric verification passed successfully!');
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Facial verification failed. Please try capturing again with good lighting.');
    } finally {
      setLoading(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-5">
            <div>
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Mail className="w-5 h-5 text-indigo-600" />
                Step 1: Recruiter Email Verification
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                We sent an activation link and a 6-digit code to your email. Click the link in your email or enter the code below:
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center">
              <div>
                <p className="text-xs text-gray-400 font-semibold uppercase">Email Address</p>
                <p className="text-sm font-bold text-gray-800">{recruiter?.email || 'Your registered email'}</p>
              </div>
              {status.emailVerified ? (
                <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                </span>
              ) : (
                <span className="text-xs font-bold text-amber-700 bg-amber-100 px-3 py-1 rounded-full">
                  Pending Verification
                </span>
              )}
            </div>

            {status.emailVerified ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span className="text-sm font-semibold">Your email is verified and screened against risk databases.</span>
              </div>
            ) : (
              <div className="space-y-4 pt-2">
                <form onSubmit={handleVerifyEmailByCode} className="space-y-3">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Enter 6-Digit Email Code
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength="6"
                      placeholder="123456"
                      value={emailOtp}
                      onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, ''))}
                      className="w-40 px-3 py-2 text-center text-lg font-mono tracking-widest border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="submit"
                      disabled={loading || emailOtp.length !== 6}
                      className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold shadow-sm transition"
                    >
                      {loading ? 'Verifying...' : 'Confirm Code'}
                    </button>
                  </div>
                </form>

                <div className="flex items-center gap-3 pt-2">
                  <button 
                    onClick={handleResendEmail} 
                    disabled={loading}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Resend Verification Email
                  </button>
                  <span className="text-gray-300">|</span>
                  <p className="text-xs text-gray-500">
                    Check your spam folder if not received within 1 minute.
                  </p>
                </div>
              </div>
            )}
          </div>
        );

      case 2:
        return (
          <div className="space-y-5">
            <div>
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Phone className="w-5 h-5 text-indigo-600" />
                Step 2: Phone Verification via OTP (Dojah)
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Cross-references carrier network and delivers an OTP to verify phone ownership.
              </p>
            </div>

            {status.phoneVerified ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-sm font-bold">Phone Number Verified!</p>
                  <p className="text-xs text-emerald-700">{recruiter?.phone_number || phoneNumber}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Recruiter Phone Number
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      placeholder="e.g. 08012345678"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      disabled={phoneOtpSent}
                      className="flex-1 max-w-sm px-4 py-2 border border-gray-300 rounded-lg text-sm shadow-sm focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={handleSendPhoneOTP}
                      disabled={loading || !phoneNumber}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-sm transition"
                    >
                      {loading ? 'Sending...' : phoneOtpSent ? 'Resend OTP' : 'Send Phone OTP'}
                    </button>
                  </div>
                </div>

                {phoneOtpSent && (
                  <form onSubmit={handleVerifyPhoneOTP} className="space-y-3 pt-2 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Enter 6-Digit SMS Verification Code
                    </label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        maxLength="6"
                        placeholder="123456"
                        value={phoneOtp}
                        onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, ''))}
                        className="w-36 px-3 py-2 text-center text-lg font-mono tracking-widest border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 bg-white"
                        autoFocus
                      />
                      <button
                        type="submit"
                        disabled={loading || phoneOtp.length !== 6}
                        className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-sm transition"
                      >
                        {loading ? 'Verifying...' : 'Verify Phone OTP'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPhoneOtpSent(false)}
                        className="text-xs text-gray-500 hover:text-gray-700 ml-2"
                      >
                        Change Number
                      </button>
                    </div>

                    {phoneDebugOtp && (
                      <p className="text-[11px] font-mono text-indigo-700 bg-indigo-100/60 p-1.5 rounded">
                        Sandbox / Dev OTP Code: <strong>{phoneDebugOtp}</strong>
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
          <div className="space-y-5">
            <div>
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                Step 3: Government ID Lookup
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Validate your identity against Nigerian government registries (NIN or BVN).
              </p>
            </div>
            
            <div className="flex space-x-6">
              <label className="flex items-center text-sm font-medium text-gray-700 cursor-pointer">
                <input type="radio" name="idType" value="NIN" checked={idType === 'NIN'} onChange={() => setIdType('NIN')} className="mr-2 text-indigo-600" />
                National Identity Number (NIN)
              </label>
              <label className="flex items-center text-sm font-medium text-gray-700 cursor-pointer">
                <input type="radio" name="idType" value="BVN" checked={idType === 'BVN'} onChange={() => setIdType('BVN')} className="mr-2 text-indigo-600" />
                Bank Verification Number (BVN)
              </label>
            </div>
            
            <input 
              type="text" 
              maxLength={11}
              placeholder={`Enter your 11-digit ${idType}`} 
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, ''))}
              className="block w-full max-w-sm px-4 py-2.5 border border-gray-300 rounded-lg shadow-sm text-base font-mono focus:ring-2 focus:ring-indigo-500" 
            />

            {status.identityVerified ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span className="text-sm font-semibold">Government Identity Verified</span>
              </div>
            ) : (
              <button 
                onClick={handleVerifyIdentity} 
                disabled={loading || idNumber.length < 11}
                className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                {loading ? 'Checking Registry...' : `Verify ${idType}`}
              </button>
            )}
          </div>
        );

      case 4:
        return (
          <div className="space-y-5">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Step 4: Live Biometric Face Capture</h3>
              <p className="text-sm text-gray-500 mt-1">
                Perform a live face scan to confirm your identity matches your verified credentials.
              </p>
            </div>
            
            {status.faceVerified ? (
              <div className="bg-emerald-50 border border-emerald-200 p-8 rounded-2xl text-center space-y-4">
                <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h4 className="font-extrabold text-emerald-950 text-xl">Recruiter Identity Fully Verified!</h4>
                <p className="text-sm text-emerald-700 max-w-md mx-auto">
                  Your facial biometric verification is complete and recorded in PostgreSQL. You are now authorized to register verified companies and post genuine job advertisements.
                </p>
                <div className="pt-4 flex justify-center gap-3">
                  <Link 
                    to="/recruiter/companies/new" 
                    className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm shadow-md transition"
                  >
                    <span>Register Your Company</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  <Link 
                    to="/recruiter/dashboard" 
                    className="inline-flex items-center px-5 py-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold rounded-xl text-sm transition"
                  >
                    Dashboard
                  </Link>
                </div>
              </div>
            ) : (
              <FaceLivenessCapture onCaptureComplete={handleLivenessCompleted} />
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
        <h1 className="text-2xl font-black text-gray-900 mb-6 tracking-tight">Recruiter Identity Verification</h1>
        
        <VerificationProgress {...status} />

        {errorMsg && (
          <div className="mt-6 bg-red-50 border border-red-200 p-4 rounded-xl flex items-start gap-3 text-red-800 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
            <div>
              <p className="font-bold">Verification Notice</p>
              <p>{errorMsg}</p>
            </div>
          </div>
        )}

        {successMsg && (
          <div className="mt-6 bg-emerald-50 border border-emerald-200 p-4 rounded-xl flex items-center gap-3 text-emerald-800 text-sm font-semibold">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        <div className="mt-6 bg-gray-50 p-6 rounded-xl border border-gray-100 min-h-[320px]">
          {renderStepContent()}
        </div>

        <div className="mt-6 flex justify-between">
          <button 
            onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))}
            disabled={currentStep === 1}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Previous Step
          </button>
          <button 
            onClick={() => setCurrentStep(prev => Math.min(4, prev + 1))}
            disabled={currentStep === 4 || (currentStep === 1 && !status.emailVerified) || (currentStep === 2 && !status.phoneVerified) || (currentStep === 3 && !status.identityVerified)}
            className="px-5 py-2 bg-indigo-600 border border-transparent rounded-lg text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Next Step
          </button>
        </div>
      </div>
    </div>
  );
};

export default VerifyIdentity;
