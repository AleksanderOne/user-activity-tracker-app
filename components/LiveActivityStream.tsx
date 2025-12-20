'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';

interface TimelineDataPoint {
    date: string;
    visitors: number;
    pageviews: number;
}

interface LiveActivityStreamProps {
    data: TimelineDataPoint[];
    isRefreshing?: boolean;
}

// Typ dla animowanych "wpadających" zdarzeń
interface IncomingEvent {
    id: number;
    type: 'visitor' | 'pageview';
    value: number;
    timestamp: number;
}

export default function LiveActivityStream({ data, isRefreshing }: LiveActivityStreamProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [currentTime, setCurrentTime] = useState(Date.now());
    const [scrollOffset, setScrollOffset] = useState(0);
    const [incomingEvents, setIncomingEvents] = useState<IncomingEvent[]>([]);
    const lastDataRef = useRef<TimelineDataPoint[]>([]);
    const eventIdRef = useRef(0);

    // Aktualizuj czas co 100ms dla płynnej animacji przesuwania
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTime(Date.now());
            // Przesuń wykres - 1 piksel na 100ms = 10 pikseli na sekundę
            setScrollOffset(prev => (prev + 0.5) % 100);
        }, 100);
        return () => clearInterval(interval);
    }, []);

    // Wykryj nowe dane i animuj "wpadające" zdarzenia
    useEffect(() => {
        if (!data || data.length === 0) return;

        const lastData = lastDataRef.current;
        const newData = data;

        // Sprawdź czy są nowe/zmienione dane
        if (lastData.length > 0 && newData.length > 0) {
            const lastPoint = newData[newData.length - 1];
            const prevLastPoint = lastData[lastData.length - 1];

            // Jeśli ostatni punkt się zmienił - animuj nowe zdarzenie
            if (lastPoint && prevLastPoint) {
                const visitorsDiff = lastPoint.visitors - (prevLastPoint.visitors || 0);
                const pageviewsDiff = lastPoint.pageviews - (prevLastPoint.pageviews || 0);

                if (visitorsDiff > 0 || lastPoint.date !== prevLastPoint.date) {
                    // Nowy użytkownik!
                    const newEvent: IncomingEvent = {
                        id: eventIdRef.current++,
                        type: 'visitor',
                        value: lastPoint.visitors,
                        timestamp: Date.now(),
                        x: 100,
                    };
                    setIncomingEvents(prev => [...prev.slice(-10), newEvent]);
                }

                if (pageviewsDiff > 0) {
                    // Nowa odsłona!
                    const newEvent: IncomingEvent = {
                        id: eventIdRef.current++,
                        type: 'pageview',
                        value: lastPoint.pageviews,
                        timestamp: Date.now(),
                        x: 100,
                    };
                    setIncomingEvents(prev => [...prev.slice(-10), newEvent]);
                }
            }
        }

        lastDataRef.current = [...newData];
    }, [data]);

    // Usuń stare animowane zdarzenia po 3 sekundach
    useEffect(() => {
        const cleanup = setInterval(() => {
            const now = Date.now();
            setIncomingEvents(prev => prev.filter(e => now - e.timestamp < 3000));
        }, 500);
        return () => clearInterval(cleanup);
    }, []);

    // Oblicz statystyki
    const stats = useMemo(() => {
        if (!data || data.length === 0) return { maxVisitors: 1, maxPageviews: 1, totalVisitors: 0, totalPageviews: 0 };
        const maxVisitors = Math.max(...data.map(d => d.visitors), 1);
        const maxPageviews = Math.max(...data.map(d => d.pageviews), 1);
        const totalVisitors = data.reduce((sum, d) => sum + d.visitors, 0);
        const totalPageviews = data.reduce((sum, d) => sum + d.pageviews, 0);
        return { maxVisitors, maxPageviews, totalVisitors, totalPageviews };
    }, [data]);

    // Formatuj czas
    const formatTime = useCallback((dateStr: string) => {
        if (dateStr.includes('T')) {
            return dateStr.split('T')[1].slice(0, 5);
        }
        return dateStr;
    }, []);

    // Aktualny czas jako string
    const currentTimeStr = useMemo(() => {
        return new Date(currentTime).toLocaleTimeString('pl-PL', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });
    }, [currentTime]);

    if (!data || data.length === 0) {
        return (
            <div className="relative h-full flex items-center justify-center bg-slate-900/50">
                <div className="text-slate-500">Brak danych do wyświetlenia</div>
            </div>
        );
    }

    // Oblicz punkty wykresu
    const maxVal = Math.max(stats.maxVisitors, stats.maxPageviews, 1);
    const chartHeight = 300;
    const chartWidth = 100; // procenty

    return (
        <div ref={containerRef} className="relative h-full flex flex-col bg-gradient-to-b from-slate-900/30 to-slate-950/50">
            {/* Header z live time */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/50">
                <div className="flex items-center gap-6">
                    {/* Użytkownicy */}
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <div className="w-3 h-3 rounded-full bg-blue-500" />
                            <div className="absolute inset-0 w-3 h-3 rounded-full bg-blue-500 animate-ping opacity-50" />
                        </div>
                        <div>
                            <span className="text-sm text-slate-400">Użytkownicy</span>
                            <span className="ml-2 text-xl font-bold text-blue-400 tabular-nums">{stats.totalVisitors}</span>
                        </div>
                    </div>
                    
                    {/* Odsłony */}
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <div className="w-3 h-3 rounded-full bg-emerald-500" />
                            <div className="absolute inset-0 w-3 h-3 rounded-full bg-emerald-500 animate-ping opacity-50" />
                        </div>
                        <div>
                            <span className="text-sm text-slate-400">Odsłony</span>
                            <span className="ml-2 text-xl font-bold text-emerald-400 tabular-nums">{stats.totalPageviews}</span>
                        </div>
                    </div>
                </div>

                {/* Live Clock */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-slate-800/50 px-4 py-2 rounded-lg border border-slate-700/50">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-xs text-slate-400 uppercase tracking-wider">LIVE</span>
                        <span className="text-lg font-mono font-bold text-white tabular-nums">{currentTimeStr}</span>
                    </div>
                    {isRefreshing && (
                        <div className="flex items-center gap-2 text-blue-400 animate-pulse">
                            <span className="text-sm">⟳</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Główny obszar wykresu */}
            <div className="flex-1 relative px-6 py-4 overflow-hidden">
                {/* Animowana siatka tła - przesuwa się w lewo */}
                <div 
                    className="absolute inset-0 px-6 transition-transform duration-100 ease-linear"
                    style={{ transform: `translateX(-${scrollOffset * 0.5}px)` }}
                >
                    {/* Pionowe linie siatki */}
                    {Array.from({ length: 20 }).map((_, i) => (
                        <div
                            key={`vline-${i}`}
                            className="absolute top-0 bottom-8 w-px bg-slate-800/20"
                            style={{ left: `${i * 5 + 5}%` }}
                        />
                    ))}
                    {/* Poziome linie */}
                    {[0, 25, 50, 75, 100].map(percent => (
                        <div
                            key={percent}
                            className="absolute left-0 right-0 border-t border-slate-800/30"
                            style={{ top: `${percent}%` }}
                        />
                    ))}
                </div>

                {/* Skala Y - statyczna */}
                <div className="absolute left-2 top-0 bottom-8 flex flex-col justify-between text-[10px] text-slate-600 tabular-nums">
                    {[0, 25, 50, 75, 100].map(percent => (
                        <span key={percent}>
                            {Math.round(maxVal * (100 - percent) / 100)}
                        </span>
                    ))}
                </div>

                {/* SVG Wykres - z przesuwaniem */}
                <div 
                    className="absolute inset-0 px-6 transition-transform duration-100 ease-linear"
                    style={{ transform: `translateX(-${scrollOffset * 0.3}px)` }}
                >
                    <svg 
                        className="w-full h-full relative z-10" 
                        viewBox={`0 0 ${chartWidth} 100`} 
                        preserveAspectRatio="none"
                        style={{ overflow: 'visible' }}
                    >
                        <defs>
                            {/* Gradient dla użytkowników */}
                            <linearGradient id="visitorsAreaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
                                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
                            </linearGradient>
                            {/* Gradient dla odsłon */}
                            <linearGradient id="pageviewsAreaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                                <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
                            </linearGradient>
                            {/* Glow */}
                            <filter id="lineGlow" x="-50%" y="-50%" width="200%" height="200%">
                                <feGaussianBlur stdDeviation="0.8" result="blur" />
                                <feMerge>
                                    <feMergeNode in="blur" />
                                    <feMergeNode in="SourceGraphic" />
                                </feMerge>
                            </filter>
                        </defs>

                        {/* Obszar pod wykresem odsłon */}
                        <path
                            d={`M 0 100 ${data.map((point, i) => {
                                const x = (i / (data.length - 1)) * chartWidth;
                                const y = 100 - (point.pageviews / maxVal) * 85;
                                return `L ${x} ${y}`;
                            }).join(' ')} L ${chartWidth} 100 Z`}
                            fill="url(#pageviewsAreaGradient)"
                        />

                        {/* Obszar pod wykresem użytkowników */}
                        <path
                            d={`M 0 100 ${data.map((point, i) => {
                                const x = (i / (data.length - 1)) * chartWidth;
                                const y = 100 - (point.visitors / maxVal) * 85;
                                return `L ${x} ${y}`;
                            }).join(' ')} L ${chartWidth} 100 Z`}
                            fill="url(#visitorsAreaGradient)"
                        />

                        {/* Linia odsłon */}
                        <path
                            d={`M ${data.map((point, i) => {
                                const x = (i / (data.length - 1)) * chartWidth;
                                const y = 100 - (point.pageviews / maxVal) * 85;
                                return `${i === 0 ? '' : 'L '}${x} ${y}`;
                            }).join(' ')}`}
                            fill="none"
                            stroke="#10b981"
                            strokeWidth="0.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            filter="url(#lineGlow)"
                        />

                        {/* Linia użytkowników */}
                        <path
                            d={`M ${data.map((point, i) => {
                                const x = (i / (data.length - 1)) * chartWidth;
                                const y = 100 - (point.visitors / maxVal) * 85;
                                return `${i === 0 ? '' : 'L '}${x} ${y}`;
                            }).join(' ')}`}
                            fill="none"
                            stroke="#3b82f6"
                            strokeWidth="0.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            filter="url(#lineGlow)"
                        />
                    </svg>
                </div>

                {/* Punkt "TERAZ" - na prawej krawędzi, statyczny */}
                {data.length > 0 && (
                    <div className="absolute right-6 top-4 bottom-8 flex flex-col justify-center pointer-events-none">
                        {/* Pulsujący punkt użytkowników */}
                        <div 
                            className="absolute right-0 w-4 h-4"
                            style={{ 
                                top: `${(1 - data[data.length - 1].visitors / maxVal) * 85}%`,
                            }}
                        >
                            <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-50" />
                            <div className="absolute inset-1 bg-blue-400 rounded-full shadow-lg shadow-blue-500/50" />
                        </div>
                        
                        {/* Pulsujący punkt odsłon */}
                        <div 
                            className="absolute right-0 w-4 h-4"
                            style={{ 
                                top: `${(1 - data[data.length - 1].pageviews / maxVal) * 85}%`,
                            }}
                        >
                            <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-50" />
                            <div className="absolute inset-1 bg-emerald-400 rounded-full shadow-lg shadow-emerald-500/50" />
                        </div>
                    </div>
                )}

                {/* Linia "teraz" - czerwona pionowa linia */}
                <div className="absolute right-6 top-0 bottom-8 w-0.5 bg-gradient-to-b from-red-500 via-red-500/70 to-red-500/20 shadow-lg shadow-red-500/30">
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2">
                        <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-lg shadow-red-500/50" />
                        <div className="absolute inset-0 w-3 h-3 rounded-full bg-red-400 animate-ping" />
                    </div>
                    <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] text-red-400 font-bold whitespace-nowrap">
                        TERAZ
                    </div>
                </div>

                {/* Etykiety osi X (czas) - przesuwają się */}
                <div 
                    className="absolute bottom-0 left-6 right-6 flex justify-between text-[10px] text-slate-500 tabular-nums transition-transform duration-100 ease-linear"
                    style={{ transform: `translateX(-${scrollOffset * 0.3}px)` }}
                >
                    {data.filter((_, i) => i % Math.max(1, Math.ceil(data.length / 8)) === 0 || i === data.length - 1).map((point, index) => (
                        <span key={index}>{formatTime(point.date)}</span>
                    ))}
                </div>

                {/* Animowane "wpadające" zdarzenia */}
                {incomingEvents.map(event => (
                    <div
                        key={event.id}
                        className={`absolute animate-incoming-event pointer-events-none ${
                            event.type === 'visitor' ? 'text-blue-400' : 'text-emerald-400'
                        }`}
                        style={{
                            right: '80px',
                            top: event.type === 'visitor' ? '15%' : '35%',
                        }}
                    >
                        <div className="flex items-center gap-2 bg-slate-900/95 backdrop-blur-sm px-4 py-2 rounded-xl border-2 border-current shadow-2xl">
                            <span className="text-2xl animate-bounce">{event.type === 'visitor' ? '👤' : '📄'}</span>
                            <div className="flex flex-col">
                                <span className="font-bold text-lg">+1</span>
                                <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                                    {event.type === 'visitor' ? 'nowy użytkownik' : 'nowa odsłona'}
                                </span>
                            </div>
                        </div>
                    </div>
                ))}

                {/* Efekt "skanowania" - linia która przesuwa się */}
                <div 
                    className="absolute top-0 bottom-8 w-px bg-gradient-to-b from-cyan-500/0 via-cyan-500/50 to-cyan-500/0 pointer-events-none"
                    style={{ 
                        left: `${6 + (100 - scrollOffset)}%`,
                        transition: 'left 100ms linear'
                    }}
                />
            </div>

            {/* Footer z ostatnimi wartościami */}
            <div className="px-6 py-3 border-t border-slate-800/50 bg-slate-900/30">
                <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-4">
                        <span className="text-slate-500">Ostatnia minuta:</span>
                        {data.length > 0 && (
                            <>
                                <span className="text-blue-400">
                                    <span className="font-bold">{data[data.length - 1].visitors}</span> użytkowników
                                </span>
                                <span className="text-emerald-400">
                                    <span className="font-bold">{data[data.length - 1].pageviews}</span> odsłon
                                </span>
                            </>
                        )}
                    </div>
                    <div className="text-slate-600">
                        {data.length} punktów danych
                    </div>
                </div>
            </div>
        </div>
    );
}
