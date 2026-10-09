import * as Job from '../models/job.model.js';
import * as Recruiter from '../models/recruiter.model.js';
import * as Company from '../models/company.model.js';
import * as VerificationCode from '../models/verificationCode.model.js';
import { processJobVerification } from '../services/verification.service.js';
import { hashJobData } from '../services/hash.service.js';
import { generateVerificationCode } from '../services/qrcode.service.js';
import { extractDomain, isPublicEmailDomain } from '../utils/domainHelper.js';
import QRCode from 'qrcode';

export const createJob = async (req, res) => {
  try {
    const recruiterId = req.user.id;
    const { 
      companyId, title, description, location, employmentType, type, 
      salaryRange, applicationUrl, applicationEmail, requirements, benefits, deadline 
    } = req.body;

    const resolvedEmploymentType = employmentType || type || 'Full-time';

    if (!title || !description || !companyId) {
      return res.status(400).json({ success: false, error: 'Job title, description, and company are required' });
    }

    const recruiter = await Recruiter.findById(recruiterId);
    const company = await Company.findById(companyId);

    if (!company || company.recruiter_id !== recruiterId) {
      return res.status(403).json({ success: false, error: 'Forbidden: Invalid company' });
    }

    // MANDATORY: Only official verified company emails can onboard job ads (no generic free emails)
    if (!company.is_corporate_email_verified) {
      const companyDomain = company.website_url ? extractDomain(company.website_url) : 'company.com';
      return res.status(403).json({
        success: false,
        error: `Job advertisements can only be onboarded through a verified official company email (@${companyDomain}). Generic or personal free emails are strictly prohibited on TrustHire. Please verify your corporate work email under Company settings.`
      });
    }

    if (applicationEmail && isPublicEmailDomain(applicationEmail)) {
      const emailDomain = applicationEmail.split('@')[1];
      return res.status(400).json({
        success: false,
        error: `Application email cannot use a generic/free email provider (@${emailDomain}). Applications must be directed to an official company email address.`
      });
    }

    const dataHash = hashJobData({ 
      title, 
      description, 
      company_id: companyId, 
      location, 
      employment_type: resolvedEmploymentType, 
      salary_range: salaryRange,
      application_url: applicationUrl 
    });

    const jobData = {
      recruiterId, 
      companyId, 
      title, 
      description, 
      location, 
      employmentType: resolvedEmploymentType, 
      salaryRange, 
      applicationUrl, 
      applicationEmail, 
      requirements, 
      benefits, 
      deadline: deadline || null,
      dataHash
    };

    const verificationResult = await processJobVerification(jobData, recruiter, company);
    
    jobData.status = verificationResult.status;
    jobData.flags = verificationResult.flags;

    const job = await Job.create(jobData);

    let verificationCode = null;
    if (jobData.status === 'approved') {
      const expiresAt = new Date();
      const validityDays = parseInt(process.env.VERIFICATION_VALIDITY_DAYS || '90', 10);
      expiresAt.setDate(expiresAt.getDate() + validityDays);

      const qrData = await generateVerificationCode(job.id, expiresAt);
      verificationCode = await VerificationCode.create({
        jobAdId: job.id,
        pin: qrData.pin,
        qrCodeUrl: qrData.qrCodeUrl,
        qrCodePath: qrData.qrCodeImagePath,
        expiresAt
      });
    }

    res.status(201).json({ 
      success: true, 
      data: {
        ...job,
        pin: verificationCode?.pin || null,
        qrCodeUrl: verificationCode?.qr_code_url || null,
        expiresAt: verificationCode?.expires_at || null
      } 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getJobs = async (req, res) => {
  try {
    const jobs = await Job.findByRecruiterId(req.user.id);
    res.json({ success: true, data: jobs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getJob = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job || job.recruiter_id !== req.user.id) {
        return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const verificationCode = await VerificationCode.findByJobAdId(job.id);
    let qrCodeDataUrl = null;
    if (verificationCode?.qr_code_url) {
      try {
        qrCodeDataUrl = await QRCode.toDataURL(verificationCode.qr_code_url, {
          errorCorrectionLevel: 'H',
          margin: 2,
          width: 300,
          color: { dark: '#000000', light: '#ffffff' }
        });
      } catch (err) {
        console.warn('QR code generation warning:', err);
      }
    }

    res.json({
      success: true,
      data: {
        ...job,
        pin: verificationCode?.pin || null,
        qr_code_url: verificationCode?.qr_code_url || null,
        qr_code_path: verificationCode?.qr_code_path || null,
        qr_code_data_url: qrCodeDataUrl,
        expires_at: verificationCode?.expires_at || null
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// SECURITY (audit C1): columns a recruiter may edit through PUT /api/job/:id.
// status/flags/data_hash/recruiter_id are server-set only — the previous code
// passed the raw request body into the UPDATE, so a client could send
// `{"status":"approved"}` and self-approve without any verification.
const JOB_EDITABLE_FIELDS = {
  title: 'title',
  description: 'description',
  location: 'location',
  employmentType: 'employment_type',
  employment_type: 'employment_type',
  type: 'employment_type',
  salaryRange: 'salary_range',
  salary_range: 'salary_range',
  applicationUrl: 'application_url',
  application_url: 'application_url',
  applicationEmail: 'application_email',
  application_email: 'application_email',
  requirements: 'requirements',
  benefits: 'benefits',
  deadline: 'deadline',
  companyId: 'company_id',
  company_id: 'company_id',
};

const pickJobFields = (body) => {
  const patch = {};
  for (const [key, value] of Object.entries(body || {})) {
    const column = JOB_EDITABLE_FIELDS[key];
    if (column) patch[column] = value;
    // status, flags, data_hash, recruiter_id, id … are silently dropped
  }
  return patch;
};

export const updateJob = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job || job.recruiter_id !== req.user.id) {
        return res.status(404).json({ success: false, error: 'Job not found' });
    }
    
    if (job.status !== 'pending' && job.status !== 'rejected') {
        return res.status(400).json({ success: false, error: 'Can only update pending or rejected jobs' });
    }

    // SECURITY (audit C1): only allowlisted content columns survive.
    const patch = pickJobFields(req.body);

    // Re-gate company_id: a job may only be attached to a company the
    // recruiter owns AND that has completed corporate-email verification.
    let company = null;
    if (patch.company_id !== undefined && patch.company_id !== job.company_id) {
      company = await Company.findById(patch.company_id);
      if (!company || company.recruiter_id !== req.user.id) {
        return res.status(403).json({ success: false, error: 'Forbidden: Invalid company' });
      }
      if (!company.is_corporate_email_verified) {
        const companyDomain = company.website_url ? extractDomain(company.website_url) : 'company.com';
        return res.status(403).json({
          success: false,
          error: `Job advertisements can only be onboarded through a verified official company email (@${companyDomain}). Generic or personal free emails are strictly prohibited on TrustHire. Please verify your corporate work email under Company settings.`
        });
      }
    }

    // The application-email rule applies on edit too, not just create.
    if (patch.application_email && isPublicEmailDomain(patch.application_email)) {
      const emailDomain = patch.application_email.split('@')[1];
      return res.status(400).json({
        success: false,
        error: `Application email cannot use a generic/free email provider (@${emailDomain}). Applications must be directed to an official company email address.`
      });
    }

    // SECURITY (audit C9): an edited job must NOT inherit stale verdicts.
    // Re-run the verification engine against the merged record so the flags
    // the admin will review reflect what is actually being submitted, then
    // send it back to 'pending' — an edit never self-approves, and a
    // previously-rejected job returns to the queue rather than staying
    // silently rejected (or becoming approved) without review.
    const merged = { ...job, ...patch };
    if (!company) company = await Company.findById(merged.company_id);
    const recruiter = await Recruiter.findById(req.user.id);

    const dataHash = hashJobData({
      title: merged.title,
      description: merged.description,
      company_id: merged.company_id,
      location: merged.location,
      employment_type: merged.employment_type,
      salary_range: merged.salary_range,
      application_url: merged.application_url
    });

    const verificationResult = await processJobVerification(
      {
        title: merged.title,
        description: merged.description,
        company_id: merged.company_id,
        location: merged.location,
        employment_type: merged.employment_type,
        salary_range: merged.salary_range,
        application_url: merged.application_url
      },
      recruiter,
      company
    );

    const updatedJob = await Job.update(req.params.id, {
      ...patch,
      data_hash: dataHash,
      flags: verificationResult.flags,
      status: 'pending'
    });
    res.json({ success: true, data: updatedJob });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getVerificationDetails = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job || job.recruiter_id !== req.user.id) {
        return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const verificationCode = await VerificationCode.findByJobAdId(job.id);
    if (!verificationCode) {
      return res.json({ success: true, data: null });
    }

    let qrCodeDataUrl = null;
    if (verificationCode.qr_code_url) {
      try {
        qrCodeDataUrl = await QRCode.toDataURL(verificationCode.qr_code_url, {
          errorCorrectionLevel: 'H',
          margin: 2,
          width: 300,
          color: { dark: '#000000', light: '#ffffff' }
        });
      } catch (err) {
        console.warn('QR code generation warning:', err);
      }
    }

    res.json({
      success: true,
      data: {
        ...verificationCode,
        qr_code_data_url: qrCodeDataUrl
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
