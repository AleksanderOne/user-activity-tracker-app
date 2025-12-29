import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// Mapowanie krajów do współrzędnych (centrum kraju)
const COUNTRY_COORDS: Record<string, { lat: number; lon: number }> = {
  // Lokalne sieci - domyślnie pokazuj w Polsce (lub tam gdzie jest serwer)
  'Lokalna Sieć': { lat: 52.0, lon: 19.0 },
  'Local Network': { lat: 52.0, lon: 19.0 },
  Unknown: { lat: 52.0, lon: 19.0 },
  Lokalne: { lat: 52.0, lon: 19.0 },
  Poland: { lat: 52.0, lon: 19.0 },
  Germany: { lat: 51.0, lon: 10.0 },
  France: { lat: 46.0, lon: 2.0 },
  'United Kingdom': { lat: 54.0, lon: -2.0 },
  Spain: { lat: 40.0, lon: -4.0 },
  Italy: { lat: 42.0, lon: 12.0 },
  Netherlands: { lat: 52.5, lon: 5.0 },
  Belgium: { lat: 50.5, lon: 4.5 },
  Switzerland: { lat: 47.0, lon: 8.0 },
  Austria: { lat: 47.5, lon: 14.0 },
  'Czech Republic': { lat: 50.0, lon: 15.0 },
  Czechia: { lat: 50.0, lon: 15.0 },
  Slovakia: { lat: 48.7, lon: 19.5 },
  Hungary: { lat: 47.0, lon: 20.0 },
  Romania: { lat: 46.0, lon: 25.0 },
  Bulgaria: { lat: 42.7, lon: 25.5 },
  Greece: { lat: 39.0, lon: 22.0 },
  Turkey: { lat: 39.0, lon: 35.0 },
  Russia: { lat: 60.0, lon: 100.0 },
  Ukraine: { lat: 49.0, lon: 32.0 },
  Belarus: { lat: 53.0, lon: 28.0 },
  Lithuania: { lat: 55.0, lon: 24.0 },
  Latvia: { lat: 57.0, lon: 25.0 },
  Estonia: { lat: 59.0, lon: 26.0 },
  Finland: { lat: 64.0, lon: 26.0 },
  Sweden: { lat: 62.0, lon: 15.0 },
  Norway: { lat: 62.0, lon: 10.0 },
  Denmark: { lat: 56.0, lon: 10.0 },
  Ireland: { lat: 53.0, lon: -8.0 },
  Portugal: { lat: 39.5, lon: -8.0 },
  'United States': { lat: 38.0, lon: -97.0 },
  Canada: { lat: 56.0, lon: -106.0 },
  Mexico: { lat: 23.0, lon: -102.0 },
  Brazil: { lat: -14.0, lon: -51.0 },
  Argentina: { lat: -38.0, lon: -63.0 },
  Chile: { lat: -35.0, lon: -71.0 },
  Colombia: { lat: 4.0, lon: -72.0 },
  Peru: { lat: -10.0, lon: -76.0 },
  Australia: { lat: -25.0, lon: 134.0 },
  'New Zealand': { lat: -41.0, lon: 174.0 },
  Japan: { lat: 36.0, lon: 138.0 },
  China: { lat: 35.0, lon: 105.0 },
  'South Korea': { lat: 36.0, lon: 128.0 },
  India: { lat: 21.0, lon: 78.0 },
  Indonesia: { lat: -5.0, lon: 120.0 },
  Thailand: { lat: 15.0, lon: 101.0 },
  Vietnam: { lat: 16.0, lon: 108.0 },
  Philippines: { lat: 13.0, lon: 122.0 },
  Malaysia: { lat: 4.0, lon: 109.0 },
  Singapore: { lat: 1.3, lon: 103.8 },
  'South Africa': { lat: -29.0, lon: 24.0 },
  Egypt: { lat: 27.0, lon: 30.0 },
  Morocco: { lat: 32.0, lon: -5.0 },
  Nigeria: { lat: 10.0, lon: 8.0 },
  Kenya: { lat: 0.0, lon: 38.0 },
  'Saudi Arabia': { lat: 24.0, lon: 45.0 },
  'United Arab Emirates': { lat: 24.0, lon: 54.0 },
  Israel: { lat: 31.0, lon: 35.0 },
  Iran: { lat: 32.0, lon: 53.0 },
  Pakistan: { lat: 30.0, lon: 70.0 },
  Bangladesh: { lat: 24.0, lon: 90.0 },
  Taiwan: { lat: 23.5, lon: 121.0 },
  'Hong Kong': { lat: 22.3, lon: 114.2 },
};

export async function GET() {
  try {
    const db = getDb();

    // Pobierz aktywne sesje z ostatnich 30 minut z lokalizacją
    const activeLocations = db
      .prepare(
        `
            SELECT 
                s.session_id,
                s.visitor_id,
                s.site_id,
                s.started_at,
                s.last_activity,
                s.event_count,
                s.device_info,
                CASE 
                    WHEN datetime(s.last_activity) > datetime('now', '-5 minutes') THEN 1
                    ELSE 0
                END as is_active
            FROM sessions s
            WHERE s.device_info IS NOT NULL
            AND datetime(s.started_at) > datetime('now', '-24 hours')
            ORDER BY s.last_activity DESC
            LIMIT 100
        `,
      )
      .all() as Array<{
      session_id: string;
      visitor_id: string;
      site_id: string;
      started_at: string;
      last_activity: string;
      event_count: number;
      device_info: string;
      is_active: number;
    }>;

    // Przetwórz lokalizacje
    const locations = activeLocations
      .map((session) => {
        try {
          const deviceInfo = JSON.parse(session.device_info || '{}');
          const location = deviceInfo.location || {};
          const country = location.country;
          const city = location.city;
          const ip = deviceInfo.ip;

          if (!country) return null;

          const coords = COUNTRY_COORDS[country];
          if (!coords) return null;

          // Dodaj małe losowe przesunięcie żeby pinezki się nie nakładały
          const jitterLat = (Math.random() - 0.5) * 4;
          const jitterLon = (Math.random() - 0.5) * 6;

          return {
            session_id: session.session_id,
            visitor_id: session.visitor_id,
            site_id: session.site_id,
            country,
            city,
            ip: ip ? `${ip.substring(0, 8)}...` : null, // Ukryj część IP
            lat: coords.lat + jitterLat,
            lon: coords.lon + jitterLon,
            is_active: session.is_active === 1,
            event_count: session.event_count,
            started_at: session.started_at,
            last_activity: session.last_activity,
            browser: deviceInfo.browserName,
            platform: deviceInfo.platform,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    // Statystyki
    const totalActive = locations.filter((l) => l?.is_active).length;
    const totalInactive = locations.filter((l) => !l?.is_active).length;

    // Grupuj po krajach
    const countryCounts: Record<string, { active: number; inactive: number }> = {};
    locations.forEach((l) => {
      if (!l) return;
      if (!countryCounts[l.country]) {
        countryCounts[l.country] = { active: 0, inactive: 0 };
      }
      if (l.is_active) {
        countryCounts[l.country].active++;
      } else {
        countryCounts[l.country].inactive++;
      }
    });

    return NextResponse.json({
      locations,
      stats: {
        total: locations.length,
        active: totalActive,
        inactive: totalInactive,
      },
      countries: countryCounts,
    });
  } catch (error) {
    console.error('Error in /api/stats/locations:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
