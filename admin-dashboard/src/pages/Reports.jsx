import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Flag, Eye, CheckCircle, Ban, Search, ShieldCheck, Database, AlertTriangle,
  XCircle, PlayCircle, ArrowUpCircle, FileSearch, Lock, RefreshCw, UserX, KeyRound,
} from 'lucide-react';
import adminApi from '../services/api';
import ConfirmModal from '../components/ConfirmModal';
import { isSuperAdmin } from '../utils/auth';

/* ------------------------------------------------------------------ */
/* Human-readable labels (never show raw snake_case to users)          */
/* ------------------------------------------------------------------ */

const STATUS_LABELS = {
  open: 'Open',
  under_review: 'Under Review',
  escalated: 'Escalated',
  resolved: 'Resolved',
  closed: 'Closed',
};

const SEVERITY_LABELS = { high: 'High', medium: 'Medium', low: 'Low' };

const CATEGORY_LABELS = {
  detail_mismatch: 'Details differ from the advert',
  fee_requested: 'Recruiter asked for money',
  job_not_real: 'Job does not exist',
  impersonation: 'Impersonation',
  expired_or_revoked: 'Expired or revoked advert',
  other: 'Other',
};

const FINDING_OPTIONS = [
  { value: 'recruiter_misrepresentation', label: 'Recruiter misrepresentation' },
  { value: 'content_drift', label: 'Content drift after approval' },
  { value: 'credential_misuse', label: 'QR-PIN misuse (reissue)' },
  { value: 'impersonation', label: 'Impersonation–fake advert' },
  { value: 'not_substantiated', label: 'Not substantiated' },
];
const findingLabel = (f) => FINDING_OPTIONS.find(o => o.value === f)?.label || '—';

const RESOLUTION_OPTIONS = [
  { value: 'no_action', label: 'No action needed' },
  { value: 'warning_issued', label: 'Warning issued to recruiter' },
  { value: 'correction_requested', label: 'Correction requested' },
  { value: 'revoke_verification', label: 'Revoke advert verification' },
  { value: 'compromise_reissue', label: 'Compromise QR/PIN & reissue' },
  { value: 'account_sanction', label: 'Sanction recruiter account', superAdminOnly: true },
];
const resolutionLabel = (a) => RESOLUTION_OPTIONS.find(o => o.value === a)?.label || '—';

const CODE_STATUS_LABELS = {
  active: 'Active',
  expired: 'Expired',
  deactivated: 'Deactivated',
  revoked: 'Revoked',
  compromised: 'Compromised',
};

const JOB_STATUS_LABELS = {
  pending: 'Pending review',
  approved: 'Approved',
  active: 'Active',
  rejected: 'Rejected',
  revoked: 'Revoked',
  closed: 'Closed',
};

const humanize = (s) =>
  String(s || '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

const parseMaybeJson = (value) => {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
};

const formatDate = (v) => (v ? new Date(v).toLocaleString() : '—');

const errMessage = (err) =>
  err?.response?.data?.error ||
  err?.response?.data?.message ||
  'Something went wrong. Please try again.';

/* ------------------------------------------------------------------ */
/* Chips                                                               */
/* ------------------------------------------------------------------ */

const SeverityChip = ({ severity }) => {
  const styles = {
    high: 'bg-red-100 text-red-800 border-red-200',
    medium: 'bg-amber-100 text-amber-800 border-amber-200',
    low: 'bg-gray-100 text-gray-700 border-gray-200',
  };
  const s = severity || 'low';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[s] || styles.low}`}>
      {SEVERITY_LABELS[s] || humanize(s)}
    </span>
  );
};

const StatusChip = ({ status }) => {
  const styles = {
    open: 'bg-blue-100 text-blue-800',
    under_review: 'bg-amber-100 text-amber-800',
    escalated: 'bg-purple-100 text-purple-800',
    resolved: 'bg-green-100 text-green-800',
    closed: 'bg-gray-200 text-gray-700',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-700'}`}>
      {STATUS_LABELS[status] || humanize(status)}
    </span>
  );
};

/* ------------------------------------------------------------------ */
/* Small detail helpers                                                */
/* ------------------------------------------------------------------ */

const Field = ({ label, children, mono }) => (
  <div>
    <p className="text-[11px] text-gray-500 uppercase tracking-wider">{label}</p>
    <p className={`text-sm text-gray-900 break-words ${mono ? 'font-mono' : ''}`}>
      {children === null || children === undefined || children === '' ? '—' : children}
    </p>
  </div>
);

