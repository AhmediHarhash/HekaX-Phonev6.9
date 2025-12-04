// ============================================================================
// HEKAX Phone - API Utility
// ============================================================================

import { API_BASE, STORAGE_KEYS } from './constants';
import type { ApiResponse } from '../types';

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
 * Handle API response
 */
async function handleResponse<T>(response: Response): Promise<T> {
  // Check if response is JSON
  const contentType = response.headers.get('content-type');
  
  if (!contentType?.includes('application/json')) {
    // Got HTML or other non-JSON response - likely wrong URL or server error
    const text = await response.text();
    console.error('Non-JSON response:', text.slice(0, 200));
    throw new Error('Server returned an unexpected response. Please check your connection.');
  }

  const data = await response.json();

  if (response.status === 401) {
    // Token expired or invalid - clear auth and redirect
    // But only if we're on a protected route (not login/register)
    const isAuthRoute = response.url.includes('/auth/login') || response.url.includes('/auth/register');
    if (!isAuthRoute) {
      localStorage.removeItem(STORAGE_KEYS.TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER);
      localStorage.removeItem(STORAGE_KEYS.ORG);
      window.location.href = '/login';
    }
    throw new Error(data.error || 'Session expired. Please login again.');
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
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse<T>(response);
  },

  /**
   * POST request
   */
  async post<T>(endpoint: string, body?: unknown): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(response);
  },

  /**
   * PATCH request
   */
  async patch<T>(endpoint: string, body: unknown): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    });
    return handleResponse<T>(response);
  },

  /**
   * PUT request
   */
  async put<T>(endpoint: string, body: unknown): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    });
    return handleResponse<T>(response);
  },

  /**
   * DELETE request
   */
  async delete<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse<T>(response);
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
  token: string;
  user: AuthUser;
  organization: AuthOrg;
}

export interface RegisterResponse {
  token: string;
  user: AuthUser;
  organization: AuthOrg;
}

export const authApi = {
  login: (email: string, password: string) =>
    api.post<LoginResponse>('/auth/login', { email, password }),
  
  register: (orgName: string, email: string, password: string, name: string) =>
    api.post<RegisterResponse>('/auth/register', { orgName, email, password, name }),
  
  me: () => api.get<{ user: AuthUser; organization: AuthOrg }>('/auth/me'),
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

// Phone Numbers (Phase 5)
export const phoneNumbersApi = {
  list: () => api.get<PhoneNumber[]>('/api/phone-numbers'),
  
  get: (id: string) => api.get<PhoneNumber>(`/api/phone-numbers/${id}`),
  
  update: (id: string, data: Partial<PhoneNumber>) =>
    api.patch<PhoneNumber>(`/api/phone-numbers/${id}`, data),
};

// Twilio Token (requires auth for per-org token)
export const getTwilioToken = async (): Promise<{ token: string; identity: string }> => {
  const response = await fetch(`${API_BASE}/token`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to get Twilio token' }));
    throw new Error(error.error || 'Failed to get Twilio token');
  }
  return response.json();
};
