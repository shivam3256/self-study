// Platform Super Admin API Client

const ADMIN_TOKEN_KEY = 'libma_platform_admin_token';
const ADMIN_INFO_KEY = 'libma_platform_admin_info';

export const getAdminPrefix = () => {
  return import.meta.env.VITE_ADMIN_PATH_PREFIX || '/ops-k7x2q9m4';
};

export const getAdminToken = () => {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setAdminToken = (token) => {
  try {
    if (token) {
      localStorage.setItem(ADMIN_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
    }
  } catch (err) {
    console.error('Failed to save admin token:', err);
  }
};

export const getAdminInfo = () => {
  try {
    const raw = localStorage.getItem(ADMIN_INFO_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const setAdminInfo = (info) => {
  try {
    if (info) {
      localStorage.setItem(ADMIN_INFO_KEY, JSON.stringify(info));
    } else {
      localStorage.removeItem(ADMIN_INFO_KEY);
    }
  } catch (err) {
    console.error('Failed to save admin info:', err);
  }
};

export const clearAdminSession = () => {
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_INFO_KEY);
  } catch (err) {
    console.error('Failed to clear admin session:', err);
  }
};

const getBaseUrl = () => {
  const prefix = getAdminPrefix();
  return `${prefix}/api`;
};

async function adminRequest(endpoint, options = {}) {
  const token = getAdminToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const url = `${getBaseUrl()}${endpoint}`;
  const config = {
    ...options,
    headers,
    credentials: 'include', // for httpOnly refresh cookie
  };

  let response;
  try {
    response = await fetch(url, config);
  } catch (err) {
    throw new Error(err.message || 'Network error connecting to platform server.');
  }

  // 404 indicates invalid session or hidden endpoint
  if (response.status === 404) {
    if (endpoint !== '/auth/login' && endpoint !== '/auth/2fa/verify' && endpoint !== '/auth/2fa/enroll') {
      clearAdminSession();
    }
    const err = new Error('Not Found');
    err.status = 404;
    throw err;
  }

  let data = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const errorMsg = data?.detail || (typeof data === 'string' ? data : 'An unexpected error occurred.');
    const err = new Error(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const adminApi = {
  auth: {
    login: (email, password) =>
      adminRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    enroll2FA: (temp_token, code) =>
      adminRequest('/auth/2fa/enroll', {
        method: 'POST',
        body: JSON.stringify({ temp_token, code }),
      }),
    verify2FA: (temp_token, code) =>
      adminRequest('/auth/2fa/verify', {
        method: 'POST',
        body: JSON.stringify({ temp_token, code }),
      }),
    refresh: () =>
      adminRequest('/auth/refresh', {
        method: 'POST',
      }),
    logout: () =>
      adminRequest('/auth/logout', {
        method: 'POST',
      }),
    getMe: () => adminRequest('/auth/me'),
  },
  dashboard: {
    getMetrics: () => adminRequest('/dashboard'),
  },
  libraries: {
    list: (params = {}) => {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          q.append(k, v);
        }
      });
      const qs = q.toString();
      return adminRequest(`/libraries${qs ? `?${qs}` : ''}`);
    },
    getDetail: (libraryId) => adminRequest(`/libraries/${libraryId}`),
    overrideSubscription: (libraryId, payload) =>
      adminRequest(`/libraries/${libraryId}/subscription`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    clearOverride: (libraryId, reason) =>
      adminRequest(`/libraries/${libraryId}/clear-override`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
  },
  auditLogs: {
    list: (params = {}) => {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          q.append(k, v);
        }
      });
      const qs = q.toString();
      return adminRequest(`/audit-logs${qs ? `?${qs}` : ''}`);
    },
  },
};
