import React, { useState, useEffect } from 'react';
import { Download, X, Share } from 'lucide-react';

const DISMISS_KEY = 'th_install_banner_dismissed';

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) &&
  !/crios|fxios/i.test(navigator.userAgent);

/**
 * Install prompt for the PWA.
 * - Android: captures beforeinstallprompt and defers it to the button.
 * - iOS: no event exists — shows a "Share -> Add to Home Screen" hint once.
 * Hidden entirely when already installed / dismissed.
 */
export default function InstallBanner() {
  const [deferred, setDeferred] = useState(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isStandalone() || localStorage.getItem(DISMISS_KEY)) return;

    const onPrompt = (e) => {
      e.preventDefault();
      setDeferred(e);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    // iOS has no install event — show the manual hint instead.
    if (isIOS()) {
      setIosHint(true);
      setVisible(true);
    }

    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
    };
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (deferred) {
      deferred.prompt();
      try {
        await deferred.userChoice;
      } catch { /* user dismissed */ }
      setDeferred(null);
      setVisible(false);
    }
  };

  const handleDismiss = () => {
    setVisible(false);
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, '1');
  };

  if (!visible || dismissed) return null;

  return (
    <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-start gap-3 max-w-xl mx-auto w-full">
      <div className="bg-indigo-600 text-white p-2 rounded-lg shrink-0">
        <Download className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-indigo-900 text-sm">
          {iosHint ? 'Add TrustHire to your home screen' : 'Install TrustHire Verify'}
        </p>
        <p className="text-xs text-indigo-700 mt-0.5">
          {iosHint ? (
            <>Tap the <Share className="w-3.5 h-3.5 inline -mt-0.5" /> <strong>Share</strong> button, then <strong>Add to Home Screen</strong> to verify ads in one tap.</>
          ) : (
            'Open it straight from your home screen — scan a QR code and see instantly if a job ad is genuine.'
          )}
        </p>
        {!iosHint && deferred && (
          <button
            onClick={handleInstall}
            className="mt-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-1.5 rounded-lg transition-colors"
          >
            Install
          </button>
        )}
      </div>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss install banner"
        className="text-indigo-300 hover:text-indigo-500 shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
