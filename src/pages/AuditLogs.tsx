// ============================================================================
// HEKAX Phone - Audit Logs Page
// Phase 5: Multi-tenant SaaS Infrastructure
// ============================================================================

import { useState, useEffect } from 'react';
import { 
  Shield, 
  RefreshCw,
  Filter,
  User,
  Settings,
  Phone,
  Target,
  Clock,
} from 'lucide-react';
import { PageHeader } from '../components/layout';
import { Card, LoadingSpinner, EmptyState, Badge } from '../components/common';
import { api } from '../utils/api';
import { formatDateTime, formatRelativeTime } from '../utils/formatters';

interface AuditLog {
  id: string;
  actorType: string;
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

interface AuditLogsResponse {
  logs: AuditLog[];
  total: number;
  hasMore: boolean;
}

const ACTION_LABELS: Record<string, { label: string; icon: typeof User; color: string }> = {
  'user.login': { label: 'Login', icon: User, color: 'blue' },
  'user.logout': { label: 'Logout', icon: User, color: 'slate' },
  'user.password_change': { label: 'Password Change', icon: Shield, color: 'amber' },
  'team.invite': { label: 'Team Invite', icon: User, color: 'green' },
  'team.update': { label: 'Team Update', icon: User, color: 'purple' },
  'team.remove': { label: 'Team Remove', icon: User, color: 'red' },
  'organization.update': { label: 'Org Update', icon: Settings, color: 'blue' },
  'organization.settings': { label: 'Settings Change', icon: Settings, color: 'purple' },
  'phone.add': { label: 'Number Added', icon: Phone, color: 'green' },
  'phone.update': { label: 'Number Update', icon: Phone, color: 'blue' },
  'phone.remove': { label: 'Number Removed', icon: Phone, color: 'red' },
  'lead.update': { label: 'Lead Update', icon: Target, color: 'blue' },
  'lead.assign': { label: 'Lead Assigned', icon: Target, color: 'purple' },
  'lead.status': { label: 'Lead Status', icon: Target, color: 'amber' },
};

export function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<string>('');

  useEffect(() => {
    fetchLogs(0);
  }, [filter]);

  const fetchLogs = async (newOffset: number) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('offset', newOffset.toString());
      params.set('limit', '50');
      if (filter) params.set('action', filter);

      const data = await api.get<AuditLogsResponse>(`/api/audit-logs?${params}`);
      
      if (newOffset === 0) {
        setLogs(data.logs);
      } else {
        setLogs(prev => [...prev, ...data.logs]);
      }
      
      setTotal(data.total);
      setHasMore(data.hasMore);
      setOffset(newOffset);
    } catch (err) {
      console.error('Audit logs fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getActionInfo = (action: string) => {
    return ACTION_LABELS[action] || { 
      label: action.replace(/\./g, ' ').replace(/_/g, ' '), 
      icon: Clock, 
      color: 'slate' 
    };
  };

  const getColorClasses = (color: string) => {
    const colors: Record<string, string> = {
      blue: 'bg-blue-500/10 text-blue-400',
      green: 'bg-emerald-500/10 text-emerald-400',
      red: 'bg-red-500/10 text-red-400',
      amber: 'bg-amber-500/10 text-amber-400',
      purple: 'bg-purple-500/10 text-purple-400',
      slate: 'bg-slate-500/10 text-slate-400',
    };
    return colors[color] || colors.slate;
  };

  if (loading && logs.length === 0) {
    return <LoadingSpinner text="Loading audit logs..." />;
  }

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        subtitle={`${total} events recorded`}
        actions={
          <button 
            onClick={() => fetchLogs(0)}
            className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
          >
            <RefreshCw size={18} />
          </button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setFilter('')}
          className={`
            px-3 py-1.5 rounded-lg text-sm font-medium
            transition-colors
            ${!filter
              ? 'bg-blue-600 text-white'
              : 'bg-slate-800 text-slate-400 hover:text-white'
            }
          `}
        >
          All Events
        </button>
        {Object.entries(ACTION_LABELS).slice(0, 8).map(([action, info]) => (
          <button
            key={action}
            onClick={() => setFilter(action)}
            className={`
              px-3 py-1.5 rounded-lg text-sm font-medium
              transition-colors
              ${filter === action
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
              }
            `}
          >
            {info.label}
          </button>
        ))}
      </div>

      {/* Logs List */}
      {logs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Shield size={24} />}
            title="No audit logs"
            description="Activity will appear here when actions are performed"
          />
        </Card>
      ) : (
        <Card padding="none">
          <div className="divide-y divide-slate-700/50">
            {logs.map(log => {
              const actionInfo = getActionInfo(log.action);
              const Icon = actionInfo.icon;
              
              return (
                <div key={log.id} className="p-4 hover:bg-slate-700/20 transition-colors">
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getColorClasses(actionInfo.color)}`}>
                      <Icon size={18} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-white">{actionInfo.label}</span>
                        <Badge variant="default">{log.entityType}</Badge>
                      </div>
                      <p className="text-sm text-slate-400">
                        {log.actorType === 'system' ? (
                          <span className="text-purple-400">System</span>
                        ) : (
                          <>by <span className="text-blue-400">{log.actorEmail || 'Unknown'}</span></>
                        )}
                        {log.entityId && (
                          <span className="text-slate-500 ml-1">
                            • ID: {log.entityId.slice(0, 8)}...
                          </span>
                        )}
                      </p>
                      
                      {/* Changes preview */}
                      {log.newValues && Object.keys(log.newValues).length > 0 && (
                        <div className="mt-2 p-2 bg-slate-900/50 rounded text-xs text-slate-400 max-w-md truncate">
                          Changed: {Object.keys(log.newValues).join(', ')}
                        </div>
                      )}
                    </div>

                    {/* Timestamp */}
                    <div className="text-right">
                      <p className="text-sm text-slate-400">{formatRelativeTime(log.createdAt)}</p>
                      {log.ipAddress && (
                        <p className="text-xs text-slate-600">{log.ipAddress}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Load More */}
          {hasMore && (
            <div className="p-4 text-center border-t border-slate-700/50">
              <button
                onClick={() => fetchLogs(offset + 50)}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
              >
                {loading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
