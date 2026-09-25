import * as VerificationCode from '../models/verificationCode.model.js';
import * as Report from '../models/report.model.js';
import { query } from '../config/database.js';
import { logEvent } from '../services/audit.service.js';

export const verifyByPin = async (req, res) => {
  try {
    const { pin } = req.params;

    const record = await VerificationCode.findByPin(pin);

    if (!record) {
      await logEvent(
        'VERIFICATION_LOOKUP', null, 'public', null, 'verification_code',
        { method: 'PIN', pin, result: 'not_found' },
        req.ip, req.get('User-Agent')
      );
      return res.json({
        success: true,
        data: {
          status: 'not_found',
          title: 'Verification Code Not Found',
          message: 'This code does not exist in our system. This means either the code was entered incorrectly, the advertisement was never verified on TrustHire, or the code is invalid.'
        }
      });
    }

    // Log the lookup
    await query(`
      INSERT INTO verification_lookups (verification_code_id, lookup_ip, user_agent)
      VALUES ($1, $2, $3)
    `, [record.id, req.ip, req.get('User-Agent')]);

    // Determine verification status
    const now = new Date();
    const expiresAt = new Date(record.expires_at);
    let status;
    let title;
    let message;

    if (!record.is_active) {
      // Check if it was revoked (job status would be set by admin)
      const jobResult = await query('SELECT status FROM job_advertisements WHERE id = $1', [record.job_ad_id]);
      const jobStatus = jobResult.rows[0]?.status;

      if (jobStatus === 'revoked') {
        status = 'revoked';
        title = 'Verification Revoked';
        message = 'This job advertisement\'s verification has been REVOKED by our platform administrators. We strongly recommend NOT proceeding with this job application.';
      } else {
        status = 'deactivated';
        title = 'Verification Deactivated';
        message = 'This verification code has been deactivated.';
      }
    } else if (expiresAt < now) {
      status = 'verified_expired';
      title = 'Verified but Expired';
      message = 'This job advertisement was verified on our platform but the verification period has ended. The position may have been filled or the recruiter did not renew the verification. We recommend contacting the company directly before applying.';
    } else {
      status = 'verified_valid';
      title = 'Verified and Valid';
      message = 'This job advertisement has been verified on TrustHire. Compare the details below with the advertisement you received.';
    }

    await logEvent(
      'VERIFICATION_LOOKUP', null, 'public', record.id, 'verification_code',
      { method: 'PIN', pin, result: status },
      req.ip, req.get('User-Agent')
    );

    // Build response — always include original verified details for comparison
    const responseData = {
      status,
      title,
      message,
      verifiedOn: record.created_at,
      expiresOn: record.expires_at,
      job: {
        id: record.job_ad_id,
        title: record.title,
        description: record.description,
        location: record.location,
        employmentType: record.employment_type,
        salaryRange: record.salary_range,
        applicationUrl: record.application_url,
        applicationEmail: record.application_email,
      },
      company: {
        name: record.company_name,
        website: record.company_website,
        cacVerified: record.is_cac_verified,
        domainVerified: record.is_domain_verified,
      },
      recruiter: {
        name: `${record.recruiter_first_name} ${record.recruiter_last_name}`,
      }
    };

    res.json({ success: true, data: responseData });
  } catch (error) {
    console.error('Verification lookup error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const verifyByQR = async (req, res) => {
  return verifyByPin(req, res);
};

export const submitReport = async (req, res) => {
  try {
    const { jobAdId, reporterEmail, reportReason, description } = req.body;

    if (!jobAdId || !reportReason) {
      return res.status(400).json({ success: false, error: 'Job advertisement ID or PIN and reason are required.' });
    }

    let resolvedJobAdId = jobAdId;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobAdId);
    if (!isUuid) {
      const codeRecord = await VerificationCode.findByPin(jobAdId);
      if (codeRecord) {
        resolvedJobAdId = codeRecord.job_ad_id;
      } else {
        return res.status(400).json({ success: false, error: 'Could not find a valid job advertisement for the provided PIN or ID.' });
      }
    }

    const report = await Report.create({
      jobAdId: resolvedJobAdId,
      reporterEmail: reporterEmail || null,
      reportReason: `${reportReason}${description ? ': ' + description : ''}`
    });

    await logEvent(
      'REPORT_SUBMITTED', null, 'public', report.id, 'report',
      { jobAdId, reason: reportReason },
      req.ip, req.get('User-Agent')
    );

    res.status(201).json({
      success: true,
      data: {
        id: report.id,
        message: 'Thank you for your report. Our team will review it promptly.'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
