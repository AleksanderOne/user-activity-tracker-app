'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { DashboardContent } from '@/components/dashboard';

// Typy dla debuggera
interface AnomalyEntry {
    id: string;
    type: 'high_latency' | 'error_spike' | 'unusual_traffic' | 'connection_lost' | 'suspicious_activity' | 'rate_limit';
    severity: 'low' | 'medium' | 'high' | 'critical';
    site_id: string;
    message: string;
    details: Record<string, unknown>;
    timestamp: string;
}

interface SiteHealth {
    site_id: string;
    origin: string | null;
    status: 'healthy' | 'warning' | 'error' | 'offline';
    last_activity: string;
    avg_latency_ms: number;
    error_rate: number;
    requests_last_hour: number;
    events_last_hour: number;
    anomalies: AnomalyEntry[];
    uptime_percent: number;
}

interface DebuggerData {
    system_health: 'healthy' | 'warning' | 'error' | 'critical';
    server: {
        process_memory_mb: number;
        heap_used_mb: number;
        heap_total_mb: number;
        external_mb: number;
        cpu_usage_percent: number;
        event_loop_lag_ms: number;
        active_handles: number;
        active_requests: number;
        uptime_seconds: number;
        node_version: string;
        platform: string;
        db_connection: 'connected' | 'error';
        db_size_mb: number;
        db_tables_count: number;
    };
    sites: SiteHealth[];
    anomalies: AnomalyEntry[];
    communication: {
        total_requests_24h: number;
        successful_requests_24h: number;
        failed_requests_24h: number;
        avg_response_time_ms: number;
        p95_response_time_ms: number;
        p99_response_time_ms: number;
        requests_per_minute: number;
        bytes_received_24h: number;
        bytes_sent_24h: number;
        unique_ips_24h: number;
        unique_user_agents_24h: number;
    };
    recent_errors: Array<{
        id: string;
        timestamp: string;
        site_id: string;
        endpoint: string;
        status_code: number;
        error_message: string | null;
        ip: string;
    }>;
    ping_history: Array<{
        timestamp: string;
        success: boolean;
        latency_ms: number;
    }>;
    timestamp: string;
}

interface TestResult {
    success: boolean;
    total_latency_ms: number;
    timestamp: string;
    tests: Record<string, {
        success: boolean;
        latency_ms: number;
        message: string;
        details?: Record<string, unknown>;
    }>;
}

interface PingResult {
    status: string;
    message: string;
    timestamp: string;
    responseTime: number;
    testedAt: Date;
}

// Mapy kolorów i statusów
const HEALTH_COLORS: Record<string, { bg: string; text: string; border: string; glow: string }> = {
    healthy: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/50', glow: 'shadow-emerald-500/20' },
    warning: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/50', glow: 'shadow-amber-500/20' },
    error: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/50', glow: 'shadow-red-500/20' },
    critical: { bg: 'bg-red-600/30', text: 'text-red-300', border: 'border-red-500', glow: 'shadow-red-500/30' },
    offline: { bg: 'bg-slate-500/20', text: 'text-slate-400', border: 'border-slate-500/50', glow: 'shadow-slate-500/20' },
};

const SEVERITY_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
    low: { bg: 'bg-blue-500/20', text: 'text-blue-400', icon: 'ℹ️' },
    medium: { bg: 'bg-amber-500/20', text: 'text-amber-400', icon: '⚠️' },
    high: { bg: 'bg-orange-500/20', text: 'text-orange-400', icon: '🔶' },
    critical: { bg: 'bg-red-500/20', text: 'text-red-400', icon: '🔴' },
};

const ANOMALY_ICONS: Record<string, string> = {
    high_latency: '🐢',
    error_spike: '📈',
    unusual_traffic: '🌊',
    connection_lost: '🔌',
    suspicious_activity: '🕵️',
    rate_limit: '🚫',
};

