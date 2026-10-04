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

  // 12-second timeout to avoid indefinite hangs
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(url, {
      ...options,
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
    const msg = isTimeout
      ? "Cannot reach Dojah API — connection timed out. Set USE_MOCK_API=true in backend/.env for local testing."
      : error.message;
    console.error("Dojah API error:", error);
    return { success: false, error: msg };
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

export const sendSMSOTP = async (phoneNumber, otp) => {
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

  try {
    const res = await makeRequest(`/api/v1/messaging/otp`, {
      method: "POST",
      body: JSON.stringify({
        destination,
        channel: "sms",
        sender_id: "TrustHire",
      }),
    });
    return res;
  } catch (err) {
    return { success: false, error: err.message };
  }
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

  const res = await makeRequest(`/api/v1/ml/liveness`, {
    method: "POST",
    body: JSON.stringify({ image: selfieBase64 }),
  });

  // Always log the raw shape (once, truncated) so a real mismatch between
  // what Dojah actually returns and the field-name guesses below is
  // diagnosable from server logs rather than silently swallowed.
  if (res.success) {
    console.log(
      "[Dojah Liveness] raw entity:",
      JSON.stringify(res.data?.entity)?.slice(0, 800),
    );
  } else {
    console.log("[Dojah Liveness] request failed:", res.error);
  }

  if (res.success && res.data?.entity) {
    const entity = res.data.entity;

    // Face-detected and "is actually live / not spoofed" are two DIFFERENT
    // signals from Dojah and must not be conflated (the previous code set
    // is_live = faceDetected, so any photo with a visible face — spoofed or
    // not — was treated as "live"). Try several plausible locations Dojah's
    // API may report an explicit anti-spoof verdict; if none of them are
    // present, we leave is_live as `undefined` rather than defaulting it to
    // true, which forces the caller to fall back to the numeric score gate.
    const faceDetected =
      entity.face?.detected ?? entity.face_detected ?? undefined;
    const explicitIsLive =
      entity.liveness?.is_live ??
      entity.liveness?.live ??
      entity.liveness?.status ??
      entity.liveness_check ??
      entity.is_live ??
      undefined;

    // Likewise, do NOT default the confidence score to a hardcoded high
    // value when the expected field is missing — that fabricates a pass.
    // If we genuinely cannot find a numeric score, leave it undefined so
    // the threshold comparison in verify.controller.js fails closed.
    const rawScore =
      entity.liveness?.confidence ??
      entity.liveness?.probability ??
      entity.liveness?.score ??
      entity.liveness_score ??
      entity.confidence ??
      undefined;
    const livenessScore =
      typeof rawScore === "number"
        ? rawScore <= 1
          ? rawScore * 100
          : rawScore // normalize 0–1 probabilities to a 0–100 score
        : undefined;

    res.data.entity.liveness_score = livenessScore;
    res.data.entity.is_live =
      typeof explicitIsLive === "boolean" ? explicitIsLive : undefined;
    res.data.entity.face_detected =
      typeof faceDetected === "boolean" ? faceDetected : undefined;

    if (livenessScore === undefined && explicitIsLive === undefined) {
      console.warn(
        "[Dojah Liveness] Could not find a recognizable score or liveness verdict field in the response above. " +
          "The request will fail closed (rejected) rather than fabricate a pass. " +
          "If this is unexpected, share the logged raw entity so the field-name mapping can be corrected.",
      );
    }
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
  // Callers are expected to treat this as "match unavailable", not "matched".
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

  return makeRequest(`/api/v1/ml/photoid/match`, {
    method: "POST",
    body: JSON.stringify({
      image1: selfieBase64,
      image2: referencePhotoBase64,
    }),
  });
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
          // company.controller.js) is exercisable end-to-end locally,
          // instead of always silently seeing an empty array.
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
