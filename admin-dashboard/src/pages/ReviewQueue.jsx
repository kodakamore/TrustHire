import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, Filter, Eye, AlertCircle, RefreshCw } from 'lucide-react';
import adminApi from '../services/api';

const recruiterName = (job) => {
  const name = [job.recruiter_first_name, job.recruiter_last_name].filter(Boolean).join(' ').trim();
  return name || job.recruiter_email || 'Unknown recruiter';
};

// System flags come back as JSONB objects ({type, reason, ...}) or legacy strings.
const normalizeFlags = (flags) =>
  (Array.isArray(flags) ? flags : []).map((flag, idx) => {
    const type = typeof flag === 'string' ? flag : (flag?.type || 'flag');
    return {
      key: `${type}-${idx}`,
      type,
      reason: typeof flag === 'string' ? null : (flag.reason || null),
    };
  });

const ReviewQueue = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const loadQueue = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminApi.getQueue();
      setJobs(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to load the review queue.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const getFlagColor = (flag) => {
    if (flag.includes('unverified') || flag.includes('suspicious') || flag.includes('rejection') || flag.includes('admin')) return 'bg-red-100 text-red-800 border-red-200';
    return 'bg-amber-100 text-amber-800 border-amber-200';
  };

  const formatFlag = (flag) => {
    return flag.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const visibleJobs = jobs.filter((job) => {
    if (!search.trim()) return true;
    const needle = search.toLowerCase();
    return [job.title, job.company_name, recruiterName(job)]
      .filter(Boolean)
      .some(v => String(v).toLowerCase().includes(needle));
  });

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading queue...</div>;
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="mx-auto text-red-500 mb-3" size={32} />
        <p className="text-sm text-red-600 mb-4">{error}</p>
        <button
          onClick={loadQueue}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw size={16} /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Review Queue</h1>
        <div className="flex gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Search queue..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Filter size={18} /> Filter
          </button>
        </div>
      </div>

      {visibleJobs.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">
            {jobs.length === 0 ? 'No pending reviews. All caught up! 🎉' : 'No jobs match your search.'}
          </h3>
          <p className="text-gray-500">
            {jobs.length === 0 ? 'The queue is currently empty.' : 'Try a different search term.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Job Title</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company & Recruiter</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">System Flags</th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {visibleJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{job.title}</div>
                      <div className="text-sm text-gray-500">ID: {job.id}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{job.company_name || 'Unknown company'}</div>
                      <div className="text-sm text-gray-500">{recruiterName(job)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {job.created_at ? new Date(job.created_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2">
                        {normalizeFlags(job.flags).length > 0 ? normalizeFlags(job.flags).map(flag => (
                          <span
                            key={flag.key}
                            title={flag.reason || undefined}
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getFlagColor(flag.type)}`}
                          >
                            {formatFlag(flag.type)}
                          </span>
                        )) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                            Clear
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <Link 
                        to={`/queue/${job.id}`}
                        className="inline-flex items-center gap-1 bg-blue-50 text-blue-600 hover:text-blue-900 hover:bg-blue-100 px-3 py-1.5 rounded-md transition-colors"
                      >
                        <Eye size={16} /> Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 flex items-center justify-between">
            <span className="text-sm text-gray-700">Showing <span className="font-medium">1</span> to <span className="font-medium">{visibleJobs.length}</span> of <span className="font-medium">{visibleJobs.length}</span> results</span>
            <div className="flex gap-2">
              <button disabled className="px-3 py-1 border border-gray-300 rounded text-sm text-gray-400 bg-gray-100">Previous</button>
              <button disabled className="px-3 py-1 border border-gray-300 rounded text-sm text-gray-400 bg-gray-100">Next</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewQueue;
