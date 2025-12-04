// ============================================================================
// HEKAX Phone - Settings Page
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
  User,
  Palette,
  Moon,
  Sun,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/layout';
import { Card, Button } from '../components/common';
import { orgApi, api } from '../utils/api';

// Voice options with descriptions
const VOICE_OPTIONS = [
  { id: 'nova', name: 'Nova', description: 'Calm & professional', gender: 'female' },
  { id: 'sage', name: 'Sage', description: 'Warm & wise', gender: 'female' },
  { id: 'alloy', name: 'Alloy', description: 'Neutral & balanced', gender: 'neutral' },
  { id: 'echo', name: 'Echo', description: 'Friendly & warm', gender: 'male' },
  { id: 'onyx', name: 'Onyx', description: 'Deep & authoritative', gender: 'male' },
  { id: 'shimmer', name: 'Shimmer', description: 'Soft & gentle', gender: 'female' },
];

// Voice preview cache
const voicePreviewCache: Record<string, string> = {};

type SettingsTab = 'general' | 'ai' | 'notifications' | 'preferences';

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
    // Stop current playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlayingVoice(null);
    }

    // If clicking same voice, just stop
    if (playingVoice === voice) {
      return;
    }

    setLoadingVoice(voice);

    try {
      let audioUrl = voicePreviewCache[voice];

      // If not cached, request from backend
      if (!audioUrl) {
        const response = await api.post<{ audioUrl: string }>('/api/voice/preview', {
          voiceId: voice,
          text: 'Hi, thank you for calling. How may I help you today?',
        });
        audioUrl = response.audioUrl;
        voicePreviewCache[voice] = audioUrl;
      }

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setPlayingVoice(null);
      };

      audio.onerror = () => {
        console.error('Audio playback error');
        setPlayingVoice(null);
        setLoadingVoice(null);
        delete voicePreviewCache[voice];
      };

      await audio.play();
      setPlayingVoice(voice);
      setLoadingVoice(null);
    } catch (err) {
      console.error('Voice preview error:', err);
      setLoadingVoice(null);
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
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'preferences', label: 'Preferences', icon: Palette },
  ] as const;

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Manage your organization settings"
      />

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-4 py-2.5 rounded-lg
                font-medium text-sm transition-colors border
                ${activeTab === tab.id
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-blue-500'
                }
              `}
            >
              <Icon size={18} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Message */}
      {message && (
        <div 
          className={`
            mb-6 p-4 rounded-lg flex items-center gap-3
            ${message.type === 'success' 
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' 
              : 'bg-red-500/10 border border-red-500/20 text-red-400'
            }
          `}
        >
          {message.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
          {message.text}
        </div>
      )}

      {/* Settings Content */}
      <Card>
        {/* General Tab */}
        {activeTab === 'general' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-white mb-4">Organization Details</h3>
            
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
              <div className="flex items-center gap-3 max-w-md">
                <input
                  type="text"
                  value={org?.plan === 'TRIAL' ? 'Free Trial' : org?.plan || 'Free Trial'}
                  disabled
                  className="
                    flex-1 px-4 py-2.5 rounded-lg
                    bg-slate-900/50 border border-slate-700
                    text-slate-400 cursor-not-allowed
                  "
                />
                {(org?.plan === 'TRIAL' || !org?.plan) && (
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'billing' }))}
                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Upgrade
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-sm text-slate-500">
                {org?.plan === 'TRIAL' || !org?.plan
                  ? 'Upgrade to unlock more features and remove trial limitations'
                  : 'Go to Billing page to manage your subscription'
                }
              </p>
            </div>
          </div>
        )}

        {/* AI Tab */}
        {activeTab === 'ai' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-white mb-4">AI Receptionist Settings</h3>
            
            {/* AI Enabled Toggle */}
            <div className="flex items-center justify-between max-w-md">
              <div>
                <label className="text-sm font-medium text-slate-300">
                  Enable AI Receptionist
                </label>
                <p className="text-sm text-slate-500">
                  When disabled, calls will ring directly to your team
                </p>
              </div>
              <label className="relative inline-block w-12 h-6 cursor-pointer">
                <input
                  type="checkbox"
                  checked={aiEnabled}
                  onChange={(e) => setAiEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="
                  w-12 h-6 rounded-full
                  bg-slate-700 peer-checked:bg-emerald-600
                  transition-colors
                " />
                <div className="
                  absolute left-1 top-1 w-4 h-4 rounded-full bg-white
                  transition-transform peer-checked:translate-x-6
                " />
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
                  focus:outline-none focus:border-blue-500
                  resize-none
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
                        ? 'bg-blue-500/10 border-blue-500'
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
                        className={`
                          w-8 h-8 rounded-full flex items-center justify-center
                          transition-colors
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
              <p className="mt-3 text-sm text-slate-500">
                Click the play button to preview each voice
              </p>
            </div>
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-white mb-4">Notification Settings</h3>
            
            {/* Slack Webhook */}
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
                  focus:outline-none focus:border-blue-500
                "
              />
              <p className="mt-1.5 text-sm text-slate-500">
                Get notified in Slack when you receive new leads
              </p>
            </div>

            {/* Notification Preview */}
            <div className="max-w-md p-4 bg-slate-900/50 rounded-lg border border-slate-700">
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

        {/* Preferences Tab */}
        {activeTab === 'preferences' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-white mb-4">User Preferences</h3>

            {/* Theme Selection */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">
                Theme
              </label>
              <div className="flex gap-3 max-w-md">
                <button
                  onClick={() => {
                    document.documentElement.classList.remove('light');
                    localStorage.setItem('theme', 'dark');
                  }}
                  className="flex-1 p-4 rounded-xl border border-slate-700 bg-slate-900 hover:border-blue-500 transition-colors group"
                >
                  <div className="flex items-center justify-center gap-2">
                    <Moon size={20} className="text-slate-400 group-hover:text-blue-400" />
                    <span className="text-white font-medium">Dark</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">Easier on the eyes</p>
                </button>
                <button
                  disabled
                  className="flex-1 p-4 rounded-xl border border-slate-700 bg-slate-800/50 opacity-50 cursor-not-allowed"
                >
                  <div className="flex items-center justify-center gap-2">
                    <Sun size={20} className="text-slate-500" />
                    <span className="text-slate-400 font-medium">Light</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">Coming soon</p>
                </button>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                Light mode will be available in a future update
              </p>
            </div>

            {/* Timezone */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Timezone
              </label>
              <select
                defaultValue="America/New_York"
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
              </select>
              <p className="mt-1.5 text-sm text-slate-500">
                Used for displaying times and scheduling
              </p>
            </div>

            {/* Compact Mode */}
            <div className="flex items-center justify-between max-w-md">
              <div>
                <label className="text-sm font-medium text-slate-300">
                  Compact Mode
                </label>
                <p className="text-sm text-slate-500">
                  Show more content with smaller spacing
                </p>
              </div>
              <label className="relative inline-block w-12 h-6 cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                />
                <div className="
                  w-12 h-6 rounded-full
                  bg-slate-700 peer-checked:bg-blue-600
                  transition-colors
                " />
                <div className="
                  absolute left-1 top-1 w-4 h-4 rounded-full bg-white
                  transition-transform peer-checked:translate-x-6
                " />
              </label>
            </div>

            {/* Sound Effects */}
            <div className="flex items-center justify-between max-w-md">
              <div>
                <label className="text-sm font-medium text-slate-300">
                  Sound Effects
                </label>
                <p className="text-sm text-slate-500">
                  Play sounds for notifications and actions
                </p>
              </div>
              <label className="relative inline-block w-12 h-6 cursor-pointer">
                <input
                  type="checkbox"
                  defaultChecked
                  className="sr-only peer"
                />
                <div className="
                  w-12 h-6 rounded-full
                  bg-slate-700 peer-checked:bg-emerald-600
                  transition-colors
                " />
                <div className="
                  absolute left-1 top-1 w-4 h-4 rounded-full bg-white
                  transition-transform peer-checked:translate-x-6
                " />
              </label>
            </div>
          </div>
        )}

        {/* Save Button */}
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
      </Card>
    </div>
  );
}
