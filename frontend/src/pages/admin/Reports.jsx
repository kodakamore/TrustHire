import React, { useState, useEffect } from 'react';
import { Flag, Eye, CheckCircle, Ban, Search, Filter } from 'lucide-react';
import ConfirmModal from '../../components/ConfirmModal';
import { admin } from '../../services/api';

const Reports = () => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);

  const fetchReports = async () => {
    try {
      setLoading(true);
      const res = await admin.getReports();
      if (res.data && res.data.data) {
        const mapped = res.data.data.map(r => ({
          id: r.id,
          date: r.created_at,
          jobTitle: r.job_title || 'Unknown Job Title',
          jobId: r.job_ad_id,
          companyName: r.company_name || 'N/A',
          reporterEmail: r.reporter_email || 'Anonymous',
          reason: r.report_reason,
          description: r.admin_notes || r.report_reason,
          status: r.status === 'open' ? 'pending' : r.status
        }));
        setReports(mapped);
      }
    } catch (err) {
      console.error('Error fetching reports:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const getStatusBadge = (status) => {
    switch(status) {
      case 'open':
      case 'pending': 
        return <span className="bg-yellow-100 text-yellow-800 px-2.5 py-0.5 rounded-full text-xs font-medium">Pending</span>;
      case 'reviewed': 
        return <span className="bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-full text-xs font-medium">Under Review</span>;
      case 'resolved': 
        return <span className="bg-green-100 text-green-800 px-2.5 py-0.5 rounded-full text-xs font-medium">Resolved</span>;
      default: 
        return <span className="bg-gray-100 text-gray-800 px-2.5 py-0.5 rounded-full text-xs font-medium">{status}</span>;
    }
  };

  const handleStatusUpdate = async (id, newStatus) => {
    try {
      await admin.updateReport(id, { status: newStatus });
      setReports(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update report status.');
    }
  };

  const handleRevoke = async () => {
    if (!selectedReport) return;
    try {
      if (selectedReport.jobId) {
        await admin.revokeVerification(selectedReport.jobId, { 
          reason: `Verification revoked following report: ${selectedReport.reason}` 
        });
      }
      await handleStatusUpdate(selectedReport.id, 'resolved');
      setShowRevokeModal(false);
      alert('Verification revoked and report marked as resolved.');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to revoke job verification.');
    }
  };

  const filteredReports = reports.filter(r => {
    if (statusFilter !== 'all') {
      if (statusFilter === 'pending' && r.status !== 'pending' && r.status !== 'open') return false;
      if (statusFilter === 'reviewed' && r.status !== 'reviewed') return false;
      if (statusFilter === 'resolved' && r.status !== 'resolved') return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (r.jobTitle || '').toLowerCase().includes(q) ||
           (r.reporterEmail || '').toLowerCase().includes(q) ||
           (r.reason || '').toLowerCase().includes(q);
  });

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
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg text-sm px-3 py-2 bg-white focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="reviewed">Under Review</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-gray-500">Loading reports...</div>
      ) : filteredReports.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <div className="w-14 h-14 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <CheckCircle className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">
            {reports.length === 0 ? 'No user reports submitted.' : 'No reports matching search.'}
          </h3>
          <p className="text-gray-500 text-sm">
            {reports.length === 0 ? 'All job advertisements are clear of user disputes.' : 'Try adjusting your search criteria or status filter.'}
          </p>
        </div>
      ) : (
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
              {filteredReports.map((report) => (
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
      )}

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
