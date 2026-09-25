import assert from 'assert';
import * as DojahService from '../services/dojah.service.js';
import * as WhoisService from '../services/whois.service.js';

console.log('====================================================');
console.log('🌐 TESTING INTEGRATION WITH DOJAH & WHOIS SERVICES');
console.log('====================================================\n');

// 1. Email check
console.log('Checking Dojah email verification...');
const emailRes = await DojahService.verifyEmail('testuser@gmail.com');
console.log('Email response status:', emailRes.status ?? 'Network Mock / Returned');
assert.ok(typeof emailRes === 'object', 'Dojah email check should return a response object');

// 2. CAC lookup
console.log('Checking Dojah CAC verification...');
const cacRes = await DojahService.lookupCAC('RC123456');
console.log('CAC response status:', cacRes.status ?? 'Network Mock / Returned');
assert.ok(typeof cacRes === 'object', 'Dojah CAC check should return a response object');

// 3. WHOIS lookup service domain cleaning
console.log('Checking WHOIS domain lookup formatting...');
const whoisRes = await WhoisService.lookupDomain('https://google.com/careers');
console.log('WHOIS parsed domain name:', whoisRes.domainName);
assert.strictEqual(whoisRes.domainName, 'google.com', 'Domain extraction should clean URL protocol and paths');
assert.ok(typeof whoisRes.domainAgeDays === 'number', 'WHOIS must calculate domain age in days');

// 4. APIVoid URL Reputation & Threat Screening
import * as ApivoidService from '../services/apivoid.service.js';
console.log('Checking APIVoid URL reputation screening...');
const apivoidRes = await ApivoidService.checkUrlReputation('https://paystack.com');
console.log('APIVoid threat score:', apivoidRes.threatScore, 'Blacklisted:', apivoidRes.isBlacklisted);
assert.strictEqual(typeof apivoidRes.threatScore, 'number', 'APIVoid should return numerical threat score');
assert.strictEqual(typeof apivoidRes.isBlacklisted, 'boolean', 'APIVoid should return boolean isBlacklisted');

console.log('\n✔ External API service contracts and handlers validated successfully!');
