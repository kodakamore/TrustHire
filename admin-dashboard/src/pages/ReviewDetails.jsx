import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, AlertTriangle, Shield, Building, User, FileText, Globe, ArrowLeft, Check } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';

const ReviewDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);

  // Mock data
  const data = {
    job: {
      id: id,
      title: 'Senior React Developer',
      description: 'We are looking for a Senior React Developer to join our team...',
      type: 'Full-time',
      location: 'Lagos, Nigeria (Remote)',
      salary: '₦800,000 - ₦1,200,000 / month',
      requirements: '5+ years React, TypeScript, Redux',
      benefits: 'Health insurance, 13th month, Remote work',
      applyUrl: 'https://technovasolutions.com/careers/apply',
    },
    recruiter: {
      name: 'Sarah Jenkins',
      email: 'sarah.j@technovasolutions.com',
      phone: '+234 801 234 5678',
      ninVerified: true,
      bvnVerified: true,
      faceMatchScore: 94,
    },
    company: {
      name: 'TechNova Solutions Ltd',
      rcNumber: 'RC1234567',
      tin: '12345678-0001',
      website: 'technovasolutions.com',
      cacStatus: 'ACTIVE',
      cacRegistrationDate: '2019-05-12',
      cacVerifiedName: 'TECHNOVA SOLUTIONS LIMITED',
      domainAge: '4 years, 5 months',
      sslValid: true,
    },
    flags: [
      { id: 'f1', type: 'warning', message: 'High salary compared to industry average for this role', code: 'high_salary' },
      { id: 'f2', type: 'critical', message: 'Domain registrant details are hidden via privacy proxy', code: 'domain_proxy' }
    ]
  };

  useEffect(() => {
    setTimeout(() => setLoading(false), 800);
  }, [id]);

  const handleApprove = () => {
    // API Call would go here
    alert('Job approved successfully!');
    navigate('/queue');
  };

  const handleReject = () => {
    if (!rejectReason.trim()) {
      alert('Please provide a rejection reason.');
      return;
    }
    // API Call would go here
    alert(`Job rejected. Reason: ${rejectReason}`);
    navigate('/queue');
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading job details...</div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/queue')} className="p-2 bg-white border border-gray-200 rounded-md hover:bg-gray-50 text-gray-600">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Review Application</h1>
          <p className="text-sm text-gray-500">Job ID: {id}</p>
        </div>
      </div>

      {data.flags.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-red-200 overflow-hidden">
          <div className="bg-red-50 px-6 py-4 border-b border-red-100 flex items-center gap-3">
            <AlertTriangle className="text-red-600" size={24} />
            <h2 className="text-lg font-semibold text-red-800">System Flags ({data.flags.length})</h2>
          </div>
          <div className="p-6">
            <ul className="space-y-3">
              {data.flags.map(flag => (
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
                <p className="font-medium">{data.recruiter.name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Phone</p>
                <p className="font-medium">{data.recruiter.phone}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-gray-500 uppercase tracking-wider">Email</p>
                <p className="font-medium">{data.recruiter.email}</p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Identity Verification</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">NIN Verification</span>
                  {data.recruiter.ninVerified ? <CheckCircle className="text-green-500" size={18} /> : <XCircle className="text-red-500" size={18} />}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">BVN Verification</span>
                  {data.recruiter.bvnVerified ? <CheckCircle className="text-green-500" size={18} /> : <XCircle className="text-red-500" size={18} />}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Face Match Score</span>
                  <span className="text-sm font-medium text-green-600">{data.recruiter.faceMatchScore}%</span>
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
                <p className="font-medium">{data.company.name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">RC Number</p>
                <p className="font-medium">{data.company.rcNumber}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">TIN</p>
                <p className="font-medium">{data.company.tin}</p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                <Shield size={16} className="text-blue-500" /> CAC Verification
              </h3>
              <div className="bg-blue-50 p-3 rounded-md space-y-2">
                <p className="text-sm"><span className="text-gray-500">Verified Name:</span> <span className="font-medium">{data.company.cacVerifiedName}</span></p>
                <p className="text-sm"><span className="text-gray-500">Status:</span> <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">{data.company.cacStatus}</span></p>
                <p className="text-sm"><span className="text-gray-500">Reg. Date:</span> {data.company.cacRegistrationDate}</p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                <Globe size={16} className="text-purple-500" /> Domain Verification
              </h3>
              <div className="space-y-2">
                <p className="text-sm"><span className="text-gray-500">Website:</span> <a href={`https://${data.company.website}`} className="text-blue-600 hover:underline" target="_blank" rel="noreferrer">{data.company.website}</a></p>
                <p className="text-sm"><span className="text-gray-500">Domain Age:</span> {data.company.domainAge}</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">SSL Certificate:</span> 
                  {data.company.sslValid ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Valid</span> : <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">Invalid/Missing</span>}
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
            <h3 className="text-xl font-bold text-gray-900">{data.job.title}</h3>
            <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-600">
              <span className="flex items-center gap-1"><span className="font-medium text-gray-700">Type:</span> {data.job.type}</span>
              <span className="flex items-center gap-1"><span className="font-medium text-gray-700">Location:</span> {data.job.location}</span>
              <span className="flex items-center gap-1"><span className="font-medium text-gray-700">Salary:</span> {data.job.salary}</span>
            </div>
          </div>
          
          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-2 uppercase tracking-wider">Description</h4>
              <p className="text-gray-700 text-sm whitespace-pre-line">{data.job.description}</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-2 uppercase tracking-wider">Requirements</h4>
                <p className="text-gray-700 text-sm whitespace-pre-line">{data.job.requirements}</p>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-2 uppercase tracking-wider">Benefits</h4>
                <p className="text-gray-700 text-sm whitespace-pre-line">{data.job.benefits}</p>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100">
              <h4 className="text-sm font-semibold text-gray-900 mb-2 uppercase tracking-wider">Application Method</h4>
              <p className="text-sm text-blue-600 break-all">{data.job.applyUrl}</p>
            </div>
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
