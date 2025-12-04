// ============================================================================
// HEKAX Phone - Create Organization Modal
// Phase 6.3: Multi-Org Support
// ============================================================================

import { useState } from 'react';
import { Building, Loader2, X } from 'lucide-react';
import { Modal, Button } from '../common';
import { api } from '../../utils/api';

interface CreateOrgModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (org: { id: string; name: string }) => void;
}

const INDUSTRIES = [
  { id: 'general', name: 'General Business' },
  { id: 'legal', name: 'Law Firm' },
  { id: 'medical', name: 'Medical Office' },
  { id: 'realestate', name: 'Real Estate' },
  { id: 'restaurant', name: 'Restaurant' },
  { id: 'hvac', name: 'HVAC / Home Services' },
];

export function CreateOrgModal({ isOpen, onClose, onCreated }: CreateOrgModalProps) {
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('general');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('Organization name is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const data = await api.post<{ organization: { id: string; name: string } }>(
        '/api/user/organizations',
        { name: name.trim(), industry }
      );
      
      onCreated(data.organization);
      setName('');
      setIndustry('general');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create organization');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Organization"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !name.trim()}>
            {loading && <Loader2 size={18} className="animate-spin" />}
            Create Organization
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Organization Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Smith Law Firm"
            className="
              w-full px-4 py-3 rounded-lg
              bg-slate-900 border border-slate-700
              text-white placeholder-slate-500
              focus:outline-none focus:border-blue-500
            "
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Industry
          </label>
          <select
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="
              w-full px-4 py-3 rounded-lg
              bg-slate-900 border border-slate-700
              text-white
              focus:outline-none focus:border-blue-500
            "
          >
            {INDUSTRIES.map((ind) => (
              <option key={ind.id} value={ind.id}>
                {ind.name}
              </option>
            ))}
          </select>
        </div>

        <div className="p-3 bg-slate-900/50 rounded-lg">
          <p className="text-xs text-slate-400">
            Creating a new organization will start you on a 7-day trial. You'll need to complete the onboarding wizard to set up your AI receptionist.
          </p>
        </div>
      </form>
    </Modal>
  );
}
