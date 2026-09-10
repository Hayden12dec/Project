import { api } from './api';

export const auth = {
  getUser() {
    const raw = localStorage.getItem('proctor_user');
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  setUser(user) {
    if (user) {
      localStorage.setItem('proctor_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('proctor_user');
    }
  },

  isAuthenticated() {
    return !!api.getToken() && !!this.getUser();
  },

  isAdmin() {
    const user = this.getUser();
    return user?.role === 'admin';
  },

  async login(email, password) {
    const res = await api.post('/auth/login', { email, password });
    api.setToken(res.access_token);
    this.setUser(res.user);
    return res.user;
  },

  async register(data) {
    const res = await api.post('/auth/register', data);
    api.setToken(res.access_token);
    this.setUser(res.user);
    return res.user;
  },

  setSession(res) {
    api.setToken(res.access_token);
    this.setUser(res.user);
  },

  async fetchCurrentProfile() {
    const user = await api.get('/auth/me');
    this.setUser(user);
    return user;
  },

  async updateProfile(data) {
    const res = await api.put('/auth/me', data);
    if (res.access_token) {
      api.setToken(res.access_token);
    }
    if (res.user) {
      this.setUser(res.user);
    }
    return res;
  },

  logout() {
    api.setToken(null);
    this.setUser(null);
    window.location.href = '/login';
  },

  async deleteAccount() {
    const res = await api.delete('/auth/me');
    api.setToken(null);
    this.setUser(null);
    window.location.href = '/login';
    return res;
  }
};
