// ============================================================================
// HEKAX Phone - Sidebar Component
// Phase 6.3: Updated with Organization Switcher + Mobile Responsive
// ============================================================================

import { useState, useEffect } from 'react';
import {
  Phone,
  LayoutDashboard,
  PhoneCall,
  Target,
  Users,
  Settings,
  LogOut,
  User,
  ChevronRight,
  BarChart3,
  Shield,
  PhoneForwarded,
  CreditCard,
  Key,
  Database,
  Menu,
  X,
  Brain,
  MessageSquare,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { OrganizationSwitcher } from './OrganizationSwitcher';
import type { Page } from '../../types';

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onCreateOrg?: () => void;
}

const navItems: { id: Page; label: string; icon: typeof Phone }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'calls', label: 'Calls', icon: PhoneCall },
  { id: 'leads', label: 'Leads', icon: Target },
  { id: 'softphone', label: 'Softphone', icon: Phone },
  { id: 'phone-numbers', label: 'Phone Numbers', icon: PhoneForwarded },
  { id: 'channels', label: 'Channels', icon: MessageSquare },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'automation', label: 'Automation', icon: Zap },
  { id: 'ai-training', label: 'AI Training', icon: Brain },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'enterprise', label: 'Advanced', icon: Key },
  { id: 'data-management', label: 'Data', icon: Database },
  { id: 'audit-logs', label: 'Audit Logs', icon: Shield },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function Sidebar({ currentPage, onNavigate, onCreateOrg }: SidebarProps) {
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile menu when navigating
  const handleNavigate = (page: Page) => {
    onNavigate(page);
    setMobileMenuOpen(false);
  };

  // Close menu on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="p-4 border-b border-slate-700/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
              <Phone size={20} className="text-white" />
            </div>
            <div>
              <span className="font-bold text-lg text-white">HEKAX</span>
              <span className="font-light text-lg text-slate-400 ml-1">Phone</span>
            </div>
          </div>
          {/* Close button for mobile */}
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Organization Switcher */}
      <div className="px-3 py-3 border-b border-slate-700/50">
        <OrganizationSwitcher onCreateNew={onCreateOrg} />
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;

          return (
            <button
              key={item.id}
              onClick={() => handleNavigate(item.id)}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                text-left text-sm font-medium transition-all duration-200
                ${isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }
              `}
            >
              <Icon size={20} />
              <span>{item.label}</span>
              {isActive && <ChevronRight size={16} className="ml-auto" />}
            </button>
          );
        })}
      </nav>

      {/* User Footer */}
      <div className="p-3 border-t border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center">
            <User size={18} className="text-slate-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {user?.name || 'User'}
            </p>
            <p className="text-xs text-slate-500 truncate capitalize">
              {user?.role?.toLowerCase() || 'member'}
            </p>
          </div>
          <button
            onClick={logout}
            className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Logout"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-slate-900 border-b border-slate-700/50 flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <Phone size={16} className="text-white" />
          </div>
          <span className="font-bold text-white">HEKAX</span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700"
        >
          <Menu size={24} />
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-50"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={`
          lg:hidden fixed left-0 top-0 h-screen w-72 bg-slate-800 border-r border-slate-700/50
          flex flex-col z-50 transform transition-transform duration-300 ease-in-out
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <SidebarContent />
      </aside>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-64 bg-slate-800/50 border-r border-slate-700/50 flex-col z-40">
        <SidebarContent />
      </aside>
    </>
  );
}
