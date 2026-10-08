import rateLimit from "express-rate-limit";

export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window`
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many requests, please try again later.",
  },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    error: "Too many auth requests, please try again later.",
  },
});

export const publicRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    error: "Too many lookup requests, please try again later.",
  },
});

// Every successful call to /verify/phone/send-otp sends a real, billed SMS
// via Dojah — unlike the other limiters above, this isn't just about abuse
// prevention, it's about direct cost control. Kept tight (5 per 15 min per
// IP) since a legitimate user rarely needs more than one or two resends.
export const otpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error:
      "Too many verification code requests. Please wait a few minutes before trying again.",
  },
});
