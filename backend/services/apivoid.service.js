/**
 * apivoid.service.js
 * Integration with APIVoid URL Reputation & Threat Screening API.
 * Cross-references URLs against 30+ cybersecurity blacklists, phishing databases,
 * and malicious redirection indicators.
 */

import dotenv from 'dotenv';
dotenv.config();

const isSandboxMode = () => {
  if (process.env.USE_MOCK_API === 'true') return true;
  const key = process.env.APIVOID_API_KEY;
  return !key || key.startsWith('your-') || key.length < 10;
};

/**
 * Checks URL reputation and threat score against cybersecurity blacklists.
 * @param {string} url - Target company website URL (e.g. 'https://company.com')
 * @returns {Promise<Object>} Threat evaluation result
 */
export const checkUrlReputation = async (url) => {
  if (!url) {
    return { success: false, error: 'URL is required for reputation screening.' };
  }

  const cleanUrl = url.trim();

  // --- SANDBOX / TEST MODE ---
  if (isSandboxMode()) {
    const lower = cleanUrl.toLowerCase();

    // Simulated flags for known suspicious patterns in sandbox
    const suspiciousKeywords = ['phish', 'scam', 'freejob', 'crypto-bonus', 'fake-recruit', 'instant-hire'];
    const isSuspiciousWord = suspiciousKeywords.some(k => lower.includes(k));
    const isSuspiciousTLD = lower.endsWith('.xyz') || lower.endsWith('.top') || lower.endsWith('.click') || lower.endsWith('.buzz');

    const threatScore = isSuspiciousWord ? 85 : (isSuspiciousTLD ? 45 : 0);
    const blacklistsDetected = isSuspiciousWord ? 6 : (isSuspiciousTLD ? 2 : 0);
    const isBlacklisted = blacklistsDetected > 0;

    return {
      success: true,
      provider: 'apivoid_sandbox',
      url: cleanUrl,
      threatScore,
      isBlacklisted,
      blacklistsDetected,
      enginesCount: 35,
      riskLevel: threatScore >= 70 ? 'critical' : (threatScore >= 40 ? 'medium' : 'clean'),
      redirections: 0,
      sslValid: !lower.startsWith('http://'),
      scannedAt: new Date().toISOString()
    };
  }

  // --- LIVE APIVOID API CALL ---
  const apiKey = process.env.APIVOID_API_KEY;
  const endpoint = `https://endpoint.apivoid.com/urlrep/v2/?key=${apiKey}&url=${encodeURIComponent(cleanUrl)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(endpoint, { signal: controller.signal });
    clearTimeout(timeout);
    const data = await res.json();

    if (!res.ok || data.error) {
      console.error('APIVoid API response error:', data.error || res.status);
      return { success: false, error: data.error || `APIVoid lookup failed (HTTP ${res.status})` };
    }

    const report = data.data?.report || {};
    const securityChecks = report.security_checks || {};
    const blacklists = securityChecks.blacklists || {};

    const threatScore = report.risk_score?.result || 0;
    const blacklistsDetected = blacklists.detections || 0;
    const enginesCount = blacklists.engines_count || 35;
    const isBlacklisted = blacklistsDetected > 0;

    return {
      success: true,
      provider: 'apivoid',
      url: cleanUrl,
      threatScore,
      isBlacklisted,
      blacklistsDetected,
      enginesCount,
      riskLevel: threatScore >= 70 ? 'critical' : (threatScore >= 40 ? 'medium' : 'clean'),
      redirections: report.redirection?.redirection_counter || 0,
      sslValid: report.certificate?.valid !== false,
      serverLocation: report.server?.country_name || 'Unknown',
      scannedAt: new Date().toISOString()
    };
  } catch (error) {
    clearTimeout(timeout);
    console.error('APIVoid service error:', error.message);
    return { success: false, error: `APIVoid request failed: ${error.message}` };
  }
};
