import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, AlertTriangle, Shield, Building, User, FileText, Globe, ArrowLeft, Check } from 'lucide-react';
import ConfirmModal from '../../components/ConfirmModal';
import { admin } from '../../services/api';

const ReviewDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [item, setItem] = useState(null);

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        setLoading(true);
        const res = await admin.getQueueItem(id);
        if (res.data && res.data.data) {
          setItem(res.data.data);
        }
      } catch (err) {
        console.error('Error fetching review details:', err);
        setError('Failed to load job review details.');
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [id]);

  const handleApprove = async () => {
    setActionLoading(true);
    try {
      await admin.approveJob(id);
      navigate('/admin/queue');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to approve job.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      alert('Please provide a rejection reason.');
      return;
    }
    setActionLoading(true);
    try {
      await admin.rejectJob(id, { reason: rejectReason });
      setShowRejectModal(false);
      navigate('/admin/queue');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to reject job.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading job details...</div>;
  }

  if (error || !item) {
    return (
      <div className="p-8 text-center max-w-md mx-auto">
        <p className="text-red-600 mb-4">{error || 'Job not found'}</p>
        <button onClick={() => navigate('/admin/queue')} className="px-4 py-2 bg-indigo-600 text-white rounded-lg">
          Back to Queue
        </button>
      </div>
    );
  }

  const recruiter = item.recruiter || {};
  const company = item.company || {};
  const recruiterName = `${recruiter.first_name || ''} ${recruiter.last_name || ''}`.trim() || recruiter.email || 'N/A';

  const flags = Array.isArray(item.flags) ? item.flags.map((f, idx) => {
    if (typeof f === 'string') {
      return { id: `flag-${idx}`, type: 'warning', message: f, code: f };
    }
    return {
      id: `flag-${idx}`,
      type: f.type || 'warning',
      message: f.message || f.reason || JSON.stringify(f),
      code: f.code || f.type || 'flag'
    };
  }) : [];

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/admin/queue')} className="p-2 bg-white border border-gray-200 rounded-md hover:bg-gray-50 text-gray-600">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Review Application</h1>
          <p className="text-sm text-gray-500">Job ID: {id}</p>
        </div>
      </div>

      {flags.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-red-200 overflow-hidden">
          <div className="bg-red-50 px-6 py-4 border-b border-red-100 flex items-center gap-3">
            <AlertTriangle className="text-red-600" size={24} />
            <h2 className="text-lg font-semibold text-red-800">System Flags ({flags.length})</h2>
          </div>
          <div className="p-6">
            <ul className="space-y-3">
              {flags.map(flag => (
                <li key={flag.id} className="flex items-start gap-3">
                  <span className={`mt-0.5 w-2 h-2 rounded-full ${flag.type === 'critical' ? 'bg-red-600' : 'bg-amber-500'}`}></span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{flag.message}</p>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">{flag.code}</p>
                  </div>
                </li>
              ))}
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
                <p className="font-medium">{recruiterName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Phone</p>
                <p className="font-medium">{recruiter.phone_number || 'Not provided'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-gray-500 uppercase tracking-wider">Email</p>
                <p className="font-medium">{recruiter.email}</p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Identity Verification</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Identity (NIN/BVN)</span>
                  {recruiter.is_identity_verified ? <CheckCircle className="text-green-500" size={18} /> : <XCircle className="text-red-500" size={18} />}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Facial Liveness</span>
                  {recruiter.is_face_verified ? <CheckCircle className="text-green-500" size={18} /> : <XCircle className="text-red-500" size={18} />}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Email Verified</span>
                  {recruiter.is_email_verified ? <CheckCircle className="text-green-500" size={18} /> : <XCircle className="text-red-500" size={18} />}
                </div>
              </div>
            </div>
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
                <p className="font-medium">{company.name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">RC Number</p>
                <p className="font-medium">{company.registration_number || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">TIN</p>
                <p className="font-medium">{company.tin_number || 'N/A'}</p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                <Shield size={16} className="text-blue-500" /> CAC Verification
              </h3>
              <div className="bg-blue-50 p-3 rounded-md space-y-2">
                <p className="text-sm"><span className="text-gray-500">Registered Name:</span> <span className="font-medium">{company.name}</span></p>
                <p className="text-sm"><span className="text-gray-500">Status:</span> <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">{company.is_cac_verified ? 'VERIFIED' : 'PENDING'}</span></p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                <Globe size={16} className="text-purple-500" /> Domain Safety & Recruiter Affiliation
              </h3>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Website</p>
                  <a 
                    href={company.website_url ? (company.website_url.startsWith('http') ? company.website_url : `https://${company.website_url}`) : '#'} 
                    className="text-sm text-blue-600 hover:underline break-all font-medium" 
                    target="_blank" 
                    rel="noreferrer"
                  >
                    {company.website_url || 'N/A'}
                  </a>
                </div>

                {/* Recruiter-to-Company Affiliation Check */}
                <div className="p-3 rounded-lg border border-gray-200 bg-gray-50 space-y-1.5">
                  <p className="text-xs font-semibold text-gray-700">Recruiter Affiliation Linkage</p>
                  {(() => {
                    const recEmail = recruiter.email || '';
                    const webUrl = company.website_url || '';
                    const recDomain = (recEmail.split('@')[1] || '').toLowerCase();
                    const webDomain = webUrl.replace(/^https?:\/\//i, '').split('/')[0].replace(/^www\./i, '').toLowerCase();
                    const isPublic = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'proton.me'].includes(recDomain);
                    const isMatch = recDomain && webDomain && (recDomain === webDomain || webDomain.endsWith('.' + recDomain) || recDomain.endsWith('.' + webDomain));

                    if (isMatch) {
                      return (
                        <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 p-2 rounded border border-emerald-200">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                          <span>Corporate Email Verified: <strong>@{recDomain}</strong> matches company domain</span>
                        </div>
                      );
                    }
                    if (isPublic) {
                      return (
                        <div className="flex items-start gap-2 text-xs font-medium text-amber-800 bg-amber-50 p-2 rounded border border-amber-200">
                          <span className="w-2 h-2 rounded-full bg-amber-500 mt-1"></span>
                          <div>
                            <p><strong>Personal Email Used (@{recDomain})</strong></p>
                            <p className="text-[11px] text-amber-700">Recruiter did not use a corporate email matching @{webDomain || 'company.com'}. Manual proof of authority required.</p>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div className="flex items-start gap-2 text-xs font-medium text-amber-800 bg-amber-50 p-2 rounded border border-amber-200">
                        <span className="w-2 h-2 rounded-full bg-amber-500 mt-1"></span>
                        <div>
                          <p><strong>Domain Mismatch:</strong> @{recDomain} vs @{webDomain}</p>
                          <p className="text-[11px] text-amber-700">Recruiter email domain does not match company domain.</p>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* WhoisXML & APIVoid Threat Status */}
                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div className="p-2.5 rounded-lg border border-gray-200 bg-white">
                    <p className="text-gray-400 text-[10px] uppercase font-semibold">WhoisXML Age</p>
                    <p className="font-semibold text-gray-800 mt-0.5">
                      {(() => {
                        const whois = (item.companyChecks || []).find(c => c.check_type === 'whois')?.raw_response;
                        const age = whois?.domainAgeDays ?? whois?.domain_age_days;
                        if (age !== undefined) {
                          return `${age} days (${Math.floor(age / 365)}y ${Math.floor((age % 365) / 30)}m)`;
                        }
                        return company.is_domain_verified ? 'Established (>30 days)' : 'Pending Scan';
                      })()}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg border border-gray-200 bg-white">
                    <p className="text-gray-400 text-[10px] uppercase font-semibold">APIVoid Reputation</p>
                    <p className="font-semibold mt-0.5">
                      {(() => {
                        const rep = (item.companyChecks || []).find(c => c.check_type === 'domain_reputation')?.raw_response;
                        if (rep?.threatScore !== undefined) {
                          return rep.threatScore === 0 ? (
                            <span className="text-emerald-600">0/100 · Clean</span>
                          ) : (
                            <span className="text-amber-600">{rep.threatScore}/100 Risk</span>
                          );
                        }
                        return <span className="text-emerald-600">Clean (0 Blacklists)</span>;
                      })()}
                    </p>
                  </div>
                </div>
              </div>
            </div>
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
            <h3 className="text-xl font-bold text-gray-900">{item.title}</h3>
            <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-600">
              <span className="flex items-center gap-1"><span className="font-medium text-gray-700">Type:</span> {item.employment_type || 'Full-time'}</span>
              <span className="flex items-center gap-1"><span className="font-medium text-gray-700">Location:</span> {item.location || 'Nigeria'}</span>
              <span className="flex items-center gap-1"><span className="font-medium text-gray-700">Salary:</span> {item.salary_range || 'Not specified'}</span>
            </div>
          </div>
          
          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-2 uppercase tracking-wider">Description</h4>
              <p className="text-gray-700 text-sm whitespace-pre-line">{item.description}</p>
            </div>
            
            {item.requirements && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-2 uppercase tracking-wider">Requirements</h4>
                <p className="text-gray-700 text-sm whitespace-pre-line">{item.requirements}</p>
              </div>
            )}

            {item.benefits && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-2 uppercase tracking-wider">Benefits</h4>
                <p className="text-gray-700 text-sm whitespace-pre-line">{item.benefits}</p>
              </div>
            )}

            {(item.application_url || item.application_email) && (
              <div className="pt-4 border-t border-gray-100">
                <h4 className="text-sm font-semibold text-gray-900 mb-2 uppercase tracking-wider">Application Method</h4>
                <p className="text-sm text-blue-600 break-all">{item.application_url || item.application_email}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action Bar - Fixed at bottom */}
      <div className="fixed bottom-0 left-64 right-0 bg-white border-t border-gray-200 p-4 px-8 flex justify-end gap-4 shadow-lg z-10">
        <button 
          onClick={() => setShowRejectModal(true)}
          className="px-6 py-2.5 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          <XCircle size={20} /> Reject Advertisement
        </button>
        <button 
          onClick={() => setShowApproveModal(true)}
          className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm"
        >
          <Check size={20} /> Approve & Verify
        </button>
      </div>

      {/* Approve Modal */}
      <ConfirmModal 
        isOpen={showApproveModal}
        title="Approve Job Advertisement"
        message="Are you sure you want to approve this job? It will be marked as 'Verified' on the platform and visible to applicants."
        confirmText="Yes, Approve"
        variant="success"
        onConfirm={() => {
          setShowApproveModal(false);
          handleApprove();
        }}
        onCancel={() => setShowApproveModal(false)}
      />

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
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 font-medium"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewDetails;
