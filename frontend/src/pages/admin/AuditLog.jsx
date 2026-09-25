import React, { useState, useEffect } from 'react';
import { Search, Filter, Download, ChevronDown, ChevronRight, CheckCircle } from 'lucide-react';
import { admin } from '../../services/api';

const AuditLog = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(50);
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRow, setExpandedRow] = useState(null);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = {
        limit: pageSize,
        offset: page * pageSize
      };
      if (eventTypeFilter) params.eventType = eventTypeFilter;

      const res = await admin.getAuditLogs(params);
      if (res.data && res.data.data) {
        setLogs(res.data.data.logs || []);
        setTotal(res.data.data.total || 0);
      }
    } catch (err) {
      console.error('Error fetching audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, eventTypeFilter]);

  const handleExportCSV = () => {
    if (logs.length === 0) return;
    const headers = ['ID', 'Timestamp', 'Event Type', 'Actor Type', 'Actor ID', 'Target Type', 'Target ID', 'IP Address', 'Details'];
    const rows = logs.map(l => [
      l.id,
      l.created_at,
      l.event_type,
      l.actor_type,
      l.actor_id || '',
      l.target_type || '',
      l.target_id || '',
      l.ip_address || '',
      JSON.stringify(l.details || {})
    ]);

    const csvContent = [headers, ...rows].map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `TrustHire_Audit_Log_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getEventTypeColor = (type = '') => {
    if (type.includes('APPROVED') || type.includes('VERIFIED')) return 'text-green-600';
    if (type.includes('REJECTED') || type.includes('REVOKED')) return 'text-red-600';
    if (type.includes('FLAG') || type.includes('REPORT')) return 'text-amber-600';
    return 'text-blue-600';
  };

  const filteredLogs = logs.filter(l => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (l.id || '').toLowerCase().includes(q) ||
           (l.event_type || '').toLowerCase().includes(q) ||
           (l.actor_type || '').toLowerCase().includes(q) ||
           (l.target_type || '').toLowerCase().includes(q) ||
           (l.ip_address || '').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">System Audit Log</h1>
        <button 
          onClick={handleExportCSV}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm"
        >
          <Download size={18} /> Export CSV
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="Search by ID, actor, event, IP..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <select 
          value={eventTypeFilter}
          onChange={(e) => {
            setEventTypeFilter(e.target.value);
            setPage(0);
          }}
          className="border border-gray-300 rounded-lg text-sm px-3 py-2 bg-white focus:ring-blue-500 focus:border-blue-500 outline-none"
        >
          <option value="">All Event Types</option>
          <option value="JOB_APPROVED">JOB_APPROVED</option>
          <option value="JOB_REJECTED">JOB_REJECTED</option>
          <option value="VERIFICATION_REVOKED">VERIFICATION_REVOKED</option>
          <option value="REPORT_SUBMITTED">REPORT_SUBMITTED</option>
          <option value="REPORT_UPDATED">REPORT_UPDATED</option>
          <option value="RECRUITER_REGISTERED">RECRUITER_REGISTERED</option>
          <option value="VERIFICATION_LOOKUP">VERIFICATION_LOOKUP</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 font-mono text-sm">
          <thead className="bg-gray-50 font-sans">
            <tr>
              <th scope="col" className="w-8 px-4 py-3"></th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Event Type</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actor</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Target</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">IP Address</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan="6" className="px-6 py-8 text-center text-gray-500 font-sans">
                  Loading audit logs...
                </td>
              </tr>
            ) : filteredLogs.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-6 py-8 text-center text-gray-500 font-sans">
                  No audit log records found.
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => {
                const actorDisplay = `${log.actor_type || 'system'}${log.actor_id ? ` (${log.actor_id.substring(0, 8)})` : ''}`;
                const targetDisplay = `${log.target_type || '-'}${log.target_id ? ` (${log.target_id.substring(0, 8)})` : ''}`;

                return (
                  <React.Fragment key={log.id}>
                    <tr 
                      className={`hover:bg-gray-50 cursor-pointer ${expandedRow === log.id ? 'bg-blue-50' : ''}`}
                      onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                    >
                      <td className="px-4 py-3 text-gray-400">
                        {expandedRow === log.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className={`px-4 py-3 whitespace-nowrap font-semibold ${getEventTypeColor(log.event_type)}`}>
                        {log.event_type}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-900">
                        {actorDisplay}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-900">
                        {targetDisplay}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500 text-xs">
                        {log.ip_address || 'N/A'}
                      </td>
                    </tr>
                    {expandedRow === log.id && (
                      <tr>
                        <td colSpan="6" className="px-8 py-4 bg-gray-900 text-green-400 border-b border-gray-200 overflow-x-auto">
                          <pre className="text-xs">
{JSON.stringify({
  id: log.id,
  created_at: log.created_at,
  event_type: log.event_type,
  actor_type: log.actor_type,
  actor_id: log.actor_id,
  target_type: log.target_type,
  target_id: log.target_id,
  ip_address: log.ip_address,
  user_agent: log.user_agent,
  details: log.details
}, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
        <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 flex items-center justify-between font-sans">
          <span className="text-sm text-gray-700">
            Showing <span className="font-medium">{total === 0 ? 0 : page * pageSize + 1}</span> to <span className="font-medium">{Math.min((page + 1) * pageSize, total)}</span> of <span className="font-medium">{total}</span> entries
          </span>
          <div className="flex gap-2">
            <button 
              disabled={page === 0} 
              onClick={() => setPage(p => Math.max(0, p - 1))}
              className="px-3 py-1 border border-gray-300 rounded text-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:bg-gray-100"
            >
              Previous
            </button>
            <button 
              disabled={(page + 1) * pageSize >= total} 
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1 border border-gray-300 rounded text-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:bg-gray-100"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuditLog;
