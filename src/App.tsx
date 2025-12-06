// ============================================================================
// HEKAX Phone - Main App Component
// Phase 6.3: Updated with Multi-Org Support + Performance Optimization
// ============================================================================

import { useState, useEffect, lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PreferencesProvider } from './context/PreferencesContext';
import { Sidebar } from './components/layout';
import { LoadingSpinner, CreateOrgModal } from './components/common';
import { InstallPrompt, UpdateNotification } from './components/pwa';

// Lazy load pages for better bundle splitting
const LoginPage = lazy(() => import('./pages/Login').then(m => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.DashboardPage })));
const CallsPage = lazy(() => import('./pages/Calls').then(m => ({ default: m.CallsPage })));
const LeadsPage = lazy(() => import('./pages/Leads').then(m => ({ default: m.LeadsPage })));
const SoftphonePage = lazy(() => import('./pages/Softphone').then(m => ({ default: m.SoftphonePage })));
const TeamPage = lazy(() => import('./pages/Team').then(m => ({ default: m.TeamPage })));
const SettingsPage = lazy(() => import('./pages/Settings').then(m => ({ default: m.SettingsPage })));
const PhoneNumbersPage = lazy(() => import('./pages/PhoneNumbers').then(m => ({ default: m.PhoneNumbersPage })));
const AnalyticsPage = lazy(() => import('./pages/Analytics').then(m => ({ default: m.AnalyticsPage })));
const AuditLogsPage = lazy(() => import('./pages/AuditLogs').then(m => ({ default: m.AuditLogsPage })));
const BillingPage = lazy(() => import('./pages/Billing').then(m => ({ default: m.BillingPage })));
const OnboardingWizard = lazy(() => import('./pages/Onboarding').then(m => ({ default: m.OnboardingWizard })));
const EnterprisePage = lazy(() => import('./pages/Enterprise').then(m => ({ default: m.EnterprisePage })));
const DataManagementPage = lazy(() => import('./pages/DataManagement').then(m => ({ default: m.DataManagementPage })));
const AITrainingPage = lazy(() => import('./pages/AITraining').then(m => ({ default: m.AITrainingPage })));
const ChannelsPage = lazy(() => import('./pages/Channels').then(m => ({ default: m.ChannelsPage })));
const AutomationPage = lazy(() => import('./pages/Automation').then(m => ({ default: m.AutomationPage })));

import type { Page } from './types';

// Page loading fallback
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[400px]">
    <LoadingSpinner text="Loading..." />
  </div>
);

// Main app content (requires auth)
function AppContent() {
  const { isAuthenticated, isLoading, user, org, refreshUser } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showCreateOrgModal, setShowCreateOrgModal] = useState(false);

  // Check if onboarding needed for current org
  useEffect(() => {
    if (user && org && !org.onboardingCompleted) {
      setShowOnboarding(true);
    } else {
      setShowOnboarding(false);
    }
  }, [user, org]);

  // Listen for navigation events from child components
  useEffect(() => {
    const handleNavigate = (event: CustomEvent) => {
      const page = event.detail as Page;
      if (page) {
        setCurrentPage(page);
      }
    };

    window.addEventListener('navigate', handleNavigate as EventListener);
    return () => {
      window.removeEventListener('navigate', handleNavigate as EventListener);
    };
  }, []);

  // Loading state
  if (isLoading) {
    return <LoadingSpinner fullScreen text="Loading..." />;
  }

  // Not authenticated - show login
  if (!isAuthenticated) {
    return (
      <Suspense fallback={<LoadingSpinner fullScreen text="Loading..." />}>
        <LoginPage />
      </Suspense>
    );
  }

  // Show onboarding for new orgs
  if (showOnboarding) {
    return (
      <Suspense fallback={<LoadingSpinner fullScreen text="Loading..." />}>
        <OnboardingWizard
          onComplete={() => {
            setShowOnboarding(false);
            refreshUser?.();
          }}
        />
      </Suspense>
    );
  }

  // Handle new org creation
  const handleOrgCreated = async (_newOrg: { id: string; name: string }) => {
    // Switch to the new org and show onboarding
    await refreshUser?.();
    setShowOnboarding(true);
  };

  // Render current page
  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardPage />;
      case 'calls':
        return <CallsPage />;
      case 'leads':
        return <LeadsPage />;
      case 'softphone':
        return <SoftphonePage />;
      case 'team':
        return <TeamPage />;
      case 'settings':
        return <SettingsPage />;
      case 'phone-numbers':
        return <PhoneNumbersPage />;
      case 'analytics':
        return <AnalyticsPage />;
      case 'audit-logs':
        return <AuditLogsPage />;
      case 'billing':
        return <BillingPage />;
      case 'enterprise':
        return <EnterprisePage />;
      case 'data-management':
        return <DataManagementPage />;
      case 'ai-training':
        return <AITrainingPage />;
      case 'channels':
        return <ChannelsPage />;
      case 'automation':
        return <AutomationPage />;
      default:
        return <DashboardPage />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Sidebar with org switcher */}
      <Sidebar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        onCreateOrg={() => setShowCreateOrgModal(true)}
      />

      {/* Main Content - responsive margin for mobile/desktop */}
      <main className="lg:ml-64 min-h-screen p-4 lg:p-6 pt-20 lg:pt-6">
        <div className="max-w-7xl mx-auto">
          <Suspense fallback={<PageLoader />}>
            {renderPage()}
          </Suspense>
        </div>
      </main>

      {/* Create Organization Modal */}
      <CreateOrgModal
        isOpen={showCreateOrgModal}
        onClose={() => setShowCreateOrgModal(false)}
        onCreated={handleOrgCreated}
      />
    </div>
  );
}

// Root App with providers
export default function App() {
  return (
    <PreferencesProvider>
      <AuthProvider>
        <AppContent />
        {/* PWA Components */}
        <InstallPrompt />
        <UpdateNotification />
      </AuthProvider>
    </PreferencesProvider>
  );
}
