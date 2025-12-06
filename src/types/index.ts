// ============================================================================
// HEKAX Phone - Type Definitions
// ============================================================================

// Auth Types
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone?: string;
  avatar?: string;
}

export interface AuthOrg {
  id: string;
  name: string;
  slug: string;
  plan?: Plan;
  status?: OrgStatus;
  // Onboarding
  onboardingCompleted?: boolean;
  industry?: string;
  // AI Config
  aiEnabled?: boolean;
  greeting?: string;
  voiceId?: string;
  voiceProvider?: string;
  personality?: string;
  language?: string;
  // Branding
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  // Twilio
  twilioNumber?: string;
  twilioSubAccountSid?: string;
  // Integrations
  slackWebhookUrl?: string;
  // Usage
  monthlyCallMinutes?: number;
  monthlyAIMinutes?: number;
  usedCallMinutes?: number;
  usedAIMinutes?: number;
  // Settings
  timezone?: string;
  businessHours?: BusinessHours;
  afterHoursMode?: 'ai' | 'voicemail' | 'forward';
  // SMS Settings
  smsSettings?: string; // JSON string
}

export type UserRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'AGENT' | 'VIEWER';
export type OrgStatus = 'ACTIVE' | 'SUSPENDED' | 'TRIAL' | 'CANCELLED' | 'PENDING_SETUP';
export type Plan = 'TRIAL' | 'STARTER' | 'BUSINESS_PRO' | 'SCALE' | 'ENTERPRISE';

export interface BusinessHours {
  [key: string]: { start: string; end: string; enabled: boolean } | undefined;
  mon?: { start: string; end: string; enabled: boolean };
  tue?: { start: string; end: string; enabled: boolean };
  wed?: { start: string; end: string; enabled: boolean };
  thu?: { start: string; end: string; enabled: boolean };
  fri?: { start: string; end: string; enabled: boolean };
  sat?: { start: string; end: string; enabled: boolean };
  sun?: { start: string; end: string; enabled: boolean };
}

// Call Types
export interface CallRecord {
  id: string;
  callSid: string;
  direction: CallDirection;
  fromNumber: string;
  toNumber: string;
  status: CallStatus;
  duration: number | null;
  recordingUrl?: string | null;
  createdAt: string;
  updatedAt?: string;
  handledByAI?: boolean;
  transferredToHuman?: boolean;
  sentiment?: string;
  sentimentScore?: number;
  organizationId?: string;
  organizationName?: string;
  cost?: number;
}

export type CallDirection = 'INBOUND' | 'OUTBOUND';
export type CallStatus = 
  | 'QUEUED' 
  | 'RINGING' 
  | 'IN_PROGRESS' 
  | 'COMPLETED' 
  | 'BUSY' 
  | 'NO_ANSWER' 
  | 'FAILED' 
  | 'CANCELLED' 
  | 'VOICEMAIL';

// Lead Types
export interface LeadRecord {
  id: string;
  callSid: string;
  name: string;
  phone: string;
  email?: string;
  company?: string;
  jobTitle?: string;
  reason: string;
  serviceInterest?: string;
  preferredCallbackTime?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  urgency: LeadUrgency;
  status: LeadStatus;
  score?: number;
  temperature?: LeadTemp;
  notes?: string;
  referralSource?: string;
  assignedToId?: string;
  organizationId?: string;
  createdAt: string;
  updatedAt?: string;
}

export type LeadStatus = 
  | 'NEW' 
  | 'CONTACTED' 
  | 'QUALIFIED' 
  | 'PROPOSAL' 
  | 'NEGOTIATION' 
  | 'WON' 
  | 'LOST' 
  | 'UNQUALIFIED';

export type LeadUrgency = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type LeadTemp = 'HOT' | 'WARM' | 'COLD';

// Transcript Types
export interface TranscriptRecord {
  id: string;
  callSid: string;
  fullText: string;
  messages?: TranscriptMessage[];
  summary?: string;
  sentiment?: string;
  sentimentScore?: number;
  keywords?: string[];
  topics?: string[];
  primaryIntent?: string;
  createdAt: string;
}

export interface TranscriptMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// Team Types
export interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  phone?: string;
  avatar?: string;
  lastLoginAt?: string;
  createdAt: string;
}

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'INVITED' | 'SUSPENDED';

// Dashboard Types
export interface DashboardStats {
  today: {
    calls: number;
    aiHandled: number;
    aiPercent: number;
    leads: number;
    avgDuration: number;
    missedCalls: number;
  };
  week: {
    calls: number;
    leads: number;
  };
  month: {
    calls: number;
  };
  usage?: {
    callMinutes: number;
    aiMinutes: number;
    callMinutesLimit: number;
    aiMinutesLimit: number;
  };
}

// Phone Number Types
export interface PhoneNumber {
  id: string;
  number: string;
  friendlyName?: string;
  twilioSid?: string;
  routeToAI: boolean;
  greeting?: string;
  voiceId?: string;
  status: 'active' | 'inactive' | 'pending';
  organizationId: string;
  createdAt: string;
}

// API Response Types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// Audit Log Types
export interface AuditLog {
  id: string;
  actorType: 'user' | 'system' | 'api';
  actorId?: string;
  actorEmail?: string;
  action: string;
  entityType: string;
  entityId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

// Usage Types
export interface UsageLog {
  id: string;
  type: 'call_minutes' | 'ai_minutes' | 'sms' | 'storage';
  quantity: number;
  unit: string;
  unitCost?: number;
  totalCost?: number;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
}

// Navigation Types
export type Page =
  | 'dashboard'
  | 'calls'
  | 'leads'
  | 'softphone'
  | 'settings'
  | 'team'
  | 'phone-numbers'
  | 'analytics'
  | 'audit-logs'
  | 'billing'
  | 'enterprise'
  | 'data-management'
  | 'ai-training'
  | 'channels'
  | 'automation';

// Twilio Types
export interface TwilioDevice {
  register: () => Promise<void>;
  unregister: () => Promise<void>;
  connect: (options: { params: Record<string, string> }) => Promise<TwilioCall>;
  destroy: () => void;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  state: string;
}

export interface TwilioCall {
  disconnect: () => void;
  mute: (shouldMute: boolean) => void;
  sendDigits: (digits: string) => void;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  status: () => string;
  parameters: {
    From?: string;
    To?: string;
    CallSid?: string;
  };
}
