'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { DashboardContent } from '@/components/dashboard';

// Typy
interface CleanupHistoryItem {
  id: number;
  timestamp: string;
  mode: string;
  dry_run: number;
  events_deleted: number;
  sessions_deleted: number;
  visitors_deleted: number;
  communication_logs_deleted: number;
  form_submissions_deleted: number;
  uploaded_files_deleted: number;
  remote_commands_deleted: number;
  total_deleted: number;
  filters: string | null;
  message: string | null;
}

interface HistorySummary {
  operations_count: number;
  total_events: number;
  total_sessions: number;
  total_visitors: number;
  total_logs: number;
  total_forms: number;
  total_files: number;
  grand_total: number;
}

interface CleanupStats {
  stats: {
    events: number;
    sessions: number;
    visitors: number;
    communication_logs: number;
    form_submissions: number;
    uploaded_files: number;
    remote_commands: number;
  };
  sites: Array<{ site_id: string; hostname: string | null; session_count: number }>;
  ips: Array<{ ip: string; request_count: number }>;
  visitors: Array<{
    visitor_id: string;
    session_count: number;
    total_events: number;
    first_seen: string;
    last_seen: string;
    browser: string | null;
    platform: string | null;
    country: string | null;
  }>;
  smartStats: {
    lowEventSessions: number;
    shortSessions: number;
    noInteractionSessions: number;
    oldEvents: number;
    oldSessions: number;
  };
  cleanupHistory: CleanupHistoryItem[];
  historySummary: HistorySummary;
  timestamp: string;
}

interface CleanupResult {
  success: boolean;
  mode: string;
  dryRun: boolean;
  deleted: {
    events: number;
    sessions: number;
    visitors: number;
    communication_logs: number;
    form_submissions: number;
    uploaded_files: number;
    remote_commands: number;
  };
  message: string;
}

type CleanupMode = 'all' | 'period' | 'site' | 'visitor' | 'ip' | 'smart';

