'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { DashboardContent } from '@/components/dashboard';

// Typy dla monitorowanych stron
type SiteStatus = 'online' | 'idle' | 'offline';

interface RecentEvent {
  event_type: string;
  timestamp: string;
  page_path: string | null;
}

interface MonitoredSite {
  site_id: string;
  origin: string | null;
  status: SiteStatus;
  status_label: string;
  last_event_at: string | null;
  last_log_at: string | null;
  last_activity: string | null;
  active_sessions: number;
  events_last_5min: number;
  events_last_hour: number;
  total_events_today: number;
  errors_last_hour: number;
  avg_response_time: number;
  recent_events: RecentEvent[];
}

interface MonitorSummary {
  total_sites: number;
  online_count: number;
  idle_count: number;
  offline_count: number;
  total_active_sessions: number;
  total_events_5min: number;
}

interface MonitorResponse {
  sites: MonitoredSite[];
  summary: MonitorSummary;
  available_sites: string[];
  timestamp: string;
}

// Mapa nazw eventów
const EVENT_TYPE_MAP: Record<string, string> = {
  pageview: 'Odsłona',
  click: 'Kliknięcie',
  form_start: 'Formularz',
  form_submit: 'Wysłanie',
  input_sequence: 'Wpisywanie',
  clipboard_action: 'Schowek',
  rage_click: 'Rage Click',
  visibility_hidden: 'Ukrycie',
  visibility_visible: 'Powrót',
  scroll: 'Scroll',
  heartbeat: 'Heartbeat',
  error: 'Błąd',
};

// Konfiguracja statusów
const STATUS_CONFIG: Record<
  SiteStatus,
  { bg: string; border: string; text: string; dot: string; glow: string }
> = {
  online: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/50',
    text: 'text-emerald-400',
    dot: 'bg-emerald-400',
    glow: 'shadow-emerald-500/30',
  },
  idle: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/50',
    text: 'text-amber-400',
    dot: 'bg-amber-400',
    glow: 'shadow-amber-500/30',
  },
  offline: {
    bg: 'bg-slate-500/10',
    border: 'border-slate-600',
    text: 'text-slate-500',
    dot: 'bg-slate-500',
    glow: '',
  },
};

