import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { RealtimeStats } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const siteId = searchParams.get('site_id');

        const db = getDb();

        // Ostatnie 5 minut
        const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();

        let query = `
            SELECT 
                COUNT(DISTINCT visitor_id) as active_visitors,
                COUNT(DISTINCT session_id) as active_sessions
            FROM events 
            WHERE timestamp > ?
        `;
        const params: (string | number)[] = [since];

        if (siteId) {
            query += ' AND site_id = ?';
            params.push(siteId);
        }

        const mainStats = db.prepare(query).get(...params) as {
            active_visitors: number;
            active_sessions: number;
        };

        // Aktywne strony
        let activePagesQuery = `
            SELECT path, COUNT(DISTINCT session_id) as sessions
            FROM events 
            WHERE timestamp > ?
        `;
        const activePagesParams: (string | number)[] = [since];

        if (siteId) {
            activePagesQuery += ' AND site_id = ?';
            activePagesParams.push(siteId);
        }

        activePagesQuery += ' GROUP BY path ORDER BY sessions DESC LIMIT 5';

        const activePages = db.prepare(activePagesQuery).all(...activePagesParams) as Array<{
            path: string;
            sessions: number;
        }>;

        const result: RealtimeStats = {
            active_visitors: mainStats.active_visitors,
            active_sessions: mainStats.active_sessions,
            active_pages: activePages,
        };

        return NextResponse.json(result);
    } catch (error) {
        console.error('Error in /api/stats/realtime:', error);
        return NextResponse.json(
            { status: 'error', message: 'Internal server error' },
            { status: 500 }
        );
    }
}