export default function CleanupPage() {
  // Stan
  const [stats, setStats] = useState<CleanupStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [lastResult, setLastResult] = useState<CleanupResult | null>(null);

  // Podgląd na żywo
  const [livePreview, setLivePreview] = useState<CleanupResult | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Formularz
  const [mode, setMode] = useState<CleanupMode>('smart');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedSite, setSelectedSite] = useState('');
  const [visitorId, setVisitorId] = useState('');
  const [selectedIp, setSelectedIp] = useState('');
  const [dryRun] = useState(false); // Zawsze wykonuj faktyczne usunięcie - podgląd jest na żywo

  // Opcje smart cleanup
  const [smartMinEvents, setSmartMinEvents] = useState(2);
  const [smartMinDuration, setSmartMinDuration] = useState(5);
  const [smartNoInteraction, setSmartNoInteraction] = useState(false);

  // Auto-cleanup (harmonogram)
  const [autoCleanupEnabled, setAutoCleanupEnabled] = useState(false);
  const [autoCleanupInterval, setAutoCleanupInterval] = useState(24);
  const [autoCleanupSettings, setAutoCleanupSettings] = useState<{
    last_run: string | null;
    next_run: string | null;
    total_runs: number;
    total_deleted: number;
  } | null>(null);
  const [autoCleanupHistory, setAutoCleanupHistory] = useState<
    Array<{
      timestamp: string;
      total_deleted: number;
      message: string | null;
    }>
  >([]);
  const [savingAutoCleanup, setSavingAutoCleanup] = useState(false);
  const [runningAutoCleanup, setRunningAutoCleanup] = useState(false);

  // Potwierdzenie
  const [confirmText, setConfirmText] = useState('');

  // Pobieranie statystyk
  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/cleanup');

      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = '/login';
          return;
        }
        throw new Error(`Błąd pobierania danych (${res.status})`);
      }

      const data: CleanupStats = await res.json();
      setStats(data);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Nieznany błąd';
      console.error('Błąd:', err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Pobieranie ustawień auto-cleanup
  const fetchAutoCleanupSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/cleanup/schedule');
      if (res.ok) {
        const data = await res.json();
        setAutoCleanupEnabled(data.settings.enabled);
        setAutoCleanupInterval(data.settings.interval_hours);
        setSmartMinEvents(data.settings.min_events);
        setSmartMinDuration(data.settings.min_duration_seconds);
        setSmartNoInteraction(data.settings.no_interaction);
        setAutoCleanupSettings({
          last_run: data.settings.last_run,
          next_run: data.settings.next_run,
          total_runs: data.settings.total_runs,
          total_deleted: data.settings.total_deleted,
        });
        setAutoCleanupHistory(data.history || []);
      }
    } catch (err) {
      console.error('Błąd pobierania ustawień auto-cleanup:', err);
    }
  }, []);

  useEffect(() => {
    fetchAutoCleanupSettings();
  }, [fetchAutoCleanupSettings]);

  // Automatyczne sprawdzanie harmonogramu co minutę
  useEffect(() => {
    const checkSchedule = async () => {
      try {
        const res = await fetch('/api/cleanup/schedule/check');
        if (res.ok) {
          const data = await res.json();
          if (data.executed) {
            // Odśwież dane po automatycznym czyszczeniu
            await fetchStats();
            await fetchAutoCleanupSettings();
            // Odśwież podgląd
            setLivePreview(null);
          }
        }
      } catch (err) {
        console.error('Błąd sprawdzania harmonogramu:', err);
      }
    };

    // Sprawdź od razu i potem co minutę
    checkSchedule();
    const interval = setInterval(checkSchedule, 60000);

    return () => clearInterval(interval);
  }, [fetchStats, fetchAutoCleanupSettings]);

  // Zapisz ustawienia auto-cleanup
  const saveAutoCleanupSettings = async () => {
    setSavingAutoCleanup(true);
    try {
      const res = await fetch('/api/cleanup/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: autoCleanupEnabled,
          interval_hours: autoCleanupInterval,
          min_events: smartMinEvents,
          min_duration_seconds: smartMinDuration,
          no_interaction: smartNoInteraction,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAutoCleanupSettings((prev) => (prev ? { ...prev, next_run: data.next_run } : null));
        await fetchAutoCleanupSettings();
      }
    } catch (err) {
      console.error('Błąd zapisywania ustawień:', err);
    } finally {
      setSavingAutoCleanup(false);
    }
  };

  // Uruchom auto-cleanup natychmiast
  const runAutoCleanupNow = async () => {
    setRunningAutoCleanup(true);
    try {
      const res = await fetch('/api/cleanup/schedule', { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        setLastResult({
          success: true,
          mode: 'smart',
          dryRun: false,
          deleted: {
            events: data.deleted.events,
            sessions: data.deleted.sessions,
            visitors: data.deleted.visitors,
            communication_logs: 0,
            form_submissions: 0,
            uploaded_files: 0,
            remote_commands: 0,
          },
          message: data.message,
        });
        await fetchStats();
        await fetchAutoCleanupSettings();
        // Odśwież podgląd
        setLivePreview(null);
        setTimeout(() => {
          fetchPreview();
        }, 500);
        // Automatycznie ukryj wynik po 8 sekundach
        setTimeout(() => {
          setLastResult(null);
        }, 8000);
      }
    } catch (err) {
      console.error('Błąd uruchamiania auto-cleanup:', err);
    } finally {
      setRunningAutoCleanup(false);
    }
  };

  // Pobieranie podglądu na żywo
  const fetchPreview = useCallback(async () => {
    // Walidacja - nie pobieraj jeśli brak wymaganych danych
    if (mode === 'period' && !dateFrom && !dateTo) return;
    if (mode === 'site' && !selectedSite) return;
    if (mode === 'visitor' && !visitorId) return;
    if (mode === 'ip' && !selectedIp) return;

    setLoadingPreview(true);

    try {
      const body: Record<string, unknown> = {
        mode,
        dryRun: true, // Zawsze dry run dla podglądu
      };

      if (mode === 'period') {
        if (dateFrom) body.dateFrom = dateFrom;
        if (dateTo) body.dateTo = dateTo;
      }
      if (mode === 'site') body.siteId = selectedSite;
      if (mode === 'visitor') body.visitorId = visitorId;
      if (mode === 'ip') body.ipAddress = selectedIp;
      if (mode === 'smart') {
        body.smart = {
          minEvents: smartMinEvents,
          minDurationSeconds: smartMinDuration,
          noInteraction: smartNoInteraction,
        };
      }

      const res = await fetch('/api/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const result: CleanupResult = await res.json();
        setLivePreview(result);
      }
    } catch (err) {
      console.error('Błąd podglądu:', err);
    } finally {
      setLoadingPreview(false);
    }
  }, [
    mode,
    dateFrom,
    dateTo,
    selectedSite,
    visitorId,
    selectedIp,
    smartMinEvents,
    smartMinDuration,
    smartNoInteraction,
  ]);

  // Automatyczne odświeżanie podglądu przy zmianie parametrów
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPreview();
    }, 500); // Debounce 500ms

    return () => clearTimeout(timer);
  }, [fetchPreview]);

  // Wykonanie czyszczenia
  const handleCleanup = async () => {
    // Walidacja
    if (mode === 'period' && !dateFrom && !dateTo) {
      setError('Wybierz zakres dat');
      return;
    }
    if (mode === 'site' && !selectedSite) {
      setError('Wybierz stronę');
      return;
    }
    if (mode === 'visitor' && !visitorId) {
      setError('Podaj ID użytkownika');
      return;
    }
    if (mode === 'ip' && !selectedIp) {
      setError('Wybierz adres IP');
      return;
    }

    // Jeśli to nie dry run i mode === 'all', wymagaj potwierdzenia
    if (!dryRun && mode === 'all') {
      if (confirmText !== 'USUŃ WSZYSTKO') {
        setError('Wpisz "USUŃ WSZYSTKO" aby potwierdzić');
        return;
      }
    }

    setExecuting(true);
    setError(null);
    setLastResult(null);

    try {
      const body: Record<string, unknown> = {
        mode,
        dryRun,
      };

      if (mode === 'period') {
        if (dateFrom) body.dateFrom = dateFrom;
        if (dateTo) body.dateTo = dateTo;
      }

      if (mode === 'site') {
        body.siteId = selectedSite;
      }

      if (mode === 'visitor') {
        body.visitorId = visitorId;
      }

      if (mode === 'ip') {
        body.ipAddress = selectedIp;
      }

      if (mode === 'smart') {
        body.smart = {
          minEvents: smartMinEvents,
          minDurationSeconds: smartMinDuration,
          noInteraction: smartNoInteraction,
        };
      }

      const res = await fetch('/api/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Błąd czyszczenia');
      }

      const result: CleanupResult = await res.json();
      setLastResult(result);

      // Odśwież statystyki i podgląd po usunięciu (jeśli nie dry run)
      if (!dryRun) {
        await fetchStats();
        // Wyczyść podgląd i pobierz nowy po chwili
        setLivePreview(null);
        setTimeout(() => {
          fetchPreview();
        }, 500);

        // Automatycznie ukryj wynik po 8 sekundach i pokaż podgląd
        setTimeout(() => {
          setLastResult(null);
        }, 8000);
      }

      setConfirmText('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Nieznany błąd';
      setError(msg);
    } finally {
      setExecuting(false);
    }
  };

  // Formatowanie liczby
  const formatNumber = (n: number) => n.toLocaleString('pl-PL');

  // Suma usuniętych rekordów
  const getTotalDeleted = (deleted: CleanupResult['deleted']) => {
    return Object.values(deleted).reduce((sum, val) => sum + val, 0);
  };

  // Widok błędu
  if (error && !loading && !stats) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-200">
        <div className="text-center max-w-md p-8">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold mb-2">Błąd ładowania</h2>
          <p className="text-slate-400 mb-4">{error}</p>
          <button
            onClick={fetchStats}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Spróbuj ponownie
          </button>
        </div>
      </div>
    );
  }

  // Widok ładowania
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-200">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <p>Ładowanie statystyk...</p>
        </div>
      </div>
    );
  }

  const modeLabels: Record<
    CleanupMode,
    { icon: string; label: string; description: string; color: string }
  > = {
    all: {
      icon: '💀',
      label: 'Wszystko',
      description: 'Usuwa WSZYSTKIE dane z bazy',
      color: 'red',
    },
    period: {
      icon: '📅',
      label: 'Okres czasu',
      description: 'Usuwa dane z wybranego zakresu dat',
      color: 'amber',
    },
    site: {
      icon: '🌐',
      label: 'Strona',
      description: 'Usuwa dane z konkretnej strony (site_id)',
      color: 'blue',
    },
    visitor: {
      icon: '👤',
      label: 'Użytkownik',
      description: 'Usuwa dane konkretnego użytkownika',
      color: 'purple',
    },
    ip: {
      icon: '🔗',
      label: 'Adres IP',
      description: 'Usuwa dane z konkretnego adresu IP',
      color: 'cyan',
    },
    smart: {
      icon: '🧠',
      label: 'Inteligentne',
      description: 'Usuwa "śmieciowe" sesje wg kryteriów',
      color: 'emerald',
    },
  };

  return (
    <DashboardContent>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">🧹 Czyszczenie Danych</h1>
        <p className="text-slate-400">Usuń niepotrzebne dane - selektywnie lub wszystko naraz</p>
      </div>

      {/* Błąd (toast) */}
      {error && stats && (
        <div className="mb-6 bg-red-500/10 border border-red-500/50 rounded-xl p-4 flex items-center justify-between">
          <span className="text-red-400">⚠️ {error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
            ✕
          </button>
        </div>
      )}

      {/* Aktualne statystyki bazy */}
      <div className="mb-8 bg-slate-900/50 border border-slate-800 rounded-xl p-6">
        <h3 className="text-lg font-bold text-white mb-4">📊 Aktualne dane w bazie</h3>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="bg-slate-800/50 p-4 rounded-lg text-center border border-slate-700">
            <div className="text-3xl font-bold text-blue-400">
              {formatNumber(stats?.stats.events || 0)}
            </div>
            <div className="text-xs text-slate-400 mt-1">Eventy</div>
          </div>
          <div className="bg-slate-800/50 p-4 rounded-lg text-center border border-slate-700">
            <div className="text-3xl font-bold text-emerald-400">
              {formatNumber(stats?.stats.sessions || 0)}
            </div>
            <div className="text-xs text-slate-400 mt-1">Sesje</div>
          </div>
          <div className="bg-slate-800/50 p-4 rounded-lg text-center border border-slate-700">
            <div className="text-3xl font-bold text-purple-400">
              {formatNumber(stats?.stats.visitors || 0)}
            </div>
            <div className="text-xs text-slate-400 mt-1">Użytkownicy</div>
          </div>
          <div className="bg-slate-800/50 p-4 rounded-lg text-center border border-slate-700">
            <div className="text-3xl font-bold text-amber-400">
              {formatNumber(stats?.stats.communication_logs || 0)}
            </div>
            <div className="text-xs text-slate-400 mt-1">Logi</div>
          </div>
          <Link
            href="/dashboard/data"
            className="bg-slate-800/50 p-4 rounded-lg text-center border border-slate-700 hover:bg-slate-700/50 hover:border-cyan-500/50 transition-all cursor-pointer group"
          >
            <div className="text-3xl font-bold text-cyan-400 group-hover:scale-110 transition-transform">
              {formatNumber(stats?.stats.form_submissions || 0)}
            </div>
            <div className="text-xs text-slate-400 mt-1 group-hover:text-cyan-300">
              Formularze →
            </div>
          </Link>
          <Link
            href="/dashboard/data"
            className="bg-slate-800/50 p-4 rounded-lg text-center border border-slate-700 hover:bg-slate-700/50 hover:border-pink-500/50 transition-all cursor-pointer group"
          >
            <div className="text-3xl font-bold text-pink-400 group-hover:scale-110 transition-transform">
              {formatNumber(stats?.stats.uploaded_files || 0)}
            </div>
            <div className="text-xs text-slate-400 mt-1 group-hover:text-pink-300">Pliki →</div>
          </Link>
          <Link
            href="/dashboard/commands"
            className="bg-slate-800/50 p-4 rounded-lg text-center border border-slate-700 hover:bg-slate-700/50 hover:border-orange-500/50 transition-all cursor-pointer group"
          >
            <div className="text-3xl font-bold text-orange-400 group-hover:scale-110 transition-transform">
              {formatNumber(stats?.stats.remote_commands || 0)}
            </div>
            <div className="text-xs text-slate-400 mt-1 group-hover:text-orange-300">Komendy →</div>
          </Link>
        </div>
      </div>

      {/* Podgląd na żywo - zawsze widoczny */}
      <div
        className={`mb-8 rounded-xl p-6 border-2 transition-all ${
          lastResult && !lastResult.dryRun
            ? 'bg-emerald-500/10 border-emerald-500/50'
            : 'bg-gradient-to-r from-amber-900/20 via-orange-900/15 to-yellow-900/20 border-amber-500/40'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              {lastResult && !lastResult.dryRun ? (
                <>✅ Ostatnia operacja</>
              ) : (
                <>
                  🔮 Podgląd na żywo
                  {loadingPreview && <span className="animate-spin text-amber-400">⟳</span>}
                </>
              )}
            </h3>
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                mode === 'all'
                  ? 'bg-red-500/20 text-red-400'
                  : mode === 'smart'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-blue-500/20 text-blue-400'
              }`}
            >
              {modeLabels[mode].icon} {modeLabels[mode].label}
            </span>
          </div>
          {lastResult && !lastResult.dryRun && (
            <button
              onClick={() => setLastResult(null)}
              className="text-xs text-slate-400 hover:text-white px-2 py-1 bg-slate-800 rounded"
            >
              Pokaż podgląd
            </button>
          )}
        </div>

        {/* Wyświetl albo wynik operacji albo podgląd */}
        {lastResult && !lastResult.dryRun ? (
          // Wynik faktycznej operacji
          <div>
            <p className="text-emerald-400 mb-4">{lastResult.message}</p>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              {Object.entries(lastResult.deleted).map(([key, value]) => (
                <div
                  key={key}
                  className="bg-emerald-500/10 p-3 rounded-lg text-center border border-emerald-500/20"
                >
                  <div className="text-2xl font-bold text-emerald-400">{formatNumber(value)}</div>
                  <div className="text-xs text-emerald-300/70">{key.replace(/_/g, ' ')}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-lg">
              <span className="text-slate-400">Usunięto łącznie: </span>
              <span className="font-bold text-emerald-400">
                {formatNumber(getTotalDeleted(lastResult.deleted))} rekordów
              </span>
            </div>
          </div>
        ) : livePreview ? (
          // Podgląd na żywo
          <div>
            <p className="text-slate-400 mb-4 text-sm">
              {livePreview.message ||
                `Tryb ${modeLabels[mode].label.toLowerCase()}: pokazuje ile rekordów zostanie usuniętych`}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              {Object.entries(livePreview.deleted).map(([key, value]) => (
                <div
                  key={key}
                  className={`p-3 rounded-lg text-center border transition-all ${
                    value > 0
                      ? 'bg-amber-500/10 border-amber-500/30'
                      : 'bg-slate-800/30 border-slate-700/30'
                  }`}
                >
                  <div
                    className={`text-2xl font-bold ${value > 0 ? 'text-amber-400' : 'text-slate-600'}`}
                  >
                    {formatNumber(value)}
                  </div>
                  <div className="text-xs text-slate-500">{key.replace(/_/g, ' ')}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div className="text-lg">
                <span className="text-slate-400">Do usunięcia: </span>
                <span
                  className={`font-bold ${getTotalDeleted(livePreview.deleted) > 0 ? 'text-amber-400' : 'text-slate-600'}`}
                >
                  {formatNumber(getTotalDeleted(livePreview.deleted))} rekordów
                </span>
              </div>
              {getTotalDeleted(livePreview.deleted) > 0 && (
                <span className="text-xs text-amber-400/70 bg-amber-500/10 px-2 py-1 rounded">
                  ⚠️ Te dane zostaną usunięte po kliknięciu &quot;Wyczyść&quot;
                </span>
              )}
            </div>
          </div>
        ) : (
          // Brak danych
          <div className="text-center py-6">
            <div className="text-slate-500">
              {loadingPreview ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin">⏳</span> Obliczanie podglądu...
                </span>
              ) : mode === 'all' ? (
                <span>Tryb &quot;Wszystko&quot; - usunie wszystkie dane z bazy</span>
              ) : (
                <span>Wybierz parametry aby zobaczyć podgląd</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Główny panel */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Lewa kolumna - wybór trybu */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-white">🎯 Wybierz tryb</h3>

          {(Object.keys(modeLabels) as CleanupMode[]).map((m) => {
            const info = modeLabels[m];
            const isSelected = mode === m;

            // Mapowanie kolorów na style dla aktywnego stanu
            const activeStyles: Record<
              string,
              { bg: string; border: string; shadow: string; text: string }
            > = {
              red: {
                bg: 'bg-red-600/40',
                border: 'border-red-500',
                shadow: 'shadow-lg shadow-red-500/30',
                text: 'text-red-300',
              },
              amber: {
                bg: 'bg-amber-600/40',
                border: 'border-amber-500',
                shadow: 'shadow-lg shadow-amber-500/30',
                text: 'text-amber-300',
              },
              blue: {
                bg: 'bg-blue-600/40',
                border: 'border-blue-500',
                shadow: 'shadow-lg shadow-blue-500/30',
                text: 'text-blue-300',
              },
              purple: {
                bg: 'bg-purple-600/40',
                border: 'border-purple-500',
                shadow: 'shadow-lg shadow-purple-500/30',
                text: 'text-purple-300',
              },
              cyan: {
                bg: 'bg-cyan-600/40',
                border: 'border-cyan-500',
                shadow: 'shadow-lg shadow-cyan-500/30',
                text: 'text-cyan-300',
              },
              emerald: {
                bg: 'bg-emerald-600/40',
                border: 'border-emerald-500',
                shadow: 'shadow-lg shadow-emerald-500/30',
                text: 'text-emerald-300',
              },
            };
            const style = activeStyles[info.color] || activeStyles.blue;

            return (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                  isSelected
                    ? `${style.bg} ${style.border} ${style.shadow} ring-2 ring-white/20`
                    : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800/50 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`text-2xl ${isSelected ? 'scale-110' : ''} transition-transform`}
                  >
                    {info.icon}
                  </span>
                  <div>
                    <div
                      className={`font-bold ${isSelected ? 'text-white text-lg' : 'text-slate-300'}`}
                    >
                      {info.label}
                    </div>
                    <div className={`text-xs ${isSelected ? style.text : 'text-slate-500'}`}>
                      {info.description}
                    </div>
                  </div>
                  {isSelected && (
                    <div className="ml-auto">
                      <span className="text-white text-xl">✓</span>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Środkowa kolumna - opcje dla wybranego trybu */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <h3 className="text-lg font-bold text-white mb-4">
            ⚙️ Opcje trybu: {modeLabels[mode].label}
          </h3>

          {/* Tryb: Wszystko */}
          {mode === 'all' && (
            <div className="space-y-4">
              <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4">
                <p className="text-red-400 font-bold mb-2">⚠️ UWAGA!</p>
                <p className="text-red-300 text-sm">
                  Ta operacja usunie <strong>WSZYSTKIE</strong> dane z bazy: eventy, sesje,
                  użytkowników, logi, formularze i pliki. Operacja jest{' '}
                  <strong>nieodwracalna</strong>!
                </p>
              </div>
              {!dryRun && (
                <div>
                  <label className="block text-sm text-slate-400 mb-2">
                    Wpisz &quot;USUŃ WSZYSTKO&quot; aby potwierdzić:
                  </label>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="USUŃ WSZYSTKO"
                    className="w-full bg-slate-800 border border-red-500/50 rounded-lg px-4 py-2 text-red-400 focus:border-red-500 outline-none"
                  />
                </div>
              )}
            </div>
          )}

          {/* Tryb: Okres */}
          {mode === 'period' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Od daty:</label>
                <input
                  type="datetime-local"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 focus:border-amber-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">Do daty:</label>
                <input
                  type="datetime-local"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 focus:border-amber-500 outline-none"
                />
              </div>
              <p className="text-xs text-slate-500">
                Pozostaw puste jedno z pól, aby usunąć od początku lub do końca.
              </p>
            </div>
          )}

          {/* Tryb: Strona */}
          {mode === 'site' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">
                  Wybierz stronę (site_id):
                </label>
                <select
                  value={selectedSite}
                  onChange={(e) => setSelectedSite(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 focus:border-blue-500 outline-none"
                >
                  <option value="">-- Wybierz --</option>
                  {stats?.sites.map((site) => (
                    <option key={site.site_id} value={site.site_id}>
                      {site.site_id} {site.hostname && `(${site.hostname})`} - {site.session_count}{' '}
                      sesji
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-slate-500">
                Usunie wszystkie dane powiązane z wybraną stroną.
              </p>
            </div>
          )}

          {/* Tryb: Użytkownik */}
          {mode === 'visitor' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Wybierz użytkownika:</label>
                <select
                  value={visitorId}
                  onChange={(e) => setVisitorId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 focus:border-purple-500 outline-none"
                >
                  <option value="">-- Wybierz użytkownika --</option>
                  {stats?.visitors.map((visitor) => (
                    <option key={visitor.visitor_id} value={visitor.visitor_id}>
                      {visitor.visitor_id.substring(0, 8)}... |{visitor.session_count} sesji,{' '}
                      {visitor.total_events} eventów |{visitor.browser || 'N/A'} |
                      {visitor.country || 'N/A'}
                    </option>
                  ))}
                </select>
                {visitorId && stats?.visitors.find((v) => v.visitor_id === visitorId) && (
                  <div className="mt-3 p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400">ID: </span>
                        <span className="text-white font-mono">
                          {visitorId.substring(0, 16)}...
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Sesje: </span>
                        <span className="text-purple-400 font-bold">
                          {stats.visitors.find((v) => v.visitor_id === visitorId)?.session_count}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Eventy: </span>
                        <span className="text-purple-400 font-bold">
                          {stats.visitors.find((v) => v.visitor_id === visitorId)?.total_events}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Platforma: </span>
                        <span className="text-white">
                          {stats.visitors.find((v) => v.visitor_id === visitorId)?.platform ||
                            'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Pierwsza wizyta: </span>
                        <span className="text-white">
                          {new Date(
                            stats.visitors.find((v) => v.visitor_id === visitorId)?.first_seen ||
                              '',
                          ).toLocaleDateString('pl-PL')}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Ostatnia aktywność: </span>
                        <span className="text-white">
                          {new Date(
                            stats.visitors.find((v) => v.visitor_id === visitorId)?.last_seen || '',
                          ).toLocaleDateString('pl-PL')}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Usunie wszystkie dane (sesje, eventy, formularze) powiązane z tym użytkownikiem.
              </p>
            </div>
          )}

          {/* Tryb: IP */}
          {mode === 'ip' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Adres IP:</label>
                <select
                  value={selectedIp}
                  onChange={(e) => setSelectedIp(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 focus:border-cyan-500 outline-none"
                >
                  <option value="">-- Wybierz lub wpisz --</option>
                  {stats?.ips.map((ip) => (
                    <option key={ip.ip} value={ip.ip}>
                      {ip.ip} ({ip.request_count} requestów)
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={selectedIp}
                  onChange={(e) => setSelectedIp(e.target.value)}
                  placeholder="Lub wpisz ręcznie: 192.168.1.1"
                  className="w-full mt-2 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 focus:border-cyan-500 outline-none font-mono text-sm"
                />
              </div>
              <p className="text-xs text-slate-500">
                Usunie logi i dane powiązane z tym adresem IP.
              </p>
            </div>
          )}

          {/* Tryb: Smart */}
          {mode === 'smart' && (
            <div className="space-y-4">
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 mb-4">
                <p className="text-emerald-400 text-sm">
                  🧠 Tryb inteligentny usuwa &quot;śmieciowe&quot; sesje, które nie zawierają
                  wartościowych danych - krótkie wizyty, boty, sesje bez interakcji.
                </p>
              </div>

              {/* Statystyki smart */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-800/50 p-2 rounded">
                  <span className="text-slate-400">Sesje z &lt;2 eventów: </span>
                  <span className="text-white font-bold">
                    {formatNumber(stats?.smartStats.lowEventSessions || 0)}
                  </span>
                </div>
                <div className="bg-slate-800/50 p-2 rounded">
                  <span className="text-slate-400">Sesje &lt;5s: </span>
                  <span className="text-white font-bold">
                    {formatNumber(stats?.smartStats.shortSessions || 0)}
                  </span>
                </div>
                <div className="bg-slate-800/50 p-2 rounded">
                  <span className="text-slate-400">Bez interakcji: </span>
                  <span className="text-white font-bold">
                    {formatNumber(stats?.smartStats.noInteractionSessions || 0)}
                  </span>
                </div>
                <div className="bg-slate-800/50 p-2 rounded">
                  <span className="text-slate-400">Stare (&gt;30 dni): </span>
                  <span className="text-white font-bold">
                    {formatNumber(stats?.smartStats.oldSessions || 0)}
                  </span>
                </div>
              </div>

              <div className="border-t border-slate-700 pt-4">
                <h4 className="text-sm font-bold text-slate-300 mb-3">Kryteria:</h4>

                <div className="space-y-3">
                  <div>
                    <label className="flex items-center justify-between text-sm text-slate-400">
                      <span>Min. eventów w sesji:</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={smartMinEvents}
                        onChange={(e) => setSmartMinEvents(parseInt(e.target.value) || 0)}
                        className="w-20 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-center"
                      />
                    </label>
                    <p className="text-xs text-slate-600 mt-1">
                      Sesje z mniej eventów zostaną usunięte
                    </p>
                  </div>

                  <div>
                    <label className="flex items-center justify-between text-sm text-slate-400">
                      <span>Min. czas sesji (sekundy):</span>
                      <input
                        type="number"
                        min="0"
                        max="3600"
                        value={smartMinDuration}
                        onChange={(e) => setSmartMinDuration(parseInt(e.target.value) || 0)}
                        className="w-20 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-center"
                      />
                    </label>
                    <p className="text-xs text-slate-600 mt-1">Krótsze sesje zostaną usunięte</p>
                  </div>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={smartNoInteraction}
                      onChange={(e) => setSmartNoInteraction(e.target.checked)}
                      className="w-5 h-5 bg-slate-800 border border-slate-600 rounded"
                    />
                    <div>
                      <span className="text-sm text-slate-300">Usuń sesje bez interakcji</span>
                      <p className="text-xs text-slate-600">
                        Tylko pageviews, bez kliknięć/formularzy
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Sekcja automatycznego czyszczenia */}
              <div className="border-t border-slate-700 pt-4 mt-4">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                    ⏰ Automatyczne czyszczenie
                    {autoCleanupEnabled && (
                      <span className="text-[10px] px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full border border-emerald-500/30 animate-pulse">
                        AKTYWNE
                      </span>
                    )}
                  </h4>
                  <button
                    onClick={() => setAutoCleanupEnabled(!autoCleanupEnabled)}
                    className={`relative w-12 h-6 rounded-full transition-all duration-300 ${
                      autoCleanupEnabled ? 'bg-emerald-600' : 'bg-slate-600'
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-300 ${
                        autoCleanupEnabled ? 'left-7' : 'left-1'
                      }`}
                    />
                  </button>
                </div>

                {autoCleanupEnabled && (
                  <div className="space-y-4 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4">
                    {/* Interwał */}
                    <div>
                      <label className="block text-sm text-slate-400 mb-2">Uruchamiaj co:</label>
                      <div className="flex gap-2">
                        <select
                          value={autoCleanupInterval}
                          onChange={(e) => setAutoCleanupInterval(parseInt(e.target.value))}
                          className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white"
                        >
                          <option value={1}>1 godzinę</option>
                          <option value={6}>6 godzin</option>
                          <option value={12}>12 godzin</option>
                          <option value={24}>24 godziny (1 dzień)</option>
                          <option value={48}>48 godzin (2 dni)</option>
                          <option value={168}>168 godzin (1 tydzień)</option>
                        </select>
                      </div>
                    </div>

                    {/* Statystyki auto-cleanup */}
                    {autoCleanupSettings && (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-slate-800/50 p-2 rounded">
                          <span className="text-slate-400">Uruchomień: </span>
                          <span className="text-emerald-400 font-bold">
                            {autoCleanupSettings.total_runs}
                          </span>
                        </div>
                        <div className="bg-slate-800/50 p-2 rounded">
                          <span className="text-slate-400">Usunięto łącznie: </span>
                          <span className="text-emerald-400 font-bold">
                            {formatNumber(autoCleanupSettings.total_deleted)}
                          </span>
                        </div>
                        {autoCleanupSettings.last_run && (
                          <div className="bg-slate-800/50 p-2 rounded col-span-2">
                            <span className="text-slate-400">Ostatnie: </span>
                            <span className="text-white">
                              {new Date(autoCleanupSettings.last_run).toLocaleString('pl-PL')}
                            </span>
                          </div>
                        )}
                        {autoCleanupSettings.next_run && (
                          <div className="bg-slate-800/50 p-2 rounded col-span-2">
                            <span className="text-slate-400">Następne: </span>
                            <span className="text-emerald-400">
                              {new Date(autoCleanupSettings.next_run).toLocaleString('pl-PL')}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Historia auto-cleanup */}
                    {autoCleanupHistory.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs text-slate-400 mb-2">
                          Ostatnie automatyczne czyszczenia:
                        </p>
                        <div className="space-y-1 max-h-24 overflow-y-auto text-xs">
                          {autoCleanupHistory.slice(0, 5).map((item, idx) => (
                            <div key={idx} className="flex justify-between text-slate-500">
                              <span>{new Date(item.timestamp).toLocaleString('pl-PL')}</span>
                              <span className="text-emerald-400">-{item.total_deleted}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Przyciski */}
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={saveAutoCleanupSettings}
                        disabled={savingAutoCleanup}
                        className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
                      >
                        {savingAutoCleanup ? '💾 Zapisuję...' : '💾 Zapisz ustawienia'}
                      </button>
                      <button
                        onClick={runAutoCleanupNow}
                        disabled={runningAutoCleanup}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
                        title="Uruchom teraz"
                      >
                        {runningAutoCleanup ? '⏳' : '▶️'}
                      </button>
                    </div>
                  </div>
                )}

                {!autoCleanupEnabled && (
                  <p className="text-xs text-slate-500">
                    Włącz automatyczne czyszczenie, aby system regularnie usuwał
                    &quot;śmieciowe&quot; dane według ustawionych kryteriów.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Prawa kolumna - wykonanie */}
        <div className="space-y-4">
          {/* Info o wybranym trybie + przycisk */}
          {(() => {
            const colorStyles: Record<
              string,
              {
                gradient: string;
                border: string;
                shadow: string;
                btnBg: string;
                btnHover: string;
                btnShadow: string;
              }
            > = {
              red: {
                gradient: 'bg-gradient-to-br from-red-900/50 via-red-800/30 to-slate-900/50',
                border: 'border-red-500/50',
                shadow: 'shadow-red-500/20',
                btnBg: 'bg-red-600',
                btnHover: 'hover:bg-red-500',
                btnShadow: 'shadow-red-500/40',
              },
              amber: {
                gradient: 'bg-gradient-to-br from-amber-900/50 via-amber-800/30 to-slate-900/50',
                border: 'border-amber-500/50',
                shadow: 'shadow-amber-500/20',
                btnBg: 'bg-amber-600',
                btnHover: 'hover:bg-amber-500',
                btnShadow: 'shadow-amber-500/40',
              },
              blue: {
                gradient: 'bg-gradient-to-br from-blue-900/50 via-blue-800/30 to-slate-900/50',
                border: 'border-blue-500/50',
                shadow: 'shadow-blue-500/20',
                btnBg: 'bg-blue-600',
                btnHover: 'hover:bg-blue-500',
                btnShadow: 'shadow-blue-500/40',
              },
              purple: {
                gradient: 'bg-gradient-to-br from-purple-900/50 via-purple-800/30 to-slate-900/50',
                border: 'border-purple-500/50',
                shadow: 'shadow-purple-500/20',
                btnBg: 'bg-purple-600',
                btnHover: 'hover:bg-purple-500',
                btnShadow: 'shadow-purple-500/40',
              },
              cyan: {
                gradient: 'bg-gradient-to-br from-cyan-900/50 via-cyan-800/30 to-slate-900/50',
                border: 'border-cyan-500/50',
                shadow: 'shadow-cyan-500/20',
                btnBg: 'bg-cyan-600',
                btnHover: 'hover:bg-cyan-500',
                btnShadow: 'shadow-cyan-500/40',
              },
              emerald: {
                gradient:
                  'bg-gradient-to-br from-emerald-900/50 via-emerald-800/30 to-slate-900/50',
                border: 'border-emerald-500/50',
                shadow: 'shadow-emerald-500/20',
                btnBg: 'bg-emerald-600',
                btnHover: 'hover:bg-emerald-500',
                btnShadow: 'shadow-emerald-500/40',
              },
            };
            const style = colorStyles[modeLabels[mode].color] || colorStyles.blue;

            return (
              <div
                className={`relative overflow-hidden rounded-2xl border-2 p-6 transition-all duration-500 ${style.gradient} ${style.border} shadow-lg ${style.shadow}`}
              >
                {/* Animowany efekt połysku */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <div className="absolute -inset-[100%] animate-[shimmer_3s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-12"></div>
                </div>

                {/* Zawartość */}
                <div className="relative z-10">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="text-5xl animate-bounce">{modeLabels[mode].icon}</div>
                    <div>
                      <h4 className="text-xl font-bold text-white">{modeLabels[mode].label}</h4>
                      <p className="text-sm text-slate-300">{modeLabels[mode].description}</p>
                    </div>
                  </div>

                  {/* Podgląd ile zostanie usunięte */}
                  {livePreview && (
                    <div className="mb-4 p-3 bg-black/20 rounded-lg border border-white/10">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-300">Do usunięcia:</span>
                        <span className="text-xl font-bold text-white">
                          {formatNumber(getTotalDeleted(livePreview.deleted))} rekordów
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Przycisk */}
                  <button
                    onClick={handleCleanup}
                    disabled={executing}
                    className={`w-full py-4 rounded-xl text-lg font-bold transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${style.btnBg} ${style.btnHover} text-white shadow-xl ${style.btnShadow}`}
                  >
                    {executing ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="animate-spin">⏳</span> Usuwam dane...
                      </span>
                    ) : mode === 'all' ? (
                      <span className="flex items-center justify-center gap-2">
                        💀 USUŃ WSZYSTKO
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        🧹 Wyczyść dane
                      </span>
                    )}
                  </button>

                  <p className="text-xs text-red-300 text-center mt-3 flex items-center justify-center gap-1">
                    <span>⚠️</span> Operacja jest nieodwracalna!
                  </p>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Historia usunięć - podsumowanie */}
      {stats?.historySummary && stats.historySummary.operations_count > 0 && (
        <div className="mt-8 bg-gradient-to-r from-rose-900/20 to-orange-900/20 border border-rose-800/50 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-2xl">🗑️</span>
              Historia usuniętych danych
            </h3>
            <span className="text-sm text-slate-400">
              {stats.historySummary.operations_count} operacji łącznie
            </span>
          </div>

          {/* Podsumowanie łączne */}
          <div className="grid grid-cols-2 md:grid-cols-7 gap-3 mb-6">
            <div className="bg-rose-500/10 p-3 rounded-lg text-center border border-rose-500/20">
              <div className="text-2xl font-bold text-rose-400">
                {formatNumber(stats.historySummary.total_events)}
              </div>
              <div className="text-xs text-rose-300/70">Eventy</div>
            </div>
            <div className="bg-rose-500/10 p-3 rounded-lg text-center border border-rose-500/20">
              <div className="text-2xl font-bold text-rose-400">
                {formatNumber(stats.historySummary.total_sessions)}
              </div>
              <div className="text-xs text-rose-300/70">Sesje</div>
            </div>
            <div className="bg-rose-500/10 p-3 rounded-lg text-center border border-rose-500/20">
              <div className="text-2xl font-bold text-rose-400">
                {formatNumber(stats.historySummary.total_visitors)}
              </div>
              <div className="text-xs text-rose-300/70">Użytkownicy</div>
            </div>
            <div className="bg-rose-500/10 p-3 rounded-lg text-center border border-rose-500/20">
              <div className="text-2xl font-bold text-rose-400">
                {formatNumber(stats.historySummary.total_logs)}
              </div>
              <div className="text-xs text-rose-300/70">Logi</div>
            </div>
            <div className="bg-rose-500/10 p-3 rounded-lg text-center border border-rose-500/20">
              <div className="text-2xl font-bold text-rose-400">
                {formatNumber(stats.historySummary.total_forms)}
              </div>
              <div className="text-xs text-rose-300/70">Formularze</div>
            </div>
            <div className="bg-rose-500/10 p-3 rounded-lg text-center border border-rose-500/20">
              <div className="text-2xl font-bold text-rose-400">
                {formatNumber(stats.historySummary.total_files)}
              </div>
              <div className="text-xs text-rose-300/70">Pliki</div>
            </div>
            <div className="bg-rose-600/20 p-3 rounded-lg text-center border border-rose-500/40">
              <div className="text-2xl font-bold text-rose-300">
                {formatNumber(stats.historySummary.grand_total)}
              </div>
              <div className="text-xs text-rose-200/70 font-medium">ŁĄCZNIE</div>
            </div>
          </div>

          {/* Ostatnie operacje */}
          {stats.cleanupHistory && stats.cleanupHistory.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-400 mb-3">Ostatnie operacje:</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {stats.cleanupHistory.slice(0, 10).map((item) => {
                  const modeIcon: Record<string, string> = {
                    all: '💀',
                    period: '📅',
                    site: '🌐',
                    visitor: '👤',
                    ip: '🔗',
                    smart: '🧠',
                  };
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between bg-slate-800/30 rounded-lg px-4 py-2 text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{modeIcon[item.mode] || '🗑️'}</span>
                        <div>
                          <span className="text-slate-300 capitalize">{item.mode}</span>
                          <span className="text-slate-500 mx-2">•</span>
                          <span className="text-slate-400">
                            {new Date(item.timestamp).toLocaleString('pl-PL', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-rose-400 font-bold">
                          -{formatNumber(item.total_deleted)}
                        </span>
                        <span className="text-slate-500 text-xs">rekordów</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Informacja o działaniu */}
      <div className="mt-8 bg-slate-900/30 border border-slate-800 rounded-xl p-6">
        <h4 className="text-lg font-bold text-white mb-4">ℹ️ Jak to działa?</h4>
        <div className="grid md:grid-cols-3 gap-6 text-sm text-slate-400">
          <div>
            <h5 className="text-amber-400 font-semibold mb-2">🔍 Tryb Podglądu</h5>
            <p>
              Włączony domyślnie. Pokazuje ile rekordów <strong>zostałoby</strong> usuniętych, bez
              faktycznego usuwania. Bezpieczny sposób na sprawdzenie efektów.
            </p>
          </div>
          <div>
            <h5 className="text-emerald-400 font-semibold mb-2">🧹 Faktyczne Usuwanie</h5>
            <p>
              Odznacz &quot;Tryb podglądu&quot; aby naprawdę usunąć dane. Operacja jest{' '}
              <strong>nieodwracalna</strong> - upewnij się, że masz backup!
            </p>
          </div>
          <div>
            <h5 className="text-purple-400 font-semibold mb-2">🧠 Tryb Inteligentny</h5>
            <p>
              Automatycznie identyfikuje i usuwa &quot;śmieciowe&quot; sesje: puste wizyty, boty,
              krótkie sesje bez interakcji.
            </p>
          </div>
        </div>
      </div>
    </DashboardContent>
  );
}
