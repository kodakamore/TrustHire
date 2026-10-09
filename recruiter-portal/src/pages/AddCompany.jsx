import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';
import { company as companyApi } from '../services/api';

// Server-provided `error` strings are shown verbatim.
const errMsg = (err, fallback) => err?.response?.data?.error || fallback;

// GET /api/company/:id/status returns checks: { cac, website, corporateEmail,
// websiteContentMatch }. TIN has no derived check — fall back to its flag.
const readChecks = (data) => ({
  cac: data?.checks?.cac || (data?.is_cac_verified ? 'verified' : 'pending'),
  tin: data?.is_tin_verified ? 'verified' : 'pending',
  website: data?.checks?.website || (data?.is_domain_verified ? 'verified' : 'pending'),
  corporateEmail: data?.checks?.corporateEmail || (data?.is_corporate_email_verified ? 'verified' : 'pending'),
});

const AddCompany = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    rcNumber: '',
    tinNumber: '',
    websiteUrl: '',
    address: '',
    industry: '',
    email: '',
    phone: '',
  });

  const [companyId, setCompanyId] = useState(null);
  const [companyRecord, setCompanyRecord] = useState(null);
  const [checks, setChecks] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busyCheck, setBusyCheck] = useState(null);
  // { type: 'success' | 'error' | 'info', text }
  const [notice, setNotice] = useState(null);

  // Corporate email OTP
  const [corporateEmail, setCorporateEmail] = useState('');
  const [corpOtp, setCorpOtp] = useState('');
  const [corpOtpSent, setCorpOtpSent] = useState(false);
  const [corpDebugOtp, setCorpDebugOtp] = useState(null);
  const [corpLoading, setCorpLoading] = useState(false);

  // DNS TXT domain ownership (only ever 'verified' after the server confirms)
  const [dnsRecord, setDnsRecord] = useState(null);
  const [dnsStatus, setDnsStatus] = useState('pending');
  const [dnsLoading, setDnsLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Authoritative per-check state from the backend.
  const loadStatus = async (id) => {
    try {
      const res = await companyApi.getStatus(id);
      const data = res.data?.data;
      if (data) {
        setCompanyRecord(data);
        setChecks(readChecks(data));
      }
      return data;
    } catch (err) {
      setNotice({ type: 'error', text: errMsg(err, 'Could not load the company verification status.') });
      return null;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setNotice(null);
    try {
      const res = await companyApi.create({
        name: formData.name,
        registrationNumber: formData.rcNumber,
        tinNumber: formData.tinNumber,
        websiteUrl: formData.websiteUrl,
        address: formData.address,
        industry: formData.industry,
      });
      const created = res.data?.data;
      if (!created?.id) {
        setNotice({ type: 'error', text: 'The server did not return a company ID. Please try again.' });
        return;
      }
      setCompanyId(created.id);
      await loadStatus(created.id);
    } catch (err) {
      setNotice({ type: 'error', text: errMsg(err, 'Failed to create the company. Please check the information.') });
    } finally {
      setLoading(false);
    }
  };

  // Runs one of the real verification endpoints, then re-polls status so the
  // badges always reflect what the server actually stored.
  const runCheck = async (name, request, describe) => {
    if (!companyId) return;
    setBusyCheck(name);
    setNotice(null);
    try {
      const res = await request();
      await loadStatus(companyId);
      const text = describe(res);
      if (text) setNotice({ type: 'info', text });
    } catch (err) {
      const text = errMsg(err, 'Verification failed.');
      await loadStatus(companyId);
      setNotice({ type: 'error', text });
    } finally {
      setBusyCheck(null);
    }
  };

  const handleVerifyCAC = () => runCheck(
    'cac',
    () => companyApi.verifyCAC(companyId),
    (res) => res.data?.verificationStatus === 'verified'
      ? 'CAC registration confirmed.'
      : 'CAC lookup did not confirm the registration — it has been flagged for manual review.',
  );

  const handleVerifyTIN = () => runCheck(
    'tin',
    () => companyApi.verifyTIN(companyId),
    (res) => res.data?.data?.success
      ? 'TIN confirmed against the tax registry.'
      : 'TIN lookup did not match a registry record.',
  );

  const handleVerifyWebsite = () => runCheck(
    'website',
    () => companyApi.verifyWebsite(companyId),
    (res) => res.data?.data?.isDomainSafe
      ? 'Domain safety check passed.'
      : 'Domain safety check did not pass — the website has been left unverified.',
  );

  // ── Corporate work email (send OTP → verify OTP) ─────────────────────────
  const handleSendCorporateOtp = async () => {
    if (!companyId || !corporateEmail) return;
    setCorpLoading(true);
    setNotice(null);
    try {
      const res = await companyApi.sendCorporateOtp(companyId, { corporateEmail });
      setCorpOtpSent(true);
      setCorpDebugOtp(res.data?.data?.debugOtp || null);
      setNotice({ type: 'success', text: res.data?.message || 'Verification code sent!' });
    } catch (err) {
      setNotice({ type: 'error', text: errMsg(err, 'Failed to send the verification code.') });
    } finally {
      setCorpLoading(false);
    }
  };

  const handleVerifyCorporateOtp = async () => {
    if (!companyId || !corpOtp) return;
    setCorpLoading(true);
    setNotice(null);
    try {
      const res = await companyApi.verifyCorporateOtp(companyId, { otp: corpOtp });
      await loadStatus(companyId);
      setCorpOtp('');
      setCorpDebugOtp(null);
      setNotice({ type: 'success', text: res.data?.message || 'Corporate email verified successfully!' });
    } catch (err) {
      const text = errMsg(err, 'Invalid or expired verification code.');
      await loadStatus(companyId);
      setNotice({ type: 'error', text });
    } finally {
      setCorpLoading(false);
    }
  };

  // ── DNS TXT domain ownership ─────────────────────────────────────────────
  const handleGetDnsRecord = async () => {
    if (!companyId) return;
    setDnsLoading(true);
    setNotice(null);
    try {
      const res = await companyApi.getDnsInstructions(companyId);
      setDnsRecord(res.data?.data || null);
    } catch (err) {
      setNotice({ type: 'error', text: errMsg(err, 'Could not generate a DNS verification record.') });
    } finally {
      setDnsLoading(false);
    }
  };

  const handleVerifyDns = async () => {
    if (!companyId) return;
    setDnsLoading(true);
    setNotice(null);
    try {
      const res = await companyApi.verifyDns(companyId);
      setDnsStatus('verified');
      await loadStatus(companyId);
      setNotice({ type: 'success', text: res.data?.message || 'Domain ownership verified via DNS TXT record.' });
    } catch (err) {
      const text = errMsg(err, 'DNS TXT record not found yet. DNS changes can take up to 24-48 hours to propagate — try again shortly.');
      await loadStatus(companyId);
      setNotice({ type: 'error', text });
    } finally {
      setDnsLoading(false);
    }
  };

  if (companyId) {
    const rcNumber = companyRecord?.registration_number || formData.rcNumber;
    const tinNumber = companyRecord?.tin_number || formData.tinNumber;
    const websiteUrl = companyRecord?.website_url || formData.websiteUrl;

    return (
      <div className="max-w-3xl mx-auto bg-white p-8 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Verify Company</h2>
        <p className="text-gray-600 mb-6">Company created successfully! Now let's verify its details.</p>

        {notice && (
          <div
            role={notice.type === 'error' ? 'alert' : 'status'}
            className={`mb-6 px-4 py-3 rounded-md text-sm border ${
              notice.type === 'error'
                ? 'bg-red-50 border-red-200 text-red-700'
                : notice.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}
          >
            {notice.text}
          </div>
        )}

        {!checks ? (
          notice?.type === 'error' ? (
            <button
              type="button"
              onClick={() => loadStatus(companyId)}
              className="text-sm bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded hover:bg-indigo-200"
            >
              Retry loading status
            </button>
          ) : (
            <p className="text-gray-500 text-sm animate-pulse">Loading verification status...</p>
          )
        ) : (
          <div className="space-y-6">
            <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div>
                <p className="font-medium text-gray-900">CAC Registration (RC Number)</p>
                <p className="text-sm text-gray-500">{rcNumber}</p>
              </div>
              <div className="flex items-center space-x-4">
                <StatusBadge status={checks.cac} />
                {checks.cac !== 'verified' && (
                  <button
                    onClick={handleVerifyCAC}
                    disabled={busyCheck !== null}
                    className="text-sm bg-indigo-100 text-indigo-700 px-3 py-1 rounded hover:bg-indigo-200 disabled:opacity-50"
                  >
                    {busyCheck === 'cac' ? 'Checking...' : 'Verify'}
                  </button>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div>
                <p className="font-medium text-gray-900">TIN Number</p>
                <p className="text-sm text-gray-500">{tinNumber || 'Not provided'}</p>
              </div>
              <div className="flex items-center space-x-4">
                <StatusBadge status={checks.tin} />
                {checks.tin !== 'verified' && tinNumber && (
                  <button
                    onClick={handleVerifyTIN}
                    disabled={busyCheck !== null}
                    className="text-sm bg-indigo-100 text-indigo-700 px-3 py-1 rounded hover:bg-indigo-200 disabled:opacity-50"
                  >
                    {busyCheck === 'tin' ? 'Checking...' : 'Verify'}
                  </button>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div>
                <p className="font-medium text-gray-900">Company Website</p>
                <p className="text-sm text-gray-500">{websiteUrl}</p>
              </div>
              <div className="flex items-center space-x-4">
                <StatusBadge status={checks.website} />
                {checks.website !== 'verified' && (
                  <button
                    onClick={handleVerifyWebsite}
                    disabled={busyCheck !== null}
                    className="text-sm bg-indigo-100 text-indigo-700 px-3 py-1 rounded hover:bg-indigo-200 disabled:opacity-50"
                  >
                    {busyCheck === 'website' ? 'Checking...' : 'Verify'}
                  </button>
                )}
              </div>
            </div>

            {/* Corporate work email verification (mandatory before posting jobs) */}
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-gray-900">Corporate Work Email</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Required before posting jobs: an official address on your company domain (no Gmail/Yahoo/Outlook).
                  </p>
                </div>
                <StatusBadge status={checks.corporateEmail} />
              </div>

              {checks.corporateEmail === 'verified' ? (
                <p className="text-sm text-emerald-700 font-medium">
                  Verified: {companyRecord?.corporate_email || corporateEmail}
                </p>
              ) : (
                <div className="space-y-3">
                  {!corpOtpSent ? (
                    <div className="flex gap-2">
                      <input
                        type="email"
                        placeholder="e.g. hr@yourcompany.com"
                        value={corporateEmail}
                        onChange={(e) => setCorporateEmail(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm"
                      />
                      <button
                        type="button"
                        onClick={handleSendCorporateOtp}
                        disabled={corpLoading || !corporateEmail}
                        className="text-sm bg-indigo-100 text-indigo-700 px-3 py-2 rounded hover:bg-indigo-200 disabled:opacity-50"
                      >
                        {corpLoading ? 'Sending...' : 'Send OTP'}
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2 items-center bg-white p-3 rounded-md border border-gray-200">
                      <div>
                        <p className="text-xs text-gray-600 mb-1">
                          Enter the 6-digit code sent to <strong>{corporateEmail}</strong>
                        </p>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          placeholder="123456"
                          value={corpOtp}
                          onChange={(e) => setCorpOtp(e.target.value.replace(/\D/g, ''))}
                          className="w-32 px-3 py-1.5 text-center text-sm font-mono tracking-widest border border-gray-300 rounded-md"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleVerifyCorporateOtp}
                        disabled={corpLoading || corpOtp.length !== 6}
                        className="text-sm bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded hover:bg-emerald-200 disabled:opacity-50"
                      >
                        {corpLoading ? 'Verifying...' : 'Verify OTP'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCorpOtpSent(false)}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Change email
                      </button>
                      {corpDebugOtp && (
                        <p className="text-xs font-mono text-indigo-700 bg-indigo-50 p-1.5 rounded basis-full">
                          Development OTP: <strong>{corpDebugOtp}</strong>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* DNS TXT record — strongest available proof of domain ownership */}
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-gray-900">Domain Ownership (DNS TXT Record)</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Optional: add this TXT record at your domain host to cryptographically prove you control the website domain.
                  </p>
                </div>
                <StatusBadge status={dnsStatus} />
              </div>

              {!dnsRecord ? (
                <button
                  type="button"
                  onClick={handleGetDnsRecord}
                  disabled={dnsLoading || !websiteUrl}
                  className="text-sm bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded hover:bg-indigo-200 disabled:opacity-50"
                >
                  {dnsLoading ? 'Loading...' : 'Get DNS Record to Add'}
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="bg-white border border-gray-200 rounded-md p-3 text-xs font-mono space-y-1">
                    <p><span className="text-gray-500">Type:</span> {dnsRecord.recordType}</p>
                    <p><span className="text-gray-500">Host:</span> {dnsRecord.recordHost}</p>
                    <p className="break-all"><span className="text-gray-500">Value:</span> {dnsRecord.recordValue}</p>
                  </div>
                  {dnsRecord.instructions && (
                    <p className="text-xs text-gray-500">{dnsRecord.instructions}</p>
                  )}
                  <button
                    type="button"
                    onClick={handleVerifyDns}
                    disabled={dnsLoading}
                    className="text-sm bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded hover:bg-emerald-200 disabled:opacity-50"
                  >
                    {dnsLoading ? 'Checking...' : "I've added it — Verify Now"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-8 flex justify-end">
          <button
            onClick={() => navigate('/dashboard')}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto bg-white p-8 rounded-lg shadow-sm border border-gray-200">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Add New Company</h1>

      {notice && notice.type === 'error' && (
        <div role="alert" className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
          {notice.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">Company Name</label>
            <input type="text" name="name" required value={formData.name} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">RC Number (CAC)</label>
            <input type="text" name="rcNumber" required value={formData.rcNumber} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">TIN Number (Optional)</label>
            <input type="text" name="tinNumber" value={formData.tinNumber} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Website URL</label>
            <input type="url" name="websiteUrl" required value={formData.websiteUrl} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Company Email</label>
            <input type="email" name="email" required value={formData.email} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Company Phone</label>
            <input type="tel" name="phone" required value={formData.phone} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Industry</label>
            <select name="industry" required value={formData.industry} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm">
              <option value="">Select Industry</option>
              <option value="Technology">Technology</option>
              <option value="Finance">Finance</option>
              <option value="Healthcare">Healthcare</option>
              <option value="Education">Education</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Address</label>
          <textarea name="address" required rows="3" value={formData.address} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm"></textarea>
        </div>
        <div className="flex justify-end">
          <button type="submit" disabled={loading} className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50">
            {loading ? 'Saving...' : 'Save & Continue to Verification'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddCompany;
