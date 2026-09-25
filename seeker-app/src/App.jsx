import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { Shield } from 'lucide-react';
import Home from './pages/Home';
import VerificationResult from './pages/VerificationResult';
import Report from './pages/Report';

function App() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-900">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-indigo-600">
            <Shield className="w-8 h-8" />
            <div>
              <h1 className="font-bold text-xl leading-none">TrustHire</h1>
              <p className="text-xs text-gray-500 font-medium">Job Verification</p>
            </div>
          </Link>
        </div>
      </header>

      <main className="flex-grow w-full max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/v/:pin" element={<VerificationResult />} />
          <Route path="/verify/:pin" element={<VerificationResult />} />
          <Route path="/report/:jobAdId" element={<Report />} />
        </Routes>
      </main>

      <footer className="bg-gray-800 text-gray-300 py-6 text-center text-sm">
        <div className="max-w-4xl mx-auto px-4">
          <p>TrustHire — Trusted Job Advertisement Verification</p>
          <p className="mt-2 text-gray-400">© {new Date().getFullYear()} TrustHire. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
