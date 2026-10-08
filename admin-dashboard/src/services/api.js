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
  // A 401 on the login endpoint simply means bad credentials — never treat it
  // as an expired session (otherwise the login page would reload and swallow
  // the server's error message).
  const isLoginAttempt = (error.config?.url || '').includes('/login');
  if (error.response && error.response.status === 401 && !isLoginAttempt) {
    localStorage.removeItem('admin_token');
    window.location.href = '/login';
  }
  return Promise.reject(error);
});

export const adminApi = {
  // Auth
  login: (email, password) => api.post('/login', { email, password }).then(res => res.data),

  // Review queue
  getQueue: () => api.get('/queue').then(res => res.data),
  getQueueItem: (id) => api.get(`/queue/${id}`).then(res => res.data),
  approveJob: (id) => api.post(`/job/${id}/approve`).then(res => res.data),
  rejectJob: (id, reason) => api.post(`/job/${id}/reject`, { reason }).then(res => res.data),
  revokeVerification: (id, reason) => api.post(`/job/${id}/revoke`, { reason }).then(res => res.data),

  // Reports / investigation workflow
  getReports: (filters) => {
    const params = {};
    if (filters?.status) params.status = filters.status;
    if (filters?.severity) params.severity = filters.severity;
    if (filters?.category) params.category = filters.category;
    if (filters?.finding) params.finding = filters.finding;
    return api.get('/reports', { params }).then(res => res.data);
  },
  getReport: (id) => api.get(`/reports/${id}`).then(res => res.data),
  updateReport: (id, data) => api.put(`/report/${id}`, data).then(res => res.data),
  escalateReport: (id, reason) =>
    api.post(`/reports/${id}/escalate`, reason ? { reason } : {}).then(res => res.data),
  compromiseCode: (id, reason) =>
    api.post(`/reports/${id}/compromise`, reason ? { reason } : {}).then(res => res.data),

  // Super admin only (403 otherwise)
  setRecruiterStatus: (id, data) => api.post(`/recruiters/${id}/status`, data).then(res => res.data),

  // Misc
  getAuditLogs: (filters) => api.get('/audit-logs', { params: filters }).then(res => res.data),
  getStats: () => api.get('/stats').then(res => res.data),
  getRecruiters: (filters) => api.get('/recruiters', { params: filters }).then(res => res.data),
  getRecruiter: (id) => api.get(`/recruiters/${id}`).then(res => res.data),
};

export default adminApi;
