import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';
import { company as companyApi } from '../services/api';

const CHECK_LABELS = [
  ['cac', 'CAC Registration'],
  ['website', 'Domain Safety & Age'],
  ['corporateEmail', 'Corporate Work Email'],
  ['websiteContentMatch', 'Website Content Match'],
];

const CompanyDetails = () => {
  const { id } = useParams();
  const [record, setRecord] = useState(null);
  const [checks, setChecks] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      const [recRes, statusRes] = await Promise.allSettled([
        companyApi.get(id),
        companyApi.getStatus(id),
      ]);

      const recordData =
        recRes.status === 'fulfilled' ? recRes.value.data?.data : null;
      const statusData =
        statusRes.status === 'fulfilled' ? statusRes.value.data?.data : null;

      // The status payload carries the `checks` map; the plain record is the
      // fallback when only that call succeeds.
      setRecord(recordData || statusData);
      setChecks(statusData?.checks || null);

      if (!recordData && !statusData) {
        const failed = recRes.status === 'rejected' ? recRes.reason : statusRes.reason;
        setError(failed?.response?.data?.error || 'Could not load this company. It may have been removed.');
      }
      setLoading(false);
    };

    load();
  }, [id]);

  if (loading) {
    return (
      <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200 max-w-3xl mx-auto text-center text-gray-500">
        Loading company...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200 max-w-3xl mx-auto text-center">
        <p className="text-red-600 text-sm mb-4">{error}</p>
        <Link to="/dashboard" className="text-indigo-600 hover:text-indigo-800 font-medium">
          &larr; Back to Dashboard
        </Link>
      </div>
    );
  }

  if (!record) return null;

  const website = record.website_url
    ? (/^https?:\/\//i.test(record.website_url) ? record.website_url : `https://${record.website_url}`)
    : null;

  return (
    <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200 max-w-3xl mx-auto">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{record.name}</h1>
          <p className="text-gray-500">{record.registration_number || 'No RC number on file'}</p>
        </div>
        <StatusBadge status={record.verification_status || 'pending'} />
      </div>

      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-medium text-gray-900 border-b pb-2 mb-4">Company Information</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Industry</p>
              <p className="font-medium text-gray-900">{record.industry || '—'}</p>
            </div>
            <div>
              <p className="text-gray-500">Website</p>
              {website ? (
                <a href={website} target="_blank" rel="noreferrer" className="font-medium text-indigo-600 hover:underline">{record.website_url}</a>
              ) : (
                <p className="font-medium text-gray-900">—</p>
              )}
            </div>
            <div>
              <p className="text-gray-500">TIN</p>
              <p className="font-medium text-gray-900">{record.tin_number || 'Not provided'}</p>
            </div>
            <div>
              <p className="text-gray-500">Corporate Email</p>
              <p className="font-medium text-gray-900">{record.corporate_email || 'Not verified'}</p>
            </div>
            <div className="col-span-2">
              <p className="text-gray-500">Address</p>
              <p className="font-medium text-gray-900">{record.address || '—'}</p>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-medium text-gray-900 border-b pb-2 mb-4">Verification Checks</h3>
          {checks ? (
            <ul className="divide-y divide-gray-100 text-sm">
              {CHECK_LABELS.map(([key, label]) => (
                <li key={key} className="py-3 flex justify-between items-center">
                  <span className="text-gray-700">{label}</span>
                  <StatusBadge status={checks[key] || 'pending'} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">No verification checks have been run yet.</p>
          )}
        </div>

        <div className="pt-4">
          <Link to="/dashboard" className="text-indigo-600 hover:text-indigo-800 font-medium">
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
};

export default CompanyDetails;
