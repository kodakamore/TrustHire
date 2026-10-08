import { dojahConfig } from "../config/dojah.js";

// Tiny 1x1 JPEG used only as a stand-in "ID photo" in USE_MOCK_API mode, so
// the face-match pipeline has a real (non-empty) reference image to exercise
// end-to-end locally, without needing live Dojah sandbox credentials.
const MOCK_ID_PHOTO_BASE64 =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=";

/**
 * When USE_MOCK_API=true in .env, all Dojah calls return local mock responses
 * (no network request). Use this when sandbox.dojah.io is unreachable or
 * you want fast local testing. Set USE_MOCK_API=false to call the real API.
 */
const isMockMode = () => {
  // Explicit override always wins
  if (process.env.USE_MOCK_API === "true") return true;
  if (process.env.USE_MOCK_API === "false") return false;
  // Fall back to checking for placeholder keys
  return (
    !dojahConfig.appId ||
    dojahConfig.appId.startsWith("your-") ||
    !dojahConfig.secretKey ||
    dojahConfig.secretKey.startsWith("your-")
  );
};

const makeRequest = async (endpoint, options = {}) => {
  const url = `${dojahConfig.baseUrl}${endpoint}`;
  const headers = {
    Authorization: dojahConfig.secretKey,
    AppId: dojahConfig.appId,
    "Content-Type": "application/json",
    ...options.headers,
  };

  // Timeout to avoid indefinite hangs. Default is fine for small, fast
  // lookups (NIN/BVN/CAC — short query params, no file upload). Endpoints
  // that upload an image for ML processing (liveness, face match) are
  // genuinely slower, so those pass a longer override via options.timeoutMs.
  const timeoutMs = options.timeoutMs || 12000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { timeoutMs: _omit, ...fetchOptions } = options; // not a real fetch option
    const res = await fetch(url, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: `Dojah endpoint returned HTTP ${res.status}` };
    }

    if (!res.ok) {
      console.warn(
        `Dojah API ${res.status}:`,
        typeof data === "object" ? JSON.stringify(data) : data,
      );
    }
    return { success: res.ok, data, status: res.status, error: data?.error };
  } catch (error) {
    clearTimeout(timeout);
    const isTimeout =
      error.name === "AbortError" ||
      error?.cause?.code === "UND_ERR_CONNECT_TIMEOUT";
    const logMsg = isTimeout
      ? "Cannot reach Dojah API — connection timed out. Set USE_MOCK_API=true in backend/.env for local testing."
      : error.message;
    const userMsg = isTimeout
      ? "The verification service is temporarily unavailable. Please try again shortly."
      : "The verification service returned an unexpected error. Please try again.";
    console.error("Dojah API error:", logMsg);
    return { success: false, error: userMsg };
  }
};

export const verifyEmail = async (email) => {
  if (isMockMode()) {
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      return { success: false, error: "Invalid email address format" };
    }
    const disposableDomains = [
      "tempmail.com",
      "mailinator.com",
      "10minutemail.com",
      "guerrillamail.com",
    ];
    const domain = email.split("@")[1]?.toLowerCase();
    if (disposableDomains.includes(domain)) {
      return {
        success: false,
        error: "Disposable or high-risk email address rejected.",
      };
    }
    return {
      success: true,
      data: {
        entity: {
          reference_id: `sandbox_email_${Date.now()}`,
          deliverability: "DELIVERABLE",
          domain,
          is_disposable: false,
        },
      },
    };
  }
  return makeRequest(`/api/v1/kyc/email?email=${encodeURIComponent(email)}`);
};

