// ============================================================================
// HEKAX Phone - Analytics & Insights Page
// Comprehensive conversation analytics, trends, and usage metrics
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
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Minus,
  Target,
  Zap,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  PieChart,
  HelpCircle,
} from 'lucide-react';
import { PageHeader } from '../components/layout';
import { Card, StatCard, LoadingSpinner } from '../components/common';
import { api } from '../utils/api';

// ============================================================================
// Types
// ============================================================================

interface UsageStats {
  plan: string;
  callMinutes: { used: number; limit: number | null; percent: number };
  aiMinutes: { used: number; limit: number | null; percent: number };
  users: { current: number; limit: number | null };
  phoneNumbers: { current: number; limit: number | null };
  totals: { calls: number; leads: number };
  resetsAt: string | null;
}

interface UsageBreakdown {
  period: string;
  startDate: string;
  byHandler: { handler: string; callCount: number; totalMinutes: number }[];
  byDirection: { direction: string; callCount: number; totalMinutes: number }[];
}

interface AnalyticsData {
  period: { startDate: string; endDate: string };
  callMetrics: {
    totalCalls: number;
    completedCalls: number;
    missedCalls: number;
    aiHandledCalls: number;
    inboundCalls: number;
    outboundCalls: number;
    avgDuration: number;
    timeline: { date: string; total: number; completed: number; missed: number; aiHandled: number }[];
  };
  sentimentAnalysis: {
    distribution: { positive: number; neutral: number; negative: number };
    averageScore: number;
    totalAnalyzed: number;
    timeline: { date: string; positive: number; neutral: number; negative: number; avgScore: number }[];
  };
  topTopics: {
    topics: { name: string; count: number }[];
    keywords: { name: string; count: number }[];
    intents: { name: string; count: number }[];
  };
  peakHours: {
    byHour: { hour: number; label: string; count: number }[];
    byDay: { day: number; label: string; count: number }[];
    peakHour: { hour: number; label: string; count: number };
    peakDay: { day: number; label: string; count: number };
  };
  aiPerformance: {
    totalAICalls: number;
    resolutionRate: number;
    transferRate: number;
    avgConfidence: number;
    positiveOutcomeRate: number;
    avgDuration: number;
    transferReasons: { reason: string; count: number }[];
  };
  leadConversion: {
    totalLeads: number;
    byStatus: { status: string; count: number }[];
    byTemperature: { HOT: number; WARM: number; COLD: number };
    conversionRate: number;
    lossRate: number;
    pipelineValue: number;
    wonValue: number;
  };
  avgHandleTime: {
    overall: number;
    ai: number;
    human: number;
    timeline: { date: string; avgDuration: number }[];
  };
}

// ============================================================================
// Component
// ============================================================================

