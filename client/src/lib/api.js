/**
 * src/lib/api.js
 * Axios instance that reads NO secrets from env vars.
 * All requests go through the Vite proxy → Express server.
 */
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT from localStorage on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('mf_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally — redirect to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('mf_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
