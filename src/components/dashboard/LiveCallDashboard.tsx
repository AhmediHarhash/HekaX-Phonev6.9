// ============================================================================
// HEKAX Phone - Live Call Dashboard Component
// Real-time call monitoring with WebSocket updates
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Activity,
  Users,
  Clock,
  TrendingUp,
  Zap,
  Wifi,
  WifiOff,
  RefreshCw,
  Volume2,
} from 'lucide-react';
import { Card } from '../common';
import { api } from '../../utils/api';

interface ActiveCall {
  id?: string;
  callSid: string;
  direction: 'INBOUND' | 'OUTBOUND';
  fromNumber: string;
  toNumber: string;
  status: string;
  handledByAI?: boolean;
  startTime?: number;
  elapsedTime?: number;
  createdAt?: string;
}

interface DashboardStats {
  activeCallsNow: number;
  callsToday: number;
  callsLastHour: number;
  aiHandledToday: number;
  aiPercentage: number;
  completedToday: number;
  missedToday: number;
  leadsToday: number;
  avgDurationSeconds: number;
}

interface RecentActivity {
  recentCalls: Array<{
    id: string;
    callSid: string;
    direction: string;
    fromNumber: string;
    status: string;
    duration: number;
    handledByAI: boolean;
    createdAt: string;
  }>;
  recentLeads: Array<{
    id: string;
    name: string;
    phone: string;
    reason: string;
    temperature: string;
    createdAt: string;
  }>;
}

