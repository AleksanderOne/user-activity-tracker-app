import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Interfejs dla statystyk stron
interface SiteStats {
  site_id: string;
  origin: string | null;
  total_requests: number;
  success_count: number;
  error_count: number;
  last_seen: string;
  first_seen: string;
  avg_duration_ms: number;
  total_events: number;
  is_connected: boolean;
}

// Interfejs dla pojedynczego logu
interface LogEntry {
  id: string;
  timestamp: string;
  site_id: string;
  origin: string | null;
  ip: string;
  method: string;
  endpoint: string;
  status_code: number;
  request_size: number;
  response_size: number;
  duration_ms: number;
  events_count: number;
  error_message: string | null;
  user_agent: string | null;
  session_id: string | null;
  visitor_id: string | null;
}

/**
 * GET /api/logs - Pobierz logi komunikacji
 * Query params:
 *   - site_id: Filtruj po ID strony
 *   - status: 'success' | 'error' | 'all'
 *   - from: Data początkowa (ISO)
 *   - to: Data końcowa (ISO)
 *   - limit: Maksymalna liczba wyników
 *   - offset: Przesunięcie dla paginacji
 */
export async function GET(request: NextRequest) {
  try {
    // Weryfikacja autoryzacji
    const authToken = request.cookies.get('dashboard_token')?.value;
    if (!authToken || !verifyToken(authToken)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('site_id');
    const status = searchParams.get('status') || 'all';
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);
    const offset = parseInt(searchParams.get('offset') || '0');

    const db = getDb();

    // Buduj zapytanie z filtrami
    let whereClause = '1=1';
    const params: (string | number)[] = [];

    if (siteId) {
      whereClause += ' AND site_id = ?';
      params.push(siteId);
    }

    if (status === 'success') {
      whereClause += ' AND status_code >= 200 AND status_code < 300';
    } else if (status === 'error') {
      whereClause += ' AND (status_code < 200 OR status_code >= 300)';
    }

    if (from) {
      whereClause += ' AND timestamp >= ?';
      params.push(from);
    }

    if (to) {
      whereClause += ' AND timestamp <= ?';
      params.push(to);
    }

    // Pobierz logi
    const logs = db
      .prepare(
        `
            SELECT * FROM communication_logs
            WHERE ${whereClause}
            ORDER BY timestamp DESC
            LIMIT ? OFFSET ?
        `,
      )
      .all(...params, limit, offset) as LogEntry[];

    // Pobierz łączną liczbę
    const countResult = db
      .prepare(
        `
            SELECT COUNT(*) as total FROM communication_logs
            WHERE ${whereClause}
        `,
      )
      .get(...params) as { total: number };

    // Pobierz statystyki dla wszystkich stron
    const siteStats = db
      .prepare(
        `
            SELECT 
                site_id,
                MAX(origin) as origin,
                COUNT(*) as total_requests,
                SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END) as success_count,
                SUM(CASE WHEN status_code < 200 OR status_code >= 300 THEN 1 ELSE 0 END) as error_count,
                MAX(timestamp) as last_seen,
                MIN(timestamp) as first_seen,
                AVG(duration_ms) as avg_duration_ms,
                SUM(events_count) as total_events
            FROM communication_logs
            GROUP BY site_id
            ORDER BY last_seen DESC
        `,
      )
      .all() as (Omit<SiteStats, 'is_connected'> & { last_seen: string })[];

    // Sprawdź które strony są aktywne (aktywność w ciągu ostatnich 5 minut)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const statsWithConnection: SiteStats[] = siteStats.map((s) => ({
      ...s,
      is_connected: s.last_seen >= fiveMinutesAgo,
    }));

    return NextResponse.json({
      logs,
      total: countResult.total,
      limit,
      offset,
      sites: statsWithConnection,
    });
  } catch (error) {
    console.error('[API/logs] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * DELETE /api/logs - Wyczyść stare logi
 * Query params:
 *   - before: Usuń logi starsze niż ta data (ISO)
 *   - site_id: Opcjonalnie tylko dla konkretnej strony
 */
export async function DELETE(request: NextRequest) {
  try {
    // Weryfikacja autoryzacji
    const authToken = request.cookies.get('dashboard_token')?.value;
    if (!authToken || !verifyToken(authToken)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const before = searchParams.get('before');
    const siteId = searchParams.get('site_id');

    if (!before) {
      return NextResponse.json({ error: 'Missing "before" parameter' }, { status: 400 });
    }

    const db = getDb();

    let sql = 'DELETE FROM communication_logs WHERE timestamp < ?';
    const params: string[] = [before];

    if (siteId) {
      sql += ' AND site_id = ?';
      params.push(siteId);
    }

    const result = db.prepare(sql).run(...params);

    return NextResponse.json({
      success: true,
      deleted: result.changes,
    });
  } catch (error) {
    console.error('[API/logs] Delete error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
