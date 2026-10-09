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
 * Public suffixes (a maintained subset of the Public Suffix List — the
 * registry-level suffixes that appear most often in Nigerian/UK/global
 * corporate domains, plus the shared-hosting suffixes attackers register
 * free subdomains on).
 *
 * SECURITY (audit C8): a domain equal to a bare public suffix can never be a
 * registrable "company domain" — nobody owns `com.ng` or `github.io`, so a
 * match against one is meaningless (suffix bypass in checkEmailDomainMatch).
 * Not a complete PSL: covering the common cases blocks the practical
 * bypasses without vendoring the full list.
 */
export const PUBLIC_SUFFIXES = new Set([
  // Nigeria (.ng second-level)
  'com.ng', 'org.ng', 'net.ng', 'edu.ng', 'gov.ng', 'mil.ng', 'name.ng', 'i.ng',
  // United Kingdom
  'co.uk', 'org.uk', 'me.uk', 'net.uk', 'plc.uk', 'ltd.uk', 'sch.uk',
  'ac.uk', 'gov.uk', 'nhs.uk', 'police.uk',
  // United States / generic
  'com', 'net', 'org', 'edu', 'gov', 'mil', 'info', 'biz', 'name', 'pro',
  'co', 'us', 'ca', 'au', 'de', 'fr', 'jp', 'in', 'za', 'br', 'mx', 'ng',
  // Other common ccTLD second levels
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.za', 'org.za', 'net.za', 'web.za',
  'co.in', 'net.in', 'org.in', 'firm.in', 'gen.in', 'ind.in',
  'co.jp', 'or.jp', 'ne.jp', 'ac.jp', 'go.jp', 'lg.jp',
  'com.br', 'net.br', 'org.br', 'gov.br',
  'com.mx', 'org.mx', 'net.mx', 'gob.mx',
  'com.tr', 'org.tr', 'net.tr', 'gov.tr',
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn',
  'co.kr', 'or.kr', 'ne.kr', 'go.kr',
  'com.hk', 'org.hk', 'net.hk', 'gov.hk',
  'com.sg', 'net.sg', 'org.sg', 'gov.sg',
  'co.nz', 'net.nz', 'org.nz', 'govt.nz',
  'com.ar', 'org.ar', 'net.ar', 'gob.ar',
  // Shared-hosting / free-subdomain suffixes
  'github.io', 'gitlab.io', 'herokuapp.com', 'netlify.app', 'vercel.app',
  'pages.dev', 'web.app', 'firebaseapp.com', 'blogspot.com', 'wordpress.com',
  'substack.com', 'medium.com', 'shopify.com', 'squarespace.com', 'wixsite.com'
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

  // SECURITY (audit C8): a match must be between registrable domains. A bare
  // public suffix (`com.ng`, `co.uk`, `github.io` …) is not owned by anyone —
  // `hr@com.ng` proves nothing about `shop.com.ng`. Without this guard the
  // `endsWith('.' + emailDomain)` branch below treats a registry-level
  // suffix as a corporate match (suffix bypass).
  if (
    PUBLIC_SUFFIXES.has(emailDomain) ||
    PUBLIC_SUFFIXES.has(websiteDomain) ||
    !emailDomain.includes('.') ||
    !websiteDomain.includes('.')
  ) {
    return {
      isMatch: false,
      emailDomain,
      websiteDomain,
      isPublicEmail: false,
      linkType: 'domain_mismatch'
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
