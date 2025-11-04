import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

export const authAPI = {
  async register(data: { nombre: string; email: string; password: string }) {
    const res = await axios.post(`${API_URL}/api/usuarios/register`, data);
    return res.data;
  },

  async login(data: { email: string; password: string }) {
    const res = await axios.post(`${API_URL}/api/usuarios/login`, data);
    const { token, user } = res.data;
    if (token) localStorage.setItem('authToken', token);
    return { token, user };
  },

  async getProfile() {
    const token = localStorage.getItem('authToken');
    if (!token) throw new Error('No token');
    const res = await axios.get(`${API_URL}/api/usuarios/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  },

  logout() {
    localStorage.removeItem('authToken');
  },
};
