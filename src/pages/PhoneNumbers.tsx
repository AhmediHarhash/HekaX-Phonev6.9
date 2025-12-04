// ============================================================================
// HEKAX Phone - Phone Numbers Page
// Phase 5: Multi-tenant SaaS Infrastructure
// ============================================================================

import { useState, useEffect } from 'react';
import { 
  Phone, 
  Plus, 
  Search,
  Settings,
  Trash2,
  RefreshCw,
  Check,
  X,
  AlertCircle,
  Loader2,
  CreditCard,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/layout';
import { Card, LoadingSpinner, EmptyState, Modal, Button, Badge } from '../components/common';
import { api } from '../utils/api';
import { formatPhoneNumber, formatRelativeTime } from '../utils/formatters';
import type { PhoneNumber } from '../types';

interface AvailableNumber {
  number: string;
  friendlyName: string;
  locality?: string;
  region?: string;
  capabilities?: {
    voice?: boolean;
    SMS?: boolean;
    MMS?: boolean;
    fax?: boolean;
  };
}

interface SearchResult {
  numbers: AvailableNumber[];
  capabilities?: {
    voiceEnabled?: boolean;
    smsEnabled?: boolean;
    mmsEnabled?: boolean;
    faxEnabled?: boolean;
  };
  message?: string;
}

interface BillingStatus {
  plan: string;
  isTrial: boolean;
  hasPaymentMethod: boolean;
  canPurchase: boolean;
  requiresUpgrade: boolean;
  requiresPaymentMethod: boolean;
  paymentMethod?: {
    last4: string;
    brand: string;
  };
}

export function PhoneNumbersPage() {
  const { user, org } = useAuth();
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [selectedNumber, setSelectedNumber] = useState<PhoneNumber | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  // Billing status
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);

  // Add modal state
  const [searching, setSearching] = useState(false);
  const [areaCode, setAreaCode] = useState('');
  const [availableNumbers, setAvailableNumbers] = useState<AvailableNumber[]>([]);
  const [capabilityMessage, setCapabilityMessage] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState(false);

  const canManage = user?.role === 'OWNER' || user?.role === 'ADMIN';

  useEffect(() => {
    fetchPhoneNumbers();
    fetchBillingStatus();
  }, []);

  const fetchPhoneNumbers = async () => {
    try {
      setLoading(true);
      const data = await api.get<PhoneNumber[]>('/api/phone-numbers');
      setPhoneNumbers(data);
    } catch (err) {
      console.error('Phone numbers fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBillingStatus = async () => {
    try {
      const data = await api.get<BillingStatus>('/api/billing/status');
      setBillingStatus(data);
    } catch (err) {
      console.error('Billing status error:', err);
    }
  };

  const handleAddNumberClick = () => {
    // Check billing status before allowing add
    if (billingStatus?.isTrial) {
      setShowBillingModal(true);
      return;
    }
    if (billingStatus?.requiresPaymentMethod) {
      setShowBillingModal(true);
      return;
    }
    setShowAddModal(true);
  };

  const searchAvailableNumbers = async () => {
    if (!areaCode || areaCode.length !== 3) return;
    
    setSearching(true);
    setAvailableNumbers([]);
    setCapabilityMessage(null);

    try {
      const data = await api.get<SearchResult>(`/api/phone-numbers/available?areaCode=${areaCode}`);
      setAvailableNumbers(data.numbers || []);
      if (data.message) {
        setCapabilityMessage(data.message);
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to search phone numbers' });
    } finally {
      setSearching(false);
    }
  };

  const purchaseNumber = async (number: string) => {
    setPurchasing(true);
    setMessage(null);

    try {
      await api.post('/api/phone-numbers', { number });
      setMessage({ type: 'success', text: 'Phone number added successfully!' });
      setShowAddModal(false);
      setAvailableNumbers([]);
      setAreaCode('');
      fetchPhoneNumbers();
    } catch (err: any) {
      // Handle billing-related errors
      if (err.message?.includes('Trial') || err.message?.includes('TRIAL')) {
        setShowAddModal(false);
        setShowBillingModal(true);
        return;
      }
      if (err.message?.includes('payment') || err.message?.includes('Payment') || err.message?.includes('BILLING')) {
        setShowAddModal(false);
        setShowBillingModal(true);
        return;
      }
      setMessage({ type: 'error', text: err.message || 'Failed to add phone number' });
    } finally {
      setPurchasing(false);
    }
  };

  const updateNumber = async () => {
    if (!selectedNumber) return;

    try {
      await api.patch(`/api/phone-numbers/${selectedNumber.id}`, {
        friendlyName: selectedNumber.friendlyName,
        routeToAI: selectedNumber.routeToAI,
        greeting: selectedNumber.greeting,
      });
      setMessage({ type: 'success', text: 'Phone number updated!' });
      setShowEditModal(false);
      fetchPhoneNumbers();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update' });
    }
  };

  const deleteNumber = async (id: string) => {
    if (!confirm('Are you sure? This will release the phone number.')) return;

    try {
      await api.delete(`/api/phone-numbers/${id}`);
      setMessage({ type: 'success', text: 'Phone number released' });
      fetchPhoneNumbers();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to release' });
    }
  };

  const goToBilling = () => {
    // Use custom event for navigation (App.tsx listens for this)
    window.dispatchEvent(new CustomEvent('navigate', { detail: 'billing' }));
  };

  if (loading) {
    return <LoadingSpinner text="Loading phone numbers..." />;
  }

  return (
    <div>
      <PageHeader
        title="Phone Numbers"
        subtitle={`${phoneNumbers.length} phone number${phoneNumbers.length !== 1 ? 's' : ''}`}
        actions={
          canManage && (
            <Button onClick={handleAddNumberClick}>
              <Plus size={18} /> Add Number
            </Button>
          )
        }
      />

      {/* Trial/Billing Warning Banner */}
      {billingStatus?.isTrial && (
        <div className="mb-6 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
          <AlertTriangle size={20} className="text-amber-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-amber-300 font-medium">Trial Mode</p>
            <p className="text-amber-400/80 text-sm">
              Upgrade to a paid plan to purchase phone numbers and make real calls.
            </p>
          </div>
          <Button onClick={goToBilling} variant="secondary">
            Upgrade
          </Button>
        </div>
      )}

      {/* Message */}
      {message && (
        <div 
          className={`
            mb-6 p-4 rounded-lg flex items-center gap-3
            ${message.type === 'success' 
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' 
              : message.type === 'warning'
              ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
              : 'bg-red-500/10 border border-red-500/20 text-red-400'
            }
          `}
        >
          {message.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
          {message.text}
        </div>
      )}

      {/* Phone Numbers List */}
      {phoneNumbers.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Phone size={24} />}
            title="No phone numbers"
            description={billingStatus?.isTrial 
              ? "Upgrade to a paid plan to add phone numbers" 
              : "Add your first phone number to start receiving calls"
            }
            action={
              canManage && (
                <Button onClick={handleAddNumberClick}>
                  <Plus size={18} /> Add Number
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {phoneNumbers.map(pn => (
            <Card key={pn.id} className="flex items-center gap-4">
              {/* Icon */}
              <div className="w-11 h-11 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Phone size={20} className="text-blue-400" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-white">{formatPhoneNumber(pn.number)}</p>
                <p className="text-sm text-slate-500">
                  {pn.friendlyName || 'No label'}
                </p>
              </div>

              {/* Routing Badge */}
              <Badge variant={pn.routeToAI ? 'success' : 'info'}>
                {pn.routeToAI ? 'AI' : 'Human'}
              </Badge>

              {/* Status */}
              <Badge variant={pn.status === 'active' ? 'success' : 'default'}>
                {pn.status}
              </Badge>

              {/* Actions */}
              {canManage && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSelectedNumber(pn);
                      setShowEditModal(true);
                    }}
                    className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700"
                  >
                    <Settings size={18} />
                  </button>
                  <button
                    onClick={() => deleteNumber(pn.id)}
                    className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Add Number Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setAvailableNumbers([]);
          setAreaCode('');
          setCapabilityMessage(null);
        }}
        title="Add Phone Number"
        size="lg"
      >
        <div className="space-y-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Search by Area Code (US)
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                value={areaCode}
                onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
                placeholder="e.g. 415"
                maxLength={3}
                className="
                  flex-1 px-4 py-2.5 rounded-lg
                  bg-slate-900 border border-slate-700
                  text-white placeholder-slate-500
                  focus:outline-none focus:border-blue-500
                "
              />
              <Button onClick={searchAvailableNumbers} disabled={searching || areaCode.length !== 3}>
                {searching ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                Search
              </Button>
            </div>
          </div>

          {/* Capability Message */}
          {capabilityMessage && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm flex items-center gap-2">
              <AlertTriangle size={16} />
              {capabilityMessage}
            </div>
          )}

          {/* Results */}
          {availableNumbers.length > 0 && (
            <div className="max-h-64 overflow-y-auto space-y-2">
              {availableNumbers.map(num => (
                <div
                  key={num.number}
                  className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-white">{formatPhoneNumber(num.number)}</p>
                    <p className="text-xs text-slate-500">
                      {num.locality && `${num.locality}, `}{num.region}
                    </p>
                  </div>
                  <Button
                    onClick={() => purchaseNumber(num.number)}
                    disabled={purchasing}
                  >
                    {purchasing ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                    Add
                  </Button>
                </div>
              ))}
            </div>
          )}

          {availableNumbers.length === 0 && areaCode.length === 3 && !searching && (
            <p className="text-center text-slate-500 py-4">
              No numbers found. Try a different area code.
            </p>
          )}
        </div>
      </Modal>

      {/* Billing Required Modal */}
      <Modal
        isOpen={showBillingModal}
        onClose={() => setShowBillingModal(false)}
        title="Payment Method Required"
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-center py-4">
            <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center">
              <CreditCard size={32} className="text-amber-400" />
            </div>
          </div>

          {billingStatus?.isTrial ? (
            <>
              <p className="text-center text-slate-300">
                You're currently on a <span className="font-semibold text-amber-400">Trial</span> plan.
              </p>
              <p className="text-center text-slate-400 text-sm">
                Upgrade to a paid plan to purchase phone numbers and make real calls. 
                Trial accounts can explore the dashboard but cannot buy real numbers.
              </p>
            </>
          ) : (
            <>
              <p className="text-center text-slate-300">
                To protect the platform from abuse, please add a payment method to activate phone numbers.
              </p>
              <p className="text-center text-slate-400 text-sm">
                Your card won't be charged until you purchase a number or upgrade your plan.
              </p>
            </>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowBillingModal(false)} className="flex-1">
              Cancel
            </Button>
            <Button onClick={goToBilling} className="flex-1">
              <CreditCard size={18} />
              {billingStatus?.isTrial ? 'Upgrade Plan' : 'Add Payment Method'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Phone Number"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button onClick={updateNumber}>Save Changes</Button>
          </>
        }
      >
        {selectedNumber && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Phone Number
              </label>
              <input
                type="text"
                value={formatPhoneNumber(selectedNumber.number)}
                disabled
                className="
                  w-full px-4 py-2.5 rounded-lg
                  bg-slate-900/50 border border-slate-700
                  text-slate-400 cursor-not-allowed
                "
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Label
              </label>
              <input
                type="text"
                value={selectedNumber.friendlyName || ''}
                onChange={(e) => setSelectedNumber({ ...selectedNumber, friendlyName: e.target.value })}
                placeholder="e.g. Main Line"
                className="
                  w-full px-4 py-2.5 rounded-lg
                  bg-slate-900 border border-slate-700
                  text-white placeholder-slate-500
                  focus:outline-none focus:border-blue-500
                "
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Custom Greeting
              </label>
              <textarea
                value={selectedNumber.greeting || ''}
                onChange={(e) => setSelectedNumber({ ...selectedNumber, greeting: e.target.value })}
                placeholder="Leave empty to use default greeting"
                rows={2}
                className="
                  w-full px-4 py-3 rounded-lg
                  bg-slate-900 border border-slate-700
                  text-white placeholder-slate-500
                  focus:outline-none focus:border-blue-500
                  resize-none
                "
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-slate-300">
                  Route to AI
                </label>
                <p className="text-xs text-slate-500">
                  AI will answer calls to this number
                </p>
              </div>
              <label className="relative inline-block w-12 h-6 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedNumber.routeToAI}
                  onChange={(e) => setSelectedNumber({ ...selectedNumber, routeToAI: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-12 h-6 rounded-full bg-slate-700 peer-checked:bg-emerald-600 transition-colors" />
                <div className="absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-6" />
              </label>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}