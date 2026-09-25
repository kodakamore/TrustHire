import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';

const SubmitJob = () => {
  const navigate = useNavigate();
  // Mocking verified state
  const isRecruiterVerified = true;
  const verifiedCompanies = [
    { id: 1, name: 'TechCorp Nigeria', status: 'verified' }
  ];

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
  const [success, setSuccess] = useState(false);

  if (!isRecruiterVerified) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 p-6 rounded-lg max-w-2xl mx-auto text-center">
        <h2 className="text-xl font-bold text-yellow-800 mb-2">Verification Required</h2>
        <p className="text-yellow-700 mb-4">You must complete your recruiter identity verification before submitting jobs.</p>
        <Link to="/verify-identity" className="inline-block bg-yellow-600 text-white px-4 py-2 rounded font-medium hover:bg-yellow-700">Go to Verification</Link>
      </div>
    );
  }

  if (verifiedCompanies.length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 p-6 rounded-lg max-w-2xl mx-auto text-center">
        <h2 className="text-xl font-bold text-yellow-800 mb-2">Verified Company Required</h2>
        <p className="text-yellow-700 mb-4">You must have at least one verified company before submitting jobs.</p>
        <Link to="/companies/new" className="inline-block bg-yellow-600 text-white px-4 py-2 rounded font-medium hover:bg-yellow-700">Add a Company</Link>
      </div>
    );
  }

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    // Mock API Submit
    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
    }, 1500);
  };

  if (success) {
    return (
      <div className="max-w-2xl mx-auto bg-white p-8 rounded-lg shadow-sm border border-gray-200 text-center">
        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Job Submitted Successfully!</h2>
        <p className="text-gray-600 mb-6">Your job advertisement has been submitted. It is currently <StatusBadge status="under_review" /> and will receive a Verification PIN once approved.</p>
        <button onClick={() => navigate('/dashboard')} className="bg-indigo-600 text-white px-6 py-2 rounded-md hover:bg-indigo-700">Return to Dashboard</button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto bg-white p-8 rounded-lg shadow-sm border border-gray-200">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Submit Job Advertisement</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700">Company</label>
            <select name="companyId" required value={formData.companyId} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm">
              <option value="">Select a Verified Company</option>
              {verifiedCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
            <input type="email" name="applicationEmail" value={formData.applicationEmail} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm" />
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
          <button type="submit" disabled={loading} className="bg-indigo-600 text-white px-6 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50">
            {loading ? 'Submitting...' : 'Submit Job for Verification'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SubmitJob;
