import React, { useState } from 'react';
import { Flag, Eye, CheckCircle, Ban, Search, Filter } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';

const Reports = () => {
  const [reports, setReports] = useState([
    {
      id: 'rep-001',
      date: '2023-10-25T14:20:00Z',
      jobTitle: 'Remote Data Analyst',
      jobId: 'job-554',
      reporterEmail: 'applicant1@gmail.com',
      reason: 'Asked for money during interview',
      description: 'The recruiter asked me to pay a 5000 NGN "processing fee" before they could schedule the final interview round.',
      status: 'pending'
    },
    {
      id: 'rep-002',
      date: '2023-10-24T09:15:00Z',
      jobTitle: 'Frontend Engineer',
      jobId: 'job-892',
      reporterEmail: 'dev.john@yahoo.com',
      reason: 'Job does not exist',
      description: 'I contacted the company directly and they said they are not hiring for this position. The poster seems to be impersonating them.',
      status: 'reviewed'
    },
    {
      id: 'rep-003',
      date: '2023-10-22T16:45:00Z',
      jobTitle: 'Sales Representative',
      jobId: 'job-102',
      reporterEmail: 'sarah.m@gmail.com',
      reason: 'Pyramid scheme',
      description: 'This is actually a multi-level marketing scheme, not a salaried position as advertised.',
      status: 'resolved'
    }
  ]);

  const [expandedId, setExpandedId] = useState(null);
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);

  const getStatusBadge = (status) => {
    switch(status) {
      case 'pending': return <span className="bg-yellow-100 text-yellow-800 px-2.5 py-0.5 rounded-full text-xs font-medium">Pending</span>;
      case 'reviewed': return <span className="bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-full text-xs font-medium">Under Review</span>;
      case 'resolved': return <span className="bg-green-100 text-green-800 px-2.5 py-0.5 rounded-full text-xs font-medium">Resolved</span>;
      default: return <span className="bg-gray-100 text-gray-800 px-2.5 py-0.5 rounded-full text-xs font-medium">{status}</span>;
    }
  };

  const handleStatusUpdate = (id, newStatus) => {
    setReports(reports.map(r => r.id === id ? { ...r, status: newStatus } : r));
  };

  const handleRevoke = () => {
    // API call would go here
    handleStatusUpdate(selectedReport.id, 'resolved');
    setShowRevokeModal(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">User Reports</h1>
        <div className="flex gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Search reports..." 
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <select className="border border-gray-300 rounded-lg text-sm px-3 py-2 bg-white focus:ring-blue-500 focus:border-blue-500 outline-none">
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="reviewed">Under Review</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Job / Reporter</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {reports.map((report) => (
              <React.Fragment key={report.id}>
                <tr className={`hover:bg-gray-50 transition-colors ${expandedId === report.id ? 'bg-blue-50/30' : ''}`}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(report.date).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{report.jobTitle}</div>
                    <div className="text-sm text-gray-500">{report.reporterEmail}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {report.reason}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(report.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <button 
                      onClick={() => setExpandedId(expandedId === report.id ? null : report.id)}
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-900 px-2 py-1 rounded"
                    >
                      <Eye size={16} /> Details
                    </button>
                  </td>
                </tr>
                {/* Expanded Details Row */}
                {expandedId === report.id && (
                  <tr>
                    <td colSpan="5" className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                      <div className="max-w-4xl">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Detailed Description</h4>
                        <p className="text-sm text-gray-800 bg-white p-4 border border-gray-200 rounded-md mb-4">
                          {report.description}
                        </p>
                        
                        <div className="flex gap-3 pt-2 border-t border-gray-200">
                          {report.status === 'pending' && (
                            <button 
                              onClick={() => handleStatusUpdate(report.id, 'reviewed')}
                              className="inline-flex items-center gap-1 text-sm bg-blue-100 text-blue-700 hover:bg-blue-200 px-3 py-1.5 rounded-md font-medium"
                            >
                              Mark as Reviewed
                            </button>
                          )}
                          
                          <button 
                            onClick={() => {
                              setSelectedReport(report);
                              setShowRevokeModal(true);
                            }}
                            className="inline-flex items-center gap-1 text-sm bg-red-100 text-red-700 hover:bg-red-200 px-3 py-1.5 rounded-md font-medium"
                          >
                            <Ban size={16} /> Revoke Job Verification
                          </button>
                          
                          {report.status !== 'resolved' && (
                            <button 
                              onClick={() => handleStatusUpdate(report.id, 'resolved')}
                              className="inline-flex items-center gap-1 text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 px-3 py-1.5 rounded-md font-medium ml-auto"
                            >
                              <CheckCircle size={16} /> Dismiss / Resolve
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Revoke Modal */}
      <ConfirmModal 
        isOpen={showRevokeModal}
        title="Revoke Verification"
        message={`Are you sure you want to revoke verification for the job "${selectedReport?.jobTitle}"? This will hide it from the public platform and notify the recruiter.`}
        confirmText="Yes, Revoke"
        variant="danger"
        onConfirm={handleRevoke}
        onCancel={() => setShowRevokeModal(false)}
      />
    </div>
  );
};

export default Reports;
