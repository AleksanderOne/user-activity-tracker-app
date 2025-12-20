import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

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

export async function GET() {
    try {
        const db = getDb();

        // 1. Pobierz statystyki dla każdej strony (site_id)
        const sitesQuery = db.prepare(`
            SELECT 
                s.site_id,
                MAX(json_extract(e.data, '$.hostname')) as hostname,
                COUNT(DISTINCT e.id) as event_count,
                COUNT(DISTINCT s.session_id) as session_count,
                COUNT(DISTINCT s.visitor_id) as visitor_count,
                MAX(s.last_activity) as last_activity
            FROM sessions s
            LEFT JOIN events e ON s.session_id = e.session_id AND e.event_type = 'pageview'
            WHERE datetime(s.started_at) > datetime('now', '-24 hours')
            GROUP BY s.site_id
            ORDER BY event_count DESC
            LIMIT 20
        `).all() as Array<{
            site_id: string;
            hostname: string | null;
            event_count: number;
            session_count: number;
            visitor_count: number;
            last_activity: string;
        }>;

        // Dla każdej strony pobierz dodatkowe dane
        const sites: SiteStats[] = await Promise.all(sitesQuery.map(async (site) => {
            // Aktywni teraz (ostatnie 5 minut)
            const activeNow = db.prepare(`
                SELECT COUNT(DISTINCT session_id) as count
                FROM sessions
                WHERE site_id = ?
                AND datetime(last_activity) > datetime('now', '-5 minutes')
            `).get(site.site_id) as { count: number };

            // Top kraje dla tej strony
            const topCountries = db.prepare(`
                SELECT 
                    json_extract(device_info, '$.location.country') as country,
                    COUNT(*) as count
                FROM sessions
                WHERE site_id = ?
                AND device_info IS NOT NULL
                AND json_extract(device_info, '$.location.country') IS NOT NULL
                AND datetime(started_at) > datetime('now', '-24 hours')
                GROUP BY country
                ORDER BY count DESC
                LIMIT 5
            `).all(site.site_id) as Array<{ country: string; count: number }>;

            // Top przeglądarki dla tej strony
            const topBrowsers = db.prepare(`
                SELECT 
                    json_extract(device_info, '$.browserName') as browser,
                    COUNT(*) as count
                FROM sessions
                WHERE site_id = ?
                AND device_info IS NOT NULL
                AND json_extract(device_info, '$.browserName') IS NOT NULL
                AND datetime(started_at) > datetime('now', '-24 hours')
                GROUP BY browser
                ORDER BY count DESC
                LIMIT 5
            `).all(site.site_id) as Array<{ browser: string; count: number }>;

            // Top platformy dla tej strony
            const topPlatforms = db.prepare(`
                SELECT 
                    json_extract(device_info, '$.platform') as platform,
                    COUNT(*) as count
                FROM sessions
                WHERE site_id = ?
                AND device_info IS NOT NULL
                AND json_extract(device_info, '$.platform') IS NOT NULL
                AND datetime(started_at) > datetime('now', '-24 hours')
                GROUP BY platform
                ORDER BY count DESC
                LIMIT 5
            `).all(site.site_id) as Array<{ platform: string; count: number }>;

            // Bounce rate (sesje z tylko 1 pageview)
            const bounceData = db.prepare(`
                SELECT 
                    CAST(COUNT(CASE WHEN pv_count = 1 THEN 1 END) AS FLOAT) / NULLIF(COUNT(*), 0) * 100 as bounce_rate
                FROM (
                    SELECT COUNT(*) as pv_count
                    FROM events
                    WHERE site_id = ? AND event_type = 'pageview'
                    AND datetime(timestamp) > datetime('now', '-24 hours')
                    GROUP BY session_id
                )
            `).get(site.site_id) as { bounce_rate: number | null };

            // Średni czas sesji
            const avgDuration = db.prepare(`
                SELECT AVG(duration) as avg_duration FROM (
                    SELECT (strftime('%s', MAX(timestamp)) - strftime('%s', MIN(timestamp))) as duration
                    FROM events
                    WHERE site_id = ?
                    AND datetime(timestamp) > datetime('now', '-24 hours')
                    GROUP BY session_id
                )
            `).get(site.site_id) as { avg_duration: number | null };

            return {
                site_id: site.site_id,
                hostname: site.hostname,
                event_count: site.event_count,
                session_count: site.session_count,
                visitor_count: site.visitor_count,
                active_now: activeNow?.count || 0,
                top_countries: topCountries.filter(c => c.country),
                top_browsers: topBrowsers.filter(b => b.browser),
                top_platforms: topPlatforms.filter(p => p.platform),
                last_activity: site.last_activity,
                bounce_rate: bounceData?.bounce_rate || 0,
                avg_session_duration: avgDuration?.avg_duration || 0,
            };
        }));

        // 2. Pobierz statystyki per kraj
        const countriesQuery = db.prepare(`
            SELECT 
                json_extract(device_info, '$.location.country') as country,
                COUNT(DISTINCT session_id) as sessions,
                COUNT(DISTINCT visitor_id) as visitors
            FROM sessions
            WHERE device_info IS NOT NULL
            AND json_extract(device_info, '$.location.country') IS NOT NULL
            AND datetime(started_at) > datetime('now', '-24 hours')
            GROUP BY country
            ORDER BY sessions DESC
            LIMIT 15
        `).all() as Array<{
            country: string;
            sessions: number;
            visitors: number;
        }>;

        // Dla każdego kraju pobierz dodatkowe dane
        const countries: CountryStats[] = await Promise.all(countriesQuery.map(async (c) => {
            // Liczba eventów
            const eventsCount = db.prepare(`
                SELECT COUNT(*) as count
                FROM events e
                JOIN sessions s ON e.session_id = s.session_id
                WHERE json_extract(s.device_info, '$.location.country') = ?
                AND datetime(e.timestamp) > datetime('now', '-24 hours')
            `).get(c.country) as { count: number };

            // Aktywni teraz
            const activeNow = db.prepare(`
                SELECT COUNT(DISTINCT session_id) as count
                FROM sessions
                WHERE json_extract(device_info, '$.location.country') = ?
                AND datetime(last_activity) > datetime('now', '-5 minutes')
            `).get(c.country) as { count: number };

            // Top miasta
            const topCities = db.prepare(`
                SELECT 
                    json_extract(device_info, '$.location.city') as city,
                    COUNT(*) as count
                FROM sessions
                WHERE json_extract(device_info, '$.location.country') = ?
                AND device_info IS NOT NULL
                AND datetime(started_at) > datetime('now', '-24 hours')
                GROUP BY city
                ORDER BY count DESC
                LIMIT 8
            `).all(c.country) as Array<{ city: string | null; count: number }>;

            return {
                country: c.country,
                sessions: c.sessions,
                visitors: c.visitors,
                events: eventsCount?.count || 0,
                active: activeNow?.count || 0,
                top_cities: topCities.map(city => ({
                    city: city.city || 'Nieznane',
                    count: city.count
                })),
            };
        }));

        // 3. Globalne statystyki
        const totalActive = db.prepare(`
            SELECT COUNT(DISTINCT session_id) as count
            FROM sessions
            WHERE datetime(last_activity) > datetime('now', '-5 minutes')
        `).get() as { count: number };

        const totalSessions24h = db.prepare(`
            SELECT COUNT(DISTINCT session_id) as count
            FROM sessions
            WHERE datetime(started_at) > datetime('now', '-24 hours')
        `).get() as { count: number };

        const totalCountries = db.prepare(`
            SELECT COUNT(DISTINCT json_extract(device_info, '$.location.country')) as count
            FROM sessions
            WHERE device_info IS NOT NULL
            AND json_extract(device_info, '$.location.country') IS NOT NULL
            AND datetime(started_at) > datetime('now', '-24 hours')
        `).get() as { count: number };

        return NextResponse.json({
            sites,
            countries,
            total_active: totalActive?.count || 0,
            total_sessions_24h: totalSessions24h?.count || 0,
            total_countries: totalCountries?.count || 0,
        });
    } catch (error) {
        console.error('Error in /api/stats/locations/panel:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

