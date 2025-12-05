// ============================================================================
// HEKAX Phone - API Utility
// Enhanced with refresh token support
// ============================================================================

import { API_BASE, STORAGE_KEYS } from './constants';
import type { ApiResponse } from '../types';

// Token refresh state
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

/**
 * Subscribe to token refresh
 */
function subscribeTokenRefresh(callback: (token: string) => void) {
  refreshSubscribers.push(callback);
}

/**
 * Notify all subscribers with new token
 */
function onTokenRefreshed(token: string) {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
}

/**
 * Get authentication headers
 */
export function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Refresh the access token using refresh token
 */
async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);

  if (!refreshToken) {
    return null;
  }

  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      // Refresh token is invalid/expired - clear all auth
      clearAuth();
      return null;
    }

    const data = await response.json();

    // Store new tokens
    localStorage.setItem(STORAGE_KEYS.TOKEN, data.accessToken);
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, data.refreshToken);

    return data.accessToken;
  } catch (error) {
    console.error('Token refresh failed:', error);
    clearAuth();
    return null;
  }
}

/**
 * Clear all auth data and redirect to login
 */
function clearAuth() {
  localStorage.removeItem(STORAGE_KEYS.TOKEN);
  localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.USER);
  localStorage.removeItem(STORAGE_KEYS.ORG);

  // Only redirect if not already on login page
  if (!window.location.pathname.includes('/login')) {
    window.location.href = '/login';
  }
}

/**
 * Handle API response with automatic token refresh
 */
async function handleResponse<T>(response: Response, retryFn?: () => Promise<Response>): Promise<T> {
  // Check if response is JSON
  const contentType = response.headers.get('content-type');

  if (!contentType?.includes('application/json')) {
    const text = await response.text();
    console.error('Non-JSON response:', text.slice(0, 200));
    throw new Error('Server returned an unexpected response. Please check your connection.');
  }

  const data = await response.json();

  // Handle token expiration with automatic refresh
  if (response.status === 401 && data.code === 'TOKEN_EXPIRED' && retryFn) {
    // If already refreshing, wait for it
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        subscribeTokenRefresh(async (newToken) => {
          try {
            const retryResponse = await retryFn();
            const retryData = await handleResponse<T>(retryResponse);
            resolve(retryData);
          } catch (error) {
            reject(error);
          }
        });
      });
    }

    isRefreshing = true;

    try {
      const newToken = await refreshAccessToken();

      if (newToken) {
        isRefreshing = false;
        onTokenRefreshed(newToken);

        // Retry the original request
        const retryResponse = await retryFn();
        return handleResponse<T>(retryResponse);
      }
    } catch (error) {
      isRefreshing = false;
      throw error;
    }

    isRefreshing = false;
  }

  if (response.status === 401) {
    const isAuthRoute = response.url.includes('/auth/login') || response.url.includes('/auth/register');
    if (!isAuthRoute) {
      clearAuth();
    }
    throw new Error(data.error || 'Session expired. Please login again.');
  }

  // Handle account lockout
  if (response.status === 423) {
    throw new Error(data.message || 'Account temporarily locked. Please try again later.');
  }

  // Handle rate limiting
  if (response.status === 429) {
    throw new Error(data.message || 'Too many requests. Please wait and try again.');
  }

  if (!response.ok) {
    throw new Error(data.error || data.message || 'An error occurred');
  }

  return data;
}

/**
 * API client with all methods
 */
export const api = {
  /**
   * GET request
   */
  async get<T>(endpoint: string): Promise<T> {
    const makeRequest = () => fetch(`${API_BASE}${endpoint}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    const response = await makeRequest();
    return handleResponse<T>(response, makeRequest);
  },

  /**
   * POST request
   */
  async post<T>(endpoint: string, body?: unknown): Promise<T> {
    const makeRequest = () => fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });

    const response = await makeRequest();
    return handleResponse<T>(response, makeRequest);
  },

  /**
   * PATCH request
   */
  async patch<T>(endpoint: string, body: unknown): Promise<T> {
    const makeRequest = () => fetch(`${API_BASE}${endpoint}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    });

    const response = await makeRequest();
    return handleResponse<T>(response, makeRequest);
  },

  /**
   * PUT request
   */
  async put<T>(endpoint: string, body: unknown): Promise<T> {
    const makeRequest = () => fetch(`${API_BASE}${endpoint}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    });

    const response = await makeRequest();
    return handleResponse<T>(response, makeRequest);
  },

  /**
   * DELETE request
   */
  async delete<T>(endpoint: string): Promise<T> {
    const makeRequest = () => fetch(`${API_BASE}${endpoint}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    const response = await makeRequest();
    return handleResponse<T>(response, makeRequest);
  },
};

