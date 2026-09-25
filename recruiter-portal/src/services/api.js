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
};

export const verify = {
  verifyEmail: () => api.post('/verify/email'),
  verifyPhone: () => api.post('/verify/phone'),
  verifyIdentity: (data) => api.post('/verify/identity', data),
  verifyFace: (data) => api.post('/verify/face', data),
  getStatus: () => api.get('/verify/status'),
};

export const company = {
  create: (data) => api.post('/companies', data),
  get: (id) => api.get(`/companies/${id}`),
  update: (id, data) => api.put(`/companies/${id}`, data),
  verifyCAC: (id) => api.post(`/companies/${id}/verify-cac`),
  verifyTIN: (id) => api.post(`/companies/${id}/verify-tin`),
  verifyWebsite: (id) => api.post(`/companies/${id}/verify-website`),
  getStatus: (id) => api.get(`/companies/${id}/status`),
};

export const job = {
  create: (data) => api.post('/jobs', data),
  getAll: () => api.get('/jobs'),
  get: (id) => api.get(`/jobs/${id}`),
  update: (id, data) => api.put(`/jobs/${id}`, data),
  getVerification: (id) => api.get(`/jobs/${id}/verification`),
};

export default {
  auth,
  verify,
  company,
  job,
};