export function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<'insights' | 'usage'>('insights');
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [breakdown, setBreakdown] = useState<UsageBreakdown | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('30d');

  useEffect(() => {
    fetchData();
  }, [period, dateRange, activeTab]);

  const fetchData = async () => {
    try {
      setLoading(true);

      if (activeTab === 'usage') {
        const [usageData, breakdownData] = await Promise.all([
          api.get<UsageStats>('/api/usage'),
          api.get<UsageBreakdown>(`/api/usage/breakdown?period=${period}`),
        ]);
        setStats(usageData);
        setBreakdown(breakdownData);
      } else {
        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        if (dateRange === '7d') startDate.setDate(startDate.getDate() - 7);
        else if (dateRange === '30d') startDate.setDate(startDate.getDate() - 30);
        else startDate.setDate(startDate.getDate() - 90);

        const analyticsData = await api.get<AnalyticsData>(
          `/api/analytics?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
        );
        setAnalytics(analyticsData);
      }
    } catch (err) {
      console.error('Analytics fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatLimit = (limit: number | null) => limit === null ? 'Unlimited' : limit.toLocaleString();
  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  };
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  return (
    <div>
      <PageHeader
        title="Analytics & Insights"
        subtitle="Monitor performance, trends, and conversation insights"
        actions={
          <div className="flex items-center gap-3">
            {/* Tab Switcher */}
            <div className="flex bg-slate-800 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('insights')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'insights'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Insights
              </button>
              <button
                onClick={() => setActiveTab('usage')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'usage'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Usage
              </button>
            </div>
            <button
              onClick={fetchData}
              className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
            >
              <RefreshCw size={18} />
            </button>
          </div>
        }
      />

      {loading ? (
        <LoadingSpinner text="Loading analytics..." />
      ) : activeTab === 'insights' ? (
        <InsightsView
          analytics={analytics}
          dateRange={dateRange}
          setDateRange={setDateRange}
          formatDuration={formatDuration}
          formatCurrency={formatCurrency}
        />
      ) : (
        <UsageView
          stats={stats}
          breakdown={breakdown}
          period={period}
          setPeriod={setPeriod}
          formatLimit={formatLimit}
        />
      )}
    </div>
  );
}

// ============================================================================
// Insights View
// ============================================================================

interface InsightsViewProps {
  analytics: AnalyticsData | null;
  dateRange: '7d' | '30d' | '90d';
  setDateRange: (range: '7d' | '30d' | '90d') => void;
  formatDuration: (seconds: number) => string;
  formatCurrency: (value: number) => string;
}

function InsightsView({ analytics, dateRange, setDateRange, formatDuration, formatCurrency }: InsightsViewProps) {
  if (!analytics) {
    return (
      <Card className="text-center py-12">
        <BarChart3 size={48} className="mx-auto text-slate-600 mb-4" />
        <p className="text-slate-400">No analytics data available</p>
      </Card>
    );
  }

  const { callMetrics, sentimentAnalysis, topTopics, peakHours, aiPerformance, leadConversion, avgHandleTime } = analytics;

  // Calculate sentiment percentages
  const totalSentiment = sentimentAnalysis.distribution.positive + sentimentAnalysis.distribution.neutral + sentimentAnalysis.distribution.negative;
  const sentimentPercents = {
    positive: totalSentiment > 0 ? Math.round((sentimentAnalysis.distribution.positive / totalSentiment) * 100) : 0,
    neutral: totalSentiment > 0 ? Math.round((sentimentAnalysis.distribution.neutral / totalSentiment) * 100) : 0,
    negative: totalSentiment > 0 ? Math.round((sentimentAnalysis.distribution.negative / totalSentiment) * 100) : 0,
  };

  return (
    <div className="space-y-6">
      {/* Date Range Selector */}
      <div className="flex justify-end">
        <div className="flex gap-2 bg-slate-800 rounded-lg p-1">
          {(['7d', '30d', '90d'] as const).map(range => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                dateRange === range
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* Key Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Calls"
          value={callMetrics.totalCalls.toLocaleString()}
          icon={<Phone size={24} />}
          iconColor="blue"
          trend={callMetrics.completedCalls > callMetrics.missedCalls ? { value: Math.round((callMetrics.completedCalls / Math.max(callMetrics.totalCalls, 1)) * 100), isPositive: true } : undefined}
        />
        <StatCard
          label="AI Resolution Rate"
          value={`${aiPerformance.resolutionRate}%`}
          icon={<Bot size={24} />}
          iconColor="purple"
          trend={aiPerformance.resolutionRate >= 70 ? { value: aiPerformance.resolutionRate, isPositive: true } : { value: aiPerformance.resolutionRate, isPositive: false }}
        />
        <StatCard
          label="Positive Sentiment"
          value={`${sentimentPercents.positive}%`}
          icon={<ThumbsUp size={24} />}
          iconColor="green"
        />
        <StatCard
          label="Lead Conversion"
          value={`${leadConversion.conversionRate}%`}
          icon={<Target size={24} />}
          iconColor="orange"
        />
      </div>

      {/* Call Volume & Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Call Volume Chart */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Activity size={20} className="text-blue-400" />
              <h3 className="font-semibold text-white">Call Volume Trend</h3>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span className="text-slate-400">Completed</span>
              </span>
              <span className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-slate-400">Missed</span>
              </span>
            </div>
          </div>

          {/* Simple Bar Chart */}
          <div className="h-48 flex items-end gap-1">
            {callMetrics.timeline.slice(-14).map((day, i) => {
              const maxCalls = Math.max(...callMetrics.timeline.map(d => d.total), 1);
              const height = (day.total / maxCalls) * 100;
              const completedHeight = (day.completed / Math.max(day.total, 1)) * height;

              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col justify-end" style={{ height: '160px' }}>
                    <div
                      className="w-full bg-red-500/50 rounded-t"
                      style={{ height: `${height - completedHeight}%` }}
                    />
                    <div
                      className="w-full bg-blue-500 rounded-b"
                      style={{ height: `${completedHeight}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 rotate-45 origin-left whitespace-nowrap">
                    {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* AI Performance */}
        <Card>
          <div className="flex items-center gap-3 mb-6">
            <Bot size={20} className="text-purple-400" />
            <h3 className="font-semibold text-white">AI Performance</h3>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-slate-400">Resolution Rate</span>
                <span className="text-sm font-medium text-white">{aiPerformance.resolutionRate}%</span>
              </div>
              <div className="w-full h-2 bg-slate-700 rounded-full">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-purple-400 rounded-full"
                  style={{ width: `${aiPerformance.resolutionRate}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-slate-400">Confidence Score</span>
                <span className="text-sm font-medium text-white">{aiPerformance.avgConfidence}%</span>
              </div>
              <div className="w-full h-2 bg-slate-700 rounded-full">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full"
                  style={{ width: `${aiPerformance.avgConfidence}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-slate-400">Positive Outcomes</span>
                <span className="text-sm font-medium text-white">{aiPerformance.positiveOutcomeRate}%</span>
              </div>
              <div className="w-full h-2 bg-slate-700 rounded-full">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full"
                  style={{ width: `${aiPerformance.positiveOutcomeRate}%` }}
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-700">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Avg AI Call Duration</span>
                <span className="text-white font-medium">{formatDuration(aiPerformance.avgDuration)}</span>
              </div>
              <div className="flex justify-between text-sm mt-2">
                <span className="text-slate-400">Transfer Rate</span>
                <span className={`font-medium ${aiPerformance.transferRate > 30 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {aiPerformance.transferRate}%
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Sentiment & Topics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sentiment Analysis */}
        <Card>
          <div className="flex items-center gap-3 mb-6">
            <MessageSquare size={20} className="text-emerald-400" />
            <h3 className="font-semibold text-white">Sentiment Analysis</h3>
          </div>

          <div className="flex items-center gap-8">
            {/* Donut Chart Placeholder */}
            <div className="relative w-32 h-32">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  fill="none"
                  stroke="#334155"
                  strokeWidth="12"
                />
                {/* Positive */}
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="12"
                  strokeDasharray={`${sentimentPercents.positive * 3.52} 352`}
                  strokeDashoffset="0"
                />
                {/* Neutral */}
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  fill="none"
                  stroke="#6b7280"
                  strokeWidth="12"
                  strokeDasharray={`${sentimentPercents.neutral * 3.52} 352`}
                  strokeDashoffset={`${-sentimentPercents.positive * 3.52}`}
                />
                {/* Negative */}
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="12"
                  strokeDasharray={`${sentimentPercents.negative * 3.52} 352`}
                  strokeDashoffset={`${-(sentimentPercents.positive + sentimentPercents.neutral) * 3.52}`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold text-white">{totalSentiment}</span>
              </div>
            </div>

            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-3">
                <ThumbsUp size={18} className="text-emerald-400" />
                <div className="flex-1">
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-300">Positive</span>
                    <span className="text-sm font-medium text-white">{sentimentPercents.positive}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-700 rounded-full mt-1">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${sentimentPercents.positive}%` }} />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Minus size={18} className="text-slate-400" />
                <div className="flex-1">
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-300">Neutral</span>
                    <span className="text-sm font-medium text-white">{sentimentPercents.neutral}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-700 rounded-full mt-1">
                    <div className="h-full bg-slate-500 rounded-full" style={{ width: `${sentimentPercents.neutral}%` }} />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <ThumbsDown size={18} className="text-red-400" />
                <div className="flex-1">
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-300">Negative</span>
                    <span className="text-sm font-medium text-white">{sentimentPercents.negative}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-700 rounded-full mt-1">
                    <div className="h-full bg-red-500 rounded-full" style={{ width: `${sentimentPercents.negative}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Top Topics */}
        <Card>
          <div className="flex items-center gap-3 mb-6">
            <PieChart size={20} className="text-amber-400" />
            <h3 className="font-semibold text-white">Top Topics & Intents</h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-xs font-medium text-slate-500 uppercase mb-3">Topics</h4>
              <div className="space-y-2">
                {topTopics.topics.slice(0, 5).map((topic, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm text-slate-300 truncate">{topic.name}</span>
                    <span className="text-xs text-slate-500 bg-slate-700 px-2 py-0.5 rounded">{topic.count}</span>
                  </div>
                ))}
                {topTopics.topics.length === 0 && (
                  <p className="text-sm text-slate-500">No topics yet</p>
                )}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-medium text-slate-500 uppercase mb-3">Intents</h4>
              <div className="space-y-2">
                {topTopics.intents.slice(0, 5).map((intent, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm text-slate-300 truncate">{intent.name}</span>
                    <span className="text-xs text-slate-500 bg-slate-700 px-2 py-0.5 rounded">{intent.count}</span>
                  </div>
                ))}
                {topTopics.intents.length === 0 && (
                  <p className="text-sm text-slate-500">No intents yet</p>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Peak Hours & Lead Conversion */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Peak Hours */}
        <Card>
          <div className="flex items-center gap-3 mb-6">
            <Clock size={20} className="text-blue-400" />
            <h3 className="font-semibold text-white">Peak Hours</h3>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <h4 className="text-xs font-medium text-slate-500 uppercase mb-3">By Hour</h4>
              <div className="h-32 flex items-end gap-0.5">
                {peakHours.byHour.map((hour, i) => {
                  const maxCount = Math.max(...peakHours.byHour.map(h => h.count), 1);
                  const height = (hour.count / maxCount) * 100;
                  const isPeak = hour.hour === peakHours.peakHour.hour;

                  return (
                    <div
                      key={i}
                      className={`flex-1 rounded-t transition-colors ${
                        isPeak ? 'bg-blue-500' : 'bg-slate-600 hover:bg-slate-500'
                      }`}
                      style={{ height: `${Math.max(height, 4)}%` }}
                      title={`${hour.label}: ${hour.count} calls`}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between mt-2 text-[10px] text-slate-500">
                <span>12am</span>
                <span>12pm</span>
                <span>11pm</span>
              </div>
            </div>
            <div>
              <h4 className="text-xs font-medium text-slate-500 uppercase mb-3">By Day</h4>
              <div className="space-y-2">
                {peakHours.byDay.map((day, i) => {
                  const maxCount = Math.max(...peakHours.byDay.map(d => d.count), 1);
                  const width = (day.count / maxCount) * 100;
                  const isPeak = day.day === peakHours.peakDay.day;

                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 w-8">{day.label.slice(0, 3)}</span>
                      <div className="flex-1 h-2 bg-slate-700 rounded-full">
                        <div
                          className={`h-full rounded-full ${isPeak ? 'bg-blue-500' : 'bg-slate-500'}`}
                          style={{ width: `${width}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500 w-6 text-right">{day.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-700 flex justify-between">
            <div>
              <p className="text-xs text-slate-500">Peak Hour</p>
              <p className="text-sm font-medium text-blue-400">{peakHours.peakHour.label}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">Peak Day</p>
              <p className="text-sm font-medium text-blue-400">{peakHours.peakDay.label}</p>
            </div>
          </div>
        </Card>

        {/* Lead Conversion */}
        <Card>
          <div className="flex items-center gap-3 mb-6">
            <Target size={20} className="text-emerald-400" />
            <h3 className="font-semibold text-white">Lead Conversion</h3>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center p-3 bg-slate-800 rounded-lg">
              <p className="text-2xl font-bold text-white">{leadConversion.totalLeads}</p>
              <p className="text-xs text-slate-400">Total Leads</p>
            </div>
            <div className="text-center p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
              <p className="text-2xl font-bold text-emerald-400">{leadConversion.conversionRate}%</p>
              <p className="text-xs text-emerald-400/70">Converted</p>
            </div>
            <div className="text-center p-3 bg-slate-800 rounded-lg">
              <p className="text-2xl font-bold text-white">{formatCurrency(leadConversion.wonValue)}</p>
              <p className="text-xs text-slate-400">Won Value</p>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-medium text-slate-500 uppercase">By Temperature</h4>
            <div className="flex gap-3">
              <div className="flex-1 p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                <p className="text-lg font-bold text-red-400">{leadConversion.byTemperature.HOT}</p>
                <p className="text-xs text-red-400/70">Hot</p>
              </div>
              <div className="flex-1 p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
                <p className="text-lg font-bold text-amber-400">{leadConversion.byTemperature.WARM}</p>
                <p className="text-xs text-amber-400/70">Warm</p>
              </div>
              <div className="flex-1 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <p className="text-lg font-bold text-blue-400">{leadConversion.byTemperature.COLD}</p>
                <p className="text-xs text-blue-400/70">Cold</p>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-700">
            <p className="text-xs text-slate-500 mb-1">Pipeline Value</p>
            <p className="text-lg font-bold text-white">{formatCurrency(leadConversion.pipelineValue)}</p>
          </div>
        </Card>
      </div>

      {/* Handle Time Comparison */}
      <Card>
        <div className="flex items-center gap-3 mb-6">
          <Zap size={20} className="text-amber-400" />
          <h3 className="font-semibold text-white">Average Handle Time</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center p-6 bg-slate-800 rounded-xl">
            <Clock size={32} className="mx-auto text-slate-400 mb-3" />
            <p className="text-3xl font-bold text-white">{formatDuration(avgHandleTime.overall)}</p>
            <p className="text-sm text-slate-400 mt-1">Overall Average</p>
          </div>
          <div className="text-center p-6 bg-purple-500/10 rounded-xl border border-purple-500/20">
            <Bot size={32} className="mx-auto text-purple-400 mb-3" />
            <p className="text-3xl font-bold text-purple-400">{formatDuration(avgHandleTime.ai)}</p>
            <p className="text-sm text-purple-400/70 mt-1">AI Handled</p>
            {avgHandleTime.ai < avgHandleTime.human && (
              <p className="text-xs text-emerald-400 mt-2 flex items-center justify-center gap-1">
                <ArrowDownRight size={14} />
                {Math.round(((avgHandleTime.human - avgHandleTime.ai) / avgHandleTime.human) * 100)}% faster
              </p>
            )}
          </div>
          <div className="text-center p-6 bg-blue-500/10 rounded-xl border border-blue-500/20">
            <Users size={32} className="mx-auto text-blue-400 mb-3" />
            <p className="text-3xl font-bold text-blue-400">{formatDuration(avgHandleTime.human)}</p>
            <p className="text-sm text-blue-400/70 mt-1">Human Handled</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ============================================================================
// Usage View (Original)
// ============================================================================

interface UsageViewProps {
  stats: UsageStats | null;
  breakdown: UsageBreakdown | null;
  period: 'week' | 'month' | 'year';
  setPeriod: (p: 'week' | 'month' | 'year') => void;
  formatLimit: (limit: number | null) => string;
}

function UsageView({ stats, breakdown, period, setPeriod, formatLimit }: UsageViewProps) {
  return (
    <div className="space-y-6">
      {/* Plan & Usage Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
              You've used {stats.callMinutes.percent}% of your monthly limit
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
              You've used {stats.aiMinutes.percent}% of your monthly limit
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
                        {item.callCount} calls - {item.totalMinutes} min
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
                        {item.callCount} calls - {item.totalMinutes} min
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
      <Card>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-white mb-1">Current Plan</h3>
            <p className="text-slate-400">
              <span className="text-blue-400 font-semibold">{stats?.plan}</span>
              {stats?.resetsAt && (
                <span className="text-sm ml-2">
                  - Resets {new Date(stats.resetsAt).toLocaleDateString()}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'billing' }))}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium transition-all shadow-lg shadow-blue-500/20"
          >
            Upgrade Plan
          </button>
        </div>
      </Card>
    </div>
  );
}
