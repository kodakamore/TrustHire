import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth } from '../../services/api';
import { Mail, CheckCircle2, ArrowRight, RefreshCw, KeyRound, ShieldCheck } from 'lucide-react';

const Register = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  // Post-registration email verification state
  const [awaitingVerification, setAwaitingVerification] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [emailOtp, setEmailOtp] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [otpSuccess, setOtpSuccess] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [debugOtp, setDebugOtp] = useState('');
  const [verificationLink, setVerificationLink] = useState('');

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (errors[e.target.name]) {
      setErrors({ ...errors, [e.target.name]: '' });
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.firstName) newErrors.firstName = 'First name is required';
    if (!formData.lastName) newErrors.lastName = 'Last name is required';
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }
    if (!formData.phone) {
      newErrors.phone = 'Phone is required';
    } else if (!/^\+?[\d\s-]{10,}$/.test(formData.phone)) {
      newErrors.phone = 'Phone is invalid';
    }
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    
    setIsLoading(true);
    setApiError('');
    try {
      const response = await auth.register(formData);
      if (response.data && response.data.success) {
        setRegisteredEmail(formData.email);
        setDebugOtp(response.data.data?.debugOtp || '');
        setVerificationLink(response.data.data?.verificationLink || '');
        setAwaitingVerification(true);
      } else {
        setApiError('Registration failed. Please try again.');
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Registration failed. Please check your details.';
      setApiError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!emailOtp || emailOtp.trim().length !== 6) {
      setOtpError('Please enter the 6-digit code sent to your email.');
      return;
    }

    setOtpLoading(true);
    setOtpError('');
    setOtpSuccess('');

    try {
      const res = await auth.verifyEmailOtp({
        email: registeredEmail,
        otp: emailOtp.trim(),
      });

      if (res.data?.success && res.data.data?.token) {
        localStorage.setItem('token', res.data.data.token);
        setOtpSuccess('Email verified successfully! Redirecting to identity onboarding...');
        setTimeout(() => {
          navigate('/recruiter/verify');
        }, 1200);
      } else {
        setOtpError(res.data?.error || 'Invalid code. Please check your email.');
      }
    } catch (err) {
      setOtpError(err.response?.data?.error || 'Invalid or expired code. Please try again.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setOtpError('');
    setOtpSuccess('');
    try {
      const res = await auth.resendVerification({ email: registeredEmail });
      setOtpSuccess(res.data?.message || 'New verification code and link sent to your email!');
      if (res.data?.debugOtp) setDebugOtp(res.data.debugOtp);
      setResendCooldown(60);
      const timer = setInterval(() => {
        setResendCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setOtpError(err.response?.data?.error || 'Failed to resend code. Please try again later.');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // STAGE 2: Check Email / OTP Verification Screen
  // ─────────────────────────────────────────────────────────────────────────────
  if (awaitingVerification) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shadow-inner">
              <Mail className="w-8 h-8" />
            </div>
          </div>
          <h2 className="mt-4 text-center text-2xl font-black text-gray-900 tracking-tight">
            Verify Your Email
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 max-w-sm mx-auto">
            We sent a verification link and a 6-digit confirmation code to:
          </p>
          <p className="mt-1 text-center font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 py-1 px-3 rounded-lg w-fit mx-auto text-sm">
            {registeredEmail}
          </p>
        </div>

        <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-6 shadow-xl rounded-2xl border border-gray-100 space-y-6 sm:px-10">
            {otpSuccess && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold p-3.5 rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>{otpSuccess}</span>
              </div>
            )}

            {otpError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3.5 rounded-xl">
                {otpError}
              </div>
            )}

            {/* Option 1: Enter 6-digit code */}
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-indigo-600" />
                  Enter 6-Digit Email Code
                </label>
                <input
                  type="text"
                  maxLength="6"
                  placeholder="123456"
                  value={emailOtp}
                  onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, ''))}
                  className="block w-full text-center text-2xl font-mono tracking-[0.4em] py-3 px-4 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={otpLoading || emailOtp.length !== 6}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-md text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition"
              >
                {otpLoading ? (
                  <span>Verifying Code...</span>
                ) : (
                  <>
                    <span>Confirm &amp; Continue Onboarding</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Option 2: Click link in email */}
            <div className="pt-2 border-t border-gray-100 text-center">
              <p className="text-xs text-gray-500 mb-2">
                Or click the direct activation button inside the email delivered to your inbox.
              </p>
              {verificationLink && (
                <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-left">
                  <p className="text-[11px] font-semibold text-gray-600 mb-1">Direct Verification Link (Dev Mode):</p>
                  <a
                    href={verificationLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-indigo-600 hover:text-indigo-800 underline break-all font-mono"
                  >
                    Open Verification Link &rarr;
                  </a>
                </div>
              )}
            </div>

            {/* Resend actions */}
            <div className="pt-2 flex items-center justify-between text-xs border-t border-gray-100">
              <span className="text-gray-500">Didn't receive the email?</span>
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0}
                className="font-bold text-indigo-600 hover:text-indigo-500 disabled:text-gray-400 flex items-center gap-1"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${resendCooldown > 0 ? 'animate-spin' : ''}`} />
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Email'}
              </button>
            </div>

            <div className="text-center pt-2">
              <Link
                to="/recruiter/login"
                className="text-xs font-semibold text-gray-500 hover:text-gray-700"
              >
                &larr; Return to Sign In
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STAGE 1: Standard Registration Form
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Create Recruiter Account
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Or{' '}
          <Link to="/recruiter/login" className="font-medium text-indigo-600 hover:text-indigo-500">
            sign in to your existing account
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl sm:rounded-2xl sm:px-10 border border-gray-100">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {apiError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm" role="alert">
                <span className="block sm:inline">{apiError}</span>
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">First Name</label>
                <div className="mt-1">
                  <input
                    name="firstName"
                    type="text"
                    value={formData.firstName}
                    onChange={handleChange}
                    className={`appearance-none block w-full px-3 py-2 border ${errors.firstName ? 'border-red-300' : 'border-gray-300'} rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm`}
                  />
                  {errors.firstName && <p className="mt-1 text-xs text-red-500">{errors.firstName}</p>}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Last Name</label>
                <div className="mt-1">
                  <input
                    name="lastName"
                    type="text"
                    value={formData.lastName}
                    onChange={handleChange}
                    className={`appearance-none block w-full px-3 py-2 border ${errors.lastName ? 'border-red-300' : 'border-gray-300'} rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm`}
                  />
                  {errors.lastName && <p className="mt-1 text-xs text-red-500">{errors.lastName}</p>}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Email address</label>
              <div className="mt-1">
                <input
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  className={`appearance-none block w-full px-3 py-2 border ${errors.email ? 'border-red-300' : 'border-gray-300'} rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm`}
                />
                {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
              </div>
              <p className="mt-1 text-[11px] text-gray-500">
                A verification link and 6-digit code will be sent to this email upon registration.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Phone Number</label>
              <div className="mt-1">
                <input
                  name="phone"
                  type="tel"
                  placeholder="e.g. 08012345678"
                  value={formData.phone}
                  onChange={handleChange}
                  className={`appearance-none block w-full px-3 py-2 border ${errors.phone ? 'border-red-300' : 'border-gray-300'} rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm`}
                />
                {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <div className="mt-1">
                <input
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={handleChange}
                  className={`appearance-none block w-full px-3 py-2 border ${errors.password ? 'border-red-300' : 'border-gray-300'} rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm`}
                />
                {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Confirm Password</label>
              <div className="mt-1">
                <input
                  name="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className={`appearance-none block w-full px-3 py-2 border ${errors.confirmPassword ? 'border-red-300' : 'border-gray-300'} rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm`}
                />
                {errors.confirmPassword && <p className="mt-1 text-xs text-red-500">{errors.confirmPassword}</p>}
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-md text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition"
              >
                {isLoading ? 'Creating account & sending email...' : 'Create Account'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Register;
