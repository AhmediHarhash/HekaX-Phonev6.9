// ============================================================================
// HEKAX Phone - Settings Page
// Professional SaaS Settings with CRM Integrations
// ============================================================================

import { useState, useRef, useEffect } from 'react';
import {
  Building,
  Volume2,
  Bell,
  Save,
  Check,
  AlertCircle,
  RefreshCw,
  Play,
  Square,
  Loader2,
  Palette,
  Moon,
  Sun,
  Monitor,
  Link,
  ExternalLink,
  Trash2,
  Settings2,
  Webhook,
  Database,
  Shield,
  ChevronRight,
  Zap,
  Globe,
  X,
  Calendar,
  MessageSquare,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/layout';
import { Card, Button } from '../components/common';
import { orgApi, api } from '../utils/api';
import { usePreferences } from '../context/PreferencesContext';

// Voice options with descriptions
const VOICE_OPTIONS = [
  { id: 'nova', name: 'Nova', description: 'Calm & professional', gender: 'female' },
  { id: 'sage', name: 'Sage', description: 'Warm & wise', gender: 'female' },
  { id: 'alloy', name: 'Alloy', description: 'Neutral & balanced', gender: 'neutral' },
  { id: 'echo', name: 'Echo', description: 'Friendly & warm', gender: 'male' },
  { id: 'onyx', name: 'Onyx', description: 'Deep & authoritative', gender: 'male' },
  { id: 'shimmer', name: 'Shimmer', description: 'Soft & gentle', gender: 'female' },
];

// CRM Provider definitions
const CRM_PROVIDERS = [
  {
    id: 'hubspot',
    name: 'HubSpot',
    description: 'Popular CRM for SMBs with free tier',
    color: '#ff7a59',
    features: ['Contacts', 'Deals', 'Tasks', 'Notes'],
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    description: 'Enterprise CRM standard',
    color: '#00a1e0',
    features: ['Leads', 'Contacts', 'Tasks', 'Events'],
  },
  {
    id: 'zoho',
    name: 'Zoho CRM',
    description: 'Affordable CRM for SMBs',
    color: '#e42527',
    features: ['Leads', 'Calls', 'Events', 'Notes'],
  },
  {
    id: 'pipedrive',
    name: 'Pipedrive',
    description: 'Sales-focused CRM',
    color: '#017737',
    features: ['Persons', 'Activities', 'Deals', 'Notes'],
  },
];

// Calendar Provider definitions
const CALENDAR_PROVIDERS = [
  {
    id: 'google',
    name: 'Google Calendar',
    description: 'Sync with your Google Calendar',
    color: '#4285f4',
    features: ['Events', 'Availability', 'Meetings'],
  },
  {
    id: 'outlook',
    name: 'Microsoft Outlook',
    description: 'Sync with Outlook/Office 365',
    color: '#0078d4',
    features: ['Events', 'Availability', 'Teams'],
  },
  {
    id: 'calendly',
    name: 'Calendly',
    description: 'Connect your Calendly account',
    color: '#006bff',
    features: ['Event Types', 'Scheduling', 'Bookings'],
  },
];

// Voice preview cache
const voicePreviewCache: Record<string, string> = {};

type SettingsTab = 'general' | 'ai' | 'integrations' | 'notifications' | 'sms' | 'preferences';

interface CRMIntegration {
  id: string;
  provider: string;
  enabled: boolean;
  syncLeads: boolean;
  syncCalls: boolean;
  syncTranscripts: boolean;
  syncAppointments: boolean;
  lastSyncAt?: string;
  lastSyncStatus?: string;
  connectedBy?: { name: string; email: string };
}

interface CRMProvider {
  id: string;
  name: string;
  description: string;
  connected: boolean;
  enabled: boolean;
  configured: boolean;
}

interface CalendarIntegration {
  id: string;
  provider: string;
  enabled: boolean;
  calendarName?: string;
  defaultDuration?: number;
  lastSyncAt?: string;
  connectedBy?: { name: string; email: string };
}

interface CalendarProvider {
  id: string;
  name: string;
  description: string;
  connected: boolean;
  enabled: boolean;
  configured: boolean;
}

export function SettingsPage() {
  const { org, updateOrg } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form state
  const [greeting, setGreeting] = useState(org?.greeting || '');
  const [aiEnabled, setAiEnabled] = useState(org?.aiEnabled !== false);
  const [voiceId, setVoiceId] = useState(org?.voiceId || 'nova');
  const [slackWebhook, setSlackWebhook] = useState(org?.slackWebhookUrl || '');

  // Voice preview state
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [loadingVoice, setLoadingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Play voice preview
  const playVoicePreview = async (voice: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
      setPlayingVoice(null);
    }

    if (playingVoice === voice) return;

    setLoadingVoice(voice);
    setMessage(null);

    try {
      let audioUrl = voicePreviewCache[voice];

      if (!audioUrl) {
        const response = await api.post<{ audioUrl: string }>('/api/voice/preview', {
          voiceId: voice,
          text: 'Hi, thank you for calling. How may I help you today?',
        });

        if (!response.audioUrl) {
          throw new Error('No audio URL received from server');
        }

        audioUrl = response.audioUrl;
        voicePreviewCache[voice] = audioUrl;
      }

      const audio = new Audio();
      audioRef.current = audio;

      const loadPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Audio loading timeout')), 10000);
        audio.oncanplaythrough = () => { clearTimeout(timeout); resolve(); };
        audio.onerror = () => { clearTimeout(timeout); reject(new Error('Failed to load audio')); };
      });

      audio.onended = () => setPlayingVoice(null);
      audio.src = audioUrl;
      audio.load();

      await loadPromise;
      await audio.play();
      setPlayingVoice(voice);
      setLoadingVoice(null);
    } catch (err) {
      setLoadingVoice(null);
      delete voicePreviewCache[voice];
      const errorMessage = err instanceof Error ? err.message : 'Failed to load voice preview';
      setMessage({ type: 'error', text: errorMessage });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const updated = await orgApi.update({
        greeting,
        aiEnabled,
        voiceId,
        slackWebhookUrl: slackWebhook || undefined,
      });

      updateOrg({ ...org!, ...updated });
      setMessage({ type: 'success', text: 'Settings saved successfully!' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'general', label: 'General', icon: Building },
    { id: 'ai', label: 'AI Receptionist', icon: Volume2 },
    { id: 'integrations', label: 'Integrations', icon: Link },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'sms', label: 'SMS', icon: MessageSquare },
    { id: 'preferences', label: 'Preferences', icon: Palette },
  ] as const;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Settings"
        subtitle="Manage your organization settings and integrations"
      />

      {/* Tabs - Responsive */}
      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg
                font-medium text-sm transition-all
                ${activeTab === tab.id
                  ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/20'
                  : 'bg-slate-800/50 border border-slate-700 text-slate-400 hover:border-blue-500/50 hover:text-slate-200'
                }
              `}
            >
              <Icon size={18} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Message */}
      {message && (
        <div
          className={`
            mb-6 p-4 rounded-xl flex items-center gap-3 animate-slide-in
            ${message.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
              : 'bg-red-500/10 border border-red-500/20 text-red-400'
            }
          `}
        >
          {message.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
          {message.text}
          <button onClick={() => setMessage(null)} className="ml-auto hover:opacity-70" aria-label="Dismiss message">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Settings Content */}
      <Card padding="lg" className="transition-all">
        {/* General Tab */}
        {activeTab === 'general' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Building size={20} className="text-blue-400" />
              Organization Details
            </h3>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Organization Name
              </label>
              <input
                type="text"
                value={org?.name || ''}
                disabled
                className="
                  w-full max-w-md px-4 py-2.5 rounded-lg
                  bg-slate-900/50 border border-slate-700
                  text-slate-400 cursor-not-allowed
                "
              />
              <p className="mt-1.5 text-sm text-slate-500">
                Contact support to change your organization name
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Plan
              </label>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 max-w-md">
                <input
                  type="text"
                  value={org?.plan === 'TRIAL' ? 'Free Trial' : org?.plan || 'Free Trial'}
                  disabled
                  className="
                    w-full sm:flex-1 px-4 py-2.5 rounded-lg
                    bg-slate-900/50 border border-slate-700
                    text-slate-400 cursor-not-allowed
                  "
                />
                {(org?.plan === 'TRIAL' || !org?.plan) && (
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'billing' }))}
                    className="w-full sm:w-auto px-4 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-blue-500/20"
                  >
                    Upgrade
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* AI Tab */}
        {activeTab === 'ai' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Volume2 size={20} className="text-purple-400" />
              AI Receptionist Settings
            </h3>

            {/* AI Enabled Toggle */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 max-w-md p-4 rounded-xl bg-slate-800/30 border border-slate-700/50">
              <div>
                <label className="text-sm font-medium text-white">
                  Enable AI Receptionist
                </label>
                <p className="text-sm text-slate-500">
                  When disabled, calls ring directly to your team
                </p>
              </div>
              <label className="relative inline-block w-12 h-6 cursor-pointer flex-shrink-0">
                <input
                  type="checkbox"
                  checked={aiEnabled}
                  onChange={(e) => setAiEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-12 h-6 rounded-full bg-slate-700 peer-checked:bg-emerald-600 transition-colors" />
                <div className="absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-6" />
              </label>
            </div>

            {/* Greeting */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Greeting Message
              </label>
              <textarea
                value={greeting}
                onChange={(e) => setGreeting(e.target.value)}
                placeholder="Thank you for calling. How may I help you?"
                rows={3}
                className="
                  w-full max-w-md px-4 py-3 rounded-lg
                  bg-slate-900 border border-slate-700
                  text-white placeholder-slate-500
                  focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500
                  resize-none transition-all
                "
              />
              <p className="mt-1.5 text-sm text-slate-500">
                This is the first thing callers will hear
              </p>
            </div>

            {/* Voice Selection */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">
                Voice
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-2xl">
                {VOICE_OPTIONS.map((voice) => (
                  <div
                    key={voice.id}
                    onClick={() => setVoiceId(voice.id)}
                    className={`
                      relative p-4 rounded-xl border cursor-pointer transition-all
                      ${voiceId === voice.id
                        ? 'bg-blue-500/10 border-blue-500 shadow-lg shadow-blue-500/10'
                        : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                      }
                    `}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-white">{voice.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{voice.description}</p>
                        <span className={`
                          inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-full
                          ${voice.gender === 'female' ? 'bg-pink-500/20 text-pink-400' :
                            voice.gender === 'male' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-slate-500/20 text-slate-400'
                          }
                        `}>
                          {voice.gender}
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          playVoicePreview(voice.id);
                        }}
                        disabled={loadingVoice === voice.id}
                        aria-label={loadingVoice === voice.id ? `Loading ${voice.name} preview` : playingVoice === voice.id ? `Stop ${voice.name} preview` : `Play ${voice.name} preview`}
                        className={`
                          w-8 h-8 rounded-full flex items-center justify-center transition-all
                          ${playingVoice === voice.id
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          }
                        `}
                      >
                        {loadingVoice === voice.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : playingVoice === voice.id ? (
                          <Square size={12} fill="currentColor" />
                        ) : (
                          <Play size={14} fill="currentColor" />
                        )}
                      </button>
                    </div>
                    {voiceId === voice.id && (
                      <div className="absolute top-2 right-2">
                        <Check size={14} className="text-blue-400" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Integrations Tab */}
        {activeTab === 'integrations' && <IntegrationsTab setMessage={setMessage} />}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Bell size={20} className="text-orange-400" />
              Notification Settings
            </h3>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Slack Webhook URL
              </label>
              <input
                type="url"
                value={slackWebhook}
                onChange={(e) => setSlackWebhook(e.target.value)}
                placeholder="https://hooks.slack.com/services/..."
                className="
                  w-full max-w-md px-4 py-2.5 rounded-lg
                  bg-slate-900 border border-slate-700
                  text-white placeholder-slate-500
                  focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500
                  transition-all
                "
              />
              <p className="mt-1.5 text-sm text-slate-500">
                Get notified in Slack when you receive new leads
              </p>
            </div>

            <div className="max-w-md p-4 bg-slate-900/50 rounded-xl border border-slate-700">
              <h4 className="text-sm font-medium text-slate-300 mb-3">
                You'll receive notifications for:
              </h4>
              <ul className="space-y-2">
                {[
                  'New leads captured by AI',
                  'Missed calls',
                  'Daily call summary',
                ].map(item => (
                  <li key={item} className="flex items-center gap-2 text-sm text-slate-400">
                    <Check size={16} className="text-emerald-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* SMS Tab */}
        {activeTab === 'sms' && <SMSSettingsTab setMessage={setMessage} />}

        {/* Preferences Tab */}
        {activeTab === 'preferences' && <PreferencesTab />}

        {/* Save Button - Only show for relevant tabs */}
        {(activeTab === 'general' || activeTab === 'ai' || activeTab === 'notifications') && (
          <div className="mt-8 pt-6 border-t border-slate-700">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={18} />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

// ============================================================================
// Integrations Tab Component
// ============================================================================
function IntegrationsTab({ setMessage }: { setMessage: (msg: { type: 'success' | 'error'; text: string } | null) => void }) {
  const [providers, setProviders] = useState<CRMProvider[]>([]);
  const [integrations, setIntegrations] = useState<CRMIntegration[]>([]);
  const [calendarProviders, setCalendarProviders] = useState<CalendarProvider[]>([]);
  const [calendarIntegrations, setCalendarIntegrations] = useState<CalendarIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [savingWebhook, setSavingWebhook] = useState(false);

  // Fetch CRM and Calendar providers and integrations
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [providersRes, integrationsRes, calProvidersRes, calIntegrationsRes] = await Promise.all([
        api.get<{ providers: CRMProvider[] }>('/api/crm/providers'),
        api.get<{ integrations: CRMIntegration[] }>('/api/crm/integrations'),
        api.get<{ providers: CalendarProvider[] }>('/api/calendar/providers').catch(() => ({ providers: [] })),
        api.get<{ integrations: CalendarIntegration[] }>('/api/calendar/integrations').catch(() => ({ integrations: [] })),
      ]);
      setProviders(providersRes.providers || []);
      setIntegrations(integrationsRes.integrations || []);
      setCalendarProviders(calProvidersRes.providers || []);
      setCalendarIntegrations(calIntegrationsRes.integrations || []);
    } catch (err) {
      console.error('Failed to load integration data:', err);
    } finally {
      setLoading(false);
    }
  };

  const connectCRM = async (providerId: string) => {
    if (providerId === 'webhook') {
      setShowWebhookModal(true);
      return;
    }

    setConnecting(providerId);
    try {
      const response = await api.get<{ authUrl: string }>(`/api/crm/connect/${providerId}`);
      if (response.authUrl) {
        window.location.href = response.authUrl;
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      const errorMsg = error?.response?.data?.error || `Failed to connect to ${providerId}`;
      setMessage({ type: 'error', text: errorMsg });
    } finally {
      setConnecting(null);
    }
  };

  const disconnectCRM = async (integrationId: string, providerName: string) => {
    if (!confirm(`Are you sure you want to disconnect ${providerName}?`)) return;

    try {
      await api.delete(`/api/crm/integrations/${integrationId}`);
      setIntegrations(prev => prev.filter(i => i.id !== integrationId));
      setMessage({ type: 'success', text: `${providerName} disconnected` });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to disconnect' });
    }
  };

  const connectCalendar = async (providerId: string) => {
    setConnecting(`cal-${providerId}`);
    try {
      const response = await api.get<{ authUrl: string }>(`/api/calendar/connect/${providerId}`);
      if (response.authUrl) {
        window.location.href = response.authUrl;
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      const errorMsg = error?.response?.data?.error || `Failed to connect to ${providerId}`;
      setMessage({ type: 'error', text: errorMsg });
    } finally {
      setConnecting(null);
    }
  };

  const disconnectCalendar = async (integrationId: string, providerName: string) => {
    if (!confirm(`Are you sure you want to disconnect ${providerName}?`)) return;

    try {
      await api.delete(`/api/calendar/integrations/${integrationId}`);
      setCalendarIntegrations(prev => prev.filter(i => i.id !== integrationId));
      setMessage({ type: 'success', text: `${providerName} disconnected` });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to disconnect' });
    }
  };

  const getCalendarProviderInfo = (providerId: string) => {
    return CALENDAR_PROVIDERS.find(p => p.id === providerId.toLowerCase());
  };

  const saveWebhook = async () => {
    if (!webhookUrl) {
      setMessage({ type: 'error', text: 'Webhook URL is required' });
      return;
    }

    setSavingWebhook(true);
    try {
      await api.post('/api/crm/webhook', {
        webhookUrl,
        secret: webhookSecret || undefined,
        syncLeads: true,
        syncCalls: true,
        syncAppointments: true,
      });
      setMessage({ type: 'success', text: 'Webhook configured successfully' });
      setShowWebhookModal(false);
      setWebhookUrl('');
      setWebhookSecret('');
      fetchData();
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save webhook' });
    } finally {
      setSavingWebhook(false);
    }
  };

  const getProviderInfo = (providerId: string) => {
    return CRM_PROVIDERS.find(p => p.id === providerId.toLowerCase());
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Connected Integrations */}
      {integrations.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Shield size={20} className="text-emerald-400" />
            Connected Integrations
          </h3>
          <div className="space-y-3">
            {integrations.map((integration) => {
              const info = getProviderInfo(integration.provider);
              return (
                <div
                  key={integration.id}
                  className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                      style={{ backgroundColor: info?.color || '#3b82f6' }}
                    >
                      {integration.provider[0]}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">
                          {info?.name || integration.provider}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          integration.enabled
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-slate-500/20 text-slate-400'
                        }`}>
                          {integration.enabled ? 'Active' : 'Disabled'}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {integration.syncLeads && (
                          <span className="text-xs text-slate-500">Leads</span>
                        )}
                        {integration.syncCalls && (
                          <span className="text-xs text-slate-500">Calls</span>
                        )}
                        {integration.syncTranscripts && (
                          <span className="text-xs text-slate-500">Transcripts</span>
                        )}
                        {integration.syncAppointments && (
                          <span className="text-xs text-slate-500">Appointments</span>
                        )}
                      </div>
                      {integration.lastSyncAt && (
                        <p className="text-xs text-slate-500 mt-1">
                          Last sync: {new Date(integration.lastSyncAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {}}
                      className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                      aria-label={`${info?.name || integration.provider} settings`}
                    >
                      <Settings2 size={18} />
                    </button>
                    <button
                      onClick={() => disconnectCRM(integration.id, info?.name || integration.provider)}
                      className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                      aria-label={`Disconnect ${info?.name || integration.provider}`}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Available CRM Providers */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Database size={20} className="text-blue-400" />
          CRM Integrations
        </h3>
        <p className="text-sm text-slate-400 mb-4">
          Connect your CRM to automatically sync leads, calls, and appointments
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {CRM_PROVIDERS.map((provider) => {
            const isConnected = integrations.some(i => i.provider.toLowerCase() === provider.id);
            const apiProvider = providers.find(p => p.id === provider.id);
            const isConfigured = apiProvider?.configured !== false;

            return (
              <div
                key={provider.id}
                className={`
                  p-5 rounded-xl border transition-all
                  ${isConnected
                    ? 'bg-slate-800/30 border-emerald-500/30'
                    : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                  }
                `}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                      style={{ backgroundColor: provider.color }}
                    >
                      {provider.name[0]}
                    </div>
                    <div>
                      <h4 className="font-medium text-white">{provider.name}</h4>
                      <p className="text-xs text-slate-400">{provider.description}</p>
                    </div>
                  </div>
                  {isConnected && (
                    <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400">
                      Connected
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5 mb-4">
                  {provider.features.map(feature => (
                    <span key={feature} className="text-xs px-2 py-0.5 rounded bg-slate-700/50 text-slate-400">
                      {feature}
                    </span>
                  ))}
                </div>

                {!isConnected && (
                  <button
                    onClick={() => connectCRM(provider.id)}
                    disabled={connecting === provider.id || !isConfigured}
                    className={`
                      w-full py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2
                      ${isConfigured
                        ? 'bg-slate-700 hover:bg-slate-600 text-white'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }
                    `}
                  >
                    {connecting === provider.id ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <>
                        <ExternalLink size={16} />
                        {isConfigured ? 'Connect' : 'Not Configured'}
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Calendar Integrations */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Calendar size={20} className="text-emerald-400" />
          Calendar Integrations
        </h3>
        <p className="text-sm text-slate-400 mb-4">
          Connect your calendar for appointment scheduling and availability management
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {CALENDAR_PROVIDERS.map((provider) => {
            const isConnected = calendarIntegrations.some(i => i.provider.toLowerCase() === provider.id);
            const apiProvider = calendarProviders.find(p => p.id === provider.id);
            const isConfigured = apiProvider?.configured !== false;
            const integration = calendarIntegrations.find(i => i.provider.toLowerCase() === provider.id);

            return (
              <div
                key={provider.id}
                className={`
                  p-5 rounded-xl border transition-all
                  ${isConnected
                    ? 'bg-slate-800/30 border-emerald-500/30'
                    : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                  }
                `}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                      style={{ backgroundColor: provider.color }}
                    >
                      {provider.name[0]}
                    </div>
                    <div>
                      <h4 className="font-medium text-white">{provider.name}</h4>
                      <p className="text-xs text-slate-400">{provider.description}</p>
                    </div>
                  </div>
                </div>

                {isConnected && (
                  <div className="mb-3">
                    <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400">
                      Connected
                    </span>
                    {integration?.calendarName && (
                      <p className="text-xs text-slate-500 mt-2">
                        Calendar: {integration.calendarName}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5 mb-4">
                  {provider.features.map(feature => (
                    <span key={feature} className="text-xs px-2 py-0.5 rounded bg-slate-700/50 text-slate-400">
                      {feature}
                    </span>
                  ))}
                </div>

                {isConnected ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {}}
                      className="flex-1 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      <Settings2 size={14} />
                      Settings
                    </button>
                    <button
                      onClick={() => disconnectCalendar(integration!.id, provider.name)}
                      className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                      aria-label={`Disconnect ${provider.name}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => connectCalendar(provider.id)}
                    disabled={connecting === `cal-${provider.id}` || !isConfigured}
                    className={`
                      w-full py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2
                      ${isConfigured
                        ? 'bg-slate-700 hover:bg-slate-600 text-white'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }
                    `}
                  >
                    {connecting === `cal-${provider.id}` ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <>
                        <ExternalLink size={16} />
                        {isConfigured ? 'Connect' : 'Not Configured'}
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Webhook Integration */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Webhook size={20} className="text-purple-400" />
          Custom Webhook
        </h3>
        <p className="text-sm text-slate-400 mb-4">
          Connect any system via Zapier, Make (Integromat), n8n, or your own endpoint
        </p>

        <div className="p-5 rounded-xl bg-slate-800/50 border border-slate-700">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Zap size={20} className="text-white" />
              </div>
              <div>
                <h4 className="font-medium text-white">Custom Webhook</h4>
                <p className="text-xs text-slate-400">Send events to any HTTP endpoint</p>
              </div>
            </div>

            {integrations.some(i => i.provider === 'WEBHOOK') ? (
              <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400">
                Configured
              </span>
            ) : (
              <button
                onClick={() => setShowWebhookModal(true)}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors flex items-center gap-2"
              >
                <Globe size={16} />
                Configure
              </button>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-700">
            <p className="text-xs text-slate-500 mb-2">Supported events:</p>
            <div className="flex flex-wrap gap-2">
              {['lead.captured', 'call.completed', 'appointment.created', 'call.transferred'].map(event => (
                <span key={event} className="text-xs px-2 py-0.5 rounded bg-slate-700/50 text-slate-400 font-mono">
                  {event}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Webhook Modal */}
      {showWebhookModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-md p-6 animate-slide-in">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">Configure Webhook</h3>
              <button
                onClick={() => setShowWebhookModal(false)}
                className="p-2 rounded-lg hover:bg-slate-700 text-slate-400"
                aria-label="Close webhook configuration"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Webhook URL *
                </label>
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://your-endpoint.com/webhook"
                  className="
                    w-full px-4 py-2.5 rounded-lg
                    bg-slate-900 border border-slate-700
                    text-white placeholder-slate-500
                    focus:outline-none focus:border-blue-500
                  "
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Secret (Optional)
                </label>
                <input
                  type="password"
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
                  placeholder="Used for HMAC signature verification"
                  className="
                    w-full px-4 py-2.5 rounded-lg
                    bg-slate-900 border border-slate-700
                    text-white placeholder-slate-500
                    focus:outline-none focus:border-blue-500
                  "
                />
                <p className="mt-1 text-xs text-slate-500">
                  We'll sign payloads with this secret using HMAC-SHA256
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowWebhookModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveWebhook}
                  disabled={savingWebhook || !webhookUrl}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {savingWebhook ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>
                      <Check size={16} />
                      Save
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Preferences Tab Component
// ============================================================================
function PreferencesTab() {
  const { preferences, setTheme, setCompactMode, setTimezone } = usePreferences();

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <Palette size={20} className="text-pink-400" />
        User Preferences
      </h3>

      {/* Theme Selection */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-3">
          Theme
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl">
          <button
            onClick={() => setTheme('dark')}
            className={`
              p-4 rounded-xl border transition-all
              ${preferences.theme === 'dark'
                ? 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/10'
                : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
              }
            `}
          >
            <div className="flex items-center justify-center gap-2">
              <Moon size={20} className={preferences.theme === 'dark' ? 'text-blue-400' : 'text-slate-400'} />
              <span className="text-white font-medium">Dark</span>
            </div>
            <p className="text-xs text-slate-500 mt-2">Easier on the eyes</p>
          </button>
          <button
            onClick={() => setTheme('light')}
            className={`
              p-4 rounded-xl border transition-all
              ${preferences.theme === 'light'
                ? 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/10'
                : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
              }
            `}
          >
            <div className="flex items-center justify-center gap-2">
              <Sun size={20} className={preferences.theme === 'light' ? 'text-amber-400' : 'text-slate-400'} />
              <span className="text-white font-medium">Light</span>
            </div>
            <p className="text-xs text-slate-500 mt-2">Clean & bright</p>
          </button>
          <button
            onClick={() => setTheme('system')}
            className={`
              p-4 rounded-xl border transition-all
              ${preferences.theme === 'system'
                ? 'border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/10'
                : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
              }
            `}
          >
            <div className="flex items-center justify-center gap-2">
              <Monitor size={20} className={preferences.theme === 'system' ? 'text-purple-400' : 'text-slate-400'} />
              <span className="text-white font-medium">Enterprise</span>
            </div>
            <p className="text-xs text-slate-500 mt-2">Modern & refined</p>
          </button>
        </div>
      </div>

      {/* Timezone */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Timezone
        </label>
        <select
          value={preferences.timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="
            w-full max-w-md px-4 py-2.5 rounded-lg
            bg-slate-900 border border-slate-700
            text-white
            focus:outline-none focus:border-blue-500
          "
        >
          <option value="America/New_York">Eastern Time (ET)</option>
          <option value="America/Chicago">Central Time (CT)</option>
          <option value="America/Denver">Mountain Time (MT)</option>
          <option value="America/Los_Angeles">Pacific Time (PT)</option>
          <option value="America/Phoenix">Arizona (MST)</option>
          <option value="Pacific/Honolulu">Hawaii (HST)</option>
          <option value="America/Anchorage">Alaska (AKST)</option>
          <option value="Europe/London">London (GMT)</option>
          <option value="Europe/Paris">Paris (CET)</option>
          <option value="Asia/Tokyo">Tokyo (JST)</option>
          <option value="Asia/Dubai">Dubai (GST)</option>
          <option value="Asia/Singapore">Singapore (SGT)</option>
          <option value="Australia/Sydney">Sydney (AEST)</option>
        </select>
        <p className="mt-1.5 text-sm text-slate-500">
          Used for displaying times and scheduling
        </p>
      </div>

      {/* Compact Mode */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 max-w-md p-4 rounded-xl bg-slate-800/50 border border-slate-700">
        <div>
          <label className="text-sm font-medium text-white">
            Compact Mode
          </label>
          <p className="text-sm text-slate-500 mt-0.5">
            Reduce spacing for more content
          </p>
        </div>
        <label className="relative inline-block w-12 h-6 cursor-pointer flex-shrink-0">
          <input
            type="checkbox"
            checked={preferences.compactMode}
            onChange={(e) => setCompactMode(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-12 h-6 rounded-full bg-slate-700 peer-checked:bg-blue-600 transition-colors" />
          <div className="absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-6" />
        </label>
      </div>

      <p className="text-xs text-slate-500 mt-4">
        Preferences are saved automatically to your browser
      </p>
    </div>
  );
}

// ============================================================================
// SMS Settings Tab Component
// ============================================================================

// Industry templates for SMS
const INDUSTRY_TEMPLATES: Record<string, string> = {
  healthcare: "Hi {name}, thank you for calling {company}. If you need to schedule an appointment or have questions, please call us back at {phone}. We're here to help!",
  legal: "Thank you for contacting {company}. If you have additional questions about your case, please call us at {phone}. We appreciate your trust in our firm.",
  realestate: "Hi {name}! Thanks for reaching out to {company}. Ready to find your perfect property? Call us at {phone} or visit our website for listings.",
  automotive: "Thanks for calling {company}! Whether you're looking for service or sales, we're here to help. Call us back at {phone} or stop by the dealership.",
  restaurant: "Thanks for calling {company}! We'd love to serve you. Make a reservation or order online, or call us at {phone}.",
  general: "Thank you for calling {company}. We appreciate your interest! If you have any questions, please don't hesitate to call us back at {phone}.",
};

interface SMSSettings {
  followUpEnabled: boolean;
  followUpTemplate: string;
  missedCallSms: boolean;
  appointmentReminders: boolean;
}

function SMSSettingsTab({ setMessage }: { setMessage: (msg: { type: 'success' | 'error'; text: string } | null) => void }) {
  const { org, updateOrg } = useAuth();
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<SMSSettings>({
    followUpEnabled: false,
    followUpTemplate: INDUSTRY_TEMPLATES[org?.industry || 'general'] || INDUSTRY_TEMPLATES.general,
    missedCallSms: false,
    appointmentReminders: true,
  });

  // Load existing settings
  useEffect(() => {
    if (org?.smsSettings) {
      try {
        const parsed = JSON.parse(org.smsSettings);
        setSettings(prev => ({ ...prev, ...parsed }));
      } catch (e) {
        console.error('Failed to parse SMS settings:', e);
      }
    }
  }, [org?.smsSettings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await orgApi.update({
        smsSettings: JSON.stringify(settings),
      });
      updateOrg({ ...org!, smsSettings: JSON.stringify(settings) });
      setMessage({ type: 'success', text: 'SMS settings saved successfully!' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save SMS settings' });
    } finally {
      setSaving(false);
    }
  };

  const selectTemplate = (industry: string) => {
    setSettings(prev => ({
      ...prev,
      followUpTemplate: INDUSTRY_TEMPLATES[industry] || INDUSTRY_TEMPLATES.general,
    }));
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <MessageSquare size={20} className="text-emerald-400" />
        SMS Settings
      </h3>

      <p className="text-sm text-slate-400 mb-6">
        Configure automatic SMS follow-ups after calls and appointment reminders.
      </p>

      {/* SMS Follow-up Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 max-w-2xl p-4 rounded-xl bg-slate-800/30 border border-slate-700/50">
        <div>
          <label className="text-sm font-medium text-white">
            Call Follow-up SMS
          </label>
          <p className="text-sm text-slate-500">
            Automatically send a thank you SMS after calls
          </p>
        </div>
        <label className="relative inline-block w-12 h-6 cursor-pointer flex-shrink-0">
          <input
            type="checkbox"
            checked={settings.followUpEnabled}
            onChange={(e) => setSettings(prev => ({ ...prev, followUpEnabled: e.target.checked }))}
            className="sr-only peer"
          />
          <div className="w-12 h-6 rounded-full bg-slate-700 peer-checked:bg-emerald-600 transition-colors" />
          <div className="absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-6" />
        </label>
      </div>

      {/* Follow-up Template */}
      {settings.followUpEnabled && (
        <div className="max-w-2xl">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Follow-up Message Template
          </label>

          {/* Quick Templates */}
          <div className="flex flex-wrap gap-2 mb-3">
            <span className="text-xs text-slate-500">Quick templates:</span>
            {Object.keys(INDUSTRY_TEMPLATES).map(industry => (
              <button
                key={industry}
                onClick={() => selectTemplate(industry)}
                className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 capitalize transition-colors"
              >
                {industry}
              </button>
            ))}
          </div>

          <textarea
            value={settings.followUpTemplate}
            onChange={(e) => setSettings(prev => ({ ...prev, followUpTemplate: e.target.value }))}
            rows={4}
            className="
              w-full px-4 py-3 rounded-lg
              bg-slate-900 border border-slate-700
              text-white placeholder-slate-500
              focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500
              resize-none transition-all font-mono text-sm
            "
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="text-xs text-slate-500">Available variables:</span>
            {['{name}', '{company}', '{phone}', '{duration}'].map(variable => (
              <code
                key={variable}
                className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400"
              >
                {variable}
              </code>
            ))}
          </div>
        </div>
      )}

      {/* Missed Call SMS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 max-w-2xl p-4 rounded-xl bg-slate-800/30 border border-slate-700/50">
        <div>
          <label className="text-sm font-medium text-white">
            Missed Call SMS
          </label>
          <p className="text-sm text-slate-500">
            Send SMS when a call is missed or goes to voicemail
          </p>
        </div>
        <label className="relative inline-block w-12 h-6 cursor-pointer flex-shrink-0">
          <input
            type="checkbox"
            checked={settings.missedCallSms}
            onChange={(e) => setSettings(prev => ({ ...prev, missedCallSms: e.target.checked }))}
            className="sr-only peer"
          />
          <div className="w-12 h-6 rounded-full bg-slate-700 peer-checked:bg-emerald-600 transition-colors" />
          <div className="absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-6" />
        </label>
      </div>

      {/* Appointment Reminders */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 max-w-2xl p-4 rounded-xl bg-slate-800/30 border border-slate-700/50">
        <div>
          <label className="text-sm font-medium text-white">
            Appointment Reminders
          </label>
          <p className="text-sm text-slate-500">
            Send SMS reminders before scheduled appointments
          </p>
        </div>
        <label className="relative inline-block w-12 h-6 cursor-pointer flex-shrink-0">
          <input
            type="checkbox"
            checked={settings.appointmentReminders}
            onChange={(e) => setSettings(prev => ({ ...prev, appointmentReminders: e.target.checked }))}
            className="sr-only peer"
          />
          <div className="w-12 h-6 rounded-full bg-slate-700 peer-checked:bg-emerald-600 transition-colors" />
          <div className="absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-6" />
        </label>
      </div>

      {/* SMS Preview */}
      <div className="max-w-2xl p-4 bg-slate-900/50 rounded-xl border border-slate-700">
        <h4 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
          <MessageSquare size={16} />
          Preview
        </h4>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
          <p className="text-sm text-slate-300">
            {settings.followUpTemplate
              .replace(/\{name\}/g, 'John')
              .replace(/\{company\}/g, org?.name || 'Your Company')
              .replace(/\{phone\}/g, org?.twilioNumber || '(555) 123-4567')
              .replace(/\{duration\}/g, '3 minutes')}
          </p>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Estimated SMS segments: {Math.ceil(settings.followUpTemplate.length / 160)}
        </p>
      </div>

      {/* Save Button */}
      <div className="pt-6 border-t border-slate-700">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <RefreshCw size={18} className="animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save size={18} />
              Save SMS Settings
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
