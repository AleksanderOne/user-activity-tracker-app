import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { EventsBreakdown } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const siteId = searchParams.get('site_id');
    const to = searchParams.get('to') || new Date().toISOString();
    let from = searchParams.get('from');

    if (!from) {
      from = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    }

    const db = getDb();

    let query = `
            SELECT event_type, COUNT(*) as count
            FROM events 
            WHERE timestamp >= ? AND timestamp <= ?
        `;
    const params: (string | number)[] = [from, to];

    if (siteId) {
      query += ' AND site_id = ?';
      params.push(siteId);
    }

    query += ' GROUP BY event_type ORDER BY count DESC';

    const events = db.prepare(query).all(...params) as Array<{
      event_type: string;
      count: number;
    }>;

    const diffTime = Math.abs(new Date(to).getTime() - new Date(from).getTime());
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const result: EventsBreakdown = {
      period_days: days,
      events,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in /api/stats/events:', error);
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 },
    );
  }
}
