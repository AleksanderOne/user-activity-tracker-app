'use client';

interface RefreshControlProps {
    lastUpdated: Date | null;
    isRefreshing?: boolean;
    autoRefresh?: boolean;
    onRefresh: () => void;
    onToggleAutoRefresh?: () => void;
    showAutoRefresh?: boolean;
}

/**
 * Wspólny komponent kontroli odświeżania danych
 * Używany w wielu podstronach dashboardu
 */
export default function RefreshControl({
    lastUpdated,
    isRefreshing = false,
    autoRefresh = false,
    onRefresh,
    onToggleAutoRefresh,
    showAutoRefresh = true,
}: RefreshControlProps) {
    return (
        <div className="flex items-center gap-2 bg-gradient-to-r from-slate-800/80 to-slate-900/80 px-4 py-2.5 rounded-xl border border-slate-700/50 shadow-lg">
            {/* Status i czas ostatniego odświeżenia */}
            <div className="flex items-center gap-2 pr-3 border-r border-slate-700/50">
                <div className="w-4 h-4 flex items-center justify-center">
                    {isRefreshing ? (
                        <span className="animate-spin text-blue-400 text-base">⟳</span>
                    ) : (
                        <span 
                            className={`w-2 h-2 rounded-full transition-all duration-300 ${
                                autoRefresh 
                                    ? 'bg-emerald-400 animate-pulse shadow-lg shadow-emerald-500/50' 
                                    : 'bg-slate-500'
                            }`}
                        />
                    )}
                </div>
                <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                        Ostatnia aktualizacja
                    </span>
                    <span 
                        className="text-sm text-white font-medium"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                        {isRefreshing ? (
                            <span className="text-blue-400">Trwa...</span>
                        ) : (
                            lastUpdated ? lastUpdated.toLocaleTimeString('pl-PL') : '—'
                        )}
                    </span>
                </div>
            </div>

            {/* Przycisk ręcznego odświeżenia */}
            <button
                onClick={onRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 hover:border-blue-500/50 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-wait"
                title="Odśwież teraz"
            >
                <span className={`text-blue-400 ${isRefreshing ? 'animate-spin' : ''}`}>⟳</span>
                <span className="text-xs font-medium text-blue-300">Odśwież</span>
            </button>

            {/* Przycisk Auto-odświeżania */}
            {showAutoRefresh && onToggleAutoRefresh && (
                <button
                    onClick={onToggleAutoRefresh}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all duration-200 border ${
                        autoRefresh
                            ? 'bg-emerald-600/20 border-emerald-500/30 hover:bg-emerald-600/30 hover:border-emerald-500/50'
                            : 'bg-slate-700/50 border-slate-600/50 hover:bg-slate-700 hover:border-slate-500'
                    }`}
                    title={autoRefresh ? 'Wyłącz auto-odświeżanie' : 'Włącz auto-odświeżanie'}
                >
                    <span className={`transition-colors duration-200 ${autoRefresh ? 'text-emerald-400' : 'text-slate-400'}`}>
                        {autoRefresh ? '⏸' : '▶'}
                    </span>
                    <span className={`text-xs font-medium transition-colors duration-200 ${autoRefresh ? 'text-emerald-300' : 'text-slate-400'}`}>
                        Auto
                    </span>
                </button>
            )}
        </div>
    );
}

