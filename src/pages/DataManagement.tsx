// ============================================================================
// HEKAX Phone - Data Management Page
// Phase 6.5: Data Retention, Cleanup & Export
// ============================================================================

import { useState, useEffect } from 'react';
import {
  Database,
  Trash2,
  Download,
  Clock,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Loader2,
  FileJson,
  FileSpreadsheet,
  Archive,
  Calendar,
  Shield,
} from 'lucide-react';
import { PageHeader } from '../components/layout';
import { Card, CardHeader, Button, Badge, Modal } from '../components/common';
import { api } from '../utils/api';
import { formatRelativeTime } from '../utils/formatters';

interface RetentionSettings {
  retentionEnabled: boolean;
  retentionCallDays: number;
  retentionTranscriptDays: number;
  retentionRecordingDays: number;
  retentionLeadDays: number;
  retentionAuditDays: number;
  lastCleanupAt: string | null;
}

interface CleanupStats {
  settings: RetentionSettings;
  preview: {
    calls: number;
    transcripts: number;
    leads: number;
    auditLogs: number;
  };
  totals: {
    calls: number;
    transcripts: number;
    leads: number;
    auditLogs: number;
  };
  recentCleanups: Array<{
    id: string;
    type: string;
    dataType: string;
    recordsDeleted: number;
    createdAt: string;
    status: string;
  }>;
}

interface ExportRequest {
  id: string;
  type: string;
  status: string;
  format: string;
  fileUrl: string | null;
  fileSize: number | null;
  requestedAt: string;
  completedAt: string | null;
  expiresAt: string | null;
}

const RETENTION_OPTIONS = [
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
  { value: 60, label: '60 days' },
  { value: 90, label: '90 days' },
  { value: 180, label: '6 months' },
  { value: 365, label: '1 year' },
  { value: 730, label: '2 years' },
];

