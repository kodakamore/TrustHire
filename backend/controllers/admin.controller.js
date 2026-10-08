import * as Job from '../models/job.model.js';
import * as VerificationCode from '../models/verificationCode.model.js';
import * as Report from '../models/report.model.js';
import * as Recruiter from '../models/recruiter.model.js';
import * as AuditLog from '../models/auditLog.model.js';
import { generateVerificationCode } from '../services/qrcode.service.js';
import { sendVerificationCompromisedEmail } from '../services/email.service.js';
import { logEvent } from '../services/audit.service.js';
import { query } from '../config/database.js';
import { getImageById } from '../services/storage.service.js';
import { redactSensitive } from '../middleware/logRedaction.js';
import { isSuperAdmin } from '../middleware/roles.js';

// Photos are decrypted into memory and streamed once — never cached, never
// logged, never embedded in list/detail payloads (see getReviewDetails).
export const getMedia = async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return res.status(400).json({ success: false, error: 'Invalid photo id' });
    }
    const { buffer, mimeType, row } = await getImageById(id);
    // Only recruiters' own photos are admin-visible; other owner types require
    // an explicit policy decision before exposure.
    if (row.owner_type !== 'recruiter') {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    res.set({
      'Content-Type': mimeType,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'X-Robots-Tag': 'noindex, nofollow',
      'Content-Disposition': 'inline',
    });
    return res.end(buffer);
  } catch (error) {
    if (/not found/i.test(error.message)) {
      return res.status(404).json({ success: false, error: 'Photo not found' });
    }
    return res.status(500).json({ success: false, error: 'Unable to load photo' });
  }
};


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
      delete job.recruiter.nin_enc;
      delete job.recruiter.bvn_enc;
      delete job.recruiter.email_otp;
      delete job.recruiter.phone_otp;
      delete job.recruiter.phone_otp_reference_id;
    }

    // Never ship raw provider responses verbatim: they can embed base64 ID
    // photos. Redact image payloads and 11-digit IDs; admins view photos via
    // GET /api/admin/photo/:id (decrypted in memory, no-store) instead.
    const sanitizeChecks = (rows) =>
      rows.map((r) => ({ ...r, raw_response: redactSensitive(r.raw_response) }));

    res.json({
      success: true,
      data: {
        ...job,
        recruiterChecks: sanitizeChecks(recruiterChecks.rows),
        companyChecks: sanitizeChecks(companyChecks.rows)
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

    // Burn the verification code(s) as REVOKED (recruiter-at-fault state)
    const activeCode = await VerificationCode.findByJobAdId(id);
    if (activeCode) {
      await VerificationCode.setStatus(activeCode.id, 'revoked', reason);
    }
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
    const { status, severity, category, finding } = req.query;
    const rows = await Report.findAll({ status, severity, category, finding });
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/** Side-by-side investigation payload: verified snapshot vs reported advert. */
export const getReport = async (req, res) => {
  try {
    const detail = await Report.findDetailed(req.params.id);
    if (!detail) return res.status(404).json({ success: false, error: 'Report not found' });
    res.json({ success: true, data: detail });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const escalateReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    const existing = await Report.findById(id);
    if (!existing) return res.status(404).json({ success: false, error: 'Report not found' });

    const note = reason
      ? `${existing.admin_notes ? existing.admin_notes + '\n' : ''}[Escalated] ${reason}`
      : existing.admin_notes;
    const report = await Report.update(id, {
      status: 'escalated',
      escalated_at: new Date(),
      assigned_to: existing.assigned_to || req.admin.id,
      admin_notes: note,
    });

    await logEvent('REPORT_ESCALATED', req.admin.id, 'admin', id, 'report',
      { reason: reason || null, severity: report.severity }, req.ip, req.get('User-Agent'));

    res.json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * THE VICTIM-PROTECTING FLOW (finding: credential_misuse / impersonation):
 * burn the cloned code as `compromised`, issue a fresh QR/PIN for the SAME
 * approved advert (original validity window kept), and notify the recruiter.
 * The job and the recruiter are untouched.
 */
const compromiseAndReissue = async (jobAdId, reason, adminId, req) => {
  const activeCode = await VerificationCode.findByJobAdId(jobAdId);
  if (!activeCode) {
    const err = new Error('No active verification code for this advert.');
    err.statusCode = 404;
    throw err;
  }

  await VerificationCode.setStatus(activeCode.id, 'compromised', reason);

  // Keep the original validity window — a clone must not extend it.
  const expiresAt = new Date(activeCode.expires_at);
  const qrData = await generateVerificationCode(jobAdId, expiresAt);
  const newCode = await VerificationCode.reissueForJob({
    jobAdId,
    pin: qrData.pin,
    qrCodeUrl: qrData.qrCodeUrl,
    qrCodePath: qrData.qrCodeImagePath,
    expiresAt,
    previousId: activeCode.id,
  });

  // Notify the innocent recruiter (best effort — never fail the action).
  const rec = await query(
    `SELECT r.email, r.first_name, j.title
     FROM recruiters r JOIN job_advertisements j ON j.recruiter_id = r.id
     WHERE j.id = $1`,
    [jobAdId],
  );
  if (rec.rowCount) {
    try {
      await sendVerificationCompromisedEmail({
        to: rec.rows[0].email,
        recruiterName: rec.rows[0].first_name,
        jobTitle: rec.rows[0].title,
        newPin: qrData.pin,
        qrCodeUrl: qrData.qrCodeUrl,
      });
    } catch (err) {
      console.error('Compromise notice delivery failed:', err.message);
    }
  }

  await logEvent('VERIFICATION_CODE_COMPROMISED', adminId, 'admin', activeCode.id, 'verification_code',
    { jobAdId, oldPin: activeCode.pin, newPin: qrData.pin, reason },
    req?.ip, req?.get?.('User-Agent'));

  return {
    oldPin: activeCode.pin,
    newPin: qrData.pin,
    qrCodeUrl: qrData.qrCodeUrl,
    expiresAt,
    newCodeId: newCode.id,
  };
};

/** POST /reports/:id/compromise — standalone compromise + reissue action. */
export const compromiseCode = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    const existing = await Report.findById(id);
    if (!existing) return res.status(404).json({ success: false, error: 'Report not found' });

    const reissue = await compromiseAndReissue(
      existing.job_ad_id,
      reason || 'QR/PIN misuse confirmed during report review',
      req.admin.id,
      req,
    );

    // Link the burned credential to the report for the audit trail.
    const burned = await VerificationCode.findByPin(reissue.oldPin);
    if (burned && !existing.verification_code_id) {
      await Report.update(id, { verification_code_id: burned.id });
    }

    res.json({
      success: true,
      data: {
        reissue,
        message: 'Verification code marked as compromised and reissued. The recruiter stays verified and has been notified.',
      },
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
};

const ALLOWED_RESOLUTIONS = new Set([
  'no_action', 'warning_issued', 'correction_requested',
  'revoke_verification', 'compromise_reissue', 'account_sanction',
]);

export const updateReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, finding, severity, adminNotes, resolutionAction, assignedTo } = req.body || {};
    const adminId = req.admin.id;

    const existing = await Report.findById(id);
    if (!existing) return res.status(404).json({ success: false, error: 'Report not found' });

    if (status && !Report.STATUSES.has(status)) {
      return res.status(400).json({ success: false, error: `Invalid status '${status}'` });
    }
    if (finding && !Report.FINDINGS.has(finding)) {
      return res.status(400).json({ success: false, error: `Invalid finding '${finding}'` });
    }
    if (severity && !['low', 'medium', 'high'].includes(severity)) {
      return res.status(400).json({ success: false, error: `Invalid severity '${severity}'` });
    }

    // ---- chain of responsibility ----------------------------------------
    // ACCOUNT-level sanctions are Super Admin only. Everything else
    // (analysis, findings, warnings, revocation, compromise-reissue) is Admin.
    if (resolutionAction && !ALLOWED_RESOLUTIONS.has(resolutionAction)) {
      return res.status(400).json({ success: false, error: `Invalid resolution action '${resolutionAction}'` });
    }
    if (resolutionAction === 'account_sanction' && !isSuperAdmin(req.admin.role)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: account sanctions require super administrator privileges.',
      });
    }

    const patch = {};
    if (status) patch.status = status;
    if (finding) patch.finding = finding;
    if (severity) patch.severity = severity;
    if (adminNotes !== undefined) patch.admin_notes = adminNotes;
    if (assignedTo !== undefined) patch.assigned_to = assignedTo;
    if (status === 'under_review' && !existing.assigned_to) patch.assigned_to = adminId;

    let sideEffect = null;

    if (resolutionAction) {
      const finalFinding = finding || existing.finding;
      if (!finalFinding) {
        return res.status(400).json({ success: false, error: 'A finding is required before resolving this report.' });
      }
      patch.finding = finalFinding;
      patch.resolution_action = resolutionAction;
      patch.resolved_by = adminId;
      patch.status = status || 'resolved';

      if (resolutionAction === 'revoke_verification') {
        // Admin-level: withdraw the verification for this advert (recruiter
        // misrepresentation — the verification itself is what failed).
        const job = await Job.findById(existing.job_ad_id);
        if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
        const activeCode = await VerificationCode.findByJobAdId(job.id);
        if (activeCode) {
          await VerificationCode.setStatus(activeCode.id, 'revoked', adminNotes || 'Report finding: recruiter misrepresentation');
        }
        const flags = job.flags || [];
        flags.push({
          type: 'report_resolution',
          finding: finalFinding,
          reason: adminNotes || null,
          resolvedBy: adminId,
          resolvedAt: new Date().toISOString(),
        });
        await Job.update(job.id, { status: 'revoked', flags });
        sideEffect = { revokedVerification: true };
      } else if (resolutionAction === 'compromise_reissue') {
        const reissue = await compromiseAndReissue(
          existing.job_ad_id,
          adminNotes || 'QR/PIN misuse confirmed during report review',
          adminId,
          req,
        );
        const burned = await VerificationCode.findByPin(reissue.oldPin);
        if (burned && !existing.verification_code_id) {
          patch.verification_code_id = burned.id;
        }
        sideEffect = { reissue };
      } else if (resolutionAction === 'account_sanction') {
        const job = await Job.findById(existing.job_ad_id);
        if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
        const recruiter = await Recruiter.setAccountStatus(job.recruiter_id, {
          status: 'suspended',
          reason: `Report ${id} (${finalFinding}): ${adminNotes || 'no reason given'}`,
          changedBy: adminId,
        });
        sideEffect = { recruiter };
      }
      // no_action | warning_issued | correction_requested → report-only.
    }

    const report = await Report.update(id, patch);

    await logEvent('REPORT_UPDATED', adminId, 'admin', id, 'report',
      {
        status: report?.status, finding: report?.finding,
        severity: report?.severity, resolutionAction: resolutionAction || null,
      },
      req.ip, req.get('User-Agent'));

    res.json({ success: true, data: report, sideEffect });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
};

/**
 * POST /recruiters/:id/status — Super Admin account sanction.
 * suspend | remove (or reactivate), optionally revoking live ads too.
 */
export const setRecruiterAccountStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason, revokeAds } = req.body || {};
    if (!['active', 'suspended', 'removed'].includes(status)) {
      return res.status(400).json({ success: false, error: `Invalid status '${status}'` });
    }
    if (status !== 'active' && !reason) {
      return res.status(400).json({ success: false, error: 'A reason is required for suspending or removing an account.' });
    }

    const recruiter = await Recruiter.setAccountStatus(id, {
      status,
      reason: reason || null,
      changedBy: req.admin.id,
    });
    if (!recruiter) return res.status(404).json({ success: false, error: 'Recruiter not found' });

    let revokedAds = 0;
    if (revokeAds && status !== 'active') {
      const jobs = await query(
        `SELECT id FROM job_advertisements WHERE recruiter_id = $1 AND status IN ('approved', 'active')`,
        [id],
      );
      for (const j of jobs.rows) {
        const code = await VerificationCode.findByJobAdId(j.id);
        if (code) await VerificationCode.setStatus(code.id, 'revoked', reason);
        await Job.updateStatus(j.id, 'revoked');
        revokedAds += 1;
      }
    }

    await logEvent('RECRUITER_ACCOUNT_STATUS', req.admin.id, 'admin', id, 'recruiter',
      { status, reason: reason || null, revokedAds },
      req.ip, req.get('User-Agent'));

    res.json({ success: true, data: { recruiter, revokedAds } });
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
