/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import type { TabType, User, Client, Invoice, DashboardStats, SubscriptionDetails } from './types.js';
import { api } from './api.js';
import { auth, onAuthStateChanged } from './firebase.js';
import { Navbar } from './components/Navbar.js';
import { DashboardView } from './components/DashboardView.js';
import { InvoicesView } from './components/InvoicesView.js';
import { ClientsView } from './components/ClientsView.js';
import { RemindersView } from './components/RemindersView.js';
import { ActivityView } from './components/ActivityView.js';
import { SettingsView } from './components/SettingsView.js';
import { BillingView } from './components/BillingView.js';
import { InvoiceModal } from './components/InvoiceModal.js';
import { ClientModal } from './components/ClientModal.js';
import { PrintInvoiceModal } from './components/PrintInvoiceModal.js';
import { SendReminderModal } from './components/SendReminderModal.js';
import { UpgradePromptModal } from './components/UpgradePromptModal.js';
import { AuthScreen } from './components/AuthScreen.js';
import { EmailVerificationView } from './components/EmailVerificationView.js';
import { LandingPage } from './components/LandingPage.js';
import { TermsModal } from './components/TermsModal.js';
import { LegalPages, type LegalTab } from './components/LegalPages.js';
import { ReceiptoLogo } from './components/ReceiptoLogo.js';
import { ContactSupportModal } from './components/ContactSupportModal.js';
import { ToastContainer, type ToastMessage } from './components/Toast.js';
import { AdminPanel } from './components/AdminPanel.js';

interface UnverifiedState {
  user: User;
  deliveryStatus?: 'sent' | 'not_configured' | 'error';
  devOtp?: string;
  message?: string;
}

