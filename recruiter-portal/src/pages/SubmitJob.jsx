import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';
import { verify as verifyApi, company as companyApi, job as jobApi } from '../services/api';

const errMsg = (err, fallback) => err?.response?.data?.error || fallback;

// Each check comes back as 'verified' | 'pending' | 'failed'; fall back to
// the legacy boolean columns when `checks` is absent.
const checkVerified = (rec, key, flag) => {
  const check = rec?.checks?.[key];
  if (check) return check === 'verified';
  return !!rec?.[flag];
};

const SubmitJob = () => {
  const navigate = useNavigate();
  const [initLoading, setInitLoading] = useState(true);
  const [isRecruiterVerified, setIsRecruiterVerified] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [previousJobs, setPreviousJobs] = useState([]);
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
      setInitLoading(true);
      const [statusRes, compRes, jobsRes] = await Promise.allSettled([
        verifyApi.getStatus(),
        companyApi.getAll(),
        jobApi.getAll(),
      ]);

      if (statusRes.status === 'fulfilled') {
        const rec = statusRes.value.data?.data;
        setIsRecruiterVerified(
          !!rec &&
          checkVerified(rec, 'identity', 'is_identity_verified') &&
          checkVerified(rec, 'face', 'is_face_verified'),
        );
      } else {
        setIsRecruiterVerified(false);
      }

      if (compRes.status === 'fulfilled') {
        const list = compRes.value.data?.data || [];
        setCompanies(list);
        if (list.length > 0) {
          const firstVerified = list.find((c) => c.is_corporate_email_verified) || list[0];
          setFormData((prev) => ({ ...prev, companyId: prev.companyId || firstVerified.id }));
        }
      }

      if (jobsRes.status === 'fulfilled') {
        setPreviousJobs(jobsRes.value.data?.data || []);
      }

      setInitLoading(false);
    };

    fetchData();
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const selectedCompany = companies.find((c) => String(c.id) === String(formData.companyId));
  const isCompanyCorporateVerified = !!selectedCompany?.is_corporate_email_verified;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isCompanyCorporateVerified) {
      setError('You cannot onboard a job advertisement without a verified official company email. Please complete corporate email verification first.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await jobApi.create({
        companyId: formData.companyId,
        title: formData.title,
        description: formData.description,
        location: formData.location,
        employmentType: formData.type,
        salaryRange: formData.salaryRange,
        applicationUrl: formData.applicationUrl,
        applicationEmail: formData.applicationEmail,
        requirements: formData.requirements,
        benefits: formData.benefits,
        deadline: formData.deadline,
      });
      if (res.data?.data) {
        setSubmittedJob(res.data.data);
      } else {
        setError('The server accepted the job but did not return a record. Please check your job list.');
      }
    } catch (err) {
      // Real server error, shown as-is.
      setError(errMsg(err, 'Failed to submit the job. Please check all fields and try again.'));
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
      <div className="bg-yellow-50 border border-yellow-200 p-6 rounded-lg max-w-2xl mx-auto text-center">
        <h2 className="text-xl font-bold text-yellow-800 mb-2">Verification Required</h2>
        <p className="text-yellow-700 mb-4">You must complete your recruiter identity verification (NIN/BVN and face liveness) before submitting jobs.</p>
        <Link to="/verify-identity" className="inline-block bg-yellow-600 text-white px-4 py-2 rounded font-medium hover:bg-yellow-700">Go to Verification</Link>
      </div>
    );
  }

  if (companies.length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 p-6 rounded-lg max-w-2xl mx-auto text-center">
        <h2 className="text-xl font-bold text-yellow-800 mb-2">Verified Company Required</h2>
        <p className="text-yellow-700 mb-4">You must have at least one company profile before submitting jobs.</p>
        <Link to="/companies/new" className="inline-block bg-yellow-600 text-white px-4 py-2 rounded font-medium hover:bg-yellow-700">Add a Company</Link>
      </div>
    );
  }

  if (submittedJob) {
    const isApproved = submittedJob.status === 'approved';
    return (
      <div className="max-w-2xl mx-auto bg-white p-8 rounded-lg shadow-sm border border-gray-200 text-center">
        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Job Submitted Successfully!</h2>
        <p className="text-gray-600 mb-6">
          {isApproved
            ? 'Your job passed all automated verification checks and has been approved.'
            : 'Your job has been sent to admin review and will receive a Verification PIN once approved.'}
        </p>

        {isApproved ? (
          <div className="mb-6 bg-gray-50 border border-gray-200 p-4 rounded-md">
            <p className="text-xs uppercase font-semibold text-gray-500">Verification PIN</p>
            <p className="text-2xl font-mono font-bold text-gray-900 tracking-widest mt-1">{submittedJob.pin || '—'}</p>
            {submittedJob.expiresAt && (
              <p className="text-xs text-gray-500 mt-1">Valid until {new Date(submittedJob.expiresAt).toLocaleDateString()}</p>
            )}
          </div>
        ) : (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 p-4 rounded-md text-sm text-yellow-800">
            Status: <StatusBadge status="pending" /> — sent to admin review.
          </div>
        )}

        <div className="flex justify-center gap-4">
          <button onClick={() => navigate(`/jobs/${submittedJob.id}`)} className="bg-indigo-600 text-white px-6 py-2 rounded-md hover:bg-indigo-700">View Job</button>
          <button onClick={() => navigate('/dashboard')} className="bg-gray-100 text-gray-700 px-6 py-2 rounded-md hover:bg-gray-200">Return to Dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto bg-white p-8 rounded-lg shadow-sm border border-gray-200">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Submit Job Advertisement</h1>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm" role="alert">
          {error}
        </div>
      )}

      {selectedCompany && !isCompanyCorporateVerified && (
        <div className="mb-6 bg-amber-50 border border-amber-200 p-4 rounded-md text-amber-800 text-sm space-y-2">
          <p className="font-semibold">Official corporate email verification required</p>
          <p className="text-xs">
            <strong>{selectedCompany.name}</strong> does not have a verified official company email. TrustHire only accepts job ads authorised through a work email on the company domain.
          </p>
          <Link to="/companies/new" className="inline-block text-xs font-semibold text-amber-700 underline">
            Add / verify a company &rarr;
          </Link>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700">Company</label>
            <select name="companyId" required value={formData.companyId} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm">
              <option value="">Select a Verified Company</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.is_corporate_email_verified ? '✔ (Work Email Verified)' : '⚠ (Work Email Unverified)'}
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
            <label className="block text-sm font-medium text-gray-700">Application Email (Optional)</label>
            <input type="email" name="applicationEmail" placeholder="e.g. careers@yourcompany.com (no Gmail/Yahoo)" value={formData.applicationEmail} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm" />
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
            className="bg-indigo-600 text-white px-6 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Submitting...' : 'Submit Job for Verification'}
          </button>
        </div>
      </form>

      {previousJobs.length > 0 && (
        <div className="mt-10 pt-6 border-t border-gray-200">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Previously Submitted Jobs</h2>
          <ul className="divide-y divide-gray-200">
            {previousJobs.map(j => {
              const badgeStatus = j.status === 'approved' ? 'verified' : j.status;
              return (
                <li key={j.id} className="py-3 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{j.title}</p>
                    <p className="text-xs text-gray-500">{j.company_name}</p>
                  </div>
                  <div className="flex items-center space-x-4">
                    {j.pin && <span className="text-xs text-gray-500 font-mono">PIN: {j.pin}</span>}
                    <StatusBadge status={badgeStatus} />
                    <Link to={`/jobs/${j.id}`} className="text-indigo-600 hover:text-indigo-900 text-sm">View</Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

export default SubmitJob;
