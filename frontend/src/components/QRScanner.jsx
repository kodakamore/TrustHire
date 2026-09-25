import React, { useEffect, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { X } from 'lucide-react';

export default function QRScanner({ onScan, onClose }) {
  const [error, setError] = useState(null);

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      "reader",
      { fps: 10, qrbox: { width: 250, height: 250 } },
      /* verbose= */ false
    );

    scanner.render(
      (decodedText) => {
        // Assume URL format is something like https://trusthire.app/v/PIN123
        // Or it could just be the PIN directly.
        try {
          if (decodedText.includes('/v/')) {
            const urlParts = decodedText.split('/v/');
            if (urlParts.length > 1) {
              const pin = urlParts[1].split(/[/?#]/)[0];
              scanner.clear();
              onScan(pin);
            }
          } else {
            // Treat as raw pin
            scanner.clear();
            onScan(decodedText);
          }
        } catch (err) {
          console.error("QR Parse Error", err);
        }
      },
      (errorMessage) => {
        // parse errors occur frequently while scanning, ignore unless needed
      }
    );

    return () => {
      scanner.clear().catch(error => {
        console.error("Failed to clear html5QrcodeScanner. ", error);
      });
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center p-4">
      <button 
        onClick={onClose}
        className="absolute top-4 right-4 text-white p-2 bg-gray-800 rounded-full hover:bg-gray-700 transition-colors"
      >
        <X className="w-6 h-6" />
      </button>
      
      <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden">
        <div className="p-4 text-center border-b">
          <h3 className="font-semibold text-lg">Scan QR Code</h3>
          <p className="text-sm text-gray-500">Position the QR code within the frame</p>
        </div>
        
        <div className="p-4 bg-black">
          <div id="reader" className="w-full overflow-hidden rounded-xl bg-black border-none" />
        </div>
        
        {error && (
          <div className="p-4 text-red-500 text-sm text-center">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
