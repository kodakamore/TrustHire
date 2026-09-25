import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import * as Recruiter from '../models/recruiter.model.js';
import * as Admin from '../models/admin.model.js';
import { validateEmail } from '../utils/validators.js';
import { sendRegistrationVerificationLink } from '../services/email.service.js';
import dotenv from 'dotenv';
dotenv.config();

export const register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, phoneNumber } = req.body;
    
    if (!firstName || !lastName) {
      return res.status(400).json({ success: false, error: 'First name and last name are required' });
    }
    if (!validateEmail(email).valid) {
      return res.status(400).json({ success: false, error: 'Invalid email address' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    const existing = await Recruiter.findByEmail(email);
    if (existing) {
      return res.status(400).json({ success: false, error: 'Email already in use' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const emailOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const emailOtpExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    const recruiter = await Recruiter.create({
      email,
      passwordHash,
      firstName,
      lastName,
      phoneNumber: phone || phoneNumber || null,
      emailOtp,
      emailOtpExpiresAt
    });

    // Generate 24-hour verification token & link
    const verificationToken = jwt.sign(
      { recruiterId: recruiter.id, email: recruiter.email, action: 'verify_email' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    const baseUrl = process.env.FRONTEND_URL || process.env.FRONTEND_RECRUITER_URL || 'http://localhost:3000';
    const verificationLink = `${baseUrl}/verify-email?token=${verificationToken}`;

    // Send welcome / activation email via Resend
    await sendRegistrationVerificationLink({
      to: recruiter.email,
      verificationLink,
      otp: emailOtp,
      recruiterName: `${firstName} ${lastName}`
    });

    res.status(201).json({ 
      success: true, 
      message: 'Account created! Please check your email for the verification link or enter your 6-digit code.',
      data: { 
        email: recruiter.email,
        requiresVerification: true,
        verificationLink: process.env.NODE_ENV !== 'production' ? verificationLink : undefined,
        debugOtp: process.env.NODE_ENV !== 'production' ? emailOtp : undefined
      } 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const verifyEmailToken = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, error: 'Verification token is required.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.action !== 'verify_email' || !decoded.recruiterId) {
      return res.status(400).json({ success: false, error: 'Invalid verification token.' });
    }

    const recruiter = await Recruiter.findById(decoded.recruiterId);
    if (!recruiter) {
      return res.status(404).json({ success: false, error: 'Recruiter account not found.' });
    }

    await Recruiter.update(recruiter.id, { 
      is_email_verified: true,
      email_otp: null,
      email_otp_expires_at: null
    });

    const authToken = jwt.sign(
      { id: recruiter.id, email: recruiter.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    delete recruiter.password_hash;

    res.json({
      success: true,
      message: 'Email verified successfully! Your recruiter account is now activated.',
      data: {
        token: authToken,
        recruiter: { ...recruiter, is_email_verified: true }
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, error: 'Verification link is invalid or has expired.' });
  }
};

export const verifyEmailOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, error: 'Email and 6-digit verification code are required.' });
    }

    const recruiter = await Recruiter.findByEmail(email);
    if (!recruiter) {
      return res.status(404).json({ success: false, error: 'Recruiter account not found.' });
    }

    if (recruiter.is_email_verified) {
      const authToken = jwt.sign(
        { id: recruiter.id, email: recruiter.email },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );
      delete recruiter.password_hash;
      return res.json({
        success: true,
        message: 'Email is already verified.',
        data: { token: authToken, recruiter }
      });
    }

    if (!recruiter.email_otp || recruiter.email_otp.trim() !== otp.toString().trim()) {
      return res.status(400).json({ success: false, error: 'Invalid verification code. Please check your email.' });
    }

    if (recruiter.email_otp_expires_at && new Date(recruiter.email_otp_expires_at) < new Date()) {
      return res.status(400).json({ success: false, error: 'Verification code has expired. Please request a new one.' });
    }

    await Recruiter.update(recruiter.id, {
      is_email_verified: true,
      email_otp: null,
      email_otp_expires_at: null
    });

    const authToken = jwt.sign(
      { id: recruiter.id, email: recruiter.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    delete recruiter.password_hash;

    res.json({
      success: true,
      message: 'Email verified successfully! You can now proceed with your onboarding.',
      data: {
        token: authToken,
        recruiter: { ...recruiter, is_email_verified: true }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const resendVerificationEmail = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required.' });
    }

    const recruiter = await Recruiter.findByEmail(email);
    if (!recruiter) {
      return res.status(404).json({ success: false, error: 'Recruiter account not found.' });
    }

    if (recruiter.is_email_verified) {
      return res.json({ success: true, message: 'Email is already verified.' });
    }

    const emailOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const emailOtpExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await Recruiter.update(recruiter.id, {
      email_otp: emailOtp,
      email_otp_expires_at: emailOtpExpiresAt
    });

    const verificationToken = jwt.sign(
      { recruiterId: recruiter.id, email: recruiter.email, action: 'verify_email' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    const baseUrl = process.env.FRONTEND_URL || process.env.FRONTEND_RECRUITER_URL || 'http://localhost:3000';
    const verificationLink = `${baseUrl}/verify-email?token=${verificationToken}`;

    await sendRegistrationVerificationLink({
      to: recruiter.email,
      verificationLink,
      otp: emailOtp,
      recruiterName: `${recruiter.first_name} ${recruiter.last_name}`
    });

    res.json({
      success: true,
      message: 'A new verification link and code have been sent to your email.',
      debugOtp: process.env.NODE_ENV !== 'production' ? emailOtp : undefined
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};


export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const recruiter = await Recruiter.findByEmail(email);
    if (!recruiter) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, recruiter.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: recruiter.id, email: recruiter.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    
    delete recruiter.password_hash;
    res.json({ success: true, data: { recruiter, token } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const admin = await Admin.findByEmail(email);
    if (!admin) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, admin.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: admin.id, email: admin.email, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    
    delete admin.password_hash;
    res.json({ success: true, data: { admin, token } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const adminRegister = async (req, res) => {
  try {
    const { email, password, role } = req.body;
    
    if (!validateEmail(email).valid) return res.status(400).json({ success: false, error: 'Invalid email' });
    if (!password || password.length < 6) return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });

    const existing = await Admin.findByEmail(email);
    if (existing) return res.status(400).json({ success: false, error: 'Admin email already exists' });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const admin = await Admin.create({ email, passwordHash, role: role || 'admin' });
    const token = jwt.sign({ id: admin.id, email: admin.email, role: admin.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

    res.status(201).json({ success: true, data: { admin, token } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
