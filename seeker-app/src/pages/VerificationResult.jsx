import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { CheckCircle, Clock, XCircle, HelpCircle, AlertTriangle, Building, MapPin, Briefcase, DollarSign, Calendar, Link as LinkIcon, User, Shield } from 'lucide-react';
import { verifyByPin } from '../services/api';
import StatusCard from '../components/StatusCard';

// Backend statuses -> local render states
const STATUS_MAP = {
  verified_valid: 'verified',
  verified_expired: 'expired',
  revoked: 'revoked',
  deactivated: 'deactivated',
  compromised: 'compromised',
  not_found: 'not_found',
};

const mapApiResponse = (payload) => {
  const status = STATUS_MAP[payload?.status] || 'not_found';
  if (status === 'not_found') return { status: 'not_found' };
  return {
    status,
    message: payload.message,
    title: payload.title,
    integrity: payload.integrity, // 'verified' | 'mismatch' | 'unknown'
    jobAd: {
      id: payload.job?.id,
      companyName: payload.company?.name,
      jobTitle: payload.job?.title,
      description: payload.job?.description,
      location: payload.job?.location,
      salaryRange: payload.job?.salaryRange,
      applicationUrl: payload.job?.applicationUrl,
      applicationEmail: payload.job?.applicationEmail,
      recruiterName: payload.recruiter?.name,
      verifiedOn: payload.verifiedOn,
      validUntil: payload.expiresOn,
    },
  };
};

