'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    OverviewStats,
    RealtimeStats,
    EventsBreakdown,
    TimelineData,
    ServerStats
} from '@/lib/types';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
} from 'recharts';
import LiveActivityStream from '@/components/LiveActivityStream';
import LocationsMapPanel from '@/components/LocationsMapPanel';
import { useRefresh } from '@/lib/contexts';
import { DashboardContent } from '@/components/dashboard';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#6366f1', '#14b8a6'];

const EVENT_TYPE_MAP: Record<string, string> = {
    'pageview': 'Odsłona Strony',
    'click': 'Kliknięcie',
    'form_start': 'Rozpoczęcie Formularza',
    'form_submit': 'Wysłanie Formularza',
    'input_sequence': 'Wpisywanie Tekstu',
    'clipboard_action': 'Schowek (Kopiuj/Wklej)',
    'rage_click': 'Wściekłe Kliknięcie',
    'visibility_hidden': 'Ukrycie Karty',
    'visibility_visible': 'Powrót na Kartę',
    'page_hidden': 'Ukrycie Strony',
    'page_visible': 'Widoczność Strony',
    'scroll': 'Przewijanie',
    'scroll_depth': 'Głębokość Przewijania',
    'mouse_move': 'Ruch Myszy',
    'mouse_path': 'Ścieżka Myszy',
    'text_selection': 'Zaznaczenie Tekstu',
    'element_visible': 'Element Widoczny',
    'field_focus': 'Skupienie na Polu',
    'field_blur': 'Opuszczenie Pola',
    'page_exit': 'Wyjście ze Strony',
    'error': 'Błąd JS',
    'performance': 'Wydajność',
    'heartbeat': 'Aktywność (Heartbeat)'
};

interface DateRange {
    from: Date;
    to: Date;
    label: string; // '1h', '24h', 'custom', etc.
}

// Komponent animowanego uptime (kompaktowy) dla dashboardu
function AnimatedUptimeCompact({ startTime }: { startTime: string | null }) {
    const [elapsed, setElapsed] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

    useEffect(() => {
        if (!startTime) return;

        const calculateElapsed = () => {
            const start = new Date(startTime).getTime();
            const now = Date.now();
            const diff = Math.floor((now - start) / 1000);

            const days = Math.floor(diff / 86400);
            const hours = Math.floor((diff % 86400) / 3600);
            const minutes = Math.floor((diff % 3600) / 60);
            const seconds = diff % 60;

            setElapsed({ days, hours, minutes, seconds });
        };

        calculateElapsed();
        const interval = setInterval(calculateElapsed, 1000);
        return () => clearInterval(interval);
    }, [startTime]);

    if (!startTime) {
        return <span className="text-slate-500">—</span>;
    }

    return (
        <span className="font-mono text-emerald-400 font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {elapsed.days > 0 && `${elapsed.days}d `}
            {String(elapsed.hours).padStart(2, '0')}:
            {String(elapsed.minutes).padStart(2, '0')}:
            <span className="text-emerald-300">{String(elapsed.seconds).padStart(2, '0')}</span>
        </span>
    );
}

