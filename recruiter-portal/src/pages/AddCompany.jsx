import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';

const AddCompany = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    rcNumber: '',
    tinNumber: '',
    websiteUrl: '',
    address: '',
    industry: '',
    email: '',
    phone: '',
  });

  const [companyId, setCompanyId] = useState(null);
  const [verificationStatus, setVerificationStatus] = useState({
    cac: 'pending',
    tin: 'pending',
    website: 'pending'
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    // Mock API call to create company
    setTimeout(() => {
      setCompanyId(123); // Mock ID
      setLoading(false);
    }, 1000);
  };

  const handleVerifyCAC = () => {
    setVerificationStatus(prev => ({ ...prev, cac: 'under_review' }));
    setTimeout(() => setVerificationStatus(prev => ({ ...prev, cac: 'verified' })), 1500);
  };

  const handleVerifyTIN = () => {
    setVerificationStatus(prev => ({ ...prev, tin: 'under_review' }));
    setTimeout(() => setVerificationStatus(prev => ({ ...prev, tin: 'verified' })), 1500);
  };

  const handleVerifyWebsite = () => {
    setVerificationStatus(prev => ({ ...prev, website: 'under_review' }));
    setTimeout(() => setVerificationStatus(prev => ({ ...prev, website: 'verified' })), 1500);
  };

  if (companyId) {
    return (
      <div className="max-w-3xl mx-auto bg-white p-8 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Verify Company</h2>
        <p className="text-gray-600 mb-8">Company created successfully! Now let's verify its details.</p>
        
        <div className="space-y-6">
          <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div>
              <p className="font-medium text-gray-900">CAC Registration (RC Number)</p>
              <p className="text-sm text-gray-500">{formData.rcNumber}</p>
            </div>
            <div className="flex items-center space-x-4">
              <StatusBadge status={verificationStatus.cac} />
              {verificationStatus.cac === 'pending' && (
                <button onClick={handleVerifyCAC} className="text-sm bg-indigo-100 text-indigo-700 px-3 py-1 rounded hover:bg-indigo-200">Verify</button>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div>
              <p className="font-medium text-gray-900">TIN Number</p>
              <p className="text-sm text-gray-500">{formData.tinNumber || 'Not provided'}</p>
            </div>
            <div className="flex items-center space-x-4">
              <StatusBadge status={verificationStatus.tin} />
              {verificationStatus.tin === 'pending' && formData.tinNumber && (
                <button onClick={handleVerifyTIN} className="text-sm bg-indigo-100 text-indigo-700 px-3 py-1 rounded hover:bg-indigo-200">Verify</button>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div>
              <p className="font-medium text-gray-900">Company Website</p>
              <p className="text-sm text-gray-500">{formData.websiteUrl}</p>
            </div>
            <div className="flex items-center space-x-4">
              <StatusBadge status={verificationStatus.website} />
              {verificationStatus.website === 'pending' && (
                <button onClick={handleVerifyWebsite} className="text-sm bg-indigo-100 text-indigo-700 px-3 py-1 rounded hover:bg-indigo-200">Verify</button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <button 
            onClick={() => navigate('/dashboard')}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto bg-white p-8 rounded-lg shadow-sm border border-gray-200">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Add New Company</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">Company Name</label>
            <input type="text" name="name" required value={formData.name} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">RC Number (CAC)</label>
            <input type="text" name="rcNumber" required value={formData.rcNumber} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">TIN Number (Optional)</label>
            <input type="text" name="tinNumber" value={formData.tinNumber} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Website URL</label>
            <input type="url" name="websiteUrl" required value={formData.websiteUrl} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Company Email</label>
            <input type="email" name="email" required value={formData.email} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Company Phone</label>
            <input type="tel" name="phone" required value={formData.phone} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Industry</label>
            <select name="industry" required value={formData.industry} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm">
              <option value="">Select Industry</option>
              <option value="Technology">Technology</option>
              <option value="Finance">Finance</option>
              <option value="Healthcare">Healthcare</option>
              <option value="Education">Education</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Address</label>
          <textarea name="address" required rows="3" value={formData.address} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm"></textarea>
        </div>
        <div className="flex justify-end">
          <button type="submit" disabled={loading} className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50">
            {loading ? 'Saving...' : 'Save & Continue to Verification'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddCompany;
