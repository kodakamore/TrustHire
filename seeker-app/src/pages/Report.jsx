import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Flag, CheckCircle, ArrowLeft } from 'lucide-react';
import { submitReport } from '../services/api';

// Intake categories -> backend taxonomy. Severity is derived SERVER-SIDE
// from the category (high-severity auto-escalates to Admin review).
const CATEGORIES = [
  { value: 'detail_mismatch', label: 'Details do not match the verified advert' },
  { value: 'fee_requested', label: 'Looks like a scam / requests money' },
  { value: 'job_not_real', label: "Position doesn't actually exist" },
  { value: 'impersonation', label: 'Impersonating a real company' },
  { value: 'expired_or_revoked', label: 'Code is expired or was revoked' },
  { value: 'other', label: 'Other' },
];

export default function Report() {
  const { jobAdId } = useParams();
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const [formData, setFormData] = useState({
    jobReference: jobAdId || '',
    email: '',
    phone: '',
    reason: 'detail_mismatch',
    description: '',
  });

  // What the seeker SAW on the advert they are holding — the Admin compares
  // this side-by-side against TrustHire's verified snapshot.
  const [observed, setObserved] = useState({
    title: '',
    company: '',
    salary: '',
    url: '',
  });

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleObservedChange = (e) => {
    setObserved({ ...observed, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    try {
      const label = CATEGORIES.find((c) => c.value === formData.reason)?.label || formData.reason;
      const res = await submitReport({
        jobAdId: formData.jobReference,
        reporterEmail: formData.email || undefined,
        reporterPhone: formData.phone || undefined,
        category: formData.reason,
        reportReason: label,
        description: formData.description,
        observedContent: observed,
      });
      if (res?.success) setSubmitted(true);
      else setErrorMsg(res?.error || 'Could not submit your report. Please try again.');
    } catch (err) {
      setErrorMsg(
        err?.response?.data?.error ||
          'Could not submit your report. Please check your connection and try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-xl mx-auto mt-10">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-green-100 text-center">
          <div className="flex justify-center mb-6">
            <CheckCircle className="w-16 h-16 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Report Submitted</h2>
          <p className="text-gray-600 mb-8 text-lg">
            Thank you for your report. Our team will review it shortly to ensure the safety of all job seekers.
          </p>
          <Link
            to="/"
            className="inline-flex justify-center py-3 px-6 border border-transparent rounded-xl shadow-sm text-base font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
          >
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto pb-10">
      <div className="mb-6">
        <Link to={-1} className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Link>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="bg-red-50 p-6 border-b border-red-100 flex items-center gap-3">
          <Flag className="w-6 h-6 text-red-600" />
          <h2 className="text-xl font-bold text-red-900">Report Suspicious Job Ad</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Job Reference / PIN
            </label>
            <input
              type="text"
              name="jobReference"
              value={formData.jobReference}
              onChange={handleChange}
              readOnly={!!jobAdId}
              className={`block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 ${jobAdId ? 'bg-gray-50 text-gray-500' : ''}`}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Your Email <span className="text-gray-400 font-normal">(Optional)</span>
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Your Phone <span className="text-gray-400 font-normal">(Optional)</span>
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason for Reporting
            </label>
            <select
              name="reason"
              value={formData.reason}
              onChange={handleChange}
              className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 bg-white"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* What the seeker actually saw — powers the Admin side-by-side */}
          <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-4">
            <p className="text-sm font-semibold text-gray-700">
              What does the advert you're looking at say?{' '}
              <span className="font-normal text-gray-500">(as much as you can fill in)</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input
                type="text"
                name="title"
                value={observed.title}
                onChange={handleObservedChange}
                placeholder="Job title as advertised"
                className="block w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
              />
              <input
                type="text"
                name="company"
                value={observed.company}
                onChange={handleObservedChange}
                placeholder="Company name as advertised"
                className="block w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
              />
              <input
                type="text"
                name="salary"
                value={observed.salary}
                onChange={handleObservedChange}
                placeholder="Salary as advertised"
                className="block w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
              />
              <input
                type="text"
                name="url"
                value={observed.url}
                onChange={handleObservedChange}
                placeholder="Link / site where you saw it"
                className="block w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Additional Details <span className="text-red-500">*</span>
            </label>
            <textarea
              name="description"
              required
              rows={4}
              value={formData.description}
              onChange={handleChange}
              placeholder="Please explain why you are reporting this job advertisement..."
              className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 resize-none"
            />
          </div>

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-xl">
              {errorMsg}
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || !formData.description}
              className="w-full flex justify-center py-4 px-4 border border-transparent rounded-xl shadow-sm text-lg font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-red-300 transition-colors"
            >
              {loading ? 'Submitting...' : 'Submit Report'}
            </button>
            <p className="mt-4 text-xs text-center text-gray-500">
              Your report will be handled confidentially. We may contact you if we need more information.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
