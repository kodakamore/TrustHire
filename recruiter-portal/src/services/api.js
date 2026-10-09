import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const auth = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  // Email activation (registration loop): link-token and 6-digit OTP paths
  verifyEmailToken: (data) => api.post('/auth/verify-email', data),
  verifyEmailOtp: (data) => api.post('/auth/verify-email-otp', data),
  resendVerification: (data) => api.post('/auth/resend-verification', data),
};

export const verify = {
  verifyEmail: () => api.post('/verify/email'),
  // Phone verification is a two-step OTP flow: the backend asks Dojah to
  // deliver a code, then validates the code the recruiter typed in.
  sendPhoneOtp: (data) => api.post('/verify/phone/send-otp', data),
  verifyPhoneOtp: (data) => api.post('/verify/phone/verify-otp', data),
  verifyIdentity: (data) => api.post('/verify/identity', data),
  verifyFace: (data) => api.post('/verify/face', data),
  // Didit-powered face/liveness session flow (Step 4)
  startFaceSession: () => api.post('/verify/face/session'),
  getFaceStatus: () => api.get('/verify/face/status'),
  completeMockFaceSession: (data) => api.post('/verify/face/mock/complete', data),
  // Authenticated image endpoint — must fetch as blob (<img> tags cannot
  // send the Authorization header); caller converts to an object URL.
  getFacePhoto: () => api.get('/verify/face/photo', { responseType: 'blob' }),
  getStatus: () => api.get('/verify/status'),
};

export const company = {
  // Backend mounts these under /api/company (singular) with /:id/verify/<type>
  create: (data) => api.post('/company', data),
  getAll: () => api.get('/company'),
  get: (id) => api.get(`/company/${id}`),
  update: (id, data) => api.put(`/company/${id}`, data),
  verifyCAC: (id) => api.post(`/company/${id}/verify/cac`),
  verifyTIN: (id) => api.post(`/company/${id}/verify/tin`),
  verifyWebsite: (id) => api.post(`/company/${id}/verify/website`),
  getStatus: (id) => api.get(`/company/${id}/status`),
  // Corporate work-email OTP verification (mandatory before posting jobs)
  sendCorporateOtp: (id, data) => api.post(`/company/${id}/corporate-email/send-otp`, data),
  verifyCorporateOtp: (id, data) => api.post(`/company/${id}/corporate-email/verify-otp`, data),
  // DNS TXT domain-ownership proof (strongest ownership signal)
  getDnsInstructions: (id) => api.get(`/company/${id}/dns-verification-instructions`),
  verifyDns: (id) => api.post(`/company/${id}/verify/dns`),
};

export const job = {
  // Backend mounts these under /api/job (singular)
  create: (data) => api.post('/job', data),
  getAll: () => api.get('/job'),
  get: (id) => api.get(`/job/${id}`),
  update: (id, data) => api.put(`/job/${id}`, data),
  getVerification: (id) => api.get(`/job/${id}/verification`),
};

export default {
  auth,
  verify,
  company,
  job,
};