export function LiveCallDashboard() {
  const [activeCalls, setActiveCalls] = useState<ActiveCall[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const statsIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch initial data
  const fetchData = useCallback(async () => {
    try {
      const [activeCallsRes, statsRes, activityRes] = await Promise.all([
        api.get<{ activeCalls: ActiveCall[] }>('/api/realtime/active-calls'),
        api.get<{ stats: DashboardStats }>('/api/realtime/stats'),
        api.get<RecentActivity>('/api/realtime/recent-activity'),
      ]);

      setActiveCalls(activeCallsRes.activeCalls || []);
      setStats(statsRes.stats || null);
      setRecentActivity(activityRes);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Failed to fetch realtime data:', err);
    }
  }, []);

  // Connect to WebSocket for real-time updates
  const connectWebSocket = useCallback(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    const wsUrl = `${import.meta.env.VITE_WS_URL || 'ws://localhost:3000'}/realtime?token=${token}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('📡 Live dashboard connected');
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleRealtimeMessage(message);
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onclose = () => {
        console.log('📡 Live dashboard disconnected');
        setIsConnected(false);
        // Attempt reconnect after 5 seconds
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 5000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (err) {
      console.error('Failed to connect WebSocket:', err);
    }
  }, []);

  // Handle real-time messages
  const handleRealtimeMessage = (message: { type: string; data: unknown }) => {
    switch (message.type) {
      case 'call_started':
        setActiveCalls(prev => [...prev, message.data as ActiveCall]);
        break;

      case 'call_answered':
        setActiveCalls(prev =>
          prev.map(call =>
            call.callSid === (message.data as { callSid: string }).callSid
              ? { ...call, status: 'IN_PROGRESS' }
              : call
          )
        );
        break;

      case 'call_ended':
        setActiveCalls(prev =>
          prev.filter(call => call.callSid !== (message.data as { callSid: string }).callSid)
        );
        // Refresh stats after call ends
        fetchData();
        break;

      case 'active_calls':
        setActiveCalls(message.data as ActiveCall[]);
        break;

      case 'stats_update':
        setStats(message.data as DashboardStats);
        break;

      case 'new_lead':
        // Refresh activity to show new lead
        fetchData();
        break;
    }

    setLastUpdate(new Date());
  };

  // Update elapsed time for active calls
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveCalls(prev =>
        prev.map(call => ({
          ...call,
          elapsedTime: call.startTime
            ? Math.floor((Date.now() - call.startTime) / 1000)
            : (call.elapsedTime || 0) + 1,
        }))
      );
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Initial setup
  useEffect(() => {
    fetchData();
    connectWebSocket();

    // Poll stats every 30 seconds as backup
    statsIntervalRef.current = setInterval(fetchData, 30000);

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }
    };
  }, [fetchData, connectWebSocket]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Connection Status & Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`
            w-3 h-3 rounded-full animate-pulse
            ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}
          `} />
          <span className="text-sm text-slate-400">
            {isConnected ? 'Live' : 'Reconnecting...'}
          </span>
          {lastUpdate && (
            <span className="text-xs text-slate-500">
              Updated {formatTime(lastUpdate.toISOString())}
            </span>
          )}
        </div>
        <button
          onClick={fetchData}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 transition-colors"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Live Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Active Calls */}
        <Card padding="md" className="relative overflow-hidden">
          <div className={`
            absolute inset-0 opacity-10
            ${activeCalls.length > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}
          `} />
          <div className="relative">
            <div className="flex items-center gap-2 text-slate-400 mb-2">
              <Activity size={16} />
              <span className="text-xs font-medium uppercase">Active Now</span>
            </div>
            <p className="text-3xl font-bold text-white">{activeCalls.length}</p>
            <p className="text-xs text-slate-500 mt-1">
              {activeCalls.filter(c => c.handledByAI).length} handled by AI
            </p>
          </div>
        </Card>

        {/* Calls Today */}
        <Card padding="md">
          <div className="flex items-center gap-2 text-slate-400 mb-2">
            <Phone size={16} />
            <span className="text-xs font-medium uppercase">Today</span>
          </div>
          <p className="text-3xl font-bold text-white">{stats?.callsToday || 0}</p>
          <p className="text-xs text-slate-500 mt-1">
            {stats?.callsLastHour || 0} in last hour
          </p>
        </Card>

        {/* AI Performance */}
        <Card padding="md">
          <div className="flex items-center gap-2 text-purple-400 mb-2">
            <Zap size={16} />
            <span className="text-xs font-medium uppercase">AI Handled</span>
          </div>
          <p className="text-3xl font-bold text-white">{stats?.aiPercentage || 0}%</p>
          <p className="text-xs text-slate-500 mt-1">
            {stats?.aiHandledToday || 0} of {stats?.callsToday || 0} calls
          </p>
        </Card>

        {/* Leads Today */}
        <Card padding="md">
          <div className="flex items-center gap-2 text-emerald-400 mb-2">
            <Users size={16} />
            <span className="text-xs font-medium uppercase">Leads</span>
          </div>
          <p className="text-3xl font-bold text-white">{stats?.leadsToday || 0}</p>
          <p className="text-xs text-slate-500 mt-1">
            Captured today
          </p>
        </Card>
      </div>

      {/* Active Calls List */}
      {activeCalls.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700 bg-slate-800/50">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Activity size={18} className="text-emerald-400 animate-pulse" />
              Active Calls
            </h3>
          </div>
          <div className="divide-y divide-slate-800">
            {activeCalls.map((call) => (
              <div
                key={call.callSid}
                className="px-4 py-3 flex items-center justify-between hover:bg-slate-800/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`
                    w-10 h-10 rounded-full flex items-center justify-center
                    ${call.direction === 'INBOUND'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'bg-blue-500/10 text-blue-400'
                    }
                  `}>
                    {call.direction === 'INBOUND' ? (
                      <PhoneIncoming size={18} />
                    ) : (
                      <PhoneOutgoing size={18} />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-white">
                      {call.direction === 'INBOUND' ? call.fromNumber : call.toNumber}
                    </p>
                    <p className="text-xs text-slate-500">
                      {call.direction} • {call.status}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {/* AI Badge */}
                  {call.handledByAI && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-purple-500/20 text-purple-400">
                      AI
                    </span>
                  )}

                  {/* Duration */}
                  <div className="text-right">
                    <p className="font-mono text-lg text-white">
                      {formatDuration(call.elapsedTime || 0)}
                    </p>
                    <p className="text-xs text-slate-500">duration</p>
                  </div>

                  {/* Live indicator */}
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Empty state for no active calls */}
      {activeCalls.length === 0 && (
        <Card padding="lg" className="text-center">
          <div className="flex flex-col items-center py-8">
            <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4">
              <Phone size={28} className="text-slate-500" />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">No active calls</h3>
            <p className="text-sm text-slate-400">
              Calls will appear here in real-time when they come in
            </p>
          </div>
        </Card>
      )}

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Calls */}
        <Card padding="none">
          <div className="px-4 py-3 border-b border-slate-700">
            <h3 className="font-semibold text-white">Recent Calls</h3>
          </div>
          <div className="divide-y divide-slate-800">
            {recentActivity?.recentCalls?.slice(0, 5).map((call) => (
              <div
                key={call.id}
                className="px-4 py-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className={`
                    w-8 h-8 rounded-full flex items-center justify-center text-xs
                    ${call.status === 'COMPLETED'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : call.status === 'NO_ANSWER' || call.status === 'MISSED'
                        ? 'bg-red-500/10 text-red-400'
                        : 'bg-slate-500/10 text-slate-400'
                    }
                  `}>
                    {call.status === 'COMPLETED' ? (
                      <Phone size={14} />
                    ) : (
                      <PhoneMissed size={14} />
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-white">{call.fromNumber}</p>
                    <p className="text-xs text-slate-500">
                      {formatTime(call.createdAt)} • {formatDuration(call.duration || 0)}
                    </p>
                  </div>
                </div>
                {call.handledByAI && (
                  <span className="text-xs text-purple-400">AI</span>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* Recent Leads */}
        <Card padding="none">
          <div className="px-4 py-3 border-b border-slate-700">
            <h3 className="font-semibold text-white">Recent Leads</h3>
          </div>
          <div className="divide-y divide-slate-800">
            {recentActivity?.recentLeads?.slice(0, 5).map((lead) => (
              <div
                key={lead.id}
                className="px-4 py-3 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm text-white">{lead.name}</p>
                  <p className="text-xs text-slate-500">{lead.reason}</p>
                </div>
                <span className={`
                  px-2 py-0.5 text-xs rounded-full
                  ${lead.temperature === 'HOT'
                    ? 'bg-red-500/20 text-red-400'
                    : lead.temperature === 'WARM'
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'bg-blue-500/20 text-blue-400'
                  }
                `}>
                  {lead.temperature}
                </span>
              </div>
            ))}
            {(!recentActivity?.recentLeads || recentActivity.recentLeads.length === 0) && (
              <div className="px-4 py-8 text-center text-slate-500 text-sm">
                No recent leads
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card padding="sm" className="text-center">
          <p className="text-2xl font-bold text-white">
            {formatDuration(stats?.avgDurationSeconds || 0)}
          </p>
          <p className="text-xs text-slate-500">Avg Duration</p>
        </Card>
        <Card padding="sm" className="text-center">
          <p className="text-2xl font-bold text-white">{stats?.completedToday || 0}</p>
          <p className="text-xs text-slate-500">Completed</p>
        </Card>
        <Card padding="sm" className="text-center">
          <p className="text-2xl font-bold text-red-400">{stats?.missedToday || 0}</p>
          <p className="text-xs text-slate-500">Missed</p>
        </Card>
      </div>
    </div>
  );
}

export default LiveCallDashboard;
