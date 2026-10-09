import React, { useEffect, useState } from 'react';
import { verify as verifyApi } from '../services/api';

// ===========================================================================
// Verified face photo (self-view). Fetches the recruiter's own verified
// face image from the authenticated endpoint as a blob — an <img src> cannot
// carry the Authorization header — and renders it via an object URL.
// Renders nothing when no photo exists (verification not completed, or the
// image download from Didit was unavailable at approval time).
// ===========================================================================

const VerifiedFacePhoto = ({ size = 'h-16 w-16', className = '', onPhotoState }) => {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;
    (async () => {
      try {
        const res = await verifyApi.getFacePhoto();
        if (cancelled || !(res.data instanceof Blob) || res.data.size === 0) {
          if (!cancelled) onPhotoState?.(false);
          return;
        }
        objectUrl = URL.createObjectURL(res.data);
        setUrl(objectUrl);
        if (!cancelled) onPhotoState?.(true);
      } catch {
        // 404 = no verified photo yet; auth/network errors are non-fatal here
        if (!cancelled) onPhotoState?.(false);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  if (!url) return null;
  return (
    <img
      src={url}
      alt="Your verified face"
      className={`${size} ${className} rounded-full object-cover border-2 border-emerald-400 shadow-sm`}
    />
  );
};

export default VerifiedFacePhoto;
