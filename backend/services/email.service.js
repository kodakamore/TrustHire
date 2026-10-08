/**
 * email.service.js
 * Transactional email service for TrustHire powered by Resend.
 * Handles:
 * 1. Corporate Work Email OTP verification emails
 * 2. Recruiter account registration verification links
 */

import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config();

const isResendConfigured = () => {
  const key = process.env.RESEND_API_KEY;
  return Boolean(key && key.startsWith('re_'));
};

const getResendClient = () => {
  if (isResendConfigured()) {
    return new Resend(process.env.RESEND_API_KEY);
  }
  return null;
};

// Default sender address (uses custom verified domain or Resend testing domain)
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'TrustHire <onboarding@resend.dev>';

/**
 * Sends a 6-digit verification code to an official corporate email.
 */
export const sendCorporateEmailOTP = async ({ to, otp, companyName }) => {
  const resend = getResendClient();

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 30px; }
          .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
          .header { background: #0f172a; padding: 28px; text-align: center; }
          .logo { font-size: 22px; font-weight: 900; color: #ffffff; letter-spacing: 1px; }
          .badge { display: inline-block; background: #059669; color: #ffffff; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 9999px; margin-top: 8px; text-transform: uppercase; }
          .content { padding: 32px 28px; }
          .title { font-size: 20px; font-weight: 700; color: #1e293b; margin-top: 0; margin-bottom: 12px; }
          .text { font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
          .otp-box { background: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
          .otp-code { font-family: monospace; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #4338ca; }
          .footer { padding: 20px 28px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">TRUSTHIRE</div>
            <div class="badge">Official Corporate Verification</div>
          </div>
          <div class="content">
            <h2 class="title">Verify Your Corporate Authorization</h2>
            <p class="text">
              You requested to verify your official work email for <strong>${companyName || 'your company'}</strong> on the TrustHire verified recruitment platform.
            </p>
            <p class="text">
              Use the single-use verification code below to confirm your employment authorization:
            </p>
            <div class="otp-box">
              <div class="otp-code">${otp}</div>
            </div>
            <p class="text" style="font-size: 12px; color: #64748b;">
              ⏱️ This code expires in <strong>15 minutes</strong>. If you did not request this verification, you can safely ignore this message.
            </p>
          </div>
          <div class="footer">
            TrustHire Anti-Fraud Verification System &middot; Protecting Nigerian Job Seekers
          </div>
        </div>
      </body>
    </html>
  `;

  if (resend) {
    try {
      const response = await resend.emails.send({
        from: FROM_EMAIL,
        to: [to],
        subject: `[TrustHire] ${otp} is your corporate verification code for ${companyName || 'your company'}`,
        html: htmlContent
      });
      return { success: true, provider: 'resend', data: response };
    } catch (err) {
      console.error('Resend delivery error:', err);
      // Fallback to local log
    }
  }

  // Development / fallback console log
  console.log(`\n======================================================`);
  console.log(`[TrustHire Mailer (Local/Dev)]`);
  console.log(`To: ${to}`);
  console.log(`Subject: Corporate Work Email OTP`);
  console.log(`OTP Code: ${otp}`);
  console.log(`Company: ${companyName || 'N/A'}`);
  console.log(`======================================================\n`);

  return { success: true, provider: 'local_fallback', debugOtp: otp };
};

/**
 * Sends an email containing a link to complete recruiter registration / verify email.
 */
export const sendRegistrationVerificationLink = async ({ to, verificationLink, otp, recruiterName }) => {
  const resend = getResendClient();

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 30px; }
          .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
          .header { background: #0f172a; padding: 28px; text-align: center; }
          .logo { font-size: 22px; font-weight: 900; color: #ffffff; letter-spacing: 1px; }
          .badge { display: inline-block; background: #4338ca; color: #ffffff; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 9999px; margin-top: 8px; text-transform: uppercase; }
          .content { padding: 32px 28px; }
          .title { font-size: 20px; font-weight: 700; color: #1e293b; margin-top: 0; margin-bottom: 12px; }
          .text { font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 20px; }
          .otp-box { background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 18px; text-align: center; margin: 20px 0; }
          .otp-code { font-family: monospace; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #4338ca; }
          .btn-box { text-align: center; margin: 24px 0; }
          .btn { display: inline-block; background: #4f46e5; color: #ffffff !important; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 10px; }
          .footer { padding: 20px 28px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">TRUSTHIRE</div>
            <div class="badge">Account Activation</div>
          </div>
          <div class="content">
            <h2 class="title">Welcome to TrustHire, ${recruiterName || 'Recruiter'}!</h2>
            <p class="text">
              Thank you for registering on TrustHire. To activate your recruiter account and start your onboarding, you can either enter your 6-digit verification code or click the activation link below.
            </p>
            
            ${otp ? `
            <div class="otp-box">
              <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin-bottom: 6px;">Your 6-Digit Verification Code</div>
              <div class="otp-code">${otp}</div>
            </div>
            ` : ''}

            <div class="btn-box">
              <a href="${verificationLink}" class="btn" target="_blank" style="color: #ffffff;">Verify Email &amp; Activate Account</a>
            </div>
            <p class="text" style="font-size: 12px; color: #64748b;">
              Or copy and paste this link into your browser:<br>
              <a href="${verificationLink}" style="color: #4f46e5; word-break: break-all;">${verificationLink}</a>
            </p>
            <p class="text" style="font-size: 12px; color: #94a3b8;">
              ⏱️ This code &amp; link are valid for <strong>24 hours</strong>. If you did not create a TrustHire account, you can ignore this email.
            </p>
          </div>
          <div class="footer">
            TrustHire Platform &middot; Authentic, Verified Hiring in Nigeria
          </div>
        </div>
      </body>
    </html>
  `;

  if (resend) {
    try {
      const response = await resend.emails.send({
        from: FROM_EMAIL,
        to: [to],
        subject: `[TrustHire] ${otp ? otp + ' is your verification code — ' : ''}Activate your recruiter account`,
        html: htmlContent
      });
      return { success: true, provider: 'resend', data: response, otp };
    } catch (err) {
      console.error('Resend delivery error:', err);
    }
  }

  // Development / fallback console log
  console.log(`\n======================================================`);
  console.log(`[TrustHire Mailer (Local/Dev)]`);
  console.log(`To: ${to}`);
  console.log(`Subject: Complete Registration Link & OTP`);
  console.log(`OTP Code: ${otp || 'N/A'}`);
  console.log(`Activation Link: ${verificationLink}`);
  console.log(`======================================================\n`);

  return { success: true, provider: 'local_fallback', link: verificationLink, otp };
};

/**
 * Sent when a verification code was CLONED by a third party and reissued.
 * The recruiter is the victim here — wording must protect, not accuse.
 */
export const sendVerificationCompromisedEmail = async ({ to, recruiterName, jobTitle, newPin, qrCodeUrl }) => {
  const resend = getResendClient();

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 30px; }
          .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
          .header { background: #0f172a; padding: 28px; text-align: center; }
          .logo { font-size: 22px; font-weight: 900; color: #ffffff; letter-spacing: 1px; }
          .badge { display: inline-block; background: #b45309; color: #ffffff; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 9999px; margin-top: 8px; text-transform: uppercase; }
          .content { padding: 32px 28px; }
          .title { font-size: 20px; font-weight: 700; color: #1e293b; margin-top: 0; margin-bottom: 12px; }
          .text { font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 20px; }
          .otp-box { background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 18px; text-align: center; margin: 20px 0; }
          .otp-code { font-family: monospace; font-size: 30px; font-weight: 800; letter-spacing: 6px; color: #4338ca; }
          .btn-box { text-align: center; margin: 24px 0; }
          .btn { display: inline-block; background: #4f46e5; color: #ffffff !important; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 10px; }
          .footer { padding: 20px 28px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">TRUSTHIRE</div>
            <div class="badge">Security Notice — Code Reissued</div>
          </div>
          <div class="content">
            <h2 class="title">Your verification code was protected, ${recruiterName || 'Recruiter'}.</h2>
            <p class="text">
              We detected that the verification QR code / PIN for
              <strong>${jobTitle || 'your job advert'}</strong> was being displayed on a
              different, unauthorized advert. <strong>You did nothing wrong</strong> —
              your advert's verification remains fully intact. As a precaution, we have
              replaced the old code (now disabled) with a fresh one below.
            </p>

            <div class="otp-box">
              <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin-bottom: 6px;">Your New Verification PIN</div>
              <div class="otp-code">${newPin || ''}</div>
            </div>

            <div class="btn-box">
              <a href="${qrCodeUrl || '#'}" class="btn" target="_blank" style="color: #ffffff;">View New QR Code</a>
            </div>
            <p class="text" style="font-size: 13px; color: #64748b;">
              Please replace the old QR code everywhere it was displayed (posters,
              listings, social media) with the new one. The old code will only show
              a "reported misused" warning from now on.
            </p>
          </div>
          <div class="footer">
            TrustHire Platform &middot; Authentic, Verified Hiring in Nigeria
          </div>
        </div>
      </body>
    </html>
  `;

  if (resend) {
    try {
      const response = await resend.emails.send({
        from: FROM_EMAIL,
        to: [to],
        subject: `[TrustHire] Security notice: new verification code for ${jobTitle || 'your advert'}`,
        html: htmlContent,
      });
      return { success: true, provider: 'resend', data: response };
    } catch (err) {
      console.error('Resend delivery error:', err);
    }
  }

  console.log(`\n======================================================`);
  console.log(`[TrustHire Mailer (Local/Dev)]`);
  console.log(`To: ${to}`);
  console.log(`Subject: Security notice: new verification code`);
  console.log(`Job: ${jobTitle}`);
  console.log(`New PIN: ${newPin}`);
  console.log(`QR URL: ${qrCodeUrl}`);
  console.log(`======================================================\n`);

  return { success: true, provider: 'local_fallback', newPin, qrCodeUrl };
};
