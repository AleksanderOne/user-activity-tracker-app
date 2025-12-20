'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DashboardContent } from '@/components/dashboard';
import { useRefresh } from '@/lib/contexts';

// Typy
interface SessionDetails {
    session_id: string;
    visitor_id: string;
    started_at: string;
    last_activity: string;
    event_count: number;
    device_info: ExtendedDeviceInfo | null;
}

interface ExtendedDeviceInfo {
    browserName?: string;
    platform?: string;
    screenWidth?: number;
    screenHeight?: number;
    userAgentServer?: boolean;
    ip?: string;
    location?: {
        country?: string;
        city?: string;
        isp?: string;
    };
    network?: {
        effectiveType?: string;
    };
}

interface SessionEvent {
    id?: string;
    event_type: string;
    created_at: string;
    page_path?: string;
    payload?: Record<string, unknown>;
}

interface SessionStats {
    total_events: number;
    pageviews: number;
    clicks: number;
    inputs: number;
    forms: number;
    rage_clicks: number;
    errors: number;
    scrolls: number;
    clipboard_actions: number;
    text_selections: number;
    total_keystrokes: number;
    total_input_time_ms: number;
    unique_pages: number;
    event_types: Record<string, number>;
    first_event: string | null;
    last_event: string | null;
    duration_ms: number;
    duration_formatted: string;
}

interface SessionAnalysis {
    input_data: Array<{field: string; value: string; keystrokes: number; duration: number}>;
    page_flow: Array<{path: string; time: string; duration?: number}>;
    click_heatmap: Array<{x: number; y: number; element: string}>;
    mouse_path: Array<{time: string; positions: Array<{x: number; y: number; t: number}>; count: number}>;
}

interface SessionFullData {
    session: {
        session_id: string;
        visitor_id: string;
        site_id: string;
        started_at: string;
        last_activity: string | null;
        device_info: ExtendedDeviceInfo | null;
        utm_params: Record<string, string> | null;
        ip_hash: string | null;
    } | null;
    events: SessionEvent[];
    stats: SessionStats;
    analysis: SessionAnalysis;
}

type ViewMode = 'table' | 'cards';
type SortField = 'started_at' | 'event_count' | 'visitor_id' | 'country' | 'last_activity';
type SortOrder = 'asc' | 'desc';
type DetailTab = 'timeline' | 'analysis' | 'inputs' | 'clicks' | 'mouse' | 'flow' | 'raw' | 'export';

const EVENT_TYPE_MAP: Record<string, string> = {
    'pageview': 'Odsłona strony',
    'click': 'Kliknięcie',
    'form_start': 'Formularz',
    'form_submit': 'Wysłanie',
    'input_sequence': 'Wpisywanie',
    'clipboard_action': 'Schowek',
    'rage_click': 'Rage click',
    'scroll': 'Przewijanie',
    'scroll_depth': 'Przewijanie',
    'error': 'Błąd JS',
    'mouse_path': 'Ruch myszki',
    'heartbeat': 'Heartbeat',
    'text_selection': 'Zaznaczenie',
    'visibility_change': 'Widoczność',
    'page_exit': 'Wyjście',
};

const EVENT_COLORS: Record<string, { bg: string; border: string; text: string; icon: string }> = {
    'pageview': { bg: 'bg-blue-500/20', border: 'border-blue-500', text: 'text-blue-400', icon: '📄' },
    'click': { bg: 'bg-emerald-500/20', border: 'border-emerald-500', text: 'text-emerald-400', icon: '🖱️' },
    'form_start': { bg: 'bg-amber-500/20', border: 'border-amber-500', text: 'text-amber-400', icon: '📝' },
    'form_submit': { bg: 'bg-green-500/20', border: 'border-green-500', text: 'text-green-400', icon: '✅' },
    'input_sequence': { bg: 'bg-purple-500/20', border: 'border-purple-500', text: 'text-purple-400', icon: '⌨️' },
    'clipboard_action': { bg: 'bg-cyan-500/20', border: 'border-cyan-500', text: 'text-cyan-400', icon: '📋' },
    'rage_click': { bg: 'bg-red-500/20', border: 'border-red-500', text: 'text-red-400', icon: '😤' },
    'scroll': { bg: 'bg-slate-500/20', border: 'border-slate-500', text: 'text-slate-400', icon: '📜' },
    'scroll_depth': { bg: 'bg-slate-500/20', border: 'border-slate-500', text: 'text-slate-400', icon: '📊' },
    'error': { bg: 'bg-rose-500/20', border: 'border-rose-500', text: 'text-rose-400', icon: '❌' },
    'mouse_path': { bg: 'bg-indigo-500/20', border: 'border-indigo-500', text: 'text-indigo-400', icon: '🐭' },
    'heartbeat': { bg: 'bg-pink-500/20', border: 'border-pink-500', text: 'text-pink-400', icon: '💓' },
    'text_selection': { bg: 'bg-orange-500/20', border: 'border-orange-500', text: 'text-orange-400', icon: '✂️' },
    'visibility_change': { bg: 'bg-teal-500/20', border: 'border-teal-500', text: 'text-teal-400', icon: '👁️' },
    'page_exit': { bg: 'bg-gray-500/20', border: 'border-gray-500', text: 'text-gray-400', icon: '🚪' },
};

const DEFAULT_EVENT_STYLE = { bg: 'bg-slate-500/20', border: 'border-slate-500', text: 'text-slate-400', icon: '📌' };

