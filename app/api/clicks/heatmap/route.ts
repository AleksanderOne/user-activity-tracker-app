import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { HeatmapData } from '@/lib/types';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const siteId = searchParams.get('site_id');
        const path = searchParams.get('path');
        const days = parseInt(searchParams.get('days') || '7');

        const db = getDb();

        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

        let query = "SELECT data FROM events WHERE event_type = 'click' AND timestamp > ?";
        const params: any[] = [since];

        if (siteId) {
            query += ' AND site_id = ?';
            params.push(siteId);
        }

        if (path) {
            query += ' AND path = ?';
            params.push(path);
        }

        const rows = db.prepare(query).all(...params) as Array<{ data: string | null }>;

        const clicks: Array<{ x: number; y: number }> = [];
        for (const row of rows) {
            if (row.data) {
                try {
                    const data = JSON.parse(row.data);
                    if (data.x !== undefined && data.y !== undefined) {
                        clicks.push({ x: data.x, y: data.y });
                    }
                } catch (e) {
                    // Ignoruj błędy parsowania
                }
            }
        }

        const result: HeatmapData = {
            path,
            clicks,
        };

        return NextResponse.json(result);
    } catch (error) {
        console.error('Error in /api/clicks/heatmap:', error);
        return NextResponse.json(
            { status: 'error', message: 'Internal server error' },
            { status: 500 }
        );
    }
}
