import axios from 'axios';

const api = axios.create({
  baseURL: '/api/public',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const verifyByPin = async (pin) => {
  const response = await api.get(`/verify/${pin}`);
  return response.data;
};

export const verifyByQR = async (code) => {
  const response = await api.get(`/verify/qr/${code}`);
  return response.data;
};

export const submitReport = async (data) => {
  const response = await api.post('/report', data);
  return response.data;
};

export default api;
