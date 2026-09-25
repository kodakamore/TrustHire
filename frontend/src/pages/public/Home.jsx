import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { 
  Shield, Search, QrCode, FileText, CheckCircle, Lock, 
  Building2, UserCheck, AlertTriangle, ArrowRight, ExternalLink 
} from 'lucide-react';
import QRScanner from '../../components/QRScanner';

export default function Home() {
  const [pin, setPin] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const pinInputRef = useRef(null);

  useEffect(() => {
    if (location.pathname === '/verify' || location.hash === '#verify-section') {
      const el = document.getElementById('verify-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
      setTimeout(() => {
        pinInputRef.current?.focus();
      }, 300);
    }
  }, [location]);

  const handlePinChange = (e) => {
    let val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (val.length > 3 && val.length <= 7) {
      val = `${val.slice(0, 3)}-${val.slice(3)}`;
    } else if (val.length > 7) {
      val = `${val.slice(0, 3)}-${val.slice(3, 7)}-${val.slice(7, 11)}`;
    }
    setPin(val);
  };

  const handleVerify = (e) => {
    e.preventDefault();
    if (pin.trim()) {
      navigate(`/v/${pin.trim()}`);
    }
  };

  const handleScan = (scannedPin) => {
    setShowScanner(false);
    navigate(`/v/${scannedPin}`);
  };

  const scrollToVerify = (e) => {
    e.preventDefault();
    const el = document.getElementById('verify-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
    setTimeout(() => {
      pinInputRef.current?.focus();
    }, 200);
  };

  return (
    <div className="flex flex-col gap-16 pb-16">
      {/* Hero Section */}
      <section className="text-center space-y-5 pt-6 sm:pt-10">
        <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-200/60 px-4 py-1.5 rounded-full text-indigo-700 text-xs font-semibold tracking-wide">
          <Shield className="w-4 h-4 text-indigo-600" />
          <span>Nigeria's Voluntary Job Advertisement Verification Layer</span>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-gray-900 tracking-tight max-w-3xl mx-auto leading-tight">
          Verify Before You Apply. <br />
          <span className="text-indigo-600">Eliminate Job Scam Risks.</span>
        </h1>

        <p className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
          Recruiters voluntarily prove their identity and company legitimacy. Job seekers verify the advertisement before submitting applications.
        </p>

        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <a
            href="#verify-section"
            onClick={scrollToVerify}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-3 rounded-xl shadow-md shadow-indigo-600/20 text-sm transition transform active:scale-95"
          >
            <Search className="w-4 h-4" />
            Verify an Ad Now
          </a>
          <Link
            to="/recruiter/register"
            className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-800 border border-gray-200 font-bold px-5 py-3 rounded-xl text-sm transition"
          >
            Post a Verified Job
          </Link>
        </div>
      </section>

      {/* Main Verification Card (PIN + QR Scanner) */}
      <section 
        id="verify-section" 
        className="bg-white p-6 sm:p-10 rounded-3xl shadow-xl shadow-indigo-900/5 border-2 border-indigo-100 hover:border-indigo-300 max-w-xl mx-auto w-full relative transition scroll-mt-24"
      >
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-[11px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
          Job Seeker Instant Check
        </div>

        <form onSubmit={handleVerify} className="space-y-5">
          <div>
            <label htmlFor="pin" className="block text-sm font-bold text-gray-800 mb-2">
              Enter Advertisement Verification PIN
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                ref={pinInputRef}
                type="text"
                id="pin"
                value={pin}
                onChange={handlePinChange}
                placeholder="e.g. VRF-A3K9-M2P7"
                className="block w-full pl-11 pr-3 py-4 border-2 border-gray-200 rounded-2xl text-xl font-mono font-bold text-center tracking-wider text-indigo-950 uppercase focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-600 transition"
                maxLength={13}
              />
            </div>
            <p className="text-[11px] text-gray-500 mt-1.5 text-center">
              Found on certified flyers, email ads, or social media postings.
            </p>
          </div>

          <button
            type="submit"
            disabled={!pin}
            className="w-full flex justify-center items-center gap-2 py-4 px-4 rounded-xl shadow-md text-base font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-all"
          >
            <span>Verify Advertisement Authenticity</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </form>

        <div className="mt-8">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase font-bold tracking-wider">
              <span className="px-3 bg-white text-gray-400">Or Scan Flyer QR Code</span>
            </div>
          </div>

          <div className="mt-6">
            <button
              onClick={() => setShowScanner(true)}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 px-4 border-2 border-indigo-200 rounded-xl shadow-sm text-sm font-bold text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100 transition"
            >
              <QrCode className="w-5 h-5" />
              Launch Camera Scanner
            </button>
          </div>
        </div>
      </section>

      {/* Two Portal Cards (Recruiter & Admin) */}
      <section className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto w-full">
        {/* Recruiter Portal Card */}
        <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 text-white p-7 rounded-3xl shadow-lg border border-indigo-800/60 flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 bg-indigo-600/40 rounded-2xl flex items-center justify-center mb-5 border border-indigo-500/30">
              <Building2 className="w-6 h-6 text-indigo-300" />
            </div>
            <span className="text-[11px] font-bold tracking-wider uppercase text-indigo-400">For Employers & Recruiters</span>
            <h3 className="text-2xl font-bold mt-1 mb-2 text-white">Certify Your Job Openings</h3>
            <p className="text-sm text-indigo-200/90 leading-relaxed mb-6">
              Complete your biometric facial check, verify your CAC registration and company domain, and generate shareable verified flyers with unique QR codes.
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              to="/recruiter/login"
              className="flex-1 text-center bg-white text-indigo-950 font-bold px-4 py-3 rounded-xl text-xs hover:bg-indigo-50 transition"
            >
              Recruiter Login
            </Link>
            <Link
              to="/recruiter/register"
              className="flex-1 text-center bg-indigo-600 text-white font-bold px-4 py-3 rounded-xl text-xs hover:bg-indigo-700 transition"
            >
              Register Account
            </Link>
          </div>
        </div>

        {/* Admin Portal Card */}
        <div className="bg-white p-7 rounded-3xl shadow-sm border border-gray-200 flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mb-5 border border-gray-200">
              <Lock className="w-6 h-6 text-slate-700" />
            </div>
            <span className="text-[11px] font-bold tracking-wider uppercase text-gray-500">Platform Governance</span>
            <h3 className="text-2xl font-bold mt-1 mb-2 text-gray-900">Review Queue & Auditing</h3>
            <p className="text-sm text-gray-600 leading-relaxed mb-6">
              Review flagged job applications, verify CAC registry matches, take action on citizen fraud reports, and inspect immutable system audit logs.
            </p>
          </div>
          <Link
            to="/admin/login"
            className="w-full text-center bg-slate-900 text-white font-bold px-5 py-3 rounded-xl text-xs hover:bg-slate-800 transition"
          >
            Access Admin Console
          </Link>
        </div>
      </section>

      {/* 3 Pillars of Trust */}
      <section className="bg-gray-100/70 p-8 sm:p-12 rounded-3xl max-w-4xl mx-auto w-full">
        <h3 className="text-2xl font-bold text-center text-gray-900 mb-2">How TrustHire Verifies Advertisements</h3>
        <p className="text-center text-sm text-gray-600 mb-10 max-w-md mx-auto">
          Every verified job advertisement passes through an accountability pipeline:
        </p>

        <div className="grid sm:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm text-center">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mx-auto mb-4">
              <UserCheck className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-gray-900 mb-1.5">1. Recruiter Liveness</h4>
            <p className="text-xs text-gray-600 leading-relaxed">
              Recruiters prove their physical presence via real-time biometric liveness challenges and national NIN/BVN checks.
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm text-center">
            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Building2 className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-gray-900 mb-1.5">2. CAC & Domain Origin</h4>
            <p className="text-xs text-gray-600 leading-relaxed">
              Business legal existence is verified against the Corporate Affairs Commission (CAC) and domain age checked via WHOIS.
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm text-center">
            <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-gray-900 mb-1.5">3. SHA-256 Anti-Tamper Hash</h4>
            <p className="text-xs text-gray-600 leading-relaxed">
              The exact job salary, title, and application link are cryptographically hashed so modifying the ad flyer later is detected.
            </p>
          </div>
        </div>
      </section>

      {/* Camera QR Scanner Modal */}
      {showScanner && (
        <QRScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
      )}
    </div>
  );
}
