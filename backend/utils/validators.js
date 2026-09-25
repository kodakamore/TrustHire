export const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(email)) return { valid: false, error: 'Invalid email format' };
  return { valid: true };
};

export const validatePhone = (phone) => {
  // Supports international (+234... with 7 to 15 digits) and national (080..., 090..., 070...) formats
  const clean = phone.replace(/[\s-]/g, '');
  const re = /^(\+?[1-9]\d{6,14}|0[789][01]\d{8})$/;
  if (!re.test(clean)) return { valid: false, error: 'Invalid phone format (e.g. +2348012345678 or 08012345678)' };
  return { valid: true };
};

export const validateRCNumber = (rc) => {
  if (!rc || rc.length < 5) return { valid: false, error: 'Invalid RC number' };
  return { valid: true };
};

export const validateNIN = (nin) => {
  if (!nin || nin.length !== 11 || !/^\d+$/.test(nin)) return { valid: false, error: 'Invalid NIN (11 digits required)' };
  return { valid: true };
};

export const validateBVN = (bvn) => {
  if (!bvn || bvn.length !== 11 || !/^\d+$/.test(bvn)) return { valid: false, error: 'Invalid BVN (11 digits required)' };
  return { valid: true };
};

export const validateURL = (urlStr) => {
  try {
    new URL(urlStr);
    return { valid: true };
  } catch (err) {
    return { valid: false, error: 'Invalid URL' };
  }
};
