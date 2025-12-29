'use client';

import { useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { RefreshProvider, useRefresh } from '@/lib/contexts';

// Konfiguracja zakładek nawigacji
const NAV_ITEMS = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: '📊',
    color: 'blue',
    description: 'Główny panel analityczny',
  },
  {
    href: '/dashboard/sessions',
    label: 'Sesje',
    icon: '👥',
    color: 'emerald',
    description: 'Analiza sesji użytkowników',
  },
  {
    href: '/dashboard/data',
    label: 'Dane Wrażliwe',
    icon: '🗄️',
    color: 'amber',
    description: 'Pliki i dane logowania',
  },
  {
    href: '/dashboard/commands',
    label: 'Sterowanie',
    icon: '🎮',
    color: 'red',
    description: 'Zdalne komendy',
  },
  {
    href: '/dashboard/tracking',
    label: 'Kontrola',
    icon: '🛡️',
    color: 'rose',
    description: 'Kontrola śledzenia',
  },
  {
    href: '/dashboard/monitor',
    label: 'Monitor',
    icon: '👁️',
    color: 'cyan',
    description: 'Watchdog stron',
  },
  {
    href: '/dashboard/logs',
    label: 'Logi',
    icon: '📋',
    color: 'purple',
    description: 'Historia komunikacji',
  },
  {
    href: '/dashboard/debugger',
    label: 'Debugger',
    icon: '🔧',
    color: 'teal',
    description: 'Diagnostyka i testy',
  },
  {
    href: '/dashboard/server',
    label: 'Serwer',
    icon: '🖥️',
    color: 'orange',
    description: 'Status serwera',
  },
  {
    href: '/dashboard/cleanup',
    label: 'Czyszczenie',
    icon: '🧹',
    color: 'red',
    description: 'Usuwanie danych',
  },
];

