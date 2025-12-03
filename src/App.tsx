// ============================================================================
// HEKAX Phone - Main App Component
// Phase 6.3: Updated with Multi-Org Support
// ============================================================================

import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Sidebar } from './components/layout';
import { LoadingSpinner, CreateOrgModal } from './components/common';
import {
  LoginPage,
  DashboardPage,
  CallsPage,
  LeadsPage,
  SoftphonePage,
  TeamPage,
  SettingsPage,
  PhoneNumbersPage,
  AnalyticsPage,
  AuditLogsPage,
  BillingPage,
  OnboardingWizard,
  EnterprisePage,
  DataManagementPage,
} from './pages';
import type { Page } from './types';

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

  // Loading state
  if (isLoading) {
    return <LoadingSpinner fullScreen text="Loading..." />;
  }

  // Not authenticated - show login
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Show onboarding for new orgs
  if (showOnboarding) {
    return (
      <OnboardingWizard 
        onComplete={() => {
          setShowOnboarding(false);
          refreshUser?.();
        }} 
      />
    );
  }

  // Handle new org creation
  const handleOrgCreated = async (newOrg: { id: string; name: string }) => {
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

      {/* Main Content */}
      <main className="ml-64 min-h-screen p-6">
        <div className="max-w-7xl mx-auto">
          {renderPage()}
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
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
