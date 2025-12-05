// ============================================================================
// HEKAX Phone - Billing Page
// Professional SaaS Design with Enhanced UX
// ============================================================================

import { useState, useEffect } from 'react';
import {
  CreditCard,
  Phone,
  Bot,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ExternalLink,
  FileText,
  RefreshCw,
  X,
  Package,
  Settings,
  Plus,
  Sparkles,
  Shield,
  Zap,
  Crown,
  ArrowRight,
  Mail,
  Building2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/layout';
import { Card, LoadingSpinner, Badge } from '../components/common';
import { api } from '../utils/api';

// Plans configuration for the upgrade modal
const PLANS = [
  {
    id: 'STARTER',
    name: 'Starter',
    price: 99,
    description: 'Perfect for small teams getting started',
    icon: Zap,
    color: 'blue',
    features: [
      { text: '1,000 call minutes/mo', included: true },
      { text: '300 AI minutes/mo', included: true },
      { text: '2 team members', included: true },
      { text: '1 phone number', included: true },
      { text: 'AI Receptionist with barge-in', included: true },
      { text: 'Lead capture & management', included: true },
      { text: 'Basic analytics', included: true },
      { text: 'Email support', included: true },
      { text: 'CRM integrations', included: false },
      { text: 'Calendar integrations', included: false },
    ],
    popular: false,
    cta: 'Get Started',
  },
  {
    id: 'BUSINESS_PRO',
    name: 'Business Pro',
    price: 499,
    description: 'For growing businesses that need more',
    icon: Sparkles,
    color: 'purple',
    features: [
      { text: '4,000 call minutes/mo', included: true },
      { text: '2,000 AI minutes/mo', included: true },
      { text: '10 team members', included: true },
      { text: '5 phone numbers', included: true },
      { text: 'AI Receptionist with barge-in', included: true },
      { text: 'Lead capture & management', included: true },
      { text: 'CRM integrations (HubSpot, Salesforce, Zoho, Pipedrive)', included: true },
      { text: 'Calendar integrations (Google, Outlook, Calendly)', included: true },
      { text: 'Advanced analytics', included: true },
      { text: 'Priority support', included: true },
    ],
    popular: true,
    cta: 'Upgrade Now',
  },
  {
    id: 'SCALE',
    name: 'Scale',
    price: 799,
    description: 'For high-volume operations',
    icon: Crown,
    color: 'amber',
    features: [
      { text: '8,000 call minutes/mo', included: true },
      { text: '4,000 AI minutes/mo', included: true },
      { text: '20 team members', included: true },
      { text: '5 phone numbers', included: true },
      { text: 'Everything in Business Pro', included: true },
      { text: 'Custom webhooks & API access', included: true },
      { text: 'BYO API keys (OpenAI, Deepgram)', included: true },
      { text: 'Dedicated account manager', included: true },
      { text: 'White-label & custom domain', included: true },
      { text: 'Enterprise SLA & support', included: true },
    ],
    popular: false,
    cta: 'Get Scale',
  },
];

interface AddOn {
  id: string;
  name: string;
  description: string;
  price: number;
  callMinutes: number;
  aiMinutes: number;
}

interface BillingData {
  plan: {
    id: string;
    name: string;
    price: number;
    interval: string | null;
  };
  usage: {
    callMinutes: {
      used: number;
      limit: number;
      percent: number;
      remaining: number;
      addonTotal?: number;
      addonUsed?: number;
      addonRemaining?: number;
    };
    aiMinutes: {
      used: number;
      limit: number;
      percent: number;
      remaining: number;
      graceStartedAt: string | null;
      inGracePeriod: boolean;
      addonTotal?: number;
      addonUsed?: number;
      addonRemaining?: number;
    };
    users: { current: number; limit: number };
    phoneNumbers: { current: number; limit: number };
    overage?: {
      enabled: boolean;
      capDollars: number;
      usedDollars: number;
      remainingDollars: number;
    };
  };
  subscription: {
    id: string;
    status: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
    cancelAt: string | null;
  } | null;
  trial: {
    endsAt: string;
    daysLeft: number;
  } | null;
  alerts: {
    id: string;
    type: string;
    title: string;
    message: string;
    severity: string;
  }[];
  addons?: AddOn[];
}

interface Invoice {
  id: string;
  number: string;
  status: string;
  amount: number;
  currency: string;
  created: string;
  paidAt: string | null;
  pdfUrl: string | null;
}

export function BillingPage() {
  const { user } = useAuth();
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [addonLoading, setAddonLoading] = useState<string | null>(null);
  const [showPlansModal, setShowPlansModal] = useState(false);

  const canManage = user?.role === 'OWNER' || user?.role === 'ADMIN';

  useEffect(() => {
    fetchBilling();
    fetchInvoices();

    // Check for success/cancelled from Stripe redirect
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') || params.get('addon_success')) {
      setTimeout(fetchBilling, 2000);
    }
  }, []);

  const fetchBilling = async () => {
    try {
      setLoading(true);
      const data = await api.get<BillingData>('/api/billing');
      setBilling(data);
    } catch (err) {
      console.error('Billing fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchInvoices = async () => {
    try {
      const data = await api.get<{ invoices: Invoice[] }>('/api/billing/invoices');
      setInvoices(data.invoices);
    } catch (err) {
      console.error('Invoices fetch error:', err);
    }
  };

  const handleUpgrade = async (planId?: string) => {
    setActionLoading(true);
    try {
      const data = await api.post<{ url: string }>('/api/billing/checkout', { planId });
      window.location.href = data.url;
    } catch (err) {
      console.error('Checkout error:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleBuyAddon = async (addonId: string) => {
    setAddonLoading(addonId);
    try {
      const data = await api.post<{ url: string }>('/api/billing/addon/checkout', { addonId });
      window.location.href = data.url;
    } catch (err) {
      console.error('Addon checkout error:', err);
    } finally {
      setAddonLoading(null);
    }
  };

  const handleManageBilling = async () => {
    setActionLoading(true);
    try {
      const data = await api.post<{ url: string }>('/api/billing/portal');
      window.location.href = data.url;
    } catch (err) {
      console.error('Portal error:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleOverage = async () => {
    if (!billing?.usage.overage) return;
    try {
      const data = await api.put<{ overage: { enabled: boolean } }>('/api/billing/overage', {
        enabled: !billing.usage.overage.enabled,
      });
      setBilling(prev => prev ? {
        ...prev,
        usage: {
          ...prev.usage,
          overage: prev.usage.overage ? {
            ...prev.usage.overage,
            enabled: data.overage.enabled,
          } : undefined
        }
      } : null);
    } catch (err) {
      console.error('Overage toggle error:', err);
    }
  };

  const handleDismissAlert = async (alertId: string) => {
    try {
      await api.post(`/api/billing/alerts/${alertId}/dismiss`);
      setBilling(prev => prev ? {
        ...prev,
        alerts: prev.alerts.filter(a => a.id !== alertId)
      } : null);
    } catch (err) {
      console.error('Dismiss alert error:', err);
    }
  };

  if (loading) {
    return <LoadingSpinner text="Loading billing..." />;
  }

  if (!billing) {
    return <div className="text-center text-slate-400 py-12">Failed to load billing</div>;
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'success';
      case 'trialing': return 'info';
      case 'past_due': return 'warning';
      case 'canceled': case 'unpaid': return 'danger';
      default: return 'default';
    }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Billing & Usage"
        subtitle="Manage your subscription and monitor usage"
        actions={
          <button
            onClick={fetchBilling}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all hover:scale-105 border border-slate-700"
          >
            <RefreshCw size={18} />
          </button>
        }
      />

      {/* Alerts */}
      {billing.alerts.length > 0 && (
        <div className="space-y-3 mb-6">
          {billing.alerts.map(alert => (
            <div
              key={alert.id}
              className={`
                p-4 rounded-xl flex items-start gap-3 backdrop-blur-sm
                ${alert.severity === 'error'
                  ? 'bg-red-500/10 border border-red-500/20'
                  : alert.severity === 'warning'
                    ? 'bg-amber-500/10 border border-amber-500/20'
                    : 'bg-blue-500/10 border border-blue-500/20'
                }
              `}
            >
              {alert.severity === 'error' ? (
                <XCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
              ) : alert.severity === 'warning' ? (
                <AlertTriangle size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
              ) : (
                <CheckCircle size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <p className={`font-medium ${
                  alert.severity === 'error' ? 'text-red-400' :
                  alert.severity === 'warning' ? 'text-amber-400' : 'text-blue-400'
                }`}>
                  {alert.title}
                </p>
                <p className="text-sm text-slate-400 mt-1">{alert.message}</p>
                {alert.type.includes('usage') && alert.severity !== 'info' && (
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => document.getElementById('addons-section')?.scrollIntoView({ behavior: 'smooth' })}
                      className="text-sm px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                    >
                      Buy More Minutes
                    </button>
                    {billing.plan.id !== 'SCALE' && (
                      <button
                        onClick={() => handleUpgrade(billing.plan.id === 'STARTER' ? 'BUSINESS_PRO' : 'SCALE')}
                        className="text-sm px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                      >
                        Upgrade Plan
                      </button>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleDismissAlert(alert.id)}
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Trial Banner */}
      {billing.trial && (
        <div className="mb-6 p-6 rounded-2xl bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-pink-600/20 border border-blue-500/30 backdrop-blur-sm relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-lg shadow-blue-500/25">
                <Sparkles size={24} className="text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Free Trial Active</h3>
                <p className="text-slate-300">
                  {billing.trial.daysLeft > 0
                    ? `${billing.trial.daysLeft} days remaining to explore all features`
                    : 'Your trial has ended - upgrade to continue'
                  }
                </p>
              </div>
            </div>
            {canManage && (
              <button
                onClick={() => setShowPlansModal(true)}
                disabled={actionLoading}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-xl font-semibold transition-all hover:scale-105 shadow-lg shadow-blue-500/25 disabled:opacity-50 flex items-center gap-2"
              >
                {actionLoading ? <RefreshCw size={18} className="animate-spin" /> : (
                  <>
                    Choose a Plan
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Plan & Subscription Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-2 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className={`
                  w-12 h-12 rounded-xl flex items-center justify-center
                  ${billing.plan.id === 'SCALE'
                    ? 'bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg shadow-amber-500/25'
                    : billing.plan.id === 'BUSINESS_PRO'
                      ? 'bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg shadow-purple-500/25'
                      : 'bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg shadow-blue-500/25'
                  }
                `}>
                  {billing.plan.id === 'SCALE' ? <Crown size={24} className="text-white" /> :
                   billing.plan.id === 'BUSINESS_PRO' ? <Sparkles size={24} className="text-white" /> :
                   <Zap size={24} className="text-white" />}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">
                    {billing.plan.id === 'TRIAL' ? 'Free Trial' : billing.plan.name}
                  </h3>
                  <p className="text-slate-400">
                    {billing.plan.id === 'TRIAL' || billing.plan.price === 0
                      ? 'Explore all features before subscribing'
                      : `$${billing.plan.price}/month`
                    }
                  </p>
                </div>
              </div>
              {billing.subscription ? (
                <Badge variant={getStatusColor(billing.subscription.status)}>
                  {billing.subscription.status}
                </Badge>
              ) : billing.plan.id === 'TRIAL' && (
                <Badge variant="info">Trial</Badge>
              )}
            </div>

            {billing.subscription && (
              <div className="grid grid-cols-2 gap-4 mb-6 p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
                <div>
                  <p className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Current Period</p>
                  <p className="text-sm text-slate-300 font-medium">
                    {new Date(billing.subscription.currentPeriodStart).toLocaleDateString()}
                    {' - '}
                    {new Date(billing.subscription.currentPeriodEnd).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Next Billing</p>
                  <p className="text-sm text-slate-300 font-medium">
                    {billing.subscription.cancelAtPeriodEnd
                      ? 'Cancelled'
                      : new Date(billing.subscription.currentPeriodEnd).toLocaleDateString()
                    }
                  </p>
                </div>
              </div>
            )}

            {canManage && (
              <div className="flex gap-3">
                {!billing.subscription || billing.plan.id === 'TRIAL' ? (
                  <button
                    onClick={() => setShowPlansModal(true)}
                    disabled={actionLoading}
                    className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-xl font-semibold transition-all hover:scale-105 shadow-lg shadow-blue-500/20 disabled:opacity-50 flex items-center gap-2"
                  >
                    Choose a Plan
                    <ArrowRight size={16} />
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleManageBilling}
                      disabled={actionLoading}
                      className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium transition-all hover:scale-105 disabled:opacity-50 flex items-center gap-2 border border-slate-600"
                    >
                      <CreditCard size={18} />
                      Manage Billing
                    </button>
                    {billing.plan.id !== 'SCALE' && (
                      <button
                        onClick={() => setShowPlansModal(true)}
                        disabled={actionLoading}
                        className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-xl font-semibold transition-all hover:scale-105 shadow-lg shadow-blue-500/20 disabled:opacity-50"
                      >
                        Upgrade
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </Card>

        {/* Quick Stats */}
        <Card className="bg-gradient-to-br from-slate-800 to-slate-900">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <Shield size={18} className="text-blue-400" />
            Plan Limits
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-slate-900/50 rounded-lg">
              <span className="text-slate-400 text-sm">Call Minutes</span>
              <span className="text-white font-semibold">{billing.usage.callMinutes.limit.toLocaleString()}/mo</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-slate-900/50 rounded-lg">
              <span className="text-slate-400 text-sm">AI Minutes</span>
              <span className="text-white font-semibold">{billing.usage.aiMinutes.limit.toLocaleString()}/mo</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-slate-900/50 rounded-lg">
              <span className="text-slate-400 text-sm">Team Members</span>
              <span className="text-white font-semibold">{billing.usage.users.limit}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-slate-900/50 rounded-lg">
              <span className="text-slate-400 text-sm">Phone Numbers</span>
              <span className="text-white font-semibold">{billing.usage.phoneNumbers.limit}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Usage Meters */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Call Minutes */}
        <Card className="relative overflow-hidden group hover:shadow-lg hover:shadow-blue-500/5 transition-all">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/20 flex items-center justify-center border border-blue-500/20">
                  <Phone size={22} className="text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Call Minutes</h3>
                  <p className="text-sm text-slate-400">US & Canada</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-white">
                  {billing.usage.callMinutes.used.toLocaleString()}
                </p>
                <p className="text-sm text-slate-400">
                  of {billing.usage.callMinutes.limit.toLocaleString()}
                </p>
              </div>
            </div>
            <div className="w-full h-3 bg-slate-700/50 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  billing.usage.callMinutes.percent >= 90 ? 'bg-gradient-to-r from-red-500 to-red-400' :
                  billing.usage.callMinutes.percent >= 80 ? 'bg-gradient-to-r from-amber-500 to-amber-400' :
                  'bg-gradient-to-r from-blue-500 to-blue-400'
                }`}
                style={{ width: `${Math.min(billing.usage.callMinutes.percent, 100)}%` }}
              />
            </div>
            <div className="flex justify-between mt-3">
              <p className="text-sm text-slate-500">
                {billing.usage.callMinutes.remaining.toLocaleString()} remaining
              </p>
              {billing.usage.callMinutes.addonRemaining && billing.usage.callMinutes.addonRemaining > 0 && (
                <p className="text-sm text-blue-400 font-medium">
                  +{billing.usage.callMinutes.addonRemaining.toLocaleString()} add-on
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* AI Minutes */}
        <Card className="relative overflow-hidden group hover:shadow-lg hover:shadow-purple-500/5 transition-all">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/20 flex items-center justify-center border border-purple-500/20">
                  <Bot size={22} className="text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">AI Minutes</h3>
                  <p className="text-sm text-slate-400">STT + LLM + TTS</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-white">
                  {billing.usage.aiMinutes.used.toLocaleString()}
                </p>
                <p className="text-sm text-slate-400">
                  of {billing.usage.aiMinutes.limit.toLocaleString()}
                </p>
              </div>
            </div>
            <div className="w-full h-3 bg-slate-700/50 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  billing.usage.aiMinutes.percent >= 90 ? 'bg-gradient-to-r from-red-500 to-red-400' :
                  billing.usage.aiMinutes.percent >= 80 ? 'bg-gradient-to-r from-amber-500 to-amber-400' :
                  'bg-gradient-to-r from-purple-500 to-purple-400'
                }`}
                style={{ width: `${Math.min(billing.usage.aiMinutes.percent, 100)}%` }}
              />
            </div>
            <div className="flex justify-between mt-3">
              {billing.usage.aiMinutes.inGracePeriod ? (
                <p className="text-sm text-amber-400 flex items-center gap-1">
                  <AlertTriangle size={14} />
                  Grace period - AI pauses after 48hrs
                </p>
              ) : (
                <p className="text-sm text-slate-500">
                  {billing.usage.aiMinutes.remaining.toLocaleString()} remaining
                </p>
              )}
              {billing.usage.aiMinutes.addonRemaining && billing.usage.aiMinutes.addonRemaining > 0 && (
                <p className="text-sm text-purple-400 font-medium">
                  +{billing.usage.aiMinutes.addonRemaining.toLocaleString()} add-on
                </p>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Overage Settings */}
      {billing.plan.id !== 'TRIAL' && billing.usage.overage && canManage && (
        <Card className="mb-6 bg-gradient-to-r from-amber-500/5 to-orange-500/5 border-amber-500/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center border border-amber-500/20">
                <Settings size={22} className="text-amber-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Overage Protection</h3>
                <p className="text-sm text-slate-400">
                  {billing.usage.overage.enabled
                    ? `Continue using AI beyond limits (capped at $${billing.usage.overage.capDollars}/mo)`
                    : 'AI will pause when limits are reached'
                  }
                </p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              {billing.usage.overage.enabled && (
                <div className="text-right">
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Used this period</p>
                  <p className="text-lg font-bold text-white">
                    ${billing.usage.overage.usedDollars.toFixed(2)}
                    <span className="text-slate-400 font-normal text-sm"> / ${billing.usage.overage.capDollars}</span>
                  </p>
                </div>
              )}
              <button
                onClick={handleToggleOverage}
                className={`
                  relative w-14 h-7 rounded-full transition-colors
                  ${billing.usage.overage.enabled ? 'bg-amber-600' : 'bg-slate-600'}
                `}
              >
                <div className={`
                  absolute top-1 w-5 h-5 rounded-full bg-white transition-all shadow-lg
                  ${billing.usage.overage.enabled ? 'left-8' : 'left-1'}
                `} />
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Add-On Packs */}
      {billing.addons && billing.addons.length > 0 && (
        <Card className="mb-6" id="addons-section">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-green-500/20 flex items-center justify-center border border-emerald-500/20">
              <Package size={22} className="text-emerald-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Need More Minutes?</h3>
              <p className="text-sm text-slate-400">One-time add-on packs that never expire</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {billing.addons.map(addon => (
              <div
                key={addon.id}
                className="p-5 bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-slate-700 hover:border-emerald-500/50 transition-all hover:shadow-lg hover:shadow-emerald-500/5 group"
              >
                <div className="flex justify-between items-start mb-3">
                  <h4 className="font-semibold text-white group-hover:text-emerald-400 transition-colors">{addon.name}</h4>
                  <span className="text-2xl font-bold text-emerald-400">${addon.price}</span>
                </div>
                <p className="text-sm text-slate-400 mb-4">{addon.description}</p>
                {canManage && (
                  <button
                    onClick={() => handleBuyAddon(addon.id)}
                    disabled={addonLoading === addon.id}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2 group-hover:shadow-lg group-hover:shadow-emerald-500/20"
                  >
                    {addonLoading === addon.id ? (
                      <RefreshCw size={16} className="animate-spin" />
                    ) : (
                      <>
                        <Plus size={16} />
                        Buy Now
                      </>
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Invoices */}
      <Card>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-700/50 flex items-center justify-center">
              <FileText size={18} className="text-slate-400" />
            </div>
            <h3 className="font-semibold text-white">Invoice History</h3>
          </div>
          {billing.subscription && canManage && (
            <button
              onClick={handleManageBilling}
              className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
            >
              View All <ExternalLink size={14} />
            </button>
          )}
        </div>

        {invoices.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <FileText size={40} className="mx-auto mb-3 opacity-50" />
            <p>No invoices yet</p>
            <p className="text-sm mt-1">Invoices will appear here after your first payment</p>
          </div>
        ) : (
          <div className="space-y-2">
            {invoices.slice(0, 5).map(invoice => (
              <div
                key={invoice.id}
                className="flex items-center justify-between p-4 bg-slate-900/50 rounded-xl hover:bg-slate-900/80 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center">
                    <FileText size={18} className="text-slate-400" />
                  </div>
                  <div>
                    <p className="font-medium text-white">{invoice.number}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(invoice.created).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-lg font-semibold text-white">
                    ${invoice.amount.toFixed(2)}
                  </span>
                  <Badge variant={invoice.status === 'paid' ? 'success' : 'warning'}>
                    {invoice.status}
                  </Badge>
                  {invoice.pdfUrl && (
                    <a
                      href={invoice.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 transition-colors"
                    >
                      <ExternalLink size={16} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Plans Selection Modal - Professional SaaS Design */}
      {showPlansModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop with blur */}
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={() => setShowPlansModal(false)}
          />

          {/* Modal */}
          <div className="relative w-full max-w-6xl max-h-[90vh] overflow-auto bg-gradient-to-b from-slate-900 to-slate-950 rounded-3xl border border-slate-700/50 shadow-2xl shadow-black/50">
            {/* Close button */}
            <button
              onClick={() => setShowPlansModal(false)}
              className="absolute top-6 right-6 p-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all z-10"
            >
              <X size={20} />
            </button>

            {/* Header */}
            <div className="text-center pt-12 pb-8 px-6 border-b border-slate-800/50">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-400 text-sm font-medium mb-4">
                <Sparkles size={14} />
                Simple, transparent pricing
              </div>
              <h2 className="text-4xl font-bold text-white mb-3">
                Choose Your Plan
              </h2>
              <p className="text-slate-400 max-w-xl mx-auto text-lg">
                Scale your business with the right plan. All plans include a 7-day free trial.
              </p>
            </div>

            {/* Plans Grid */}
            <div className="p-8 lg:p-10">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {PLANS.map((plan) => {
                  const isCurrentPlan = billing?.plan.id === plan.id;
                  const isDowngrade = billing?.plan.id === 'SCALE' ||
                    (billing?.plan.id === 'BUSINESS_PRO' && plan.id === 'STARTER');
                  const Icon = plan.icon;

                  return (
                    <div
                      key={plan.id}
                      className={`
                        relative rounded-2xl transition-all duration-300
                        ${plan.popular
                          ? 'ring-2 ring-purple-500 shadow-2xl shadow-purple-500/20 scale-[1.02]'
                          : 'ring-1 ring-slate-700 hover:ring-slate-600'
                        }
                        ${isCurrentPlan && !plan.popular ? 'ring-2 ring-emerald-500' : ''}
                      `}
                    >
                      {/* Popular Badge - positioned outside card flow */}
                      {plan.popular && (
                        <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white text-center py-2.5 text-sm font-semibold flex items-center justify-center gap-2 rounded-t-2xl">
                          <Sparkles size={14} />
                          Most Popular
                        </div>
                      )}

                      {/* Current Plan Badge - positioned outside card flow */}
                      {isCurrentPlan && !plan.popular && (
                        <div className="bg-emerald-600 text-white text-center py-2.5 text-sm font-semibold flex items-center justify-center gap-2 rounded-t-2xl">
                          <CheckCircle size={14} />
                          Current Plan
                        </div>
                      )}

                      <div className={`p-6 lg:p-8 bg-gradient-to-b from-slate-800/50 to-slate-900/80 ${!plan.popular && !isCurrentPlan ? 'rounded-2xl' : 'rounded-b-2xl'}`}>
                        {/* Plan Header */}
                        <div className="text-center mb-6">
                          <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
                          <p className="text-sm text-slate-400">{plan.description}</p>
                        </div>

                        {/* Price */}
                        <div className="text-center mb-8 py-6 rounded-xl bg-slate-900/50 border border-slate-700/50">
                          <div className="flex items-baseline justify-center gap-1">
                            <span className="text-slate-400 text-2xl">$</span>
                            <span className="text-5xl font-bold text-white">{plan.price}</span>
                          </div>
                          <p className="text-slate-500 text-sm mt-2">per month, billed monthly</p>
                        </div>

                        {/* Features */}
                        <ul className="space-y-3 mb-8">
                          {plan.features.map((feature, i) => (
                            <li
                              key={i}
                              className={`flex items-center gap-3 text-sm ${
                                feature.included ? 'text-slate-300' : 'text-slate-500'
                              }`}
                            >
                              {feature.included ? (
                                <CheckCircle size={18} className="text-emerald-400 flex-shrink-0" />
                              ) : (
                                <XCircle size={18} className="text-slate-600 flex-shrink-0" />
                              )}
                              <span className={!feature.included ? 'line-through' : ''}>
                                {feature.text}
                              </span>
                            </li>
                          ))}
                        </ul>

                        {/* CTA Button */}
                        <button
                          onClick={() => {
                            if (!isCurrentPlan && !isDowngrade) {
                              setShowPlansModal(false);
                              handleUpgrade(plan.id);
                            }
                          }}
                          disabled={actionLoading || isCurrentPlan || isDowngrade}
                          className={`
                            w-full py-3.5 px-4 rounded-xl font-semibold text-sm
                            transition-all duration-200 transform flex items-center justify-center gap-2
                            ${isCurrentPlan
                              ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                              : isDowngrade
                                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                                : plan.popular
                                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-500 hover:to-pink-500 hover:scale-[1.02] shadow-lg shadow-purple-500/25'
                                  : 'bg-slate-700 text-white hover:bg-slate-600'
                            }
                            disabled:hover:scale-100
                          `}
                        >
                          {actionLoading ? (
                            <RefreshCw size={18} className="animate-spin" />
                          ) : isCurrentPlan ? (
                            'Current Plan'
                          ) : isDowngrade ? (
                            'Your current plan has more features'
                          ) : (
                            <>
                              {plan.cta}
                              <ArrowRight size={16} />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Enterprise CTA */}
              <div className="mt-10 p-8 rounded-2xl bg-gradient-to-r from-slate-800/80 via-purple-900/20 to-slate-800/80 border border-slate-700/50 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 via-pink-500/5 to-purple-500/5" />
                <div className="relative flex flex-col lg:flex-row items-center justify-between gap-6">
                  <div className="flex items-center gap-4 text-center lg:text-left">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 flex items-center justify-center">
                      <Building2 size={28} className="text-purple-400" />
                    </div>
                    <div>
                      <h4 className="text-xl font-bold text-white mb-1">Need a custom enterprise solution?</h4>
                      <p className="text-slate-400">
                        Get custom limits, dedicated support, SLA guarantees, and more.
                      </p>
                    </div>
                  </div>
                  <a
                    href="mailto:support@hekax.com?subject=Enterprise%20Plan%20Inquiry&body=Hi%20HEKAX%20Team,%0A%0AI'm%20interested%20in%20learning%20more%20about%20your%20enterprise%20plans.%0A%0ACompany:%20%0AExpected%20call%20volume:%20%0ASpecific%20requirements:%20%0A%0AThank%20you!"
                    className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold rounded-xl transition-all hover:scale-105 shadow-lg shadow-purple-500/25 whitespace-nowrap"
                  >
                    <Mail size={18} />
                    Contact Sales
                  </a>
                </div>
                <p className="relative text-slate-500 text-sm mt-4 text-center lg:text-left">
                  Email us at <span className="text-purple-400">support@hekax.com</span> for custom pricing
                </p>
              </div>

              {/* Trust badges */}
              <div className="mt-8 flex flex-wrap justify-center gap-8 text-sm text-slate-500">
                <span className="flex items-center gap-2">
                  <CheckCircle size={16} className="text-emerald-500" />
                  No hidden fees
                </span>
                <span className="flex items-center gap-2">
                  <Shield size={16} className="text-emerald-500" />
                  Secure payments via Stripe
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle size={16} className="text-emerald-500" />
                  24/7 AI receptionist
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle size={16} className="text-emerald-500" />
                  USA & Canada coverage
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