export const verifyPhone = async (phoneNumber) => {
  if (isMockMode()) {
    if (!phoneNumber) {
      return { success: false, error: "Phone number is required." };
    }
    // Strip all non-digit chars — format-agnostic, just need at least 10 digits.
    // Dojah's real API handles E.164 normalisation server-side.
    const digitsOnly = phoneNumber.replace(/\D/g, "");
    if (digitsOnly.length < 10) {
      return {
        success: false,
        error:
          "Invalid phone number. Must contain at least 10 digits (e.g. 08012345678 or +2348012345678).",
      };
    }
    return {
      success: true,
      data: {
        entity: {
          reference_id: `sandbox_phone_${Date.now()}`,
          status: "active",
          valid: true,
          phone: phoneNumber,
        },
      },
    };
  }
  // Real Dojah API — normalise to E.164 before sending
  const digitsOnly = phoneNumber.replace(/\D/g, "");
  const e164 = digitsOnly.startsWith("0")
    ? `+234${digitsOnly.slice(1)}`
    : `+${digitsOnly}`;
  return makeRequest(
    `/api/v1/kyc/phone_number?phone_number=${encodeURIComponent(e164)}`,
  );
};

export const lookupNIN = async (nin) => {
  if (isMockMode()) {
    const clean = (nin || "").toString().trim();
    if (!/^\d{11}$/.test(clean)) {
      return {
        success: false,
        error:
          "Invalid NIN. National Identification Number must be exactly 11 numeric digits.",
      };
    }
    return {
      success: true,
      data: {
        entity: {
          reference_id: `sandbox_nin_${Date.now()}`,
          nin: clean,
          firstname: "VERIFIED",
          surname: "RECRUITER",
          gender: "M",
          status: "verified",
          // Real Dojah NIN lookups return a base64-encoded photo of the ID
          // holder. This is the only trustworthy, server-held reference
          // image we have for face-matching, so mock mode simulates it too.
          photo: MOCK_ID_PHOTO_BASE64,
        },
      },
    };
  }
  return makeRequest(`/api/v1/kyc/nin?nin=${nin}`);
};

export const lookupBVN = async (bvn) => {
  if (isMockMode()) {
    const clean = (bvn || "").toString().trim();
    if (!/^\d{11}$/.test(clean)) {
      return {
        success: false,
        error:
          "Invalid BVN. Bank Verification Number must be exactly 11 numeric digits.",
      };
    }
    return {
      success: true,
      data: {
        entity: {
          reference_id: `sandbox_bvn_${Date.now()}`,
          bvn: clean,
          firstname: "VERIFIED",
          surname: "RECRUITER",
          status: "verified",
          photo: MOCK_ID_PHOTO_BASE64,
        },
      },
    };
  }
  // Real Dojah API uses /bvn/full for full details
  return makeRequest(`/api/v1/kyc/bvn/full?bvn=${bvn}`);
};

// Sends a real OTP via Dojah. Dojah generates the code and delivers it; we
// only get back a reference_id, which must be stored and later passed to
// validateOTP together with the code the user types in.
export const sendSMSOTP = async (phoneNumber) => {
  if (isMockMode()) {
    return {
      success: true,
      data: {
        entity: {
          reference_id: `sandbox_otp_${Date.now()}`,
          status: "delivered",
          destination: phoneNumber,
        },
      },
    };
  }

  const digitsOnly = (phoneNumber || "").replace(/\D/g, "");
  const destination = digitsOnly.startsWith("0")
    ? `234${digitsOnly.slice(1)}`
    : digitsOnly;

  const res = await makeRequest(`/api/v1/messaging/otp`, {
    method: "POST",
    body: JSON.stringify({
      destination,
      channel: "sms",
      length: 6,
      // Must be a Sender ID registered on your Dojah account.
      // Use "Dojah" for development until your own is registered.
      sender_id: process.env.DOJAH_SENDER_ID || "Dojah",
    }),
  });

  // Dojah's docs show entity as an array; normalize to a single object.
  const entity = Array.isArray(res.data?.entity)
    ? res.data.entity[0]
    : res.data?.entity;
  if (res.success && !entity?.reference_id) {
    return {
      success: false,
      error: "SMS provider did not return a reference for this code.",
    };
  }
  if (res.success) res.data.entity = entity;
  return res;
};

// Asks Dojah whether the code the user entered is valid for the given
// reference_id. In mock mode (and in Dojah's sandbox) the code is always 1234.
export const validateOTP = async (code, referenceId) => {
  if (isMockMode()) {
    return {
      success: true,
      data: { entity: { valid: String(code).trim() === "1234" } },
    };
  }
  return makeRequest(
    `/api/v1/messaging/otp/validate?code=${encodeURIComponent(code)}&reference_id=${encodeURIComponent(referenceId)}`,
  );
};

