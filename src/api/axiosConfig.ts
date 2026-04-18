import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000/api',
});

// Interceptor لحقن التوكن ومعرف الشركة
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  const tenant = localStorage.getItem('active_tenant_id');
  const tenantId = tenant ? JSON.parse(tenant).id : null;

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (tenantId) {
    config.headers['x-tenant-id'] = tenantId; // 👈 هذا هو مفتاح العزل
  }

  return config;
});

export default api;