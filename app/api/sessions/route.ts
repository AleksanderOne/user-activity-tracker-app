import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { SessionsList, SessionDetails, ExtendedDeviceInfo } from '@/lib/types';
import { isAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const siteId = searchParams.get('site_id');
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')));
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0'));

    const to = searchParams.get('to') || new Date().toISOString();
    let from = searchParams.get('from');

    // Domyślnie 24h jeśli nie podano
    if (!from) {
      from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    }

    const db = getDb();

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    conditions.push('started_at >= ?');
    params.push(from);

    conditions.push('started_at <= ?');
    params.push(to);

    if (siteId) {
      conditions.push('site_id = ?');
      params.push(siteId);
    }

    let query = 'SELECT * FROM sessions';
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY last_activity DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = db.prepare(query).all(...params) as Array<{
      session_id: string;
      visitor_id: string;
      site_id: string;
      started_at: string;
      last_activity: string;
      page_count: number;
      event_count: number;
      device_info: string | null;
      utm_params: string | null;
    }>;

    const sessions: SessionDetails[] = rows.map((row) => {
      let deviceInfo: ExtendedDeviceInfo | null = null;
      let utmParams: Record<string, string> | null = null;

      try {
        deviceInfo = row.device_info ? JSON.parse(row.device_info) : null;
      } catch {
        deviceInfo = null;
      }

      try {
        utmParams = row.utm_params ? JSON.parse(row.utm_params) : null;
      } catch {
        utmParams = null;
      }

      return {
        session_id: row.session_id,
        visitor_id: row.visitor_id,
        site_id: row.site_id,
        started_at: row.started_at,
        last_activity: row.last_activity,
        page_count: row.page_count,
        event_count: row.event_count,
        device_info: deviceInfo,
        utm_params: utmParams,
      };
    });

    const result: SessionsList = {
      sessions,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in /api/sessions:', error);
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 },
    );
  }
}
