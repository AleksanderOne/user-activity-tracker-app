import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { TimelineData } from '@/lib/types';

export const dynamic = 'force-dynamic';

// Dozwolone wartości granularności
const ALLOWED_GRANULARITIES = ['minute', 'hour', 'day'] as const;
type Granularity = typeof ALLOWED_GRANULARITIES[number];

function isValidGranularity(value: string): value is Granularity {
    return ALLOWED_GRANULARITIES.includes(value as Granularity);
}

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const siteId = searchParams.get('site_id');
        const to = searchParams.get('to') || new Date().toISOString();
        let from = searchParams.get('from');

        if (!from) {
            from = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        }

        let granularityParam = searchParams.get('granularity');

        // Auto granularność - bezpiecznie oblicz na podstawie różnicy czasowej
        let granularity: Granularity;

        if (granularityParam && isValidGranularity(granularityParam)) {
            granularity = granularityParam;
        } else {
            const diff = new Date(to).getTime() - new Date(from).getTime();
            if (diff <= 70 * 60 * 1000) {
                granularity = 'minute'; // <= 70 min -> minute
            } else if (diff <= 48 * 60 * 60 * 1000) {
                granularity = 'hour'; // <= 48h -> hour
            } else {
                granularity = 'day';
            }
        }

        const db = getDb();

        // Mapowanie granularności na format SQLite strftime
        const timeFormatMap: Record<Granularity, string> = {
            minute: '%Y-%m-%dT%H:%M:00',
            hour: '%Y-%m-%dT%H:00:00',
            day: '%Y-%m-%d',
        };

        const timeFormat = timeFormatMap[granularity];

        let query = `
            SELECT 
                strftime('${timeFormat}', timestamp) as date,
                COUNT(DISTINCT visitor_id) as visitors,
                COUNT(CASE WHEN event_type = 'pageview' THEN 1 END) as pageviews
            FROM events 
            WHERE timestamp >= ? AND timestamp <= ?
        `;
        const params: (string | number)[] = [from, to];

        if (siteId) {
            query += ' AND site_id = ?';
            params.push(siteId);
        }

        query += ' GROUP BY date ORDER BY date';

        const data = db.prepare(query).all(...params) as Array<{
            date: string;
            visitors: number;
            pageviews: number;
        }>;

        const result: TimelineData = {
            granularity,
            data,
        };

        return NextResponse.json(result);
    } catch (error) {
        console.error('Error in /api/stats/timeline:', error);
        return NextResponse.json(
            { status: 'error', message: 'Internal server error' },
            { status: 500 }
        );
    }
}
