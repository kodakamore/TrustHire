import React from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { Shield, CheckSquare } from 'lucide-react';

const PublicLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleVerifyClick = (e) => {
    e.preventDefault();
    if (location.pathname === '/' || location.pathname === '/verify') {
      const el = document.getElementById('verify-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
      setTimeout(() => {
        const input = document.getElementById('pin');
        if (input) input.focus();
      }, 200);
    } else {
      navigate('/verify');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-900">
      {/* Top Navbar */}
      <header className="bg-white/95 backdrop-blur shadow-sm sticky top-0 z-30 border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 text-indigo-600 group">
            <div className="bg-indigo-50 group-hover:bg-indigo-100 p-1.5 rounded-xl transition">
              <Shield className="w-7 h-7 text-indigo-600" />
            </div>
            <div>
              <h1 className="font-black text-xl leading-none text-gray-900 tracking-tight">
                Trust<span className="text-indigo-600">Hire</span>
              </h1>
              <p className="text-[10px] text-gray-400 font-semibold tracking-wider uppercase">Job Verification Layer</p>
            </div>
          </Link>

          <nav className="flex items-center gap-2 sm:gap-4 text-xs font-semibold">
            <a
              href="#verify-section"
              onClick={handleVerifyClick}
              className="px-3.5 py-2 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition font-bold flex items-center gap-1.5 cursor-pointer shadow-sm border border-indigo-200/50"
            >
              <CheckSquare className="w-4 h-4 text-indigo-600" />
              <span>Verify an Ad</span>
            </a>
            <Link to="/recruiter/login" className="px-3 py-2 text-gray-600 hover:text-indigo-600 transition">
              Recruiter Login
            </Link>
            <Link
              to="/recruiter/register"
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm transition"
            >
              Post Verified Job
            </Link>
            <Link
              to="/admin/login"
              className="hidden md:inline-block px-3 py-2 text-gray-400 hover:text-gray-700 transition"
            >
              Admin
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-gray-300 py-10 text-xs border-t border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-400" />
            <span className="font-bold text-sm text-white">TrustHire Platform</span>
            <span className="text-gray-500">— Nigeria Voluntary Job Verification Layer</span>
          </div>
          <div className="flex gap-6 text-gray-400">
            <a href="#verify-section" onClick={handleVerifyClick} className="hover:text-white transition cursor-pointer">
              Verify an Ad / PIN
            </a>
            <Link to="/recruiter/login" className="hover:text-white transition">For Employers</Link>
            <Link to="/admin/login" className="hover:text-white transition">Admin Portal</Link>
          </div>
          <p className="text-gray-500">© {new Date().getFullYear()} TrustHire. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default PublicLayout;
