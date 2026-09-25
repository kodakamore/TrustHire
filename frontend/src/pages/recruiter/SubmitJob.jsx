import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import StatusBadge from '../../components/StatusBadge';
import { verify, company as companyApi, job as jobApi } from '../../services/api';

const SubmitJob = () => {
  const navigate = useNavigate();
  const [initLoading, setInitLoading] = useState(true);
  const [isRecruiterVerified, setIsRecruiterVerified] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState(null);

  const [formData, setFormData] = useState({
    companyId: '',
    title: '',
    type: 'Full-time',
    location: '',
    salaryRange: '',
    applicationUrl: '',
    applicationEmail: '',
    deadline: '',
    description: '',
    requirements: '',
    benefits: ''
  });
  
  const [loading, setLoading] = useState(false);
  const [submittedJob, setSubmittedJob] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setInitLoading(true);
        const [statusRes, compRes] = await Promise.allSettled([
          verify.getStatus(),
          companyApi.getAll()
        ]);

        if (statusRes.status === 'fulfilled' && statusRes.value.data?.data) {
          const vData = statusRes.value.data.data;
          const verified = vData.verification_status === 'verified' || 
            (vData.is_identity_verified && vData.is_face_verified);
          setIsRecruiterVerified(verified);
        } else {
          setIsRecruiterVerified(false);
        }

        if (compRes.status === 'fulfilled' && compRes.value.data?.data) {
          const compList = compRes.value.data.data;
          setCompanies(compList);
          if (compList.length > 0) {
            setFormData(prev => ({ ...prev, companyId: compList[0].id }));
          }
        }
      } catch (err) {
        console.error('Error fetching submit requirements:', err);
      } finally {
        setInitLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const selectedCompany = companies.find(c => c.id === formData.companyId);
  const isCompanyCorporateVerified = selectedCompany ? Boolean(selectedCompany.is_corporate_email_verified) : false;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isCompanyCorporateVerified) {
      setError('You cannot onboard a job advertisement without a verified official company email. Please complete corporate email verification first.');
      return;
    }

    if (formData.applicationEmail) {
      const pubDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com', 'icloud.com', 'mail.com', 'proton.me', 'aol.com', 'zoho.com'];
      const dom = (formData.applicationEmail.split('@')[1] || '').toLowerCase().trim();
      if (pubDomains.includes(dom)) {
        setError(`Application email cannot use a generic/personal webmail provider (@${dom}). Applications must be received on an official company email address.`);
        return;
      }
    }

    setLoading(true);
    setError(null);
    try {
      const res = await jobApi.create(formData);
      if (res.data && res.data.data) {
        setSubmittedJob(res.data.data);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit job. Please check all fields and try again.');
    } finally {
      setLoading(false);
    }
  };

  if (initLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-3"></div>
        <p className="text-gray-500 font-medium">Checking verification status...</p>
      </div>
    );
  }

  if (!isRecruiterVerified) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 p-8 rounded-xl max-w-2xl mx-auto text-center shadow-sm">
        <div className="w-12 h-12 bg-yellow-100 text-yellow-700 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
        </div>
        <h2 className="text-xl font-bold text-yellow-800 mb-2">Identity Verification Required</h2>
        <p className="text-yellow-700 mb-6 text-sm">
          To maintain zero fraud on TrustHire, all recruiters must verify their identity (NIN/BVN and face liveness) before publishing job advertisements.
        </p>
        <Link to="/recruiter/verify" className="inline-block bg-yellow-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-yellow-700 shadow-sm transition">
          Complete Identity Verification
        </Link>
      </div>
    );
  }

  if (companies.length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 p-8 rounded-xl max-w-2xl mx-auto text-center shadow-sm">
        <div className="w-12 h-12 bg-yellow-100 text-yellow-700 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
        </div>
        <h2 className="text-xl font-bold text-yellow-800 mb-2">Company Profile Required</h2>
        <p className="text-yellow-700 mb-6 text-sm">
          You must add and verify at least one corporate profile (CAC & Domain check) before posting jobs.
        </p>
        <Link to="/recruiter/companies/new" className="inline-block bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-indigo-700 shadow-sm transition">
          Add Your Company
        </Link>
      </div>
    );
  }

  if (submittedJob) {
    const isApproved = submittedJob.status === 'approved';
    return (
      <div className="max-w-2xl mx-auto bg-white p-8 rounded-xl shadow-sm border border-gray-200 text-center">
        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Job Submitted Successfully!</h2>
        <p className="text-gray-600 mb-6">
          {isApproved 
            ? 'Your job passed all automated verification checks and has been instantly verified!'
            : 'Your job has been submitted for platform review and will receive a Verification PIN once approved.'}
        </p>
        <div className="flex justify-center gap-4">
          <button onClick={() => navigate(`/recruiter/jobs/${submittedJob.id}`)} className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-indigo-700 shadow-sm">
            View Job & Verification Card
          </button>
          <button onClick={() => navigate('/recruiter/dashboard')} className="bg-gray-100 text-gray-700 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-200">
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto bg-white p-8 rounded-lg shadow-sm border border-gray-200">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Submit Job Advertisement</h1>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span>{error}</span>
        </div>
      )}

      {selectedCompany && !isCompanyCorporateVerified && (
        <div className="mb-6 bg-amber-50 border border-amber-300 p-4 rounded-xl text-amber-900 text-sm space-y-2">
          <div className="flex items-center gap-2 font-bold text-amber-950">
            <span>⚠️ Official Corporate Email Verification Required</span>
          </div>
          <p className="text-xs text-amber-800">
            <strong>{selectedCompany.name}</strong> does not have a verified official company email (@{selectedCompany.website_url ? selectedCompany.website_url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] : 'company.com'}). TrustHire requires official work email verification to prevent fraudulent advertisements.
          </p>
          <div className="pt-1">
            <Link
              to="/recruiter/companies/new"
              className="inline-block px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-sm transition"
            >
              Verify Company Work Email &rarr;
            </Link>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700">Company</label>
            <select name="companyId" required value={formData.companyId} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm">
              <option value="">Select a Company</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.is_corporate_email_verified ? '✔ (Work Email Verified)' : '⚠️ (Work Email Unverified)'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Job Title</label>
            <input type="text" name="title" required value={formData.title} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Job Type</label>
            <select name="type" required value={formData.type} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm">
              <option value="Full-time">Full-time</option>
              <option value="Part-time">Part-time</option>
              <option value="Contract">Contract</option>
              <option value="Remote">Remote</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Location</label>
            <input type="text" name="location" required value={formData.location} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Salary Range (Optional)</label>
            <input type="text" name="salaryRange" placeholder="e.g. ₦500k - ₦800k/month" value={formData.salaryRange} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Application URL (Optional)</label>
            <input type="url" name="applicationUrl" value={formData.applicationUrl} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Application Email (Official Work Email Only)</label>
            <input 
              type="email" 
              name="applicationEmail" 
              placeholder="e.g. careers@company.com (No Gmail/Yahoo)"
              value={formData.applicationEmail} 
              onChange={handleChange} 
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm" 
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700">Application Deadline</label>
            <input type="date" name="deadline" required value={formData.deadline} onChange={handleChange} className="mt-1 block w-full md:w-1/2 px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700">Job Description</label>
            <textarea name="description" required rows="4" value={formData.description} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm"></textarea>
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700">Requirements</label>
            <textarea name="requirements" required rows="4" value={formData.requirements} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm"></textarea>
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700">Benefits</label>
            <textarea name="benefits" rows="3" value={formData.benefits} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm"></textarea>
          </div>
        </div>
        <div className="flex justify-end pt-4">
          <button 
            type="submit" 
            disabled={loading || !isCompanyCorporateVerified} 
            className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition shadow-sm"
          >
            {loading ? 'Submitting...' : 'Submit Job for Verification'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SubmitJob;
