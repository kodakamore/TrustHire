import * as Job from '../models/job.model.js';
import * as VerificationCode from '../models/verificationCode.model.js';
import * as Report from '../models/report.model.js';
import * as AuditLog from '../models/auditLog.model.js';
import { generateVerificationCode } from '../services/qrcode.service.js';
import { logEvent } from '../services/audit.service.js';
import { query } from '../config/database.js';

export const getRecruiters = async (req, res) => {
  try {
    const text = `
      SELECT 
        r.id, r.email, r.first_name, r.last_name, r.phone_number,
        r.verification_status, r.is_email_verified, r.is_phone_verified,
        r.is_identity_verified, r.is_face_verified, r.created_at,
        COUNT(DISTINCT j.id) AS total_jobs,
        COUNT(DISTINCT c.id) AS total_companies
      FROM recruiters r
      LEFT JOIN job_advertisements j ON j.recruiter_id = r.id
      LEFT JOIN companies c ON c.recruiter_id = r.id
      GROUP BY r.id
      ORDER BY r.created_at DESC
    `;
    const result = await query(text);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getRecruiter = async (req, res) => {
  try {
    const { id } = req.params;
    const text = `
      SELECT 
        r.id, r.email, r.first_name, r.last_name, r.phone_number,
        r.verification_status, r.is_email_verified, r.is_phone_verified,
        r.is_identity_verified, r.is_face_verified, r.created_at,
        json_agg(DISTINCT jsonb_build_object('id', c.id, 'name', c.name, 'status', c.verification_status)) FILTER (WHERE c.id IS NOT NULL) AS companies,
        json_agg(DISTINCT jsonb_build_object('id', j.id, 'title', j.title, 'status', j.status)) FILTER (WHERE j.id IS NOT NULL) AS jobs
      FROM recruiters r
      LEFT JOIN companies c ON c.recruiter_id = r.id
      LEFT JOIN job_advertisements j ON j.recruiter_id = r.id
      WHERE r.id = $1
      GROUP BY r.id
    `;
    const result = await query(text, [id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Recruiter not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getReviewQueue = async (req, res) => {
  try {
    const text = `
      SELECT j.*, c.name as company_name, r.email as recruiter_email,
             r.first_name as recruiter_first_name, r.last_name as recruiter_last_name
      FROM job_advertisements j
      JOIN companies c ON j.company_id = c.id
      JOIN recruiters r ON j.recruiter_id = r.id
      WHERE j.status = 'pending'
      ORDER BY j.created_at ASC
    `;
    const result = await query(text);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getReviewDetails = async (req, res) => {
  try {
    const { id } = req.params;

    // Get job with company and recruiter details
    const jobText = `
      SELECT j.*,
             row_to_json(c.*) as company,
             row_to_json(r.*) as recruiter
      FROM job_advertisements j
      JOIN companies c ON j.company_id = c.id
      JOIN recruiters r ON j.recruiter_id = r.id
      WHERE j.id = $1
    `;
    const jobResult = await query(jobText, [id]);
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const job = jobResult.rows[0];

    // Get verification checks for the recruiter
    const recruiterChecks = await query(
      'SELECT check_type, is_successful, created_at FROM verification_checks WHERE target_id = $1 AND target_type = $2 ORDER BY created_at DESC',
      [job.recruiter.id, 'recruiter']
    );

    // Get verification checks for the company
    const companyChecks = await query(
      'SELECT check_type, is_successful, raw_response, created_at FROM verification_checks WHERE target_id = $1 AND target_type = $2 ORDER BY created_at DESC',
      [job.company.id, 'company']
    );

    // Remove sensitive data from recruiter before sending
    if (job.recruiter) {
      delete job.recruiter.password_hash;
      delete job.recruiter.nin;
      delete job.recruiter.bvn;
    }

    res.json({
      success: true,
      data: {
        ...job,
        recruiterChecks: recruiterChecks.rows,
        companyChecks: companyChecks.rows
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const approveJob = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.admin.id;

    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
    if (job.status !== 'pending') {
      return res.status(400).json({ success: false, error: `Cannot approve a job with status '${job.status}'` });
    }

    // Update job status
    await Job.updateStatus(id, 'approved');

    // Generate QR code and PIN
    const validityDays = parseInt(process.env.VERIFICATION_VALIDITY_DAYS || '90');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + validityDays);

    const qrData = await generateVerificationCode(id, expiresAt);

    await VerificationCode.create({
      jobAdId: id,
      pin: qrData.pin,
      qrCodeUrl: qrData.qrCodeUrl,
      qrCodePath: qrData.qrCodeImagePath,
      expiresAt
    });

    // Audit log
    await logEvent(
      'JOB_APPROVED', adminId, 'admin', id, 'job_advertisement',
      { pin: qrData.pin, expiresAt: expiresAt.toISOString() },
      req.ip, req.get('User-Agent')
    );

    res.json({
      success: true,
      data: {
        message: 'Job approved and verification code generated.',
        pin: qrData.pin,
        qrCodeUrl: qrData.qrCodeUrl,
        expiresAt
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const rejectJob = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.admin.id;

    if (!reason) {
      return res.status(400).json({ success: false, error: 'Rejection reason is required.' });
    }

    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

    const currentFlags = job.flags || [];
    currentFlags.push({ type: 'admin_rejection', reason, rejectedBy: adminId, rejectedAt: new Date().toISOString() });

    await Job.update(id, { status: 'rejected', flags: currentFlags });

    await logEvent(
      'JOB_REJECTED', adminId, 'admin', id, 'job_advertisement',
      { reason },
      req.ip, req.get('User-Agent')
    );

    res.json({ success: true, message: 'Job rejected.', data: { reason } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const revokeVerification = async (req, res) => {
  try {
    const { id } = req.params;  // job_ad_id
    const { reason } = req.body;
    const adminId = req.admin.id;

    if (!reason) {
      return res.status(400).json({ success: false, error: 'Revocation reason is required.' });
    }

    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

    // Deactivate all verification codes for this job
    await VerificationCode.deactivateByJobAdId(id);

    // Update job status to revoked
    const currentFlags = job.flags || [];
    currentFlags.push({
      type: 'admin_revocation',
      reason,
      revokedBy: adminId,
      revokedAt: new Date().toISOString()
    });
    await Job.update(id, { status: 'revoked', flags: currentFlags });

    // Audit log
    await logEvent(
      'VERIFICATION_REVOKED', adminId, 'admin', id, 'job_advertisement',
      { reason },
      req.ip, req.get('User-Agent')
    );

    res.json({ success: true, message: 'Verification revoked. QR codes and PINs for this job are now deactivated.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getReports = async (req, res) => {
  try {
    const text = `
      SELECT r.*, j.title as job_title, c.name as company_name
      FROM reports r
      LEFT JOIN job_advertisements j ON r.job_ad_id = j.id
      LEFT JOIN companies c ON j.company_id = c.id
      ORDER BY r.created_at DESC
    `;
    const result = await query(text);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;
    const adminId = req.admin.id;

    const report = await Report.updateStatus(id, status, adminNotes);

    await logEvent(
      'REPORT_UPDATED', adminId, 'admin', id, 'report',
      { status, adminNotes },
      req.ip, req.get('User-Agent')
    );

    res.json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getAuditLogs = async (req, res) => {
  try {
    const { limit = 50, offset = 0, eventType, actorType } = req.query;
    let text = 'SELECT * FROM audit_logs';
    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (eventType) {
      conditions.push(`event_type = $${paramIndex++}`);
      values.push(eventType);
    }
    if (actorType) {
      conditions.push(`actor_type = $${paramIndex++}`);
      values.push(actorType);
    }

    if (conditions.length > 0) {
      text += ' WHERE ' + conditions.join(' AND ');
    }

    text += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    values.push(parseInt(limit), parseInt(offset));

    const result = await query(text, values);

    // Get total count for pagination
    let countText = 'SELECT COUNT(*) FROM audit_logs';
    if (conditions.length > 0) {
      countText += ' WHERE ' + conditions.join(' AND ');
    }
    const countResult = await query(countText, values.slice(0, conditions.length));

    res.json({
      success: true,
      data: {
        logs: result.rows,
        total: parseInt(countResult.rows[0].count),
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getStats = async (req, res) => {
  try {
    const [recruitersCount, jobsCount, activeVerifications, pendingReviews, activeReports] = await Promise.all([
      query('SELECT COUNT(*) FROM recruiters'),
      query('SELECT COUNT(*) FROM job_advertisements'),
      query('SELECT COUNT(*) FROM verification_codes WHERE is_active = TRUE'),
      query("SELECT COUNT(*) FROM job_advertisements WHERE status = 'pending'"),
      query("SELECT COUNT(*) FROM reports WHERE status = 'open'")
    ]);

    res.json({
      success: true,
      data: {
        totalRecruiters: parseInt(recruitersCount.rows[0].count),
        totalJobs: parseInt(jobsCount.rows[0].count),
        activeVerifications: parseInt(activeVerifications.rows[0].count),
        pendingReviews: parseInt(pendingReviews.rows[0].count),
        activeReports: parseInt(activeReports.rows[0].count)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
