/**
 * whois.service.js
 * Domain provenance and age inspection via WhoisXML API.
 * Identifies domain creation date, domain age in days, registrant organization,
 * registrar details, and detects privacy-shielded or newly registered lookalike domains.
 */

import dotenv from "dotenv";
import dns from "node:dns";
import crypto from "node:crypto";
import { extractDomain } from "../utils/domainHelper.js";
dotenv.config();

const dnsResolveTxt = dns.promises.resolveTxt;

const isSandboxMode = () => {
  if (process.env.USE_MOCK_API === "true") return true;
  const key = process.env.WHOISXML_API_KEY || process.env.WHOIS_API_KEY;
  return !key || key.startsWith("your-") || key.length < 10;
};

/**
 * Looks up domain registration records via WhoisXML API.
 * @param {string} urlOrDomain - Domain or full URL
 * @returns {Promise<Object>} Structured domain registration data
 */
export const lookupDomain = async (urlOrDomain) => {
  if (!urlOrDomain) {
    return {
      success: false,
      domainName: "",
      error: "Domain name or website URL is required.",
    };
  }

  const cleanDomain = extractDomain(urlOrDomain);
  if (!cleanDomain || !cleanDomain.includes(".")) {
    return {
      success: false,
      domainName: cleanDomain,
      error: "Invalid domain format.",
    };
  }

  // --- SANDBOX / MOCK MODE ---
  if (isSandboxMode()) {
    // Check if test domain simulates a new domain (e.g. contains 'new', 'fake', 'test-new')
    const isSimulatedNew =
      cleanDomain.includes("new") || cleanDomain.includes("temp");
    const domainAgeDays = isSimulatedNew ? 5 : 840;
    const creationDate = new Date(
      Date.now() - domainAgeDays * 24 * 60 * 60 * 1000,
    );
    const expirationDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    const minAge = parseInt(process.env.MIN_DOMAIN_AGE_DAYS || "30", 10);
    const isSuspicious = domainAgeDays < minAge;

    return {
      success: true,
      provider: "whoisxml_sandbox",
      domainName: cleanDomain,
      registrar: "NiRA (.NG Registry) / Internet Assigned Registrar",
      creationDate,
      expirationDate,
      domainAgeDays,
      registrantOrg: "Verified Enterprise Nigeria Limited",
      registrantCountry: "NG",
      nameServers: ["ns1.dns-parking.com", "ns2.dns-parking.com"],
      status: "clientTransferProhibited",
      isPrivacyProtected: false,
      sslValid: true,
      isSuspicious,
      flagReason: isSuspicious
        ? `Domain registered only ${domainAgeDays} days ago (minimum: ${minAge} days).`
        : null,
    };
  }

  // --- LIVE WHOISXML API CALL ---
  const apiKey = process.env.WHOISXML_API_KEY || process.env.WHOIS_API_KEY;
  const endpoint = `https://www.whoisxmlapi.com/whoisserver/WhoisService?apiKey=${apiKey}&domainName=${encodeURIComponent(cleanDomain)}&outputFormat=JSON`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(endpoint, { signal: controller.signal });
    clearTimeout(timeout);
    const data = await res.json();

    if (!res.ok || data.ErrorMessage) {
      console.error("WhoisXML API error:", data.ErrorMessage || res.status);
      return {
        success: false,
        domainName: cleanDomain,
        error: data.ErrorMessage?.msg || "Whois lookup failed",
      };
    }

    const record = data.WhoisRecord || {};
    const rawCreated =
      record.createdDate ||
      record.registryData?.createdDate ||
      record.estimatedDomainAge;
    const creationDate = rawCreated ? new Date(rawCreated) : null;

    let domainAgeDays = 0;
    if (creationDate && !isNaN(creationDate.getTime())) {
      domainAgeDays = Math.floor(
        (Date.now() - creationDate.getTime()) / (1000 * 60 * 60 * 24),
      );
    } else if (record.estimatedDomainAge) {
      domainAgeDays = parseInt(record.estimatedDomainAge, 10) || 0;
    }

    const rawExpires = record.expiresDate || record.registryData?.expiresDate;
    const expirationDate = rawExpires ? new Date(rawExpires) : null;

    const minAge = parseInt(process.env.MIN_DOMAIN_AGE_DAYS || "30", 10);
    const isSuspicious = domainAgeDays < minAge;

    const registrant = record.registrant || {};
    const registrantOrg =
      registrant.organization ||
      record.registryData?.registrant?.organization ||
      "Private Registrant";
    const isPrivacyProtected =
      registrantOrg.toLowerCase().includes("privacy") ||
      registrantOrg.toLowerCase().includes("whoisguard") ||
      registrantOrg.toLowerCase().includes("redacted");

    return {
      success: true,
      provider: "whoisxml",
      domainName: cleanDomain,
      registrar:
        record.registrarName ||
        record.registryData?.registrarName ||
        "Unknown Registrar",
      creationDate,
      expirationDate,
      domainAgeDays,
      registrantOrg,
      registrantCountry:
        registrant.country || record.registryData?.registrant?.country || "NG",
      nameServers: record.nameServers?.hostNames || [],
      status: record.status || "active",
      isPrivacyProtected,
      sslValid: true,
      isSuspicious,
      flagReason: isSuspicious
        ? `Domain registered only ${domainAgeDays} days ago (minimum: ${minAge} days).`
        : null,
    };
  } catch (error) {
    clearTimeout(timeout);
    console.error("WhoisXML service error:", error.message);
    return {
      success: false,
      domainName: cleanDomain,
      error: `Whois request failed: ${error.message}`,
    };
  }
};

