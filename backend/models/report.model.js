import { query } from '../config/database.js';

// ===========================================================================
// Reports state machine.
//   Intake (reporter):   category + observed_content (what they SAW)
//   Investigation (Admin): status transitions + finding (why / who's at fault)
//
//   status:  open -> under_review -> escalated -> resolved | closed
//   finding: recruiter_misrepresentation | content_drift | credential_misuse
//            | impersonation | not_substantiated
// ===========================================================================

export const CATEGORIES = new Set([
  'detail_mismatch', 'fee_requested', 'job_not_real', 'impersonation',
  'expired_or_revoked', 'other',
]);

export const FINDINGS = new Set([
  'recruiter_misrepresentation', 'content_drift', 'credential_misuse',
  'impersonation', 'not_substantiated',
]);

export const STATUSES = new Set([
  'open', 'under_review', 'escalated', 'resolved', 'closed',
]);

/** Severity is derived server-side from the intake category. */
export const severityForCategory = (category) => {
  if (['fee_requested', 'job_not_real', 'impersonation'].includes(category)) return 'high';
  if (category === 'detail_mismatch') return 'medium';
  return 'low';
};

export const create = async (data) => {
  const {
    jobAdId, reporterEmail, reportReason, description = null, category = 'other',
    severity = 'medium', observedContent = null, verificationCodeId = null,
    reporterPhone = null, status = 'open', escalatedAt = null,
  } = data;
  const text = `
    INSERT INTO reports (
      job_ad_id, reporter_email, report_reason, description, category, severity,
      observed_content, verification_code_id, reporter_phone, status, escalated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *;
  `;
  const values = [
    jobAdId, reporterEmail || null, reportReason, description, category, severity,
    observedContent ? JSON.stringify(observedContent) : null, verificationCodeId,
    reporterPhone, status, escalatedAt,
  ];
  const res = await query(text, values);
  return res.rows[0];
};

const LIST_SELECT = `
  SELECT r.*,
         j.title as job_title, j.status as job_status,
         c.name as company_name,
         vc.pin, vc.status as code_status
  FROM reports r
  LEFT JOIN job_advertisements j ON r.job_ad_id = j.id
  LEFT JOIN companies c ON j.company_id = c.id
  LEFT JOIN verification_codes vc ON r.verification_code_id = vc.id
`;

export const findAll = async (filters = {}) => {
  const conditions = [];
  const values = [];
  let i = 1;
  for (const key of ['status', 'severity', 'category', 'finding']) {
    if (filters[key]) {
      conditions.push(`r.${key} = $${i++}`);
      values.push(filters[key]);
    }
  }
  const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  const res = await query(`${LIST_SELECT}${where} ORDER BY r.created_at DESC`, values);
  return res.rows;
};

export const findById = async (id) => {
  const res = await query(`${LIST_SELECT} WHERE r.id = $1`, [id]);
  return res.rows[0];
};

/**
 * Full investigation payload for the Admin side-by-side view:
 * [TrustHire verified snapshot] vs [advert/code state] vs [what the seeker saw].
 */
export const findDetailed = async (id) => {
  const report = await query('SELECT * FROM reports WHERE id = $1', [id]);
  if (report.rowCount === 0) return null;
  const job = await query(
    `SELECT j.*, c.name as company_name, c.website_url, c.is_cac_verified, c.is_domain_verified
     FROM job_advertisements j LEFT JOIN companies c ON j.company_id = c.id
     WHERE j.id = $1`,
    [report.rows[0].job_ad_id],
  );
  const code = report.rows[0].verification_code_id
    ? await query('SELECT * FROM verification_codes WHERE id = $1', [report.rows[0].verification_code_id])
    : { rowCount: 0, rows: [] };
  const recruiter = job.rowCount
    ? await query(
        'SELECT id, first_name, last_name, email, account_status, verification_status FROM recruiters WHERE id = $1',
        [job.rows[0].recruiter_id],
      )
    : { rowCount: 0, rows: [] };
  const jobRow = job.rowCount ? job.rows[0] : null;
  return {
    report: report.rows[0],
    job: jobRow,
    // Documented as a separate key (company fields are ALSO flattened onto
    // job for legacy readers — both shapes are served).
    company: jobRow
      ? {
          id: jobRow.company_id,
          name: jobRow.company_name,
          website_url: jobRow.website_url,
          is_cac_verified: jobRow.is_cac_verified,
          is_domain_verified: jobRow.is_domain_verified,
        }
      : null,
    code: code.rowCount ? code.rows[0] : null,
    recruiter: recruiter.rowCount ? recruiter.rows[0] : null,
  };
};

/** Patch allowed report columns (dynamic). Returns the updated row. */
export const update = async (id, fields) => {
  const allowed = new Set([
    'status', 'finding', 'severity', 'category', 'admin_notes', 'assigned_to',
    'resolved_by', 'resolution_action', 'report_reason', 'description',
    'verification_code_id', 'escalated_at',
  ]);
  const entries = Object.entries(fields).filter(([k]) => allowed.has(k));
  if (entries.length === 0) return null;
  const cols = [];
  const values = [];
  let i = 1;
  for (const [key, value] of entries) {
    cols.push(`${key} = $${i++}`);
    values.push(value);
  }
  values.push(id);
  const res = await query(
    `UPDATE reports SET ${cols.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${i} RETURNING *`,
    values,
  );
  return res.rows[0];
};
