'use client';

import { useState, useEffect, useCallback } from 'react';
import { ServerStats } from '@/lib/types';
import { DashboardContent } from '@/components/dashboard';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

// Komponent animowanego uptime
function AnimatedUptime({ startTime }: { startTime: string | null }) {
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
    return <span className="text-slate-500">Brak danych</span>;
  }

  return (
    <div className="flex items-center gap-2">
      {elapsed.days > 0 && (
        <div className="flex flex-col items-center bg-slate-800/50 px-3 py-2 rounded-lg border border-slate-700">
          <span
            className="text-3xl font-bold text-white font-mono"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {elapsed.days}
          </span>
          <span className="text-[10px] text-slate-500 uppercase">dni</span>
        </div>
      )}
      <div className="flex flex-col items-center bg-slate-800/50 px-3 py-2 rounded-lg border border-slate-700">
        <span
          className="text-3xl font-bold text-white font-mono"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {String(elapsed.hours).padStart(2, '0')}
        </span>
        <span className="text-[10px] text-slate-500 uppercase">godz</span>
      </div>
      <span className="text-2xl text-slate-600 font-bold">:</span>
      <div className="flex flex-col items-center bg-slate-800/50 px-3 py-2 rounded-lg border border-slate-700">
        <span
          className="text-3xl font-bold text-white font-mono"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {String(elapsed.minutes).padStart(2, '0')}
        </span>
        <span className="text-[10px] text-slate-500 uppercase">min</span>
      </div>
      <span className="text-2xl text-slate-600 font-bold">:</span>
      <div className="flex flex-col items-center bg-emerald-500/10 px-3 py-2 rounded-lg border border-emerald-500/30">
        <span
          className="text-3xl font-bold text-emerald-400 font-mono animate-pulse"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {String(elapsed.seconds).padStart(2, '0')}
        </span>
        <span className="text-[10px] text-emerald-500/70 uppercase">sek</span>
      </div>
    </div>
  );
}

// Komponent paska pamięci/CPU
function UsageBar({
  used,
  total,
  label,
  color,
}: {
  used: number;
  total: number;
  label: string;
  color: string;
}) {
  const percentage = Math.round((used / total) * 100);

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-slate-400">{label}</span>
        <span className="text-white font-mono">
          {used.toFixed(1)} / {total.toFixed(1)} GB
        </span>
      </div>
      <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="text-right text-xs text-slate-500">{percentage}% użyte</div>
    </div>
  );
}

