import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ListChecks, Flag, ScrollText, LogOut, ShieldCheck } from 'lucide-react';
import adminApi from '../services/api';
import { getAdminEmail } from '../utils/auth';

const AdminLayout = () => {
  const navigate = useNavigate();
  const [pendingReviewsCount, setPendingReviewsCount] = useState(0);
  const adminEmail = getAdminEmail();

  useEffect(() => {
    let mounted = true;
    adminApi.getStats()
      .then((res) => {
        if (mounted && typeof res?.data?.pendingReviews === 'number') {
          setPendingReviewsCount(res.data.pendingReviews);
        }
      })
      .catch(() => {/* badge simply stays at 0 */});
    return () => { mounted = false; };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    navigate('/login');
  };

  const navLinks = [
    { to: '/', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
    { to: '/queue', icon: <ListChecks size={20} />, label: 'Review Queue', badge: pendingReviewsCount },
    { to: '/reports', icon: <Flag size={20} />, label: 'Reports' },
    { to: '/audit', icon: <ScrollText size={20} />, label: 'Audit Log' },
  ];

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col">
        <div className="p-6 flex items-center gap-3 border-b border-slate-800">
          <ShieldCheck className="text-blue-400" size={28} />
          <h1 className="text-xl font-bold tracking-tight">TrustHire Admin</h1>
        </div>
        
        <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${
                  isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              {link.icon}
              <span className="flex-1 font-medium">{link.label}</span>
              {link.badge > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {link.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        
        <div className="p-4 border-t border-slate-800">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 text-slate-300 hover:text-white w-full px-4 py-2 transition-colors rounded-md hover:bg-slate-800"
          >
            <LogOut size={20} />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-8 shrink-0 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-700">Admin Portal</h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                {(adminEmail || 'A').charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-medium text-gray-700">{adminEmail || 'System Administrator'}</span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-8 bg-slate-50">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
