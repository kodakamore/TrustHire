import React, { useState } from 'react';
import { Search, Filter, Download, ChevronDown, ChevronRight } from 'lucide-react';

const AuditLog = () => {
  const [logs] = useState([
    { id: 'al-101', timestamp: '2023-10-25T14:30:22Z', type: 'JOB_APPROVED', actor: 'Admin: Sarah (admin_2)', target: 'Job: j-101', ip: '192.168.1.1', details: '{"jobId":"j-101", "recruiterId":"r-55", "notes":""}' },
    { id: 'al-102', timestamp: '2023-10-25T13:15:05Z', type: 'REPORT_RESOLVED', actor: 'Admin: Mike (admin_1)', target: 'Report: rep-003', ip: '10.0.0.5', details: '{"reportId":"rep-003", "action":"dismissed"}' },
    { id: 'al-103', timestamp: '2023-10-25T11:45:10Z', type: 'SYS_FLAG_RAISED', actor: 'System Auto-mod', target: 'Job: j-102', ip: '127.0.0.1', details: '{"jobId":"j-102", "flags":["company_unverified", "suspicious_keywords"]}' },
    { id: 'al-104', timestamp: '2023-10-25T09:20:00Z', type: 'RECRUITER_VERIFIED', actor: 'System webhook', target: 'Recruiter: r-88', ip: '198.51.100.2', details: '{"provider":"SmileID", "matchScore":96}' },
    { id: 'al-105', timestamp: '2023-10-24T16:05:33Z', type: 'JOB_REJECTED', actor: 'Admin: Sarah (admin_2)', target: 'Job: j-098', ip: '192.168.1.1', details: '{"jobId":"j-098", "reason":"Unable to verify company CAC registration"}' },
  ]);

  const [expandedRow, setExpandedRow] = useState(null);

  const getEventTypeColor = (type) => {
    if (type.includes('APPROVED') || type.includes('VERIFIED')) return 'text-green-600';
    if (type.includes('REJECTED') || type.includes('REVOKED')) return 'text-red-600';
    if (type.includes('FLAG') || type.includes('REPORT')) return 'text-amber-600';
    return 'text-blue-600';
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">System Audit Log</h1>
        <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
          <Download size={18} /> Export CSV
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="Search by ID, actor, target..." 
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <select className="border border-gray-300 rounded-lg text-sm px-3 py-2 bg-white focus:ring-blue-500 focus:border-blue-500 outline-none">
          <option value="">All Event Types</option>
          <option value="JOB_APPROVED">JOB_APPROVED</option>
          <option value="JOB_REJECTED">JOB_REJECTED</option>
          <option value="SYS_FLAG_RAISED">SYS_FLAG_RAISED</option>
        </select>
        <input 
          type="date" 
          className="border border-gray-300 rounded-lg text-sm px-3 py-2 bg-white focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
        <button className="px-4 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-sm font-medium hover:bg-blue-100">
          Apply Filters
        </button>
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
            {logs.map((log) => (
              <React.Fragment key={log.id}>
                <tr 
                  className={`hover:bg-gray-50 cursor-pointer ${expandedRow === log.id ? 'bg-blue-50' : ''}`}
                  onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                >
                  <td className="px-4 py-3 text-gray-400">
                    {expandedRow === log.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className={`px-4 py-3 whitespace-nowrap font-semibold ${getEventTypeColor(log.type)}`}>
                    {log.type}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-900">
                    {log.actor}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-900">
                    {log.target}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-500 text-xs">
                    {log.ip}
                  </td>
                </tr>
                {expandedRow === log.id && (
                  <tr>
                    <td colSpan="6" className="px-8 py-4 bg-gray-900 text-green-400 border-b border-gray-200 overflow-x-auto">
                      <pre className="text-xs">
{`{
  "id": "${log.id}",
  "timestamp": "${log.timestamp}",
  "type": "${log.type}",
  "actor": "${log.actor}",
  "target": "${log.target}",
  "ip": "${log.ip}",
  "details": ${log.details}
}`}
                      </pre>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 flex items-center justify-between font-sans">
          <span className="text-sm text-gray-700">Showing <span className="font-medium">1</span> to <span className="font-medium">{logs.length}</span> of <span className="font-medium">{logs.length}</span> entries</span>
          <div className="flex gap-2">
            <button disabled className="px-3 py-1 border border-gray-300 rounded text-sm text-gray-400 bg-gray-100">Previous</button>
            <button disabled className="px-3 py-1 border border-gray-300 rounded text-sm text-gray-400 bg-gray-100">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuditLog;
