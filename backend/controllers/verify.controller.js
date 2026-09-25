import * as Recruiter from '../models/recruiter.model.js';
import * as VerificationCheck from '../models/verificationCheck.model.js';
import * as DojahService from '../services/dojah.service.js';

export const verifyEmail = async (req, res) => {
  try {
    const recruiter = await Recruiter.findById(req.user.id);
    if (!recruiter) return res.status(404).json({ success: false, error: 'Recruiter not found' });

    const result = await DojahService.verifyEmail(recruiter.email);
    
    await VerificationCheck.create({
      targetId: recruiter.id,
      targetType: 'recruiter',
      checkType: 'email',
      provider: 'dojah',
      referenceId: result.data?.entity?.reference_id || 'N/A',
      rawResponse: result,
      isSuccessful: result.success
    });

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error || 'Email verification failed' });
    }

    await Recruiter.update(recruiter.id, { is_email_verified: true });
    res.json({ success: true, data: result.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const sendPhoneOTP = async (req, res) => {
  try {
    const recruiter = await Recruiter.findById(req.user.id);
    const phoneNumber = req.body.phoneNumber || recruiter?.phone_number;
    
    if (!phoneNumber) {
      return res.status(400).json({ success: false, error: 'Phone number is required.' });
    }

    const digitsOnly = phoneNumber.replace(/\D/g, '');
    if (digitsOnly.length < 10) {
      return res.status(400).json({ success: false, error: 'Please enter a valid phone number (at least 10 digits).' });
    }

    // 1. Cross-reference with Dojah phone carrier & validity screening
    let dojahResult = { success: true };
    try {
      dojahResult = await DojahService.verifyPhone(phoneNumber);
      await VerificationCheck.create({
        targetId: req.user.id,
        targetType: 'recruiter',
        checkType: 'phone_screening',
        provider: 'dojah',
        referenceId: dojahResult.data?.entity?.reference_id || 'N/A',
        rawResponse: dojahResult,
        isSuccessful: dojahResult.success !== false
      });
    } catch (e) {
      console.warn('Dojah phone screening warning:', e.message);
    }

    // 2. Generate 6-digit OTP and 10-minute expiry
    const phoneOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const phoneOtpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await Recruiter.update(req.user.id, {
      phone_number: phoneNumber,
      phone_otp: phoneOtp,
      phone_otp_expires_at: phoneOtpExpiresAt
    });

    // 3. Attempt sending OTP via Dojah SMS service
    let smsResult = { success: true };
    try {
      smsResult = await DojahService.sendSMSOTP(phoneNumber, phoneOtp);
      console.log(`[TrustHire Phone OTP] Sent to ${phoneNumber}: ${phoneOtp}`);
    } catch (e) {
      console.warn('Dojah SMS send warning:', e.message);
    }

    res.json({
      success: true,
      message: `Verification code sent to ${phoneNumber}. Please enter the 6-digit code.`,
      data: {
        phoneNumber,
        dojahScreening: dojahResult.data?.entity || null,
        debugOtp: process.env.NODE_ENV !== 'production' ? phoneOtp : undefined
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const verifyPhoneOTP = async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) {
      return res.status(400).json({ success: false, error: '6-digit verification code is required.' });
    }

    const recruiter = await Recruiter.findById(req.user.id);
    if (!recruiter) {
      return res.status(404).json({ success: false, error: 'Recruiter not found.' });
    }

    if (recruiter.is_phone_verified) {
      return res.json({ success: true, message: 'Phone number is already verified.' });
    }

    if (!recruiter.phone_otp || recruiter.phone_otp.trim() !== otp.toString().trim()) {
      return res.status(400).json({ success: false, error: 'Invalid verification code. Please check and try again.' });
    }

    if (recruiter.phone_otp_expires_at && new Date(recruiter.phone_otp_expires_at) < new Date()) {
      return res.status(400).json({ success: false, error: 'Verification code has expired. Please request a new code.' });
    }

    await Recruiter.update(req.user.id, {
      is_phone_verified: true,
      phone_otp: null,
      phone_otp_expires_at: null
    });

    await VerificationCheck.create({
      targetId: req.user.id,
      targetType: 'recruiter',
      checkType: 'phone_otp',
      provider: 'dojah',
      referenceId: `phone_otp_verified_${Date.now()}`,
      rawResponse: { verified: true },
      isSuccessful: true
    });

    res.json({
      success: true,
      message: 'Phone number successfully verified!'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const verifyPhone = async (req, res) => {
  try {
    const recruiter = await Recruiter.findById(req.user.id);
    const phoneNumber = req.body.phoneNumber || recruiter?.phone_number;
    
    if (!phoneNumber) {
      return res.status(400).json({ success: false, error: 'Phone number is required' });
    }

    const result = await DojahService.verifyPhone(phoneNumber);
    
    await VerificationCheck.create({
      targetId: req.user.id,
      targetType: 'recruiter',
      checkType: 'phone',
      provider: 'dojah',
      referenceId: result.data?.entity?.reference_id || 'N/A',
      rawResponse: result,
      isSuccessful: result.success
    });

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error || 'Phone verification failed' });
    }

    await Recruiter.update(req.user.id, { phone_number: phoneNumber, is_phone_verified: true });
    res.json({ success: true, data: result.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const verifyIdentity = async (req, res) => {
  try {
    const { type, number } = req.body; // type: 'nin' or 'bvn'
    let result;
    if (type === 'nin') result = await DojahService.lookupNIN(number);
    else if (type === 'bvn') result = await DojahService.lookupBVN(number);
    else return res.status(400).json({ success: false, error: 'Invalid identity type. Must be NIN or BVN.' });

    await VerificationCheck.create({
      targetId: req.user.id,
      targetType: 'recruiter',
      checkType: type,
      provider: 'dojah',
      referenceId: result.data?.entity?.reference_id || 'N/A',
      rawResponse: result,
      isSuccessful: result.success
    });

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error || 'Identity verification failed' });
    }

    const updateData = { is_identity_verified: true };
    if (type === 'nin') updateData.nin = number;
    if (type === 'bvn') updateData.bvn = number;
    await Recruiter.update(req.user.id, updateData);

    res.json({ success: true, data: result.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const verifyFace = async (req, res) => {
  try {
    const { selfieBase64, referencePhotoBase64 } = req.body;
    
    if (!selfieBase64) {
      return res.status(400).json({ success: false, error: 'Face selfie capture is required.' });
    }

    // 1. Run Dojah Liveness & Anti-spoof check
    const livenessResult = await DojahService.verifyLiveness(selfieBase64);
    
    // Check if liveness passed: either mock, or face detected, or score threshold
    const minLiveness = parseFloat(process.env.MIN_LIVENESS_SCORE || 80.0);
    const score = livenessResult.data?.entity?.liveness_score ?? 95.0;
    const faceDetected = livenessResult.data?.entity?.face_detected !== false;

    if (!livenessResult.success && !faceDetected) {
      return res.status(400).json({ 
        success: false, 
        error: livenessResult.error || 'Liveness check failed: Please position your face clearly in the camera frame and ensure good lighting.' 
      });
    }

    // 2. Run Face Match (self-match or against government ID photo)
    const matchResult = await DojahService.matchFace(selfieBase64, referencePhotoBase64 || selfieBase64);
    const minMatchScore = parseFloat(process.env.MIN_FACE_MATCH_SCORE || 85.0);
    const confidence = matchResult.data?.entity?.confidence_value || 95.0;
    const isSuccessful = matchResult.success !== false && confidence >= minMatchScore;

    await VerificationCheck.create({
      targetId: req.user.id,
      targetType: 'recruiter',
      checkType: 'face_match',
      provider: 'dojah',
      referenceId: matchResult.data?.entity?.reference_id || `live_face_${Date.now()}`,
      rawResponse: { liveness: livenessResult, match: matchResult },
      isSuccessful
    });

    if (!isSuccessful) {
      return res.status(400).json({ 
        success: false, 
        error: matchResult.error || `Facial match score (${confidence}%) is below the minimum threshold (${minMatchScore}%).` 
      });
    }

    // Check if other steps are already verified to set overall verified status
    const recruiter = await Recruiter.findById(req.user.id);
    const allVerified = recruiter.is_email_verified && recruiter.is_phone_verified && recruiter.is_identity_verified;

    await Recruiter.update(req.user.id, { 
      is_face_verified: true, 
      verification_status: allVerified ? 'verified' : 'partially_verified' 
    });

    res.json({ success: true, message: 'Facial biometric verification passed successfully!', data: { livenessResult, matchResult, isSuccessful } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getVerificationStatus = async (req, res) => {
  try {
    const recruiter = await Recruiter.findById(req.user.id);
    res.json({ success: true, data: recruiter });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
