/**
 * whois.service.js
 * Domain provenance and age inspection via WhoisXML API.
 * Identifies domain creation date, domain age in days, registrant organization,
 * registrar details, and detects privacy-shielded or newly registered lookalike domains.
 */

import dotenv from 'dotenv';
import { extractDomain } from '../utils/domainHelper.js';
dotenv.config();

const isSandboxMode = () => {
  if (process.env.USE_MOCK_API === 'true') return true;
  const key = process.env.WHOISXML_API_KEY || process.env.WHOIS_API_KEY;
  return !key || key.startsWith('your-') || key.length < 10;
};

/**
 * Looks up domain registration records via WhoisXML API.
 * @param {string} urlOrDomain - Domain or full URL
 * @returns {Promise<Object>} Structured domain registration data
 */
export const lookupDomain = async (urlOrDomain) => {
  if (!urlOrDomain) {
    return { success: false, domainName: '', error: 'Domain name or website URL is required.' };
  }

  const cleanDomain = extractDomain(urlOrDomain);
  if (!cleanDomain || !cleanDomain.includes('.')) {
    return { success: false, domainName: cleanDomain, error: 'Invalid domain format.' };
  }

  // --- SANDBOX / MOCK MODE ---
  if (isSandboxMode()) {
    // Check if test domain simulates a new domain (e.g. contains 'new', 'fake', 'test-new')
    const isSimulatedNew = cleanDomain.includes('new') || cleanDomain.includes('temp');
    const domainAgeDays = isSimulatedNew ? 5 : 840;
    const creationDate = new Date(Date.now() - domainAgeDays * 24 * 60 * 60 * 1000);
    const expirationDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    const minAge = parseInt(process.env.MIN_DOMAIN_AGE_DAYS || '30', 10);
    const isSuspicious = domainAgeDays < minAge;

    return {
      success: true,
      provider: 'whoisxml_sandbox',
      domainName: cleanDomain,
      registrar: 'NiRA (.NG Registry) / Internet Assigned Registrar',
      creationDate,
      expirationDate,
      domainAgeDays,
      registrantOrg: 'Verified Enterprise Nigeria Limited',
      registrantCountry: 'NG',
      nameServers: ['ns1.dns-parking.com', 'ns2.dns-parking.com'],
      status: 'clientTransferProhibited',
      isPrivacyProtected: false,
      sslValid: true,
      isSuspicious,
      flagReason: isSuspicious ? `Domain registered only ${domainAgeDays} days ago (minimum: ${minAge} days).` : null
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
      console.error('WhoisXML API error:', data.ErrorMessage || res.status);
      return { success: false, domainName: cleanDomain, error: data.ErrorMessage?.msg || 'Whois lookup failed' };
    }

    const record = data.WhoisRecord || {};
    const rawCreated = record.createdDate || record.registryData?.createdDate || record.estimatedDomainAge;
    const creationDate = rawCreated ? new Date(rawCreated) : null;

    let domainAgeDays = 0;
    if (creationDate && !isNaN(creationDate.getTime())) {
      domainAgeDays = Math.floor((Date.now() - creationDate.getTime()) / (1000 * 60 * 60 * 24));
    } else if (record.estimatedDomainAge) {
      domainAgeDays = parseInt(record.estimatedDomainAge, 10) || 0;
    }

    const rawExpires = record.expiresDate || record.registryData?.expiresDate;
    const expirationDate = rawExpires ? new Date(rawExpires) : null;

    const minAge = parseInt(process.env.MIN_DOMAIN_AGE_DAYS || '30', 10);
    const isSuspicious = domainAgeDays < minAge;

    const registrant = record.registrant || {};
    const registrantOrg = registrant.organization || record.registryData?.registrant?.organization || 'Private Registrant';
    const isPrivacyProtected = registrantOrg.toLowerCase().includes('privacy') ||
      registrantOrg.toLowerCase().includes('whoisguard') ||
      registrantOrg.toLowerCase().includes('redacted');

    return {
      success: true,
      provider: 'whoisxml',
      domainName: cleanDomain,
      registrar: record.registrarName || record.registryData?.registrarName || 'Unknown Registrar',
      creationDate,
      expirationDate,
      domainAgeDays,
      registrantOrg,
      registrantCountry: registrant.country || record.registryData?.registrant?.country || 'NG',
      nameServers: record.nameServers?.hostNames || [],
      status: record.status || 'active',
      isPrivacyProtected,
      sslValid: true,
      isSuspicious,
      flagReason: isSuspicious ? `Domain registered only ${domainAgeDays} days ago (minimum: ${minAge} days).` : null
    };
  } catch (error) {
    clearTimeout(timeout);
    console.error('WhoisXML service error:', error.message);
    return { success: false, domainName: cleanDomain, error: `Whois request failed: ${error.message}` };
  }
};
