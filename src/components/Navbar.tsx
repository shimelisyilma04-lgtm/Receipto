import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  FileText,
  Users,
  BellRing,
  History,
  Settings,
  LogOut,
  Menu,
  X,
  CreditCard,
  Sparkles,
  LifeBuoy,
  ChevronRight,
  ShieldCheck,
  Building2,
} from 'lucide-react';
import type { TabType, User } from '../types.js';
import type { PlanTier } from '../plans.js';
import { ReceiptoLogo } from './ReceiptoLogo.js';
import { ThemeToggle } from './ThemeToggle.js';

interface NavbarProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  user: User;
  onLogout: () => void;
  plan?: PlanTier;
  onOpenSupport: () => void;
  onNavigateLegal?: (tab: 'terms' | 'privacy' | 'refund') => void;
}

export function Navbar({
  currentTab,
  onSelectTab,
  user,
  onLogout,
  plan = 'FREE',
  onOpenSupport,
  onNavigateLegal,
}: NavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  const navItems: { id: TabType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'clients', label: 'Clients', icon: Users },
    { id: 'invoices', label: 'Invoices', icon: FileText },
    { id: 'reminders', label: 'Reminders', icon: BellRing },
    { id: 'activity', label: 'Activity', icon: History },
    { id: 'billing', label: 'Billing / Plans', icon: CreditCard },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  if (user.role === 'ADMIN') {
    navItems.push({ id: 'admin', label: 'Admin', icon: ShieldCheck });
  }

  // Close menu on click outside or Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && menuOpen) {
        setMenuOpen(false);
        menuBtnRef.current?.focus();
      }
    }

    function handleClickOutside(e: MouseEvent) {
      if (
        menuOpen &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        menuBtnRef.current &&
        !menuBtnRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);

  function handleTabClick(tab: TabType) {
    onSelectTab(tab);
    setMenuOpen(false);
  }

  function handleLogoClick() {
    // Authenticated logo click redirects directly to Dashboard
    onSelectTab('dashboard');
    setMenuOpen(false);
  }

  function handleUpgradeClick() {
    onSelectTab('billing');
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleSupportClick() {
    onOpenSupport();
    setMenuOpen(false);
  }

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* 1. RECEIPTO LOGO & UPGRADE BUTTON */}
          <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0 mr-2 sm:mr-6">
            <button
              type="button"
              id="btn-logo-dashboard-shortcut"
              onClick={handleLogoClick}
              className="flex items-center gap-3 sm:gap-3.5 p-1.5 -ml-1 rounded-xl text-left transition-transform hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-indigo-500 group shrink-0"
              title="Receipto Dashboard (Shortcut)"
              aria-label="Receipto Dashboard shortcut"
            >
              <ReceiptoLogo size="sm" className="transition-transform group-hover:drop-shadow-[0_0_12px_rgba(59,130,246,0.5)]" />
              <div className="pl-0.5">
                <span className="font-extrabold text-lg tracking-tight text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors block">
                  Receipto
                </span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block leading-none mt-0.5">
                  Invoice Tracking &amp; Automated Follow-up
                </p>
              </div>
            </button>

            {/* Upgrade your plan button - visible ONLY for FREE tier users */}
            {plan === 'FREE' && (
              <button
                type="button"
                id="btn-nav-upgrade-plan-free"
                onClick={handleUpgradeClick}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-950 dark:text-amber-950 bg-amber-400 hover:bg-amber-300 dark:bg-amber-400 dark:hover:bg-amber-300 rounded-lg shadow-sm hover:shadow transition-all duration-150 hover:scale-105 active:scale-95 cursor-pointer shrink-0 border border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 dark:focus:ring-offset-slate-950"
                title="Upgrade your plan to unlock more clients and automated reminders"
                aria-label="Upgrade your plan"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-950 fill-amber-200 shrink-0" />
                <span className="whitespace-nowrap">
                  <span className="hidden sm:inline">Upgrade your plan</span>
                  <span className="sm:hidden">Upgrade</span>
                </span>
              </button>
            )}
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`nav-tab-${item.id}`}
                  onClick={() => handleTabClick(item.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right Header Controls: [Theme] [Menu/Profile] */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Theme Toggle (both desktop and mobile) */}
            <ThemeToggle variant="compact" />

            {/* Plan Badge (desktop quick link) */}
            <button
              type="button"
              id="btn-nav-plan-badge"
              onClick={handleUpgradeClick}
              className={`hidden sm:inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full font-bold uppercase tracking-wider border transition-all hover:scale-[1.02] active:scale-[0.98] ${
                plan === 'GROWTH'
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
                  : plan === 'STARTER'
                  ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/25'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
              title="Click to manage subscription or upgrade"
            >
              <Sparkles className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />
              <span>{plan}</span>
            </button>

            {/* Three-line Menu Button (Desktop & Mobile) */}
            <div className="relative">
              <button
                ref={menuBtnRef}
                type="button"
                id="btn-three-line-menu"
                onClick={() => setMenuOpen(!menuOpen)}
                aria-expanded={menuOpen}
                aria-haspopup="true"
                aria-label="Open main navigation menu"
                className={`flex items-center gap-2 p-2 sm:px-3 sm:py-1.5 rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  menuOpen
                    ? 'bg-indigo-50 dark:bg-slate-800 border-indigo-300 dark:border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Receipto Menu"
              >
                {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                <span className="hidden sm:inline text-xs font-semibold">Menu</span>
              </button>

              {/* Polished Menu Dropdown / Panel */}
              {menuOpen && (
                <div
                  ref={menuRef}
                  id="receipto-main-menu-dropdown"
                  className="absolute right-0 mt-2 w-72 sm:w-80 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150"
                  role="menu"
                  aria-orientation="vertical"
                >
                  {/* Top user account email section */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                      <ReceiptoLogo size="xs" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                            {user.name || 'Receipto User'}
                          </span>
                          <div className="flex items-center gap-1">
                            {user.role === 'ADMIN' && (
                              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300">
                                ADMIN
                              </span>
                            )}
                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">
                              {plan}
                            </span>
                          </div>
                        </div>
                        {/* Currently Authenticated User's Email (not hardcoded) */}
                        <div
                          id="menu-authenticated-user-email"
                          className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate"
                          title={user.email}
                        >
                          {user.email}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Navigation Items */}
                  <div className="p-2 space-y-1">
                    {navItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = currentTab === item.id;
                      return (
                        <button
                          key={item.id}
                          id={`menu-item-${item.id}`}
                          onClick={() => handleTabClick(item.id)}
                          role="menuitem"
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                            isActive
                              ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Icon className="w-4 h-4 shrink-0" />
                            <span>{item.label}</span>
                          </div>
                          {isActive && <ChevronRight className="w-3.5 h-3.5 opacity-80" />}
                        </button>
                      );
                    })}
                  </div>

                  {/* Contact Support Item */}
                  <div className="px-2 pt-1 pb-1 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      id="menu-btn-contact-support"
                      onClick={handleSupportClick}
                      role="menuitem"
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    >
                      <LifeBuoy className="w-4 h-4 text-indigo-500 shrink-0" />
                      <span>Contact Support</span>
                    </button>
                  </div>

                  {/* Legal & Policies */}
                  {onNavigateLegal && (
                    <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 text-[11px] flex items-center justify-between text-slate-500 dark:text-slate-400">
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          onNavigateLegal('terms');
                        }}
                        className="hover:text-indigo-600 dark:hover:text-white transition"
                      >
                        Terms
                      </button>
                      <span>&bull;</span>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          onNavigateLegal('privacy');
                        }}
                        className="hover:text-indigo-600 dark:hover:text-white transition"
                      >
                        Privacy
                      </button>
                      <span>&bull;</span>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          onNavigateLegal('refund');
                        }}
                        className="hover:text-indigo-600 dark:hover:text-white transition"
                      >
                        Refund Policy
                      </button>
                    </div>
                  )}

                  {/* Highlighted Upgrade Your Plan Action */}
                  <div className="p-2 border-t border-slate-100 dark:border-slate-800 bg-gradient-to-br from-indigo-50/50 to-purple-50/30 dark:from-indigo-950/20 dark:to-purple-950/20">
                    <button
                      type="button"
                      id="menu-btn-upgrade-plan"
                      onClick={handleUpgradeClick}
                      role="menuitem"
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs uppercase tracking-wider shadow-md shadow-indigo-600/25 transition-all hover:scale-[1.01] active:scale-[0.99]"
                    >
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-300" />
                        <span>Upgrade your plan</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-indigo-200" />
                    </button>
                  </div>

                  {/* Log Out */}
                  <div className="p-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
                    <button
                      type="button"
                      id="menu-btn-logout"
                      onClick={() => {
                        setMenuOpen(false);
                        onLogout();
                      }}
                      role="menuitem"
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Log out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