export default function DashboardPage() {
    // === REFRESH CONTEXT ===
    const {
        setLastUpdated,
        setIsRefreshing,
        isRefreshing,
        autoRefreshEnabled,
        registerRefreshHandler,
        unregisterRefreshHandler,
    } = useRefresh();

    // === STATE ===

    // Domyślnie 1h
    const [dateRange, setDateRange] = useState<DateRange>(() => {
        const now = new Date();
        const from = new Date(now.getTime() - 60 * 60 * 1000); // 1h
        return { from, to: now, label: '1h' };
    });

    const [overview, setOverview] = useState<OverviewStats | null>(null);
    const [realtime, setRealtime] = useState<RealtimeStats | null>(null);
    const [events, setEvents] = useState<EventsBreakdown | null>(null);
    const [timeline, setTimeline] = useState<TimelineData | null>(null);
    const [serverStats, setServerStats] = useState<ServerStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Helpers for Date Inputs
    // Formatuje Date do "YYYY-MM-DDTHH:mm" dla input type="datetime-local"
    const toLocalISO = (date: Date) => {
        const tzOffset = date.getTimezoneOffset() * 60000;
        return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
    };

    // === FETCH DATA ===
    const fetchData = useCallback(async (isAutoRefresh = false) => {
        if (isAutoRefresh) {
            setIsRefreshing(true);
        } else {
            setLoading(true);
        }
        setError(null);

        try {
            // Dla auto-refresh aktualizuj zakres czasu do "teraz"
            const now = new Date();
            const currentRange = isAutoRefresh && dateRange.label !== 'custom' 
                ? { ...dateRange, to: now }
                : dateRange;

            const params = new URLSearchParams({
                from: currentRange.from.toISOString(),
                to: currentRange.to.toISOString(),
            });

            const [overviewRes, realtimeRes, eventsRes, timelineRes, serverRes] = await Promise.all([
                fetch(`/api/stats/overview?${params}`),
                fetch(`/api/stats/realtime`),
                fetch(`/api/stats/events?${params}`),
                fetch(`/api/stats/timeline?${params}`),
                fetch(`/api/stats/server`),
            ]);

            // Sprawdź czy wszystkie odpowiedzi są OK
            const responses = [overviewRes, realtimeRes, eventsRes, timelineRes, serverRes];
            const failedResponse = responses.find(r => !r.ok);

            if (failedResponse) {
                if (failedResponse.status === 401) {
                    // Przekieruj na stronę logowania
                    window.location.href = '/login';
                    return;
                }
                throw new Error(`Błąd serwera (${failedResponse.status})`);
            }

            const [overviewData, realtimeData, eventsData, timelineData, serverData] =
                await Promise.all([
                    overviewRes.json(),
                    realtimeRes.json(),
                    eventsRes.json(),
                    timelineRes.json(),
                    serverRes.json(),
                ]);

            setOverview(overviewData);
            setRealtime(realtimeData);
            setEvents(eventsData);
            setTimeline(timelineData);
            setServerStats(serverData);
            setLastUpdated(new Date());
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Nieznany błąd';
            console.error('Błąd podczas pobierania danych:', err);
            setError(errorMessage);
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    }, [dateRange, setIsRefreshing, setLastUpdated]);

    // Początkowe załadowanie
    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Rejestracja handlera odświeżania w kontekście
    useEffect(() => {
        registerRefreshHandler(() => fetchData(true));
        return () => unregisterRefreshHandler();
    }, [fetchData, registerRefreshHandler, unregisterRefreshHandler]);

    // Obsługa zmiany zakresu
    const setPresetRange = (label: string, minutes: number) => {
        const now = new Date();
        const from = new Date(now.getTime() - minutes * 60 * 1000);
        setDateRange({ from, to: now, label });
    };

    const handleCustomFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const date = new Date(e.target.value);
        if (!isNaN(date.getTime())) {
            setDateRange(prev => ({ ...prev, from: date, label: 'custom' }));
        }
    };

    const handleCustomToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const date = new Date(e.target.value);
        if (!isNaN(date.getTime())) {
            setDateRange(prev => ({ ...prev, to: date, label: 'custom' }));
        }
    };

    // === HELPERS ===
    const formatDuration = (ms: number) => {
        if (isNaN(ms) || ms < 0) return '0s';
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        return `${minutes}m ${seconds % 60}s`;
    };

    // Preset Buttons
    const presets = [
        { label: '1m', min: 1 },
        { label: '5m', min: 5 },
        { label: '15m', min: 15 },
        { label: '30m', min: 30 },
        { label: '45m', min: 45 },
        { label: '1h', min: 60 },
        { label: '3h', min: 180 },
        { label: '6h', min: 360 },
        { label: '24h', min: 1440 },
        { label: '7d', min: 10080 },
        { label: '14d', min: 20160 },
        { label: '30d', min: 43200 },
        { label: '6m', min: 259200 },
        { label: '12m', min: 518400 },
    ];

    // Error State
    if (error && !loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-200">
                <div className="text-center max-w-md p-8">
                    <div className="text-6xl mb-4">⚠️</div>
                    <h2 className="text-xl font-bold mb-2">Błąd ładowania danych</h2>
                    <p className="text-slate-400 mb-4">{error}</p>
                    <button
                        onClick={() => fetchData()}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                    >
                        Spróbuj ponownie
                    </button>
                </div>
            </div>
        );
    }

    if (loading && !overview) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-200">
                <div className="text-center">
                    <div className="animate-spin text-4xl mb-4">⏳</div>
                    <p>Ładowanie danych...</p>
                </div>
            </div>
        );
    }

    return (
        <DashboardContent>
            {/* Main Header */}
                <div className="mb-8 flex flex-col gap-4">
                    {/* Wiersz 1: Tytuł */}
                    <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight text-white mb-2">📊 Panel Analityczny</h1>
                            <p className="text-slate-400">Pełny wgląd w aktywność użytkowników.</p>
                        </div>
                    </div>

                    {/* Time Filters Toolbar */}
                    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex flex-col lg:flex-row items-center justify-between gap-4">
                        <div className="flex flex-wrap gap-2">
                            {presets.map(p => (
                                <button
                                    key={p.label}
                                    onClick={() => setPresetRange(p.label, p.min)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${dateRange.label === p.label
                                        ? 'bg-blue-600 border-blue-500 text-white'
                                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700'
                                        }`}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center gap-2 bg-slate-800 p-1.5 rounded-lg border border-slate-700">
                            <span className="text-xs text-slate-500 px-2">Zakres:</span>
                            <input
                                type="datetime-local"
                                value={toLocalISO(dateRange.from)}
                                onChange={handleCustomFromChange}
                                className="bg-slate-900 border border-slate-600 text-slate-200 text-xs rounded px-2 py-1 outline-none focus:border-blue-500"
                            />
                            <span className="text-slate-500">-</span>
                            <input
                                type="datetime-local"
                                value={toLocalISO(dateRange.to)}
                                onChange={handleCustomToChange}
                                className="bg-slate-900 border border-slate-600 text-slate-200 text-xs rounded px-2 py-1 outline-none focus:border-blue-500"
                            />
                        </div>
                    </div>
                </div>

                {/* Informacje o Serwerze - kompaktowa wersja z animowanym uptime */}
                {serverStats && (
                    <div className={`mb-8 rounded-xl border bg-gradient-to-br from-emerald-950/30 via-slate-900/80 to-slate-900/80 p-6 transition-all duration-500 ease-out ${isRefreshing ? 'border-blue-500/30' : 'border-emerald-800/50'}`}>
                        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                            {/* Lewa strona - status i uptime */}
                            <div className="flex items-center gap-6">
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        <span className="w-4 h-4 bg-emerald-500 rounded-full block animate-pulse shadow-lg shadow-emerald-500/50"></span>
                                        <span className="absolute inset-0 w-4 h-4 bg-emerald-400 rounded-full animate-ping opacity-25"></span>
                                    </div>
                                    <div>
                                        <div className="text-emerald-400 font-bold text-sm uppercase tracking-wider">Serwer Online</div>
                                        <div className="text-xs text-slate-500">
                                            Od: {serverStats.server_started_at 
                                                ? new Date(serverStats.server_started_at).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })
                                                : '—'
                                            }
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="h-10 w-px bg-slate-700"></div>
                                
                                <div>
                                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Uptime</div>
                                    <AnimatedUptimeCompact startTime={serverStats.server_started_at} />
                                </div>
                            </div>
                            
                            {/* Środek - kluczowe statystyki */}
                            <div className="flex items-center gap-4 flex-wrap">
                                <div className="flex items-center gap-2 bg-slate-800/50 px-3 py-2 rounded-lg border border-slate-700">
                                    <span className="text-blue-400 font-bold font-mono">{serverStats.total_events.toLocaleString('pl-PL')}</span>
                                    <span className="text-xs text-slate-500">eventów</span>
                                </div>
                                <div className="flex items-center gap-2 bg-slate-800/50 px-3 py-2 rounded-lg border border-slate-700">
                                    <span className="text-emerald-400 font-bold font-mono">{serverStats.total_sessions.toLocaleString('pl-PL')}</span>
                                    <span className="text-xs text-slate-500">sesji</span>
                                </div>
                                <div className="flex items-center gap-2 bg-slate-800/50 px-3 py-2 rounded-lg border border-slate-700">
                                    <span className="text-purple-400 font-bold font-mono">{serverStats.total_visitors.toLocaleString('pl-PL')}</span>
                                    <span className="text-xs text-slate-500">użytkowników</span>
                                </div>
                                <div className="flex items-center gap-2 bg-slate-800/50 px-3 py-2 rounded-lg border border-slate-700">
                                    <span className="text-amber-400 font-bold font-mono">{serverStats.logs_stats.total_requests.toLocaleString('pl-PL')}</span>
                                    <span className="text-xs text-slate-500">requestów</span>
                                </div>
                            </div>
                            
                        </div>
                    </div>
                )}

                {/* Realtime Cards - z płynnymi przejściami */}
                <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {/* Aktywni teraz - używamy poprawnego pola active_visitors */}
                    <div className={`stat-card p-6 rounded-xl border bg-slate-900/50 transition-all duration-500 ease-out ${isRefreshing ? 'border-blue-500/50 shadow-lg shadow-blue-500/10' : 'border-slate-800'}`}>
                        <div className="flex items-center justify-between">
                            <div className="text-slate-400 text-sm font-medium">Aktywni teraz</div>
                            {autoRefreshEnabled && (
                                <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                                    LIVE
                                </span>
                            )}
                        </div>
                        <div className={`text-4xl font-bold text-white mt-2 transition-all duration-300 ease-out ${isRefreshing ? 'opacity-60 scale-95' : 'opacity-100 scale-100'}`}>
                            {realtime?.active_visitors || 0}
                        </div>
                        <div className="text-emerald-500 text-xs mt-2 flex items-center">● Online</div>
                    </div>

                    {/* Metrics from Overview - z płynnymi przejściami */}
                    <div className={`stat-card p-6 rounded-xl border bg-slate-900/50 transition-all duration-500 ease-out ${isRefreshing ? 'border-blue-500/30' : 'border-slate-800'}`}>
                        <div className="text-slate-400 text-sm font-medium">Wizyty (Unikalni)</div>
                        <div className={`text-4xl font-bold text-white mt-2 transition-all duration-300 ease-out ${isRefreshing ? 'opacity-60 scale-95' : 'opacity-100 scale-100'}`}>
                            {overview?.unique_visitors || 0}
                        </div>
                        {overview?.trends && (
                            <div className={`text-xs mt-2 transition-opacity duration-300 ${isRefreshing ? 'opacity-40' : 'opacity-100'} ${overview.trends.visitors >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {overview.trends.visitors > 0 ? '+' : ''}{overview.trends.visitors}% vs poprzedni okres
                            </div>
                        )}
                    </div>

                    <div className={`stat-card p-6 rounded-xl border bg-slate-900/50 transition-all duration-500 ease-out ${isRefreshing ? 'border-blue-500/30' : 'border-slate-800'}`}>
                        <div className="text-slate-400 text-sm font-medium">Odsłony</div>
                        <div className={`text-4xl font-bold text-white mt-2 transition-all duration-300 ease-out ${isRefreshing ? 'opacity-60 scale-95' : 'opacity-100 scale-100'}`}>
                            {overview?.pageviews || 0}
                        </div>
                        {overview?.trends && (
                            <div className={`text-xs mt-2 transition-opacity duration-300 ${isRefreshing ? 'opacity-40' : 'opacity-100'} ${overview.trends.pageviews >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {overview.trends.pageviews > 0 ? '+' : ''}{overview.trends.pageviews}% vs poprzedni okres
                            </div>
                        )}
                    </div>

                    <div className={`stat-card p-6 rounded-xl border bg-slate-900/50 transition-all duration-500 ease-out ${isRefreshing ? 'border-blue-500/30' : 'border-slate-800'}`}>
                        <div className="text-slate-400 text-sm font-medium">Śr. czas sesji</div>
                        <div className={`text-4xl font-bold text-white mt-2 transition-all duration-300 ease-out ${isRefreshing ? 'opacity-60 scale-95' : 'opacity-100 scale-100'}`}>
                            {formatDuration((overview?.avg_session_duration || 0) * 1000)}
                        </div>
                    </div>
                </div>

                {/* Charts Area - z płynnymi przejściami */}
                <div className="mb-8 space-y-8">
                    {/* Aktywność w czasie - LIVE ACTIVITY STREAM - Full Width */}
                    <div className={`rounded-xl border bg-slate-900/50 overflow-hidden transition-all duration-500 ease-out ${isRefreshing ? 'border-blue-500/30' : 'border-slate-800'}`}>
                        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <h3 className="text-xl font-bold text-white">📈 Aktywność w czasie</h3>
                                <div className="flex items-center gap-2 bg-gradient-to-r from-blue-600/20 to-emerald-600/20 px-3 py-1 rounded-full border border-blue-500/30">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                    <span className="text-xs font-medium text-emerald-400">LIVE</span>
                                </div>
                            </div>
                            <div className="text-xs text-slate-500">
                                Granulacja: {timeline?.granularity === 'minute' ? 'minutowa' : timeline?.granularity === 'hour' ? 'godzinowa' : 'dzienna'}
                            </div>
                        </div>
                        <div className="h-[450px]">
                            {timeline && (
                                <LiveActivityStream 
                                    data={timeline.data} 
                                    isRefreshing={isRefreshing} 
                                />
                            )}
                        </div>
                    </div>

                    {/* Event Types - SUPER DUŻY WYKRES NA CAŁĄ SZEROKOŚĆ */}
                    <div className={`rounded-xl border bg-slate-900/50 p-6 flex flex-col transition-all duration-500 ease-out ${isRefreshing ? 'border-blue-500/30' : 'border-slate-800'}`}>
                        <h3 className="mb-6 text-2xl font-bold text-white flex items-center gap-3">
                            ⚡ Dystrybucja Zdarzeń
                            <span className="flex items-center gap-1.5 text-xs font-normal bg-purple-500/20 text-purple-400 px-2 py-1 rounded-full">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                                </span>
                                LIVE
                            </span>
                        </h3>
                        <div className={`h-[800px] w-full transition-opacity duration-300 ${isRefreshing ? 'opacity-70' : 'opacity-100'}`}>
                            {events && (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        layout="vertical"
                                        data={events.events.map(e => ({
                                            ...e,
                                            name: EVENT_TYPE_MAP[e.event_type] || e.event_type
                                        }))}
                                        margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                                        <XAxis type="number" stroke="#64748b" />
                                        <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={14} width={220} tick={{ fill: '#94a3b8' }} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                                            cursor={{ fill: '#1e293b' }}
                                        />
                                        <Bar 
                                            dataKey="count" 
                                            name="Ilość" 
                                            fill="#3b82f6" 
                                            radius={[0, 4, 4, 0]} 
                                            barSize={32}
                                            isAnimationActive={true}
                                            animationDuration={800}
                                            animationEasing="ease-out"
                                        >
                                            {events.events.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>
                </div>

                {/* Panel Mapy Lokalizacji */}
                <div className="mb-8">
                    <LocationsMapPanel isRefreshing={isRefreshing} />
                </div>

        </DashboardContent>
    );
}
