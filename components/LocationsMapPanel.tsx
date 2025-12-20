'use client';

import { useState, useEffect, useCallback } from 'react';
import WorldMap from './WorldMap';

interface SiteStats {
    site_id: string;
    hostname: string | null;
    event_count: number;
    session_count: number;
    visitor_count: number;
    active_now: number;
    top_countries: Array<{ country: string; count: number }>;
    top_browsers: Array<{ browser: string; count: number }>;
    top_platforms: Array<{ platform: string; count: number }>;
    last_activity: string;
    bounce_rate: number;
    avg_session_duration: number;
}

interface CountryStats {
    country: string;
    sessions: number;
    visitors: number;
    events: number;
    active: number;
    top_cities: Array<{ city: string; count: number }>;
}

interface LocationsPanelData {
    sites: SiteStats[];
    countries: CountryStats[];
    total_active: number;
    total_sessions_24h: number;
    total_countries: number;
}

// Emoji flagi dla krajów
const COUNTRY_FLAGS: Record<string, string> = {
    'Poland': '🇵🇱',
    'Germany': '🇩🇪',
    'France': '🇫🇷',
    'United Kingdom': '🇬🇧',
    'Spain': '🇪🇸',
    'Italy': '🇮🇹',
    'Netherlands': '🇳🇱',
    'Belgium': '🇧🇪',
    'Switzerland': '🇨🇭',
    'Austria': '🇦🇹',
    'Czech Republic': '🇨🇿',
    'Czechia': '🇨🇿',
    'Slovakia': '🇸🇰',
    'Hungary': '🇭🇺',
    'Romania': '🇷🇴',
    'Bulgaria': '🇧🇬',
    'Greece': '🇬🇷',
    'Turkey': '🇹🇷',
    'Russia': '🇷🇺',
    'Ukraine': '🇺🇦',
    'Belarus': '🇧🇾',
    'Lithuania': '🇱🇹',
    'Latvia': '🇱🇻',
    'Estonia': '🇪🇪',
    'Finland': '🇫🇮',
    'Sweden': '🇸🇪',
    'Norway': '🇳🇴',
    'Denmark': '🇩🇰',
    'Ireland': '🇮🇪',
    'Portugal': '🇵🇹',
    'United States': '🇺🇸',
    'Canada': '🇨🇦',
    'Mexico': '🇲🇽',
    'Brazil': '🇧🇷',
    'Argentina': '🇦🇷',
    'Chile': '🇨🇱',
    'Colombia': '🇨🇴',
    'Peru': '🇵🇪',
    'Australia': '🇦🇺',
    'New Zealand': '🇳🇿',
    'Japan': '🇯🇵',
    'China': '🇨🇳',
    'South Korea': '🇰🇷',
    'India': '🇮🇳',
    'Indonesia': '🇮🇩',
    'Thailand': '🇹🇭',
    'Vietnam': '🇻🇳',
    'Philippines': '🇵🇭',
    'Malaysia': '🇲🇾',
    'Singapore': '🇸🇬',
    'South Africa': '🇿🇦',
    'Egypt': '🇪🇬',
    'Morocco': '🇲🇦',
    'Nigeria': '🇳🇬',
    'Kenya': '🇰🇪',
    'Saudi Arabia': '🇸🇦',
    'United Arab Emirates': '🇦🇪',
    'Israel': '🇮🇱',
    'Iran': '🇮🇷',
    'Pakistan': '🇵🇰',
    'Bangladesh': '🇧🇩',
    'Taiwan': '🇹🇼',
    'Hong Kong': '🇭🇰',
    'Lokalna Sieć': '🏠',
    'Local Network': '🏠',
    'Unknown': '🌍',
    'Lokalne': '🏠',
};

// Ikony przeglądarek
const BROWSER_ICONS: Record<string, string> = {
    'Chrome': '🌐',
    'Firefox': '🦊',
    'Safari': '🧭',
    'Edge': '📘',
    'Opera': '🔴',
    'IE': '💠',
    'Brave': '🦁',
    'Vivaldi': '🎵',
    'Samsung Internet': '📱',
    'default': '🌐',
};

// Ikony platform
const PLATFORM_ICONS: Record<string, string> = {
    'Windows': '🪟',
    'MacOS': '🍎',
    'macOS': '🍎',
    'Linux': '🐧',
    'Android': '🤖',
    'iOS': '📱',
    'Chrome OS': '💻',
    'default': '💻',
};