export function DataManagementPage() {
  const [activeTab, setActiveTab] = useState<'retention' | 'export' | 'cleanup'>('retention');
  const [stats, setStats] = useState<CleanupStats | null>(null);
  const [exports, setExports] = useState<ExportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState(false);
  
  // Settings form
  const [settings, setSettings] = useState<RetentionSettings | null>(null);
  
  // Delete confirmation
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [retentionData, exportData] = await Promise.all([
        api.get<CleanupStats>('/api/data/retention'),
        api.get<ExportRequest[]>('/api/data/exports'),
      ]);
      setStats(retentionData);
      setSettings(retentionData.settings);
      setExports(exportData);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await api.patch('/api/data/retention', settings);
      await fetchData();
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setSaving(false);
    }
  };

  const runCleanup = async () => {
    if (!confirm('This will permanently delete data according to retention settings. Continue?')) return;
    
    setRunning(true);
    try {
      await api.post('/api/data/cleanup/run');
      await fetchData();
    } catch (err) {
      console.error('Failed to run cleanup:', err);
    } finally {
      setRunning(false);
    }
  };

  const requestExport = async (type: string, format: string = 'json') => {
    setExporting(true);
    try {
      await api.post('/api/data/exports', { type, format });
      await fetchData();
    } catch (err) {
      console.error('Failed to request export:', err);
    } finally {
      setExporting(false);
    }
  };

  const downloadExport = async (exportReq: ExportRequest) => {
    if (!exportReq.fileUrl) return;
    window.open(exportReq.fileUrl, '_blank');
  };

  const deleteAllData = async () => {
    if (deleteConfirm !== 'DELETE ALL MY DATA') return;
    
    setDeleting(true);
    try {
      await api.post('/api/data/delete-all', { confirmPhrase: deleteConfirm });
      setShowDeleteModal(false);
      setDeleteConfirm('');
      await fetchData();
    } catch (err) {
      console.error('Failed to delete data:', err);
    } finally {
      setDeleting(false);
    }
  };

  const formatBytes = (bytes: number | null) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Data Management" description="Manage data retention, cleanup, and export" />
        <div className="flex justify-center py-12">
          <Loader2 size={32} className="animate-spin text-slate-400" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Data Management"
        description="Control data retention, cleanup old records, and export your data"
      />

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { id: 'retention', label: 'Retention Settings', icon: Clock },
          { id: 'export', label: 'Data Export', icon: Download },
          { id: 'cleanup', label: 'Cleanup History', icon: Trash2 },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Retention Tab */}
      {activeTab === 'retention' && settings && (
        <div className="space-y-6">
          {/* Enable/Disable */}
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">Automatic Data Retention</h3>
                <p className="text-sm text-slate-400">
                  Automatically delete old data to stay compliant and reduce storage
                </p>
              </div>
              <button
                onClick={() => setSettings({ ...settings, retentionEnabled: !settings.retentionEnabled })}
                className={`relative w-14 h-7 rounded-full transition-colors ${
                  settings.retentionEnabled ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
                    settings.retentionEnabled ? 'left-8' : 'left-1'
                  }`}
                />
              </button>
            </div>
          </Card>

          {/* Retention Periods */}
          <Card>
            <CardHeader title="Retention Periods" description="Set how long to keep each type of data" />
            
            <div className="grid gap-4">
              {[
                { key: 'retentionCallDays', label: 'Call Logs', icon: '📞' },
                { key: 'retentionTranscriptDays', label: 'Transcripts', icon: '📝' },
                { key: 'retentionRecordingDays', label: 'Recordings', icon: '🎙️' },
                { key: 'retentionLeadDays', label: 'Closed Leads', icon: '👤' },
                { key: 'retentionAuditDays', label: 'Audit Logs', icon: '🛡️' },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{item.icon}</span>
                    <span className="text-white font-medium">{item.label}</span>
                  </div>
                  <select
                    value={(settings as any)[item.key]}
                    onChange={(e) => setSettings({ ...settings, [item.key]: parseInt(e.target.value) })}
                    disabled={!settings.retentionEnabled}
                    className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
                  >
                    {RETENTION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end">
              <Button onClick={saveSettings} disabled={saving}>
                {saving && <Loader2 size={16} className="animate-spin" />}
                Save Settings
              </Button>
            </div>
          </Card>

          {/* Current Data Overview */}
          {stats && (
            <Card>
              <CardHeader 
                title="Data Overview" 
                description="Records that would be affected by current retention settings"
              />
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Calls', total: stats.totals.calls, toDelete: stats.preview.calls },
                  { label: 'Transcripts', total: stats.totals.transcripts, toDelete: stats.preview.transcripts },
                  { label: 'Leads', total: stats.totals.leads, toDelete: stats.preview.leads },
                  { label: 'Audit Logs', total: stats.totals.auditLogs, toDelete: stats.preview.auditLogs },
                ].map((item) => (
                  <div key={item.label} className="p-4 bg-slate-900/50 rounded-lg">
                    <p className="text-sm text-slate-400">{item.label}</p>
                    <p className="text-2xl font-bold text-white">{item.total.toLocaleString()}</p>
                    {item.toDelete > 0 && (
                      <p className="text-xs text-amber-400 mt-1">
                        {item.toDelete.toLocaleString()} to delete
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-6 flex items-center justify-between p-4 bg-slate-900/50 rounded-lg">
                <div>
                  <p className="text-sm text-slate-400">Last cleanup</p>
                  <p className="text-white">
                    {stats.settings.lastCleanupAt 
                      ? formatRelativeTime(stats.settings.lastCleanupAt)
                      : 'Never'
                    }
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={runCleanup}
                  disabled={running}
                >
                  {running ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  Run Cleanup Now
                </Button>
              </div>
            </Card>
          )}

          {/* Danger Zone */}
          <Card className="border-red-500/20">
            <CardHeader 
              title="Danger Zone" 
              description="Permanently delete all your data"
            />
            
            <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-lg">
              <div className="flex items-start gap-4">
                <AlertTriangle size={24} className="text-red-400 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h4 className="font-medium text-red-400">Delete All Data</h4>
                  <p className="text-sm text-slate-400 mt-1">
                    This will permanently delete all calls, transcripts, leads, and logs. 
                    This action cannot be undone. Use this for GDPR/CCPA compliance requests.
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() => setShowDeleteModal(true)}
                    className="mt-4 border-red-500/50 text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 size={16} />
                    Delete All Data
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Export Tab */}
      {activeTab === 'export' && (
        <div className="space-y-6">
          {/* Export Options */}
          <Card>
            <CardHeader title="Export Your Data" description="Download a copy of your data" />
            
            <div className="grid md:grid-cols-2 gap-4">
              {[
                { type: 'full_export', label: 'Full Export', desc: 'All data in ZIP archive', icon: Archive },
                { type: 'calls_only', label: 'Calls Only', desc: 'Call logs with transcripts', icon: FileJson },
                { type: 'leads_only', label: 'Leads Only', desc: 'All lead records', icon: FileJson },
              ].map((opt) => (
                <div key={opt.type} className="p-4 bg-slate-900/50 rounded-lg">
                  <div className="flex items-center gap-3 mb-3">
                    <opt.icon size={24} className="text-blue-400" />
                    <div>
                      <h4 className="font-medium text-white">{opt.label}</h4>
                      <p className="text-xs text-slate-400">{opt.desc}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => requestExport(opt.type, 'json')}
                      disabled={exporting}
                    >
                      <FileJson size={14} />
                      JSON
                    </Button>
                    {opt.type !== 'full_export' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => requestExport(opt.type, 'csv')}
                        disabled={exporting}
                      >
                        <FileSpreadsheet size={14} />
                        CSV
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Export History */}
          <Card>
            <CardHeader 
              title="Export History" 
              description="Download links expire after 7 days"
              action={
                <Button variant="secondary" onClick={fetchData}>
                  <RefreshCw size={16} />
                  Refresh
                </Button>
              }
            />
            
            {exports.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                No exports yet. Request an export above.
              </div>
            ) : (
              <div className="space-y-3">
                {exports.map((exp) => (
                  <div
                    key={exp.id}
                    className="flex items-center justify-between p-4 bg-slate-900/50 rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        exp.status === 'completed' ? 'bg-emerald-500/10' :
                        exp.status === 'failed' ? 'bg-red-500/10' :
                        'bg-blue-500/10'
                      }`}>
                        {exp.status === 'completed' && <CheckCircle size={20} className="text-emerald-400" />}
                        {exp.status === 'failed' && <AlertTriangle size={20} className="text-red-400" />}
                        {exp.status === 'processing' && <Loader2 size={20} className="text-blue-400 animate-spin" />}
                        {exp.status === 'pending' && <Clock size={20} className="text-slate-400" />}
                        {exp.status === 'expired' && <Clock size={20} className="text-slate-500" />}
                      </div>
                      <div>
                        <p className="font-medium text-white capitalize">
                          {exp.type.replace('_', ' ')}
                        </p>
                        <p className="text-xs text-slate-400">
                          {formatRelativeTime(exp.requestedAt)}
                          {exp.fileSize && ` • ${formatBytes(exp.fileSize)}`}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <Badge
                        variant={
                          exp.status === 'completed' ? 'success' :
                          exp.status === 'failed' ? 'danger' :
                          exp.status === 'expired' ? 'warning' :
                          'default'
                        }
                      >
                        {exp.status}
                      </Badge>
                      
                      {exp.status === 'completed' && exp.fileUrl && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => downloadExport(exp)}
                        >
                          <Download size={14} />
                          Download
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Cleanup History Tab */}
      {activeTab === 'cleanup' && stats && (
        <Card>
          <CardHeader title="Cleanup History" description="Record of past data cleanups" />
          
          {stats.recentCleanups.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              No cleanup history yet.
            </div>
          ) : (
            <div className="space-y-3">
              {stats.recentCleanups.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-4 bg-slate-900/50 rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      log.status === 'completed' ? 'bg-emerald-500/10' : 'bg-red-500/10'
                    }`}>
                      {log.status === 'completed' 
                        ? <CheckCircle size={20} className="text-emerald-400" />
                        : <AlertTriangle size={20} className="text-red-400" />
                      }
                    </div>
                    <div>
                      <p className="font-medium text-white capitalize">
                        {log.type.replace('_', ' ')} Cleanup
                      </p>
                      <p className="text-xs text-slate-400">
                        {formatRelativeTime(log.createdAt)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <p className="text-lg font-bold text-white">
                      {log.recordsDeleted.toLocaleString()}
                    </p>
                    <p className="text-xs text-slate-400">records deleted</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setDeleteConfirm('');
        }}
        title="Delete All Data"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={deleteAllData}
              disabled={deleteConfirm !== 'DELETE ALL MY DATA' || deleting}
              className="bg-red-500 hover:bg-red-600"
            >
              {deleting && <Loader2 size={16} className="animate-spin" />}
              Delete Everything
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-sm text-red-400">
              <AlertTriangle size={16} className="inline mr-2" />
              This action is permanent and cannot be undone!
            </p>
          </div>
          
          <p className="text-slate-300">
            This will permanently delete:
          </p>
          <ul className="list-disc list-inside text-slate-400 text-sm space-y-1">
            <li>All call logs and recordings</li>
            <li>All transcripts</li>
            <li>All leads</li>
            <li>All usage logs and alerts</li>
            <li>All audit logs</li>
          </ul>
          
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Type <code className="text-red-400">DELETE ALL MY DATA</code> to confirm
            </label>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="DELETE ALL MY DATA"
              className="w-full px-4 py-2 rounded-lg bg-slate-900 border border-red-500/50 text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
