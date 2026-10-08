// ===========================================================================
// Role-based access for admin routes.
// adminAuth.js authenticates ANY admin (admin | super_admin); this middleware
// is the enforcement point for the chain of responsibility:
//   Admin      -> review reports, findings, warnings, revoke verifications,
//                 compromise-reissue (protects innocent recruiters)
//   Super Admin-> account-level sanctions only (suspend / remove recruiters,
//                 bulk ad deactivation, resolving with account_sanction)
// ===========================================================================

const normalize = (role) => String(role || '').toLowerCase().replace(/-/g, '_');

export const isSuperAdmin = (role) =>
  ['super_admin', 'superadmin'].includes(normalize(role));

/** requireRole('super_admin') — 403 for everyone else. */
export const requireRole = (...allowed) => (req, res, next) => {
  if (!req.admin) {
    return res.status(401).json({ success: false, error: 'Unauthorized: No admin context' });
  }
  const role = normalize(req.admin.role);
  if (!allowed.map(normalize).includes(role)) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: this action requires super administrator privileges.',
    });
  }
  next();
};

export const requireSuperAdmin = requireRole('super_admin', 'superadmin');
