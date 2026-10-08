// JWT helpers for the admin dashboard.
// The admin token is stored in localStorage.admin_token after login and is a
// standard JWT — the payload is the base64 segment between the two dots.

export const getAdminToken = () => localStorage.getItem('admin_token');

/** Decode the JWT payload (no signature verification — that is the server's job). */
export const getAdminPayload = () => {
  try {
    const token = getAdminToken();
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
};

/** role claim from the admin JWT, e.g. 'admin' | 'super_admin'. */
export const getAdminRole = () => {
  const payload = getAdminPayload();
  return payload?.role || null;
};

export const getAdminEmail = () => {
  const payload = getAdminPayload();
  return payload?.email || '';
};

export const getAdminId = () => {
  const payload = getAdminPayload();
  return payload?.id || null;
};

/** Both 'super_admin' and 'superadmin' count as super administrator. */
export const isSuperAdmin = () => {
  const role = String(getAdminRole() || '').toLowerCase();
  return role === 'super_admin' || role === 'superadmin';
};
