import React from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { Shield, LayoutDashboard, UserCheck, Building2, PlusCircle, LogOut, ExternalLink } from 'lucide-react';

const RecruiterLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/recruiter/login');
  };

  const navLinks = [
    { to: '/recruiter/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/recruiter/verify', label: 'Identity Verification', icon: UserCheck },
    { to: '/recruiter/companies/new', label: 'Add Company', icon: Building2 },
    { to: '/recruiter/jobs/new', label: 'Submit Job Ad', icon: PlusCircle },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row font-sans text-gray-900">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-white border-r border-gray-200 flex flex-col justify-between shrink-0">
        <div>
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2 text-indigo-600">
              <Shield className="w-7 h-7" />
              <div>
                <span className="font-extrabold text-lg text-gray-900 leading-none tracking-tight">Trust<span className="text-indigo-600">Hire</span></span>
                <span className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Recruiter Portal</span>
              </div>
            </Link>
          </div>

          <nav className="p-4 space-y-1.5">
            {navLinks.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-600 font-bold'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-indigo-600' : 'text-gray-400'}`} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-gray-100 space-y-2">
          <Link
            to="/"
            className="flex items-center justify-between w-full px-3.5 py-2 text-xs font-semibold text-gray-500 hover:text-gray-800 rounded-lg hover:bg-gray-50 transition"
          >
            <span>Public Home</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 w-full px-3.5 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg transition"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Content Area */}
      <div className="flex-grow flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-6 shrink-0">
          <div className="text-xs text-gray-500 font-medium">
            Recruiter Workspace
          </div>
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span className="text-xs font-semibold text-gray-700">Account Active</span>
          </div>
        </header>

        <main className="flex-grow p-6 md:p-8 max-w-6xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default RecruiterLayout;