const ColumnCard = ({ icon, title, subtitle, accent, children }) => (
  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
    <div className={`px-5 py-4 border-b flex items-center gap-2 ${accent}`}>
      {icon}
      <div>
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
    </div>
    <div className="p-5 space-y-3 flex-1">{children}</div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Reports page                                                        */
/* ------------------------------------------------------------------ */

const Reports = () => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [search, setSearch] = useState('');

  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  // Resolve form
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [resolveFinding, setResolveFinding] = useState('');
  const [resolveSeverity, setResolveSeverity] = useState('');
  const [resolveNotes, setResolveNotes] = useState('');
  const [resolveAction, setResolveAction] = useState('');

  // Escalation prompt
  const [showEscalateForm, setShowEscalateForm] = useState(false);
  const [escalateReason, setEscalateReason] = useState('');

  // Compromise flow
  const [showCompromiseConfirm, setShowCompromiseConfirm] = useState(false);
  const [reissueResult, setReissueResult] = useState(null);

  // Sanction panel (super admin)
  const [sanctionStatus, setSanctionStatus] = useState('suspended');
  const [sanctionReason, setSanctionReason] = useState('');
  const [sanctionRevokeAds, setSanctionRevokeAds] = useState(false);
  const [showSanctionConfirm, setShowSanctionConfirm] = useState(false);

  const superAdmin = isSuperAdmin();

  const notify = useCallback((message, tone = 'success') => {
    setToast({ message, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }, []);

  const fail = useCallback((err) => {
    if (err?.response?.status === 403) {
      notify('Requires super administrator', 'error');
    } else {
      notify(errMessage(err), 'error');
    }
  }, [notify]);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setListError('');
    try {
      const res = await adminApi.getReports({ status: statusFilter, severity: severityFilter });
      setReports(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      setListError(errMessage(err));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, severityFilter]);

  const loadDetail = useCallback(async (id) => {
    setDetailLoading(true);
    setDetailError('');
    try {
      const res = await adminApi.getReport(id);
      setDetail(res?.data || null);
    } catch (err) {
      setDetail(null);
      setDetailError(errMessage(err));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const refreshAll = async (id) => {
    await loadReports();
    if (id) await loadDetail(id);
  };

  const toggleDetail = (id) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      setShowResolveForm(false);
      setShowEscalateForm(false);
      return;
    }
    setExpandedId(id);
    setDetail(null);
    setShowResolveForm(false);
    setShowEscalateForm(false);
    loadDetail(id);
  };

  const filteredReports = reports.filter((r) => {
    if (!search.trim()) return true;
    const needle = search.toLowerCase();
    return [r.job_title, r.company_name, r.reporter_email, r.category, r.report_reason]
      .filter(Boolean)
      .some(v => String(v).toLowerCase().includes(needle));
  });

  /* ------------------------- actions ------------------------------ */

  const startReview = async () => {
    if (!expandedId) return;
    setBusy(true);
    try {
      await adminApi.updateReport(expandedId, { status: 'under_review' });
      notify('Review started — the report is now assigned to you.');
      await refreshAll(expandedId);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const escalate = async () => {
    if (!expandedId) return;
    setBusy(true);
    try {
      await adminApi.escalateReport(expandedId, escalateReason.trim() || undefined);
      notify('Report escalated to Super Admin.');
      setShowEscalateForm(false);
      setEscalateReason('');
      await refreshAll(expandedId);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const submitResolve = async (e) => {
    e.preventDefault();
    if (!expandedId) return;
    if (!resolveFinding) {
      notify('Select a finding before resolving this report.', 'error');
      return;
    }
    if (!resolveAction) {
      notify('Select a resolution action.', 'error');
      return;
    }
    if (resolveAction === 'account_sanction' && !superAdmin) {
      notify('Requires super administrator', 'error');
      return;
    }
    setBusy(true);
    try {
      const body = {
        finding: resolveFinding,
        adminNotes: resolveNotes,
        resolutionAction: resolveAction,
      };
      if (resolveSeverity) body.severity = resolveSeverity;
      const res = await adminApi.updateReport(expandedId, body);

      const sideEffect = res?.sideEffect;
      if (sideEffect?.reissue) {
        setReissueResult({ ...sideEffect.reissue, source: 'resolve' });
      } else if (sideEffect?.revokedVerification) {
        notify('Report resolved — advert verification revoked.');
      } else if (sideEffect?.recruiter) {
        notify('Report resolved — recruiter account suspended.');
      } else {
        notify('Report resolved.');
      }

      setShowResolveForm(false);
      setResolveFinding('');
      setResolveSeverity('');
      setResolveNotes('');
      setResolveAction('');
      await refreshAll(expandedId);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const runCompromise = async () => {
    if (!expandedId) return;
    setShowCompromiseConfirm(false);
    setBusy(true);
    try {
      const res = await adminApi.compromiseCode(expandedId);
      setReissueResult(res?.data?.reissue || null);
      notify(res?.data?.message || 'Code compromised and reissued.');
      await refreshAll(expandedId);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const runSanction = async () => {
    if (!detail?.recruiter) return;
    setShowSanctionConfirm(false);
    setBusy(true);
    try {
      const res = await adminApi.setRecruiterStatus(detail.recruiter.id, {
        status: sanctionStatus,
        reason: sanctionReason.trim(),
        revokeAds: sanctionRevokeAds,
      });
      const revoked = res?.data?.revokedAds || 0;
      notify(
        `Recruiter ${sanctionStatus === 'removed' ? 'removed' : 'suspended'}` +
        (revoked ? ` — ${revoked} live ad${revoked === 1 ? '' : 's'} revoked.` : '.')
      );
      setSanctionReason('');
      setSanctionRevokeAds(false);
      await refreshAll(expandedId);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  /* ------------------------- detail view -------------------------- */

  const renderDetail = () => {
    if (detailLoading) {
      return <div className="p-8 text-center text-gray-500">Loading investigation details…</div>;
    }
    if (detailError) {
      return (
        <div className="p-6 text-center">
          <p className="text-sm text-red-600 mb-3">{detailError}</p>
          <button onClick={() => loadDetail(expandedId)} className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium">
            <RefreshCw size={16} /> Retry
          </button>
        </div>
      );
    }
    if (!detail) return null;

    const report = detail.report || {};
    const job = detail.job || null;
    const code = detail.code || null;
    const recruiter = detail.recruiter || null;
    const company = detail.company || (job ? {
      name: job.company_name,
      website_url: job.website_url,
      is_cac_verified: job.is_cac_verified,
      is_domain_verified: job.is_domain_verified,
    } : null);

    const observed = parseMaybeJson(report.observed_content);
    const pin = code?.pin ?? report.pin ?? null;
    const codeStatus = code?.status ?? report.code_status ?? null;
    const jobStatus = job?.status ?? report.job_status ?? null;
    const isCompromised = codeStatus === 'compromised';
    const isResolved = report.status === 'resolved' || report.status === 'closed';

    return (
      <div className="space-y-5">
        {/* Header strip */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status={report.status} />
            <SeverityChip severity={report.severity} />
            <span className="text-xs text-gray-500">Reported {formatDate(report.created_at)}</span>
            {report.escalated_at && (
              <span className="text-xs text-purple-600">Escalated {formatDate(report.escalated_at)}</span>
            )}
          </div>
          {report.finding && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full">
              <CheckCircle size={14} /> Finding: {findingLabel(report.finding)}
              {report.resolution_action ? ` · ${resolutionLabel(report.resolution_action)}` : ''}
            </span>
          )}
        </div>

        {/* Three-column side-by-side comparison */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

          {/* 1. Verified snapshot on TrustHire */}
          <ColumnCard
            icon={<ShieldCheck size={18} className="text-blue-600" />}
            title="Verified snapshot on TrustHire"
            subtitle="What we approved and stored"
            accent="bg-blue-50 border-blue-100"
          >
            <Field label="Job title">{job?.title ?? report.job_title}</Field>
            <div>
              <p className="text-[11px] text-gray-500 uppercase tracking-wider">Description</p>
              <p className="text-sm text-gray-800 whitespace-pre-line max-h-40 overflow-y-auto">
                {job?.description || '—'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Location">{job?.location}</Field>
              <Field label="Employment type">{humanize(job?.employment_type)}</Field>
              <Field label="Salary range">{job?.salary_range}</Field>
              <Field label="Deadline">{job?.deadline ? new Date(job.deadline).toLocaleDateString() : null}</Field>
            </div>
            <Field label="Application URL">{job?.application_url}</Field>
            <Field label="Application email">{job?.application_email}</Field>
            <div className="pt-3 border-t border-gray-100 space-y-3">
              <Field label="Company">{company?.name ?? report.company_name}</Field>
              <div className="flex flex-wrap gap-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${company?.is_cac_verified ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                  CAC {company?.is_cac_verified ? 'verified' : 'not verified'}
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${company?.is_domain_verified ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                  Domain {company?.is_domain_verified ? 'verified' : 'not verified'}
                </span>
              </div>
            </div>
            <div className="pt-3 border-t border-gray-100 grid grid-cols-2 gap-3">
              <Field label="PIN" mono>{pin}</Field>
              <Field label="Code expires">{code?.expires_at ? formatDate(code.expires_at) : null}</Field>
            </div>
          </ColumnCard>

          {/* 2. Advert record state */}
          <ColumnCard
            icon={<Database size={18} className="text-amber-600" />}
            title="Advert record state"
            subtitle="Current integrity of the listing"
            accent="bg-amber-50 border-amber-100"
          >
            <Field label="Job status">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                jobStatus === 'revoked' || jobStatus === 'rejected' ? 'bg-red-100 text-red-800'
                : jobStatus === 'pending' ? 'bg-amber-100 text-amber-800'
                : 'bg-green-100 text-green-800'}`}>
                {JOB_STATUS_LABELS[jobStatus] || humanize(jobStatus)}
              </span>
            </Field>
            <Field label="Code status">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                codeStatus === 'compromised' || codeStatus === 'revoked' ? 'bg-red-100 text-red-800'
                : codeStatus === 'active' ? 'bg-green-100 text-green-800'
                : 'bg-gray-100 text-gray-700'}`}>
                {CODE_STATUS_LABELS[codeStatus] || humanize(codeStatus || 'unknown')}
              </span>
            </Field>
            <Field label="Job record ID" mono>{job?.id ?? report.job_ad_id}</Field>

            <div className="pt-3 border-t border-gray-100 space-y-2">
              <p className="text-[11px] text-gray-500 uppercase tracking-wider">Integrity hints</p>
              {isCompromised && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-xs p-2.5 rounded-md">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <span>This QR/PIN was marked <strong>compromised</strong> — a cloned code was in circulation. Reissue a fresh code if it has not been done yet.</span>
                </div>
              )}
              {codeStatus === 'revoked' && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-xs p-2.5 rounded-md">
                  <Ban size={16} className="shrink-0 mt-0.5" />
                  <span>Verification for this advert has been revoked.</span>
                </div>
              )}
              {jobStatus === 'pending' && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs p-2.5 rounded-md">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <span>The advert is still awaiting review in the queue.</span>
                </div>
              )}
              {!isCompromised && codeStatus !== 'revoked' && jobStatus !== 'pending' && (
                <div className="flex items-start gap-2 bg-green-50 border border-green-200 text-green-700 text-xs p-2.5 rounded-md">
                  <CheckCircle size={16} className="shrink-0 mt-0.5" />
                  <span>No integrity problems detected on the record.</span>
                </div>
              )}
            </div>

            {recruiter && (
              <div className="pt-3 border-t border-gray-100">
                <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Recruiter</p>
                <p className="text-sm font-medium text-gray-900">{recruiter.first_name} {recruiter.last_name}</p>
                <p className="text-xs text-gray-500">{recruiter.email}</p>
                <div className="flex gap-2 mt-1.5">
                  <span className={`text-xs px-2 py-0.5 rounded ${recruiter.account_status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    Account {humanize(recruiter.account_status)}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                    {humanize(recruiter.verification_status)}
                  </span>
                </div>
              </div>
            )}
          </ColumnCard>

          {/* 3. What the seeker reported */}
          <ColumnCard
            icon={<Flag size={18} className="text-red-600" />}
            title="What the seeker reported"
            subtitle="The details they saw before reporting"
            accent="bg-red-50 border-red-100"
          >
            <Field label="Category">{CATEGORY_LABELS[report.category] || humanize(report.category)}</Field>
            <Field label="Reason">{report.report_reason}</Field>
            <div>
              <p className="text-[11px] text-gray-500 uppercase tracking-wider">Their description</p>
              <p className="text-sm text-gray-800 whitespace-pre-line max-h-40 overflow-y-auto">
                {report.description || '—'}
              </p>
            </div>

            <div className="pt-3 border-t border-gray-100 space-y-3">
              <p className="text-[11px] text-gray-500 uppercase tracking-wider">Observed advert content</p>
              {observed ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Title">{observed.title}</Field>
                  <Field label="Company">{observed.company}</Field>
                  <Field label="Salary">{observed.salary}</Field>
                  <Field label="Location">{observed.location}</Field>
                  <div className="col-span-2"><Field label="URL">{observed.url}</Field></div>
                  {observed.notes && (
                    <div className="col-span-2">
                      <Field label="Notes">{observed.notes}</Field>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No observed content was captured with this report.</p>
              )}
            </div>

            <div className="pt-3 border-t border-gray-100 grid grid-cols-2 gap-3">
              <Field label="Reporter email">{report.reporter_email}</Field>
              <Field label="Reporter phone">{report.reporter_phone}</Field>
              <Field label="Created">{formatDate(report.created_at)}</Field>
              <Field label="Updated">{formatDate(report.updated_at)}</Field>
            </div>

            {report.admin_notes && (
              <div className="pt-3 border-t border-gray-100">
                <Field label="Admin notes">
                  <span className="whitespace-pre-line">{report.admin_notes}</span>
                </Field>
              </div>
            )}
          </ColumnCard>
        </div>

        {/* Actions */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-bold text-gray-900 mr-2">Investigation actions</h3>

            <button
              onClick={startReview}
              disabled={busy || report.status !== 'open'}
              className="inline-flex items-center gap-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed px-3.5 py-2 rounded-md font-medium transition-colors"
              title={report.status === 'under_review' ? 'Review already in progress' : report.status !== 'open' ? 'Only open reports can start a review' : undefined}
            >
              <PlayCircle size={16} /> Start review
            </button>

            <button
              onClick={() => setShowEscalateForm(v => !v)}
              disabled={busy || report.status === 'escalated' || isResolved}
              className="inline-flex items-center gap-1.5 text-sm bg-purple-100 text-purple-700 hover:bg-purple-200 disabled:opacity-50 disabled:cursor-not-allowed px-3.5 py-2 rounded-md font-medium transition-colors"
            >
              <ArrowUpCircle size={16} /> Escalate to Super Admin
            </button>

            <button
              onClick={() => setShowResolveForm(v => !v)}
              disabled={busy || isResolved}
              className="inline-flex items-center gap-1.5 text-sm bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed px-3.5 py-2 rounded-md font-medium transition-colors"
            >
              <CheckCircle size={16} /> Resolve…
            </button>

            <button
              onClick={() => setShowCompromiseConfirm(true)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed px-3.5 py-2 rounded-md font-medium transition-colors shadow-sm ml-auto"
              title="Burn the cloned QR/PIN and issue a fresh code to the same advert"
            >
              <KeyRound size={16} /> Mark code compromised &amp; reissue
            </button>
          </div>

          {/* Escalation prompt */}
          {showEscalateForm && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-purple-800">
                Escalate this report to a Super Admin <span className="font-normal">(reason optional — it is added to the admin notes)</span>
              </p>
              <textarea
                className="w-full border border-purple-300 rounded-md p-3 text-sm focus:ring-purple-500 focus:border-purple-500"
                rows={3}
                placeholder="e.g. Multiple reports from the same recruiter — needs account-level review."
                value={escalateReason}
                onChange={(e) => setEscalateReason(e.target.value)}
              />
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => { setShowEscalateForm(false); setEscalateReason(''); }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={escalate}
                  disabled={busy}
                  className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm hover:bg-purple-700 font-medium disabled:opacity-60"
                >
                  {busy ? 'Escalating…' : 'Confirm escalation'}
                </button>
              </div>
            </div>
          )}

          {/* Resolve form */}
          {showResolveForm && (
            <form onSubmit={submitResolve} className="bg-slate-50 border border-gray-200 rounded-lg p-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">
                  Finding <span className="text-red-500">*</span>
                </label>
                <select
                  value={resolveFinding}
                  onChange={(e) => setResolveFinding(e.target.value)}
                  className="w-full border border-gray-300 rounded-md text-sm px-3 py-2 bg-white focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">Select a finding…</option>
                  {FINDING_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">A finding is required before the report can be resolved.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">
                  Severity override <span className="font-normal normal-case text-gray-400">(optional)</span>
                </label>
                <select
                  value={resolveSeverity}
                  onChange={(e) => setResolveSeverity(e.target.value)}
                  className="w-full border border-gray-300 rounded-md text-sm px-3 py-2 bg-white focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">Keep current severity ({SEVERITY_LABELS[report.severity] || humanize(report.severity) || 'not set'})</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">
                  Admin notes
                </label>
                <textarea
                  className="w-full border border-gray-300 rounded-md p-3 text-sm focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                  placeholder="What you compared, who confirmed it, and why this action…"
                  value={resolveNotes}
                  onChange={(e) => setResolveNotes(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">
                  Resolution action <span className="text-red-500">*</span>
                </label>
                <select
                  value={resolveAction}
                  onChange={(e) => setResolveAction(e.target.value)}
                  className="w-full border border-gray-300 rounded-md text-sm px-3 py-2 bg-white focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">Select an action…</option>
                  {RESOLUTION_OPTIONS.map(o => (
                    <option
                      key={o.value}
                      value={o.value}
                      disabled={o.superAdminOnly && !superAdmin}
                    >
                      {o.label}{o.superAdminOnly && !superAdmin ? ' — super admin only' : ''}
                    </option>
                  ))}
                </select>
                {!superAdmin && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    <Lock size={12} /> Account sanctions require super administrator privileges.
                  </p>
                )}
              </div>

              <div className="flex gap-3 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setShowResolveForm(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-white font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 font-medium disabled:opacity-60"
                >
                  {busy ? 'Saving…' : 'Resolve report'}
                </button>
              </div>
            </form>
          )}

          {/* Sanction recruiter panel — super admin only */}
          {superAdmin && report.finding === 'recruiter_misrepresentation' && recruiter && (
            <div className="border border-red-300 bg-red-50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <UserX size={18} className="text-red-600" />
                <h4 className="text-sm font-bold text-red-800">Sanction recruiter — {recruiter.first_name} {recruiter.last_name}</h4>
                <span className="text-xs bg-red-600 text-white px-2 py-0.5 rounded-full font-bold uppercase">Super Admin</span>
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-800">
                  <input
                    type="radio"
                    name="sanction-status"
                    checked={sanctionStatus === 'suspended'}
                    onChange={() => setSanctionStatus('suspended')}
                  />
                  Suspend account
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-800">
                  <input
                    type="radio"
                    name="sanction-status"
                    checked={sanctionStatus === 'removed'}
                    onChange={() => setSanctionStatus('removed')}
                  />
                  Remove account
                </label>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">
                  Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  className="w-full border border-red-300 rounded-md p-3 text-sm focus:ring-red-500 focus:border-red-500"
                  rows={2}
                  placeholder="Why this account is being sanctioned…"
                  value={sanctionReason}
                  onChange={(e) => setSanctionReason(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-800">
                <input
                  type="checkbox"
                  checked={sanctionRevokeAds}
                  onChange={(e) => setSanctionRevokeAds(e.target.checked)}
                />
                Also revoke all live verified ads for this recruiter
              </label>
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    if (!sanctionReason.trim()) {
                      notify('A reason is required to sanction an account.', 'error');
                      return;
                    }
                    setShowSanctionConfirm(true);
                  }}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 px-4 py-2 rounded-md font-medium"
                >
                  <Ban size={16} /> Apply sanction
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  /* --------------------------- render ----------------------------- */

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900">User Reports</h1>
        <div className="flex flex-wrap gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search reports…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg text-sm px-3 py-2 bg-white focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            <option value="">All Statuses</option>
            <option value="open">Open</option>
            <option value="under_review">Under Review</option>
            <option value="escalated">Escalated</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="border border-gray-300 rounded-lg text-sm px-3 py-2 bg-white focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            <option value="">All Severities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {listError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-lg flex items-center justify-between gap-3">
          <span>{listError}</span>
          <button onClick={loadReports} className="inline-flex items-center gap-1.5 font-medium text-red-800 hover:underline">
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-500">
          Loading reports…
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileSearch size={28} />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">No reports found</h3>
          <p className="text-gray-500">
            {reports.length === 0 ? 'There are no user reports right now.' : 'No reports match your filters.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Job / Reporter</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Severity</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Finding</th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredReports.map((report) => (
                  <React.Fragment key={report.id}>
                    <tr
                      onClick={() => toggleDetail(report.id)}
                      className={`hover:bg-gray-50 transition-colors cursor-pointer ${expandedId === report.id ? 'bg-blue-50/40' : ''}`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(report.created_at)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{report.job_title || '—'}</div>
                        <div className="text-sm text-gray-500">{report.company_name || 'Unknown company'}</div>
                        <div className="text-xs text-gray-400">{report.reporter_email || 'No reporter email'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {CATEGORY_LABELS[report.category] || humanize(report.category)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <SeverityChip severity={report.severity} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusChip status={report.status} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {report.finding ? findingLabel(report.finding) : <span className="text-gray-400">Not set</span>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleDetail(report.id); }}
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-900 px-2 py-1 rounded"
                        >
                          <Eye size={16} /> {expandedId === report.id ? 'Hide' : 'Investigate'}
                        </button>
                      </td>
                    </tr>
                    {expandedId === report.id && (
                      <tr>
                        <td colSpan="7" className="px-6 py-6 bg-slate-50 border-b border-gray-200">
                          {renderDetail()}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[70] max-w-sm rounded-lg shadow-lg border px-4 py-3 text-sm font-medium flex items-start gap-2 ${
          toast.tone === 'error'
            ? 'bg-red-50 border-red-200 text-red-700'
            : 'bg-green-50 border-green-200 text-green-700'
        }`}>
          {toast.tone === 'error'
            ? <XCircle size={18} className="shrink-0 mt-0.5" />
            : <CheckCircle size={18} className="shrink-0 mt-0.5" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Compromise confirmation */}
      <ConfirmModal
        isOpen={showCompromiseConfirm}
        title="Mark code compromised & reissue?"
        message={
          `The current QR/PIN for this advert (${detail?.job?.title || detail?.report?.job_title || 'this job'}) will be burned immediately ` +
          'and a fresh code will be issued to the same advert. The recruiter stays verified and is notified automatically. ' +
          'This cannot be undone.'
        }
        confirmText="Yes, burn & reissue"
        variant="danger"
        onConfirm={runCompromise}
        onCancel={() => setShowCompromiseConfirm(false)}
      />

      {/* Reissue result modal */}
      {reissueResult && (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-gray-500 bg-opacity-75 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                <CheckCircle size={22} />
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900">New code issued</h3>
                <p className="text-sm text-gray-500">The old code has been burned.</p>
              </div>
            </div>
            <div className="bg-slate-50 border border-gray-200 rounded-md p-4 space-y-3">
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wider">Old PIN (burned)</p>
                <p className="font-mono text-sm text-gray-500 line-through">{reissueResult.oldPin || '—'}</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wider">New PIN</p>
                <p className="font-mono text-lg font-bold text-gray-900">{reissueResult.newPin || '—'}</p>
              </div>
              {reissueResult.qrCodeUrl && (
                <div>
                  <p className="text-[11px] text-gray-500 uppercase tracking-wider">New QR link</p>
                  <a
                    href={reissueResult.qrCodeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-blue-600 hover:underline break-all"
                  >
                    {reissueResult.qrCodeUrl}
                  </a>
                </div>
              )}
              {reissueResult.expiresAt && (
                <div>
                  <p className="text-[11px] text-gray-500 uppercase tracking-wider">Expires</p>
                  <p className="text-sm text-gray-900">{formatDate(reissueResult.expiresAt)}</p>
                </div>
              )}
            </div>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setReissueResult(null)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 font-medium"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sanction confirmation */}
      <ConfirmModal
        isOpen={showSanctionConfirm}
        title={sanctionStatus === 'removed' ? 'Remove recruiter account?' : 'Suspend recruiter account?'}
        message={
          `${sanctionStatus === 'removed' ? 'Remove' : 'Suspend'} ${detail?.recruiter?.first_name || ''} ` +
          `${detail?.recruiter?.last_name || ''} (${detail?.recruiter?.email || ''})? ` +
          `Reason: "${sanctionReason.trim()}"` +
          (sanctionRevokeAds ? ' All live verified ads will also be revoked.' : '')
        }
        confirmText={sanctionStatus === 'removed' ? 'Yes, remove account' : 'Yes, suspend account'}
        variant="danger"
        onConfirm={runSanction}
        onCancel={() => setShowSanctionConfirm(false)}
      />
    </div>
  );
};

export default Reports;