function getLegalRouteFromPath(): LegalTab | null {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname.toLowerCase();
  if (path === '/terms' || path === '/terms-of-service') return 'terms';
  if (path === '/privacy' || path === '/privacy-policy') return 'privacy';
  if (path === '/refund-policy' || path === '/refund' || path === '/cancellation-policy') return 'refund';
  return null;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [unverifiedState, setUnverifiedState] = useState<UnverifiedState | null>(null);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register' | null>(null);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [legalRoute, setLegalRoute] = useState<LegalTab | null>(getLegalRouteFromPath);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState<TabType>('dashboard');

  // Application Data States
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [subscriptionDetails, setSubscriptionDetails] = useState<SubscriptionDetails | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [dataLoadError, setDataLoadError] = useState<string | null>(null);

  // Modals States
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);

  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  const [printingInvoice, setPrintingInvoice] = useState<Invoice | null>(null);
  const [remindingInvoice, setRemindingInvoice] = useState<Invoice | null>(null);

  // Upgrade Prompt Modal State
  const [upgradePrompt, setUpgradePrompt] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    featureOrLimit: string;
  }>({
    isOpen: false,
    title: '',
    message: '',
    featureOrLimit: '',
  });

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  function showToast(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  // Listen to Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        checkAuth();
      } else {
        setCurrentUser(null);
        setUnverifiedState(null);
        setAuthLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Listen to browser forward/back buttons for legal pages
  useEffect(() => {
    const handlePopState = () => {
      setLegalRoute(getLegalRouteFromPath());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  async function checkAuth() {
    try {
      setAuthLoading(true);
      const res = await api.getMe();
      if (!res.user.email_verified) {
        setUnverifiedState({
          user: res.user,
          deliveryStatus: res.email_delivery || 'sent',
          devOtp: res.dev_preview_otp,
          message: res.message,
        });
        setCurrentUser(null);
      } else {
        setCurrentUser(res.user);
        setUnverifiedState(null);
      }
    } catch {
      setCurrentUser(null);
      setUnverifiedState(null);
    } finally {
      setAuthLoading(false);
    }
  }

  // Load all application data when verified user changes
  useEffect(() => {
    if (currentUser && currentUser.email_verified) {
      loadAllData();
    }
  }, [currentUser]);

  async function loadAllData() {
    try {
      setLoadingData(true);
      setDataLoadError(null);
      const [dashRes, clientsRes, invoicesRes, subRes] = await Promise.allSettled([
        api.getDashboard(),
        api.getClients(),
        api.getInvoices(),
        api.getSubscription(),
      ]);

      let criticalError: string | null = null;

      if (dashRes.status === 'fulfilled') {
        setStats(dashRes.value.stats);
      } else {
        console.warn('Dashboard stats failed to load:', dashRes.reason);
      }

      if (clientsRes.status === 'fulfilled') {
        setClients(clientsRes.value.clients);
      } else {
        console.warn('Clients failed to load:', clientsRes.reason);
        criticalError = clientsRes.reason?.message || 'Failed to load client records.';
      }

      if (invoicesRes.status === 'fulfilled') {
        setInvoices(invoicesRes.value.invoices);
      } else {
        console.error('Invoices failed to load:', invoicesRes.reason);
        criticalError = invoicesRes.reason?.message || 'Failed to retrieve invoice records.';
      }

      if (subRes.status === 'fulfilled' && subRes.value) {
        setSubscriptionDetails(subRes.value);
      }

      if (criticalError) {
        setDataLoadError(criticalError);
      }
    } catch (err: any) {
      console.error('Failed to load data:', err);
      setDataLoadError(err.message || 'Failed to retrieve invoice records.');
    } finally {
      setLoadingData(false);
    }
  }

  async function handleLogout() {
    try {
      await api.logout();
    } catch (err) {
      console.error('Logout error:', err);
    }
    setCurrentUser(null);
    setUnverifiedState(null);
    setAuthModalMode(null);
    showToast('Logged out of Receipto.', 'info');
  }

  // Client Operations
  async function handleSaveClient(data: any) {
    try {
      if (editingClient) {
        const res = await api.updateClient(editingClient.id, data);
        showToast(`Client ${res.client.name} updated.`, 'success');
      } else {
        const res = await api.createClient(data);
        showToast(`Client ${res.client.name} created.`, 'success');
      }
      setIsClientModalOpen(false);
      setEditingClient(null);
      loadAllData();
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('limit reached') || msg.includes('Upgrade to') || err.upgrade_required || err.code === 'PLAN_LIMIT_REACHED' || err.error === 'PLAN_LIMIT_REACHED') {
        setIsClientModalOpen(false);
        setUpgradePrompt({
          isOpen: true,
          title: 'Client Limit Reached',
          message: msg || 'You have reached your current plan client capacity.',
          featureOrLimit: 'clients',
        });
      } else {
        showToast(msg || 'Failed to save client.', 'error');
      }
    }
  }

  async function handleDeleteClient(id: string) {
    if (!window.confirm('Are you sure you want to delete this client? Invoices must be deleted first.')) {
      return;
    }
    try {
      await api.deleteClient(id);
      showToast('Client deleted.', 'success');
      loadAllData();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete client.', 'error');
    }
  }

  // Invoice Operations
  async function handleSaveInvoice(data: any) {
    try {
      if (editingInvoice) {
        const res = await api.updateInvoice(editingInvoice.id, data);
        showToast(`Invoice #${res.invoice.invoice_number} updated.`, 'success');
      } else {
        const res = await api.createInvoice(data);
        showToast(`Invoice #${res.invoice.invoice_number} created successfully.`, 'success');
      }
      setIsInvoiceModalOpen(false);
      setEditingInvoice(null);
      loadAllData();
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('limit reached') || msg.includes('Upgrade to') || err.upgrade_required || err.code === 'PLAN_LIMIT_REACHED' || err.error === 'PLAN_LIMIT_REACHED') {
        setIsInvoiceModalOpen(false);
        setUpgradePrompt({
          isOpen: true,
          title: 'Invoice Limit Reached',
          message: msg || 'You have reached your monthly invoice generation limit.',
          featureOrLimit: 'invoices',
        });
      } else {
        showToast(msg || 'Failed to save invoice.', 'error');
      }
    }
  }

  async function handleMarkPaid(invoiceId: string) {
    try {
      const res = await api.markInvoicePaid(invoiceId);
      showToast(`Invoice #${res.invoice.invoice_number} marked as Paid.`, 'success');
      loadAllData();
    } catch (err: any) {
      showToast(err.message || 'Failed to update payment status.', 'error');
    }
  }

  async function handleCancelInvoice(invoiceId: string) {
    if (!window.confirm('Are you sure you want to cancel this invoice?')) return;
    try {
      const res = await api.cancelInvoice(invoiceId);
      showToast(`Invoice #${res.invoice.invoice_number} cancelled.`, 'info');
      loadAllData();
    } catch (err: any) {
      showToast(err.message || 'Failed to cancel invoice.', 'error');
    }
  }

  async function handleDeleteInvoice(invoiceId: string) {
    if (!window.confirm('Are you sure you want to delete this invoice permanently?')) return;
    try {
      await api.deleteInvoice(invoiceId);
      showToast('Invoice deleted permanently.', 'info');
      loadAllData();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete invoice.', 'error');
    }
  }

  if (legalRoute) {
    return (
      <LegalPages
        initialTab={legalRoute}
        onBackToHome={() => {
          window.history.pushState({}, '', '/');
          setLegalRoute(null);
        }}
      />
    );
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950 flex flex-col items-center justify-center text-slate-900 dark:text-white transition-colors duration-200">
        <div className="mb-4">
          <ReceiptoLogo size="lg" />
        </div>
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-indigo-500/20 border-t-indigo-500 mb-3"></div>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Loading Receipto...</p>
      </div>
    );
  }

  if (unverifiedState) {
    return (
      <>
        <EmailVerificationView
          user={unverifiedState.user}
          initialDeliveryStatus={unverifiedState.deliveryStatus}
          initialDevOtp={unverifiedState.devOtp}
          initialMessage={unverifiedState.message}
          onVerified={(verifiedUser) => {
            setUnverifiedState(null);
            setCurrentUser(verifiedUser);
            setAuthModalMode(null);
            setCurrentTab('dashboard');
          }}
          onLogout={handleLogout}
          onShowToast={showToast}
        />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  if (!currentUser) {
    if (authModalMode) {
      return (
        <>
          <AuthScreen
            initialMode={authModalMode}
            onClose={() => setAuthModalMode(null)}
            onSuccess={(user) => {
              setCurrentUser(user);
              setUnverifiedState(null);
              setAuthModalMode(null);
              setCurrentTab('dashboard');
            }}
            onRequiresVerification={(user, deliveryStatus, devOtp, message) => {
              setUnverifiedState({
                user,
                deliveryStatus: deliveryStatus || 'sent',
                devOtp,
                message,
              });
              setAuthModalMode(null);
            }}
            onShowToast={showToast}
          />
          <ToastContainer toasts={toasts} onDismiss={dismissToast} />
        </>
      );
    }

    return (
      <>
        <LandingPage
          currentUser={null}
          onOpenAuth={(mode) => setAuthModalMode(mode)}
          onGoToDashboard={() => {}}
          onOpenTerms={() => setIsTermsOpen(true)}
          onOpenSupport={() => setIsSupportModalOpen(true)}
          onNavigateLegal={(tab) => {
            const path = tab === 'terms' ? '/terms' : tab === 'privacy' ? '/privacy' : '/refund-policy';
            window.history.pushState({}, '', path);
            setLegalRoute(tab);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
        {isTermsOpen && <TermsModal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} />}
        {isSupportModalOpen && (
          <ContactSupportModal
            isOpen={isSupportModalOpen}
            onClose={() => setIsSupportModalOpen(false)}
          />
        )}
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col font-sans antialiased text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Top Navigation */}
      <Navbar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        user={currentUser}
        onLogout={handleLogout}
        plan={subscriptionDetails?.subscription?.plan}
        onOpenSupport={() => setIsSupportModalOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentTab === 'dashboard' && (
          <DashboardView
            stats={stats}
            loading={loadingData}
            onNavigate={setCurrentTab}
            onOpenCreateInvoice={() => {
              setEditingInvoice(null);
              setIsInvoiceModalOpen(true);
            }}
            onOpenCreateClient={() => {
              setEditingClient(null);
              setIsClientModalOpen(true);
            }}
            onSendReminder={(inv) => setRemindingInvoice(inv)}
            onMarkPaid={handleMarkPaid}
          />
        )}

        {currentTab === 'invoices' && (
          <InvoicesView
            invoices={invoices}
            clients={clients}
            loading={loadingData}
            error={dataLoadError}
            onRefresh={loadAllData}
            onOpenCreateInvoice={() => {
              setEditingInvoice(null);
              setIsInvoiceModalOpen(true);
            }}
            onOpenEditInvoice={(inv) => {
              setEditingInvoice(inv);
              setIsInvoiceModalOpen(true);
            }}
            onOpenPrintInvoice={(inv) => setPrintingInvoice(inv)}
            onOpenSendReminder={(inv) => setRemindingInvoice(inv)}
            onMarkPaid={handleMarkPaid}
            onCancelInvoice={handleCancelInvoice}
            onDeleteInvoice={handleDeleteInvoice}
            plan={subscriptionDetails?.subscription?.plan}
            onShowToast={showToast}
            onPromptUpgrade={(title, message, feature) =>
              setUpgradePrompt({ isOpen: true, title, message, featureOrLimit: feature })
            }
          />
        )}

        {currentTab === 'clients' && (
          <ClientsView
            clients={clients}
            invoices={invoices}
            loading={loadingData}
            onOpenCreateClient={() => {
              setEditingClient(null);
              setIsClientModalOpen(true);
            }}
            onOpenEditClient={(client) => {
              setEditingClient(client);
              setIsClientModalOpen(true);
            }}
            onDeleteClient={handleDeleteClient}
            onSelectClientForInvoice={(clientId) => {
              setEditingInvoice(null);
              setIsInvoiceModalOpen(true);
            }}
            plan={subscriptionDetails?.subscription?.plan}
            maxClients={subscriptionDetails?.usage?.max_clients ?? 5}
            onPromptUpgrade={(title, message, feature) =>
              setUpgradePrompt({ isOpen: true, title, message, featureOrLimit: feature })
            }
          />
        )}

        {currentTab === 'reminders' && (
          <RemindersView
            invoices={invoices}
            onOpenSendReminder={(inv) => setRemindingInvoice(inv)}
            onMarkPaid={handleMarkPaid}
            plan={subscriptionDetails?.subscription?.plan}
            onPromptUpgrade={(title, message, feature) =>
              setUpgradePrompt({ isOpen: true, title, message, featureOrLimit: feature })
            }
            onShowToast={showToast}
          />
        )}

        {currentTab === 'billing' && (
          <BillingView
            onShowToast={showToast}
            onSubscriptionUpdated={loadAllData}
            onNavigateToDashboard={() => setCurrentTab('dashboard')}
          />
        )}

        {currentTab === 'activity' && (
          <ActivityView onNavigateToBilling={() => setCurrentTab('billing')} />
        )}

        {currentTab === 'settings' && (
          <SettingsView
            user={currentUser}
            onUpdateUser={setCurrentUser}
            onShowToast={showToast}
          />
        )}

        {currentTab === 'admin' && currentUser.role === 'ADMIN' && (
          <AdminPanel currentUser={currentUser} />
        )}
      </main>

      {/* Invoice Create / Edit Modal */}
      {isInvoiceModalOpen && (
        <InvoiceModal
          isOpen={isInvoiceModalOpen}
          onClose={() => setIsInvoiceModalOpen(false)}
          onSubmit={handleSaveInvoice}
          clients={clients}
          initialInvoice={editingInvoice}
          onOpenCreateClient={() => {
            setIsInvoiceModalOpen(false);
            setEditingClient(null);
            setIsClientModalOpen(true);
          }}
        />
      )}

      {/* Client Create / Edit Modal */}
      {isClientModalOpen && (
        <ClientModal
          isOpen={isClientModalOpen}
          onClose={() => setIsClientModalOpen(false)}
          onSubmit={handleSaveClient}
          initialClient={editingClient}
        />
      )}

      {/* Printable Invoice Modal */}
      {printingInvoice && (
        <PrintInvoiceModal
          invoice={printingInvoice}
          currentUser={currentUser}
          onClose={() => setPrintingInvoice(null)}
        />
      )}

      {/* Send Payment Reminder Modal */}
      {remindingInvoice && (
        <SendReminderModal
          invoice={remindingInvoice}
          onClose={() => setRemindingInvoice(null)}
          onSuccess={(msg) => {
            showToast(msg, 'success');
            loadAllData();
          }}
          onError={(err) => showToast(err, 'error')}
        />
      )}

      {/* Feature / Limit Upgrade Prompt Modal */}
      {upgradePrompt.isOpen && (
        <UpgradePromptModal
          isOpen={upgradePrompt.isOpen}
          onClose={() => setUpgradePrompt((prev) => ({ ...prev, isOpen: false }))}
          title={upgradePrompt.title}
          message={upgradePrompt.message}
          featureOrLimit={upgradePrompt.featureOrLimit}
          currentPlan={subscriptionDetails?.subscription?.plan}
          onNavigateToBilling={() => {
            setUpgradePrompt((prev) => ({ ...prev, isOpen: false }));
            setCurrentTab('billing');
          }}
        />
      )}

      {/* Support Modal */}
      {isSupportModalOpen && (
        <ContactSupportModal
          isOpen={isSupportModalOpen}
          onClose={() => setIsSupportModalOpen(false)}
          userEmail={currentUser?.email}
        />
      )}

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
