import React from 'react';

const QRCodeDisplay = ({ qrCodeUrl, pin, expiresAt, jobTitle }) => {
  const handleCopy = () => {
    navigator.clipboard.writeText(pin);
    // Could add a toast notification here
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col items-center max-w-sm mx-auto">
      <h3 className="text-lg font-bold text-gray-800 text-center mb-2">{jobTitle}</h3>
      <p className="text-sm text-gray-500 mb-6 text-center">Verified Job Advertisement</p>
      
      <div className="bg-white p-4 border-2 border-indigo-100 rounded-xl mb-6">
        {qrCodeUrl ? (
          <img src={qrCodeUrl} alt="Verification QR Code" className="w-48 h-48 object-contain" />
        ) : (
          <div className="w-48 h-48 bg-gray-100 flex items-center justify-center rounded text-gray-400">
            [QR Code Placeholder]
          </div>
        )}
      </div>
      
      <div className="w-full mb-6">
        <p className="text-xs text-gray-500 uppercase font-semibold mb-1 text-center">Verification PIN</p>
        <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 flex items-center justify-between">
          <span className="text-2xl font-mono font-bold tracking-widest text-indigo-700">{pin || '------'}</span>
          <button 
            onClick={handleCopy}
            className="text-gray-400 hover:text-indigo-600 focus:outline-none transition-colors"
            title="Copy PIN"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>
      </div>
      
      {expiresAt && (
        <p className="text-xs text-gray-500 mb-4">
          Expires: {new Date(expiresAt).toLocaleDateString()}
        </p>
      )}
      
      <button className="w-full bg-indigo-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors">
        Download QR Code
      </button>
    </div>
  );
};

export default QRCodeDisplay;
