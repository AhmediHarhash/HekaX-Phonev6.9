// ============================================================================
// HEKAX Phone - Settings Page
// ============================================================================

import { useState } from 'react';
import { 
  Building, 
  Volume2, 
  Bell,
  Save,
  Check,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/layout';
import { Card, Button } from '../components/common';
import { orgApi } from '../utils/api';

type SettingsTab = 'general' | 'ai' | 'notifications';

export function SettingsPage() {
  const { org, updateOrg } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form state
  const [greeting, setGreeting] = useState(org?.greeting || '');
  const [aiEnabled, setAiEnabled] = useState(org?.aiEnabled !== false);
  const [slackWebhook, setSlackWebhook] = useState(org?.slackWebhookUrl || '');

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const updated = await orgApi.update({
        greeting,
        aiEnabled,
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
              <input
                type="text"
                value={org?.plan || 'STARTER'}
                disabled
                className="
                  w-full max-w-md px-4 py-2.5 rounded-lg
                  bg-slate-900/50 border border-slate-700
                  text-slate-400 cursor-not-allowed
                "
              />
              <p className="mt-1.5 text-sm text-slate-500">
                Contact sales to upgrade your plan
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
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Voice
              </label>
              <select
                disabled
                className="
                  w-full max-w-md px-4 py-2.5 rounded-lg
                  bg-slate-900/50 border border-slate-700
                  text-slate-400 cursor-not-allowed
                "
              >
                <option>Sarah (Professional Female)</option>
              </select>
              <p className="mt-1.5 text-sm text-slate-500">
                Contact support to change your AI voice
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
