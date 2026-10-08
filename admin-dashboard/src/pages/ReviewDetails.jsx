import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, AlertTriangle, Shield, Building, User, FileText, Globe, ArrowLeft, Check, RefreshCw, KeyRound } from 'lucide-react';
import adminApi from '../services/api';
import ConfirmModal from '../components/ConfirmModal';

const humanize = (s) =>
  String(s || '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

const errMessage = (err) =>
  err?.response?.data?.error ||
  err?.response?.data?.message ||
  'Something went wrong. Please try again.';

const CheckRow = ({ label, ok }) => (
  <div className="flex items-center justify-between">
    <span className="text-sm text-gray-600">{label}</span>
    {ok ? <CheckCircle className="text-green-500" size={18} /> : <XCircle className="text-red-500" size={18} />}
  </div>
);

const CheckList = ({ title, checks }) => (
  <div className="mt-4 pt-4 border-t border-gray-100">
    <h3 className="text-sm font-medium text-gray-900 mb-3">{title}</h3>
    {checks && checks.length > 0 ? (
      <ul className="space-y-2">
        {checks.map((check, idx) => (
          <li key={`${check.check_type}-${idx}`} className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-gray-800">{humanize(check.check_type)}</p>
              <p className="text-xs text-gray-400">
                {check.created_at ? new Date(check.created_at).toLocaleString() : ''}
              </p>
            </div>
            {check.is_successful
              ? <CheckCircle className="text-green-500 shrink-0" size={16} />
              : <XCircle className="text-red-500 shrink-0" size={16} />}
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-sm text-gray-500">No checks recorded.</p>
    )}
  </div>
);

const ReviewDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approvalResult, setApprovalResult] = useState(null);

  const loadDetails = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await adminApi.getQueueItem(id);
      setData(res?.data || null);
    } catch (err) {
      setLoadError(errMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  const handleApprove = async () => {
    setShowApproveModal(false);
    setActionBusy(true);
    setActionError('');
    try {
      const res = await adminApi.approveJob(id);
      // Approval generates the QR/PIN — surface it before leaving the page.
      setApprovalResult(res?.data || null);
    } catch (err) {
      setActionError(errMessage(err));
    } finally {
      setActionBusy(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      setActionError('Please provide a rejection reason.');
      return;
    }
    setActionBusy(true);
    setActionError('');
    try {
      await adminApi.rejectJob(id, rejectReason.trim());
      navigate('/queue');
    } catch (err) {
      setActionError(errMessage(err));
      setActionBusy(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading job details...</div>;
  }

  if (loadError || !data) {
    return (
      <div className="p-8 text-center">
        <AlertTriangle className="mx-auto text-red-500 mb-3" size={32} />
        <p className="text-sm text-red-600 mb-4">{loadError || 'Job not found.'}</p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => navigate('/queue')}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back to queue
          </button>
          <button
            onClick={loadDetails}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw size={16} /> Retry
          </button>
        </div>
      </div>
    );
  }

  const job = data;
  const recruiter = job.recruiter || null;
  const company = job.company || null;
  const flags = Array.isArray(job.flags) ? job.flags : [];
  const isPending = job.status === 'pending';

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/queue')} className="p-2 bg-white border border-gray-200 rounded-md hover:bg-gray-50 text-gray-600">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Review Application</h1>
          <p className="text-sm text-gray-500">
            Job ID: {id} · Status: <span className={`font-medium ${isPending ? 'text-amber-600' : 'text-gray-700'}`}>{humanize(job.status)}</span>
          </p>
        </div>
      </div>

      {actionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-md">
          {actionError}
        </div>
      )}

      {flags.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-red-200 overflow-hidden">
          <div className="bg-red-50 px-6 py-4 border-b border-red-100 flex items-center gap-3">
            <AlertTriangle className="text-red-600" size={24} />
            <h2 className="text-lg font-semibold text-red-800">System Flags ({flags.length})</h2>
          </div>
          <div className="p-6">
            <ul className="space-y-3">
              {flags.map((flag, idx) => {
                const type = typeof flag === 'string' ? flag : (flag?.type || 'flag');
                const reason = typeof flag === 'string' ? null : (flag?.reason || null);
                const when = typeof flag === 'object' ? (flag.rejectedAt || flag.revokedAt || flag.resolvedAt || flag.createdAt) : null;
                const critical = type.includes('rejection') || type.includes('revocation') || type.includes('admin');
                return (
                  <li key={`${type}-${idx}`} className="flex items-start gap-3">
                    <span className={`mt-0.5 w-2 h-2 rounded-full ${critical ? 'bg-red-600' : 'bg-amber-500'}`}></span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{reason || humanize(type)}</p>
                      <p className="text-xs text-gray-500 font-mono mt-0.5">
                        {humanize(type)}{when ? ` · ${new Date(when).toLocaleString()}` : ''}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recruiter Info */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3 bg-gray-50">
            <User className="text-gray-500" size={20} />
            <h2 className="text-lg font-semibold text-gray-900">Recruiter Information</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Name</p>
                <p className="font-medium">
                  {[recruiter?.first_name, recruiter?.last_name].filter(Boolean).join(' ') || '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Phone</p>
                <p className="font-medium">{recruiter?.phone_number || '—'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-gray-500 uppercase tracking-wider">Email</p>
                <p className="font-medium">{recruiter?.email || '—'}</p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Account Status</h3>
              <div className="flex flex-wrap gap-2">
                <span className={`text-xs px-2 py-1 rounded ${recruiter?.account_status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  Account: {humanize(recruiter?.account_status || 'unknown')}
                </span>
                <span className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-700">
                  Verification: {humanize(recruiter?.verification_status || 'unknown')}
                </span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Verification Status</h3>
              <div className="space-y-2">
                <CheckRow label="Email verified" ok={!!recruiter?.is_email_verified} />
                <CheckRow label="Phone verified" ok={!!recruiter?.is_phone_verified} />
                <CheckRow label="Identity verified" ok={!!recruiter?.is_identity_verified} />
                <CheckRow label="Face verified" ok={!!recruiter?.is_face_verified} />
              </div>
            </div>

            <CheckList title="Recorded checks" checks={job.recruiterChecks} />
          </div>
        </div>

        {/* Company Info */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3 bg-gray-50">
            <Building className="text-gray-500" size={20} />
            <h2 className="text-lg font-semibold text-gray-900">Company Information</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <p className="text-xs text-gray-500 uppercase tracking-wider">Company Name</p>
                <p className="font-medium">{company?.name || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">RC Number</p>
                <p className="font-medium">{company?.registration_number || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">TIN</p>
                <p className="font-medium">{company?.tin_number || '—'}</p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                <Shield size={16} className="text-blue-500" /> CAC Verification
              </h3>
              <div className="bg-blue-50 p-3 rounded-md space-y-2">
                <p className="text-sm">
                  <span className="text-gray-500">Status:</span>{' '}
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${company?.is_cac_verified ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                    {company?.is_cac_verified ? 'Verified' : 'Not verified'}
                  </span>
                </p>
                <p className="text-sm"><span className="text-gray-500">Verification status:</span> <span className="font-medium">{humanize(company?.verification_status || 'unknown')}</span></p>
                <p className="text-sm"><span className="text-gray-500">Linkage:</span> <span className="font-medium">{humanize(company?.linkage_type || 'unknown')}</span></p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                <Globe size={16} className="text-purple-500" /> Domain Verification
              </h3>
              <div className="space-y-2">
                <p className="text-sm">
                  <span className="text-gray-500">Website:</span>{' '}
                  {company?.website_url ? (
                    <a href={company.website_url} className="text-blue-600 hover:underline break-all" target="_blank" rel="noreferrer">{company.website_url}</a>
                  ) : '—'}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Domain:</span>
                  {company?.is_domain_verified
                    ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Verified</span>
                    : <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">Not verified</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Corporate email:</span>
                  {company?.is_corporate_email_verified
                    ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Verified</span>
                    : <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">Not verified</span>}
                </div>
              </div>
            </div>

            <CheckList title="Recorded checks" checks={job.companyChecks} />
          </div>
        </div>
      </div>

      {/* Job Details */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3 bg-gray-50">
          <FileText className="text-gray-500" size={20} />
          <h2 className="text-lg font-semibold text-gray-900">Job Advertisement</h2>
        </div>
        <div className="p-6">
          <div className="mb-6">
            <h3 className="text-xl font-bold text-gray-900">{job.title}</h3>
            <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-600">
              <span className="flex items-center gap-1"><span className="font-medium text-gray-700">Type:</span> {humanize(job.employment_type) || '—'}</span>
              <span className="flex items-center gap-1"><span className="font-medium text-gray-700">Location:</span> {job.location || '—'}</span>
              <span className="flex items-center gap-1"><span className="font-medium text-gray-700">Salary:</span> {job.salary_range || '—'}</span>
              {job.deadline && (
                <span className="flex items-center gap-1"><span className="font-medium text-gray-700">Deadline:</span> {new Date(job.deadline).toLocaleDateString()}</span>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-2 uppercase tracking-wider">Description</h4>
              <p className="text-gray-700 text-sm whitespace-pre-line">{job.description || '—'}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-2 uppercase tracking-wider">Requirements</h4>
                <p className="text-gray-700 text-sm whitespace-pre-line">{job.requirements || '—'}</p>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-2 uppercase tracking-wider">Benefits</h4>
                <p className="text-gray-700 text-sm whitespace-pre-line">{job.benefits || '—'}</p>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100">
              <h4 className="text-sm font-semibold text-gray-900 mb-2 uppercase tracking-wider">Application Method</h4>
              <p className="text-sm text-blue-600 break-all">{job.application_url || '—'}</p>
              {job.application_email && (
                <p className="text-sm text-blue-600 break-all">{job.application_email}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Action Bar - Fixed at bottom */}
      <div className="fixed bottom-0 left-64 right-0 bg-white border-t border-gray-200 p-4 px-8 flex justify-end gap-4 shadow-lg z-10">
        <button
          onClick={() => setShowRejectModal(true)}
          disabled={!isPending || actionBusy}
          className="px-6 py-2.5 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <XCircle size={20} /> Reject Advertisement
        </button>
        <button
          onClick={() => setShowApproveModal(true)}
          disabled={!isPending || actionBusy}
          className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Check size={20} /> {actionBusy ? 'Working…' : 'Approve & Verify'}
        </button>
      </div>

      {/* Approve Modal */}
      <ConfirmModal
        isOpen={showApproveModal}
        title="Approve Job Advertisement"
        message="Are you sure you want to approve this job? It will be marked as 'Verified' on the platform and a QR/PIN verification code will be generated."
        confirmText="Yes, Approve"
        variant="success"
        onConfirm={handleApprove}
        onCancel={() => setShowApproveModal(false)}
      />

      {/* Approval success modal (shows generated QR/PIN) */}
      {approvalResult && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-500 bg-opacity-75 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                <CheckCircle size={22} />
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900">Job approved</h3>
                <p className="text-sm text-gray-500">{approvalResult.message || 'Verification code generated.'}</p>
              </div>
            </div>
            <div className="bg-slate-50 border border-gray-200 rounded-md p-4 space-y-3">
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wider flex items-center gap-1"><KeyRound size={12} /> PIN</p>
                <p className="font-mono text-lg font-bold text-gray-900">{approvalResult.pin || '—'}</p>
              </div>
              {approvalResult.qrCodeUrl && (
                <div>
                  <p className="text-[11px] text-gray-500 uppercase tracking-wider">QR link</p>
                  <a href={approvalResult.qrCodeUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline break-all">
                    {approvalResult.qrCodeUrl}
                  </a>
                </div>
              )}
              {approvalResult.expiresAt && (
                <div>
                  <p className="text-[11px] text-gray-500 uppercase tracking-wider">Expires</p>
                  <p className="text-sm text-gray-900">{new Date(approvalResult.expiresAt).toLocaleString()}</p>
                </div>
              )}
            </div>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => navigate('/queue')}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 font-medium"
              >
                Back to queue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-500 bg-opacity-75 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Reject Job Advertisement</h3>
            <p className="text-sm text-gray-500 mb-4">Please provide a reason for rejecting this job. This will be sent to the recruiter.</p>
            <textarea
              className="w-full border border-gray-300 rounded-md p-3 text-sm focus:ring-red-500 focus:border-red-500 mb-4"
              rows={4}
              placeholder="e.g. The company information provided could not be verified..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            ></textarea>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 font-medium"
              >
                Cancel
              </button>
              <button 
                onClick={handleReject}
                disabled={actionBusy}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 font-medium disabled:opacity-60"
              >
                {actionBusy ? 'Rejecting…' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewDetails;