/**
 * Legal-entity suffixes stripped before comparing company names, so
 * "ABC Technologies Limited" and "ABC Technologies" are recognised as the
 * same underlying name.
 */
const ENTITY_SUFFIXES =
  /\b(limited|ltd|llc|inc|incorporated|plc|corp|corporation|company|co|gmbh|technologies|tech|group|nigeria|ng)\b/gi;

const normalizeCompanyTokens = (name) => {
  if (!name) return [];
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(ENTITY_SUFFIXES, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
};

/**
 * SSRF guard (audit C4): `checkWebsiteContentMatch` fetches a
 * recruiter-supplied URL server-side. Without validation that is a classic
 * SSRF primitive — `http://127.0.0.1:5432/`, `http://169.254.169.254/…`
 * (cloud metadata), RFC1918 hosts, link-local, CGNAT and IPv6 equivalents.
 *
 * Rules enforced here:
 *   - only http/https
 *   - no embedded credentials (user:pass@host)
 *   - hostname must resolve (all A/AAAA records) to public unicast space
 *
 * Note: there is a residual TOCTOU window between this lookup and the
 * subsequent connect (DNS rebinding). Closing it fully requires pinning the
 * connection to the vetted IP (custom dispatcher), which is out of scope
 * here — the check still blocks the practical, non-adversarial-DNS cases
 * and every literal-IP/private-host attempt.
 */
const PRIVATE_V4_RANGES = [
  [0, 0, 0, 0, 8], // 0.0.0.0/8   "this network"
  [10, 0, 0, 0, 8], // 10.0.0.0/8   RFC1918
  [100, 64, 0, 0, 10], // 100.64.0.0/10 CGNAT (RFC6598)
  [127, 0, 0, 0, 8], // 127.0.0.0/8  loopback
  [169, 254, 0, 0, 16], // 169.254.0.0/16 link-local (+ cloud metadata)
  [172, 16, 0, 0, 12], // 172.16.0.0/12 RFC1918
  [192, 0, 0, 0, 24], // 192.0.0.0/24 IETF protocol assignments
  [192, 168, 0, 0, 16], // 192.168.0.0/16 RFC1918
  [198, 18, 0, 0, 15], // 198.18.0.0/15 benchmarking
  [224, 0, 0, 0, 4], // 224.0.0.0/4  multicast
  [240, 0, 0, 0, 4], // 240.0.0.0/4  reserved / broadcast
];

const ipv4ToInt = (ip) =>
  ip.split(".").reduce((acc, oct) => acc * 256 + Number(oct), 0);

const isPrivateIPv4 = (ip) => {
  const value = ipv4ToInt(ip);
  return PRIVATE_V4_RANGES.some(([a, b, c, d, bits]) => {
    const base = ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (value & mask) === (base & mask);
  });
};

const isPrivateIPv6 = (ip) => {
  const v = ip.toLowerCase().split("%")[0];
  if (v === "::" || v === "::1") return true;
  // IPv4-mapped (::ffff:127.0.0.1) — unwrap and test as IPv4.
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  const first = (v.split(":")[0] || "0").padStart(4, "0");
  const group = parseInt(first, 16);
  if ((group & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((group & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((group & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
};

const isPrivateAddress = (ip) =>
  ip.includes(":") ? isPrivateIPv6(ip) : isPrivateIPv4(ip);

/**
 * Validate a recruiter-supplied URL before fetching it server-side.
 * Throws an Error when the target is not safe to fetch.
 * Exported so the test suite can assert literal-IP rejections directly.
 */
export const assertPublicUrl = async (rawUrl) => {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http/https URLs are allowed.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("URLs with embedded credentials are not allowed.");
  }

  const dns = await import("node:dns");
  const { lookup } = dns.promises;
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  let addresses;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    // Literals that fail lookup (e.g. "[::1]" already stripped above are
    // checked directly below); unresolved hostnames are simply unsafe.
    addresses = [{ address: hostname }];
  }
  const targets = addresses.length ? addresses.map((a) => a.address) : [hostname];
  for (const addr of targets) {
    if (isPrivateAddress(addr)) {
      throw new Error("URL resolves to a private or internal network.");
    }
  }
  return parsed;
};

/**
 * Fetch with a manual redirect loop: each hop is re-validated by
 * assertPublicUrl, and at most MAX_REDIRECTS hops are followed. A public
 * first hop that 302s to 169.254.169.254 is the standard SSRF bypass —
 * this closes it.
 */
const safeFetch = async (url, { signal, headers } = {}) => {
  const MAX_REDIRECTS = 3;
  let current = await assertPublicUrl(url);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(current.toString(), {
      signal,
      headers,
      redirect: "manual",
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      const next = new URL(res.headers.get("location"), current);
      current = await assertPublicUrl(next.toString());
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects.");
};

/**
 * A website being reachable proves nothing about who owns it. This performs
 * a best-effort *content* check: does the site's own homepage actually
 * mention the company's name (or its corporate email domain), the way a
 * real company's own website would?
 *
 * This is intentionally lightweight (no HTML parser dependency) — it strips
 * tags with a regex and does normalized token matching. It is one signal
 * among several (WHOIS age, APIVoid reputation, email/CAC linkage) — not a
 * sole source of truth — and is designed to fail open (non-blocking,
 * recorded as a flag) rather than silently pass when the page can't be read.
 *
 * @param {string} websiteUrl
 * @param {string} companyName
 * @param {string[]} extraDomains - e.g. the recruiter's/corporate email domain, to also look for in mailto: links
 */
export const checkWebsiteContentMatch = async (
  websiteUrl,
  companyName,
  extraDomains = [],
) => {
  const cleanDomain = extractDomain(websiteUrl);
  if (!cleanDomain) {
    return {
      success: false,
      matched: false,
      error: "No website domain to inspect.",
    };
  }

  if (isSandboxMode()) {
    // Mock mode: simulate a genuine content match unless the domain or
    // company name looks deliberately unrelated (useful for local testing
    // of the "flag this" path), so the mock pipeline exercises both branches.
    const nameTokens = normalizeCompanyTokens(companyName);
    const looksUnrelated =
      cleanDomain.includes("unrelated") ||
      cleanDomain.includes("mismatch") ||
      nameTokens.length === 0;
    return {
      success: true,
      provider: "website_content_sandbox",
      domain: cleanDomain,
      matched: !looksUnrelated,
      matchedTokens: looksUnrelated ? [] : nameTokens.slice(0, 2),
      pageTitle: looksUnrelated
        ? "Untitled Page"
        : `${companyName} — Official Website`,
      reason: looksUnrelated
        ? "Simulated: homepage content does not appear to reference the claimed company name."
        : "Simulated: homepage content references the claimed company name.",
    };
  }

  const url = websiteUrl.match(/^https?:\/\//i)
    ? websiteUrl
    : `https://${cleanDomain}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    // SECURITY (audit C4): SSRF-guarded fetch — scheme/host vetting plus a
    // validated redirect loop (see assertPublicUrl / safeFetch above).
    const res = await safeFetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; TrustHireBot/1.0; +https://trusthire.example/bot)",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return {
        success: false,
        matched: false,
        domain: cleanDomain,
        error: `Website responded with HTTP ${res.status}.`,
      };
    }

    // Cap how much we read — this is a lightweight signal, not a crawler.
    const rawHtml = (await res.text()).slice(0, 300000);

    const titleMatch = rawHtml.match(/<title[^>]*>([^<]*)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].trim().slice(0, 200) : "";

    // Strip script/style blocks, then all remaining tags, to get plain text.
    const visibleText = rawHtml
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .toLowerCase();

    const nameTokens = normalizeCompanyTokens(companyName);
    const matchedTokens = nameTokens.filter(
      (t) => visibleText.includes(t) || pageTitle.toLowerCase().includes(t),
    );

    // A distinctive-enough overlap: at least one meaningful token from the
    // company name appears on its own claimed homepage.
    const nameMatched = nameTokens.length > 0 && matchedTokens.length > 0;

    // Bonus signal: the corporate/recruiter email domain shows up in a
    // mailto: link or contact text on the page.
    const domainMentioned = extraDomains
      .filter(Boolean)
      .some(
        (d) =>
          visibleText.includes(d.toLowerCase()) ||
          rawHtml.toLowerCase().includes(`mailto:${d.toLowerCase()}`),
      );

    return {
      success: true,
      provider: "website_content",
      domain: cleanDomain,
      pageTitle,
      matched: nameMatched,
      matchedTokens,
      domainMentioned,
      reason: nameMatched
        ? "Company name was found on the claimed website's own homepage."
        : "The claimed company name could not be found anywhere on the website's homepage — this website may not actually belong to this company.",
    };
  } catch (error) {
    clearTimeout(timeout);
    return {
      success: false,
      matched: false,
      domain: cleanDomain,
      error: `Could not read website content: ${error.message}`,
    };
  }
};

// =============================================================================
// DNS TXT RECORD OWNERSHIP VERIFICATION
//
// Everything else in this file (WHOIS age, APIVoid reputation, homepage
// content matching) is a *heuristic* signal — evidence that's consistent
// with genuine ownership but never actually proves it. A DNS TXT record is
// different: only someone who can edit the domain's DNS zone (i.e. actually
// controls the domain, at the registrar/DNS-host level) can make this check
// pass. It's the same mechanism Google Search Console, SendGrid and many
// other services use for "verify you own this domain."
// =============================================================================

const dnsSecret = () =>
  process.env.DNS_VERIFY_SECRET ||
  process.env.JWT_SECRET ||
  "trusthire-dns-fallback-secret";

/**
 * Deterministic per-company token — regenerated from the company id each
 * time via HMAC, so nothing new needs to be stored in the database just to
 * hand the recruiter their verification value.
 *
 * SECURITY (audit C13): the HMAC input includes the domain, so a token
 * issued for company A's old domain cannot validate after the company
 * switches website_url — ownership proof is bound to the domain it proved.
 * Rotating DNS_VERIFY_SECRET invalidates every outstanding token.
 */
export const getDnsVerificationToken = (companyId, domain = "") => {
  const hmac = crypto
    .createHmac("sha256", dnsSecret())
    .update(`${companyId}:${domain}`)
    .digest("hex");
  return `trusthire-verify=${hmac.slice(0, 32)}`;
};

/**
 * Returns the exact TXT record the recruiter needs to add at their DNS
 * host, for display in the UI.
 */
export const getDnsVerificationInstructions = (websiteUrl, companyId) => {
  const domain = extractDomain(websiteUrl);
  return {
    domain,
    recordType: "TXT",
    // A record at the domain apex (host "@") is simplest for most DNS
    // providers; a dedicated subdomain is offered as an alternative for
    // providers that don't allow multiple TXT records at the apex.
    recordHost: "@ (or the bare domain)",
    alternateRecordHost: `_trusthire-verify.${domain}`,
    recordValue: getDnsVerificationToken(companyId, domain),
    instructions: `Add a TXT record for ${domain} with the value shown above at your DNS provider (e.g. Cloudflare, Namecheap, GoDaddy). DNS changes can take a few minutes up to 24-48 hours to propagate.`,
  };
};

/**
 * Performs the actual DNS TXT lookup and checks for the expected token.
 * Checks both the domain apex and the dedicated _trusthire-verify
 * subdomain, since DNS providers vary in what they allow at the apex.
 */
export const verifyDnsOwnership = async (websiteUrl, companyId) => {
  const domain = extractDomain(websiteUrl);
  if (!domain) {
    return {
      success: false,
      verified: false,
      error: "No valid website domain to check.",
    };
  }

  const expectedToken = getDnsVerificationToken(companyId, domain);
  const candidates = [domain, `_trusthire-verify.${domain}`];
  const allRecords = [];
  let lookupError = null;

  for (const host of candidates) {
    try {
      const records = await dnsResolveTxt(host); // string[][]
      const flat = records.map((r) => r.join("")).filter(Boolean);
      allRecords.push(...flat);
    } catch (err) {
      // ENODATA/ENOTFOUND just means no TXT records at that host — normal,
      // not an error condition — but capture it in case BOTH candidates fail.
      lookupError = err.code || err.message;
    }
  }

  const verified = allRecords.some((r) => r.trim() === expectedToken);

  if (allRecords.length === 0) {
    return {
      success: false,
      verified: false,
      domain,
      error: `No TXT records found for ${domain} (or the record hasn't propagated yet). ${lookupError ? `(${lookupError})` : ""}`,
    };
  }

  return {
    success: true,
    verified,
    domain,
    recordsFound: allRecords.length,
    error: verified
      ? null
      : "A TXT record was found, but it did not match the expected TrustHire verification value.",
  };
};
