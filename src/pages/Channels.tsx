// ============================================================================
// HEKAX Phone - Multi-Channel Management Page
// WhatsApp, Webchat, and other channel integrations
// ============================================================================

import { useState, useEffect } from 'react';
import {
  MessageSquare,
  Phone,
  MessageCircle,
  Globe,
  Settings,
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  ExternalLink,
  Copy,
  Check,
  Bot,
  Users,
  TrendingUp,
  Clock,
} from 'lucide-react';
import { PageHeader } from '../components/layout';
import { Card, StatCard, LoadingSpinner } from '../components/common';
import { api } from '../utils/api';

// Types
interface Channel {
  id: string;
  type: 'WHATSAPP' | 'WEBCHAT' | 'SMS' | 'MESSENGER' | 'TELEGRAM';
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
  greeting?: string;
  aiEnabled: boolean;
  aiPersonality?: string;
  createdAt: string;
}

interface ChannelStats {
  totalConversations: number;
  totalMessages: number;
  byChannel: { channelId: string; count: number }[];
  byStatus: { status: string; count: number }[];
  avgResponseTimeMs: number;
}

const channelIcons: Record<string, typeof MessageSquare> = {
  WHATSAPP: Phone,
  WEBCHAT: Globe,
  SMS: MessageCircle,
  MESSENGER: MessageSquare,
  TELEGRAM: MessageSquare,
};

const channelColors: Record<string, string> = {
  WHATSAPP: 'emerald',
  WEBCHAT: 'blue',
  SMS: 'purple',
  MESSENGER: 'indigo',
  TELEGRAM: 'cyan',
};

