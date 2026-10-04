import axios from "axios";

const api = axios.create({
  baseURL: "/api",
});

// Attach appropriate token based on route / local storage
api.interceptors.request.use((config) => {
  // If request is to admin route, use admin token
  if (config.url && config.url.startsWith("/admin")) {
    const adminToken = localStorage.getItem("admin_token");
    if (adminToken) {
      config.headers.Authorization = `Bearer ${adminToken}`;
    }
  } else {
    const recruiterToken = localStorage.getItem("token");
    if (recruiterToken) {
      config.headers.Authorization = `Bearer ${recruiterToken}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      const url = error.config?.url || "";
      // Never redirect on the login endpoints themselves — let the component
      // catch the error and display it to the user.
      const isLoginEndpoint =
        url.includes("/auth/admin/login") || url.includes("/auth/login");

      if (!isLoginEndpoint) {
        if (url.startsWith("/admin")) {
          localStorage.removeItem("admin_token");
          window.location.href = "/admin/login";
        } else if (!url.startsWith("/public")) {
          localStorage.removeItem("token");
          window.location.href = "/recruiter/login";
        }
      }
    }
    return Promise.reject(error);
  },
);

// Public / Job Seeker endpoints
export const publicApi = {
  verifyByPin: (pin) => api.get(`/public/verify/${pin}`),
  verifyByQR: (code) => api.get(`/public/verify/qr/${code}`),
  submitReport: (data) => api.post("/public/report", data),
};

// Recruiter Auth endpoints
export const auth = {
  register: (data) => api.post("/auth/register", data),
  login: (data) => api.post("/auth/login", data),
  adminLogin: (data) => api.post("/auth/admin/login", data),
  verifyEmailToken: (token) => api.post("/auth/verify-email", { token }),
  verifyEmailOtp: (data) => api.post("/auth/verify-email-otp", data),
  resendVerification: (data) => api.post("/auth/resend-verification", data),
};

// Recruiter Verification endpoints
export const verify = {
  verifyEmail: () => api.post("/verify/email"),
  verifyPhone: (data) => api.post("/verify/phone", data),
  sendPhoneOTP: (data) => api.post("/verify/phone/send-otp", data),
  verifyPhoneOTP: (data) => api.post("/verify/phone/verify-otp", data),
  verifyIdentity: (data) => api.post("/verify/identity", data),
  verifyFace: (data) => api.post("/verify/face", data),
  getStatus: () => api.get("/verify/status"),
};

// Company endpoints
export const company = {
  create: (data) => api.post("/company", data),
  getAll: () => api.get("/company"),
  get: (id) => api.get(`/company/${id}`),
  update: (id, data) => api.put(`/company/${id}`, data),
  verifyCAC: (id) => api.post(`/company/${id}/verify/cac`),
  verifyTIN: (id) => api.post(`/company/${id}/verify/tin`),
  verifyWebsite: (id) => api.post(`/company/${id}/verify/website`),
  getDnsInstructions: (id) =>
    api.get(`/company/${id}/dns-verification-instructions`),
  verifyDns: (id) => api.post(`/company/${id}/verify/dns`),
  sendCorporateEmailOTP: (id, data) =>
    api.post(`/company/${id}/corporate-email/send-otp`, data),
  verifyCorporateEmailOTP: (id, data) =>
    api.post(`/company/${id}/corporate-email/verify-otp`, data),
  // NOTE: was previously calling a non-existent `/verification-status`
  // path (the actual route is `/:id/status`) — this silently 404'd, so the
  // company verification status was never fetchable from the frontend.
  getStatus: (id) => api.get(`/company/${id}/status`),
};

// Job endpoints
export const job = {
  create: (data) => api.post("/job", data),
  getAll: () => api.get("/job"),
  get: (id) => api.get(`/job/${id}`),
  update: (id, data) => api.put(`/job/${id}`, data),
  getVerification: (id) => api.get(`/job/${id}/verification`),
};

// Admin endpoints
export const admin = {
  getQueue: () => api.get("/admin/queue"),
  getQueueItem: (id) => api.get(`/admin/queue/${id}`),
  approveJob: (id) => api.post(`/admin/job/${id}/approve`),
  rejectJob: (id, data) => api.post(`/admin/job/${id}/reject`, data),
  revokeVerification: (id, data) => api.post(`/admin/job/${id}/revoke`, data),
  getReports: () => api.get("/admin/reports"),
  updateReport: (id, data) => api.put(`/admin/report/${id}`, data),
  getAuditLogs: (params) => api.get("/admin/audit-logs", { params }),
  getStats: () => api.get("/admin/stats"),
  getRecruiters: () => api.get("/admin/recruiters"),
  getRecruiter: (id) => api.get(`/admin/recruiters/${id}`),
};

export default {
  publicApi,
  auth,
  verify,
  company,
  job,
  admin,
};