export default function MonitorPage() {
  // Stan główny
  const [sites, setSites] = useState<MonitoredSite[]>([]);
  const [summary, setSummary] = useState<MonitorSummary | null>(null);
  const [availableSites, setAvailableSites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Wybrane strony do monitorowania
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [showSiteSelector, setShowSiteSelector] = useState(false);

  // Auto-refresh
  const [autoRefresh] = useState(true);
  const [refreshInterval] = useState(3000); // 3 sekundy domyślnie

  // Filtrowanie
  const [statusFilter, setStatusFilter] = useState<SiteStatus | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Wybrany site do szczegółów
  const [expandedSite, setExpandedSite] = useState<string | null>(null);

  // Pobieranie danych
  const fetchMonitorData = useCallback(
    async (isAutoRefresh = false) => {
      if (isAutoRefresh) {
        // silent refresh
      } else {
        setLoading(true);
      }

      try {
        const params = new URLSearchParams();
        if (selectedSites.length > 0) {
          params.set('site_ids', selectedSites.join(','));
        }

        const res = await fetch(`/api/monitor?${params}`);

        if (!res.ok) {
          if (res.status === 401) {
            window.location.href = '/login';
            return;
          }
          throw new Error(`Błąd pobierania danych (${res.status})`);
        }

        const data: MonitorResponse = await res.json();
        setSites(data.sites);
        setSummary(data.summary);
        setAvailableSites(data.available_sites);
        setError(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Nieznany błąd';
        console.error('Błąd monitoringu:', err);
        setError(msg);
      } finally {
        setLoading(false);
        setLoading(false);
      }
    },
    [selectedSites],
  );

  // Początkowe ładowanie
  useEffect(() => {
    fetchMonitorData();
  }, [fetchMonitorData]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => fetchMonitorData(true), refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchMonitorData]);

  // Filtrowanie stron
  const filteredSites = useMemo(() => {
    return sites.filter((site) => {
      // Filtr statusu
      if (statusFilter !== 'all' && site.status !== statusFilter) {
        return false;
      }
      // Filtr wyszukiwania
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return (
          site.site_id.toLowerCase().includes(term) || site.origin?.toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [sites, statusFilter, searchTerm]);

  // Formatowanie daty
  const formatTimeAgo = (dateString: string | null) => {
    if (!dateString) return 'Nigdy';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return `${diffSec}s temu`;
    if (diffMin < 60) return `${diffMin}m temu`;
    if (diffHour < 24) return `${diffHour}h temu`;
    return `${diffDay}d temu`;
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('pl-PL', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // Obsługa wyboru stron
  const toggleSiteSelection = (siteId: string) => {
    setSelectedSites((prev) =>
      prev.includes(siteId) ? prev.filter((s) => s !== siteId) : [...prev, siteId],
    );
  };

  const selectAllSites = () => {
    setSelectedSites([...availableSites]);
  };

  const clearSiteSelection = () => {
    setSelectedSites([]);
  };

  // Widok błędu
  if (error && !loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-200">
        <div className="text-center max-w-md p-8">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold mb-2">Błąd monitoringu</h2>
          <p className="text-slate-400 mb-4">{error}</p>
          <button
            onClick={() => fetchMonitorData()}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Spróbuj ponownie
          </button>
        </div>
      </div>
    );
  }

  // Widok ładowania
  if (loading && sites.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-200">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <p>Ładowanie monitora...</p>
        </div>
      </div>
    );
  }

  return (
    <DashboardContent>
      {/* Modal wyboru stron */}
      {showSiteSelector && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setShowSiteSelector(false)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg max-h-[70vh] overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 p-4 border-b border-slate-700 bg-slate-800 flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">🎯 Wybierz strony do monitorowania</h3>
              <button
                onClick={() => setShowSiteSelector(false)}
                className="text-slate-400 hover:text-white p-2"
              >
                ✕
              </button>
            </div>

            <div className="p-4 border-b border-slate-700 flex gap-2">
              <button
                onClick={selectAllSites}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm transition-colors"
              >
                Zaznacz wszystkie
              </button>
              <button
                onClick={clearSiteSelection}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm transition-colors"
              >
                Odznacz wszystkie
              </button>
            </div>

            <div className="p-4 max-h-[50vh] overflow-y-auto space-y-2">
              {availableSites.length === 0 ? (
                <p className="text-slate-500 text-center py-8">Brak dostępnych stron</p>
              ) : (
                availableSites.map((siteId) => (
                  <label
                    key={siteId}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedSites.includes(siteId)
                        ? 'bg-blue-500/20 border-blue-500/50'
                        : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSites.includes(siteId)}
                      onChange={() => toggleSiteSelection(siteId)}
                      className="w-4 h-4 accent-blue-500"
                    />
                    <span className="font-medium">{siteId}</span>
                  </label>
                ))
              )}
            </div>

            <div className="p-4 border-t border-slate-700 bg-slate-800/50">
              <button
                onClick={() => setShowSiteSelector(false)}
                className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg font-medium transition-colors"
              >
                Zastosuj (
                {selectedSites.length > 0 ? `${selectedSites.length} wybranych` : 'wszystkie'})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">👁️ Monitor Stron</h1>
        <p className="text-slate-400">Watchdog - monitoruj aktywność stron w czasie rzeczywistym</p>
      </div>

      {/* Podsumowanie */}
      {summary && (
        <div className="mb-8 grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-white">{summary.total_sites}</div>
            <div className="text-xs text-slate-400 mt-1">Wszystkie strony</div>
          </div>
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-emerald-400">{summary.online_count}</div>
            <div className="text-xs text-emerald-400/70 mt-1">Online</div>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-amber-400">{summary.idle_count}</div>
            <div className="text-xs text-amber-400/70 mt-1">Czeka</div>
          </div>
          <div className="bg-slate-500/10 border border-slate-600 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-slate-500">{summary.offline_count}</div>
            <div className="text-xs text-slate-500 mt-1">Wyłączona</div>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-blue-400">{summary.total_active_sessions}</div>
            <div className="text-xs text-blue-400/70 mt-1">Aktywne sesje</div>
          </div>
          <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-purple-400">{summary.total_events_5min}</div>
            <div className="text-xs text-purple-400/70 mt-1">Eventy (5 min)</div>
          </div>
        </div>
      )}

      {/* Filtry i wybór stron */}
      <div className="mb-6 bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex flex-wrap gap-4 items-center">
        {/* Szukaj */}
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Szukaj strony (site_id, origin...)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm focus:border-blue-500 outline-none"
          />
        </div>

        {/* Status filter */}
        <div className="flex gap-2">
          {(['all', 'online', 'idle', 'offline'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${
                statusFilter === status
                  ? status === 'online'
                    ? 'bg-emerald-600/30 border-emerald-500 text-emerald-400'
                    : status === 'idle'
                      ? 'bg-amber-600/30 border-amber-500 text-amber-400'
                      : status === 'offline'
                        ? 'bg-slate-600/30 border-slate-500 text-slate-400'
                        : 'bg-blue-600/30 border-blue-500 text-blue-400'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {status === 'all'
                ? 'Wszystkie'
                : status === 'online'
                  ? '🟢 Online'
                  : status === 'idle'
                    ? '🟡 Czeka'
                    : '⚫ Wyłączona'}
            </button>
          ))}
        </div>

        {/* Wybór stron */}
        <button
          onClick={() => setShowSiteSelector(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          🎯 Wybierz strony
          {selectedSites.length > 0 && (
            <span className="bg-indigo-500 px-2 py-0.5 rounded-full text-xs">
              {selectedSites.length}
            </span>
          )}
        </button>
      </div>

      {/* Lista stron */}
      <div className="space-y-4">
        {filteredSites.length === 0 ? (
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-12 text-center">
            <div className="text-4xl mb-4">📭</div>
            <p className="text-slate-400">Brak stron spełniających kryteria</p>
            <p className="text-slate-500 text-sm mt-2">
              {sites.length === 0
                ? 'Strony pojawią się tutaj po pierwszej aktywności trackera'
                : 'Zmień filtry lub wybierz inne strony'}
            </p>
          </div>
        ) : (
          filteredSites.map((site) => {
            const config = STATUS_CONFIG[site.status];
            const isExpanded = expandedSite === site.site_id;

            return (
              <div
                key={site.site_id}
                className={`${config.bg} border ${config.border} rounded-xl overflow-hidden transition-all duration-300 ${
                  site.status === 'online' ? `shadow-lg ${config.glow}` : ''
                }`}
              >
                {/* Główny wiersz */}
                <div
                  className="p-5 cursor-pointer hover:bg-white/5 transition-colors"
                  onClick={() => setExpandedSite(isExpanded ? null : site.site_id)}
                >
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    {/* Status i nazwa */}
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div
                          className={`w-4 h-4 rounded-full ${config.dot} ${site.status === 'online' ? 'animate-pulse' : ''}`}
                        ></div>
                        {site.status === 'online' && (
                          <div
                            className={`absolute inset-0 w-4 h-4 rounded-full ${config.dot} animate-ping opacity-30`}
                          ></div>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-lg text-white">{site.site_id}</h3>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${config.bg} ${config.text} border ${config.border}`}
                          >
                            {site.status_label}
                          </span>
                        </div>
                        {site.origin && (
                          <p className="text-xs text-slate-500 font-mono truncate max-w-[300px]">
                            {site.origin}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Statystyki inline */}
                    <div className="flex items-center gap-6 text-sm">
                      <div className="text-center">
                        <div className="font-bold text-blue-400">{site.active_sessions}</div>
                        <div className="text-[10px] text-slate-500">Sesje</div>
                      </div>
                      <div className="text-center">
                        <div className="font-bold text-purple-400">{site.events_last_5min}</div>
                        <div className="text-[10px] text-slate-500">Eventy (5m)</div>
                      </div>
                      <div className="text-center">
                        <div className="font-bold text-cyan-400">{site.events_last_hour}</div>
                        <div className="text-[10px] text-slate-500">Eventy (1h)</div>
                      </div>
                      <div className="text-center">
                        <div
                          className={`font-bold ${site.errors_last_hour > 0 ? 'text-red-400' : 'text-slate-500'}`}
                        >
                          {site.errors_last_hour}
                        </div>
                        <div className="text-[10px] text-slate-500">Błędy (1h)</div>
                      </div>
                      <div className="text-center">
                        <div className="font-bold text-slate-300">{site.avg_response_time}ms</div>
                        <div className="text-[10px] text-slate-500">Śr. czas</div>
                      </div>
                      <div className="text-center min-w-[80px]">
                        <div className="font-mono text-xs text-slate-400">
                          {formatTimeAgo(site.last_activity)}
                        </div>
                        <div className="text-[10px] text-slate-500">Ostatnia akt.</div>
                      </div>
                    </div>

                    {/* Rozwiń */}
                    <button
                      className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    >
                      ▼
                    </button>
                  </div>
                </div>

                {/* Rozwinięte szczegóły */}
                {isExpanded && (
                  <div className="border-t border-slate-700/50 p-5 bg-slate-900/30">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Statystyki szczegółowe */}
                      <div>
                        <h4 className="text-sm font-bold text-slate-400 mb-3">📊 Statystyki</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-slate-800/50 p-3 rounded-lg">
                            <div className="text-xs text-slate-500">Eventy dzisiaj</div>
                            <div className="text-xl font-bold text-green-400">
                              {site.total_events_today}
                            </div>
                          </div>
                          <div className="bg-slate-800/50 p-3 rounded-lg">
                            <div className="text-xs text-slate-500">Ostatni event</div>
                            <div className="text-sm font-mono text-slate-300">
                              {site.last_event_at ? formatTime(site.last_event_at) : 'Brak'}
                            </div>
                          </div>
                          <div className="bg-slate-800/50 p-3 rounded-lg">
                            <div className="text-xs text-slate-500">Ostatnia komunikacja</div>
                            <div className="text-sm font-mono text-slate-300">
                              {site.last_log_at ? formatTime(site.last_log_at) : 'Brak'}
                            </div>
                          </div>
                          <div className="bg-slate-800/50 p-3 rounded-lg">
                            <div className="text-xs text-slate-500">Czas odpowiedzi</div>
                            <div
                              className={`text-xl font-bold ${
                                site.avg_response_time < 100
                                  ? 'text-emerald-400'
                                  : site.avg_response_time < 500
                                    ? 'text-amber-400'
                                    : 'text-red-400'
                              }`}
                            >
                              {site.avg_response_time}ms
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Ostatnie eventy */}
                      <div>
                        <h4 className="text-sm font-bold text-slate-400 mb-3">
                          ⚡ Ostatnie zdarzenia
                        </h4>
                        {site.recent_events.length === 0 ? (
                          <p className="text-slate-500 text-sm">Brak zdarzeń</p>
                        ) : (
                          <div className="space-y-2">
                            {site.recent_events.map((event, idx) => (
                              <div
                                key={idx}
                                className="flex items-center gap-3 bg-slate-800/30 p-2 rounded text-sm"
                              >
                                <span className="font-mono text-xs text-slate-500">
                                  {formatTime(event.timestamp)}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-xs ${
                                    event.event_type === 'pageview'
                                      ? 'bg-blue-500/20 text-blue-400'
                                      : event.event_type === 'click'
                                        ? 'bg-emerald-500/20 text-emerald-400'
                                        : event.event_type === 'error'
                                          ? 'bg-red-500/20 text-red-400'
                                          : 'bg-slate-500/20 text-slate-400'
                                  }`}
                                >
                                  {EVENT_TYPE_MAP[event.event_type] || event.event_type}
                                </span>
                                {event.page_path && (
                                  <span className="text-xs text-slate-500 truncate max-w-[150px]">
                                    {event.page_path}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-slate-500 text-xs space-y-1">
        <p>🔄 Watchdog automatycznie sprawdza status stron co {refreshInterval / 1000}s</p>
        <p>🟢 Online: aktywność &lt;2min | 🟡 Czeka: 2-10min | ⚫ Wyłączona: &gt;10min</p>
      </div>
    </DashboardContent>
  );
}
