import React, { useEffect, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Loader, ShieldCheck, ArrowRight } from 'lucide-react';
import axios from 'axios';

const VerifyEmailToken = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError('No verification token provided in the link.');
      return;
    }

    const verifyToken = async () => {
      try {
        setLoading(true);
        const res = await axios.post('/api/auth/verify-email', { token });
        if (res.data?.success) {
          if (res.data.data?.token) {
            localStorage.setItem('token', res.data.data.token);
          }
          setSuccess(true);
          setMessage(res.data.message || 'Email verified successfully!');
        } else {
          setError(res.data?.error || 'Failed to verify email.');
        }
      } catch (err) {
        setError(err.response?.data?.error || 'Verification link is invalid or has expired.');
      } finally {
        setLoading(false);
      }
    };

    verifyToken();
  }, [token]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-gray-100 p-8 text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center bg-indigo-50 text-indigo-600">
            <ShieldCheck size={36} />
          </div>
        </div>

        {loading && (
          <div className="space-y-4 py-4">
            <Loader className="animate-spin text-indigo-600 mx-auto" size={36} />
            <h2 className="text-xl font-bold text-gray-900">Verifying Your Email...</h2>
            <p className="text-sm text-gray-500">Please hold on while we confirm your email ownership.</p>
          </div>
        )}

        {!loading && success && (
          <div className="space-y-4 py-2">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle size={28} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Email Verified!</h2>
            <p className="text-sm text-gray-600">{message}</p>
            <div className="pt-4">
              <Link
                to="/recruiter/verify"
                className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 text-white font-semibold py-3 px-6 rounded-xl hover:bg-indigo-700 transition"
              >
                <span>Continue to Verification</span>
                <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="space-y-4 py-2">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <XCircle size={28} />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Verification Failed</h2>
            <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-200">{error}</p>
            <div className="pt-4 space-y-2">
              <Link
                to="/recruiter/login"
                className="w-full inline-block bg-indigo-600 text-white font-semibold py-2.5 px-6 rounded-xl hover:bg-indigo-700 transition"
              >
                Log In to Your Account
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VerifyEmailToken;