export default function DebuggerPage() {
    // Stan
    const [data, setData] = useState<DebuggerData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // Testy
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<TestResult | null>(null);
    
    // Ping
    const [isPinging, setIsPinging] = useState(false);
    const [pingResult, setPingResult] = useState<PingResult | null>(null);
    const [pingHistory, setPingHistory] = useState<Array<{ time: Date; latency: number; success: boolean }>>([]);
    
    // Auto-refresh
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const AUTO_REFRESH_INTERVAL = 10000; // 10 sekund

    // Sekcje rozwinięte
    const [expandedSections, setExpandedSections] = useState({
        connection: true,
        server: true,
        sites: true,
        anomalies: true,
        errors: false,
        communication: true,
    });

    // Pobieranie danych
    const fetchData = useCallback(async () => {
        try {
            const res = await fetch('/api/debugger');
            
            if (!res.ok) {
                if (res.status === 401) {
                    window.location.href = '/login';
                    return;
                }
                throw new Error(`Błąd pobierania danych (${res.status})`);
            }

            const result: DebuggerData = await res.json();
            setData(result);
            setLastUpdated(new Date());
            setError(null);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Nieznany błąd';
            console.error('Błąd pobierania danych debuggera:', err);
            setError(msg);
        } finally {
            setLoading(false);
        }
    }, []);

    // Początkowe ładowanie i auto-refresh
    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        if (!autoRefresh) return;
        const interval = setInterval(fetchData, AUTO_REFRESH_INTERVAL);
        return () => clearInterval(interval);
    }, [autoRefresh, fetchData]);

    // Test połączenia (szybki ping)
    const testConnection = async () => {
        setIsPinging(true);
        const startTime = Date.now();
        const testedAt = new Date();
        
        try {
            const res = await fetch('/api/logs/ping?site_id=debugger-test');
            const responseData = await res.json();
            const responseTime = Date.now() - startTime;
            
            const result: PingResult = {
                status: res.ok ? 'success' : 'error',
                message: responseData.message || 'OK',
                timestamp: responseData.timestamp,
                responseTime,
                testedAt
            };
            
            setPingResult(result);
            setPingHistory(prev => [...prev.slice(-19), { time: testedAt, latency: responseTime, success: res.ok }]);
            
            // Odśwież dane
            setTimeout(fetchData, 500);
        } catch (err) {
            const responseTime = Date.now() - startTime;
            setPingResult({
                status: 'error',
                message: err instanceof Error ? err.message : 'Błąd połączenia',
                timestamp: new Date().toISOString(),
                responseTime,
                testedAt
            });
            setPingHistory(prev => [...prev.slice(-19), { time: testedAt, latency: responseTime, success: false }]);
        } finally {
            setIsPinging(false);
        }
    };

    // Pełny test systemu
    const runFullTest = async (type: 'ping' | 'db' | 'full') => {
        setIsTesting(true);
        setTestResult(null);
        
        try {
            const res = await fetch('/api/debugger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type })
            });
            
            const result: TestResult = await res.json();
            setTestResult(result);
            
            // Odśwież dane
            setTimeout(fetchData, 500);
        } catch (err) {
            setTestResult({
                success: false,
                total_latency_ms: 0,
                timestamp: new Date().toISOString(),
                tests: {
                    error: {
                        success: false,
                        latency_ms: 0,
                        message: err instanceof Error ? err.message : 'Błąd testu'
                    }
                }
            });
        } finally {
            setIsTesting(false);
        }
    };

    // Formatowanie
    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString('pl-PL', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    const formatBytes = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    };

    const formatUptime = (seconds: number) => {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (days > 0) return `${days}d ${hours}h ${minutes}m`;
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m ${seconds % 60}s`;
    };

    // Toggle sekcji
    const toggleSection = (section: keyof typeof expandedSections) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    // Oblicz średnie opóźnienie z historii pingów
    const avgPingLatency = useMemo(() => {
        if (pingHistory.length === 0) return 0;
        const successfulPings = pingHistory.filter(p => p.success);
        if (successfulPings.length === 0) return 0;
        return Math.round(successfulPings.reduce((acc, p) => acc + p.latency, 0) / successfulPings.length);
    }, [pingHistory]);

    // Widok błędu
    if (error && !loading && !data) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-200">
                <div className="text-center max-w-md p-8">
                    <div className="text-6xl mb-4">⚠️</div>
                    <h2 className="text-xl font-bold mb-2">Błąd ładowania debuggera</h2>
                    <p className="text-slate-400 mb-4">{error}</p>
                    <button
                        onClick={fetchData}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                    >
                        Spróbuj ponownie
                    </button>
                </div>
            </div>
        );
    }

    // Widok ładowania
    if (loading && !data) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-200">
                <div className="text-center">
                    <div className="animate-spin text-4xl mb-4">⚙️</div>
                    <p>Ładowanie diagnostyki...</p>
                </div>
            </div>
        );
    }

    const healthColors = HEALTH_COLORS[data?.system_health || 'healthy'];

    return (
        <DashboardContent>
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">
                            🔧 Debugger
                        </h1>
                        <p className="text-slate-400">
                            Zaawansowana diagnostyka systemu i monitorowanych stron
                        </p>
                    </div>
                    
                    {/* Status ogólny */}
                    {data && (
                        <div className={`px-6 py-3 rounded-xl border-2 ${healthColors.bg} ${healthColors.border} shadow-lg ${healthColors.glow}`}>
                            <div className="flex items-center gap-3">
                                <div className={`w-4 h-4 rounded-full animate-pulse ${
                                    data.system_health === 'healthy' ? 'bg-emerald-400' :
                                    data.system_health === 'warning' ? 'bg-amber-400' :
                                    data.system_health === 'error' ? 'bg-red-400' : 'bg-red-500'
                                }`}></div>
                                <div>
                                    <div className={`font-bold text-lg ${healthColors.text}`}>
                                        {data.system_health === 'healthy' ? 'System sprawny' :
                                         data.system_health === 'warning' ? 'Ostrzeżenia' :
                                         data.system_health === 'error' ? 'Problemy' : 'Krytyczne!'}
                                    </div>
                                    <div className="text-xs text-slate-500">
                                        Ostatnia aktualizacja: {lastUpdated?.toLocaleTimeString('pl-PL')}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Sekcja 1: Tester połączenia */}
            <div className="mb-8">
                <button
                    onClick={() => toggleSection('connection')}
                    className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-cyan-900/30 to-blue-900/30 border border-cyan-700/50 rounded-t-xl hover:from-cyan-900/40 hover:to-blue-900/40 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">🔌</span>
                        <h2 className="text-xl font-bold text-white">Tester połączenia</h2>
                    </div>
                    <span className="text-slate-400">{expandedSections.connection ? '▼' : '▶'}</span>
                </button>
                
                {expandedSections.connection && (
                    <div className="bg-slate-900/50 border border-t-0 border-slate-700 rounded-b-xl p-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Szybki ping */}
                            <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
                                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                    <span>⚡</span> Szybki Ping
                                </h3>
                                
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 mb-4">
                                    <button
                                        onClick={testConnection}
                                        disabled={isPinging}
                                        className={`px-6 py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                                            isPinging 
                                                ? 'bg-slate-700 text-slate-400 cursor-not-allowed' 
                                                : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-blue-500/25'
                                        }`}
                                    >
                                        {isPinging ? (
                                            <>
                                                <span className="animate-spin">⏳</span>
                                                Pingowanie...
                                            </>
                                        ) : (
                                            <>
                                                <span>📡</span>
                                                Ping Backend
                                            </>
                                        )}
                                    </button>
                                    
                                    {pingResult && (
                                        <div className={`flex-1 px-4 py-3 rounded-xl border ${
                                            pingResult.status === 'success'
                                                ? 'bg-emerald-500/10 border-emerald-500/50'
                                                : 'bg-red-500/10 border-red-500/50'
                                        }`}>
                                            <div className="flex items-center justify-between">
                                                <span className={`font-bold ${pingResult.status === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    {pingResult.status === 'success' ? '✅ OK' : '❌ Błąd'}
                                                </span>
                                                <span className={`font-mono font-bold ${
                                                    pingResult.responseTime < 100 ? 'text-emerald-400' : 
                                                    pingResult.responseTime < 500 ? 'text-amber-400' : 'text-red-400'
                                                }`}>
                                                    {pingResult.responseTime}ms
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                
                                {/* Historia pingów - wykres */}
                                {pingHistory.length > 0 && (
                                    <div className="mt-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm text-slate-400">Historia pingów</span>
                                            <span className="text-sm text-slate-500">Śr: {avgPingLatency}ms</span>
                                        </div>
                                        <div className="flex items-end gap-1 h-16 bg-slate-900/50 rounded-lg p-2">
                                            {pingHistory.map((ping, i) => {
                                                const maxLatency = Math.max(...pingHistory.map(p => p.latency), 100);
                                                const height = Math.max(10, (ping.latency / maxLatency) * 100);
                                                return (
                                                    <div
                                                        key={i}
                                                        className={`flex-1 rounded-t transition-all ${
                                                            ping.success 
                                                                ? ping.latency < 100 ? 'bg-emerald-500' 
                                                                : ping.latency < 300 ? 'bg-amber-500' : 'bg-orange-500'
                                                                : 'bg-red-500'
                                                        }`}
                                                        style={{ height: `${height}%` }}
                                                        title={`${ping.latency}ms @ ${ping.time.toLocaleTimeString('pl-PL')}`}
                                                    />
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            {/* Pełne testy */}
                            <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
                                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                    <span>🧪</span> Pełna diagnostyka
                                </h3>
                                
                                <div className="flex flex-wrap gap-3 mb-4">
                                    <button
                                        onClick={() => runFullTest('db')}
                                        disabled={isTesting}
                                        className={`px-4 py-2 rounded-lg font-medium transition-all ${
                                            isTesting ? 'bg-slate-700 text-slate-400' : 'bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 border border-purple-500/50'
                                        }`}
                                    >
                                        🗄️ Test bazy danych
                                    </button>
                                    <button
                                        onClick={() => runFullTest('full')}
                                        disabled={isTesting}
                                        className={`px-4 py-2 rounded-lg font-medium transition-all ${
                                            isTesting ? 'bg-slate-700 text-slate-400' : 'bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/50'
                                        }`}
                                    >
                                        🔬 Pełny test systemu
                                    </button>
                                </div>
                                
                                {isTesting && (
                                    <div className="flex items-center gap-3 p-4 bg-blue-500/10 rounded-xl border border-blue-500/30">
                                        <span className="animate-spin text-xl">⚙️</span>
                                        <span className="text-blue-300">Wykonywanie testów...</span>
                                    </div>
                                )}
                                
                                {testResult && (
                                    <div className={`p-4 rounded-xl border ${
                                        testResult.success ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'
                                    }`}>
                                        <div className="flex items-center justify-between mb-3">
                                            <span className={`font-bold ${testResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {testResult.success ? '✅ Wszystkie testy OK' : '❌ Niektóre testy nie powiodły się'}
                                            </span>
                                            <span className="text-slate-400 text-sm">
                                                Czas: {testResult.total_latency_ms}ms
                                            </span>
                                        </div>
                                        <div className="space-y-2">
                                            {Object.entries(testResult.tests).map(([name, test]) => (
                                                <div key={name} className="flex items-center justify-between p-2 bg-slate-900/50 rounded">
                                                    <div className="flex items-center gap-2">
                                                        <span>{test.success ? '✅' : '❌'}</span>
                                                        <span className="text-slate-300 capitalize">{name.replace(/_/g, ' ')}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-xs text-slate-500">{test.message}</span>
                                                        <span className="font-mono text-slate-400">{test.latency_ms}ms</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Sekcja 2: Diagnostyka serwera */}
            {data && (
                <div className="mb-8">
                    <button
                        onClick={() => toggleSection('server')}
                        className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-orange-900/30 to-red-900/30 border border-orange-700/50 rounded-t-xl hover:from-orange-900/40 hover:to-red-900/40 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">🖥️</span>
                            <h2 className="text-xl font-bold text-white">Diagnostyka serwera</h2>
                        </div>
                        <span className="text-slate-400">{expandedSections.server ? '▼' : '▶'}</span>
                    </button>
                    
                    {expandedSections.server && (
                        <div className="bg-slate-900/50 border border-t-0 border-slate-700 rounded-b-xl p-6">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                {/* Pamięć procesu */}
                                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Pamięć procesu</div>
                                    <div className="text-2xl font-bold text-cyan-400">{data.server.process_memory_mb} MB</div>
                                    <div className="text-xs text-slate-500 mt-1">
                                        Heap: {data.server.heap_used_mb}/{data.server.heap_total_mb} MB
                                    </div>
                                </div>
                                
                                {/* CPU */}
                                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">CPU</div>
                                    <div className={`text-2xl font-bold ${
                                        data.server.cpu_usage_percent < 50 ? 'text-emerald-400' : 
                                        data.server.cpu_usage_percent < 80 ? 'text-amber-400' : 'text-red-400'
                                    }`}>
                                        {data.server.cpu_usage_percent}%
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1">{data.server.platform}</div>
                                </div>
                                
                                {/* Uptime */}
                                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Uptime</div>
                                    <div className="text-2xl font-bold text-purple-400">
                                        {formatUptime(data.server.uptime_seconds)}
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1">{data.server.node_version}</div>
                                </div>
                                
                                {/* Baza danych */}
                                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Baza danych</div>
                                    <div className="flex items-center gap-2">
                                        <span className={`w-2 h-2 rounded-full ${
                                            data.server.db_connection === 'connected' ? 'bg-emerald-400' : 'bg-red-400'
                                        }`}></span>
                                        <span className={`text-xl font-bold ${
                                            data.server.db_connection === 'connected' ? 'text-emerald-400' : 'text-red-400'
                                        }`}>
                                            {data.server.db_size_mb} MB
                                        </span>
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1">{data.server.db_tables_count} tabel</div>
                                </div>
                            </div>
                            
                            {/* Pasek pamięci */}
                            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                                <div className="flex justify-between text-sm mb-2">
                                    <span className="text-slate-400">Użycie pamięci Heap</span>
                                    <span className="text-slate-300">
                                        {Math.round((data.server.heap_used_mb / data.server.heap_total_mb) * 100)}%
                                    </span>
                                </div>
                                <div className="h-3 bg-slate-900 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500"
                                        style={{ width: `${Math.min(100, (data.server.heap_used_mb / data.server.heap_total_mb) * 100)}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Sekcja 3: Status stron inwigilowanych */}
            {data && (
                <div className="mb-8">
                    <button
                        onClick={() => toggleSection('sites')}
                        className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-emerald-900/30 to-teal-900/30 border border-emerald-700/50 rounded-t-xl hover:from-emerald-900/40 hover:to-teal-900/40 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">📡</span>
                            <h2 className="text-xl font-bold text-white">Status stron inwigilowanych</h2>
                            <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-sm rounded-full">
                                {data.sites.length} stron
                            </span>
                        </div>
                        <span className="text-slate-400">{expandedSections.sites ? '▼' : '▶'}</span>
                    </button>
                    
                    {expandedSections.sites && (
                        <div className="bg-slate-900/50 border border-t-0 border-slate-700 rounded-b-xl p-6">
                            {data.sites.length === 0 ? (
                                <div className="text-center py-8">
                                    <div className="text-4xl mb-4">📭</div>
                                    <p className="text-slate-400">Brak monitorowanych stron</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {data.sites.map(site => {
                                        const statusColors = HEALTH_COLORS[site.status];
                                        return (
                                            <div
                                                key={site.site_id}
                                                className={`bg-slate-800/50 rounded-xl p-5 border transition-all hover:scale-[1.02] ${statusColors.border}`}
                                            >
                                                {/* Header */}
                                                <div className="flex items-start justify-between mb-4">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className={`w-3 h-3 rounded-full ${
                                                                site.status === 'healthy' ? 'bg-emerald-400 animate-pulse' :
                                                                site.status === 'warning' ? 'bg-amber-400' :
                                                                site.status === 'error' ? 'bg-red-400' : 'bg-slate-500'
                                                            }`}></span>
                                                            <span className={`text-xs font-medium uppercase ${statusColors.text}`}>
                                                                {site.status === 'healthy' ? 'ONLINE' :
                                                                 site.status === 'warning' ? 'OSTRZEŻENIE' :
                                                                 site.status === 'error' ? 'BŁĘDY' : 'OFFLINE'}
                                                            </span>
                                                        </div>
                                                        <h3 className="font-bold text-lg text-white truncate">{site.site_id}</h3>
                                                        {site.origin && (
                                                            <p className="text-xs text-slate-500 font-mono truncate">{site.origin}</p>
                                                        )}
                                                    </div>
                                                    <div className="text-right">
                                                        <div className={`text-2xl font-bold ${
                                                            site.uptime_percent >= 99 ? 'text-emerald-400' :
                                                            site.uptime_percent >= 95 ? 'text-amber-400' : 'text-red-400'
                                                        }`}>
                                                            {site.uptime_percent}%
                                                        </div>
                                                        <div className="text-xs text-slate-500">uptime</div>
                                                    </div>
                                                </div>
                                                
                                                {/* Statystyki */}
                                                <div className="grid grid-cols-2 gap-3 mb-4">
                                                    <div className="bg-slate-900/50 p-2 rounded text-center">
                                                        <div className={`text-lg font-bold ${
                                                            site.avg_latency_ms < 200 ? 'text-emerald-400' :
                                                            site.avg_latency_ms < 500 ? 'text-amber-400' : 'text-red-400'
                                                        }`}>
                                                            {site.avg_latency_ms}ms
                                                        </div>
                                                        <div className="text-[10px] text-slate-500">Śr. latency</div>
                                                    </div>
                                                    <div className="bg-slate-900/50 p-2 rounded text-center">
                                                        <div className={`text-lg font-bold ${
                                                            site.error_rate < 1 ? 'text-emerald-400' :
                                                            site.error_rate < 5 ? 'text-amber-400' : 'text-red-400'
                                                        }`}>
                                                            {site.error_rate.toFixed(1)}%
                                                        </div>
                                                        <div className="text-[10px] text-slate-500">Błędy</div>
                                                    </div>
                                                    <div className="bg-slate-900/50 p-2 rounded text-center">
                                                        <div className="text-lg font-bold text-blue-400">{site.requests_last_hour}</div>
                                                        <div className="text-[10px] text-slate-500">Req/h</div>
                                                    </div>
                                                    <div className="bg-slate-900/50 p-2 rounded text-center">
                                                        <div className="text-lg font-bold text-purple-400">{site.events_last_hour}</div>
                                                        <div className="text-[10px] text-slate-500">Events/h</div>
                                                    </div>
                                                </div>
                                                
                                                {/* Anomalie */}
                                                {site.anomalies.length > 0 && (
                                                    <div className="space-y-2">
                                                        {site.anomalies.slice(0, 2).map(anomaly => {
                                                            const sevColors = SEVERITY_COLORS[anomaly.severity];
                                                            return (
                                                                <div 
                                                                    key={anomaly.id}
                                                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${sevColors.bg}`}
                                                                >
                                                                    <span>{ANOMALY_ICONS[anomaly.type] || '⚠️'}</span>
                                                                    <span className={sevColors.text}>{anomaly.message}</span>
                                                                </div>
                                                            );
                                                        })}
                                                        {site.anomalies.length > 2 && (
                                                            <div className="text-xs text-slate-500 text-center">
                                                                +{site.anomalies.length - 2} więcej
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                
                                                {/* Ostatnia aktywność */}
                                                <div className="mt-3 pt-3 border-t border-slate-700 text-xs text-slate-500">
                                                    Ostatnio: {formatDate(site.last_activity)}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Sekcja 4: Alerty i anomalie */}
            {data && data.anomalies.length > 0 && (
                <div className="mb-8">
                    <button
                        onClick={() => toggleSection('anomalies')}
                        className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-red-900/30 to-orange-900/30 border border-red-700/50 rounded-t-xl hover:from-red-900/40 hover:to-orange-900/40 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">⚠️</span>
                            <h2 className="text-xl font-bold text-white">Alerty i anomalie</h2>
                            <span className="px-2 py-1 bg-red-500/20 text-red-400 text-sm rounded-full animate-pulse">
                                {data.anomalies.length}
                            </span>
                        </div>
                        <span className="text-slate-400">{expandedSections.anomalies ? '▼' : '▶'}</span>
                    </button>
                    
                    {expandedSections.anomalies && (
                        <div className="bg-slate-900/50 border border-t-0 border-slate-700 rounded-b-xl p-6">
                            <div className="space-y-3">
                                {data.anomalies.map(anomaly => {
                                    const sevColors = SEVERITY_COLORS[anomaly.severity];
                                    return (
                                        <div 
                                            key={anomaly.id}
                                            className={`flex items-start gap-4 p-4 rounded-xl border ${sevColors.bg} border-slate-700`}
                                        >
                                            <span className="text-2xl">{ANOMALY_ICONS[anomaly.type] || '⚠️'}</span>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-1">
                                                    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${sevColors.text} ${sevColors.bg}`}>
                                                        {anomaly.severity}
                                                    </span>
                                                    <span className="text-slate-400 text-sm">{anomaly.site_id}</span>
                                                    <span className="text-slate-500 text-xs">{formatDate(anomaly.timestamp)}</span>
                                                </div>
                                                <p className={`font-medium ${sevColors.text}`}>{anomaly.message}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Sekcja 5: Statystyki komunikacji */}
            {data && (
                <div className="mb-8">
                    <button
                        onClick={() => toggleSection('communication')}
                        className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-purple-900/30 to-pink-900/30 border border-purple-700/50 rounded-t-xl hover:from-purple-900/40 hover:to-pink-900/40 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">📊</span>
                            <h2 className="text-xl font-bold text-white">Statystyki komunikacji (24h)</h2>
                        </div>
                        <span className="text-slate-400">{expandedSections.communication ? '▼' : '▶'}</span>
                    </button>
                    
                    {expandedSections.communication && (
                        <div className="bg-slate-900/50 border border-t-0 border-slate-700 rounded-b-xl p-6">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 text-center">
                                    <div className="text-3xl font-bold text-blue-400">{data.communication.total_requests_24h}</div>
                                    <div className="text-xs text-slate-500 uppercase tracking-wider mt-1">Wszystkie requesty</div>
                                </div>
                                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 text-center">
                                    <div className="text-3xl font-bold text-emerald-400">{data.communication.successful_requests_24h}</div>
                                    <div className="text-xs text-slate-500 uppercase tracking-wider mt-1">Sukces</div>
                                </div>
                                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 text-center">
                                    <div className={`text-3xl font-bold ${data.communication.failed_requests_24h > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                                        {data.communication.failed_requests_24h}
                                    </div>
                                    <div className="text-xs text-slate-500 uppercase tracking-wider mt-1">Błędy</div>
                                </div>
                                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 text-center">
                                    <div className="text-3xl font-bold text-purple-400">{data.communication.requests_per_minute}</div>
                                    <div className="text-xs text-slate-500 uppercase tracking-wider mt-1">Req/min</div>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Czasy odpowiedzi</div>
                                    <div className="space-y-2">
                                        <div className="flex justify-between">
                                            <span className="text-slate-400">Średni:</span>
                                            <span className="font-mono text-cyan-400">{data.communication.avg_response_time_ms}ms</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-400">P95:</span>
                                            <span className="font-mono text-amber-400">{data.communication.p95_response_time_ms}ms</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-400">P99:</span>
                                            <span className="font-mono text-orange-400">{data.communication.p99_response_time_ms}ms</span>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Transfer danych</div>
                                    <div className="space-y-2">
                                        <div className="flex justify-between">
                                            <span className="text-slate-400">Odebrano:</span>
                                            <span className="font-mono text-green-400">{formatBytes(data.communication.bytes_received_24h)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-400">Wysłano:</span>
                                            <span className="font-mono text-blue-400">{formatBytes(data.communication.bytes_sent_24h)}</span>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Unikalne źródła</div>
                                    <div className="space-y-2">
                                        <div className="flex justify-between">
                                            <span className="text-slate-400">Adresy IP:</span>
                                            <span className="font-mono text-yellow-400">{data.communication.unique_ips_24h}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-400">User Agents:</span>
                                            <span className="font-mono text-pink-400">{data.communication.unique_user_agents_24h}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Sekcja 6: Ostatnie błędy */}
            {data && data.recent_errors.length > 0 && (
                <div className="mb-8">
                    <button
                        onClick={() => toggleSection('errors')}
                        className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-slate-800 to-slate-900 border border-slate-700 rounded-t-xl hover:from-slate-700 hover:to-slate-800 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">❌</span>
                            <h2 className="text-xl font-bold text-white">Ostatnie błędy</h2>
                            <span className="px-2 py-1 bg-slate-700 text-slate-400 text-sm rounded-full">
                                {data.recent_errors.length}
                            </span>
                        </div>
                        <span className="text-slate-400">{expandedSections.errors ? '▼' : '▶'}</span>
                    </button>
                    
                    {expandedSections.errors && (
                        <div className="bg-slate-900/50 border border-t-0 border-slate-700 rounded-b-xl overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                                        <th className="p-3 text-left">Czas</th>
                                        <th className="p-3 text-left">Status</th>
                                        <th className="p-3 text-left">Site ID</th>
                                        <th className="p-3 text-left">Endpoint</th>
                                        <th className="p-3 text-left">IP</th>
                                        <th className="p-3 text-left">Błąd</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {data.recent_errors.map(err => (
                                        <tr key={err.id} className="hover:bg-slate-800/50">
                                            <td className="p-3 font-mono text-xs text-slate-400">{formatDate(err.timestamp)}</td>
                                            <td className="p-3">
                                                <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-red-500/20 text-red-400">
                                                    {err.status_code}
                                                </span>
                                            </td>
                                            <td className="p-3 text-blue-400">{err.site_id}</td>
                                            <td className="p-3 font-mono text-xs text-slate-300">{err.endpoint}</td>
                                            <td className="p-3 font-mono text-xs text-yellow-400">{err.ip}</td>
                                            <td className="p-3 text-red-400 text-xs max-w-[200px] truncate">
                                                {err.error_message || '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Footer */}
            <div className="mt-8 flex items-center justify-between text-slate-500 text-xs">
                <p>Dane odświeżane automatycznie co 10 sekund</p>
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={`px-3 py-1 rounded-lg text-xs ${
                            autoRefresh ? 'bg-emerald-600/20 text-emerald-400' : 'bg-slate-700 text-slate-400'
                        }`}
                    >
                        {autoRefresh ? '⏸ Auto włączone' : '▶ Auto wyłączone'}
                    </button>
                    <button
                        onClick={fetchData}
                        className="px-3 py-1 bg-blue-600/20 text-blue-400 rounded-lg text-xs hover:bg-blue-600/30"
                    >
                        ⟳ Odśwież teraz
                    </button>
                </div>
            </div>
        </DashboardContent>
    );
}

