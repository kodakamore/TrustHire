import React, { useState } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';

const Layout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  const navLinks = [
    { name: 'Dashboard', path: '/dashboard' },
    { name: 'Verify Identity', path: '/verify-identity' },
    { name: 'Add Company', path: '/companies/new' },
    { name: 'Submit Job', path: '/jobs/new' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden bg-white border-b border-gray-200 p-4 flex justify-between items-center">
        <div className="text-xl font-bold text-indigo-600">TrustHire</div>
        <button 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="text-gray-500 hover:text-gray-700 focus:outline-none"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* Sidebar Navigation */}
      <div className={`md:flex flex-col w-full md:w-64 bg-white border-r border-gray-200 shadow-sm ${mobileMenuOpen ? 'flex' : 'hidden'} md:block transition-all duration-300`}>
        <div className="p-6 hidden md:block border-b border-gray-100">
          <div className="text-2xl font-bold text-indigo-600 tracking-tight">TrustHire</div>
          <div className="text-xs text-gray-500 mt-1 uppercase font-semibold">Recruiter Portal</div>
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-2">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              to={link.path}
              className={`block px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === link.path 
                  ? 'bg-indigo-50 text-indigo-700' 
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
              onClick={() => setMobileMenuOpen(false)}
            >
              {link.name}
            </Link>
          ))}
        </nav>
        
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center px-4 py-3 mb-2">
            <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold mr-3">
              R
            </div>
            <div className="text-sm font-medium text-gray-700">Recruiter Name</div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full text-left px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="hidden md:flex bg-white border-b border-gray-200 h-16 items-center justify-end px-8">
           <button
            onClick={handleLogout}
            className="text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Logout
          </button>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-gray-50">
          <div className="max-w-6xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
