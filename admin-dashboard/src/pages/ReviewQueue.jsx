import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, Filter, Eye, AlertCircle } from 'lucide-react';

const ReviewQueue = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mock data fetch
    setTimeout(() => {
      setJobs([
        {
          id: 'j-101',
          title: 'Senior React Developer',
          company: 'TechNova Solutions',
          recruiter: 'Sarah Jenkins',
          submitted: '2023-10-24T10:30:00Z',
          flags: ['domain_too_new', 'high_salary']
        },
        {
          id: 'j-102',
          title: 'Data Entry Clerk - Remote',
          company: 'FastData Corp',
          recruiter: 'Unknown User',
          submitted: '2023-10-24T11:15:00Z',
          flags: ['company_unverified', 'suspicious_keywords']
        },
        {
          id: 'j-103',
          title: 'Marketing Manager',
          company: 'Creative Edge',
          recruiter: 'Mike Ross',
          submitted: '2023-10-24T09:00:00Z',
          flags: []
        }
      ]);
      setLoading(false);
    }, 1000);
  }, []);

  const getFlagColor = (flag) => {
    if (flag.includes('unverified') || flag.includes('suspicious')) return 'bg-red-100 text-red-800 border-red-200';
    return 'bg-amber-100 text-amber-800 border-amber-200';
  };

  const formatFlag = (flag) => {
    return flag.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading queue...</div>;
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
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Filter size={18} /> Filter
          </button>
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">No pending reviews. All caught up! 🎉</h3>
          <p className="text-gray-500">The queue is currently empty.</p>
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
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{job.title}</div>
                      <div className="text-sm text-gray-500">ID: {job.id}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{job.company}</div>
                      <div className="text-sm text-gray-500">{job.recruiter}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(job.submitted).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2">
                        {job.flags.length > 0 ? job.flags.map(flag => (
                          <span key={flag} className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getFlagColor(flag)}`}>
                            {formatFlag(flag)}
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
            <span className="text-sm text-gray-700">Showing <span className="font-medium">1</span> to <span className="font-medium">{jobs.length}</span> of <span className="font-medium">{jobs.length}</span> results</span>
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
