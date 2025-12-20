import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { OverviewStats } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const siteId = searchParams.get('site_id');

        // Pobierz parametry zakresu czasu
        const to = searchParams.get('to') || new Date().toISOString();
        let from = searchParams.get('from');

        // Domyślnie 1 godzina wstecz, jeśli nie podano 'from'
        if (!from) {
            from = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        }

        const dateFrom = new Date(from);
        const dateTo = new Date(to);
        const duration = dateTo.getTime() - dateFrom.getTime();

        // Oblicz poprzedni okres o tej samej długości dla porównania
        const prevTo = new Date(dateFrom.getTime());
        const prevFrom = new Date(dateFrom.getTime() - duration);

        // Okres w dniach (do wyświetlenia w interfejsie jako info, choć teraz to elastyczne)
        const days = Math.max(1, Math.round(duration / (24 * 60 * 60 * 1000)));

        const db = getDb();

        // Base params for current period
        const paramsMain: (string | number)[] = [from, to];
        // Base params for previous period
        const paramsPrev: (string | number)[] = [prevFrom.toISOString(), prevTo.toISOString()];

        // Base WHERE clause for events table
        let eventsWhereClause = 'WHERE timestamp >= ? AND timestamp <= ?';
        // Base WHERE clause for sessions table
        let sessionsWhereClause = 'WHERE started_at >= ? AND started_at <= ?';

        if (siteId) {
            eventsWhereClause += ' AND site_id = ?';
            paramsMain.push(siteId);
            paramsPrev.push(siteId);
            sessionsWhereClause += ' AND site_id = ?';
        }

        // 1. Zliczenie unikalnych wizyt (visitor_id), sesji (session_id) i pageviews (event_type='pageview')
        // Current Period
        const mainStatsQuery = `
            SELECT 
                COUNT(DISTINCT visitor_id) as unique_visitors,
                COUNT(DISTINCT session_id) as total_sessions,
                COUNT(CASE WHEN event_type = 'pageview' THEN 1 END) as pageviews,
                COUNT(*) as total_events
            FROM events 
            ${eventsWhereClause}
        `;
        const mainStats = db.prepare(mainStatsQuery).get(...paramsMain) as {
            unique_visitors: number;
            total_sessions: number;
            pageviews: number;
            total_events: number;
        };

        // Previous Period (for trends)
        const prevStatsParams = [...paramsPrev];
        if (siteId) {
            prevStatsParams.push(siteId);
        }

        const prevStatsQuery = `
            SELECT 
                COUNT(DISTINCT visitor_id) as unique_visitors,
                COUNT(DISTINCT session_id) as total_sessions,
                COUNT(CASE WHEN event_type = 'pageview' THEN 1 END) as pageviews
            FROM events 
            ${eventsWhereClause}
        `;
        const prevStats = db.prepare(prevStatsQuery).get(...prevStatsParams) as {
            unique_visitors: number;
            total_sessions: number;
            pageviews: number;
        };

        // 2. Średni czas trwania sesji
        const avgDurationSQL = `
            SELECT AVG(sess_duration) as avg_duration FROM (
                SELECT (strftime('%s', MAX(timestamp)) - strftime('%s', MIN(timestamp))) as sess_duration
                FROM events
                ${eventsWhereClause}
                GROUP BY session_id
            )
        `;
        const avgDurationResult = db.prepare(avgDurationSQL).get(...paramsMain) as { avg_duration: number | null };
        const avgSessionDuration = avgDurationResult?.avg_duration || 0;

        // 3. Bounce Rate (Sesje z tylko 1 pageview / total sessions)
        const bounceParams = [...paramsMain];
        const bounceRateSQL = `
            SELECT 
                CAST(COUNT(CASE WHEN pv_count = 1 THEN 1 END) AS FLOAT) / NULLIF(COUNT(*), 0) * 100 as bounce_rate
            FROM (
                SELECT COUNT(*) as pv_count
                FROM events
                ${eventsWhereClause} AND event_type = 'pageview'
                GROUP BY session_id
            )
        `;
        const bounceRateResult = db.prepare(bounceRateSQL).get(...bounceParams) as { bounce_rate: number | null };
        const bounceRate = bounceRateResult?.bounce_rate || 0;

        // 4. Top Pages
        const topPagesQuery = `
            SELECT path, COUNT(*) as views 
            FROM events 
            ${eventsWhereClause} AND event_type = 'pageview'
            GROUP BY path 
            ORDER BY views DESC 
            LIMIT 5
        `;
        const topPages = db.prepare(topPagesQuery).all(...paramsMain) as Array<{ path: string; views: number }>;

        // Parameters for sessions table queries
        const sessionParams: (string | number)[] = [from, to];
        if (siteId) {
            sessionParams.push(siteId);
        }

        // Top Browsers (z tabeli sessions, filtered by started_at between ?)
        const topBrowsersQuery = `
            SELECT 
                json_extract(device_info, '$.browserName') as browser,
                COUNT(*) as count
            FROM sessions
            ${sessionsWhereClause} AND device_info IS NOT NULL
            GROUP BY browser
            ORDER BY count DESC
            LIMIT 5
        `;
        const topBrowsers = db.prepare(topBrowsersQuery).all(...sessionParams) as Array<{ browser: string; count: number }>;

        // Top Referrers - from events.data
        const topReferrersQuery = `
            SELECT 
                json_extract(data, '$.referrer') as referrer,
                COUNT(*) as count
            FROM events
            ${eventsWhereClause} AND event_type = 'pageview'
            AND json_extract(data, '$.referrer') IS NOT NULL
            AND json_extract(data, '$.referrer') != ''
            GROUP BY referrer
            ORDER BY count DESC
            LIMIT 5
        `;
        const topReferrers = db.prepare(topReferrersQuery).all(...paramsMain) as Array<{ referrer: string; count: number }>;

        // Top OS/Platform
        const topPlatformsQuery = `
            SELECT 
                json_extract(device_info, '$.platform') as platform,
                COUNT(*) as count
            FROM sessions
            ${sessionsWhereClause} AND device_info IS NOT NULL
            GROUP BY platform
            ORDER BY count DESC
            LIMIT 5
        `;
        const topPlatforms = db.prepare(topPlatformsQuery).all(...sessionParams) as Array<{ platform: string; count: number }>;

        // Top Screen Sizes
        const topScreenSizesQuery = `
            SELECT 
                CAST(json_extract(device_info, '$.screenWidth') as TEXT) || 'x' || CAST(json_extract(device_info, '$.screenHeight') as TEXT) as size,
                COUNT(*) as count
            FROM sessions
            ${sessionsWhereClause} AND device_info IS NOT NULL AND json_extract(device_info, '$.screenWidth') IS NOT NULL
            GROUP BY size
            ORDER BY count DESC
            LIMIT 5
        `;
        const topScreenSizes = db.prepare(topScreenSizesQuery).all(...sessionParams) as Array<{ size: string; count: number }>;

        // Top Languages
        const topLanguagesQuery = `
            SELECT 
                json_extract(device_info, '$.language') as language,
                COUNT(*) as count
            FROM sessions
            ${sessionsWhereClause} AND device_info IS NOT NULL
            GROUP BY language
            ORDER BY count DESC
            LIMIT 5
        `;
        const topLanguages = db.prepare(topLanguagesQuery).all(...sessionParams) as Array<{ language: string; count: number }>;

        // Top Timezones
        const topTimezonesQuery = `
            SELECT 
                json_extract(device_info, '$.timezone') as timezone,
                COUNT(*) as count
            FROM sessions
            ${sessionsWhereClause} AND device_info IS NOT NULL AND json_extract(device_info, '$.timezone') IS NOT NULL
            GROUP BY timezone
            ORDER BY count DESC
            LIMIT 5
        `;
        const topTimezones = db.prepare(topTimezonesQuery).all(...sessionParams) as Array<{ timezone: string; count: number }>;

        // Top UTM Sources
        const topUtmSourcesQuery = `
            SELECT 
                json_extract(utm_params, '$.utm_source') as source,
                COUNT(*) as count
            FROM sessions
            ${sessionsWhereClause} 
            AND utm_params IS NOT NULL AND json_extract(utm_params, '$.utm_source') IS NOT NULL
            GROUP BY source
            ORDER BY count DESC
            LIMIT 5
        `;
        const topUtmSources = db.prepare(topUtmSourcesQuery).all(...sessionParams) as Array<{ source: string; count: number }>;

        // Top UTM Campaigns
        const topUtmCampaignsQuery = `
            SELECT 
                json_extract(utm_params, '$.utm_campaign') as campaign,
                COUNT(*) as count
            FROM sessions
            ${sessionsWhereClause} 
            AND utm_params IS NOT NULL AND json_extract(utm_params, '$.utm_campaign') IS NOT NULL
            GROUP BY campaign
            ORDER BY count DESC
            LIMIT 5
        `;
        const topUtmCampaigns = db.prepare(topUtmCampaignsQuery).all(...sessionParams) as Array<{ campaign: string; count: number }>;

        const result: OverviewStats = {
            period_days: days,
            unique_visitors: mainStats.unique_visitors,
            total_sessions: mainStats.total_sessions,
            total_events: mainStats.total_events,
            pageviews: mainStats.pageviews,
            avg_session_duration: Math.round(avgSessionDuration),
            bounce_rate: Math.round(bounceRate * 10) / 10,
            top_pages: topPages,
            top_referrers: topReferrers.map(r => ({ ...r, referrer: r.referrer || '(direct)' })),
            top_browsers: topBrowsers.filter(b => b.browser),
            top_platforms: topPlatforms.filter(p => p.platform),
            top_screen_sizes: topScreenSizes,
            top_languages: topLanguages.filter(l => l.language),
            top_timezones: topTimezones.filter(t => t.timezone),
            top_utm_sources: topUtmSources.filter(s => s.source),
            top_utm_campaigns: topUtmCampaigns.filter(c => c.campaign),
            trends: {
                visitors: calculateTrend(mainStats.unique_visitors, prevStats.unique_visitors),
                sessions: calculateTrend(mainStats.total_sessions, prevStats.total_sessions),
                pageviews: calculateTrend(mainStats.pageviews, prevStats.pageviews),
                duration: calculateTrend(avgSessionDuration, 0),
                bounce_rate: calculateTrend(bounceRate, 0)
            }
        };

        return NextResponse.json(result);
    } catch (error) {
        console.error('Error in /api/stats/overview:', error);
        return NextResponse.json(
            { status: 'error', message: 'Internal server error' },
            { status: 500 }
        );
    }
}

function calculateTrend(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
}
