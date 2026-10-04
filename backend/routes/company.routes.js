import express from "express";
import {
  createCompany,
  getCompanies,
  getCompany,
  updateCompany,
  verifyCAC,
  verifyTIN,
  verifyWebsite,
  getVerificationStatus,
  sendCorporateEmailOTP,
  verifyCorporateEmailOTP,
  getDnsVerificationInstructions,
  verifyDns,
} from "../controllers/company.controller.js";
import { authenticateRecruiter } from "../middleware/auth.js";
import { auditLogger } from "../middleware/auditLogger.js";

const router = express.Router();

router.use(authenticateRecruiter);

router.post("/", createCompany, auditLogger("CREATE_COMPANY"));
router.get("/", getCompanies);
router.get("/:id", getCompany);
router.put("/:id", updateCompany, auditLogger("UPDATE_COMPANY"));

router.post("/:id/verify/cac", verifyCAC, auditLogger("VERIFY_COMPANY_CAC"));
router.post("/:id/verify/tin", verifyTIN, auditLogger("VERIFY_COMPANY_TIN"));
router.post(
  "/:id/verify/website",
  verifyWebsite,
  auditLogger("VERIFY_COMPANY_WEBSITE"),
);

// DNS TXT record domain-ownership verification (cryptographic proof, not a heuristic)
router.get(
  "/:id/dns-verification-instructions",
  getDnsVerificationInstructions,
);
router.post("/:id/verify/dns", verifyDns, auditLogger("VERIFY_COMPANY_DNS"));

// Corporate Work Email Verification Endpoints
router.post(
  "/:id/corporate-email/send-otp",
  sendCorporateEmailOTP,
  auditLogger("SEND_CORPORATE_EMAIL_OTP"),
);
router.post(
  "/:id/corporate-email/verify-otp",
  verifyCorporateEmailOTP,
  auditLogger("VERIFY_CORPORATE_EMAIL_OTP"),
);

router.get("/:id/status", getVerificationStatus);

export default router;
