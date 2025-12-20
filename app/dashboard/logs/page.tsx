'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { DashboardContent } from '@/components/dashboard';

// Typy dla logów komunikacji
interface SiteStats {
    site_id: string;
    origin: string | null;
    total_requests: number;
    success_count: number;
    error_count: number;
    last_seen: string;
    first_seen: string;
    avg_duration_ms: number;
    total_events: number;
    is_connected: boolean;
}

interface LogEntry {
    id: string;
    timestamp: string;
    site_id: string;
    origin: string | null;
    ip: string;
    method: string;
    endpoint: string;
    status_code: number;
    request_size: number;
    response_size: number;
    duration_ms: number;
    events_count: number;
    error_message: string | null;
    user_agent: string | null;
    session_id: string | null;
    visitor_id: string | null;
}

interface LogsResponse {
    logs: LogEntry[];
    total: number;
    limit: number;
    offset: number;
    sites: SiteStats[];
}

// Mapy statusów HTTP
const STATUS_MAP: Record<number, { label: string; color: string; bg: string }> = {
    200: { label: 'OK', color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
    201: { label: 'Created', color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
    204: { label: 'No Content', color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
    400: { label: 'Bad Request', color: 'text-amber-400', bg: 'bg-amber-500/20' },
    401: { label: 'Unauthorized', color: 'text-orange-400', bg: 'bg-orange-500/20' },
    403: { label: 'Forbidden', color: 'text-orange-400', bg: 'bg-orange-500/20' },
    404: { label: 'Not Found', color: 'text-amber-400', bg: 'bg-amber-500/20' },
    429: { label: 'Too Many Requests', color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
    500: { label: 'Server Error', color: 'text-red-400', bg: 'bg-red-500/20' },
};

export default function LogsPage() {
    // Stan
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [sites, setSites] = useState<SiteStats[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // Filtry
    const [selectedSite, setSelectedSite] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'error'>('all');
    const [searchTerm, setSearchTerm] = useState('');
    
    // Paginacja
    const [total, setTotal] = useState(0);
    const [limit] = useState(50);
    const [offset, setOffset] = useState(0);
    
    // Auto-refresh
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const AUTO_REFRESH_INTERVAL = 5000; // 5 sekund

    // Wybrany log do szczegółów
    const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);

    // Pobieranie logów
    const fetchLogs = useCallback(async () => {
        try {
            const params = new URLSearchParams({
                limit: limit.toString(),
                offset: offset.toString(),
            });
            
            if (selectedSite !== 'all') {
                params.set('site_id', selectedSite);
            }
            
            if (statusFilter !== 'all') {
                params.set('status', statusFilter);
            }

            const res = await fetch(`/api/logs?${params}`);
            
            if (!res.ok) {
                if (res.status === 401) {
                    window.location.href = '/login';
                    return;
                }
                throw new Error(`Błąd pobierania logów (${res.status})`);
            }

            const data: LogsResponse = await res.json();
            setLogs(data.logs);
            setSites(data.sites);
            setTotal(data.total);
            setLastUpdated(new Date());
            setError(null);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Nieznany błąd';
            console.error('Błąd pobierania logów:', err);
            setError(msg);
        } finally {
            setLoading(false);
        }
    }, [limit, offset, selectedSite, statusFilter]);

    // Początkowe ładowanie i auto-refresh
    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    useEffect(() => {
        if (!autoRefresh) return;
        const interval = setInterval(fetchLogs, AUTO_REFRESH_INTERVAL);
        return () => clearInterval(interval);
    }, [autoRefresh, fetchLogs]);

    // Filtrowanie lokalne po searchTerm
    const filteredLogs = useMemo(() => {
        if (!searchTerm) return logs;
        const term = searchTerm.toLowerCase();
        return logs.filter(log => 
            log.site_id.toLowerCase().includes(term) ||
            log.origin?.toLowerCase().includes(term) ||
            log.ip.includes(term) ||
            log.session_id?.toLowerCase().includes(term) ||
            log.visitor_id?.toLowerCase().includes(term) ||
            log.error_message?.toLowerCase().includes(term)
        );
    }, [logs, searchTerm]);

    // Formatowanie daty
    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString('pl-PL', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    // Formatowanie rozmiaru
    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    // Nawigacja
    const goToPage = (page: number) => {
        setOffset(page * limit);
    };

    const currentPage = Math.floor(offset / limit);
    const totalPages = Math.ceil(total / limit);

    // Status badge
    const getStatusBadge = (statusCode: number) => {
        const status = STATUS_MAP[statusCode] || { 
            label: `${statusCode}`, 
            color: 'text-slate-400', 
            bg: 'bg-slate-500/20' 
        };
        return (
            <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${status.color} ${status.bg}`}>
                {statusCode}
            </span>
        );
    };

    // Widok błędu
    if (error && !loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-200">
                <div className="text-center max-w-md p-8">
                    <div className="text-6xl mb-4">⚠️</div>
                    <h2 className="text-xl font-bold mb-2">Błąd ładowania logów</h2>
                    <p className="text-slate-400 mb-4">{error}</p>
                    <button
                        onClick={fetchLogs}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                    >
                        Spróbuj ponownie
                    </button>
                </div>
            </div>
        );
    }

    // Widok ładowania
    if (loading && logs.length === 0) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-200">
                <div className="text-center">
                    <div className="animate-spin text-4xl mb-4">⏳</div>
                    <p>Ładowanie logów...</p>
                </div>
            </div>
        );
    }

    return (
        <DashboardContent>
            {/* Modal szczegółów logu */}
            {selectedLog && (
                <div 
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                    onClick={() => setSelectedLog(null)}
                >
                    <div 
                        className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-3xl max-h-[80vh] overflow-auto shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="sticky top-0 p-4 border-b border-slate-700 bg-slate-800 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                {getStatusBadge(selectedLog.status_code)}
                                <h3 className="text-lg font-bold text-white">
                                    Szczegóły żądania
                                </h3>
                            </div>
                            <button 
                                onClick={() => setSelectedLog(null)} 
                                className="text-slate-400 hover:text-white p-2 text-xl"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-6 space-y-6">
                            {/* Podstawowe info */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                                    <div className="text-xs text-slate-400 mb-1">Czas</div>
                                    <div className="font-mono text-sm">{formatDate(selectedLog.timestamp)}</div>
                                </div>
                                <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                                    <div className="text-xs text-slate-400 mb-1">Czas odpowiedzi</div>
                                    <div className="font-mono text-sm">{selectedLog.duration_ms} ms</div>
                                </div>
                            </div>

                            {/* Site & Origin */}
                            <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                                <div className="text-xs text-slate-400 mb-2">Strona źródłowa</div>
                                <div className="font-bold text-lg text-blue-400 mb-1">{selectedLog.site_id}</div>
                                {selectedLog.origin && (
                                    <div className="text-sm text-slate-400 font-mono">{selectedLog.origin}</div>
                                )}
                            </div>

                            {/* Request info */}
                            <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                                <div className="text-xs text-slate-400 mb-2">Żądanie</div>
                                <div className="flex gap-4 flex-wrap">
                                    <div>
                                        <span className="text-slate-500 text-xs">Metoda:</span>
                                        <span className="ml-2 font-mono text-emerald-400">{selectedLog.method}</span>
                                    </div>
                                    <div>
                                        <span className="text-slate-500 text-xs">Endpoint:</span>
                                        <span className="ml-2 font-mono">{selectedLog.endpoint}</span>
                                    </div>
                                    <div>
                                        <span className="text-slate-500 text-xs">IP:</span>
                                        <span className="ml-2 font-mono text-yellow-400">{selectedLog.ip}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Rozmiary */}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 text-center">
                                    <div className="text-xs text-slate-400 mb-1">Żądanie</div>
                                    <div className="font-mono text-cyan-400">{formatSize(selectedLog.request_size)}</div>
                                </div>
                                <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 text-center">
                                    <div className="text-xs text-slate-400 mb-1">Odpowiedź</div>
                                    <div className="font-mono text-cyan-400">{formatSize(selectedLog.response_size)}</div>
                                </div>
                                <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 text-center">
                                    <div className="text-xs text-slate-400 mb-1">Eventy</div>
                                    <div className="font-mono text-purple-400">{selectedLog.events_count}</div>
                                </div>
                            </div>

                            {/* Sesja / Visitor */}
                            {(selectedLog.session_id || selectedLog.visitor_id) && (
                                <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                                    <div className="text-xs text-slate-400 mb-2">Identyfikatory</div>
                                    <div className="space-y-2 font-mono text-xs">
                                        {selectedLog.session_id && (
                                            <div>
                                                <span className="text-slate-500">Session:</span>
                                                <span className="ml-2 text-blue-400">{selectedLog.session_id}</span>
                                            </div>
                                        )}
                                        {selectedLog.visitor_id && (
                                            <div>
                                                <span className="text-slate-500">Visitor:</span>
                                                <span className="ml-2 text-green-400">{selectedLog.visitor_id}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* User Agent */}
                            {selectedLog.user_agent && (
                                <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                                    <div className="text-xs text-slate-400 mb-2">User Agent</div>
                                    <div className="font-mono text-xs text-slate-300 break-all">
                                        {selectedLog.user_agent}
                                    </div>
                                </div>
                            )}

                            {/* Błąd */}
                            {selectedLog.error_message && (
                                <div className="bg-red-950/30 p-4 rounded-lg border border-red-800">
                                    <div className="text-xs text-red-400 mb-2">⚠️ Błąd</div>
                                    <div className="font-mono text-sm text-red-300">
                                        {selectedLog.error_message}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-white mb-2">
                        📋 Logi komunikacji
                    </h1>
                    <p className="text-slate-400">
                        Historia komunikacji z monitorowanymi stronami
                    </p>
                </div>

                {/* Karty statusu stron */}
                <div className="mb-8">
                    <h2 className="text-xl font-bold text-white mb-4">📡 Połączone strony</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {sites.length === 0 ? (
                            <div className="col-span-full bg-slate-900/50 border border-slate-800 rounded-xl p-8 text-center">
                                <div className="text-4xl mb-4">📭</div>
                                <p className="text-slate-400">Brak danych o połączonych stronach</p>
                                <p className="text-slate-500 text-sm mt-2">
                                    Strony pojawią się tutaj po pierwszej komunikacji z trackerem
                                </p>
                            </div>
                        ) : (
                            sites.map(site => (
                                <div
                                    key={site.site_id}
                                    className={`bg-slate-900/50 border rounded-xl p-5 cursor-pointer transition-all hover:scale-[1.02] ${
                                        site.is_connected 
                                            ? 'border-emerald-500/50 shadow-lg shadow-emerald-500/10' 
                                            : 'border-slate-800'
                                    } ${selectedSite === site.site_id ? 'ring-2 ring-blue-500' : ''}`}
                                    onClick={() => setSelectedSite(selectedSite === site.site_id ? 'all' : site.site_id)}
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`w-3 h-3 rounded-full ${
                                                    site.is_connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                                                }`}></span>
                                                <span className={`text-xs font-medium ${
                                                    site.is_connected ? 'text-emerald-400' : 'text-slate-500'
                                                }`}>
                                                    {site.is_connected ? 'ONLINE' : 'OFFLINE'}
                                                </span>
                                            </div>
                                            <h3 className="font-bold text-lg text-white">{site.site_id}</h3>
                                            {site.origin && (
                                                <p className="text-xs text-slate-500 font-mono truncate max-w-[200px]">
                                                    {site.origin}
                                                </p>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <div className="text-2xl font-bold text-blue-400">{site.total_requests}</div>
                                            <div className="text-xs text-slate-500">żądań</div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-3 text-center">
                                        <div className="bg-slate-800/50 p-2 rounded">
                                            <div className="text-lg font-bold text-emerald-400">{site.success_count}</div>
                                            <div className="text-[10px] text-slate-500">Sukces</div>
                                        </div>
                                        <div className="bg-slate-800/50 p-2 rounded">
                                            <div className={`text-lg font-bold ${site.error_count > 0 ? 'text-red-400' : 'text-slate-500'}`}>
                                                {site.error_count}
                                            </div>
                                            <div className="text-[10px] text-slate-500">Błędy</div>
                                        </div>
                                        <div className="bg-slate-800/50 p-2 rounded">
                                            <div className="text-lg font-bold text-purple-400">{site.total_events}</div>
                                            <div className="text-[10px] text-slate-500">Eventy</div>
                                        </div>
                                    </div>

                                    <div className="mt-3 pt-3 border-t border-slate-800 flex justify-between text-xs text-slate-500">
                                        <span>Śr. czas: {Math.round(site.avg_duration_ms)}ms</span>
                                        <span>Ostatnio: {formatDate(site.last_seen)}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Filtry */}
                <div className="mb-6 bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex flex-wrap gap-4 items-center">
                    {/* Szukaj */}
                    <div className="flex-1 min-w-[200px]">
                        <input
                            type="text"
                            placeholder="Szukaj (site_id, IP, session, visitor, błąd...)"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm focus:border-blue-500 outline-none"
                        />
                    </div>

                    {/* Status filter */}
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value as 'all' | 'success' | 'error')}
                        className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm focus:border-blue-500 outline-none"
                    >
                        <option value="all">Wszystkie statusy</option>
                        <option value="success">✅ Sukces (2xx)</option>
                        <option value="error">❌ Błędy</option>
                    </select>

                    {/* Site filter */}
                    <select
                        value={selectedSite}
                        onChange={e => setSelectedSite(e.target.value)}
                        className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm focus:border-blue-500 outline-none"
                    >
                        <option value="all">Wszystkie strony</option>
                        {sites.map(site => (
                            <option key={site.site_id} value={site.site_id}>
                                {site.site_id}
                            </option>
                        ))}
                    </select>

                    {/* Refresh button */}
                    <button
                        onClick={fetchLogs}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                    >
                        ⟳ Odśwież
                    </button>
                </div>

                {/* Tabela logów */}
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
                    <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                        <h2 className="text-xl font-bold text-white">📋 Historia komunikacji</h2>
                        <span className="text-sm text-slate-400">
                            {filteredLogs.length} z {total} wpisów
                        </span>
                    </div>

                    {filteredLogs.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="text-4xl mb-4">📭</div>
                            <p className="text-slate-400">Brak logów spełniających kryteria</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                                        <th className="p-4">Czas</th>
                                        <th className="p-4">Status</th>
                                        <th className="p-4">Site ID</th>
                                        <th className="p-4">Origin</th>
                                        <th className="p-4">IP</th>
                                        <th className="p-4 text-right">Czas [ms]</th>
                                        <th className="p-4 text-right">Eventy</th>
                                        <th className="p-4">Błąd</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {filteredLogs.map(log => (
                                        <tr
                                            key={log.id}
                                            onClick={() => setSelectedLog(log)}
                                            className="hover:bg-slate-800/50 cursor-pointer transition-colors"
                                        >
                                            <td className="p-4 font-mono text-xs text-slate-400">
                                                {formatDate(log.timestamp)}
                                            </td>
                                            <td className="p-4">
                                                {getStatusBadge(log.status_code)}
                                            </td>
                                            <td className="p-4">
                                                <span className="font-medium text-blue-400">{log.site_id}</span>
                                            </td>
                                            <td className="p-4 max-w-[200px] truncate">
                                                <span className="text-xs text-slate-500 font-mono">
                                                    {log.origin || '-'}
                                                </span>
                                            </td>
                                            <td className="p-4 font-mono text-xs text-yellow-400">
                                                {log.ip}
                                            </td>
                                            <td className="p-4 text-right font-mono text-sm">
                                                <span className={log.duration_ms > 500 ? 'text-amber-400' : 'text-slate-300'}>
                                                    {log.duration_ms}
                                                </span>
                                            </td>
                                            <td className="p-4 text-right">
                                                <span className="text-purple-400 font-bold">{log.events_count}</span>
                                            </td>
                                            <td className="p-4 max-w-[200px] truncate">
                                                {log.error_message ? (
                                                    <span className="text-xs text-red-400">{log.error_message}</span>
                                                ) : (
                                                    <span className="text-slate-600">-</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Paginacja */}
                    {totalPages > 1 && (
                        <div className="p-4 border-t border-slate-800 flex items-center justify-between">
                            <div className="text-sm text-slate-400">
                                Strona {currentPage + 1} z {totalPages}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => goToPage(0)}
                                    disabled={currentPage === 0}
                                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm"
                                >
                                    ««
                                </button>
                                <button
                                    onClick={() => goToPage(currentPage - 1)}
                                    disabled={currentPage === 0}
                                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm"
                                >
                                    «
                                </button>
                                <button
                                    onClick={() => goToPage(currentPage + 1)}
                                    disabled={currentPage >= totalPages - 1}
                                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm"
                                >
                                    »
                                </button>
                                <button
                                    onClick={() => goToPage(totalPages - 1)}
                                    disabled={currentPage >= totalPages - 1}
                                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm"
                                >
                                    »»
                                </button>
                            </div>
                        </div>
                    )}
                </div>

            {/* Footer z informacjami */}
            <div className="mt-8 text-center text-slate-500 text-xs">
                <p>Logi są automatycznie odświeżane co 5 sekund gdy włączony jest tryb Auto</p>
                <p className="mt-1">Kliknij w wiersz aby zobaczyć pełne szczegóły żądania</p>
            </div>
        </DashboardContent>
    );
}