export const verifyLiveness = async (selfieBase64) => {
  if (isMockMode()) {
    if (
      !selfieBase64 ||
      typeof selfieBase64 !== "string" ||
      !selfieBase64.startsWith("data:image/")
    ) {
      return {
        success: false,
        error:
          "Invalid selfie frame. A valid base64 image capture is required.",
      };
    }
    // Check minimum length for a realistic webcam capture (at least 5KB base64)
    if (selfieBase64.length < 5000) {
      return {
        success: false,
        error:
          "Captured frame is too low quality or blank. Please capture a clear face photo.",
      };
    }
    return {
      success: true,
      data: {
        entity: {
          reference_id: `sandbox_live_${Date.now()}`,
          liveness_score: 96.5,
          is_live: true,
          face_detected: true,
        },
      },
    };
  }

  // Dojah expects raw base64 for image fields — NOT a data: URL.
  const stripDataUrlPrefix = (b64) =>
    (b64 || "").replace(/^data:image\/\w+;base64,/, "");

  const res = await makeRequest(`/api/v1/ml/liveness`, {
    method: "POST",
    body: JSON.stringify({ image: stripDataUrlPrefix(selfieBase64) }),
    // Image upload + server-side ML inference is slower than a typical
    // lookup — give it real headroom instead of the 12s default.
    timeoutMs: 30000,
  });

  if (res.success && res.data?.entity) {
    const entity = res.data.entity;

    // Confirmed from this account's actual live response: entity.liveness is
    // { spoof: boolean, confidence: number }. spoof=true means the image was
    // classified AS a spoof (NOT live), so a high confidence there means
    // "very confident this is fake". We normalize it into one
    // "higher = more likely genuinely live" score.
    // entity.liveness_check / entity.liveness_probability are kept as a
    // fallback for accounts/API versions that use that shape instead.
    const faceDetected = entity.face?.detected ?? undefined;

    const hasSpoofField = typeof entity.liveness?.spoof === "boolean";
    const spoofConfidence =
      typeof entity.liveness?.confidence === "number"
        ? entity.liveness.confidence
        : undefined;

    const explicitIsLive = hasSpoofField
      ? !entity.liveness.spoof
      : (entity.liveness?.liveness_check ?? undefined);

    let livenessScore;
    if (hasSpoofField && typeof spoofConfidence === "number") {
      // spoof=true, confidence=99.99 -> very confidently fake -> score ~0.01
      // spoof=false, confidence=98   -> very confidently real -> score 98
      livenessScore = entity.liveness.spoof
        ? 100 - spoofConfidence
        : spoofConfidence;
    } else {
      const rawScore = entity.liveness?.liveness_probability ?? undefined;
      livenessScore =
        typeof rawScore === "number"
          ? rawScore <= 1
            ? rawScore * 100
            : rawScore // normalize 0–1 probabilities to a 0–100 scale
          : undefined;
    }

    res.data.entity.liveness_score = livenessScore;
    res.data.entity.is_live =
      typeof explicitIsLive === "boolean" ? explicitIsLive : undefined;
    res.data.entity.face_detected =
      typeof faceDetected === "boolean" ? faceDetected : undefined;

    // Compact, targeted log of exactly the fields the decision is based on.
    console.log(
      "[Dojah Liveness] face_detected=%s is_live=%s liveness_score=%s (raw liveness node: %s)",
      faceDetected,
      explicitIsLive,
      livenessScore,
      JSON.stringify(entity.liveness),
    );

    if (livenessScore === undefined && explicitIsLive === undefined) {
      console.warn(
        "[Dojah Liveness] entity.liveness was missing or had no recognizable fields. " +
          "Failing closed (rejected) rather than fabricating a pass. Raw entity.liveness: " +
          JSON.stringify(entity.liveness),
      );
    }
  } else {
    console.log("[Dojah Liveness] request failed:", res.error);
  }

  return res;
};