export default function VerificationResult() {
  const { pin } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [showMore, setShowMore] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const fetchVerification = async () => {
      try {
        setLoading(true);
        setError(null);
        // LIVE lookup against TrustHire — verification verdicts are never
        // cached (the service worker treats /api as network-only).
        const res = await verifyByPin(pin);
        if (!isMounted) return;
        if (res?.success && res.data) {
          setResult(mapApiResponse(res.data));
        } else {
          setError(res?.data?.message || 'Could not verify this code right now.');
        }
      } catch (err) {
        if (isMounted) {
          setError(
            navigator.onLine
              ? 'Something went wrong while verifying. Please try again.'
              : 'You appear to be offline. Verifying a job advert requires an internet connection — we never show stale results.',
          );
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchVerification();
    return () => { isMounted = false; };
  }, [pin]);

  const handleReport = () => {
    navigate(`/report/${result?.jobAd?.id || pin}`);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
        <p className="text-gray-500 font-medium">Verifying Job Advertisement...</p>
      </div>
    );
  }

  if (error && !result) {
    return (
      <div className="max-w-xl mx-auto pb-10">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center space-y-4">
          <AlertTriangle className="w-14 h-14 text-amber-500 mx-auto" />
          <h2 className="text-xl font-bold text-gray-900">Can't verify right now</h2>
          <p className="text-gray-600">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex justify-center py-3 px-6 rounded-xl text-base font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // The verified-details card (used by 'verified' AND 'compromised' — the
  // snapshot is authentic in both cases; only the context differs).
  const renderDetailsCard = () => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
      <h3 className="text-xl font-bold mb-6 pb-4 border-b border-gray-100">Original Verified Details</h3>

      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <Building className="w-5 h-5 text-gray-400 mt-0.5" />
          <div>
            <p className="text-sm text-gray-500 font-medium">Company Name</p>
            <p className="font-semibold">{result.jobAd.companyName}</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Briefcase className="w-5 h-5 text-gray-400 mt-0.5" />
          <div>
            <p className="text-sm text-gray-500 font-medium">Job Title</p>
            <p className="font-semibold">{result.jobAd.jobTitle}</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
          <div>
            <p className="text-sm text-gray-500 font-medium">Location</p>
            <p>{result.jobAd.location}</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <DollarSign className="w-5 h-5 text-gray-400 mt-0.5" />
          <div>
            <p className="text-sm text-gray-500 font-medium">Salary Range</p>
            <p>{result.jobAd.salaryRange}</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <User className="w-5 h-5 text-gray-400 mt-0.5" />
          <div>
            <p className="text-sm text-gray-500 font-medium">Recruiter</p>
            <p>{result.jobAd.recruiterName}</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <LinkIcon className="w-5 h-5 text-gray-400 mt-0.5" />
          <div className="w-full truncate">
            <p className="text-sm text-gray-500 font-medium">Application URL/Email</p>
            <a href={result.jobAd.applicationUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline truncate block">
              {result.jobAd.applicationUrl}
            </a>
          </div>
        </div>

        <div className="pt-4 mt-4 border-t border-gray-100 flex flex-col sm:flex-row gap-4 justify-between text-sm">
          <div className="flex items-center gap-2 text-gray-600">
            <Calendar className="w-4 h-4" />
            Verified: {new Date(result.jobAd.verifiedOn).toLocaleDateString()}
          </div>
          <div className="flex items-center gap-2 text-gray-600">
            <Clock className="w-4 h-4" />
            Valid Until: {new Date(result.jobAd.validUntil).toLocaleDateString()}
          </div>
        </div>
      </div>

      <div className="mt-6 pt-6 border-t border-gray-100">
        <p className="text-sm text-gray-500 font-medium mb-2">Job Description</p>
        <div className={`text-gray-700 relative ${!showMore && 'line-clamp-3'}`}>
          {result.jobAd.description}
        </div>
        <button
          onClick={() => setShowMore(!showMore)}
          className="text-indigo-600 font-medium text-sm mt-2 hover:underline"
        >
          {showMore ? 'Show Less' : 'Show More'}
        </button>
      </div>
    </div>
  );

  // One-tap discrepancy sensor: "Does this match?" -> prefilled report.
  const renderMatchTap = () => (
    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-6 rounded-r-xl">
      <div className="flex gap-3">
        <AlertTriangle className="w-6 h-6 text-yellow-600 shrink-0" />
        <div>
          <h4 className="font-bold text-yellow-800 text-lg">DOES THIS MATCH THE AD YOU RECEIVED?</h4>
          <p className="text-yellow-700 mt-2">
            Compare the details above with the advertisement you saw.
            If anything is different — especially the company name, salary,
            or application link — the ad may have been tampered with.
          </p>
          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleReport}
              className="bg-red-100 hover:bg-red-200 text-red-800 font-semibold py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <span>🚩</span> Report a Mismatch
            </button>
            <Link to="/" className="bg-white hover:bg-gray-50 text-gray-800 border border-gray-200 font-semibold py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2">
              <span>✅</span> Details Match
            </Link>
          </div>
        </div>
      </div>
    </div>
  );

  const renderIntegrityBanner = () =>
    result.integrity === 'mismatch' ? (
      <div className="bg-red-50 border-l-4 border-red-400 p-5 rounded-r-xl flex gap-3">
        <Shield className="w-6 h-6 text-red-600 shrink-0" />
        <div>
          <h4 className="font-bold text-red-800">Integrity Alert</h4>
          <p className="text-red-700 text-sm mt-1">
            The advert stored on TrustHire no longer matches what was originally
            approved. Our reviewers have been alerted — compare carefully and
            report anything suspicious below.
          </p>
        </div>
      </div>
    ) : null;

  const renderStateContent = () => {
    switch (result?.status) {
      case 'verified':
        return (
          <div className="space-y-6">
            <StatusCard
              icon={CheckCircle}
              title="Verified and Valid"
              color="green"
            />

            {renderIntegrityBanner()}
            {renderDetailsCard()}
            {renderMatchTap()}
          </div>
        );

      case 'compromised':
        // A third party copied this QR/PIN onto another advert. The
        // recruiter's verification is INTACT — show the real details and
        // warn about the CONTEXT, never about the recruiter.
        return (
          <div className="space-y-6">
            <StatusCard
              icon={AlertTriangle}
              title="Verification Code Reported Misused"
              color="orange"
            />
            <div className="bg-red-50 border-l-4 border-red-400 p-5 rounded-r-xl flex gap-3">
              <Shield className="w-6 h-6 text-red-600 shrink-0" />
              <div>
                <h4 className="font-bold text-red-800">THIS CODE WAS CLONED</h4>
                <p className="text-red-700 text-sm mt-1">
                  This verification code was reported being displayed on ANOTHER
                  advert and has been replaced. The details below are the
                  authentic verified advert — this recruiter's verification is
                  intact. If the advert you are looking at differs in ANY way
                  from these details, it is FAKE.
                </p>
              </div>
            </div>
            {renderDetailsCard()}
            {renderMatchTap()}
          </div>
        );

      case 'expired':
        return (
          <div className="space-y-6">
            <StatusCard
              icon={Clock}
              title="Verified but Expired"
              color="orange"
            />
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <p className="text-gray-700 mb-4">
                This job advertisement was verified but the verification period has ended. The position may have been filled or the verification was not renewed.
              </p>
              <div className="flex flex-col sm:flex-row gap-6 mb-6">
                <div>
                  <p className="text-sm text-gray-500 font-medium">Originally Verified</p>
                  <p className="font-medium">{new Date(result.jobAd.verifiedOn).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 font-medium">Expired On</p>
                  <p className="font-medium">{new Date(result.jobAd.validUntil).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="bg-orange-50 p-4 rounded-xl text-orange-800 font-medium mb-6">
                We recommend contacting the company directly before applying.
              </div>
              <button
                onClick={handleReport}
                className="w-full bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <span>🚩</span> Report this Ad
              </button>
            </div>
          </div>
        );

      case 'revoked':
        return (
          <div className="space-y-6">
            <StatusCard
              icon={XCircle}
              title="Verification Revoked"
              color="red"
            />
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <div className="flex flex-col sm:flex-row gap-6 mb-6">
                <div>
                  <p className="text-sm text-gray-500 font-medium">Originally Verified</p>
                  <p className="font-medium">{new Date(result.jobAd.verifiedOn).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="bg-red-100 border border-red-200 p-4 rounded-xl text-red-800 font-medium mb-6">
                This job advertisement's verification has been REVOKED by our platform administrators. We strongly recommend NOT proceeding with this job application.
              </div>
              <button
                onClick={handleReport}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <span>🚩</span> Report this Ad
              </button>
            </div>
          </div>
        );

      case 'deactivated':
        return (
          <div className="space-y-6">
            <StatusCard
              icon={XCircle}
              title="Verification Deactivated"
              color="red"
            />
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <div className="bg-red-100 border border-red-200 p-4 rounded-xl text-red-800 font-medium mb-6">
                This verification code has been deactivated. Do not proceed based on
                this code alone — verify directly with the company first.
              </div>
              <button
                onClick={handleReport}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <span>🚩</span> Report this Ad
              </button>
            </div>
          </div>
        );

      case 'not_found':
      default:
        return (
          <div className="space-y-6">
            <StatusCard
              icon={HelpCircle}
              title="Verification Code Not Found"
              color="gray"
            />
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <p className="text-gray-700 mb-4 font-medium">
                This code does not exist in our system. This means either:
              </p>
              <ul className="list-disc pl-5 mb-6 text-gray-600 space-y-2">
                <li>The code was entered incorrectly</li>
                <li>The advertisement was never verified on TrustHire</li>
                <li>The code is invalid</li>
              </ul>

              <div className="bg-blue-50 p-4 rounded-xl text-blue-800 text-sm mb-6 flex gap-3 items-start">
                <Shield className="w-5 h-5 shrink-0 mt-0.5" />
                <p>Only trust job advertisements that have been verified on TrustHire. If an ad claims to be verified but the code doesn't work, be cautious.</p>
              </div>

              <Link
                to="/"
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-lg font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
              >
                Try Again
              </Link>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="max-w-xl mx-auto pb-10">
      {renderStateContent()}
    </div>
  );
}
