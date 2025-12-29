'use client';

import { useState, useEffect, useCallback } from 'react';

interface LocationPin {
  session_id: string;
  visitor_id: string;
  site_id: string;
  country: string;
  city: string | null;
  ip: string | null;
  lat: number;
  lon: number;
  is_active: boolean;
  event_count: number;
  started_at: string;
  last_activity: string;
  browser: string | null;
  platform: string | null;
}

interface LocationData {
  locations: LocationPin[];
  stats: {
    total: number;
    active: number;
    inactive: number;
  };
  countries: Record<string, { active: number; inactive: number }>;
}

// Uproszczone ścieżki kontynentów (Natural Earth simplified)

export default function WorldMap() {
  const [data, setData] = useState<LocationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredPin, setHoveredPin] = useState<LocationPin | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const fetchLocations = useCallback(async () => {
    try {
      const res = await fetch('/api/stats/locations');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (error) {
      console.error('Failed to fetch locations:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocations();
    const interval = setInterval(fetchLocations, 30000);
    return () => clearInterval(interval);
  }, [fetchLocations]);

  // Konwersja współrzędnych geograficznych na SVG (projekcja Mercator)
  const latLonToSvg = (lat: number, lon: number) => {
    const x = ((lon + 180) / 360) * 1000;
    const latRad = (lat * Math.PI) / 180;
    const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
    const y = 250 - (mercN * 250) / Math.PI;
    return { x: Math.max(0, Math.min(1000, x)), y: Math.max(0, Math.min(500, y)) };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  };

  if (loading) {
    return (
      <div className="h-64 bg-slate-900/50 rounded-xl border border-slate-800 flex items-center justify-center">
        <div className="text-slate-500 animate-pulse">🌍 Ładowanie mapy...</div>
      </div>
    );
  }

  if (!data || data.locations.length === 0) {
    return (
      <div className="h-64 bg-slate-900/50 rounded-xl border border-slate-800 flex items-center justify-center">
        <div className="text-slate-500">🌍 Brak danych lokalizacji</div>
      </div>
    );
  }

  return (
    <div className="relative" onMouseMove={handleMouseMove}>
      {/* Statystyki */}
      <div className="flex gap-4 mb-4">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50"></span>
          <span className="text-sm text-slate-400">
            Aktywne: <span className="text-emerald-400 font-bold">{data.stats.active}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-slate-500"></span>
          <span className="text-sm text-slate-400">
            Nieaktywne: <span className="text-slate-300 font-bold">{data.stats.inactive}</span>
          </span>
        </div>
        <div className="ml-auto text-xs text-slate-500">
          {Object.keys(data.countries).length} krajów
        </div>
      </div>

      {/* Mapa */}
      <div className="relative bg-slate-900/80 rounded-xl border border-slate-700 overflow-hidden">
        <svg
          viewBox="0 0 1000 500"
          className="w-full h-auto"
          style={{
            minHeight: '300px',
            background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
          }}
        >
          <defs>
            <radialGradient id="pinGlowActive" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
            </radialGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient id="landGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#1e3a5f" />
              <stop offset="100%" stopColor="#0f2744" />
            </linearGradient>
          </defs>

          {/* Siatka */}
          <g stroke="#1e293b" strokeWidth="0.5" opacity="0.5">
            {[0, 100, 200, 300, 400, 500].map((y) => (
              <line key={`h-${y}`} x1="0" y1={y} x2="1000" y2={y} />
            ))}
            {[0, 125, 250, 375, 500, 625, 750, 875, 1000].map((x) => (
              <line key={`v-${x}`} x1={x} y1="0" x2={x} y2="500" />
            ))}
          </g>

          {/* Kontynenty - SVG paths */}
          <g fill="url(#landGradient)" stroke="#3b5998" strokeWidth="0.5" opacity="0.8">
            {/* Ameryka Północna */}
            <path d="M80,50 L130,45 L180,55 L220,70 L250,65 L280,80 L300,100 L290,130 L270,150 L250,165 L220,175 L190,180 L160,185 L140,200 L120,195 L100,175 L85,150 L75,120 L70,90 L80,50 Z" />
            {/* Grenlandia */}
            <path d="M340,30 L380,25 L410,40 L420,70 L400,100 L370,110 L340,95 L330,60 L340,30 Z" />
            {/* Ameryka Środkowa i Karaiby */}
            <path d="M170,200 L200,195 L230,210 L245,235 L235,260 L210,275 L185,265 L170,240 L165,215 L170,200 Z" />
            {/* Ameryka Południowa */}
            <path d="M230,280 L270,270 L310,290 L330,330 L325,380 L310,420 L280,450 L250,440 L220,400 L200,350 L205,305 L230,280 Z" />
            {/* Europa */}
            <path d="M460,70 L490,60 L530,65 L560,75 L580,90 L590,110 L585,135 L565,155 L540,165 L510,170 L480,160 L455,145 L445,120 L450,95 L460,70 Z" />
            {/* Wielka Brytania i Irlandia */}
            <path d="M435,90 L450,85 L460,100 L455,120 L440,125 L430,110 L435,90 Z" />
            {/* Skandynawia */}
            <path d="M510,40 L540,30 L560,45 L555,80 L530,90 L505,75 L510,40 Z" />
            {/* Afryka */}
            <path d="M480,175 L520,165 L570,180 L610,210 L625,260 L615,320 L590,370 L550,400 L510,395 L480,360 L470,310 L465,250 L475,200 L480,175 Z" />
            {/* Bliski Wschód */}
            <path d="M590,140 L630,130 L660,150 L665,180 L645,200 L610,195 L590,170 L590,140 Z" />
            {/* Rosja / Północna Azja */}
            <path d="M580,40 L650,30 L750,35 L850,50 L920,70 L950,95 L940,130 L900,150 L840,155 L780,145 L720,140 L660,135 L610,120 L590,90 L580,60 L580,40 Z" />
            {/* Chiny / Wschodnia Azja */}
            <path d="M720,150 L780,140 L840,155 L880,175 L890,210 L870,245 L830,260 L780,255 L740,240 L710,210 L705,175 L720,150 Z" />
            {/* Indie */}
            <path d="M670,200 L710,190 L740,215 L745,260 L720,300 L680,310 L655,280 L660,235 L670,200 Z" />
            {/* Azja Południowo-Wschodnia */}
            <path d="M760,265 L800,255 L840,275 L850,310 L830,345 L790,355 L755,340 L750,300 L760,265 Z" />
            {/* Japonia */}
            <path d="M890,135 L910,125 L925,145 L920,180 L900,195 L885,185 L880,155 L890,135 Z" />
            {/* Filipiny / Indonezja */}
            <path d="M830,290 L860,285 L895,300 L920,320 L915,350 L885,360 L850,350 L825,325 L830,290 Z" />
            {/* Australia */}
            <path d="M800,360 L860,345 L920,365 L950,400 L940,445 L900,470 L845,465 L800,440 L785,400 L800,360 Z" />
            {/* Nowa Zelandia */}
            <path d="M955,430 L975,420 L985,450 L975,480 L955,475 L950,450 L955,430 Z" />
            {/* Tasmania */}
            <path d="M875,475 L895,470 L905,490 L890,505 L870,495 L875,475 Z" />
          </g>

          {/* Pinezki lokalizacji */}
          {data.locations.map((loc) => {
            const { x, y } = latLonToSvg(loc.lat, loc.lon);
            const isHovered = hoveredPin?.session_id === loc.session_id;

            return (
              <g
                key={loc.session_id}
                transform={`translate(${x}, ${y})`}
                onMouseEnter={() => setHoveredPin(loc)}
                onMouseLeave={() => setHoveredPin(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Glow dla aktywnych */}
                {loc.is_active && (
                  <circle
                    r={isHovered ? 25 : 18}
                    fill="url(#pinGlowActive)"
                    className="animate-pulse"
                  />
                )}

                {/* Pulsujący ring */}
                {loc.is_active && (
                  <circle
                    r="15"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="1.5"
                    opacity="0.6"
                    className="animate-ping"
                  />
                )}

                {/* Pin */}
                <circle
                  r={isHovered ? 10 : 6}
                  fill={loc.is_active ? '#10b981' : '#64748b'}
                  stroke={loc.is_active ? '#34d399' : '#94a3b8'}
                  strokeWidth={isHovered ? 3 : 2}
                  filter={loc.is_active ? 'url(#glow)' : undefined}
                  className="transition-all duration-200"
                />

                {/* Etykieta kraju przy hover */}
                {isHovered && (
                  <text
                    y={-18}
                    textAnchor="middle"
                    fill="#fff"
                    fontSize="12"
                    fontWeight="bold"
                    style={{ textShadow: '0 0 4px #000' }}
                  >
                    {loc.city || loc.country}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Tooltip */}
        {hoveredPin && (
          <div
            className="fixed z-50 bg-slate-900/95 border border-slate-600 rounded-xl p-4 shadow-2xl pointer-events-none backdrop-blur-sm"
            style={{
              left: mousePos.x + 15,
              top: mousePos.y + 15,
              maxWidth: '300px',
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <span
                className={`w-3 h-3 rounded-full ${hoveredPin.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`}
              ></span>
              <span className="font-bold text-white text-lg">{hoveredPin.country}</span>
              {hoveredPin.city && <span className="text-slate-400">• {hoveredPin.city}</span>}
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {hoveredPin.ip && (
                <>
                  <span className="text-slate-500">IP:</span>
                  <span className="text-cyan-400 font-mono">{hoveredPin.ip}</span>
                </>
              )}
              <span className="text-slate-500">Site ID:</span>
              <span className="text-purple-400 font-mono text-xs">
                {hoveredPin.site_id.substring(0, 12)}...
              </span>

              <span className="text-slate-500">Eventy:</span>
              <span className="text-amber-400 font-bold">{hoveredPin.event_count}</span>

              {hoveredPin.browser && (
                <>
                  <span className="text-slate-500">Przeglądarka:</span>
                  <span className="text-slate-300">{hoveredPin.browser}</span>
                </>
              )}

              {hoveredPin.platform && (
                <>
                  <span className="text-slate-500">System:</span>
                  <span className="text-slate-300">{hoveredPin.platform}</span>
                </>
              )}

              <span className="text-slate-500">Ostatnia aktywność:</span>
              <span className="text-slate-300">
                {new Date(hoveredPin.last_activity).toLocaleTimeString('pl-PL')}
              </span>
            </div>

            <div
              className={`mt-3 pt-3 border-t border-slate-700 text-sm font-medium ${
                hoveredPin.is_active ? 'text-emerald-400' : 'text-slate-500'
              }`}
            >
              {hoveredPin.is_active ? '● Aktywny teraz' : '○ Nieaktywny'}
            </div>
          </div>
        )}
      </div>

      {/* Lista krajów */}
      {Object.keys(data.countries).length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(data.countries)
            .sort((a, b) => b[1].active + b[1].inactive - (a[1].active + a[1].inactive))
            .slice(0, 12)
            .map(([country, counts]) => (
              <span
                key={country}
                className="px-3 py-1.5 bg-slate-800/50 rounded-lg text-sm border border-slate-700 flex items-center gap-2"
              >
                <span className="text-slate-300">{country}</span>
                {counts.active > 0 && (
                  <span className="text-emerald-400 font-bold">{counts.active}</span>
                )}
                {counts.inactive > 0 && <span className="text-slate-500">{counts.inactive}</span>}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
