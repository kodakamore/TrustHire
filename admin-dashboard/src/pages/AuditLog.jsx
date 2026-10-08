import React, { useState, useEffect } from 'react';
import { Search, Download, ChevronDown, ChevronRight, RefreshCw, AlertCircle } from 'lucide-react';
import adminApi from '../services/api';

const humanize = (s) =>
  String(s || '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

const AuditLog = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [expandedRow, setExpandedRow] = useState(null);

  const loadLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminApi.getAuditLogs({ limit: 100 });
      setLogs(res?.data?.logs || []);
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to load audit logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const eventTypes = [...new Set(logs.map(l => l.event_type).filter(Boolean))].sort();

  const visibleLogs = logs.filter((log) => {
    if (eventTypeFilter && log.event_type !== eventTypeFilter) return false;
    if (!search.trim()) return true;
    const needle = search.toLowerCase();
    return [log.event_type, log.actor_type, log.actor_id, log.target_type, log.target_id, log.ip_address]
      .filter(Boolean)
      .some(v => String(v).toLowerCase().includes(needle));
  });

  const getEventTypeColor = (type) => {
    if (type.includes('APPROVED') || type.includes('VERIFIED')) return 'text-green-600';
    if (type.includes('REJECTED') || type.includes('REVOKED') || type.includes('COMPROMISED')) return 'text-red-600';
    if (type.includes('FLAG') || type.includes('REPORT') || type.includes('ESCALAT')) return 'text-amber-600';
    return 'text-blue-600';
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">System Audit Log</h1>
        <div className="flex gap-3">
          <button
            onClick={() => {
              const rows = [
                ['Timestamp', 'Event Type', 'Actor', 'Target', 'IP Address'],
                ...visibleLogs.map(l => [
                  l.created_at || '',
                  l.event_type || '',
                  `${l.actor_type || 'system'}${l.actor_id ? ` (${l.actor_id})` : ''}`,
                  `${l.target_type || ''}${l.target_id ? ` (${l.target_id})` : ''}`,
                  l.ip_address || '',
                ]),
              ];
              const csv = rows
                .map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
                .join('\n');
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'audit-log.csv';
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download size={18} /> Export CSV
          </button>
          <button
            onClick={loadLogs}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw size={18} /> Refresh
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="Search by ID, actor, target..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <select
          value={eventTypeFilter}
          onChange={(e) => setEventTypeFilter(e.target.value)}
          className="border border-gray-300 rounded-lg text-sm px-3 py-2 bg-white focus:ring-blue-500 focus:border-blue-500 outline-none"
        >
          <option value="">All Event Types</option>
          {eventTypes.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-lg flex items-center justify-between gap-3">
          <span className="flex items-center gap-2"><AlertCircle size={16} /> {error}</span>
          <button onClick={loadLogs} className="inline-flex items-center gap-1.5 font-medium text-red-800 hover:underline">
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-500">
          Loading audit logs…
        </div>
      ) : (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
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
              {visibleLogs.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-4 py-10 text-center text-sm text-gray-500 font-sans">
                    {logs.length === 0 ? 'No audit entries recorded yet.' : 'No entries match your filters.'}
                  </td>
                </tr>
              )}
              {visibleLogs.map((log) => (
                <React.Fragment key={log.id}>
                  <tr 
                    className={`hover:bg-gray-50 cursor-pointer ${expandedRow === log.id ? 'bg-blue-50' : ''}`}
                    onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                  >
                    <td className="px-4 py-3 text-gray-400">
                      {expandedRow === log.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                      {log.created_at ? new Date(log.created_at).toLocaleString() : '—'}
                    </td>
                    <td className={`px-4 py-3 whitespace-nowrap font-semibold ${getEventTypeColor(log.event_type || '')}`}>
                      {log.event_type}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-900">
                      {humanize(log.actor_type || 'system')}{log.actor_id ? `: ${String(log.actor_id).slice(0, 8)}` : ''}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-900">
                      {humanize(log.target_type || '')}{log.target_id ? `: ${String(log.target_id).slice(0, 8)}` : ''}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500 text-xs">
                      {log.ip_address || '—'}
                    </td>
                  </tr>
                  {expandedRow === log.id && (
                    <tr>
                      <td colSpan="6" className="px-8 py-4 bg-gray-900 text-green-400 border-b border-gray-200 overflow-x-auto">
                        <pre className="text-xs">
{JSON.stringify({
  id: log.id,
  timestamp: log.created_at,
  type: log.event_type,
  actor: `${log.actor_type || 'system'}${log.actor_id ? ` (${log.actor_id})` : ''}`,
  target: `${log.target_type || ''}${log.target_id ? ` (${log.target_id})` : ''}`,
  ip: log.ip_address,
  details: log.details,
}, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 flex items-center justify-between font-sans">
          <span className="text-sm text-gray-700">Showing <span className="font-medium">{visibleLogs.length}</span> of <span className="font-medium">{logs.length}</span> entries</span>
        </div>
      </div>
      )}
    </div>
  );
};

export default AuditLog;
