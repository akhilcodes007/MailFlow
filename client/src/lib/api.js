/**
 * client/src/lib/api.js
 * Axios instance with JWT authentication and environment-configurable base URL.
 * In dev: proxies /api to http://localhost:5000 via Vite.
 * In production: points to VITE_API_URL or defaults to /api (for reverse proxy/Vercel rewrites).
 */
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT from localStorage on every outgoing request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('mf_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally — clear invalid/expired token and redirect to login (except on public auth routes)
const publicAuthPaths = ['/login', '/signup', '/verify-email', '/forgot-password', '/reset-password'];
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !publicAuthPaths.includes(window.location.pathname)) {
      localStorage.removeItem('mf_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