// ============================================================================
// Typed API Functions
// ============================================================================

import type {
  AuthUser,
  AuthOrg,
  CallRecord,
  LeadRecord,
  TranscriptRecord,
  TeamMember,
  DashboardStats,
  PhoneNumber,
} from '../types';

// Auth
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
  organization: AuthOrg;
}

export interface RegisterResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
  organization: AuthOrg;
}

export const authApi = {
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await handleResponse<LoginResponse>(response);

    // Store tokens
    localStorage.setItem(STORAGE_KEYS.TOKEN, data.accessToken);
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, data.refreshToken);

    return data;
  },

  register: async (orgName: string, email: string, password: string, name: string): Promise<RegisterResponse> => {
    const response = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgName, email, password, name }),
    });

    const data = await handleResponse<RegisterResponse>(response);

    // Store tokens
    localStorage.setItem(STORAGE_KEYS.TOKEN, data.accessToken);
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, data.refreshToken);

    return data;
  },

  me: () => api.get<{ user: AuthUser; organization: AuthOrg }>('/auth/me'),

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) {
      // Ignore errors on logout
    }
    clearAuth();
  },

  refresh: () => refreshAccessToken(),
};

// Calls
export interface CallDetailsResponse {
  call: CallRecord;
  lead: LeadRecord | null;
  transcript: TranscriptRecord | null;
}

export const callsApi = {
  list: (params?: { limit?: number; status?: string }) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.status) query.set('status', params.status);
    const queryString = query.toString();
    return api.get<CallRecord[]>(`/api/calls${queryString ? `?${queryString}` : ''}`);
  },

  get: (id: string) => api.get<CallDetailsResponse>(`/api/calls/${id}/details`),
};

// Leads
export const leadsApi = {
  list: (params?: { limit?: number; status?: string; urgency?: string }) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.status) query.set('status', params.status);
    if (params?.urgency) query.set('urgency', params.urgency);
    const queryString = query.toString();
    return api.get<LeadRecord[]>(`/api/leads${queryString ? `?${queryString}` : ''}`);
  },

  get: (id: string) => api.get<LeadRecord>(`/api/leads/${id}`),

  update: (id: string, data: Partial<LeadRecord>) =>
    api.patch<LeadRecord>(`/api/leads/${id}`, data),
};

// Team
export interface InviteResponse {
  message: string;
  user: TeamMember;
  inviteLink?: string;
}

export const teamApi = {
  list: () => api.get<TeamMember[]>('/api/team'),

  invite: (email: string, name: string, role: string) =>
    api.post<InviteResponse>('/api/team/invite', { email, name, role }),

  update: (id: string, data: { role?: string; status?: string }) =>
    api.patch<TeamMember>(`/api/team/${id}`, data),

  remove: (id: string) => api.delete<{ message: string }>(`/api/team/${id}`),
};

// Organization
export const orgApi = {
  get: () => api.get<AuthOrg>('/api/organization'),

  update: (data: Partial<AuthOrg>) => api.patch<AuthOrg>('/api/organization', data),
};

// Stats
export const statsApi = {
  dashboard: () => api.get<DashboardStats>('/api/stats'),
};

// Phone Numbers
export const phoneNumbersApi = {
  list: () => api.get<PhoneNumber[]>('/api/phone-numbers'),

  get: (id: string) => api.get<PhoneNumber>(`/api/phone-numbers/${id}`),

  update: (id: string, data: Partial<PhoneNumber>) =>
    api.patch<PhoneNumber>(`/api/phone-numbers/${id}`, data),
};

// Twilio Token
export const getTwilioToken = async (): Promise<{ token: string; identity: string }> => {
  return api.get('/token');
};