export const matchFace = async (selfieBase64, referencePhotoBase64) => {
  if (!selfieBase64) {
    return {
      success: false,
      error: "Live selfie is required for face verification.",
    };
  }

  // A real match requires a genuine second, independently-sourced image
  // (the recruiter's government-ID photo from their NIN/BVN lookup). If we
  // don't have one — or it happens to be byte-identical to the live selfie —
  // there is nothing to compare, so we must NOT fabricate a passing score.
  if (!referencePhotoBase64 || referencePhotoBase64 === selfieBase64) {
    return {
      success: false,
      noReference: true,
      error:
        "No independent identity photo is available to match the live selfie against.",
    };
  }

  if (isMockMode()) {
    return {
      success: true,
      data: {
        entity: {
          reference_id: `sandbox_match_${Date.now()}`,
          confidence_value: 94.8,
          match: true,
        },
      },
    };
  }

  // Endpoint /api/v1/kyc/photoid/verify; body params are selfie_image /
  // photoid_image, both base64 with the data: URL prefix stripped.
  const stripDataUrlPrefix = (b64) =>
    (b64 || "").replace(/^data:image\/\w+;base64,/, "");

  const res = await makeRequest(`/api/v1/kyc/photoid/verify`, {
    method: "POST",
    body: JSON.stringify({
      selfie_image: stripDataUrlPrefix(selfieBase64),
      photoid_image: stripDataUrlPrefix(referencePhotoBase64),
    }),
    timeoutMs: 30000,
  });

  // Dojah nests the real result under entity.selfie (confidence_value,
  // match, blur/glare flags, extracted ID names). Normalize
  // entity.confidence_value so the rest of the app doesn't need to know
  // about this nesting.
  if (res.success && res.data?.entity?.selfie) {
    res.data.entity.confidence_value = res.data.entity.selfie.confidence_value;
    res.data.entity.match = res.data.entity.selfie.match;
    console.log(
      "[Dojah Face Match] confidence=%s match=%s",
      res.data.entity.selfie.confidence_value,
      res.data.entity.selfie.match,
    );
  } else if (!res.success) {
    console.log("[Dojah Face Match] request failed:", res.error);
  }

  return res;
};

export const lookupCAC = async (rcNumber) => {
  if (isMockMode()) {
    const clean = (rcNumber || "").toString().trim().replace(/\s+/g, "");
    if (!clean || clean.length < 5) {
      return {
        success: false,
        error:
          "Invalid RC Number. Must be a valid Corporate Affairs Commission registration number.",
      };
    }
    return {
      success: true,
      data: {
        entity: {
          reference_id: `sandbox_cac_${Date.now()}`,
          rc_number: clean,
          company_name: "CERTIFIED ENTERPRISE NIGERIA LIMITED",
          company_type: "PRIVATE COMPANY LIMITED BY SHARES",
          registration_date: "2020-03-15",
          status: "ACTIVE",
          // Real Dojah CAC lookups can return registered directors/affiliates
          // and contact details. The mock includes these too so the
          // recruiter<->company cross-verification logic (director-name,
          // official-phone and official-email matching in
          // company.controller.js) is exercisable end-to-end locally.
          affiliates: [
            { name: "SANDBOX DIRECTOR ONE", role: "Director" },
            { name: "SANDBOX DIRECTOR TWO", role: "Secretary" },
          ],
          phone: "+2348000000000",
          email: "contact@sandboxcompany.example",
        },
      },
    };
  }
  // Real Dojah API uses /cac/basic for basic company lookup
  return makeRequest(`/api/v1/kyc/cac/basic?rc_number=${rcNumber}`);
};

export const verifyTIN = async (tinNumber) => {
  if (isMockMode()) {
    const clean = (tinNumber || "").toString().trim();
    if (!clean || clean.length < 8) {
      return {
        success: false,
        error:
          "Invalid TIN. Tax Identification Number must be at least 8 digits.",
      };
    }
    return {
      success: true,
      data: {
        entity: {
          reference_id: `sandbox_tin_${Date.now()}`,
          tin: clean,
          valid: true,
          status: "ACTIVE",
        },
      },
    };
  }
  return makeRequest(`/api/v1/kyc/tin?tin=${tinNumber}`);
};
