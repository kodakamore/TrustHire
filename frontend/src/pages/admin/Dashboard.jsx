import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, Briefcase, Clock, AlertTriangle, ChevronRight, ScrollText, ShieldCheck, ShieldOff } from 'lucide-react';
import StatsCard from '../../components/StatsCard';
import StatusBadge from '../../components/StatusBadge';
import { admin } from '../../services/api';

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [recruiters, setRecruiters] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const fetchAll = async () => {
      try {
        const [statsRes, logsRes, recruitersRes] = await Promise.allSettled([
          admin.getStats(),
          admin.getAuditLogs({ limit: 6 }),
          admin.getRecruiters(),
        ]);

        if (!isMounted) return;

        if (statsRes.status === 'fulfilled' && statsRes.value?.data?.data) {
          setStats(statsRes.value.data.data);
        } else {
          setError('Could not load stats from the database.');
        }

        if (logsRes.status === 'fulfilled' && logsRes.value?.data?.data?.logs) {
          setRecentActivity(
            logsRes.value.data.data.logs.map((log) => ({
              id: log.id,
              action: log.event_type?.replace(/_/g, ' ') || 'System Event',
              detail: log.target_type
                ? `${log.target_type.replace(/_/g, ' ')}${log.actor_id ? ` · ${log.actor_type}` : ''}`
                : 'System',
              time: log.created_at
                ? new Date(log.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
                : '—',
              type: log.event_type?.includes('APPROVED') || log.event_type?.includes('VERIFIED')
                ? 'success'
                : log.event_type?.includes('REJECTED') || log.event_type?.includes('REVOKED')
                ? 'danger'
                : 'info',
            }))
          );
        }

        if (recruitersRes.status === 'fulfilled' && recruitersRes.value?.data?.data) {
          setRecruiters(recruitersRes.value.data.data);
        }
      } catch (err) {
        if (isMounted) setError('Failed to load dashboard data.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchAll();
    return () => { isMounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm animate-pulse">
        Loading dashboard data from database...
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-xl text-sm">
        <p className="font-bold mb-1">Dashboard Error</p>
        <p>{error}</p>
        <p className="mt-2 text-xs text-red-500">Make sure the backend is running and the database is connected.</p>
      </div>
    );
  }

  const dotColor = (type) =>
    type === 'success' ? 'bg-emerald-500' :
    type === 'danger'  ? 'bg-red-500' :
    type === 'warning' ? 'bg-amber-500' : 'bg-blue-500';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard Overview</h1>

      {/* ── Stats Grid ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Total Recruiters"
          value={(stats?.totalRecruiters ?? 0).toLocaleString()}
          icon={<Users size={24} />}
        />
        <StatsCard
          title="Total Jobs"
          value={(stats?.totalJobs ?? 0).toLocaleString()}
          icon={<Briefcase size={24} />}
        />

        {/* Pending Reviews — amber when non-zero */}
        <div className={`bg-white rounded-xl shadow-sm border ${stats?.pendingReviews > 0 ? 'border-amber-300' : 'border-gray-100'} p-6 flex items-center`}>
          <div className={`p-4 rounded-lg ${stats?.pendingReviews > 0 ? 'bg-amber-100 text-amber-600' : 'bg-blue-50 text-blue-600'} mr-5`}>
            <Clock size={24} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-500 mb-1">Pending Reviews</p>
            <h3 className="text-2xl font-bold text-gray-900">{stats?.pendingReviews ?? 0}</h3>
            {stats?.pendingReviews > 0 && (
              <Link to="/admin/queue" className="text-xs text-amber-600 font-medium hover:underline">
                Review now →
              </Link>
            )}
          </div>
        </div>

        {/* Active Reports — red when non-zero */}
        <div className={`bg-white rounded-xl shadow-sm border ${stats?.activeReports > 0 ? 'border-red-300' : 'border-gray-100'} p-6 flex items-center`}>
          <div className={`p-4 rounded-lg ${stats?.activeReports > 0 ? 'bg-red-100 text-red-600' : 'bg-blue-50 text-blue-600'} mr-5`}>
            <AlertTriangle size={24} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-500 mb-1">Open Reports</p>
            <h3 className="text-2xl font-bold text-gray-900">{stats?.activeReports ?? 0}</h3>
            {stats?.activeReports > 0 && (
              <Link to="/admin/reports" className="text-xs text-red-600 font-medium hover:underline">
                View reports →
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── Second row: Active Verifications + Quick Actions ─────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex items-center">
          <div className="p-4 rounded-lg bg-emerald-50 text-emerald-600 mr-5">
            <ShieldCheck size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">Active Verifications</p>
            <h3 className="text-2xl font-bold text-gray-900">{stats?.activeVerifications ?? 0}</h3>
            <p className="text-xs text-gray-400 mt-1">Live PIN / QR codes</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="md:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-sm font-semibold text-gray-700 px-2 mb-3">Quick Actions</p>
          <div className="grid grid-cols-3 gap-3">
            <Link to="/admin/queue" className="flex flex-col items-center gap-2 p-3 rounded-lg border border-gray-100 hover:bg-slate-50 transition-colors text-center group">
              <div className="p-2 bg-blue-100 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <Clock size={18} />
              </div>
              <p className="text-xs font-medium text-gray-700">Review Queue</p>
            </Link>
            <Link to="/admin/reports" className="flex flex-col items-center gap-2 p-3 rounded-lg border border-gray-100 hover:bg-slate-50 transition-colors text-center group">
              <div className="p-2 bg-red-100 text-red-600 rounded-lg group-hover:bg-red-600 group-hover:text-white transition-colors">
                <AlertTriangle size={18} />
              </div>
              <p className="text-xs font-medium text-gray-700">Reports</p>
            </Link>
            <Link to="/admin/audit" className="flex flex-col items-center gap-2 p-3 rounded-lg border border-gray-100 hover:bg-slate-50 transition-colors text-center group">
              <div className="p-2 bg-slate-100 text-slate-600 rounded-lg group-hover:bg-slate-600 group-hover:text-white transition-colors">
                <ScrollText size={18} />
              </div>
              <p className="text-xs font-medium text-gray-700">Audit Log</p>
            </Link>
          </div>
        </div>
      </div>

      {/* ── Third row: Recent Activity + Recruiter List ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
            <h2 className="text-base font-semibold text-gray-900">Recent Activity</h2>
            <Link to="/admin/audit" className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
              Full log <ChevronRight size={14} />
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {recentActivity.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-gray-400">
                No activity recorded yet. Actions taken in the system will appear here.
              </div>
            ) : (
              recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-start gap-4 px-6 py-4">
                  <span className={`mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotColor(activity.type)}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{activity.action}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{activity.detail}</p>
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap">{activity.time}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recruiter List */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
            <h2 className="text-base font-semibold text-gray-900">Recruiters</h2>
            <span className="text-xs text-gray-400">{recruiters.length} total</span>
          </div>
          <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
            {recruiters.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-gray-400">
                No recruiters registered yet.
              </div>
            ) : (
              recruiters.map((r) => {
                const fullyVerified =
                  r.is_email_verified && r.is_phone_verified &&
                  r.is_identity_verified && r.is_face_verified;
                return (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${fullyVerified ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {r.first_name?.[0]}{r.last_name?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {r.first_name} {r.last_name}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{r.email}</p>
                    </div>
                    <div title={fullyVerified ? 'Fully verified' : 'Verification incomplete'}>
                      {fullyVerified
                        ? <ShieldCheck size={16} className="text-emerald-500" />
                        : <ShieldOff size={16} className="text-gray-300" />
                      }
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