// Mapowanie kolorów na klasy Tailwind
// Komponent kontrolki odświeżania w headerze
function HeaderRefreshControl() {
  const {
    lastUpdated,
    isRefreshing,
    autoRefreshEnabled,
    timeToRefresh,
    refreshInterval,
    setAutoRefreshEnabled,
    triggerRefresh,
  } = useRefresh();

  return (
    <div className="hidden lg:flex items-center gap-3 bg-gradient-to-r from-slate-800/80 to-slate-900/80 px-4 py-2.5 rounded-xl border border-slate-700/50 shadow-lg">
      {/* Status i czas ostatniego odświeżenia */}
      <div className="flex items-center gap-3 pr-4 border-r border-slate-700/50">
        <div className="w-5 h-5 flex items-center justify-center">
          {isRefreshing ? (
            <span className="animate-spin text-blue-400 text-base">⟳</span>
          ) : (
            <span
              className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${autoRefreshEnabled ? 'bg-emerald-400 animate-pulse shadow-lg shadow-emerald-500/50' : 'bg-slate-500'}`}
            ></span>
          )}
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">Ostatnie</span>
          <span
            className="text-sm text-white font-medium min-w-[60px] transition-opacity duration-200"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {isRefreshing ? (
              <span className="text-blue-400">...</span>
            ) : lastUpdated ? (
              lastUpdated.toLocaleTimeString('pl-PL')
            ) : (
              '—'
            )}
          </span>
        </div>
      </div>

      {/* Licznik do następnego + pasek postępu */}
      <div
        className={`flex items-center gap-3 px-3 border-r border-slate-700/50 transition-all duration-300 overflow-hidden ${
          autoRefreshEnabled ? 'w-[110px] opacity-100' : 'w-0 opacity-0 px-0 border-r-0'
        }`}
      >
        <div className="flex flex-col items-center min-w-[45px]">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">Za</span>
          <span
            className="text-lg font-bold text-emerald-400 min-w-[32px] text-center"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {timeToRefresh}s
          </span>
        </div>
        <div className="w-9 h-9 relative flex-shrink-0">
          <svg className="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15" fill="none" stroke="#334155" strokeWidth="3" />
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="url(#headerRefreshGradient)"
              strokeWidth="3"
              strokeDasharray={`${((refreshInterval - timeToRefresh) / refreshInterval) * 94.2} 94.2`}
              strokeLinecap="round"
              className="transition-[stroke-dasharray] duration-1000 ease-linear"
            />
            <defs>
              <linearGradient id="headerRefreshGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#3b82f6" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>

      {/* Przycisk ręcznego odświeżenia */}
      <button
        onClick={triggerRefresh}
        disabled={isRefreshing}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 hover:border-blue-500/50 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-wait"
        title="Odśwież teraz"
      >
        <span
          className={`text-blue-400 text-base transition-transform duration-200 ${isRefreshing ? 'animate-spin' : ''}`}
        >
          ⟳
        </span>
        <span className="text-xs font-medium text-blue-300 hidden xl:inline">Odśwież</span>
      </button>

      {/* Przycisk Auto */}
      <button
        onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all duration-200 border ${
          autoRefreshEnabled
            ? 'bg-emerald-600/20 border-emerald-500/30 hover:bg-emerald-600/30 hover:border-emerald-500/50'
            : 'bg-slate-700/50 border-slate-600/50 hover:bg-slate-700 hover:border-slate-500'
        }`}
        title={autoRefreshEnabled ? 'Wyłącz auto-odświeżanie' : 'Włącz auto-odświeżanie'}
      >
        <span
          className={`text-base transition-colors duration-200 ${autoRefreshEnabled ? 'text-emerald-400' : 'text-slate-400'}`}
        >
          {autoRefreshEnabled ? '⏸' : '▶'}
        </span>
        <span
          className={`text-xs font-medium transition-colors duration-200 hidden xl:inline ${autoRefreshEnabled ? 'text-emerald-300' : 'text-slate-400'}`}
        >
          Auto
        </span>
      </button>
    </div>
  );
}

const COLOR_CLASSES: Record<string, { active: string; inactive: string; border: string }> = {
  blue: {
    active: 'bg-blue-600 text-white border-blue-500',
    inactive: 'hover:bg-blue-600/20 text-blue-400 border-transparent hover:border-blue-500/30',
    border: 'border-blue-500',
  },
  emerald: {
    active: 'bg-emerald-600 text-white border-emerald-500',
    inactive:
      'hover:bg-emerald-600/20 text-emerald-400 border-transparent hover:border-emerald-500/30',
    border: 'border-emerald-500',
  },
  amber: {
    active: 'bg-amber-600 text-white border-amber-500',
    inactive: 'hover:bg-amber-600/20 text-amber-400 border-transparent hover:border-amber-500/30',
    border: 'border-amber-500',
  },
  red: {
    active: 'bg-red-600 text-white border-red-500',
    inactive: 'hover:bg-red-600/20 text-red-400 border-transparent hover:border-red-500/30',
    border: 'border-red-500',
  },
  rose: {
    active: 'bg-rose-600 text-white border-rose-500',
    inactive: 'hover:bg-rose-600/20 text-rose-400 border-transparent hover:border-rose-500/30',
    border: 'border-rose-500',
  },
  cyan: {
    active: 'bg-cyan-600 text-white border-cyan-500',
    inactive: 'hover:bg-cyan-600/20 text-cyan-400 border-transparent hover:border-cyan-500/30',
    border: 'border-cyan-500',
  },
  purple: {
    active: 'bg-purple-600 text-white border-purple-500',
    inactive:
      'hover:bg-purple-600/20 text-purple-400 border-transparent hover:border-purple-500/30',
    border: 'border-purple-500',
  },
  orange: {
    active: 'bg-orange-600 text-white border-orange-500',
    inactive:
      'hover:bg-orange-600/20 text-orange-400 border-transparent hover:border-orange-500/30',
    border: 'border-orange-500',
  },
  teal: {
    active: 'bg-teal-600 text-white border-teal-500',
    inactive: 'hover:bg-teal-600/20 text-teal-400 border-transparent hover:border-teal-500/30',
    border: 'border-teal-500',
  },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Wylogowanie
  const handleLogout = useCallback(async () => {
    setIsLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    } catch (err) {
      console.error('Błąd wylogowania:', err);
      setIsLoggingOut(false);
    }
  }, []);

  // Sprawdzenie czy dany link jest aktywny
  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard';
    }
    return pathname.startsWith(href);
  };

  // Znajdź aktualną zakładkę
  const currentTab = NAV_ITEMS.find((item) => isActive(item.href));

  return (
    <RefreshProvider>
      <div className="min-h-screen bg-slate-950 flex flex-col">
        {/* Nagłówek */}
        <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800">
          <div className="max-w-7xl mx-auto pt-2">
            {/* Górny pasek - logo i wylogowanie */}
            <div className="flex items-center justify-between h-16 lg:h-[72px]">
              <div className="flex items-center gap-5">
                {/* Logo */}
                <Link
                  href="/dashboard"
                  className="flex items-center gap-3 text-white font-bold text-xl hover:text-blue-400 transition-colors"
                >
                  <span className="text-3xl">📊</span>
                  <span className="hidden sm:inline">Activity Tracker</span>
                </Link>

                {/* Separator */}
                <div className="hidden md:block h-8 w-px bg-slate-700"></div>

                {/* Aktualna zakładka */}
                {currentTab && (
                  <div className="hidden md:flex items-center gap-2 text-slate-400">
                    <span className="text-xl">{currentTab.icon}</span>
                    <span className="text-base font-medium">{currentTab.label}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-4">
                {/* Kontrolka odświeżania - tylko desktop */}
                <HeaderRefreshControl />

                {/* Separator przed wylogowaniem */}
                <div className="hidden lg:block h-8 w-px bg-slate-700"></div>

                {/* Przycisk menu mobilnego */}
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="md:hidden p-2.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                >
                  {mobileMenuOpen ? '✕' : '☰'}
                </button>

                {/* Przycisk wylogowania */}
                <button
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl border border-slate-700 hover:border-slate-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoggingOut ? (
                    <>
                      <span className="animate-spin text-lg">⏳</span>
                      <span className="hidden sm:inline">Wylogowanie...</span>
                    </>
                  ) : (
                    <>
                      <span className="text-lg">🚪</span>
                      <span className="hidden sm:inline">Wyloguj</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Nawigacja zakładkowa - Desktop */}
            <nav className="hidden md:flex justify-center items-center gap-1.5 pt-2 pb-3 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-700">
              {NAV_ITEMS.map((item) => {
                const active = isActive(item.href);
                const colors = COLOR_CLASSES[item.color] || COLOR_CLASSES.blue;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all border whitespace-nowrap ${
                      active ? colors.active : colors.inactive
                    }`}
                    title={item.description}
                  >
                    <span className="text-base">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Menu mobilne */}
          {mobileMenuOpen && (
            <div className="md:hidden border-t border-slate-800 bg-slate-900/98 backdrop-blur-sm">
              <nav className="px-4 py-3 space-y-1">
                {NAV_ITEMS.map((item) => {
                  const active = isActive(item.href);
                  const colors = COLOR_CLASSES[item.color] || COLOR_CLASSES.blue;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all border ${
                        active ? colors.active : colors.inactive
                      }`}
                    >
                      <span className="text-lg">{item.icon}</span>
                      <div>
                        <div>{item.label}</div>
                        <div className={`text-xs ${active ? 'text-white/70' : 'text-slate-500'}`}>
                          {item.description}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </nav>
            </div>
          )}
        </header>

        {/* Treść strony */}
        <main className="flex-1">{children}</main>

        {/* Stopka */}
        <footer className="border-t border-slate-800 bg-slate-900/50 py-4">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center text-xs text-slate-500">
            <p>📊 User Activity Tracker Dashboard v1.0</p>
          </div>
        </footer>
      </div>
    </RefreshProvider>
  );
}
