/**
 * domainHelper.js
 * Utility helpers for domain parsing, public webmail detection,
 * and recruiter-to-company domain linkage verification.
 */

// Comprehensive list of popular free/public email providers
const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'yahoo.fr',
  'ymail.com',
  'rocketmail.com',
  'hotmail.com',
  'hotmail.co.uk',
  'outlook.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'zoho.com',
  'proton.me',
  'protonmail.com',
  'mail.com',
  'gmx.com',
  'gmx.net',
  'yandex.com',
  'yandex.ru',
  'tutanota.com',
  'fastmail.com'
]);

/**
 * Extracts and cleans the apex/root domain from a URL or raw domain string.
 * Example: 'https://www.careers.flutterwave.com/jobs' -> 'flutterwave.com'
 */
export const extractDomain = (urlOrDomain) => {
  if (!urlOrDomain || typeof urlOrDomain !== 'string') return '';

  let raw = urlOrDomain.trim().toLowerCase();
  // Remove protocol
  raw = raw.replace(/^https?:\/\//i, '');
  // Remove port and path
  raw = raw.split('/')[0].split('?')[0].split('#')[0].split(':')[0];
  // Remove leading www or common subdomains
  raw = raw.replace(/^www\./i, '');

  return raw;
};

/**
 * Checks whether an email address uses a public/free webmail provider.
 */
export const isPublicEmailDomain = (email) => {
  if (!email || !email.includes('@')) return false;
  const domain = email.split('@')[1].toLowerCase().trim();
  return PUBLIC_EMAIL_DOMAINS.has(domain);
};

/**
 * Compares a recruiter's email against a company website URL to verify affiliation.
 * Returns:
 * {
 *   isMatch: boolean,
 *   emailDomain: string,
 *   websiteDomain: string,
 *   isPublicEmail: boolean,
 *   linkType: 'corporate_match' | 'public_webmail' | 'domain_mismatch'
 * }
 */
export const checkEmailDomainMatch = (recruiterEmail, websiteUrl) => {
  if (!recruiterEmail || !websiteUrl) {
    return {
      isMatch: false,
      emailDomain: '',
      websiteDomain: '',
      isPublicEmail: false,
      linkType: 'domain_mismatch'
    };
  }

  const emailDomain = (recruiterEmail.split('@')[1] || '').toLowerCase().trim();
  const websiteDomain = extractDomain(websiteUrl);
  const isPublic = PUBLIC_EMAIL_DOMAINS.has(emailDomain);

  // If email is from public webmail, it can never be an auto-verified corporate domain match
  if (isPublic) {
    return {
      isMatch: false,
      emailDomain,
      websiteDomain,
      isPublicEmail: true,
      linkType: 'public_webmail'
    };
  }

  // Exact match or subdomain match (e.g. hr.company.com matches company.com)
  const isMatch =
    emailDomain === websiteDomain ||
    emailDomain.endsWith(`.${websiteDomain}`) ||
    websiteDomain.endsWith(`.${emailDomain}`);

  return {
    isMatch,
    emailDomain,
    websiteDomain,
    isPublicEmail: false,
    linkType: isMatch ? 'corporate_match' : 'domain_mismatch'
  };
};

/**
 * Checks whether a recruiter's legal name matches any of the registered CAC directors/shareholders.
 */
export const checkDirectorMatch = (recruiterFirstName, recruiterLastName, directors = []) => {
  if (!recruiterFirstName || !recruiterLastName || !Array.isArray(directors) || directors.length === 0) {
    return { isMatch: false, matchedDirector: null };
  }

  const recFirst = recruiterFirstName.toLowerCase().trim();
  const recLast = recruiterLastName.toLowerCase().trim();

  for (const director of directors) {
    const dirName = (typeof director === 'string' ? director : (director.name || `${director.first_name || ''} ${director.surname || ''}`)).toLowerCase();
    if (dirName.includes(recFirst) && dirName.includes(recLast)) {
      return { isMatch: true, matchedDirector: director };
    }
  }

  return { isMatch: false, matchedDirector: null };
};
