const API_BASE = (import.meta.env?.VITE_API_URL || '').replace(/\/+$/, '');
const BASE_URL = `${API_BASE}/api/v1`;

export function parseApiError(error) {
  if (!error) return 'An unexpected error occurred.';
  if (typeof error === 'string') return error;

  const detail = error.detail !== undefined ? error.detail : (error.data?.detail !== undefined ? error.data.detail : error);
  if (typeof detail === 'string') return detail;

  if (Array.isArray(detail)) {
    // 422 validation error list from FastAPI
    const messages = detail.map((item) => {
      if (typeof item === 'string') return item;
      if (item?.msg) {
        const cleanMsg = item.msg.replace(/^Value error,\s*/i, '');
        const field = item.loc ? item.loc[item.loc.length - 1] : '';
        if (field && !cleanMsg.toLowerCase().includes(field.toLowerCase())) {
          const fieldLabel = field.replace(/_/g, ' ');
          return `${fieldLabel.charAt(0).toUpperCase() + fieldLabel.slice(1)}: ${cleanMsg}`;
        }
        return cleanMsg;
      }
      return 'Invalid input.';
    });
    return messages.join('. ') || 'Validation failed. Please check your inputs.';
  }

  if (typeof detail === 'object' && detail !== null) {
    if (detail.message && typeof detail.message === 'string') {
      return detail.message;
    }
    if (detail.detail && typeof detail.detail === 'string') {
      return detail.detail;
    }
  }

  if (error.message && typeof error.message === 'string') {
    return error.message;
  }

  return 'An unexpected error occurred. Please try again.';
}

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
  // Never write a stub tenant ({id} only) to localStorage.
  // Full tenant objects must have a name.
  if (tenant && tenant.name) {
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

  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

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
    // If unauthorized, clear storage unless skipAuthEvents is requested
    if (!options.skipAuthEvents) {
      setAuthToken(null);
      setStoredUser(null, null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('auth-unauthorized'));
      }
    }
  }

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = parseApiError(data) || 'An error occurred while processing your request.';
    const error = new Error(errorMsg);
    error.status = response.status;
    error.data = data;
    if (data?.detail !== undefined) {
      error.detail = data.detail;
      if (typeof data.detail === 'object' && data.detail !== null) {
        error.code = data.detail.code;
      }
    }
    const code = typeof data?.detail === 'object' ? data?.detail?.code : data?.detail;
    if (token && response.status === 403 && (code === 'PROFILE_INCOMPLETE' || code === 'EMAIL_NOT_VERIFIED')) {
      if (!options.skipAuthEvents && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth-stage-invalid', { detail: data?.detail }));
      }
    }
    throw error;
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
    signup: (data) =>
      request('/auth/signup', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    register: (data) =>
      request('/auth/signup', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    verifyEmail: (email, code) =>
      request('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ email, code }),
      }),
    resendOtp: (email) =>
      request('/auth/resend-otp', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
    forgotPassword: (email) =>
      request('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
    resetPassword: (email, code, new_password) =>
      request('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email, code, new_password }),
      }),
    googleAuth: (credential) =>
      request('/auth/google', {
        method: 'POST',
        body: JSON.stringify({ credential }),
      }),
    setupWorkspace: (data) =>
      request('/auth/setup-workspace', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getMe: (options = {}) => request('/auth/me', options),
    getTenant: (options = {}) => request('/auth/tenant', options),
    updateTenant: (data) =>
      request('/auth/tenant', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    deleteAccount: () =>
      request('/auth/account', {
        method: 'DELETE',
      }),
  },

  dashboard: {
    getSummary: () => request('/dashboard/summary'),
    getKpiTrends: () => request('/dashboard/kpi-trends'),
    getRevenueTrend: () => request('/dashboard/revenue-trend'),
    getDuesSoon: () => request('/dashboard/dues-soon'),
    getAttendanceTrend: () => request('/dashboard/attendance-trend'),
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
    update: (id, data) =>
      request(`/desks/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id) =>
      request(`/desks/${id}`, {
        method: 'DELETE',
      }),
    onboardingSetup: (floors) =>
      request('/desks/onboarding-setup', {
        method: 'POST',
        body: JSON.stringify({ floors }),
      }),
    bulkAdd: (data) =>
      request('/desks/bulk-add', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    bulkUpdate: (data) =>
      request('/desks/bulk-update', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    listZones: () => request('/desks/zones'),
    renameZone: (old_name, new_name) =>
      request('/desks/zones/rename', {
        method: 'PUT',
        body: JSON.stringify({ old_name, new_name }),
      }),
    deleteZone: (name) =>
      request(`/desks/zones?name=${encodeURIComponent(name)}`, {
        method: 'DELETE',
      }),
    backfill: () =>
      request('/desks/backfill', {
        method: 'POST',
      }),
  },

  seats: {
    getAvailable: (params = {}) => {
      const sp = new URLSearchParams();
      if (params.plan_id) sp.append('plan_id', params.plan_id);
      if (params.shift_id) sp.append('shift_id', params.shift_id);
      if (params.start_date) sp.append('start_date', params.start_date);
      if (params.end_date) sp.append('end_date', params.end_date);
      if (params.zone_id) sp.append('zone_id', params.zone_id);
      if (params.gender) sp.append('gender', params.gender);
      return request(`/seats/available?${sp.toString()}`);
    },
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
    markLeft: (id) =>
      request(`/students/${id}/left`, {
        method: 'POST',
      }),
    delete: (id) =>
      request(`/students/${id}`, {
        method: 'DELETE',
      }),
    downloadTemplate: async () => {
      const token = getAuthToken();
      const response = await fetch(`${BASE_URL}/students/import/template`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!response.ok) {
        throw new Error('Failed to download student import template.');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'student_import_template.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    validateImport: (file) => {
      const formData = new FormData();
      formData.append('file', file);
      return request('/students/import/validate', {
        method: 'POST',
        body: formData,
      });
    },
    confirmImport: (rows) =>
      request('/students/import/confirm', {
        method: 'POST',
        body: JSON.stringify({ rows }),
      }),
  },

  allocations: {
    list: (status = 'active') => request(`/allocations?status_filter=${status}`),
    getAvailableDesks: (params = {}) => {
      const sp = new URLSearchParams();
      if (params.plan_id) sp.append('plan_id', params.plan_id);
      if (params.shift_id) sp.append('shift_id', params.shift_id);
      if (params.start_date) sp.append('start_date', params.start_date);
      if (params.end_date) sp.append('end_date', params.end_date);
      if (params.zone_id) sp.append('zone_id', params.zone_id);
      if (params.gender) sp.append('gender', params.gender);
      if (params.current_student_id) sp.append('current_student_id', params.current_student_id);
      return request(`/allocations/available-desks?${sp.toString()}`);
    },
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
    reassign: (id, data) =>
      request(`/allocations/${id}/reassign`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    replaceOccupant: (id, data) =>
      request(`/allocations/${id}/replace-occupant`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  payments: {
    list: (studentId, paymentType) => {
      const q = new URLSearchParams();
      if (studentId) q.set('student_id', studentId);
      if (paymentType && paymentType !== 'all') q.set('payment_type', paymentType);
      const qs = q.toString() ? `?${q.toString()}` : '';
      return request(`/payments${qs}`);
    },
    create: (data) =>
      request('/payments', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getReceipt: (id) => request(`/payments/${id}/receipt`),
    getOutstandingDues: () => request('/payments/outstanding-dues'),
  },

  lockers: {
    list: (params = {}) => {
      const query = new URLSearchParams();
      if (params.status) query.set('status', params.status);
      if (params.search) query.set('search', params.search);
      const qs = query.toString() ? `?${query.toString()}` : '';
      return request(`/lockers${qs}`);
    },
    getMap: (params = {}) => {
      const query = new URLSearchParams();
      if (params.status) query.set('status', params.status);
      if (params.search) query.set('search', params.search);
      const qs = query.toString() ? `?${query.toString()}` : '';
      return request(`/lockers/map${qs}`);
    },
    getSummary: () => request('/lockers/summary'),
    create: (data) =>
      request('/lockers', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    bulkCreate: (data) =>
      request('/lockers/bulk', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id, data) =>
      request(`/lockers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id) =>
      request(`/lockers/${id}`, {
        method: 'DELETE',
      }),
    assign: (id, data) =>
      request(`/lockers/${id}/assign`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    renew: (id, data) =>
      request(`/lockers/${id}/renew`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    release: (id, data) =>
      request(`/lockers/${id}/release`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    changeStudent: (id, data) =>
      request(`/lockers/${id}/change-student`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getActiveForStudent: (studentId) =>
      request(`/lockers/student/${studentId}/active`),
    combinedPayment: (data) =>
      request('/lockers/combined-payment', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
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

  expenses: {
    list: (params = {}) => {
      const query = new URLSearchParams();
      if (params.month) query.set('month', params.month);
      if (params.year) query.set('year', params.year);
      if (params.category) query.set('category', params.category);
      if (params.search) query.set('search', params.search);
      const qs = query.toString() ? `?${query.toString()}` : '';
      return request(`/expenses${qs}`);
    },
    getSummary: (month, year) => {
      const query = new URLSearchParams();
      if (month) query.set('month', month);
      if (year) query.set('year', year);
      const qs = query.toString() ? `?${query.toString()}` : '';
      return request(`/expenses/summary${qs}`);
    },
    create: (data) =>
      request('/expenses', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id, data) =>
      request(`/expenses/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id) =>
      request(`/expenses/${id}`, {
        method: 'DELETE',
      }),
  },
};
