// ============================================================================
// HEKAX Phone - Enterprise Settings Page
// Phase 6.4: BYO Keys & API Keys Management
// ============================================================================

import { useState, useEffect } from 'react';
import {
  Key,
  Shield,
  Check,
  X,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Copy,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Lock,
  Zap,
} from 'lucide-react';
import { PageHeader } from '../components/layout';
import { Card, CardHeader, Button, Badge, Modal } from '../components/common';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';

// Provider configurations
const PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Powers AI conversations',
    icon: '🤖',
    placeholder: 'sk-...',
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    description: 'Text-to-speech voices',
    icon: '🔊',
    placeholder: 'xi-...',
  },
  {
    id: 'deepgram',
    name: 'Deepgram',
    description: 'Speech-to-text transcription',
    icon: '🎙️',
    placeholder: 'dg-...',
  },
];

interface ByoKeysStatus {
  enabled: boolean;
  isEnterprise: boolean;
  validatedAt: string | null;
  keys: {
    [key: string]: {
      configured: boolean;
      masked: string | null;
    };
  };
}

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export function EnterprisePage() {
  const { org } = useAuth();
  const [activeTab, setActiveTab] = useState<'byo-keys' | 'api-keys'>('byo-keys');
  
  // BYO Keys state
  const [byoStatus, setByoStatus] = useState<ByoKeysStatus | null>(null);
  const [loadingByo, setLoadingByo] = useState(true);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [newKey, setNewKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ valid: boolean; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);

  // API Keys state
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loadingApiKeys, setLoadingApiKeys] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newApiKeyName, setNewApiKeyName] = useState('');
  const [newApiKeyPermissions, setNewApiKeyPermissions] = useState<string[]>([]);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Check if enterprise (SCALE and ENTERPRISE have enterprise features)
  const isEnterprise = org?.plan === 'ENTERPRISE' || org?.plan === 'SCALE';

  useEffect(() => {
    fetchByoKeys();
    fetchApiKeys();
  }, []);

  const fetchByoKeys = async () => {
    try {
      const data = await api.get<ByoKeysStatus>('/api/byo-keys');
      setByoStatus(data);
    } catch (err) {
      console.error('Failed to fetch BYO keys:', err);
    } finally {
      setLoadingByo(false);
    }
  };

  const fetchApiKeys = async () => {
    try {
      const data = await api.get<{ apiKeys: ApiKey[]; isEnterprise: boolean }>('/api/api-keys');
      setApiKeys(data.apiKeys || []);
    } catch (err) {
      console.error('Failed to fetch API keys:', err);
    } finally {
      setLoadingApiKeys(false);
    }
  };

  const testKey = async (provider: string) => {
    if (!newKey) return;
    
    setTesting(true);
    setTestResult(null);
    
    try {
      const data = await api.post<{ valid: boolean; error?: string }>(
        `/api/byo-keys/${provider}/test`,
        { apiKey: newKey }
      );
      setTestResult(data);
    } catch (err: any) {
      setTestResult({ valid: false, error: err.message });
    } finally {
      setTesting(false);
    }
  };

  const saveKey = async (provider: string) => {
    if (!newKey) return;
    
    setSaving(true);
    try {
      await api.post(`/api/byo-keys/${provider}`, { apiKey: newKey });
      await fetchByoKeys();
      setEditingProvider(null);
      setNewKey('');
      setTestResult(null);
    } catch (err) {
      console.error('Failed to save key:', err);
    } finally {
      setSaving(false);
    }
  };

  const removeKey = async (provider: string) => {
    if (!confirm('Remove this API key?')) return;
    
    try {
      await api.delete(`/api/byo-keys/${provider}`);
      await fetchByoKeys();
    } catch (err) {
      console.error('Failed to remove key:', err);
    }
  };

  const validateAllKeys = async () => {
    setValidating(true);
    try {
      await api.post('/api/byo-keys/validate-all');
      await fetchByoKeys();
    } catch (err) {
      console.error('Failed to validate keys:', err);
    } finally {
      setValidating(false);
    }
  };

  const toggleByoKeys = async () => {
    try {
      await api.post('/api/byo-keys/toggle', { enabled: !byoStatus?.enabled });
      await fetchByoKeys();
    } catch (err) {
      console.error('Failed to toggle BYO keys:', err);
    }
  };

  const createApiKey = async () => {
    if (!newApiKeyName) return;
    
    setSaving(true);
    try {
      const data = await api.post<{ key: string }>('/api/api-keys', {
        name: newApiKeyName,
        permissions: newApiKeyPermissions,
      });
      setCreatedKey(data.key);
      await fetchApiKeys();
    } catch (err) {
      console.error('Failed to create API key:', err);
    } finally {
      setSaving(false);
    }
  };

  const revokeApiKey = async (id: string) => {
    if (!confirm('Revoke this API key? This cannot be undone.')) return;
    
    try {
      await api.delete(`/api/api-keys/${id}`);
      await fetchApiKeys();
    } catch (err) {
      console.error('Failed to revoke API key:', err);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Non-enterprise view
  if (!isEnterprise) {
    return (
      <div>
        <PageHeader
          title="Enterprise Features"
          description="Advanced features for enterprise customers"
        />

        <Card className="text-center py-12">
          <Lock size={48} className="mx-auto text-slate-600 mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">
            Enterprise Plan Required
          </h3>
          <p className="text-slate-400 mb-6 max-w-md mx-auto">
            BYO Keys and API access are available on the Enterprise plan.
            Upgrade to use your own API keys and access our platform API.
          </p>
          <Button onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'billing' }))}>
            <Zap size={18} />
            Upgrade to Enterprise
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Enterprise Settings"
        description="Manage BYO keys and platform API access"
      />

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('byo-keys')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'byo-keys'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          <Key size={18} className="inline mr-2" />
          BYO Keys
        </button>
        <button
          onClick={() => setActiveTab('api-keys')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'api-keys'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          <Shield size={18} className="inline mr-2" />
          API Keys
        </button>
      </div>

      {/* BYO Keys Tab */}
      {activeTab === 'byo-keys' && (
        <div className="space-y-6">
          {/* Status Card */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  Bring Your Own Keys
                </h3>
                <p className="text-sm text-slate-400">
                  Use your own API keys for AI providers
                </p>
              </div>
              <div className="flex items-center gap-3">
                {byoStatus?.validatedAt && (
                  <span className="text-xs text-slate-500">
                    Validated {new Date(byoStatus.validatedAt).toLocaleDateString()}
                  </span>
                )}
                <Button
                  variant="secondary"
                  onClick={validateAllKeys}
                  disabled={validating}
                >
                  {validating ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  Validate All
                </Button>
                <button
                  onClick={toggleByoKeys}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    byoStatus?.enabled ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      byoStatus?.enabled ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {!byoStatus?.enabled && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg mb-4">
                <p className="text-sm text-amber-400">
                  <AlertTriangle size={16} className="inline mr-2" />
                  BYO Keys is disabled. Your organization is using HEKAX's shared API keys.
                </p>
              </div>
            )}
          </Card>

          {/* Provider Keys */}
          {PROVIDERS.map((provider) => {
            const keyStatus = byoStatus?.keys?.[provider.id];
            const isEditing = editingProvider === provider.id;

            return (
              <Card key={provider.id}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{provider.icon}</span>
                    <div>
                      <h4 className="font-medium text-white">{provider.name}</h4>
                      <p className="text-sm text-slate-400">{provider.description}</p>
                    </div>
                  </div>

                  {!isEditing && (
                    <div className="flex items-center gap-2">
                      {keyStatus?.configured ? (
                        <>
                          <Badge variant="success">Configured</Badge>
                          <code className="text-xs text-slate-500 bg-slate-900 px-2 py-1 rounded">
                            {keyStatus.masked}
                          </code>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setEditingProvider(provider.id);
                              setNewKey('');
                              setTestResult(null);
                            }}
                          >
                            Change
                          </Button>
                          <button
                            onClick={() => removeKey(provider.id)}
                            className="p-2 text-slate-500 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      ) : (
                        <>
                          <Badge variant="warning">Not Set</Badge>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setEditingProvider(provider.id);
                              setNewKey('');
                              setTestResult(null);
                            }}
                          >
                            <Plus size={16} />
                            Add Key
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Edit Form */}
                {isEditing && (
                  <div className="mt-4 p-4 bg-slate-900/50 rounded-lg space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        API Key
                      </label>
                      <div className="relative">
                        <input
                          type={showKey ? 'text' : 'password'}
                          value={newKey}
                          onChange={(e) => setNewKey(e.target.value)}
                          placeholder={provider.placeholder}
                          className="w-full px-4 py-2 pr-20 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey(!showKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                        >
                          {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>

                    {testResult && (
                      <div className={`p-3 rounded-lg ${
                        testResult.valid 
                          ? 'bg-emerald-500/10 border border-emerald-500/20' 
                          : 'bg-red-500/10 border border-red-500/20'
                      }`}>
                        <p className={`text-sm ${testResult.valid ? 'text-emerald-400' : 'text-red-400'}`}>
                          {testResult.valid ? (
                            <><Check size={16} className="inline mr-2" />Key is valid!</>
                          ) : (
                            <><X size={16} className="inline mr-2" />Invalid: {testResult.error}</>
                          )}
                        </p>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => testKey(provider.id)}
                        disabled={!newKey || testing}
                      >
                        {testing && <Loader2 size={16} className="animate-spin" />}
                        Test Key
                      </Button>
                      <Button
                        onClick={() => saveKey(provider.id)}
                        disabled={!newKey || saving || (testResult && !testResult.valid)}
                      >
                        {saving && <Loader2 size={16} className="animate-spin" />}
                        Save Key
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setEditingProvider(null);
                          setNewKey('');
                          setTestResult(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* API Keys Tab */}
      {activeTab === 'api-keys' && (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Platform API Keys"
              description="Access HEKAX Phone data programmatically"
              action={
                <Button onClick={() => {
                  setShowCreateModal(true);
                  setNewApiKeyName('');
                  setNewApiKeyPermissions([]);
                  setCreatedKey(null);
                }}>
                  <Plus size={18} />
                  Create API Key
                </Button>
              }
            />

            {loadingApiKeys ? (
              <div className="flex justify-center py-8">
                <Loader2 size={24} className="animate-spin text-slate-400" />
              </div>
            ) : apiKeys.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                No API keys yet. Create one to get started.
              </div>
            ) : (
              <div className="space-y-3">
                {apiKeys.map((key) => (
                  <div
                    key={key.id}
                    className="flex items-center justify-between p-4 bg-slate-900/50 rounded-lg"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-white">{key.name}</span>
                        <code className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                          {key.keyPrefix}...
                        </code>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span>{key.permissions.length} permissions</span>
                        {key.lastUsedAt && (
                          <span>Last used {new Date(key.lastUsedAt).toLocaleDateString()}</span>
                        )}
                        {key.expiresAt && (
                          <span>Expires {new Date(key.expiresAt).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => revokeApiKey(key.id)}
                      className="p-2 text-slate-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Create API Key Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setCreatedKey(null);
        }}
        title={createdKey ? 'API Key Created' : 'Create API Key'}
        footer={
          createdKey ? (
            <Button onClick={() => {
              setShowCreateModal(false);
              setCreatedKey(null);
            }}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button onClick={createApiKey} disabled={!newApiKeyName || saving}>
                {saving && <Loader2 size={16} className="animate-spin" />}
                Create Key
              </Button>
            </>
          )
        }
      >
        {createdKey ? (
          <div className="space-y-4">
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <p className="text-sm text-amber-400 mb-2">
                <AlertTriangle size={16} className="inline mr-2" />
                Copy this key now — it won't be shown again!
              </p>
            </div>
            
            <div className="relative">
              <code className="block w-full p-4 bg-slate-900 rounded-lg text-sm text-emerald-400 break-all pr-12">
                {createdKey}
              </code>
              <button
                onClick={() => copyToClipboard(createdKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-white transition-colors"
              >
                {copied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Key Name *
              </label>
              <input
                type="text"
                value={newApiKeyName}
                onChange={(e) => setNewApiKeyName(e.target.value)}
                placeholder="e.g. Production API Key"
                className="w-full px-4 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Permissions
              </label>
              <div className="space-y-2">
                {[
                  { id: 'calls:read', name: 'Read Calls' },
                  { id: 'calls:write', name: 'Manage Calls' },
                  { id: 'leads:read', name: 'Read Leads' },
                  { id: 'leads:write', name: 'Manage Leads' },
                  { id: 'transcripts:read', name: 'Read Transcripts' },
                  { id: 'analytics:read', name: 'Read Analytics' },
                ].map((perm) => (
                  <label key={perm.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={newApiKeyPermissions.includes(perm.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setNewApiKeyPermissions([...newApiKeyPermissions, perm.id]);
                        } else {
                          setNewApiKeyPermissions(newApiKeyPermissions.filter(p => p !== perm.id));
                        }
                      }}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-300">{perm.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
