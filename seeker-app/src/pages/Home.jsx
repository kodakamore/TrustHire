import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Search, QrCode, FileText, CheckCircle } from 'lucide-react';
import QRScanner from '../components/QRScanner';
import InstallBanner from '../components/InstallBanner';

export default function Home() {
  const [pin, setPin] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const navigate = useNavigate();

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
    if (pin.replace(/-/g, '').length >= 3) {
      navigate(`/v/${pin.replace(/-/g, '')}`);
    }
  };

  const handleScan = (scannedPin) => {
    setShowScanner(false);
    navigate(`/v/${scannedPin}`);
  };

  return (
    <div className="flex flex-col gap-10 pb-10">
      <section className="text-center space-y-4 py-8">
        <div className="flex justify-center mb-4">
          <div className="bg-indigo-100 p-4 rounded-full text-indigo-600">
            <Shield className="w-16 h-16" />
          </div>
        </div>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
          Verify Job Advertisements Instantly
        </h2>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Check if a job advertisement has been verified on the TrustHire platform to protect yourself from scams.
        </p>
      </section>

      <InstallBanner />

      <section className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-100 max-w-xl mx-auto w-full">
        <form onSubmit={handleVerify} className="space-y-6">
          <div>
            <label htmlFor="pin" className="block text-sm font-medium text-gray-700 mb-2">
              Verification PIN
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                id="pin"
                value={pin}
                onChange={handlePinChange}
                placeholder="e.g., VRF-A3K9-M2P7"
                className="block w-full pl-10 pr-3 py-4 border border-gray-300 rounded-xl text-lg font-medium text-center uppercase focus:ring-indigo-500 focus:border-indigo-500"
                maxLength={13}
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={!pin}
            className="w-full flex justify-center py-4 px-4 border border-transparent rounded-xl shadow-sm text-lg font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-colors"
          >
            Verify
          </button>
        </form>

        <div className="mt-8">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Or Scan QR Code</span>
            </div>
          </div>

          <div className="mt-6">
            <button
              onClick={() => setShowScanner(true)}
              className="w-full flex items-center justify-center gap-2 py-4 px-4 border-2 border-indigo-100 rounded-xl shadow-sm text-lg font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
            >
              <QrCode className="w-6 h-6" />
              Open Camera to Scan
            </button>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <h3 className="text-xl font-bold text-center mb-8">How it works</h3>
        <div className="grid sm:grid-cols-3 gap-8 text-center max-w-4xl mx-auto">
          <div className="flex flex-col items-center gap-3">
            <div className="bg-blue-50 p-4 rounded-full text-blue-600">
              <FileText className="w-8 h-8" />
            </div>
            <h4 className="font-semibold">1. Find the code</h4>
            <p className="text-sm text-gray-600">Find the QR code or PIN on the job advertisement</p>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="bg-blue-50 p-4 rounded-full text-blue-600">
              <QrCode className="w-8 h-8" />
            </div>
            <h4 className="font-semibold">2. Scan or enter</h4>
            <p className="text-sm text-gray-600">Scan the QR code or enter the PIN above</p>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="bg-blue-50 p-4 rounded-full text-blue-600">
              <CheckCircle className="w-8 h-8" />
            </div>
            <h4 className="font-semibold">3. Verify status</h4>
            <p className="text-sm text-gray-600">View the verification status and original job details</p>
          </div>
        </div>
      </section>

      {showScanner && (
        <QRScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
      )}
    </div>
  );
}
