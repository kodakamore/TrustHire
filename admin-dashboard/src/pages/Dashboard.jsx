import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, Briefcase, Clock, AlertTriangle, ChevronRight } from 'lucide-react';
import StatsCard from '../components/StatsCard';

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    recruiters: 0,
    verifiedJobs: 0,
    pendingReviews: 0,
    activeReports: 0
  });

  useEffect(() => {
    // Simulate API call
    setTimeout(() => {
      setStats({
        recruiters: 1245,
        verifiedJobs: 8432,
        pendingReviews: 12,
        activeReports: 3
      });
      setLoading(false);
    }, 800);
  }, []);

  const recentActivity = [
    { id: 1, action: 'Job Approved', target: 'Senior Frontend Developer at TechCorp', actor: 'Admin Sarah', time: '10 mins ago', type: 'success' },
    { id: 2, action: 'Job Rejected', target: 'Data Entry Clerk (Suspicious)', actor: 'Admin John', time: '1 hour ago', type: 'danger' },
    { id: 3, action: 'Report Resolved', target: 'Fake company posting', actor: 'Admin Sarah', time: '2 hours ago', type: 'info' },
    { id: 4, action: 'System Flag', target: 'Multiple rapid postings from single IP', actor: 'System Auto-mod', time: '3 hours ago', type: 'warning' },
    { id: 5, action: 'Verification Revoked', target: 'XYZ Logistics Ltd', actor: 'Admin Mike', time: '5 hours ago', type: 'danger' },
  ];

  if (loading) {
    return <div className="flex items-center justify-center h-full">Loading dashboard data...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard Overview</h1>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard 
          title="Total Recruiters" 
          value={stats.recruiters.toLocaleString()} 
          icon={<Users size={24} />} 
          trend={4.2} 
        />
        <StatsCard 
          title="Verified Jobs" 
          value={stats.verifiedJobs.toLocaleString()} 
          icon={<Briefcase size={24} />} 
          trend={12.5} 
        />
        <div className={`bg-white rounded-xl shadow-sm border ${stats.pendingReviews > 0 ? 'border-amber-300 bg-amber-50' : 'border-gray-100'} p-6 flex items-center`}>
          <div className={`p-4 rounded-lg ${stats.pendingReviews > 0 ? 'bg-amber-100 text-amber-600' : 'bg-blue-50 text-blue-600'} mr-5`}>
            <Clock size={24} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-500 mb-1">Pending Reviews</p>
            <h3 className="text-2xl font-bold text-gray-900">{stats.pendingReviews}</h3>
          </div>
        </div>
        <div className={`bg-white rounded-xl shadow-sm border ${stats.activeReports > 0 ? 'border-red-300 bg-red-50' : 'border-gray-100'} p-6 flex items-center`}>
          <div className={`p-4 rounded-lg ${stats.activeReports > 0 ? 'bg-red-100 text-red-600' : 'bg-blue-50 text-blue-600'} mr-5`}>
            <AlertTriangle size={24} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-500 mb-1">Active Reports</p>
            <h3 className="text-2xl font-bold text-gray-900">{stats.activeReports}</h3>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
            <Link to="/audit" className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center">
              View full log <ChevronRight size={16} />
            </Link>
          </div>
          <div className="p-6">
            <div className="flow-root">
              <ul className="-mb-8">
                {recentActivity.map((activity, idx) => (
                  <li key={activity.id}>
                    <div className="relative pb-8">
                      {idx !== recentActivity.length - 1 ? (
                        <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true"></span>
                      ) : null}
                      <div className="relative flex space-x-3">
                        <div>
                          <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white
                            ${activity.type === 'success' ? 'bg-green-500' : 
                              activity.type === 'danger' ? 'bg-red-500' : 
                              activity.type === 'warning' ? 'bg-amber-500' : 'bg-blue-500'}`}>
                            <div className="w-2.5 h-2.5 rounded-full bg-white"></div>
                          </span>
                        </div>
                        <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                          <div>
                            <p className="text-sm text-gray-500">
                              <span className="font-medium text-gray-900">{activity.action}</span> - {activity.target}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">by {activity.actor}</p>
                          </div>
                          <div className="text-right text-sm whitespace-nowrap text-gray-500">
                            {activity.time}
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
          </div>
          <div className="p-4 space-y-3">
            <Link to="/queue" className="flex items-center p-4 rounded-lg border border-gray-100 hover:bg-slate-50 transition-colors group">
              <div className="p-3 bg-blue-100 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <Clock size={20} />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-900">Review Queue</p>
                <p className="text-xs text-gray-500">Process pending job posts</p>
              </div>
            </Link>
            
            <Link to="/reports" className="flex items-center p-4 rounded-lg border border-gray-100 hover:bg-slate-50 transition-colors group">
              <div className="p-3 bg-red-100 text-red-600 rounded-lg group-hover:bg-red-600 group-hover:text-white transition-colors">
                <AlertTriangle size={20} />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-900">View Reports</p>
                <p className="text-xs text-gray-500">Handle user complaints</p>
              </div>
            </Link>

            <Link to="/audit" className="flex items-center p-4 rounded-lg border border-gray-100 hover:bg-slate-50 transition-colors group">
              <div className="p-3 bg-slate-100 text-slate-600 rounded-lg group-hover:bg-slate-600 group-hover:text-white transition-colors">
                <ScrollText size={20} />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-900">Audit Log</p>
                <p className="text-xs text-gray-500">View system activity</p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
