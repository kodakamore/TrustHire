import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';
import QRCodeDisplay from '../components/QRCodeDisplay';
import VerifiedAdCard from '../components/VerifiedAdCard';
import { job as jobApi } from '../services/api';

const JobDetails = () => {
  const { id } = useParams();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchJob = async () => {
      try {
        const res = await jobApi.get(id);
        if (res.data && res.data.data) {
          const fetchedJob = res.data.data;
          // Also fetch verification code if approved/verified
          let pin = fetchedJob.pin;
          // Prefer the ready-made PNG (data URL) from the backend; the raw
          // qr_code_url is a LINK to the seeker page, not an image.
          let qrCodeUrl = fetchedJob.qr_code_data_url || null;
          let qrCodeRawUrl = fetchedJob.qr_code_url || null;
          let expiresAt = fetchedJob.expires_at;

          if (fetchedJob.status === 'approved' || fetchedJob.status === 'verified') {
            try {
              const vRes = await jobApi.getVerification(id);
              if (vRes.data && vRes.data.data) {
                pin = vRes.data.data.pin;
                qrCodeUrl = vRes.data.data.qr_code_data_url || qrCodeUrl;
                qrCodeRawUrl = vRes.data.data.qr_code_url || fetchedJob.qr_code_url || null;
                expiresAt = vRes.data.data.expires_at;
              }
            } catch (err) {
              console.warn('Verification code fetch warning:', err);
            }
          }

          setJob({
            id: fetchedJob.id,
            title: fetchedJob.title,
            company: fetchedJob.company_name || 'Verified Company',
            status: fetchedJob.status === 'approved' ? 'verified' : fetchedJob.status,
            type: fetchedJob.employment_type || 'Full-time',
            location: fetchedJob.location || 'Nigeria',
            salaryRange: fetchedJob.salary_range || 'Competitive',
            createdAt: fetchedJob.created_at,
            expiresAt: expiresAt || '2026-12-31T00:00:00Z',
            pin: pin || 'VRF-7K9P-M2Q8',
            // A data URL is an actual PNG — render it directly. A raw link is
            // NOT an image, so encode it via the QR service. No link at all →
            // keep the demo placeholder.
            qrCodeUrl: qrCodeUrl && qrCodeUrl.startsWith('data:')
              ? qrCodeUrl
              : (qrCodeRawUrl
                  ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrCodeRawUrl)}`
                  : 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=' + encodeURIComponent('http://localhost:3001/v/VRF-7K9P-M2Q8')),
            rejectionReason: fetchedJob.rejection_reason || null,
            verifyUrl: qrCodeRawUrl || null,
            applicationUrl: fetchedJob.application_url,
            applicationEmail: fetchedJob.application_email,
            description: fetchedJob.description
          });
        }
      } catch (e) {
        // Fallback demo mock if backend isn't populated
        setJob({
          id,
          title: 'Senior Frontend Developer',
          company: 'TechCorp Nigeria Ltd',
          status: 'verified',
          type: 'Full-time',
          location: 'Lagos, Nigeria (Hybrid)',
          salaryRange: '₦800k - ₦1.2m/month',
          createdAt: '2026-09-15T10:00:00Z',
          expiresAt: '2026-12-15T10:00:00Z',
          pin: 'VRF-7K9P-M2Q8',
          verifyUrl: 'http://localhost:3000/v/VRF-7K9P-M2Q8',
          qrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=http://localhost:3001/v/VRF-7K9P-M2Q8',
          rejectionReason: null,
          applicationUrl: 'https://careers.techcorp.ng/apply',
          applicationEmail: 'recruitment@techcorp.ng'
        });
      } finally {
        setLoading(false);
      }
    };

    fetchJob();
  }, [id]);

  if (loading) return <div className="p-8 text-center text-gray-500">Loading job details...</div>;
  if (!job) return <div className="p-8 text-center text-red-500">Job not found</div>;

  const isVerified = job.status === 'verified' || job.status === 'approved';

  return (
    <div className="space-y-8">
      {/* Top Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{job.title}</h1>
                <p className="text-lg text-indigo-600 font-medium">{job.company}</p>
              </div>
              <StatusBadge status={job.status} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 text-sm border-t pt-4">
              <div>
                <p className="text-gray-500 text-xs uppercase font-medium">Job Type</p>
                <p className="font-semibold text-gray-900 mt-1">{job.type}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs uppercase font-medium">Location</p>
                <p className="font-semibold text-gray-900 mt-1">{job.location}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs uppercase font-medium">Salary Range</p>
                <p className="font-semibold text-gray-900 mt-1">{job.salaryRange}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs uppercase font-medium">Submitted</p>
                <p className="font-semibold text-gray-900 mt-1">{new Date(job.createdAt).toLocaleDateString()}</p>
              </div>
            </div>

            {job.description && (
              <div className="mt-6 pt-4 border-t border-gray-100">
                <p className="text-xs uppercase font-semibold text-gray-500 mb-2">Job Description</p>
                <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{job.description}</p>
              </div>
            )}
          </div>

          {job.status === 'rejected' && (
            <div className="bg-red-50 border border-red-200 p-5 rounded-xl">
              <h3 className="text-red-800 font-bold mb-1">Verification Rejected</h3>
              <p className="text-red-700 text-sm mb-3">{job.rejectionReason || 'Your job advertisement did not meet verification criteria.'}</p>
              <button className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700">Edit & Resubmit</button>
            </div>
          )}

          {job.status === 'expired' && (
            <div className="bg-amber-50 border border-amber-300 p-5 rounded-xl">
              <h3 className="text-amber-800 font-bold mb-1">Verification Expired</h3>
              <p className="text-amber-700 text-sm mb-3">This advertisement validity period has lapsed.</p>
              <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">Renew Verification</button>
            </div>
          )}
          
          {job.status === 'revoked' && (
            <div className="bg-red-50 border border-red-200 p-5 rounded-xl">
              <h3 className="text-red-800 font-bold mb-1">Verification Revoked</h3>
              <p className="text-red-700 text-sm">This advertisement has been revoked by platform administrators.</p>
            </div>
          )}
        </div>

        {/* Sidebar QR Display */}
        <div className="lg:col-span-1">
          {isVerified ? (
            <QRCodeDisplay 
              qrCodeUrl={job.qrCodeUrl} 
              pin={job.pin} 
              expiresAt={job.expiresAt} 
              jobTitle={job.title} 
            />
          ) : (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 text-center">
              <div className="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Awaiting Verification</h3>
              <p className="text-xs text-gray-500 mb-4">A Verification PIN and downloadable QR Code will be issued once approved.</p>
              <div className="w-full bg-gray-200 rounded-full h-1.5 mb-1">
                <div className="bg-indigo-600 h-1.5 rounded-full w-1/3 animate-pulse"></div>
              </div>
              <p className="text-[11px] text-gray-400 text-left">Reviewing recruiter & company checks...</p>
            </div>
          )}
        </div>
      </div>

      {/* Shareable Ad Flyer Section */}
      {isVerified && (
        <div className="border-t border-gray-200 pt-8">
          <VerifiedAdCard job={job} />
        </div>
      )}
    </div>
  );
};

export default JobDetails;
