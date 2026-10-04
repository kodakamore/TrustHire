import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import StatusBadge from "../../components/StatusBadge";
import { company as companyApi, verify as verifyApi } from "../../services/api";
import { ShieldX, ArrowRight } from "lucide-react";

const AddCompany = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: "",
    rcNumber: "",
    tinNumber: "",
    websiteUrl: "",
    address: "",
    industry: "",
    email: "",
    phone: "",
  });

  const [companyId, setCompanyId] = useState(null);
  const [verificationStatus, setVerificationStatus] = useState({
    cac: "pending",
    tin: "pending",
    website: "pending",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // DNS TXT domain-ownership verification (optional, strongest proof)
  const [dnsRecord, setDnsRecord] = useState(null);
  const [dnsStatus, setDnsStatus] = useState("pending"); // pending | verified | rejected
  const [dnsLoading, setDnsLoading] = useState(false);
  const [dnsMsg, setDnsMsg] = useState("");

  // Corporate email OTP states
  const [corporateEmail, setCorporateEmail] = useState("");
  const [corporateOtp, setCorporateOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [corporateVerified, setCorporateVerified] = useState(false);
  const [corpLoading, setCorpLoading] = useState(false);
  const [corpMsg, setCorpMsg] = useState("");
  const [corpError, setCorpError] = useState("");

  // Identity gate — must be fully verified before adding a company
  const [identityGate, setIdentityGate] = useState({
    checking: true,
    passed: false,
    status: null,
  });

  useEffect(() => {
    verifyApi
      .getStatus()
      .then((res) => {
        const r = res.data?.data;
        const passed =
          r?.is_email_verified &&
          r?.is_phone_verified &&
          r?.is_identity_verified &&
          r?.is_face_verified;
        setIdentityGate({ checking: false, passed: !!passed, status: r });
      })
      .catch(() =>
        setIdentityGate({ checking: false, passed: false, status: null }),
      );
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await companyApi.create({
        name: formData.name,
        registrationNumber: formData.rcNumber,
        tinNumber: formData.tinNumber,
        websiteUrl: formData.websiteUrl,
        address: formData.address,
        industry: formData.industry,
      });
      if (res.data?.data?.id) {
        setCompanyId(res.data.data.id);
      }
    } catch (err) {
      setError(
        err.response?.data?.error ||
          "Failed to create company. Please check the information.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCAC = async () => {
    if (!companyId) return;
    setVerificationStatus((prev) => ({ ...prev, cac: "under_review" }));
    try {
      const res = await companyApi.verifyCAC(companyId);
      const status =
        res.data?.verificationStatus ||
        (res.data?.success ? "verified" : "rejected");
      setVerificationStatus((prev) => ({ ...prev, cac: status }));
    } catch (err) {
      setVerificationStatus((prev) => ({ ...prev, cac: "rejected" }));
    }
  };

  const handleVerifyTIN = async () => {
    if (!companyId) return;
    setVerificationStatus((prev) => ({ ...prev, tin: "under_review" }));
    try {
      const res = await companyApi.verifyTIN(companyId);
      setVerificationStatus((prev) => ({
        ...prev,
        tin: res.data?.success ? "verified" : "rejected",
      }));
    } catch (err) {
      setVerificationStatus((prev) => ({ ...prev, tin: "rejected" }));
    }
  };

  const handleVerifyWebsite = async () => {
    if (!companyId) return;
    setVerificationStatus((prev) => ({ ...prev, website: "under_review" }));
    try {
      const res = await companyApi.verifyWebsite(companyId);
      setVerificationStatus((prev) => ({
        ...prev,
        website: res.data?.success ? "verified" : "rejected",
      }));
    } catch (err) {
      setVerificationStatus((prev) => ({ ...prev, website: "rejected" }));
    }
  };

  // DNS TXT record is the only proof of domain ownership here that isn't a
  // heuristic — everything else (WHOIS age, blacklist score, homepage text
  // matching) is supporting evidence, not proof. This step is optional but
  // strongly recommended: it outweighs those heuristics once verified.
  const handleGetDnsRecord = async () => {
    if (!companyId) return;
    setDnsLoading(true);
    setDnsMsg("");
    try {
      const res = await companyApi.getDnsInstructions(companyId);
      setDnsRecord(res.data?.data || null);
    } catch (err) {
      setDnsMsg(
        err.response?.data?.error ||
          "Could not generate a DNS verification record. Add a website URL first.",
      );
    } finally {
      setDnsLoading(false);
    }
  };

  const handleVerifyDns = async () => {
    if (!companyId) return;
    setDnsLoading(true);
    setDnsMsg("");
    setDnsStatus("under_review");
    try {
      const res = await companyApi.verifyDns(companyId);
      setDnsStatus(res.data?.success ? "verified" : "rejected");
      setDnsMsg(res.data?.message || "");
    } catch (err) {
      setDnsStatus("rejected");
      setDnsMsg(
        err.response?.data?.error ||
          "DNS TXT record not found yet. DNS changes can take a few minutes up to 24-48 hours to propagate — try again shortly.",
      );
    } finally {
      setDnsLoading(false);
    }
  };

  const handleSendCorporateOTP = async () => {
    if (!corporateEmail) return;
    setCorpLoading(true);
    setCorpError("");
    setCorpMsg("");
    try {
      const res = await companyApi.sendCorporateEmailOTP(companyId, {
        corporateEmail,
      });
      setOtpSent(true);
      setCorpMsg(res.data?.message || "Verification code sent!");
    } catch (err) {
      setCorpError(
        err.response?.data?.error || "Failed to send verification code.",
      );
    } finally {
      setCorpLoading(false);
    }
  };

  const handleVerifyCorporateOTP = async () => {
    if (!corporateOtp) return;
    setCorpLoading(true);
    setCorpError("");
    setCorpMsg("");
    try {
      const res = await companyApi.verifyCorporateEmailOTP(companyId, {
        otp: corporateOtp,
      });
      setCorporateVerified(true);
      setCorpMsg(res.data?.message || "Corporate email verified successfully!");
    } catch (err) {
      setCorpError(err.response?.data?.error || "Invalid or expired code.");
    } finally {
      setCorpLoading(false);
    }
  };

  // ── Identity Gate: Loading ─────────────────────────────────────────────────
  if (identityGate.checking) {
    return (
      <div className="max-w-3xl mx-auto bg-white p-8 rounded-lg shadow-sm border border-gray-200 text-center">
        <p className="text-gray-500 text-sm animate-pulse">
          Checking your verification status...
        </p>
      </div>
    );
  }

  // ── Identity Gate: Blocked ─────────────────────────────────────────────────
  if (!identityGate.passed) {
    const s = identityGate.status;
    const steps = [
      { label: "Email Verified", done: !!s?.is_email_verified },
      { label: "Phone Verified", done: !!s?.is_phone_verified },
      { label: "Government ID (NIN/BVN)", done: !!s?.is_identity_verified },
      { label: "Facial Biometric", done: !!s?.is_face_verified },
    ];
    return (
      <div className="max-w-xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-red-100">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center">
            <ShieldX className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">
            Identity Verification Required
          </h2>
          <p className="text-sm text-gray-500 max-w-sm">
            You must complete all 4 identity verification steps before you can
            register a company.
          </p>
        </div>

        <ul className="mt-6 space-y-3">
          {steps.map((step) => (
            <li
              key={step.label}
              className={`flex items-center gap-3 p-3 rounded-lg border ${step.done ? "bg-emerald-50 border-emerald-200" : "bg-gray-50 border-gray-200"}`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step.done ? "bg-emerald-500 text-white" : "bg-gray-300 text-gray-600"}`}
              >
                {step.done ? "✓" : "○"}
              </span>
              <span
                className={`text-sm font-medium ${step.done ? "text-emerald-800" : "text-gray-600"}`}
              >
                {step.label}
              </span>
              <span
                className={`ml-auto text-xs font-semibold ${step.done ? "text-emerald-600" : "text-amber-600"}`}
              >
                {step.done ? "Complete" : "Pending"}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-8 flex justify-center">
          <Link
            to="/recruiter/verify"
            className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition"
          >
            Resume Verification <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  if (companyId) {
    return (
      <div className="max-w-3xl mx-auto bg-white p-8 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Verify Company
        </h2>
        <p className="text-gray-600 mb-8">
          Company created successfully! Now let's verify its details.
        </p>

        <div className="space-y-6">
          <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div>
              <p className="font-medium text-gray-900">
                CAC Registration (RC Number)
              </p>
              <p className="text-sm text-gray-500">{formData.rcNumber}</p>
            </div>
            <div className="flex items-center space-x-4">
              <StatusBadge status={verificationStatus.cac} />
              {verificationStatus.cac === "pending" && (
                <button
                  onClick={handleVerifyCAC}
                  className="text-sm bg-indigo-100 text-indigo-700 px-3 py-1 rounded hover:bg-indigo-200"
                >
                  Verify
                </button>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div>
              <p className="font-medium text-gray-900">TIN Number</p>
              <p className="text-sm text-gray-500">
                {formData.tinNumber || "Not provided"}
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <StatusBadge status={verificationStatus.tin} />
              {verificationStatus.tin === "pending" && formData.tinNumber && (
                <button
                  onClick={handleVerifyTIN}
                  className="text-sm bg-indigo-100 text-indigo-700 px-3 py-1 rounded hover:bg-indigo-200"
                >
                  Verify
                </button>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div>
              <p className="font-medium text-gray-900">
                Domain Safety & Affiliation (WhoisXML + APIVoid)
              </p>
              <p className="text-sm text-gray-500">{formData.websiteUrl}</p>
              <p className="text-xs text-indigo-600 mt-0.5">
                Checks domain age, cybersecurity blocklists, and corporate email
                match
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <StatusBadge status={verificationStatus.website} />
              {verificationStatus.website === "pending" && (
                <button
                  onClick={handleVerifyWebsite}
                  className="text-sm bg-indigo-100 text-indigo-700 px-3 py-1 rounded hover:bg-indigo-200"
                >
                  Verify
                </button>
              )}
            </div>
          </div>

          {/* DNS TXT Record Ownership Verification — optional but strongest available proof */}
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium text-gray-900">
                  Domain Ownership Proof (DNS TXT Record)
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Optional, but the strongest signal TrustHire can check: proves
                  you control this domain's DNS, the same way Google Search
                  Console or SendGrid verify domain ownership.
                </p>
              </div>
              <StatusBadge status={dnsStatus} />
            </div>

            {!dnsRecord ? (
              <button
                onClick={handleGetDnsRecord}
                disabled={dnsLoading || !formData.websiteUrl}
                className="text-sm bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded hover:bg-indigo-200 disabled:opacity-50"
              >
                {dnsLoading ? "Loading..." : "Get DNS Record to Add"}
              </button>
            ) : (
              <div className="space-y-2">
                <div className="bg-white border border-gray-200 rounded-md p-3 text-xs font-mono space-y-1">
                  <p>
                    <span className="text-gray-500">Type:</span>{" "}
                    {dnsRecord.recordType}
                  </p>
                  <p>
                    <span className="text-gray-500">Host:</span>{" "}
                    {dnsRecord.recordHost}
                  </p>
                  <p className="break-all">
                    <span className="text-gray-500">Value:</span>{" "}
                    {dnsRecord.recordValue}
                  </p>
                </div>
                <p className="text-xs text-gray-500">
                  {dnsRecord.instructions}
                </p>
                <button
                  onClick={handleVerifyDns}
                  disabled={dnsLoading}
                  className="text-sm bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded hover:bg-emerald-200 disabled:opacity-50"
                >
                  {dnsLoading ? "Checking..." : "I've added it — Verify Now"}
                </button>
              </div>
            )}
            {dnsMsg && (
              <p
                className={`text-xs ${dnsStatus === "verified" ? "text-emerald-600" : "text-amber-600"}`}
              >
                {dnsMsg}
              </p>
            )}
          </div>

          {/* Corporate Work Email Verification Card - MANDATORY */}
          <div
            className={`p-5 rounded-xl border ${corporateVerified ? "bg-emerald-50/50 border-emerald-200" : "bg-amber-50/40 border-amber-200"} space-y-4`}
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="font-bold text-gray-900 flex items-center gap-1.5 text-base">
                  <span>Official Corporate Work Email Verification</span>
                  <span className="text-red-500 font-bold">*</span>
                </p>
                <p className="text-xs text-gray-600 mt-1 max-w-xl">
                  <strong>Mandatory Requirement:</strong> To prevent fraud, all
                  job advertisements on TrustHire must be authorized through an
                  official corporate email address matching the company domain.
                  Generic/personal emails (Gmail, Yahoo, Outlook, etc.) are
                  strictly prohibited.
                </p>
              </div>
              <span
                className={`text-xs font-extrabold px-3 py-1 rounded-full ${corporateVerified ? "bg-emerald-100 text-emerald-800 border border-emerald-300" : "bg-red-100 text-red-800 border border-red-300"}`}
              >
                {corporateVerified
                  ? "Verified Official Email ✔"
                  : "Mandatory Required *"}
              </span>
            </div>

            {corporateVerified ? (
              <div className="bg-emerald-100/70 text-emerald-900 p-4 rounded-xl text-xs font-semibold border border-emerald-300 flex items-center gap-3">
                <span className="text-emerald-700 text-base">✔</span>
                <div>
                  <p className="font-bold">
                    Official Work Email Verified: {corporateEmail}
                  </p>
                  <p className="text-emerald-800 text-[11px] mt-0.5">
                    Your corporate domain authorization is confirmed. You are
                    fully authorized to post verified job advertisements for
                    this company.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                {corpError && (
                  <p className="text-xs text-red-700 bg-red-50 p-3 rounded-lg border border-red-200 font-medium">
                    {corpError}
                  </p>
                )}
                {corpMsg && (
                  <p className="text-xs text-emerald-800 bg-emerald-50 p-3 rounded-lg border border-emerald-200 font-medium">
                    {corpMsg}
                  </p>
                )}

                {!otpSent ? (
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-gray-700 uppercase">
                      Enter Your Official Company Email (@
                      {formData.websiteUrl
                        ? formData.websiteUrl
                            .replace(/^https?:\/\//i, "")
                            .replace(/^www\./i, "")
                            .split("/")[0]
                        : "company.com"}
                      )
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="email"
                        placeholder="e.g. hr@company.com or careers@company.com"
                        value={corporateEmail}
                        onChange={(e) => {
                          setCorporateEmail(e.target.value);
                          setCorpError("");
                        }}
                        className="flex-1 px-3.5 py-2 text-xs border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const pubDomains = [
                            "gmail.com",
                            "yahoo.com",
                            "hotmail.com",
                            "outlook.com",
                            "live.com",
                            "icloud.com",
                            "mail.com",
                            "proton.me",
                            "aol.com",
                            "zoho.com",
                          ];
                          const dom = (corporateEmail.split("@")[1] || "")
                            .toLowerCase()
                            .trim();
                          if (pubDomains.includes(dom)) {
                            setCorpError(
                              `Personal webmail (@${dom}) is prohibited. You must enter your company work email matching your website.`,
                            );
                            return;
                          }
                          handleSendCorporateOTP();
                        }}
                        disabled={corpLoading || !corporateEmail}
                        className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 shadow-sm"
                      >
                        {corpLoading ? "Sending..." : "Send Corporate OTP"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 bg-white p-4 rounded-xl border border-gray-200">
                    <p className="text-xs text-gray-700">
                      Enter the 6-digit corporate verification code sent to{" "}
                      <strong>{corporateEmail}</strong>:
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        maxLength="6"
                        placeholder="123456"
                        value={corporateOtp}
                        onChange={(e) => setCorporateOtp(e.target.value)}
                        className="w-32 px-3 py-1.5 text-xs text-center font-mono tracking-widest border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={handleVerifyCorporateOTP}
                        disabled={corpLoading || corporateOtp.length < 6}
                        className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {corpLoading ? "Verifying..." : "Confirm OTP Code"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setOtpSent(false)}
                        className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
                      >
                        Change Email
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between">
          {!corporateVerified && (
            <p className="text-xs text-amber-700 font-medium">
              ⚠️ Official work email must be verified before job advertisements
              can be posted.
            </p>
          )}
          <div className="ml-auto flex gap-3">
            <button
              onClick={() => navigate("/recruiter/dashboard")}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm transition ${corporateVerified ? "bg-indigo-600 hover:bg-indigo-700 text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-700"}`}
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto bg-white p-8 rounded-lg shadow-sm border border-gray-200">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Add New Company</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Company Name
            </label>
            <input
              type="text"
              name="name"
              required
              value={formData.name}
              onChange={handleChange}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              RC Number (CAC)
            </label>
            <input
              type="text"
              name="rcNumber"
              required
              value={formData.rcNumber}
              onChange={handleChange}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              TIN Number (Optional)
            </label>
            <input
              type="text"
              name="tinNumber"
              value={formData.tinNumber}
              onChange={handleChange}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Website URL
            </label>
            <input
              type="url"
              name="websiteUrl"
              required
              value={formData.websiteUrl}
              onChange={handleChange}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Company Email
            </label>
            <input
              type="email"
              name="email"
              required
              value={formData.email}
              onChange={handleChange}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Company Phone
            </label>
            <input
              type="tel"
              name="phone"
              required
              value={formData.phone}
              onChange={handleChange}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Industry
            </label>
            <select
              name="industry"
              required
              value={formData.industry}
              onChange={handleChange}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm"
            >
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
          <label className="block text-sm font-medium text-gray-700">
            Address
          </label>
          <textarea
            name="address"
            required
            rows="3"
            value={formData.address}
            onChange={handleChange}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm"
          ></textarea>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save & Continue to Verification"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddCompany;
