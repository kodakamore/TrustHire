import React, { useRef, useState } from 'react';
import html2canvas from 'html2canvas';

const VerifiedAdCard = ({ job }) => {
  const adRef = useRef(null);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleDownload = async () => {
    if (!adRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(adRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      });
      const image = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = image;
      link.download = `${job.title.replace(/\s+/g, '_')}_Verified_Ad.png`;
      link.click();
    } catch (err) {
      console.error('Error exporting flyer image:', err);
    } finally {
      setDownloading(false);
    }
  };

  const handleCopyText = () => {
    const textToShare = 
`🔒 [VERIFIED JOB ADVERTISEMENT]
📌 Role: ${job.title}
🏢 Company: ${job.company}
📍 Location: ${job.location || 'Remote/Nigeria'}
💼 Type: ${job.type || 'Full-time'}
💰 Salary: ${job.salaryRange || 'Competitive'}
${job.applicationUrl ? `🔗 Apply: ${job.applicationUrl}\n` : ''}${job.applicationEmail ? `📧 Email: ${job.applicationEmail}\n` : ''}
🛡️ VERIFICATION PIN: ${job.pin}
Scan the QR code or verify manually at: ${job.verifyUrl || `http://localhost:3000/v/${job.pin}`}
Verified by TrustHire Platform.`;

    navigator.clipboard.writeText(textToShare);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Shareable Verified Ad Flyer</h2>
          <p className="text-xs text-gray-500">Official tamper-proof advertisement ready for WhatsApp, LinkedIn, and social media</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCopyText}
            className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-xs font-semibold hover:bg-gray-200 transition"
          >
            {copied ? '✔ Copied Text!' : '📋 Copy Text'}
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="px-4 py-1.5 bg-emerald-600 text-white rounded text-xs font-bold hover:bg-emerald-700 transition disabled:opacity-50"
          >
            {downloading ? 'Exporting...' : '📥 Download Flyer (PNG)'}
          </button>
        </div>
      </div>

      {/* FLYER CARD TO BE CAPTURED */}
      <div
        ref={adRef}
        className="bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 text-white p-6 sm:p-8 rounded-2xl shadow-xl border border-indigo-500/30 max-w-xl mx-auto relative overflow-hidden"
      >
        {/* Background Accents */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

        {/* Top Header Badge */}
        <div className="flex justify-between items-start border-b border-indigo-800/60 pb-4 mb-5">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-emerald-500 rounded-lg flex items-center justify-center text-white shadow-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h3 className="font-extrabold text-base tracking-wide text-white leading-tight">TRUSTHIRE</h3>
              <p className="text-[10px] text-emerald-400 font-semibold tracking-wider uppercase">Verified Job Advertisement</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-500/20 text-emerald-300 font-bold px-3 py-1 rounded-full border border-emerald-500/30">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            VERIFIED & AUTHENTIC
          </span>
        </div>

        {/* Job Title & Company */}
        <div className="mb-5">
          <h2 className="text-2xl font-black text-white leading-snug">{job.title}</h2>
          <p className="text-indigo-300 font-semibold text-base mt-0.5">{job.company}</p>
        </div>

        {/* Meta badges */}
        <div className="grid grid-cols-2 gap-2.5 mb-5 text-xs">
          <div className="bg-slate-800/80 p-2.5 rounded-lg border border-indigo-900/60">
            <p className="text-gray-400 text-[10px] uppercase font-semibold">Location</p>
            <p className="font-medium text-gray-200 mt-0.5">{job.location || 'Not Specified'}</p>
          </div>
          <div className="bg-slate-800/80 p-2.5 rounded-lg border border-indigo-900/60">
            <p className="text-gray-400 text-[10px] uppercase font-semibold">Job Type</p>
            <p className="font-medium text-gray-200 mt-0.5">{job.type || 'Full-time'}</p>
          </div>
          <div className="bg-slate-800/80 p-2.5 rounded-lg border border-indigo-900/60">
            <p className="text-gray-400 text-[10px] uppercase font-semibold">Compensation</p>
            <p className="font-semibold text-emerald-400 mt-0.5">{job.salaryRange || 'Competitive'}</p>
          </div>
          <div className="bg-slate-800/80 p-2.5 rounded-lg border border-indigo-900/60">
            <p className="text-gray-400 text-[10px] uppercase font-semibold">Valid Until</p>
            <p className="font-medium text-gray-200 mt-0.5">{job.expiresAt ? new Date(job.expiresAt).toLocaleDateString() : 'Active'}</p>
          </div>
        </div>

        {/* Verification Footer (QR Code & PIN) */}
        <div className="bg-white text-gray-900 p-4 rounded-xl shadow-inner flex flex-col sm:flex-row items-center gap-4">
          <div className="bg-gray-50 p-2 border border-gray-200 rounded-lg flex-shrink-0">
            {job.qrCodeUrl ? (
              <img src={job.qrCodeUrl} alt="TrustHire QR Code" className="w-24 h-24 object-contain" />
            ) : (
              <div className="w-24 h-24 bg-gray-200 flex items-center justify-center text-[10px] font-mono text-gray-500 text-center">
                QR CODE
              </div>
            )}
          </div>

          <div className="text-center sm:text-left flex-grow">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">SECURE VERIFICATION PIN</p>
            <p className="font-mono text-xl font-extrabold text-indigo-700 tracking-wider my-0.5">{job.pin || 'VRF-XXXX-XXXX'}</p>
            <p className="text-[11px] text-gray-600 leading-snug">
              Scan this QR or verify at <span className="font-semibold text-indigo-600">trusthire.ng</span> before applying to ensure this ad is not a counterfeit.
            </p>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-indigo-900/50 flex items-center justify-between text-[10px] text-gray-400">
          <span>Identity & CAC Registration Checked</span>
          <span>Encrypted SHA-256 Anti-Tamper Hash</span>
        </div>
      </div>
    </div>
  );
};

export default VerifiedAdCard;