export default function ServerPage() {
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh] = useState(true);

  // Symulowane dane historyczne dla wykresów (w prawdziwej implementacji pobierane z API)
  const [loadHistory, setLoadHistory] = useState<
    Array<{ time: string; requests: number; memory: number; cpu: number }>
  >([]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/stats/server');

      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = '/login';
          return;
        }
        throw new Error(`Błąd pobierania danych (${res.status})`);
      }

      const data: ServerStats = await res.json();
      setStats(data);
      setError(null);

      // Dodaj punkt do historii (symulacja)
      const now = new Date();
      const timeStr = now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
      setLoadHistory((prev) => {
        const newPoint = {
          time: timeStr,
          requests: data.logs_stats.total_requests,
          memory:
            Math.round((data.system_info.memory_total_gb - data.system_info.memory_free_gb) * 10) /
            10,
          cpu: Math.random() * 30 + 10, // Symulacja CPU
        };
        const updated = [...prev, newPoint].slice(-30); // Ostatnie 30 punktów
        return updated;
      });
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

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchStats, 10000); // Co 10 sekund
    return () => clearInterval(interval);
  }, [autoRefresh, fetchStats]);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
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
  if (loading && !stats) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-200">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <p>Ładowanie statystyk serwera...</p>
        </div>
      </div>
    );
  }

  return (
    <DashboardContent>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">🖥️ Status Serwera</h1>
        <p className="text-slate-400">Szczegółowe informacje o serwerze Activity Tracker</p>
      </div>

      {stats && (
        <>
          {/* Status główny - Uptime */}
          <div className="mb-8 bg-gradient-to-br from-emerald-900/30 to-slate-900/50 border border-emerald-500/30 rounded-2xl p-8">
            <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
              <div className="text-center lg:text-left">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-4 h-4 bg-emerald-500 rounded-full animate-pulse shadow-lg shadow-emerald-500/50"></div>
                  <span className="text-emerald-400 font-bold text-lg uppercase tracking-wider">
                    Serwer Online
                  </span>
                </div>
                <h2 className="text-xl text-slate-300 mb-2">Czas działania (Uptime)</h2>
                <p className="text-slate-500 text-sm">
                  Od:{' '}
                  {stats.server_started_at ? formatDate(stats.server_started_at) : 'Brak danych'}
                </p>
              </div>

              <AnimatedUptime startTime={stats.server_started_at} />
            </div>
          </div>

          {/* Statystyki główne */}
          <div className="mb-8 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-blue-400">
                {stats.total_events.toLocaleString('pl-PL')}
              </div>
              <div className="text-xs text-slate-500 mt-1">Wszystkie eventy</div>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-emerald-400">
                {stats.total_sessions.toLocaleString('pl-PL')}
              </div>
              <div className="text-xs text-slate-500 mt-1">Sesje</div>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-purple-400">
                {stats.total_visitors.toLocaleString('pl-PL')}
              </div>
              <div className="text-xs text-slate-500 mt-1">Użytkownicy</div>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-amber-400">
                {stats.total_form_submissions}
              </div>
              <div className="text-xs text-slate-500 mt-1">Formularze</div>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-cyan-400">{stats.total_uploaded_files}</div>
              <div className="text-xs text-slate-500 mt-1">Pliki</div>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-orange-400">{stats.db_size_mb || 0} MB</div>
              <div className="text-xs text-slate-500 mt-1">Rozmiar DB</div>
            </div>
          </div>

          {/* Wykresy obciążenia */}
          <div className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Wykres requestów */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-3">
                📈 Historia requestów
                <span className="flex items-center gap-1.5 text-xs font-normal bg-blue-500/20 text-blue-400 px-2 py-1 rounded-full">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                  </span>
                  LIVE
                </span>
              </h3>
              <div className="h-[200px]">
                {loadHistory.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={loadHistory}>
                      <defs>
                        <linearGradient id="requestsGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="time" stroke="#64748b" fontSize={10} />
                      <YAxis stroke="#64748b" fontSize={10} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '8px',
                        }}
                        labelStyle={{ color: '#94a3b8' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="requests"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        fill="url(#requestsGradient)"
                        isAnimationActive={true}
                        animationDuration={500}
                        animationEasing="ease-out"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-500">
                    <div className="text-center">
                      <div className="animate-spin text-2xl mb-2">⏳</div>
                      Zbieranie danych...
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Wykres pamięci */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-3">
                💾 Użycie pamięci
                <span className="flex items-center gap-1.5 text-xs font-normal bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  LIVE
                </span>
              </h3>
              <div className="h-[200px]">
                {loadHistory.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={loadHistory}>
                      <defs>
                        <linearGradient id="memoryGradient" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={0.8} />
                          <stop offset="100%" stopColor="#34d399" stopOpacity={1} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="time" stroke="#64748b" fontSize={10} />
                      <YAxis
                        stroke="#64748b"
                        fontSize={10}
                        domain={[0, stats.system_info.memory_total_gb]}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '8px',
                        }}
                        labelStyle={{ color: '#94a3b8' }}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(value: any) => [`${Number(value).toFixed(2)} GB`, 'Pamięć']}
                      />
                      <Line
                        type="monotone"
                        dataKey="memory"
                        stroke="url(#memoryGradient)"
                        strokeWidth={3}
                        dot={false}
                        isAnimationActive={true}
                        animationDuration={500}
                        animationEasing="ease-out"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-500">
                    <div className="text-center">
                      <div className="animate-spin text-2xl mb-2">⏳</div>
                      Zbieranie danych...
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Szczegóły systemu i komunikacji */}
          <div className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* System */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
              <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                ⚙️ System
              </h3>

              <div className="space-y-6">
                {/* Podstawowe info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-800/30 p-3 rounded-lg">
                    <span className="text-slate-500 text-xs uppercase tracking-wider">Node.js</span>
                    <div className="text-white font-mono text-lg">
                      {stats.system_info.node_version}
                    </div>
                  </div>
                  <div className="bg-slate-800/30 p-3 rounded-lg">
                    <span className="text-slate-500 text-xs uppercase tracking-wider">
                      Środowisko
                    </span>
                    <div
                      className={`font-mono text-lg ${stats.system_info.node_env === 'production' ? 'text-emerald-400' : 'text-amber-400'}`}
                    >
                      {stats.system_info.node_env}
                    </div>
                  </div>
                  <div className="bg-slate-800/30 p-3 rounded-lg">
                    <span className="text-slate-500 text-xs uppercase tracking-wider">
                      Platforma
                    </span>
                    <div className="text-white font-mono text-lg">
                      {stats.system_info.platform} ({stats.system_info.cpu_arch})
                    </div>
                  </div>
                  <div className="bg-slate-800/30 p-3 rounded-lg">
                    <span className="text-slate-500 text-xs uppercase tracking-wider">Host</span>
                    <div className="text-white font-mono text-sm truncate">
                      {stats.system_info.hostname}
                    </div>
                  </div>
                </div>

                {/* CPU */}
                <div className="bg-slate-800/30 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-slate-500 text-xs uppercase tracking-wider">
                      Procesor
                    </span>
                    <span className="text-blue-400 font-mono text-sm">
                      {stats.system_info.cpus} rdzeni
                    </span>
                  </div>
                  <div className="text-white font-mono text-sm truncate">
                    {stats.system_info.cpu_model}
                  </div>
                  <div className="mt-2 flex items-center gap-4 text-xs">
                    <span className="text-slate-400">Load avg:</span>
                    <span className="text-cyan-400 font-mono">
                      {stats.system_info.load_avg?.join(' / ') || 'N/A'}
                    </span>
                  </div>
                </div>

                {/* RAM */}
                <UsageBar
                  used={stats.system_info.memory_total_gb - stats.system_info.memory_free_gb}
                  total={stats.system_info.memory_total_gb}
                  label="Pamięć RAM"
                  color="bg-gradient-to-r from-emerald-500 to-cyan-500"
                />

                {/* Proces i uptime */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-800/30 p-3 rounded-lg">
                    <span className="text-slate-500 text-xs uppercase tracking-wider">
                      PID procesu
                    </span>
                    <div className="text-purple-400 font-mono text-lg">
                      {stats.system_info.process_pid}
                    </div>
                  </div>
                  <div className="bg-slate-800/30 p-3 rounded-lg">
                    <span className="text-slate-500 text-xs uppercase tracking-wider">
                      Interfejsy sieciowe
                    </span>
                    <div className="text-cyan-400 font-mono text-lg">
                      {stats.system_info.network_interfaces}
                    </div>
                  </div>
                  <div className="bg-slate-800/30 p-3 rounded-lg">
                    <span className="text-slate-500 text-xs uppercase tracking-wider">
                      Uptime systemu
                    </span>
                    <div className="text-amber-400 font-mono text-lg">
                      {stats.system_info.os_uptime_hours?.toFixed(1)}h
                    </div>
                  </div>
                  <div className="bg-slate-800/30 p-3 rounded-lg">
                    <span className="text-slate-500 text-xs uppercase tracking-wider">
                      Uptime procesu
                    </span>
                    <div className="text-emerald-400 font-mono text-lg">
                      {stats.system_info.process_uptime_hours?.toFixed(2)}h
                    </div>
                  </div>
                </div>

                {/* Baza danych */}
                <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 p-4 rounded-lg border border-blue-800/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-slate-400 text-xs uppercase tracking-wider">
                        Rozmiar bazy danych
                      </span>
                      <div className="text-white font-mono text-2xl font-bold">
                        {stats.db_size_mb?.toFixed(2) || '?'} MB
                      </div>
                    </div>
                    <span className="text-4xl">🗄️</span>
                  </div>
                </div>

                {/* Katalog roboczy */}
                <div className="bg-slate-800/30 p-3 rounded-lg">
                  <span className="text-slate-500 text-xs uppercase tracking-wider">
                    Katalog roboczy
                  </span>
                  <div className="text-slate-300 font-mono text-xs truncate mt-1">
                    {stats.system_info.cwd}
                  </div>
                </div>
              </div>
            </div>

            {/* Statystyki komunikacji */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
              <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                🔌 Komunikacja
                <span className="ml-auto text-xs font-normal px-2 py-1 bg-blue-500/20 text-blue-400 rounded">
                  {stats.logs_stats.requests_per_minute}/min
                </span>
              </h3>

              {/* Główne statystyki */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-800/50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-white">
                    {stats.logs_stats.total_requests.toLocaleString('pl-PL')}
                  </div>
                  <div className="text-xs text-slate-500">Wszystkie requesty</div>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-emerald-400">
                    {stats.logs_stats.successful_requests.toLocaleString('pl-PL')}
                  </div>
                  <div className="text-xs text-emerald-400/70">Sukces</div>
                </div>
                <div
                  className={`p-4 rounded-lg ${stats.logs_stats.failed_requests > 0 ? 'bg-red-500/10 border border-red-500/30' : 'bg-slate-800/50'}`}
                >
                  <div
                    className={`text-2xl font-bold ${stats.logs_stats.failed_requests > 0 ? 'text-red-400' : 'text-slate-500'}`}
                  >
                    {stats.logs_stats.failed_requests.toLocaleString('pl-PL')}
                  </div>
                  <div className="text-xs text-slate-500">Błędy</div>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-amber-400">
                    {stats.logs_stats.avg_response_time_ms}ms
                  </div>
                  <div className="text-xs text-amber-400/70">Śr. czas odpowiedzi</div>
                </div>
              </div>

              {/* Success Rate Bar */}
              <div className="mb-6">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">Success Rate</span>
                  <span
                    className={`font-bold ${
                      stats.logs_stats.success_rate >= 95
                        ? 'text-emerald-400'
                        : stats.logs_stats.success_rate >= 80
                          ? 'text-amber-400'
                          : 'text-red-400'
                    }`}
                  >
                    {stats.logs_stats.success_rate}%
                  </span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      stats.logs_stats.success_rate >= 95
                        ? 'bg-emerald-500'
                        : stats.logs_stats.success_rate >= 80
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                    }`}
                    style={{ width: `${stats.logs_stats.success_rate}%` }}
                  />
                </div>
              </div>

              {/* Response Time Stats */}
              <div className="grid grid-cols-3 gap-2 mb-6 text-center">
                <div className="bg-slate-800/30 p-2 rounded">
                  <div className="text-lg font-bold text-emerald-400">
                    {stats.logs_stats.min_response_time_ms}ms
                  </div>
                  <div className="text-[10px] text-slate-500">Min</div>
                </div>
                <div className="bg-slate-800/30 p-2 rounded">
                  <div className="text-lg font-bold text-amber-400">
                    {stats.logs_stats.avg_response_time_ms}ms
                  </div>
                  <div className="text-[10px] text-slate-500">Średnia</div>
                </div>
                <div className="bg-slate-800/30 p-2 rounded">
                  <div className="text-lg font-bold text-red-400">
                    {stats.logs_stats.max_response_time_ms}ms
                  </div>
                  <div className="text-[10px] text-slate-500">Max</div>
                </div>
              </div>

              {/* Status Codes */}
              {stats.logs_stats.status_codes && stats.logs_stats.status_codes.length > 0 && (
                <div className="mb-6">
                  <div className="text-xs text-slate-400 mb-2">Status Codes</div>
                  <div className="flex flex-wrap gap-2">
                    {stats.logs_stats.status_codes.map((sc) => (
                      <span
                        key={sc.code}
                        className={`px-2 py-1 rounded text-xs font-mono ${
                          sc.code >= 200 && sc.code < 300
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : sc.code >= 300 && sc.code < 400
                              ? 'bg-blue-500/20 text-blue-400'
                              : sc.code >= 400 && sc.code < 500
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {sc.code}: {sc.count}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Top Endpoints */}
              {stats.logs_stats.top_endpoints && stats.logs_stats.top_endpoints.length > 0 && (
                <div className="mb-6">
                  <div className="text-xs text-slate-400 mb-2">Top Endpointy</div>
                  <div className="space-y-1">
                    {stats.logs_stats.top_endpoints.map((ep, i) => (
                      <div key={ep.endpoint} className="flex items-center gap-2 text-xs">
                        <span className="text-slate-600 w-4">{i + 1}.</span>
                        <span className="text-cyan-400 font-mono flex-1 truncate">
                          {ep.endpoint}
                        </span>
                        <span className="text-slate-500">{ep.count}x</span>
                        <span className="text-amber-400">{ep.avg_time}ms</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Transfer danych */}
              <div className="grid grid-cols-2 gap-4 text-sm mb-6">
                <div className="flex justify-between items-center bg-cyan-500/5 px-3 py-2 rounded-lg border border-cyan-500/20">
                  <span className="text-slate-400 flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                    </span>
                    ↓ Otrzymane:
                  </span>
                  <span className="text-cyan-400 font-mono font-bold animate-pulse">
                    {formatBytes(stats.logs_stats.total_data_received_bytes)}
                  </span>
                </div>
                <div className="flex justify-between items-center bg-orange-500/5 px-3 py-2 rounded-lg border border-orange-500/20">
                  <span className="text-slate-400 flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                    </span>
                    ↑ Wysłane:
                  </span>
                  <span className="text-orange-400 font-mono font-bold animate-pulse">
                    {formatBytes(stats.logs_stats.total_data_sent_bytes)}
                  </span>
                </div>
              </div>

              {/* Ostatnie requesty */}
              {stats.logs_stats.recent_requests && stats.logs_stats.recent_requests.length > 0 && (
                <div>
                  <div className="text-xs text-slate-400 mb-2">Ostatnie Requesty</div>
                  <div className="space-y-1 max-h-52 overflow-y-auto">
                    {stats.logs_stats.recent_requests.map((req, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-xs bg-slate-800/30 p-1.5 rounded"
                      >
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            req.method === 'GET'
                              ? 'bg-blue-500/30 text-blue-400'
                              : req.method === 'POST'
                                ? 'bg-emerald-500/30 text-emerald-400'
                                : req.method === 'PUT'
                                  ? 'bg-amber-500/30 text-amber-400'
                                  : 'bg-red-500/30 text-red-400'
                          }`}
                        >
                          {req.method}
                        </span>
                        <span className="text-slate-300 font-mono flex-1 truncate">
                          {req.endpoint}
                        </span>
                        <span
                          className={`px-1 rounded ${
                            req.status_code >= 200 && req.status_code < 300
                              ? 'text-emerald-400'
                              : req.status_code >= 400
                                ? 'text-red-400'
                                : 'text-amber-400'
                          }`}
                        >
                          {req.status_code}
                        </span>
                        <span className="text-slate-500">{req.duration_ms}ms</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Śledzone domeny */}
          {stats.domains && stats.domains.length > 0 && (
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
              <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                🌐 Śledzone Domeny ({stats.domains.length})
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 text-xs uppercase border-b border-slate-800">
                      <th className="text-left pb-3 pr-4">Site ID / Hostname</th>
                      <th className="text-right pb-3 px-4">Eventy</th>
                      <th className="text-right pb-3 px-4">Sesje</th>
                      <th className="text-right pb-3 px-4">Pierwsza aktywność</th>
                      <th className="text-right pb-3 pl-4">Ostatnia aktywność</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {stats.domains.map((domain, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 pr-4">
                          <div className="font-mono text-blue-400 font-medium">
                            {domain.site_id}
                          </div>
                          {domain.hostname && (
                            <div className="text-xs text-slate-500">{domain.hostname}</div>
                          )}
                        </td>
                        <td className="text-right py-3 px-4 font-mono text-white">
                          {domain.event_count.toLocaleString('pl-PL')}
                        </td>
                        <td className="text-right py-3 px-4 font-mono text-slate-400">
                          {domain.session_count.toLocaleString('pl-PL')}
                        </td>
                        <td className="text-right py-3 px-4 text-xs text-slate-500">
                          {new Date(domain.first_seen).toLocaleDateString('pl-PL')}
                        </td>
                        <td className="text-right py-3 pl-4 text-xs text-slate-400">
                          {new Date(domain.last_seen).toLocaleDateString('pl-PL', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </DashboardContent>
  );
}
