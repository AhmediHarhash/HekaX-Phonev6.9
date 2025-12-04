// ============================================================================
// HEKAX Phone - Billing Page
// Phase 6.8 + 6.9: Add-On Purchases + Usage Alerts UI
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
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/layout';
import { Card, LoadingSpinner, Badge, Modal, Button } from '../components/common';
import { api } from '../utils/api';

// Plans configuration for the upgrade modal
const PLANS = [
  {
    id: 'STARTER',
    name: 'Starter',
    price: 99,
    description: 'Perfect for small businesses',
    features: [
      '1,000 call minutes/mo',
      '300 AI minutes/mo',
      '2 team members',
      '1 phone number',
      'Basic analytics',
    ],
    popular: false,
  },
  {
    id: 'BUSINESS_PRO',
    name: 'Business Pro',
    price: 499,
    description: 'For growing businesses',
    features: [
      '4,000 call minutes/mo',
      '2,000 AI minutes/mo',
      '10 team members',
      '5 phone numbers',
      'Advanced analytics',
      'Priority support',
      'Overage protection',
    ],
    popular: true,
  },
  {
    id: 'SCALE',
    name: 'Scale',
    price: 799,
    description: 'For high-volume operations',
    features: [
      '8,000 call minutes/mo',
      '4,000 AI minutes/mo',
      '20 team members',
      '5 phone numbers',
      'Enterprise analytics',
      'Dedicated support',
      'Overage protection',
      'Custom integrations',
    ],
    popular: false,
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
    <div>
      <PageHeader
        title="Billing & Usage"
        subtitle="Manage your subscription and monitor usage"
        actions={
          <button 
            onClick={fetchBilling}
            className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
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
                p-4 rounded-lg flex items-start gap-3
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
                {/* Action buttons for usage alerts */}
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
                className="text-slate-500 hover:text-slate-300"
              >
                <X size={18} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Trial Banner */}
      {billing.trial && (
        <Card className="mb-6 bg-gradient-to-r from-blue-600/20 to-purple-600/20 border-blue-500/30">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">Trial Period</h3>
              <p className="text-slate-300">
                {billing.trial.daysLeft > 0 
                  ? `${billing.trial.daysLeft} days remaining`
                  : 'Your trial has ended'
                }
              </p>
            </div>
            {canManage && (
              <button
                onClick={() => setShowPlansModal(true)}
                disabled={actionLoading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {actionLoading ? <RefreshCw size={18} className="animate-spin" /> : 'Choose a Plan'}
              </button>
            )}
          </div>
        </Card>
      )}

      {/* Plan & Subscription */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-white">
                {billing.plan.id === 'TRIAL' ? 'Free Trial' : billing.plan.name}
              </h3>
              <p className="text-slate-400">
                {billing.plan.id === 'TRIAL' || billing.plan.price === 0
                  ? 'Explore all features before subscribing'
                  : `$${billing.plan.price}/month`
                }
              </p>
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
            <div className="grid grid-cols-2 gap-4 mb-6 p-4 bg-slate-900/50 rounded-lg">
              <div>
                <p className="text-xs text-slate-500 mb-1">Current Period</p>
                <p className="text-sm text-slate-300">
                  {new Date(billing.subscription.currentPeriodStart).toLocaleDateString()} 
                  {' → '}
                  {new Date(billing.subscription.currentPeriodEnd).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Next Billing</p>
                <p className="text-sm text-slate-300">
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
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  Choose a Plan
                </button>
              ) : (
                <>
                  <button
                    onClick={handleManageBilling}
                    disabled={actionLoading}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    <CreditCard size={18} />
                    Manage Billing
                  </button>
                  {billing.plan.id !== 'SCALE' && (
                    <button
                      onClick={() => setShowPlansModal(true)}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                      Upgrade
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </Card>

        {/* Quick Stats */}
        <Card>
          <h3 className="font-semibold text-white mb-4">Plan Limits</h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Call Minutes</span>
              <span className="text-white">{billing.usage.callMinutes.limit.toLocaleString()}/mo</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">AI Minutes</span>
              <span className="text-white">{billing.usage.aiMinutes.limit.toLocaleString()}/mo</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Team Members</span>
              <span className="text-white">{billing.usage.users.limit}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Phone Numbers</span>
              <span className="text-white">{billing.usage.phoneNumbers.limit}</span>
            </div>
          </div>
        </Card>
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
                <p className="text-sm text-slate-400">US & Canada</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-white">
                {billing.usage.callMinutes.used.toLocaleString()}
              </p>
              <p className="text-sm text-slate-400">
                of {billing.usage.callMinutes.limit.toLocaleString()}
              </p>
            </div>
          </div>
          <div className="w-full h-3 bg-slate-700 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                billing.usage.callMinutes.percent >= 90 ? 'bg-red-500' :
                billing.usage.callMinutes.percent >= 80 ? 'bg-amber-500' :
                'bg-gradient-to-r from-blue-500 to-blue-400'
              }`}
              style={{ width: `${Math.min(billing.usage.callMinutes.percent, 100)}%` }}
            />
          </div>
          <div className="flex justify-between mt-2">
            <p className="text-sm text-slate-500">
              {billing.usage.callMinutes.remaining.toLocaleString()} remaining
            </p>
            {billing.usage.callMinutes.addonRemaining && billing.usage.callMinutes.addonRemaining > 0 && (
              <p className="text-sm text-blue-400">
                +{billing.usage.callMinutes.addonRemaining.toLocaleString()} add-on
              </p>
            )}
          </div>
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
                <p className="text-sm text-slate-400">STT + LLM + TTS</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-white">
                {billing.usage.aiMinutes.used.toLocaleString()}
              </p>
              <p className="text-sm text-slate-400">
                of {billing.usage.aiMinutes.limit.toLocaleString()}
              </p>
            </div>
          </div>
          <div className="w-full h-3 bg-slate-700 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                billing.usage.aiMinutes.percent >= 90 ? 'bg-red-500' :
                billing.usage.aiMinutes.percent >= 80 ? 'bg-amber-500' :
                'bg-gradient-to-r from-purple-500 to-purple-400'
              }`}
              style={{ width: `${Math.min(billing.usage.aiMinutes.percent, 100)}%` }}
            />
          </div>
          <div className="flex justify-between mt-2">
            {billing.usage.aiMinutes.inGracePeriod ? (
              <p className="text-sm text-amber-400">
                ⚠️ Grace period active - AI will pause after 48 hours
              </p>
            ) : (
              <p className="text-sm text-slate-500">
                {billing.usage.aiMinutes.remaining.toLocaleString()} remaining
              </p>
            )}
            {billing.usage.aiMinutes.addonRemaining && billing.usage.aiMinutes.addonRemaining > 0 && (
              <p className="text-sm text-purple-400">
                +{billing.usage.aiMinutes.addonRemaining.toLocaleString()} add-on
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* Overage Settings */}
      {billing.plan.id !== 'TRIAL' && billing.usage.overage && canManage && (
        <Card className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
                <Settings size={20} className="text-amber-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Overage Settings</h3>
                <p className="text-sm text-slate-400">
                  {billing.usage.overage.enabled 
                    ? `Enabled - cap $${billing.usage.overage.capDollars}/month`
                    : 'Disabled - AI will pause when limits hit'
                  }
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {billing.usage.overage.enabled && (
                <div className="text-right">
                  <p className="text-sm text-slate-400">Used this period</p>
                  <p className="text-lg font-semibold text-white">
                    ${billing.usage.overage.usedDollars.toFixed(2)} / ${billing.usage.overage.capDollars}
                  </p>
                </div>
              )}
              <button
                onClick={handleToggleOverage}
                className={`
                  relative w-12 h-6 rounded-full transition-colors
                  ${billing.usage.overage.enabled ? 'bg-blue-600' : 'bg-slate-600'}
                `}
              >
                <div className={`
                  absolute top-1 w-4 h-4 rounded-full bg-white transition-transform
                  ${billing.usage.overage.enabled ? 'left-7' : 'left-1'}
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
            <div className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center">
              <Package size={20} className="text-green-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Buy More Minutes</h3>
              <p className="text-sm text-slate-400">One-time add-on packs</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {billing.addons.map(addon => (
              <div 
                key={addon.id}
                className="p-4 bg-slate-900/50 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors"
              >
                <div className="flex justify-between items-start mb-3">
                  <h4 className="font-medium text-white">{addon.name}</h4>
                  <span className="text-lg font-bold text-green-400">${addon.price}</span>
                </div>
                <p className="text-sm text-slate-400 mb-4">{addon.description}</p>
                {canManage && (
                  <button
                    onClick={() => handleBuyAddon(addon.id)}
                    disabled={addonLoading === addon.id}
                    className="w-full py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white">Invoice History</h3>
          {billing.subscription && canManage && (
            <button
              onClick={handleManageBilling}
              className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              View All <ExternalLink size={14} />
            </button>
          )}
        </div>

        {invoices.length === 0 ? (
          <p className="text-center text-slate-500 py-8">No invoices yet</p>
        ) : (
          <div className="space-y-2">
            {invoices.slice(0, 5).map(invoice => (
              <div 
                key={invoice.id}
                className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <FileText size={18} className="text-slate-500" />
                  <div>
                    <p className="text-sm font-medium text-white">{invoice.number}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(invoice.created).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-white">
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
                      className="text-blue-400 hover:text-blue-300"
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

      {/* Plans Selection Modal */}
      <Modal
        isOpen={showPlansModal}
        onClose={() => setShowPlansModal(false)}
        title="Choose Your Plan"
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-slate-400 text-sm mb-6">
            Select the plan that best fits your business needs. All plans include a 7-day free trial.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PLANS.map((plan) => {
              const isCurrentPlan = billing?.plan.id === plan.id;
              const isDowngrade = billing?.plan.id === 'SCALE' ||
                (billing?.plan.id === 'BUSINESS_PRO' && plan.id === 'STARTER');

              return (
                <div
                  key={plan.id}
                  className={`
                    relative p-5 rounded-xl border transition-all
                    ${plan.popular
                      ? 'border-blue-500 bg-blue-500/5'
                      : 'border-slate-700 bg-slate-800/50'
                    }
                    ${isCurrentPlan ? 'ring-2 ring-emerald-500' : ''}
                  `}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded-full">
                      Most Popular
                    </div>
                  )}
                  {isCurrentPlan && (
                    <div className="absolute -top-3 right-4 px-3 py-1 bg-emerald-600 text-white text-xs font-medium rounded-full">
                      Current Plan
                    </div>
                  )}

                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
                    <p className="text-sm text-slate-400">{plan.description}</p>
                  </div>

                  <div className="mb-4">
                    <span className="text-3xl font-bold text-white">${plan.price}</span>
                    <span className="text-slate-400">/month</span>
                  </div>

                  <ul className="space-y-2 mb-6">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-slate-300">
                        <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <Button
                    onClick={() => {
                      setShowPlansModal(false);
                      handleUpgrade(plan.id);
                    }}
                    disabled={actionLoading || isCurrentPlan}
                    className="w-full"
                    variant={plan.popular ? 'primary' : 'secondary'}
                  >
                    {isCurrentPlan ? 'Current Plan' : isDowngrade ? 'Contact Support' : 'Select Plan'}
                  </Button>
                </div>
              );
            })}
          </div>

          <p className="text-center text-xs text-slate-500 mt-4">
            Need more? Contact us for custom enterprise pricing.
          </p>
        </div>
      </Modal>
    </div>
  );
}
