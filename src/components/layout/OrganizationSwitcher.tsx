// ============================================================================
// HEKAX Phone - Organization Switcher Component
// Phase 6.3: Multi-Org Support
// ============================================================================

import { useState, useEffect, useRef } from 'react';
import {
  Building,
  ChevronDown,
  Check,
  Plus,
  Settings,
  LogOut,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../utils/api';

interface Organization {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  plan: string;
  role: string;
  isPrimary: boolean;
}

interface OrgSwitcherProps {
  onCreateNew?: () => void;
}

export function OrganizationSwitcher({ onCreateNew }: OrgSwitcherProps) {
  const { org, refreshUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch organizations when dropdown opens
  useEffect(() => {
    if (isOpen && organizations.length === 0) {
      fetchOrganizations();
    }
  }, [isOpen]);

  const fetchOrganizations = async () => {
    setLoading(true);
    try {
      const data = await api.get<{ organizations: Organization[]; currentOrgId: string }>(
        '/api/user/organizations'
      );
      setOrganizations(data.organizations);
    } catch (err) {
      console.error('Failed to fetch organizations:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitch = async (organizationId: string) => {
    if (organizationId === org?.id) {
      setIsOpen(false);
      return;
    }

    setSwitching(true);
    try {
      await api.post('/api/user/organizations/switch', { organizationId });
      await refreshUser?.();
      setIsOpen(false);
      // Reload page to refresh all data
      window.location.reload();
    } catch (err) {
      console.error('Failed to switch organization:', err);
    } finally {
      setSwitching(false);
    }
  };

  const handleCreateNew = () => {
    setIsOpen(false);
    onCreateNew?.();
  };

  if (!org) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="
          flex items-center gap-3 w-full p-3 rounded-lg
          bg-slate-800/50 hover:bg-slate-700/50
          border border-slate-700/50
          transition-colors
        "
      >
        {/* Logo or Initial */}
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
          {org.logoUrl ? (
            <img src={org.logoUrl} alt={org.name} className="w-full h-full rounded-lg object-cover" />
          ) : (
            <span className="text-white font-bold text-sm">
              {org.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        {/* Name */}
        <div className="flex-1 text-left min-w-0">
          <p className="text-sm font-medium text-white truncate">{org.name}</p>
          <p className="text-xs text-slate-500 capitalize">{org.plan?.toLowerCase() || 'starter'}</p>
        </div>

        {/* Arrow */}
        <ChevronDown 
          size={16} 
          className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="
          absolute top-full left-0 right-0 mt-2 z-50
          bg-slate-800 border border-slate-700
          rounded-lg shadow-xl overflow-hidden
        ">
          {/* Organizations List */}
          <div className="max-h-64 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 size={20} className="animate-spin text-slate-400" />
              </div>
            ) : organizations.length === 0 ? (
              <div className="p-4 text-center text-slate-500 text-sm">
                No other organizations
              </div>
            ) : (
              organizations.map((orgItem) => (
                <button
                  key={orgItem.id}
                  onClick={() => handleSwitch(orgItem.id)}
                  disabled={switching}
                  className={`
                    flex items-center gap-3 w-full p-3 text-left
                    hover:bg-slate-700/50 transition-colors
                    ${orgItem.id === org.id ? 'bg-blue-500/10' : ''}
                  `}
                >
                  {/* Logo or Initial */}
                  <div className={`
                    w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
                    ${orgItem.id === org.id 
                      ? 'bg-gradient-to-br from-blue-500 to-purple-600' 
                      : 'bg-slate-700'
                    }
                  `}>
                    {orgItem.logoUrl ? (
                      <img src={orgItem.logoUrl} alt={orgItem.name} className="w-full h-full rounded-lg object-cover" />
                    ) : (
                      <span className="text-white font-medium text-xs">
                        {orgItem.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* Name & Role */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{orgItem.name}</p>
                    <p className="text-xs text-slate-500 capitalize">{orgItem.role.toLowerCase()}</p>
                  </div>

                  {/* Check if current */}
                  {orgItem.id === org.id && (
                    <Check size={16} className="text-blue-400 flex-shrink-0" />
                  )}

                  {/* Primary badge */}
                  {orgItem.isPrimary && orgItem.id !== org.id && (
                    <span className="text-xs bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">
                      Primary
                    </span>
                  )}
                </button>
              ))
            )}
          </div>

          {/* Actions */}
          <div className="border-t border-slate-700">
            <button
              onClick={handleCreateNew}
              className="
                flex items-center gap-3 w-full p-3
                text-slate-400 hover:text-white hover:bg-slate-700/50
                transition-colors
              "
            >
              <Plus size={18} />
              <span className="text-sm">Create New Organization</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