export function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [stats, setStats] = useState<ChannelStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [channelsData, statsData] = await Promise.all([
        api.get<{ channels: Channel[] }>('/api/channels'),
        api.get<ChannelStats>('/api/channels/stats/overview').catch(() => null),
      ]);
      setChannels(channelsData.channels);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to fetch channels:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleChannel = async (channel: Channel) => {
    try {
      await api.put(`/api/channels/${channel.id}`, {
        ...channel,
        enabled: !channel.enabled,
      });
      fetchData();
    } catch (err) {
      console.error('Failed to toggle channel:', err);
    }
  };

  const deleteChannel = async (id: string) => {
    if (!confirm('Are you sure you want to delete this channel?')) return;
    try {
      await api.delete(`/api/channels/${id}`);
      fetchData();
    } catch (err) {
      console.error('Failed to delete channel:', err);
    }
  };

  if (loading) {
    return <LoadingSpinner text="Loading channels..." />;
  }

  return (
    <div>
      <PageHeader
        title="Channels"
        subtitle="Manage WhatsApp, Webchat, and other communication channels"
        actions={
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg text-white font-medium hover:from-blue-500 hover:to-purple-500 transition-all"
            >
              <Plus size={18} />
              Add Channel
            </button>
            <button
              onClick={fetchData}
              className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
            >
              <RefreshCw size={18} />
            </button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Conversations"
          value={(stats?.totalConversations || 0).toLocaleString()}
          icon={<MessageSquare size={24} />}
          iconColor="blue"
        />
        <StatCard
          label="Total Messages"
          value={(stats?.totalMessages || 0).toLocaleString()}
          icon={<MessageCircle size={24} />}
          iconColor="purple"
        />
        <StatCard
          label="Active Channels"
          value={channels.filter((c) => c.enabled).length.toString()}
          icon={<TrendingUp size={24} />}
          iconColor="green"
        />
        <StatCard
          label="Avg Response Time"
          value={stats?.avgResponseTimeMs ? `${Math.round(stats.avgResponseTimeMs / 1000)}s` : '0s'}
          icon={<Clock size={24} />}
          iconColor="orange"
        />
      </div>

      {/* Channel Form */}
      {showForm && (
        <ChannelForm
          channel={editingChannel}
          onSave={() => {
            setShowForm(false);
            setEditingChannel(null);
            fetchData();
          }}
          onCancel={() => {
            setShowForm(false);
            setEditingChannel(null);
          }}
        />
      )}

      {/* Channels Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {channels.map((channel) => {
          const Icon = channelIcons[channel.type] || MessageSquare;
          const color = channelColors[channel.type] || 'blue';

          return (
            <Card key={channel.id} className={`border ${channel.enabled ? `border-${color}-500/30` : 'border-slate-700'}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    channel.enabled ? `bg-${color}-500/20` : 'bg-slate-700'
                  }`}>
                    <Icon size={24} className={channel.enabled ? `text-${color}-400` : 'text-slate-400'} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{channel.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        channel.enabled
                          ? `bg-${color}-500/20 text-${color}-400`
                          : 'bg-slate-700 text-slate-400'
                      }`}>
                        {channel.type}
                      </span>
                      <span className={`w-2 h-2 rounded-full ${
                        channel.enabled ? 'bg-emerald-500' : 'bg-slate-500'
                      }`} />
                      <span className="text-xs text-slate-400">
                        {channel.enabled ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleChannel(channel)}
                    className={`p-2 rounded-lg transition-colors ${
                      channel.enabled
                        ? 'text-emerald-400 hover:bg-emerald-500/20'
                        : 'text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    {channel.enabled ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                  </button>
                  <button
                    onClick={() => {
                      setEditingChannel(channel);
                      setShowForm(true);
                    }}
                    className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
                  >
                    <Settings size={18} />
                  </button>
                  <button
                    onClick={() => deleteChannel(channel.id)}
                    className="p-2 hover:bg-red-500/20 rounded-lg text-slate-400 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              {/* Channel Details */}
              <div className="space-y-3">
                {channel.greeting && (
                  <div className="p-3 bg-slate-700/50 rounded-lg">
                    <p className="text-xs text-slate-500 mb-1">Greeting</p>
                    <p className="text-sm text-slate-300">{channel.greeting}</p>
                  </div>
                )}

                <div className="flex items-center justify-between py-2 border-t border-slate-700">
                  <span className="text-sm text-slate-400">AI Enabled</span>
                  <span className={`text-sm font-medium ${channel.aiEnabled ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {channel.aiEnabled ? 'Yes' : 'No'}
                  </span>
                </div>

                {channel.type === 'WEBCHAT' && (
                  <WebchatWidget channelId={channel.id} />
                )}

                {channel.type === 'WHATSAPP' && (
                  <WhatsAppConfig channel={channel} />
                )}
              </div>
            </Card>
          );
        })}

        {channels.length === 0 && (
          <Card className="lg:col-span-2 text-center py-12">
            <MessageSquare size={48} className="mx-auto text-slate-600 mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">No channels configured</h3>
            <p className="text-slate-400 mb-4">Add WhatsApp, Webchat, or other channels to communicate with customers</p>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-medium transition-colors"
            >
              <Plus size={18} />
              Add Your First Channel
            </button>
          </Card>
        )}
      </div>
    </div>
  );
}

// Channel Form Component
interface ChannelFormProps {
  channel: Channel | null;
  onSave: () => void;
  onCancel: () => void;
}

function ChannelForm({ channel, onSave, onCancel }: ChannelFormProps) {
  const [type, setType] = useState<Channel['type']>(channel?.type || 'WEBCHAT');
  const [name, setName] = useState(channel?.name || '');
  const [greeting, setGreeting] = useState(channel?.greeting || '');
  const [aiEnabled, setAiEnabled] = useState(channel?.aiEnabled !== false);
  const [aiPersonality, setAiPersonality] = useState(channel?.aiPersonality || '');
  const [saving, setSaving] = useState(false);

  // WhatsApp specific
  const [whatsappNumber, setWhatsappNumber] = useState(
    (channel?.config as { whatsappNumber?: string })?.whatsappNumber || ''
  );

  // Webchat specific
  const [primaryColor, setPrimaryColor] = useState(
    (channel?.config as { primaryColor?: string })?.primaryColor || '#3b82f6'
  );
  const [position, setPosition] = useState(
    (channel?.config as { position?: string })?.position || 'bottom-right'
  );

  const handleSave = async () => {
    try {
      setSaving(true);

      const config: Record<string, unknown> = {};
      if (type === 'WHATSAPP') {
        config.whatsappNumber = whatsappNumber;
      }
      if (type === 'WEBCHAT') {
        config.primaryColor = primaryColor;
        config.position = position;
      }

      const data = {
        type,
        name: name || `${type.charAt(0)}${type.slice(1).toLowerCase()} Channel`,
        greeting,
        aiEnabled,
        aiPersonality,
        config,
      };

      if (channel) {
        await api.put(`/api/channels/${channel.id}`, data);
      } else {
        await api.post('/api/channels', data);
      }

      onSave();
    } catch (err) {
      console.error('Failed to save channel:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mb-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white">
          {channel ? 'Edit Channel' : 'New Channel'}
        </h3>
        <button onClick={onCancel} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400">
          <X size={20} />
        </button>
      </div>

      <div className="space-y-6">
        {/* Channel Type */}
        {!channel && (
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-3">Channel Type</label>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {(['WEBCHAT', 'WHATSAPP', 'SMS', 'MESSENGER', 'TELEGRAM'] as const).map((t) => {
                const Icon = channelIcons[t];
                const color = channelColors[t];
                return (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`p-4 rounded-xl border transition-all ${
                      type === t
                        ? `border-${color}-500 bg-${color}-500/10`
                        : 'border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <Icon size={24} className={type === t ? `text-${color}-400` : 'text-slate-400'} />
                    <p className={`text-sm mt-2 ${type === t ? 'text-white' : 'text-slate-400'}`}>
                      {t.charAt(0) + t.slice(1).toLowerCase()}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-2">Channel Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Main Website Chat"
            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Greeting */}
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-2">Welcome Greeting</label>
          <textarea
            value={greeting}
            onChange={(e) => setGreeting(e.target.value)}
            placeholder="Hello! How can I help you today?"
            rows={2}
            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>

        {/* AI Settings */}
        <div className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg">
          <div className="flex items-center gap-3">
            <Bot size={20} className="text-purple-400" />
            <div>
              <p className="text-white font-medium">AI Responses</p>
              <p className="text-sm text-slate-400">Enable AI to respond to messages</p>
            </div>
          </div>
          <button
            onClick={() => setAiEnabled(!aiEnabled)}
            className={`p-1 rounded ${aiEnabled ? 'text-emerald-400' : 'text-slate-500'}`}
          >
            {aiEnabled ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
          </button>
        </div>

        {aiEnabled && (
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">AI Personality</label>
            <input
              type="text"
              value={aiPersonality}
              onChange={(e) => setAiPersonality(e.target.value)}
              placeholder="e.g., friendly and professional"
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        )}

        {/* Channel-specific settings */}
        {type === 'WHATSAPP' && (
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">WhatsApp Number</label>
            <input
              type="text"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              placeholder="+1234567890"
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            <p className="text-xs text-slate-500 mt-1">
              Your Twilio WhatsApp-enabled number
            </p>
          </div>
        )}

        {type === 'WEBCHAT' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Widget Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Widget Position</label>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
              >
                <option value="bottom-right">Bottom Right</option>
                <option value="bottom-left">Bottom Left</option>
              </select>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-medium transition-colors disabled:opacity-50"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save size={18} />
                Save Channel
              </>
            )}
          </button>
        </div>
      </div>
    </Card>
  );
}

// Webchat Widget Code Component
function WebchatWidget({ channelId }: { channelId: string }) {
  const [copied, setCopied] = useState(false);

  const embedCode = `<script src="${window.location.origin}/webchat.js" data-channel-id="${channelId}"></script>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-blue-400 font-medium">Widget Embed Code</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <code className="text-xs text-slate-400 break-all">{embedCode}</code>
    </div>
  );
}

// WhatsApp Config Component
function WhatsAppConfig({ channel }: { channel: Channel }) {
  const config = channel.config as { whatsappNumber?: string };

  return (
    <div className="p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs text-emerald-400 font-medium">WhatsApp Number</span>
          <p className="text-sm text-white mt-1">{config.whatsappNumber || 'Not configured'}</p>
        </div>
        <a
          href="https://www.twilio.com/console/sms/whatsapp/sandbox"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300"
        >
          Configure
          <ExternalLink size={12} />
        </a>
      </div>
    </div>
  );
}
