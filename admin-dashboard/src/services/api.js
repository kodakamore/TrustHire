import axios from 'axios';

const api = axios.create({
  baseURL: '/api/admin',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

api.interceptors.response.use((response) => {
  return response;
}, (error) => {
  if (error.response && error.response.status === 401) {
    localStorage.removeItem('admin_token');
    window.location.href = '/login';
  }
  return Promise.reject(error);
});

export const adminApi = {
  login: (email, password) => api.post('/login', { email, password }).then(res => res.data),
  getQueue: () => api.get('/queue').then(res => res.data),
  getQueueItem: (id) => api.get(`/queue/${id}`).then(res => res.data),
  approveJob: (id) => api.post(`/queue/${id}/approve`).then(res => res.data),
  rejectJob: (id, reason) => api.post(`/queue/${id}/reject`, { reason }).then(res => res.data),
  revokeVerification: (id, reason) => api.post(`/jobs/${id}/revoke`, { reason }).then(res => res.data),
  getReports: (filters) => api.get('/reports', { params: filters }).then(res => res.data),
  updateReport: (id, data) => api.put(`/reports/${id}`, data).then(res => res.data),
  getAuditLogs: (filters) => api.get('/audit', { params: filters }).then(res => res.data),
  getStats: () => api.get('/stats').then(res => res.data),
};

export default adminApi;