export default function LocationsMapPanel({ isRefreshing = false }: { isRefreshing?: boolean }) {
    const [data, setData] = useState<LocationsPanelData | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedSite, setSelectedSite] = useState<string | null>(null);
    const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'sites' | 'countries'>('sites');

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch('/api/stats/locations/panel');
            if (res.ok) {
                const json = await res.json();
                setData(json);
            }
        } catch (error) {
            console.error('Błąd podczas pobierania danych lokalizacji:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const formatDuration = (seconds: number) => {
        if (isNaN(seconds) || seconds < 0) return '0s';
        if (seconds < 60) return `${Math.round(seconds)}s`;
        const minutes = Math.floor(seconds / 60);
        const secs = Math.round(seconds % 60);
        if (minutes < 60) return `${minutes}m ${secs}s`;
        const hours = Math.floor(minutes / 60);
        return `${hours}h ${minutes % 60}m`;
    };

    const getBrowserIcon = (browser: string) => {
        const key = Object.keys(BROWSER_ICONS).find(k => browser?.toLowerCase().includes(k.toLowerCase()));
        return BROWSER_ICONS[key || 'default'];
    };

    const getPlatformIcon = (platform: string) => {
        const key = Object.keys(PLATFORM_ICONS).find(k => platform?.toLowerCase().includes(k.toLowerCase()));
        return PLATFORM_ICONS[key || 'default'];
    };

    const getCountryFlag = (country: string) => {
        return COUNTRY_FLAGS[country] || '🌍';
    };

    if (loading) {
        return (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
                <div className="animate-pulse space-y-4">
                    <div className="h-6 bg-slate-700 rounded w-1/3"></div>
                    <div className="h-64 bg-slate-800 rounded"></div>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="h-20 bg-slate-700 rounded"></div>
                        <div className="h-20 bg-slate-700 rounded"></div>
                        <div className="h-20 bg-slate-700 rounded"></div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`rounded-xl border bg-slate-900/50 overflow-hidden transition-all duration-500 ease-out ${isRefreshing ? 'border-blue-500/30' : 'border-slate-800'}`}>
            {/* Nagłówek */}
            <div className="p-6 border-b border-slate-800">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <h2 className="text-2xl font-bold text-white">🗺️ Mapa Lokalizacji</h2>
                        <div className="flex items-center gap-2 bg-gradient-to-r from-cyan-600/20 to-emerald-600/20 px-3 py-1 rounded-full border border-cyan-500/30">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-xs font-medium text-emerald-400">LIVE</span>
                        </div>
                    </div>
                    
                    {/* Szybkie statystyki */}
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 bg-slate-800/70 px-4 py-2 rounded-lg border border-slate-700">
                            <span className="text-emerald-400 text-xl">👥</span>
                            <div>
                                <div className="text-xs text-slate-500">Aktywni teraz</div>
                                <div className="text-lg font-bold text-emerald-400">{data?.total_active || 0}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 bg-slate-800/70 px-4 py-2 rounded-lg border border-slate-700">
                            <span className="text-blue-400 text-xl">📊</span>
                            <div>
                                <div className="text-xs text-slate-500">Sesje (24h)</div>
                                <div className="text-lg font-bold text-blue-400">{data?.total_sessions_24h || 0}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 bg-slate-800/70 px-4 py-2 rounded-lg border border-slate-700">
                            <span className="text-purple-400 text-xl">🌍</span>
                            <div>
                                <div className="text-xs text-slate-500">Kraje</div>
                                <div className="text-lg font-bold text-purple-400">{data?.total_countries || 0}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Mapa świata */}
            <div className="p-6 border-b border-slate-800">
                <WorldMap />
            </div>

            {/* Zakładki */}
            <div className="border-b border-slate-800">
                <div className="flex">
                    <button
                        onClick={() => setActiveTab('sites')}
                        className={`flex-1 px-6 py-4 text-sm font-medium transition-all ${
                            activeTab === 'sites'
                                ? 'bg-slate-800/50 text-white border-b-2 border-blue-500'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800/30'
                        }`}
                    >
                        <span className="mr-2">🌐</span>
                        Strony / Domeny
                    </button>
                    <button
                        onClick={() => setActiveTab('countries')}
                        className={`flex-1 px-6 py-4 text-sm font-medium transition-all ${
                            activeTab === 'countries'
                                ? 'bg-slate-800/50 text-white border-b-2 border-emerald-500'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800/30'
                        }`}
                    >
                        <span className="mr-2">🗺️</span>
                        Kraje / Regiony
                    </button>
                </div>
            </div>

            {/* Zawartość zakładek */}
            <div className="p-6">
                {activeTab === 'sites' && (
                    <div className="space-y-4">
                        {/* Lista stron */}
                        <div className="grid gap-4">
                            {data?.sites && data.sites.length > 0 ? (
                                data.sites.map((site) => (
                                    <div
                                        key={site.site_id}
                                        className={`p-4 rounded-xl border cursor-pointer transition-all ${
                                            selectedSite === site.site_id
                                                ? 'bg-blue-950/30 border-blue-500/50'
                                                : 'bg-slate-800/30 border-slate-700 hover:border-slate-600'
                                        }`}
                                        onClick={() => setSelectedSite(selectedSite === site.site_id ? null : site.site_id)}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-3 h-3 rounded-full ${site.active_now > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></div>
                                                <div>
                                                    <div className="font-semibold text-white">
                                                        {site.hostname || site.site_id.substring(0, 16) + '...'}
                                                    </div>
                                                    <div className="text-xs text-slate-500 font-mono">{site.site_id.substring(0, 24)}...</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-6">
                                                <div className="text-center">
                                                    <div className="text-lg font-bold text-emerald-400">{site.active_now}</div>
                                                    <div className="text-xs text-slate-500">Aktywni</div>
                                                </div>
                                                <div className="text-center">
                                                    <div className="text-lg font-bold text-blue-400">{site.session_count}</div>
                                                    <div className="text-xs text-slate-500">Sesje</div>
                                                </div>
                                                <div className="text-center">
                                                    <div className="text-lg font-bold text-purple-400">{site.visitor_count}</div>
                                                    <div className="text-xs text-slate-500">Użytkownicy</div>
                                                </div>
                                                <div className="text-center">
                                                    <div className="text-lg font-bold text-amber-400">{site.event_count}</div>
                                                    <div className="text-xs text-slate-500">Eventy</div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Szczegóły strony (rozwinięte) */}
                                        {selectedSite === site.site_id && (
                                            <div className="mt-4 pt-4 border-t border-slate-700 grid grid-cols-1 md:grid-cols-3 gap-4">
                                                {/* Kraje */}
                                                <div className="bg-slate-900/50 p-4 rounded-lg">
                                                    <h4 className="text-sm font-medium text-slate-400 mb-3">🌍 Top Kraje</h4>
                                                    <div className="space-y-2">
                                                        {site.top_countries?.slice(0, 5).map((c, i) => (
                                                            <div key={i} className="flex items-center justify-between">
                                                                <span className="text-sm">
                                                                    {getCountryFlag(c.country)} {c.country}
                                                                </span>
                                                                <span className="text-sm font-mono text-slate-300">{c.count}</span>
                                                            </div>
                                                        )) || <div className="text-slate-500 text-sm">Brak danych</div>}
                                                    </div>
                                                </div>

                                                {/* Przeglądarki */}
                                                <div className="bg-slate-900/50 p-4 rounded-lg">
                                                    <h4 className="text-sm font-medium text-slate-400 mb-3">🌐 Przeglądarki</h4>
                                                    <div className="space-y-2">
                                                        {site.top_browsers?.slice(0, 5).map((b, i) => (
                                                            <div key={i} className="flex items-center justify-between">
                                                                <span className="text-sm">
                                                                    {getBrowserIcon(b.browser)} {b.browser}
                                                                </span>
                                                                <span className="text-sm font-mono text-slate-300">{b.count}</span>
                                                            </div>
                                                        )) || <div className="text-slate-500 text-sm">Brak danych</div>}
                                                    </div>
                                                </div>

                                                {/* Platformy */}
                                                <div className="bg-slate-900/50 p-4 rounded-lg">
                                                    <h4 className="text-sm font-medium text-slate-400 mb-3">💻 Platformy</h4>
                                                    <div className="space-y-2">
                                                        {site.top_platforms?.slice(0, 5).map((p, i) => (
                                                            <div key={i} className="flex items-center justify-between">
                                                                <span className="text-sm">
                                                                    {getPlatformIcon(p.platform)} {p.platform}
                                                                </span>
                                                                <span className="text-sm font-mono text-slate-300">{p.count}</span>
                                                            </div>
                                                        )) || <div className="text-slate-500 text-sm">Brak danych</div>}
                                                    </div>
                                                </div>

                                                {/* Dodatkowe statystyki */}
                                                <div className="md:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
                                                    <div className="bg-slate-900/50 p-3 rounded-lg text-center">
                                                        <div className="text-xs text-slate-500 mb-1">Bounce Rate</div>
                                                        <div className="text-lg font-bold text-orange-400">
                                                            {Math.round(site.bounce_rate)}%
                                                        </div>
                                                    </div>
                                                    <div className="bg-slate-900/50 p-3 rounded-lg text-center">
                                                        <div className="text-xs text-slate-500 mb-1">Śr. Czas Sesji</div>
                                                        <div className="text-lg font-bold text-cyan-400">
                                                            {formatDuration(site.avg_session_duration)}
                                                        </div>
                                                    </div>
                                                    <div className="bg-slate-900/50 p-3 rounded-lg text-center">
                                                        <div className="text-xs text-slate-500 mb-1">Eventy/Sesję</div>
                                                        <div className="text-lg font-bold text-pink-400">
                                                            {site.session_count > 0 ? Math.round(site.event_count / site.session_count) : 0}
                                                        </div>
                                                    </div>
                                                    <div className="bg-slate-900/50 p-3 rounded-lg text-center">
                                                        <div className="text-xs text-slate-500 mb-1">Ostatnia Aktywność</div>
                                                        <div className="text-sm font-medium text-slate-300">
                                                            {site.last_activity ? new Date(site.last_activity).toLocaleTimeString('pl-PL') : '—'}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-12 text-slate-500">
                                    <span className="text-4xl mb-4 block">📭</span>
                                    Brak danych o stronach
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'countries' && (
                    <div className="space-y-4">
                        {/* Lista krajów */}
                        <div className="grid gap-4">
                            {data?.countries && data.countries.length > 0 ? (
                                data.countries.map((country) => (
                                    <div
                                        key={country.country}
                                        className={`p-4 rounded-xl border cursor-pointer transition-all ${
                                            selectedCountry === country.country
                                                ? 'bg-emerald-950/30 border-emerald-500/50'
                                                : 'bg-slate-800/30 border-slate-700 hover:border-slate-600'
                                        }`}
                                        onClick={() => setSelectedCountry(selectedCountry === country.country ? null : country.country)}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <span className="text-3xl">{getCountryFlag(country.country)}</span>
                                                <div>
                                                    <div className="font-semibold text-white text-lg">{country.country}</div>
                                                    {country.active > 0 && (
                                                        <div className="flex items-center gap-1 text-xs text-emerald-400">
                                                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                                            {country.active} aktywnych teraz
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-6">
                                                <div className="text-center">
                                                    <div className="text-lg font-bold text-blue-400">{country.sessions}</div>
                                                    <div className="text-xs text-slate-500">Sesje</div>
                                                </div>
                                                <div className="text-center">
                                                    <div className="text-lg font-bold text-purple-400">{country.visitors}</div>
                                                    <div className="text-xs text-slate-500">Użytkownicy</div>
                                                </div>
                                                <div className="text-center">
                                                    <div className="text-lg font-bold text-amber-400">{country.events}</div>
                                                    <div className="text-xs text-slate-500">Eventy</div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Szczegóły kraju (rozwinięte) */}
                                        {selectedCountry === country.country && country.top_cities && country.top_cities.length > 0 && (
                                            <div className="mt-4 pt-4 border-t border-slate-700">
                                                <h4 className="text-sm font-medium text-slate-400 mb-3">🏙️ Top Miasta</h4>
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                                    {country.top_cities.slice(0, 8).map((city, i) => (
                                                        <div key={i} className="bg-slate-900/50 p-3 rounded-lg flex items-center justify-between">
                                                            <span className="text-sm text-slate-300">{city.city || 'Nieznane'}</span>
                                                            <span className="text-sm font-mono text-cyan-400">{city.count}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-12 text-slate-500">
                                    <span className="text-4xl mb-4 block">🌍</span>
                                    Brak danych o krajach
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

