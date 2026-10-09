import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { auth } from '../services/api';

// ===========================================================================
// Email activation page — closes the registration loop:
//   register -> /verify-email (link token auto-verifies, or enter 6-digit
//   code) -> session issued -> onboarding at /verify-identity.
//
// Token sources:
//   1. ?token=... query param (the emailed activation link)
//   2. router state from the register response (development only — the
//      backend includes verificationLink when NODE_ENV !== production, which
//      lets the flow complete in-app even when the email channel is down)
// ===========================================================================

const VerifyEmail = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const state = location.state || {};

  const [email, setEmail] = useState(state.email || '');
  const [otp, setOtp] = useState('');
  const [debugOtp, setDebugOtp] = useState(state.debugOtp || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(state.message || '');
  const autoRan = useRef(false);

  const finish = (sessionToken) => {
    if (sessionToken) localStorage.setItem('token', sessionToken);
    navigate('/verify-identity', { replace: true });
  };

  const goToLogin = (msg) => {
    navigate('/login', { state: { notice: msg }, replace: true });
  };

  // Auto-verify on arrival with a token (emailed link or carried state).
  useEffect(() => {
    if (autoRan.current) return;
    const queryToken = searchParams.get('token');
    let linkToken = null;
    if (!queryToken && state.verificationLink) {
      try {
        linkToken = new URL(state.verificationLink).searchParams.get('token');
      } catch {
        linkToken = null; // malformed link -> fall through to manual form
      }
    }
    const token = queryToken || linkToken;
    if (!token) return;
    autoRan.current = true;
    (async () => {
      setBusy(true);
      setError('');
      try {
        const res = await auth.verifyEmailToken({ token });
        if (res.data?.alreadyVerified) {
          goToLogin(res.data.message);
        } else {
          finish(res.data?.data?.token);
        }
      } catch (err) {
        setError(err.response?.data?.error || 'Verification link is invalid or has expired.');
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitOtp = async (e) => {
    e.preventDefault();
    if (!email || !otp) {
      setError('Email and 6-digit verification code are required.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await auth.verifyEmailOtp({ email, otp: otp.trim() });
      if (res.data?.alreadyVerified) {
        goToLogin(res.data.message);
      } else {
        finish(res.data?.data?.token);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid verification code.');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!email) {
      setError('Enter your email address first, then request a new code.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await auth.resendVerification({ email });
      setNotice(res.data?.message || 'A new verification code has been sent.');
      if (res.data?.debugOtp) setDebugOtp(res.data.debugOtp);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not resend the code. Try again shortly.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Verify your email
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Enter the 6-digit code we sent to your inbox, or open the activation
          link from your email.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form className="space-y-6" onSubmit={submitOtp}>
            {notice && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded relative" role="status">
                <span className="block sm:inline">{notice}</span>
              </div>
            )}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative" role="alert">
                <span className="block sm:inline">{error}</span>
              </div>
            )}
            {busy && (
              <div className="bg-indigo-50 border border-indigo-200 text-indigo-700 px-4 py-3 rounded relative" role="status">
                <span className="block sm:inline">Verifying…</span>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="otp" className="block text-sm font-medium text-gray-700">
                6-digit verification code
              </label>
              <div className="mt-1">
                <input
                  id="otp"
                  name="otp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm tracking-widest text-center"
                  placeholder="000000"
                />
              </div>
            </div>

            {debugOtp && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded text-sm">
                Development server code:{' '}
                <button
                  type="button"
                  className="font-mono font-bold underline"
                  onClick={() => setOtp(debugOtp)}
                >
                  {debugOtp}
                </button>{' '}
                <span className="text-amber-600">(click to fill)</span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={resend}
                disabled={busy}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-500 disabled:opacity-50"
              >
                Resend code
              </button>
              <Link to="/login" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
                Back to sign in
              </Link>
            </div>

            <div>
              <button
                type="submit"
                disabled={busy}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {busy ? 'Verifying…' : 'Verify email'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;
