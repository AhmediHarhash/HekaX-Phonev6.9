// ============================================================================
// HEKAX Phone - Dashboard Page
// ============================================================================

import { useState, useEffect } from 'react';
import { 
  PhoneCall, 
  Target, 
  Clock, 
  TrendingUp,
  PhoneIncoming,
  Phone,
  MessageSquare,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/layout';
import { Card, StatCard, LoadingSpinner, AIBadge, HumanBadge, EmptyState } from '../components/common';
import { callsApi, leadsApi, statsApi } from '../utils/api';
import { formatDuration, formatRelativeTime, getUrgencyColor, getStatusColor } from '../utils/formatters';
import type { CallRecord, LeadRecord, DashboardStats } from '../types';

export function DashboardPage() {
  const { org } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentCalls, setRecentCalls] = useState<CallRecord[]>([]);
  const [recentLeads, setRecentLeads] = useState<LeadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all data in parallel
      const [callsData, leadsData, statsData] = await Promise.allSettled([
        callsApi.list({ limit: 5 }),
        leadsApi.list({ limit: 5 }),
        statsApi.dashboard(),
      ]);

      if (callsData.status === 'fulfilled') {
        setRecentCalls(callsData.value);
      }

      if (leadsData.status === 'fulfilled') {
        setRecentLeads(leadsData.value);
      }

      if (statsData.status === 'fulfilled') {
        setStats(statsData.value);
      } else {
        // Calculate basic stats from calls if stats endpoint fails
        if (callsData.status === 'fulfilled') {
          const calls = callsData.value;
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          const todayCalls = calls.filter(c => new Date(c.createdAt) >= today);
          const aiHandled = todayCalls.filter(c => c.handledByAI);
          
          setStats({
            today: {
              calls: todayCalls.length,
              aiHandled: aiHandled.length,
              aiPercent: todayCalls.length > 0 ? Math.round((aiHandled.length / todayCalls.length) * 100) : 0,
              leads: 0,
              avgDuration: todayCalls.length > 0 
                ? Math.round(todayCalls.reduce((sum, c) => sum + (c.duration || 0), 0) / todayCalls.length)
                : 0,
              missedCalls: todayCalls.filter(c => c.status === 'NO_ANSWER' || c.status === 'BUSY').length,
            },
            week: { calls: calls.length, leads: 0 },
            month: { calls: calls.length },
          });
        }
      }

    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner text="Loading dashboard..." />;
  }

  return (
    <div>
      <PageHeader 
        title="Dashboard" 
        subtitle="Welcome back! Here's what's happening today."
      />

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3 text-red-400">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Calls Today"
          value={stats?.today.calls || 0}
          icon={<PhoneCall size={24} />}
          iconColor="blue"
        />
        <StatCard
          label="AI Handled"
          value={`${stats?.today.aiPercent || 0}%`}
          icon={<TrendingUp size={24} />}
          iconColor="purple"
        />
        <StatCard
          label="New Leads"
          value={stats?.today.leads || 0}
          icon={<Target size={24} />}
          iconColor="green"
        />
        <StatCard
          label="Avg Duration"
          value={formatDuration(stats?.today.avgDuration || 0)}
          icon={<Clock size={24} />}
          iconColor="orange"
        />
      </div>

      {/* Recent Activity Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Recent Calls */}
        <Card padding="none">
          <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PhoneCall size={18} className="text-slate-400" />
              <h3 className="font-semibold text-white">Recent Calls</h3>
            </div>
            <button className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1">
              View All <ChevronRight size={16} />
            </button>
          </div>
          <div className="p-2">
            {recentCalls.length === 0 ? (
              <EmptyState 
                title="No calls yet" 
                description="Calls will appear here when received"
              />
            ) : (
              <div className="space-y-1">
                {recentCalls.map(call => (
                  <div 
                    key={call.id}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-700/30 transition-colors"
                  >
                    <div 
                      className={`
                        w-9 h-9 rounded-full flex items-center justify-center
                        ${call.direction === 'INBOUND' 
                          ? 'bg-emerald-500/10 text-emerald-400' 
                          : 'bg-blue-500/10 text-blue-400'
                        }
                      `}
                    >
                      {call.direction === 'INBOUND' 
                        ? <PhoneIncoming size={16} /> 
                        : <Phone size={16} />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {call.direction === 'INBOUND' ? call.fromNumber : call.toNumber}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatRelativeTime(call.createdAt)} • {formatDuration(call.duration)}
                      </p>
                    </div>
                    {call.handledByAI ? <AIBadge /> : <HumanBadge />}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Recent Leads */}
        <Card padding="none">
          <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target size={18} className="text-slate-400" />
              <h3 className="font-semibold text-white">Recent Leads</h3>
            </div>
            <button className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1">
              View All <ChevronRight size={16} />
            </button>
          </div>
          <div className="p-2">
            {recentLeads.length === 0 ? (
              <EmptyState 
                title="No leads yet" 
                description="Leads will appear here when captured"
              />
            ) : (
              <div className="space-y-1">
                {recentLeads.map(lead => (
                  <div 
                    key={lead.id}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-700/30 transition-colors"
                  >
                    <div 
                      className="w-1 h-8 rounded-full"
                      style={{ backgroundColor: getUrgencyColor(lead.urgency) }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {lead.name}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {lead.reason}
                      </p>
                    </div>
                    <span 
                      className="text-xs font-semibold uppercase"
                      style={{ color: getStatusColor(lead.status) }}
                    >
                      {lead.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* AI Status Card */}
      <Card className="flex items-center gap-4">
        <div 
          className={`w-3 h-3 rounded-full ${org?.aiEnabled ? 'bg-emerald-500' : 'bg-red-500'}`}
        />
        <div className="flex-1">
          <h4 className="font-medium text-white">AI Receptionist</h4>
          <p className="text-sm text-slate-400">
            {org?.aiEnabled ? 'Active and handling calls' : 'Disabled'}
          </p>
        </div>
        <div className="flex items-center gap-2 text-slate-500 text-sm italic">
          <MessageSquare size={16} />
          <span>"{org?.greeting || 'Thank you for calling. How may I help you?'}"</span>
        </div>
      </Card>
    </div>
  );
}
