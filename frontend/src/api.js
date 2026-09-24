const BASE_URL = '/api/v1';

export function getAuthToken() {
  return localStorage.getItem('study_token');
}

export function setAuthToken(token) {
  if (token) {
    localStorage.setItem('study_token', token);
  } else {
    localStorage.removeItem('study_token');
  }
}

export function getStoredUser() {
  const u = localStorage.getItem('study_user');
  return u ? JSON.parse(u) : null;
}

export function setStoredUser(user, tenant) {
  if (user) {
    localStorage.setItem('study_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('study_user');
  }
  if (tenant) {
    localStorage.setItem('study_tenant', JSON.stringify(tenant));
  } else {
    localStorage.removeItem('study_tenant');
  }
}

export function getStoredTenant() {
  const t = localStorage.getItem('study_tenant');
  return t ? JSON.parse(t) : null;
}

async function request(endpoint, options = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  let response;
  try {
    response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers,
      signal: options.signal || controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Server request timed out. Please check your connection and try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 401) {
    // If unauthorized, clear storage
    setAuthToken(null);
    setStoredUser(null, null);
    window.dispatchEvent(new Event('auth-unauthorized'));
  }

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = data?.detail || 'An error occurred while processing your request.';
    throw new Error(errorMsg);
  }

  return data;
}

export const api = {
  auth: {
    login: (email, password) =>
      request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    register: (data) =>
      request('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    googleAuth: (credential, extraData = {}) =>
      request('/auth/google', {
        method: 'POST',
        body: JSON.stringify({ credential, ...extraData }),
      }),
    getMe: () => request('/auth/me'),
    getTenant: () => request('/auth/tenant'),
    updateTenant: (data) =>
      request('/auth/tenant', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  },

  dashboard: {
    getSummary: () => request('/dashboard/summary'),
  },

  desks: {
    list: () => request('/desks'),
    getSeatMap: (shiftId, queryDate) => {
      const params = new URLSearchParams();
      if (shiftId) params.append('shift_id', shiftId);
      if (queryDate) params.append('query_date', queryDate);
      return request(`/desks/seat-map?${params.toString()}`);
    },
    create: (data) =>
      request('/desks', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  shifts: {
    list: () => request('/shifts'),
    create: (data) =>
      request('/shifts', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id, data) =>
      request(`/shifts/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id) =>
      request(`/shifts/${id}`, {
        method: 'DELETE',
      }),
  },

  plans: {
    list: () => request('/plans'),
    create: (data) =>
      request('/plans', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id, data) =>
      request(`/plans/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id) =>
      request(`/plans/${id}`, {
        method: 'DELETE',
      }),
  },

  students: {
    list: (params = {}) => {
      const sp = new URLSearchParams();
      if (params.search) sp.append('search', params.search);
      if (params.status) sp.append('status', params.status);
      return request(`/students?${sp.toString()}`);
    },
    get: (id) => request(`/students/${id}`),
    create: (data) =>
      request('/students', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id, data) =>
      request(`/students/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    pause: (id) =>
      request(`/students/${id}/pause`, {
        method: 'POST',
      }),
    resume: (id) =>
      request(`/students/${id}/resume`, {
        method: 'POST',
      }),
    delete: (id) =>
      request(`/students/${id}`, {
        method: 'DELETE',
      }),
  },

  allocations: {
    list: (status = 'active') => request(`/allocations?status_filter=${status}`),
    create: (data) =>
      request('/allocations', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    vacate: (id, notes = '') =>
      request(`/allocations/${id}/vacate`, {
        method: 'POST',
        body: JSON.stringify({ notes }),
      }),
  },

  payments: {
    list: (studentId) => {
      const q = studentId ? `?student_id=${studentId}` : '';
      return request(`/payments${q}`);
    },
    create: (data) =>
      request('/payments', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getReceipt: (id) => request(`/payments/${id}/receipt`),
    getOutstandingDues: () => request('/payments/outstanding-dues'),
  },

  attendance: {
    getToday: () => request('/attendance/today'),
    checkIn: (data) =>
      request('/attendance/check-in', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    checkOut: (attendanceId) =>
      request(`/attendance/check-out/${attendanceId}`, {
        method: 'POST',
      }),
  },

  reminders: {
    trigger: () =>
      request('/reminders/trigger', {
        method: 'POST',
      }),
    getLogs: () => request('/reminders/logs'),
    retry: (logId) =>
      request(`/reminders/retry/${logId}`, {
        method: 'POST',
      }),
  },
};
