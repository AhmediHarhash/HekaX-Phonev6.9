// ============================================================================
// HEKAX Phone - Constants
// ============================================================================

// API Configuration
export const API_BASE = import.meta.env.VITE_API_URL || "https://phoneapi.hekax.com";

// Local Storage Keys
export const STORAGE_KEYS = {
  TOKEN: "hekax_token",
  REFRESH_TOKEN: "hekax_refresh_token",
  USER: "hekax_user",
  ORG: "hekax_org",
  THEME: "hekax_theme",
} as const;

// Theme Options
export const THEMES = {
  LIGHT: "light",
  DARK: "dark",
  SYSTEM: "system",
} as const;

// Status Colors
export const STATUS_COLORS = {
  // Lead Status
  NEW: "#3b82f6",
  CONTACTED: "#8b5cf6",
  QUALIFIED: "#10b981",
  PROPOSAL: "#f59e0b",
  NEGOTIATION: "#ec4899",
  WON: "#22c55e",
  LOST: "#ef4444",
  UNQUALIFIED: "#6b7280",
  
  // Urgency
  LOW: "#22c55e",
  MEDIUM: "#eab308",
  HIGH: "#f97316",
  CRITICAL: "#ef4444",
  
  // Call Status
  COMPLETED: "#10b981",
  IN_PROGRESS: "#3b82f6",
  RINGING: "#f59e0b",
  QUEUED: "#6b7280",
  BUSY: "#f97316",
  NO_ANSWER: "#ef4444",
  FAILED: "#ef4444",
  CANCELLED: "#6b7280",
  VOICEMAIL: "#8b5cf6",
} as const;

// User Roles with Labels
export const USER_ROLES = {
  OWNER: { label: "Owner", color: "#f97316" },
  ADMIN: { label: "Admin", color: "#8b5cf6" },
  MANAGER: { label: "Manager", color: "#3b82f6" },
  AGENT: { label: "Agent", color: "#10b981" },
  VIEWER: { label: "Viewer", color: "#6b7280" },
} as const;

// Plans
export const PLANS = {
  STARTER: {
    name: "Starter",
    price: 499,
    callMinutes: 500,
    aiMinutes: 250,
    users: 5,
    phoneNumbers: 1,
  },
  PROFESSIONAL: {
    name: "Professional",
    price: 999,
    callMinutes: 2000,
    aiMinutes: 1000,
    users: 15,
    phoneNumbers: 3,
  },
  BUSINESS: {
    name: "Business",
    price: 1999,
    callMinutes: 5000,
    aiMinutes: 2500,
    users: 50,
    phoneNumbers: 10,
  },
  ENTERPRISE: {
    name: "Enterprise",
    price: null, // Custom
    callMinutes: null, // Unlimited
    aiMinutes: null,
    users: null,
    phoneNumbers: null,
  },
} as const;

// Navigation Items
export const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "LayoutDashboard" },
  { id: "calls", label: "Calls", icon: "PhoneCall" },
  { id: "leads", label: "Leads", icon: "Target" },
  { id: "softphone", label: "Softphone", icon: "Phone" },
  { id: "team", label: "Team", icon: "Users" },
  { id: "settings", label: "Settings", icon: "Settings" },
] as const;

// Default Business Hours
export const DEFAULT_BUSINESS_HOURS = {
  mon: { start: "09:00", end: "17:00", enabled: true },
  tue: { start: "09:00", end: "17:00", enabled: true },
  wed: { start: "09:00", end: "17:00", enabled: true },
  thu: { start: "09:00", end: "17:00", enabled: true },
  fri: { start: "09:00", end: "17:00", enabled: true },
  sat: { start: "10:00", end: "14:00", enabled: false },
  sun: { start: "10:00", end: "14:00", enabled: false },
};

// Twilio Configuration
export const TWILIO_CONFIG = {
  CALLER_ID: "+16204669796",
} as const;

// Pagination
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

// Data Retention (days)
export const RETENTION = {
  RECORDINGS: 90,
  TRANSCRIPTS: 90,
  AUDIT_LOGS: 365,
  APP_LOGS: 7,
} as const;
