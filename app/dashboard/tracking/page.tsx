'use client';

import { useState, useEffect, useCallback } from 'react';
import { DashboardContent } from '@/components/dashboard';
import WorldMap from '@/components/WorldMap';

// Typy dla ustawień śledzenia
interface SiteTrackingStatus {
    site_id: string;
    enabled: boolean;
    has_custom_setting: boolean;
    custom_enabled: boolean | null;
    global_enabled: boolean;
    updated_at: string | null;
}

interface GlobalSettings {
    enabled: boolean;
    updated_at: string | null;
    updated_by: string | null;
}

interface TrackingSettingsResponse {
    global: GlobalSettings;
    sites: SiteTrackingStatus[];
    timestamp: string;
}

export default function TrackingControlPage() {
    // Stan
    const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(null);
    const [sites, setSites] = useState<SiteTrackingStatus[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [updating, setUpdating] = useState<string | null>(null); // 'global' lub site_id
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    // Filtrowanie
    const [filterStatus, setFilterStatus] = useState<'all' | 'enabled' | 'disabled'>('all');
    const [searchTerm, setSearchTerm] = useState('');

    // Pobieranie danych
    const fetchSettings = useCallback(async () => {
        try {
            const res = await fetch('/api/tracking/settings');
            
            if (!res.ok) {
                if (res.status === 401) {
                    window.location.href = '/login';
                    return;
                }
                throw new Error(`Błąd pobierania ustawień (${res.status})`);
            }

            const data: TrackingSettingsResponse = await res.json();
            setGlobalSettings(data.global);
            setSites(data.sites);
            setLastUpdated(new Date(data.timestamp));
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
        fetchSettings();
    }, [fetchSettings]);

    // Zmiana ustawienia globalnego
    const toggleGlobal = async () => {
        if (!globalSettings) return;
        
        setUpdating('global');
        try {
            const res = await fetch('/api/tracking/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'global',
                    enabled: !globalSettings.enabled
                })
            });

            if (!res.ok) {
                throw new Error('Błąd zmiany ustawienia');
            }

            // Odśwież dane
            await fetchSettings();
        } catch (err) {
            console.error('Błąd:', err);
            setError('Nie udało się zmienić ustawienia');
        } finally {
            setUpdating(null);
        }
    };

    // Zmiana ustawienia dla site_id
    const toggleSite = async (siteId: string, currentEnabled: boolean) => {
        setUpdating(siteId);
        try {
            const res = await fetch('/api/tracking/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'site',
                    site_id: siteId,
                    enabled: !currentEnabled
                })
            });

            if (!res.ok) {
                throw new Error('Błąd zmiany ustawienia');
            }

            // Odśwież dane
            await fetchSettings();
        } catch (err) {
            console.error('Błąd:', err);
            setError('Nie udało się zmienić ustawienia');
        } finally {
            setUpdating(null);
        }
    };

    // Usunięcie niestandardowego ustawienia (przywrócenie domyślnego)
    const resetSite = async (siteId: string) => {
        setUpdating(siteId);
        try {
            const res = await fetch('/api/tracking/settings', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ site_id: siteId })
            });

            if (!res.ok) {
                throw new Error('Błąd resetowania ustawienia');
            }

            await fetchSettings();
        } catch (err) {
            console.error('Błąd:', err);
            setError('Nie udało się zresetować ustawienia');
        } finally {
            setUpdating(null);
        }
    };


    // Filtrowanie stron
    const filteredSites = sites.filter(site => {
        // WYKLUCZENIE: Ukryj strony dashboardu - tracker nie powinien śledzić samego siebie
        if (site.site_id.startsWith('dashboard') || site.site_id.includes('/dashboard')) {
            return false;
        }
        
        // Filtr statusu
        if (filterStatus === 'enabled' && !site.enabled) return false;
        if (filterStatus === 'disabled' && site.enabled) return false;

        // Filtr wyszukiwania
        if (searchTerm && !site.site_id.toLowerCase().includes(searchTerm.toLowerCase())) {
            return false;
        }

        return true;
    });

    // Liczniki
    const enabledCount = sites.filter(s => s.enabled).length;
    const disabledCount = sites.filter(s => !s.enabled).length;
    const customCount = sites.filter(s => s.has_custom_setting).length;

    // Widok błędu
    if (error && !loading && !globalSettings) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-200">
                <div className="text-center max-w-md p-8">
                    <div className="text-6xl mb-4">⚠️</div>
                    <h2 className="text-xl font-bold mb-2">Błąd ładowania</h2>
                    <p className="text-slate-400 mb-4">{error}</p>
                    <button
                        onClick={fetchSettings}
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
                    <p>Ładowanie ustawień...</p>
                </div>
            </div>
        );
    }

    return (
        <DashboardContent>
            {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-white mb-2">
                        🛡️ Kontrola Śledzenia
                    </h1>
                    <p className="text-slate-400">
                        Zarządzaj aktywnością inwigilacji - wyłączaj/włączaj śledzenie globalnie lub per projekt
                    </p>
                </div>

                {/* Błąd (toast) */}
                {error && globalSettings && (
                    <div className="mb-6 bg-red-500/10 border border-red-500/50 rounded-xl p-4 flex items-center justify-between">
                        <span className="text-red-400">⚠️ {error}</span>
                        <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">✕</button>
                    </div>
                )}

                {/* Statystyki */}
                <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-white">{sites.length}</div>
                        <div className="text-xs text-slate-400">Wszystkie projekty</div>
                    </div>
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-emerald-400">{enabledCount}</div>
                        <div className="text-xs text-emerald-400/70">Śledzone</div>
                    </div>
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-red-400">{disabledCount}</div>
                        <div className="text-xs text-red-400/70">Wyłączone</div>
                    </div>
                    <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-purple-400">{customCount}</div>
                        <div className="text-xs text-purple-400/70">Niestandardowe</div>
                    </div>
                </div>

                {/* Filtry */}
                <div className="mb-6 bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex flex-wrap gap-4 items-center">
                    {/* Szukaj */}
                    <div className="flex-1 min-w-[200px]">
                        <input
                            type="text"
                            placeholder="Szukaj projektu (site_id)..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm focus:border-blue-500 outline-none"
                        />
                    </div>

                    {/* Filtr statusu */}
                    <div className="flex gap-2">
                        {(['all', 'enabled', 'disabled'] as const).map(status => (
                            <button
                                key={status}
                                onClick={() => setFilterStatus(status)}
                                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${
                                    filterStatus === status
                                        ? status === 'enabled' ? 'bg-emerald-600/30 border-emerald-500 text-emerald-400'
                                        : status === 'disabled' ? 'bg-red-600/30 border-red-500 text-red-400'
                                        : 'bg-blue-600/30 border-blue-500 text-blue-400'
                                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                                }`}
                            >
                                {status === 'all' ? 'Wszystkie' : status === 'enabled' ? '🟢 Śledzone' : '🔴 Wyłączone'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Lista projektów */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
                    <div className="p-4 border-b border-slate-800 bg-slate-800/50">
                        <h3 className="text-lg font-bold text-white">📋 Projekty (Site ID)</h3>
                        <p className="text-xs text-slate-500 mt-1">
                            Kliknij przełącznik, aby włączyć/wyłączyć śledzenie dla konkretnego projektu
                        </p>
                    </div>

                    {filteredSites.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="text-4xl mb-4">📭</div>
                            <p className="text-slate-400">
                                {sites.length === 0 
                                    ? 'Brak zarejestrowanych projektów' 
                                    : 'Brak projektów spełniających kryteria'}
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-800">
                            {filteredSites.map(site => {
                                const isUpdating = updating === site.site_id;
                                const effectivelyDisabled = !globalSettings?.enabled;
                                
                                return (
                                    <div 
                                        key={site.site_id}
                                        className={`p-4 flex items-center justify-between gap-4 transition-colors ${
                                            effectivelyDisabled ? 'opacity-50' : 'hover:bg-slate-800/30'
                                        }`}
                                    >
                                        <div className="flex items-center gap-4">
                                            {/* Status indicator */}
                                            <div className={`w-3 h-3 rounded-full ${
                                                !globalSettings?.enabled 
                                                    ? 'bg-slate-500' 
                                                    : site.enabled 
                                                        ? 'bg-emerald-400 animate-pulse' 
                                                        : 'bg-red-400'
                                            }`}></div>
                                            
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-white">{site.site_id}</span>
                                                    {site.has_custom_setting && (
                                                        <span className="text-[10px] px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded-full border border-purple-500/30">
                                                            Niestandardowe
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-slate-500 mt-0.5">
                                                    {site.enabled 
                                                        ? (globalSettings?.enabled ? '✅ Śledzone' : '⏸️ Globalnie wyłączone') 
                                                        : '❌ Wyłączone'}
                                                    {site.updated_at && ` • Zmieniono: ${new Date(site.updated_at).toLocaleDateString('pl-PL')}`}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {/* Przycisk resetowania (tylko jeśli ma custom setting) */}
                                            {site.has_custom_setting && (
                                                <button
                                                    onClick={() => resetSite(site.site_id)}
                                                    disabled={isUpdating}
                                                    className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-50"
                                                    title="Przywróć domyślne ustawienie"
                                                >
                                                    🔄 Reset
                                                </button>
                                            )}

                                            {/* Toggle switch */}
                                            <button
                                                onClick={() => toggleSite(site.site_id, site.enabled)}
                                                disabled={isUpdating || !globalSettings?.enabled}
                                                className={`relative w-14 h-7 rounded-full transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${
                                                    site.enabled ? 'bg-emerald-600' : 'bg-slate-600'
                                                }`}
                                                title={!globalSettings?.enabled ? 'Włącz najpierw śledzenie globalne' : ''}
                                            >
                                                <span className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300 ${
                                                    site.enabled ? 'left-8' : 'left-1'
                                                }`}>
                                                    {isUpdating && (
                                                        <span className="absolute inset-0 flex items-center justify-center text-xs animate-spin">⏳</span>
                                                    )}
                                                </span>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* GŁÓWNY PRZEŁĄCZNIK - GLOBALNY */}
                <div className={`mt-8 rounded-2xl border-2 p-8 transition-all ${
                    globalSettings?.enabled 
                        ? 'bg-emerald-500/10 border-emerald-500/50' 
                        : 'bg-red-500/10 border-red-500/50'
                }`}>
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="text-center md:text-left">
                            <div className="flex items-center gap-3 justify-center md:justify-start mb-2">
                                <span className={`text-4xl ${globalSettings?.enabled ? 'animate-pulse' : ''}`}>
                                    {globalSettings?.enabled ? '🟢' : '🔴'}
                                </span>
                                <h2 className="text-2xl font-bold text-white">
                                    Śledzenie Globalne
                                </h2>
                            </div>
                            <p className={`text-lg ${globalSettings?.enabled ? 'text-emerald-400' : 'text-red-400'}`}>
                                {globalSettings?.enabled 
                                    ? '✅ AKTYWNE - Wszystkie strony są inwigilowane' 
                                    : '❌ WYŁĄCZONE - Żadne dane nie są zbierane'}
                            </p>
                            {globalSettings?.updated_at && (
                                <p className="text-xs text-slate-500 mt-2">
                                    Zmieniono: {new Date(globalSettings.updated_at).toLocaleString('pl-PL')}
                                    {globalSettings.updated_by && ` przez ${globalSettings.updated_by}`}
                                </p>
                            )}
                        </div>

                        <button
                            onClick={toggleGlobal}
                            disabled={updating === 'global'}
                            className={`px-8 py-4 rounded-xl text-lg font-bold transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed ${
                                globalSettings?.enabled
                                    ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/30'
                                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/30'
                            }`}
                        >
                            {updating === 'global' ? (
                                <span className="flex items-center gap-2">
                                    <span className="animate-spin">⏳</span> Zmieniam...
                                </span>
                            ) : globalSettings?.enabled ? (
                                '🛑 WYŁĄCZ WSZYSTKO'
                            ) : (
                                '▶️ WŁĄCZ ŚLEDZENIE'
                            )}
                        </button>
                    </div>

                    {!globalSettings?.enabled && (
                        <div className="mt-6 bg-red-900/30 border border-red-800 rounded-lg p-4">
                            <p className="text-red-300 text-sm flex items-center gap-2">
                                <span className="text-xl">⚠️</span>
                                <span>
                                    <strong>Uwaga:</strong> Gdy śledzenie globalne jest wyłączone, żadne dane z żadnej strony nie będą zbierane, 
                                    nawet jeśli dana strona ma włączone indywidualne śledzenie.
                                </span>
                            </p>
                        </div>
                    )}

                    {/* Mapa świata z geolokalizacją */}
                    {globalSettings?.enabled && (
                        <div className="mt-8 pt-8 border-t border-slate-700/50">
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                🗺️ Geolokalizacja Śledzonych Sesji
                                <span className="text-xs font-normal text-slate-500">(ostatnie 24h)</span>
                            </h3>
                            <WorldMap />
                        </div>
                    )}
                </div>

                {/* Informacja o działaniu */}
                <div className="mt-8 bg-slate-900/30 border border-slate-800 rounded-xl p-6">
                    <h4 className="text-lg font-bold text-white mb-4">ℹ️ Jak to działa?</h4>
                    <div className="grid md:grid-cols-2 gap-6 text-sm text-slate-400">
                        <div>
                            <h5 className="text-emerald-400 font-semibold mb-2">🌍 Śledzenie Globalne</h5>
                            <p>
                                Główny wyłącznik całego systemu. Gdy jest <strong className="text-red-400">WYŁĄCZONY</strong>, 
                                żadne dane nie są zbierane z żadnej strony - niezależnie od ustawień indywidualnych.
                            </p>
                        </div>
                        <div>
                            <h5 className="text-purple-400 font-semibold mb-2">📦 Śledzenie per Projekt</h5>
                            <p>
                                Pozwala wyłączyć śledzenie dla konkretnego site_id, zachowując aktywność reszty.
                                Działa tylko gdy śledzenie globalne jest <strong className="text-emerald-400">WŁĄCZONE</strong>.
                            </p>
                        </div>
                    </div>
                    <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                        <p className="text-amber-400 text-sm">
                            💡 <strong>Tip:</strong> Tracker.js na stronach może sprawdzić status przed wysłaniem danych 
                            poprzez endpoint <code className="bg-slate-800 px-1 rounded">/api/tracking/status?site_id=X</code>
                        </p>
                    </div>
                </div>

        </DashboardContent>
    );
}

