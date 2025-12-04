// ============================================================================
// HEKAX Phone - Usage & Analytics Page
// Phase 5: Multi-tenant SaaS Infrastructure
// ============================================================================

import { useState, useEffect } from 'react';
import { 
  BarChart3, 
  TrendingUp,
  Phone,
  Bot,
  Users,
  Clock,
  RefreshCw,
  Calendar,
} from 'lucide-react';
import { PageHeader } from '../components/layout';
import { Card, StatCard, LoadingSpinner } from '../components/common';
import { api } from '../utils/api';

interface UsageStats {
  plan: string;
  callMinutes: {
    used: number;
    limit: number | null;
    percent: number;
  };
  aiMinutes: {
    used: number;
    limit: number | null;
    percent: number;
  };
  users: {
    current: number;
    limit: number | null;
  };
  phoneNumbers: {
    current: number;
    limit: number | null;
  };
  totals: {
    calls: number;
    leads: number;
  };
  resetsAt: string | null;
}

interface UsageBreakdown {
  period: string;
  startDate: string;
  byHandler: { handler: string; callCount: number; totalMinutes: number }[];
  byDirection: { direction: string; callCount: number; totalMinutes: number }[];
}

export function AnalyticsPage() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [breakdown, setBreakdown] = useState<UsageBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');

  useEffect(() => {
    fetchData();
  }, [period]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [usageData, breakdownData] = await Promise.all([
        api.get<UsageStats>('/api/usage'),
        api.get<UsageBreakdown>(`/api/usage/breakdown?period=${period}`),
      ]);
      setStats(usageData);
      setBreakdown(breakdownData);
    } catch (err) {
      console.error('Usage fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner text="Loading analytics..." />;
  }

  const formatLimit = (limit: number | null) => limit === null ? 'Unlimited' : limit.toLocaleString();

  return (
    <div>
      <PageHeader
        title="Usage & Analytics"
        subtitle="Monitor your usage and plan limits"
        actions={
          <button 
            onClick={fetchData}
            className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
          >
            <RefreshCw size={18} />
          </button>
        }
      />

      {/* Plan & Usage Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Call Minutes"
          value={`${stats?.callMinutes.used || 0}`}
          icon={<Phone size={24} />}
          iconColor="blue"
        />
        <StatCard
          label="AI Minutes"
          value={`${stats?.aiMinutes.used || 0}`}
          icon={<Bot size={24} />}
          iconColor="purple"
        />
        <StatCard
          label="Team Members"
          value={`${stats?.users.current || 0}`}
          icon={<Users size={24} />}
          iconColor="green"
        />
        <StatCard
          label="Total Calls"
          value={`${stats?.totals.calls || 0}`}
          icon={<TrendingUp size={24} />}
          iconColor="orange"
        />
      </div>

      {/* Usage Meters */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Call Minutes */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
                <Phone size={20} className="text-blue-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Call Minutes</h3>
                <p className="text-sm text-slate-400">Monthly usage</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-white">
                {stats?.callMinutes.used || 0}
              </p>
              <p className="text-sm text-slate-400">
                of {formatLimit(stats?.callMinutes.limit || null)}
              </p>
            </div>
          </div>
          <div className="w-full h-3 bg-slate-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(stats?.callMinutes.percent || 0, 100)}%` }}
            />
          </div>
          {stats?.callMinutes.percent && stats.callMinutes.percent > 80 && (
            <p className="mt-2 text-sm text-amber-400">
              ⚠️ You've used {stats.callMinutes.percent}% of your monthly limit
            </p>
          )}
        </Card>

        {/* AI Minutes */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center">
                <Bot size={20} className="text-purple-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white">AI Minutes</h3>
                <p className="text-sm text-slate-400">Monthly usage</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-white">
                {stats?.aiMinutes.used || 0}
              </p>
              <p className="text-sm text-slate-400">
                of {formatLimit(stats?.aiMinutes.limit || null)}
              </p>
            </div>
          </div>
          <div className="w-full h-3 bg-slate-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-purple-500 to-purple-400 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(stats?.aiMinutes.percent || 0, 100)}%` }}
            />
          </div>
          {stats?.aiMinutes.percent && stats.aiMinutes.percent > 80 && (
            <p className="mt-2 text-sm text-amber-400">
              ⚠️ You've used {stats.aiMinutes.percent}% of your monthly limit
            </p>
          )}
        </Card>
      </div>

      {/* Period Selector & Breakdown */}
      <Card>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <BarChart3 size={20} className="text-slate-400" />
            <h3 className="font-semibold text-white">Call Breakdown</h3>
          </div>
          <div className="flex gap-2">
            {(['week', 'month', 'year'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`
                  px-3 py-1.5 rounded-lg text-sm font-medium capitalize
                  transition-colors
                  ${period === p
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-400 hover:text-white'
                  }
                `}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* By Handler */}
          <div>
            <h4 className="text-sm font-medium text-slate-400 mb-3">By Handler</h4>
            <div className="space-y-3">
              {breakdown?.byHandler.map(item => (
                <div key={item.handler} className="flex items-center gap-4">
                  <div 
                    className={`w-3 h-3 rounded-full ${
                      item.handler === 'AI' ? 'bg-purple-500' : 'bg-blue-500'
                    }`}
                  />
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-slate-300">{item.handler}</span>
                      <span className="text-sm text-slate-400">
                        {item.callCount} calls • {item.totalMinutes} min
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${
                          item.handler === 'AI' ? 'bg-purple-500' : 'bg-blue-500'
                        }`}
                        style={{ 
                          width: `${(item.callCount / (breakdown?.byHandler.reduce((sum, h) => sum + h.callCount, 0) || 1)) * 100}%` 
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
              {(!breakdown?.byHandler || breakdown.byHandler.length === 0) && (
                <p className="text-sm text-slate-500">No data for this period</p>
              )}
            </div>
          </div>

          {/* By Direction */}
          <div>
            <h4 className="text-sm font-medium text-slate-400 mb-3">By Direction</h4>
            <div className="space-y-3">
              {breakdown?.byDirection.map(item => (
                <div key={item.direction} className="flex items-center gap-4">
                  <div 
                    className={`w-3 h-3 rounded-full ${
                      item.direction === 'INBOUND' ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                  />
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-slate-300 capitalize">
                        {item.direction.toLowerCase()}
                      </span>
                      <span className="text-sm text-slate-400">
                        {item.callCount} calls • {item.totalMinutes} min
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${
                          item.direction === 'INBOUND' ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                        style={{ 
                          width: `${(item.callCount / (breakdown?.byDirection.reduce((sum, d) => sum + d.callCount, 0) || 1)) * 100}%` 
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
              {(!breakdown?.byDirection || breakdown.byDirection.length === 0) && (
                <p className="text-sm text-slate-500">No data for this period</p>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Plan Info */}
      <Card className="mt-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-white mb-1">Current Plan</h3>
            <p className="text-slate-400">
              <span className="text-blue-400 font-semibold">{stats?.plan}</span>
              {stats?.resetsAt && (
                <span className="text-sm ml-2">
                  • Resets {new Date(stats.resetsAt).toLocaleDateString()}
                </span>
              )}
            </p>
          </div>
          <button className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors">
            Upgrade Plan
          </button>
        </div>
      </Card>
    </div>
  );
}
