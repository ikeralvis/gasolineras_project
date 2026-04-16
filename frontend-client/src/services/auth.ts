import axios from 'axios';
import { getAuthToken } from '../api/tokenStore';
import type { RegisterData } from '../types/auth';

const API_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
const http = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

// Inyectar Bearer token en cada petición de axios.
// Mismo motivo que en apiFetch: evitar ITP de Safari en iOS.
http.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token && !config.headers['Authorization']) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

export const authAPI = {
  async register(data: RegisterData) {
    const res = await http.post('/api/usuarios/register', data);
    return res.data;
  },

  async login(data: { email: string; password: string }) {
    const res = await http.post('/api/usuarios/login', data);
    const user = await this.getProfile();
    return { token: res.data?.token, user };
  },

  async getProfile() {
    const res = await http.get('/api/usuarios/me');
    return res.data;
  },

  async logout() {
    await http.post('/api/auth/logout');
  },
};