export default function SessionsPage() {
    const {
        setLastUpdated,
        setIsRefreshing,
        registerRefreshHandler,
        unregisterRefreshHandler,
    } = useRefresh();

    // Ref do sekcji szczegółów
    const detailsRef = useRef<HTMLDivElement>(null);

    // Stan główny
    const [sessions, setSessions] = useState<SessionDetails[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [total, setTotal] = useState(0);

    // Filtry
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [minEvents, setMinEvents] = useState<number | ''>('');
    const [maxEvents, setMaxEvents] = useState<number | ''>('');
    const [countryFilter, setCountryFilter] = useState('');
    const [browserFilter, setBrowserFilter] = useState('');
    const [platformFilter, setPlatformFilter] = useState('');

    // Widok i sortowanie
    const [viewMode, setViewMode] = useState<ViewMode>('table');
    const [sortField, setSortField] = useState<SortField>('started_at');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

    // Paginacja
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(25);

    // Szczegóły sesji (pod tabelą zamiast modalu)
    const [selectedSession, setSelectedSession] = useState<string | null>(null);
    const [sessionEvents, setSessionEvents] = useState<SessionEvent[]>([]);
    const [sessionFullData, setSessionFullData] = useState<SessionFullData | null>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [detailTab, setDetailTab] = useState<DetailTab>('timeline');
    const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());

    // Eksport
    const [exporting, setExporting] = useState(false);

    // Animacja ruchu myszki
    const [isAnimating, setIsAnimating] = useState(false);
    const [animationSpeed, setAnimationSpeed] = useState(50); // ms między punktami
    const [currentAnimPoint, setCurrentAnimPoint] = useState(0);
    const [allAnimPoints, setAllAnimPoints] = useState<Array<{x: number; y: number; segIdx: number}>>([]);
    const animationRef = useRef<NodeJS.Timeout | null>(null);

    // Odkrywanie wartości formularzy (hasła itp.)
    const [revealedFields, setRevealedFields] = useState<Set<number>>(new Set());

    // Unikalne wartości dla filtrów
    const [uniqueCountries, setUniqueCountries] = useState<string[]>([]);
    const [uniqueBrowsers, setUniqueBrowsers] = useState<string[]>([]);
    const [uniquePlatforms, setUniquePlatforms] = useState<string[]>([]);

    // Pobieranie sesji
    const fetchSessions = useCallback(async (isAutoRefresh = false) => {
        if (isAutoRefresh) {
            setIsRefreshing(true);
        } else {
            setLoading(true);
        }
        setError(null);

        try {
            const params = new URLSearchParams();
            if (dateFrom) params.set('from', new Date(dateFrom).toISOString());
            if (dateTo) params.set('to', new Date(dateTo).toISOString());
            params.set('limit', '500');

            const res = await fetch(`/api/sessions?${params}`);
            
            if (!res.ok) {
                if (res.status === 401) {
                    window.location.href = '/login';
                    return;
                }
                throw new Error(`Błąd serwera (${res.status})`);
            }

            const data = await res.json();
            setSessions(data.sessions || []);
            setTotal(data.total || 0);
            setLastUpdated(new Date());

            // Wyciągnij unikalne wartości dla filtrów
            const countries = new Set<string>();
            const browsers = new Set<string>();
            const platforms = new Set<string>();

            (data.sessions || []).forEach((s: SessionDetails) => {
                if (s.device_info?.location?.country) countries.add(s.device_info.location.country);
                if (s.device_info?.browserName) browsers.add(s.device_info.browserName);
                if (s.device_info?.platform) platforms.add(s.device_info.platform);
            });

            setUniqueCountries(Array.from(countries).sort());
            setUniqueBrowsers(Array.from(browsers).sort());
            setUniquePlatforms(Array.from(platforms).sort());

        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Nieznany błąd';
            console.error('Błąd:', err);
            setError(msg);
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    }, [dateFrom, dateTo, setIsRefreshing, setLastUpdated]);

    useEffect(() => {
        fetchSessions();
    }, [fetchSessions]);

    useEffect(() => {
        registerRefreshHandler(() => fetchSessions(true));
        return () => unregisterRefreshHandler();
    }, [fetchSessions, registerRefreshHandler, unregisterRefreshHandler]);

    // Filtrowanie i sortowanie
    const filteredSessions = useMemo(() => {
        let result = [...sessions];

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter(s => 
                s.visitor_id.toLowerCase().includes(term) ||
                s.session_id.toLowerCase().includes(term) ||
                s.device_info?.ip?.toLowerCase().includes(term) ||
                s.device_info?.location?.city?.toLowerCase().includes(term)
            );
        }

        if (minEvents !== '') {
            result = result.filter(s => s.event_count >= minEvents);
        }

        if (maxEvents !== '') {
            result = result.filter(s => s.event_count <= maxEvents);
        }

        if (countryFilter) {
            result = result.filter(s => s.device_info?.location?.country === countryFilter);
        }

        if (browserFilter) {
            result = result.filter(s => s.device_info?.browserName === browserFilter);
        }

        if (platformFilter) {
            result = result.filter(s => s.device_info?.platform === platformFilter);
        }

        result.sort((a, b) => {
            let valA: string | number = '';
            let valB: string | number = '';

            switch (sortField) {
                case 'started_at':
                case 'last_activity':
                    valA = new Date(a[sortField] || a.started_at).getTime();
                    valB = new Date(b[sortField] || b.started_at).getTime();
                    break;
                case 'event_count':
                    valA = a.event_count;
                    valB = b.event_count;
                    break;
                case 'visitor_id':
                    valA = a.visitor_id;
                    valB = b.visitor_id;
                    break;
                case 'country':
                    valA = a.device_info?.location?.country || '';
                    valB = b.device_info?.location?.country || '';
                    break;
            }

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        return result;
    }, [sessions, searchTerm, minEvents, maxEvents, countryFilter, browserFilter, platformFilter, sortField, sortOrder]);

    const paginatedSessions = useMemo(() => {
        const start = page * pageSize;
        return filteredSessions.slice(start, start + pageSize);
    }, [filteredSessions, page, pageSize]);

    const totalPages = Math.ceil(filteredSessions.length / pageSize);

    // Pobierz szczegóły sesji
    const handleSessionClick = async (sessionId: string) => {
        // Jeśli kliknięto tę samą sesję - zamknij szczegóły
        if (selectedSession === sessionId) {
            setSelectedSession(null);
            setSessionFullData(null);
            setSessionEvents([]);
            return;
        }

        setSelectedSession(sessionId);
        setLoadingDetails(true);
        setDetailTab('timeline');
        setExpandedEvents(new Set());
        
        try {
            const res = await fetch(`/api/sessions/${sessionId}`);
            if (!res.ok) throw new Error('Błąd pobierania');
            const data = await res.json() as SessionFullData;
            setSessionEvents(data.events || []);
            setSessionFullData(data);
            
            // Przewiń do szczegółów
            setTimeout(() => {
                detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        } catch (err) {
            console.error(err);
            setSessionEvents([]);
            setSessionFullData(null);
        } finally {
            setLoadingDetails(false);
        }
    };

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('desc');
        }
    };

    const resetFilters = () => {
        setSearchTerm('');
        setDateFrom('');
        setDateTo('');
        setMinEvents('');
        setMaxEvents('');
        setCountryFilter('');
        setBrowserFilter('');
        setPlatformFilter('');
        setPage(0);
    };

    const toggleEventExpand = (idx: number) => {
        setExpandedEvents(prev => {
            const newSet = new Set(prev);
            if (newSet.has(idx)) {
                newSet.delete(idx);
            } else {
                newSet.add(idx);
            }
            return newSet;
        });
    };

    const expandAllEvents = () => {
        setExpandedEvents(new Set(sessionEvents.map((_, idx) => idx)));
    };

    const collapseAllEvents = () => {
        setExpandedEvents(new Set());
    };

    // Animacja ruchu myszki - przygotuj punkty
    const prepareAnimationPoints = useCallback(() => {
        if (!sessionFullData?.analysis?.mouse_path) return [];
        
        const points: Array<{x: number; y: number; segIdx: number}> = [];
        const allPositions = sessionFullData.analysis.mouse_path.flatMap(s => s.positions);
        const maxX = Math.max(...allPositions.map(p => p.x), 1);
        const maxY = Math.max(...allPositions.map(p => p.y), 1);
        
        sessionFullData.analysis.mouse_path.slice(-10).forEach((segment, segIdx) => {
            segment.positions.forEach(p => {
                points.push({
                    x: (p.x / maxX) * 95 + 2.5,
                    y: (p.y / maxY) * 95 + 2.5,
                    segIdx
                });
            });
        });
        
        return points;
    }, [sessionFullData]);

    // Start animacji
    const startAnimation = () => {
        const points = prepareAnimationPoints();
        if (points.length === 0) return;
        
        setAllAnimPoints(points);
        setCurrentAnimPoint(0);
        setIsAnimating(true);
    };

    // Stop animacji
    const stopAnimation = () => {
        setIsAnimating(false);
        setCurrentAnimPoint(0);
        if (animationRef.current) {
            clearInterval(animationRef.current);
            animationRef.current = null;
        }
    };

    // Pauza/wznowienie
    const toggleAnimation = () => {
        if (isAnimating) {
            setIsAnimating(false);
            if (animationRef.current) {
                clearInterval(animationRef.current);
                animationRef.current = null;
            }
        } else if (allAnimPoints.length > 0) {
            setIsAnimating(true);
        }
    };

    // Efekt animacji
    useEffect(() => {
        if (isAnimating && allAnimPoints.length > 0) {
            animationRef.current = setInterval(() => {
                setCurrentAnimPoint(prev => {
                    if (prev >= allAnimPoints.length - 1) {
                        // Koniec animacji - zatrzymaj
                        setIsAnimating(false);
                        return prev;
                    }
                    return prev + 1;
                });
            }, animationSpeed);
        }
        
        return () => {
            if (animationRef.current) {
                clearInterval(animationRef.current);
            }
        };
    }, [isAnimating, animationSpeed, allAnimPoints.length]);

    // Eksport sesji
    const exportSessionData = (format: 'json' | 'csv') => {
        if (!sessionFullData) return;

        if (format === 'json') {
            const blob = new Blob([JSON.stringify(sessionFullData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `session_${selectedSession?.substring(0, 8)}_${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            URL.revokeObjectURL(url);
        } else {
            const events = sessionFullData.events;
            const headers = ['Czas', 'Typ', 'Strona', 'Szczegóły'];
            const rows = events.map(e => [
                new Date(e.created_at).toLocaleString('pl-PL'),
                EVENT_TYPE_MAP[e.event_type] || e.event_type,
                e.page_path || '',
                JSON.stringify(e.payload || {})
            ]);
            const csvContent = [headers, ...rows]
                .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
                .join('\n');
            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `session_${selectedSession?.substring(0, 8)}_${new Date().toISOString().split('T')[0]}.csv`;
            link.click();
            URL.revokeObjectURL(url);
        }
    };

    // Eksport listy sesji
    const exportToCSV = () => {
        setExporting(true);
        
        const headers = ['ID Sesji', 'ID Użytkownika', 'Start', 'Ostatnia aktywność', 'Eventy', 'IP', 'Kraj', 'Miasto', 'Przeglądarka', 'Platforma', 'Rozdzielczość'];
        const rows = filteredSessions.map(s => [
            s.session_id,
            s.visitor_id,
            new Date(s.started_at).toLocaleString('pl-PL'),
            s.last_activity ? new Date(s.last_activity).toLocaleString('pl-PL') : '',
            s.event_count.toString(),
            s.device_info?.ip || '',
            s.device_info?.location?.country || '',
            s.device_info?.location?.city || '',
            s.device_info?.browserName || '',
            s.device_info?.platform || '',
            s.device_info?.screenWidth && s.device_info?.screenHeight 
                ? `${s.device_info.screenWidth}x${s.device_info.screenHeight}` 
                : ''
        ]);

        const csvContent = [headers, ...rows]
            .map(row => row.map(cell => `"${cell}"`).join(','))
            .join('\n');

        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `sesje_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        
        setExporting(false);
    };

    // Formatowanie
    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString('pl-PL', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    const formatDuration = (start: string, end?: string) => {
        if (!end) return '—';
        const ms = new Date(end).getTime() - new Date(start).getTime();
        if (ms < 0) return '—';
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
        const hours = Math.floor(minutes / 60);
        return `${hours}h ${minutes % 60}m`;
    };

    const formatTimeDiff = (ms: number) => {
        if (ms < 1000) return `${ms}ms`;
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        return `${minutes}m ${seconds % 60}s`;
    };

    const getEventStyle = (type: string) => EVENT_COLORS[type] || DEFAULT_EVENT_STYLE;

    // Widok błędu
    if (error && !loading && sessions.length === 0) {
        return (
            <DashboardContent>
                <div className="flex items-center justify-center min-h-[400px]">
                    <div className="text-center">
                        <div className="text-6xl mb-4">⚠️</div>
                        <h2 className="text-xl font-bold mb-2 text-white">Błąd ładowania</h2>
                        <p className="text-slate-400 mb-4">{error}</p>
                        <button
                            onClick={() => fetchSessions()}
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                        >
                            Spróbuj ponownie
                        </button>
                    </div>
                </div>
            </DashboardContent>
        );
    }

    return (
        <DashboardContent>
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-3xl font-bold tracking-tight text-white mb-2">
                    👥 Sesje Użytkowników
                </h1>
                <p className="text-slate-400">
                    Kliknij sesję, aby zobaczyć szczegóły poniżej
                </p>
            </div>

            {/* Statystyki */}
            <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold text-white">{total}</div>
                    <div className="text-xs text-slate-400">Wszystkie sesje</div>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold text-blue-400">{filteredSessions.length}</div>
                    <div className="text-xs text-blue-400/70">Po filtrach</div>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold text-emerald-400">{uniqueCountries.length}</div>
                    <div className="text-xs text-emerald-400/70">Krajów</div>
                </div>
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold text-purple-400">
                        {filteredSessions.reduce((sum, s) => sum + s.event_count, 0)}
                    </div>
                    <div className="text-xs text-purple-400/70">Łącznie eventów</div>
                </div>
            </div>

            {/* Filtry */}
            <div className="mb-6 bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-white">🔍 Filtry</h3>
                    <button
                        onClick={resetFilters}
                        className="text-xs text-slate-400 hover:text-white px-3 py-1 bg-slate-800 rounded-lg transition-colors"
                    >
                        🔄 Resetuj
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="lg:col-span-2">
                        <label className="text-xs text-slate-500 uppercase tracking-wider mb-1 block">Szukaj</label>
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={e => { setSearchTerm(e.target.value); setPage(0); }}
                            placeholder="ID, IP, miasto..."
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm focus:border-blue-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-500 uppercase tracking-wider mb-1 block">Od</label>
                        <input
                            type="datetime-local"
                            value={dateFrom}
                            onChange={e => setDateFrom(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-500 uppercase tracking-wider mb-1 block">Do</label>
                        <input
                            type="datetime-local"
                            value={dateTo}
                            onChange={e => setDateTo(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-500 uppercase tracking-wider mb-1 block">Min. eventów</label>
                        <input
                            type="number"
                            value={minEvents}
                            onChange={e => { setMinEvents(e.target.value ? parseInt(e.target.value) : ''); setPage(0); }}
                            placeholder="0"
                            min="0"
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-500 uppercase tracking-wider mb-1 block">Kraj</label>
                        <select
                            value={countryFilter}
                            onChange={e => { setCountryFilter(e.target.value); setPage(0); }}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none"
                        >
                            <option value="">Wszystkie</option>
                            {uniqueCountries.map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-slate-500 uppercase tracking-wider mb-1 block">Przeglądarka</label>
                        <select
                            value={browserFilter}
                            onChange={e => { setBrowserFilter(e.target.value); setPage(0); }}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none"
                        >
                            <option value="">Wszystkie</option>
                            {uniqueBrowsers.map(b => (
                                <option key={b} value={b}>{b}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Toolbar */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-400">Widok:</span>
                    {(['table', 'cards'] as ViewMode[]).map(mode => (
                        <button
                            key={mode}
                            onClick={() => setViewMode(mode)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                viewMode === mode
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                            }`}
                        >
                            {mode === 'table' ? '📋 Tabela' : '🃏 Karty'}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={exportToCSV}
                        disabled={exporting || filteredSessions.length === 0}
                        className="px-3 py-1.5 bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs font-medium hover:bg-emerald-600/30 transition-colors disabled:opacity-50"
                    >
                        📊 Eksportuj CSV
                    </button>
                    <select
                        value={pageSize}
                        onChange={e => { setPageSize(parseInt(e.target.value)); setPage(0); }}
                        className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-sm"
                    >
                        {[10, 25, 50, 100].map(size => (
                            <option key={size} value={size}>{size} / strona</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Zawartość - Tabela/Karty */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="text-center">
                        <div className="animate-spin text-4xl mb-4">⏳</div>
                        <p className="text-slate-400">Ładowanie sesji...</p>
                    </div>
                </div>
            ) : viewMode === 'table' ? (
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                                    <th className="p-4 cursor-pointer hover:text-white" onClick={() => handleSort('visitor_id')}>
                                        Użytkownik {sortField === 'visitor_id' && (sortOrder === 'asc' ? '▲' : '▼')}
                                    </th>
                                    <th className="p-4 cursor-pointer hover:text-white" onClick={() => handleSort('started_at')}>
                                        Start {sortField === 'started_at' && (sortOrder === 'asc' ? '▲' : '▼')}
                                    </th>
                                    <th className="p-4">Czas</th>
                                    <th className="p-4">Urządzenie</th>
                                    <th className="p-4 cursor-pointer hover:text-white text-right" onClick={() => handleSort('event_count')}>
                                        Eventy {sortField === 'event_count' && (sortOrder === 'asc' ? '▲' : '▼')}
                                    </th>
                                    <th className="p-4 cursor-pointer hover:text-white" onClick={() => handleSort('country')}>
                                        Lokalizacja {sortField === 'country' && (sortOrder === 'asc' ? '▲' : '▼')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {paginatedSessions.map(session => (
                                    <tr
                                        key={session.session_id}
                                        onClick={() => handleSessionClick(session.session_id)}
                                        className={`cursor-pointer transition-all ${
                                            selectedSession === session.session_id
                                                ? 'bg-blue-600/20 border-l-4 border-l-blue-500'
                                                : 'hover:bg-slate-800/50'
                                        }`}
                                    >
                                        <td className="p-4">
                                            <div className="font-mono text-xs text-blue-400">{session.visitor_id.substring(0, 12)}...</div>
                                            <div className="text-[10px] text-slate-600">{session.session_id.substring(0, 8)}</div>
                                        </td>
                                        <td className="p-4 text-sm text-slate-300">{formatDate(session.started_at)}</td>
                                        <td className="p-4 text-sm text-slate-400">{formatDuration(session.started_at, session.last_activity)}</td>
                                        <td className="p-4 text-xs text-slate-400">
                                            <div>{session.device_info?.browserName || '?'} / {session.device_info?.platform || '?'}</div>
                                            <div className="text-slate-600">{session.device_info?.screenWidth}x{session.device_info?.screenHeight}</div>
                                        </td>
                                        <td className="p-4 text-right">
                                            <span className="font-bold text-white">{session.event_count}</span>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-2">
                                                <span>{session.device_info?.location?.country === 'Poland' ? '🇵🇱' : '🌍'}</span>
                                                <div className="text-sm">
                                                    <div className="text-slate-200">{session.device_info?.location?.country || 'N/A'}</div>
                                                    <div className="text-xs text-slate-500">{session.device_info?.location?.city}</div>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {filteredSessions.length === 0 && (
                        <div className="p-12 text-center text-slate-500">
                            Brak sesji spełniających kryteria
                        </div>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {paginatedSessions.map(session => (
                        <div
                            key={session.session_id}
                            onClick={() => handleSessionClick(session.session_id)}
                            className={`rounded-xl p-4 cursor-pointer transition-all ${
                                selectedSession === session.session_id
                                    ? 'bg-blue-600/20 border-2 border-blue-500'
                                    : 'bg-slate-900/50 border border-slate-800 hover:border-blue-500/50'
                            }`}
                        >
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <div className="font-mono text-xs text-blue-400">{session.visitor_id.substring(0, 16)}...</div>
                                    <div className="text-xs text-slate-500">{formatDate(session.started_at)}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-2xl font-bold text-white">{session.event_count}</div>
                                    <div className="text-[10px] text-slate-500">eventów</div>
                                </div>
                            </div>
                            <div className="flex items-center justify-between text-xs text-slate-400">
                                <span>{session.device_info?.browserName} / {session.device_info?.platform}</span>
                                <span>{session.device_info?.location?.country === 'Poland' ? '🇵🇱' : '🌍'} {session.device_info?.location?.city || session.device_info?.location?.country}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Paginacja */}
            {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-center gap-2">
                    <button onClick={() => setPage(0)} disabled={page === 0} className="px-3 py-1.5 bg-slate-800 rounded-lg text-sm disabled:opacity-50">««</button>
                    <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1.5 bg-slate-800 rounded-lg text-sm disabled:opacity-50">«</button>
                    <span className="px-4 py-1.5 text-sm text-slate-400">
                        <span className="text-white font-bold">{page + 1}</span> / {totalPages}
                    </span>
                    <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-3 py-1.5 bg-slate-800 rounded-lg text-sm disabled:opacity-50">»</button>
                    <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} className="px-3 py-1.5 bg-slate-800 rounded-lg text-sm disabled:opacity-50">»»</button>
                </div>
            )}

            {/* SZCZEGÓŁY SESJI - Pod tabelą */}
            {selectedSession && (
                <div ref={detailsRef} className="mt-8 scroll-mt-4">
                    {/* Nagłówek szczegółów */}
                    <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-t-xl p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-2xl">
                                    👤
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">
                                        Sesja #{selectedSession.substring(0, 8)}
                                    </h3>
                                    {sessionFullData?.session && (
                                        <div className="flex flex-wrap gap-3 text-sm text-slate-400">
                                            <span>🌐 {sessionFullData.session.device_info?.browserName || 'N/A'}</span>
                                            <span>💻 {sessionFullData.session.device_info?.platform || 'N/A'}</span>
                                            <span>📍 {sessionFullData.session.device_info?.location?.city || sessionFullData.session.device_info?.location?.country || 'N/A'}</span>
                                            <span>⏱️ {sessionFullData.stats?.duration_formatted || '—'}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedSession(null)}
                                className="text-slate-400 hover:text-white p-2 text-xl bg-slate-800/50 rounded-lg"
                            >
                                ✕
                            </button>
                        </div>
                    </div>

                    {/* Zakładki */}
                    <div className="bg-slate-800 border-x border-slate-700 px-4 flex flex-wrap gap-1">
                        {([
                            { id: 'timeline', label: '📜 Oś czasu', count: sessionEvents.length },
                            { id: 'analysis', label: '📊 Analiza', count: null },
                            { id: 'inputs', label: '⌨️ Formularze', count: sessionFullData?.analysis?.input_data?.length },
                            { id: 'clicks', label: '🖱️ Kliknięcia', count: sessionFullData?.stats?.clicks },
                            { id: 'mouse', label: '🐭 Ruch myszki', count: sessionFullData?.analysis?.mouse_path?.length },
                            { id: 'flow', label: '🗺️ Ścieżka', count: sessionFullData?.analysis?.page_flow?.length },
                            { id: 'raw', label: '🔧 JSON', count: null },
                            { id: 'export', label: '📥 Eksport', count: null },
                        ] as const).map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setDetailTab(tab.id)}
                                className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                                    detailTab === tab.id
                                        ? 'border-blue-500 text-blue-400 bg-slate-900/50'
                                        : 'border-transparent text-slate-400 hover:text-white'
                                }`}
                            >
                                {tab.label}
                                {tab.count !== null && tab.count !== undefined && tab.count > 0 && (
                                    <span className="ml-1 text-xs bg-slate-700 px-1.5 py-0.5 rounded">{tab.count}</span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Zawartość szczegółów */}
                    <div className="bg-slate-900 border border-slate-700 border-t-0 rounded-b-xl p-6 min-h-[400px]">
                        {loadingDetails ? (
                            <div className="flex items-center justify-center py-20">
                                <div className="animate-spin text-4xl">⏳</div>
                            </div>
                        ) : (
                            <>
                                {/* OŚ CZASU - Nowy design */}
                                {detailTab === 'timeline' && (
                                    <div>
                                        {/* Toolbar */}
                                        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-700">
                                            <div className="text-sm text-slate-400">
                                                <span className="text-white font-bold">{sessionEvents.length}</span> zdarzeń
                                                {expandedEvents.size > 0 && <span className="ml-2">• {expandedEvents.size} rozwiniętych</span>}
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={expandAllEvents} className="px-3 py-1.5 text-xs bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600/30">
                                                    ▼ Rozwiń wszystko
                                                </button>
                                                <button onClick={collapseAllEvents} className="px-3 py-1.5 text-xs bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600">
                                                    ▲ Zwiń wszystko
                                                </button>
                                            </div>
                                        </div>

                                        {sessionEvents.length === 0 ? (
                                            <div className="text-center text-slate-500 py-20">Brak zdarzeń</div>
                                        ) : (
                                            <div className="relative">
                                                {/* Linia czasu */}
                                                <div className="absolute left-[22px] top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 via-purple-500 to-slate-700 rounded-full" />

                                                <div className="space-y-2">
                                                    {sessionEvents.map((event, idx) => {
                                                        const style = getEventStyle(event.event_type);
                                                        const prevEvent = sessionEvents[idx - 1];
                                                        const timeDiff = prevEvent 
                                                            ? new Date(event.created_at).getTime() - new Date(prevEvent.created_at).getTime()
                                                            : 0;
                                                        const hasPayload = event.payload && Object.keys(event.payload).length > 0;

                                                        return (
                                                            <div key={idx} className="relative pl-20">
                                                                {/* Ikona na linii - WIĘKSZA */}
                                                                <div className={`absolute left-0 top-1 w-11 h-11 rounded-xl ${style.bg} border-2 ${style.border} flex items-center justify-center text-2xl z-10 shadow-lg`}>
                                                                    {style.icon}
                                                                </div>

                                                                {/* Różnica czasu */}
                                                                {idx > 0 && timeDiff > 1000 && (
                                                                    <div className="absolute left-12 -top-1 text-[11px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
                                                                        +{formatTimeDiff(timeDiff)}
                                                                    </div>
                                                                )}

                                                                {/* Karta eventu */}
                                                                <div 
                                                                    className={`rounded-xl border-2 transition-all shadow-sm ${
                                                                        expandedEvents.has(idx)
                                                                            ? `${style.bg} ${style.border}`
                                                                            : 'bg-slate-800/50 border-slate-700 hover:border-slate-500 hover:bg-slate-800/70'
                                                                    } ${hasPayload ? 'cursor-pointer' : ''}`}
                                                                    onClick={() => hasPayload && toggleEventExpand(idx)}
                                                                >
                                                                    <div className="px-5 py-3.5 flex items-center justify-between">
                                                                        <div className="flex items-center gap-4">
                                                                            <span className={`font-semibold text-base ${style.text}`}>
                                                                                {EVENT_TYPE_MAP[event.event_type] || event.event_type}
                                                                            </span>
                                                                            {event.page_path && (
                                                                                <span className="text-xs text-slate-400 bg-slate-900/80 px-3 py-1 rounded-full border border-slate-700">
                                                                                    📄 {event.page_path}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <div className="flex items-center gap-3">
                                                                            <span className="text-sm text-slate-400 font-mono bg-slate-900/50 px-2 py-1 rounded">
                                                                                {new Date(event.created_at).toLocaleTimeString('pl-PL')}
                                                                            </span>
                                                                            {hasPayload && (
                                                                                <span className={`text-lg ${expandedEvents.has(idx) ? style.text : 'text-slate-500'}`}>
                                                                                    {expandedEvents.has(idx) ? '▼' : '▶'}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>

                                                                    {/* Rozwinięte szczegóły */}
                                                                    {expandedEvents.has(idx) && hasPayload && (
                                                                        <div className="border-t-2 border-slate-700/50 px-5 py-4 bg-slate-950/70">
                                                                            <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Szczegóły zdarzenia</div>
                                                                            <pre className="text-sm text-slate-300 overflow-x-auto whitespace-pre-wrap font-mono bg-slate-900/50 p-3 rounded-lg">
                                                                                {JSON.stringify(event.payload, null, 2)}
                                                                            </pre>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* ANALIZA */}
                                {detailTab === 'analysis' && sessionFullData && (
                                    <div className="space-y-6">
                                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                            {[
                                                { label: 'Eventy', value: sessionFullData.stats.total_events, color: 'blue' },
                                                { label: 'Odsłony', value: sessionFullData.stats.pageviews, color: 'emerald' },
                                                { label: 'Kliknięcia', value: sessionFullData.stats.clicks, color: 'purple' },
                                                { label: 'Formularze', value: sessionFullData.stats.inputs, color: 'amber' },
                                                { label: 'Rage clicks', value: sessionFullData.stats.rage_clicks, color: 'rose' },
                                                { label: 'Błędy', value: sessionFullData.stats.errors, color: 'red' },
                                            ].map(stat => (
                                                <div key={stat.label} className={`bg-${stat.color}-500/10 border border-${stat.color}-500/30 rounded-xl p-4 text-center`}>
                                                    <div className={`text-2xl font-bold text-${stat.color}-400`}>{stat.value}</div>
                                                    <div className={`text-xs text-${stat.color}-400/70`}>{stat.label}</div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                                            <h4 className="text-lg font-bold text-white mb-4">📊 Rozkład typów</h4>
                                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                                {Object.entries(sessionFullData.stats.event_types)
                                                    .sort((a, b) => b[1] - a[1])
                                                    .map(([type, count]) => {
                                                        const style = getEventStyle(type);
                                                        return (
                                                            <div key={type} className="flex items-center justify-between bg-slate-900/50 p-3 rounded-lg">
                                                                <span className="flex items-center gap-2 text-sm">
                                                                    <span>{style.icon}</span>
                                                                    <span className="text-slate-300">{EVENT_TYPE_MAP[type] || type}</span>
                                                                </span>
                                                                <span className="font-bold text-white">{count}</span>
                                                            </div>
                                                        );
                                                    })
                                                }
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* DANE FORMULARZY */}
                                {detailTab === 'inputs' && sessionFullData && (
                                    <div className="space-y-4">
                                        {sessionFullData.analysis.input_data.length === 0 ? (
                                            <div className="text-center text-slate-500 py-20">Brak danych z formularzy</div>
                                        ) : (
                                            <>
                                                {/* Przycisk odkryj/ukryj wszystkie */}
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={() => setRevealedFields(new Set(sessionFullData.analysis.input_data.map((_, i) => i)))}
                                                        className="px-3 py-1.5 text-xs bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 rounded-lg hover:bg-emerald-600/30 transition-colors"
                                                    >
                                                        👁️ Pokaż wszystkie
                                                    </button>
                                                    <button
                                                        onClick={() => setRevealedFields(new Set())}
                                                        className="px-3 py-1.5 text-xs bg-slate-700 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
                                                    >
                                                        🔒 Ukryj wszystkie
                                                    </button>
                                                </div>

                                                {sessionFullData.analysis.input_data.map((input, idx) => {
                                                    // Sprawdź czy to pole wrażliwe (password, hasło, pin, secret, token, key)
                                                    const isSensitive = /password|hasło|haslo|pin|secret|token|key|card|karta|cvv|cvc/i.test(input.field);
                                                    const isRevealed = revealedFields.has(idx);
                                                    const displayValue = !isSensitive || isRevealed 
                                                        ? input.value 
                                                        : '•'.repeat(Math.min(input.value.length, 12));

                                                    return (
                                                        <div key={idx} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                                                            <div className="flex items-start justify-between mb-2">
                                                                <span className="font-medium text-white flex items-center gap-2">
                                                                    {isSensitive ? '🔐' : '📝'} {input.field}
                                                                    {isSensitive && (
                                                                        <span className="text-xs bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded-full">
                                                                            wrażliwe
                                                                        </span>
                                                                    )}
                                                                </span>
                                                                <span className="text-xs text-slate-500">{input.keystrokes} klawiszy • {(input.duration / 1000).toFixed(1)}s</span>
                                                            </div>
                                                            <div 
                                                                onClick={() => {
                                                                    if (isSensitive) {
                                                                        setRevealedFields(prev => {
                                                                            const newSet = new Set(prev);
                                                                            if (newSet.has(idx)) {
                                                                                newSet.delete(idx);
                                                                            } else {
                                                                                newSet.add(idx);
                                                                            }
                                                                            return newSet;
                                                                        });
                                                                    }
                                                                }}
                                                                className={`bg-slate-900 rounded-lg p-3 font-mono text-sm break-all flex items-center justify-between gap-2 ${
                                                                    isSensitive ? 'cursor-pointer hover:bg-slate-800 transition-colors' : ''
                                                                } ${isRevealed || !isSensitive ? 'text-emerald-400' : 'text-slate-400'}`}
                                                            >
                                                                <span>
                                                                    {input.value ? displayValue : <span className="text-slate-500 italic">puste</span>}
                                                                </span>
                                                                {isSensitive && input.value && (
                                                                    <button className="text-slate-500 hover:text-white transition-colors flex-shrink-0">
                                                                        {isRevealed ? '🔒' : '👁️'}
                                                                    </button>
                                                                )}
                                                            </div>
                                                            {isSensitive && !isRevealed && input.value && (
                                                                <div className="text-xs text-slate-500 mt-1">
                                                                    Kliknij aby odkryć ({input.value.length} znaków)
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* KLIKNIĘCIA */}
                                {detailTab === 'clicks' && sessionFullData && (
                                    <div className="space-y-4">
                                        {sessionFullData.analysis.click_heatmap.length === 0 ? (
                                            <div className="text-center text-slate-500 py-20">Brak danych o kliknięciach</div>
                                        ) : (
                                            <>
                                                <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
                                                    <table className="w-full text-sm">
                                                        <thead className="bg-slate-800">
                                                            <tr className="text-slate-400 text-xs uppercase">
                                                                <th className="p-3 text-left">Element</th>
                                                                <th className="p-3 text-right">X</th>
                                                                <th className="p-3 text-right">Y</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-700">
                                                            {sessionFullData.analysis.click_heatmap.slice(0, 20).map((click, idx) => (
                                                                <tr key={idx} className="hover:bg-slate-700/50">
                                                                    <td className="p-3 text-white">{click.element}</td>
                                                                    <td className="p-3 text-right font-mono text-blue-400">{click.x}</td>
                                                                    <td className="p-3 text-right font-mono text-emerald-400">{click.y}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* RUCH MYSZKI */}
                                {detailTab === 'mouse' && sessionFullData && (
                                    <div className="space-y-4">
                                        {!sessionFullData.analysis.mouse_path || sessionFullData.analysis.mouse_path.length === 0 ? (
                                            <div className="text-center text-slate-500 py-20">Brak danych o ruchu myszki</div>
                                        ) : (
                                            <>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 text-center">
                                                        <div className="text-2xl font-bold text-purple-400">{sessionFullData.analysis.mouse_path.length}</div>
                                                        <div className="text-xs text-purple-400/70">Segmentów</div>
                                                    </div>
                                                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 text-center">
                                                        <div className="text-2xl font-bold text-blue-400">
                                                            {sessionFullData.analysis.mouse_path.reduce((sum, p) => sum + p.positions.length, 0)}
                                                        </div>
                                                        <div className="text-xs text-blue-400/70">Punktów</div>
                                                    </div>
                                                </div>
                                                <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
                                                    <div className="flex items-center justify-between mb-4">
                                                        <h5 className="text-base font-semibold text-white">🐭 Wizualizacja ścieżki ruchu myszki</h5>
                                                        
                                                        {/* Kontrolki animacji */}
                                                        <div className="flex items-center gap-4">
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    onClick={startAnimation}
                                                                    disabled={isAnimating}
                                                                    className="px-3 py-1.5 bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 rounded-lg text-sm hover:bg-emerald-600/30 disabled:opacity-50 transition-colors"
                                                                >
                                                                    ▶ Start
                                                                </button>
                                                                <button
                                                                    onClick={toggleAnimation}
                                                                    disabled={allAnimPoints.length === 0}
                                                                    className="px-3 py-1.5 bg-amber-600/20 border border-amber-500/30 text-amber-400 rounded-lg text-sm hover:bg-amber-600/30 disabled:opacity-50 transition-colors"
                                                                >
                                                                    {isAnimating ? '⏸ Pauza' : '▶ Wznów'}
                                                                </button>
                                                                <button
                                                                    onClick={stopAnimation}
                                                                    className="px-3 py-1.5 bg-rose-600/20 border border-rose-500/30 text-rose-400 rounded-lg text-sm hover:bg-rose-600/30 transition-colors"
                                                                >
                                                                    ⏹ Stop
                                                                </button>
                                                            </div>
                                                            
                                                            {/* Slider szybkości */}
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs text-slate-400">Szybkość:</span>
                                                                <input
                                                                    type="range"
                                                                    min="10"
                                                                    max="200"
                                                                    step="10"
                                                                    value={200 - animationSpeed + 10}
                                                                    onChange={e => setAnimationSpeed(200 - parseInt(e.target.value) + 10)}
                                                                    className="w-24 accent-blue-500"
                                                                />
                                                                <span className="text-xs text-slate-500 w-12">{animationSpeed}ms</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Pasek postępu animacji */}
                                                    {allAnimPoints.length > 0 && (
                                                        <div className="mb-4">
                                                            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                                                                <span>Punkt {currentAnimPoint + 1} / {allAnimPoints.length}</span>
                                                                <span>{Math.round((currentAnimPoint / Math.max(allAnimPoints.length - 1, 1)) * 100)}%</span>
                                                            </div>
                                                            <div className="h-2 bg-slate-900 rounded-full overflow-hidden">
                                                                <div 
                                                                    className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500 transition-all duration-100"
                                                                    style={{ width: `${(currentAnimPoint / Math.max(allAnimPoints.length - 1, 1)) * 100}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="relative bg-slate-950 rounded-xl h-[500px] overflow-hidden border border-slate-700">
                                                        <svg 
                                                            className="w-full h-full" 
                                                            viewBox="0 0 100 100" 
                                                            preserveAspectRatio="xMidYMid meet"
                                                        >
                                                            {/* Siatka */}
                                                            <defs>
                                                                <pattern id="grid" width="5" height="5" patternUnits="userSpaceOnUse">
                                                                    <path d="M 5 0 L 0 0 0 5" fill="none" stroke="#1e293b" strokeWidth="0.15"/>
                                                                </pattern>
                                                                <pattern id="gridLarge" width="20" height="20" patternUnits="userSpaceOnUse">
                                                                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#334155" strokeWidth="0.25"/>
                                                                </pattern>
                                                                {/* Glow dla animowanego punktu */}
                                                                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                                                                    <feGaussianBlur stdDeviation="1" result="coloredBlur"/>
                                                                    <feMerge>
                                                                        <feMergeNode in="coloredBlur"/>
                                                                        <feMergeNode in="SourceGraphic"/>
                                                                    </feMerge>
                                                                </filter>
                                                            </defs>
                                                            <rect width="100" height="100" fill="url(#grid)" />
                                                            <rect width="100" height="100" fill="url(#gridLarge)" />
                                                            
                                                            {sessionFullData.analysis.mouse_path.slice(-10).map((segment, segIdx) => {
                                                                const allPositions = sessionFullData.analysis.mouse_path.flatMap(s => s.positions);
                                                                const maxX = Math.max(...allPositions.map(p => p.x), 1);
                                                                const maxY = Math.max(...allPositions.map(p => p.y), 1);
                                                                
                                                                const points = segment.positions.map(p => ({
                                                                    x: (p.x / maxX) * 95 + 2.5,
                                                                    y: (p.y / maxY) * 95 + 2.5
                                                                }));
                                                                
                                                                if (points.length < 2) return null;
                                                                
                                                                const pathD = points.reduce((acc, p, i) => 
                                                                    acc + (i === 0 ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`), '');
                                                                
                                                                const hue = (segIdx * 36) % 360;
                                                                
                                                                return (
                                                                    <g key={segIdx}>
                                                                        <path
                                                                            d={pathD}
                                                                            fill="none"
                                                                            stroke={`hsl(${hue}, 70%, 30%)`}
                                                                            strokeWidth="1.5"
                                                                            strokeLinecap="round"
                                                                            strokeLinejoin="round"
                                                                        />
                                                                        <path
                                                                            d={pathD}
                                                                            fill="none"
                                                                            stroke={`hsl(${hue}, 80%, 60%)`}
                                                                            strokeWidth="0.6"
                                                                            strokeLinecap="round"
                                                                            strokeLinejoin="round"
                                                                        />
                                                                        <circle
                                                                            cx={points[0].x}
                                                                            cy={points[0].y}
                                                                            r="2"
                                                                            fill={`hsl(${hue}, 80%, 50%)`}
                                                                            stroke={`hsl(${hue}, 80%, 70%)`}
                                                                            strokeWidth="0.5"
                                                                        />
                                                                        <circle
                                                                            cx={points[points.length - 1].x}
                                                                            cy={points[points.length - 1].y}
                                                                            r="1.5"
                                                                            fill={`hsl(${hue}, 80%, 70%)`}
                                                                        />
                                                                    </g>
                                                                );
                                                            })}

                                                            {/* Animowany kursor */}
                                                            {allAnimPoints.length > 0 && currentAnimPoint < allAnimPoints.length && (
                                                                <g filter="url(#glow)">
                                                                    {/* Ślad */}
                                                                    {currentAnimPoint > 5 && (
                                                                        <path
                                                                            d={allAnimPoints.slice(Math.max(0, currentAnimPoint - 20), currentAnimPoint + 1)
                                                                                .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
                                                                                .join(' ')}
                                                                            fill="none"
                                                                            stroke="#fff"
                                                                            strokeWidth="0.8"
                                                                            strokeOpacity="0.5"
                                                                            strokeLinecap="round"
                                                                        />
                                                                    )}
                                                                    {/* Zewnętrzny pierścień */}
                                                                    <circle
                                                                        cx={allAnimPoints[currentAnimPoint].x}
                                                                        cy={allAnimPoints[currentAnimPoint].y}
                                                                        r="4"
                                                                        fill="none"
                                                                        stroke="#fff"
                                                                        strokeWidth="0.5"
                                                                        strokeOpacity="0.5"
                                                                    />
                                                                    {/* Główny punkt */}
                                                                    <circle
                                                                        cx={allAnimPoints[currentAnimPoint].x}
                                                                        cy={allAnimPoints[currentAnimPoint].y}
                                                                        r="2.5"
                                                                        fill="#fff"
                                                                    />
                                                                    {/* Środek */}
                                                                    <circle
                                                                        cx={allAnimPoints[currentAnimPoint].x}
                                                                        cy={allAnimPoints[currentAnimPoint].y}
                                                                        r="1"
                                                                        fill={`hsl(${(allAnimPoints[currentAnimPoint].segIdx * 36) % 360}, 80%, 60%)`}
                                                                    />
                                                                </g>
                                                            )}
                                                        </svg>
                                                    </div>
                                                    
                                                    {/* Legenda */}
                                                    <div className="mt-4 flex flex-wrap gap-3">
                                                        {sessionFullData.analysis.mouse_path.slice(-10).map((segment, idx) => (
                                                            <div 
                                                                key={idx} 
                                                                className="flex items-center gap-2 text-sm bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-700"
                                                            >
                                                                <div 
                                                                    className="w-4 h-4 rounded-full shadow-lg" 
                                                                    style={{ backgroundColor: `hsl(${(idx * 36) % 360}, 80%, 60%)` }}
                                                                />
                                                                <span className="text-slate-300">Segment {idx + 1}</span>
                                                                <span className="text-slate-500 text-xs">({segment.positions.length} pkt)</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* ŚCIEŻKA NAWIGACJI */}
                                {detailTab === 'flow' && sessionFullData && (
                                    <div className="space-y-4">
                                        {sessionFullData.analysis.page_flow.length === 0 ? (
                                            <div className="text-center text-slate-500 py-20">Brak danych o nawigacji</div>
                                        ) : (
                                            <div className="relative">
                                                <div className="absolute left-6 top-6 bottom-6 w-0.5 bg-gradient-to-b from-blue-500 via-purple-500 to-emerald-500" />
                                                <div className="space-y-4">
                                                    {sessionFullData.analysis.page_flow.map((step, idx) => (
                                                        <div key={idx} className="flex items-center gap-4 relative">
                                                            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold z-10 ${
                                                                idx === 0 ? 'bg-blue-600' :
                                                                idx === sessionFullData.analysis.page_flow.length - 1 ? 'bg-emerald-600' :
                                                                'bg-purple-600'
                                                            }`}>
                                                                {idx + 1}
                                                            </div>
                                                            <div className="flex-1 bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                                                                <div className="font-medium text-white">📄 {step.path}</div>
                                                                <div className="flex gap-4 text-xs text-slate-400 mt-1">
                                                                    <span>{new Date(step.time).toLocaleTimeString('pl-PL')}</span>
                                                                    {step.duration && step.duration > 0 && <span>⏱️ {formatTimeDiff(step.duration)}</span>}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* SUROWE DANE */}
                                {detailTab === 'raw' && sessionFullData && (
                                    <div className="bg-slate-950 border border-slate-700 rounded-xl p-4 overflow-x-auto max-h-[500px]">
                                        <pre className="text-xs text-slate-300 whitespace-pre-wrap">
                                            {JSON.stringify(sessionFullData, null, 2)}
                                        </pre>
                                    </div>
                                )}

                                {/* EKSPORT */}
                                {detailTab === 'export' && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <button
                                            onClick={() => exportSessionData('json')}
                                            className="bg-blue-600/20 border border-blue-500/30 text-blue-400 rounded-xl p-6 hover:bg-blue-600/30 transition-all text-left"
                                        >
                                            <div className="text-3xl mb-2">📋</div>
                                            <div className="text-lg font-bold">Eksportuj JSON</div>
                                            <div className="text-sm text-blue-400/70 mt-1">Pełne dane sesji</div>
                                        </button>
                                        <button
                                            onClick={() => exportSessionData('csv')}
                                            className="bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 rounded-xl p-6 hover:bg-emerald-600/30 transition-all text-left"
                                        >
                                            <div className="text-3xl mb-2">📊</div>
                                            <div className="text-lg font-bold">Eksportuj CSV</div>
                                            <div className="text-sm text-emerald-400/70 mt-1">Lista eventów do arkusza</div>
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </DashboardContent>
    );
}
