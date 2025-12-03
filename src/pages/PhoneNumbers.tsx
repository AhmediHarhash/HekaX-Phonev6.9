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
}

export function PhoneNumbersPage() {
  const { user } = useAuth();
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedNumber, setSelectedNumber] = useState<PhoneNumber | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Add modal state
  const [searching, setSearching] = useState(false);
  const [areaCode, setAreaCode] = useState('');
  const [availableNumbers, setAvailableNumbers] = useState<AvailableNumber[]>([]);
  const [purchasing, setPurchasing] = useState(false);

  const canManage = user?.role === 'OWNER' || user?.role === 'ADMIN';

  useEffect(() => {
    fetchPhoneNumbers();
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

  const searchAvailableNumbers = async () => {
    if (!areaCode || areaCode.length !== 3) return;
    
    setSearching(true);
    setAvailableNumbers([]);

    try {
      const data = await api.get<AvailableNumber[]>(`/api/phone-numbers/available?areaCode=${areaCode}`);
      setAvailableNumbers(data);
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
            <Button onClick={() => setShowAddModal(true)}>
              <Plus size={18} /> Add Number
            </Button>
          )
        }
      />

      {/* Message */}
      {message && (
        <div 
          className={`
            mb-6 p-4 rounded-lg flex items-center gap-3
            ${message.type === 'success' 
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' 
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
            description="Add your first phone number to start receiving calls"
            action={
              canManage && (
                <Button onClick={() => setShowAddModal(true)}>
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
        }}
        title="Add Phone Number"
        size="lg"
      >
        <div className="space-y-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Search by Area Code
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
