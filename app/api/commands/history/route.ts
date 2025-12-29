import { NextRequest, NextResponse } from 'next/server';
import { getDb, RemoteCommand } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

/**
 * GET /api/commands/history
 * Pobiera historię komend (do wyświetlenia w dashboardzie)
 * Wymaga autoryzacji
 *
 * Query params:
 * - site_id: Filtruj po stronie (opcjonalne)
 * - limit: Limit wyników (domyślnie 100)
 * - offset: Offset dla paginacji (domyślnie 0)
 * - executed: Filtruj po statusie wykonania ('true', 'false', 'all')
 */
export async function GET(request: NextRequest) {
  try {
    // Sprawdź autoryzację - używamy tokenu JWT z cookie dashboard_token
    const authToken = request.cookies.get('dashboard_token')?.value;
    if (!authToken || !verifyToken(authToken)) {
      return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('site_id');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');
    const executedFilter = searchParams.get('executed') || 'all';

    const db = getDb();

    // Buduj zapytanie dynamicznie
    let query = 'SELECT * FROM remote_commands WHERE 1=1';
    const params: (string | number)[] = [];

    if (siteId) {
      query += ' AND site_id = ?';
      params.push(siteId);
    }

    if (executedFilter === 'true') {
      query += ' AND executed = 1';
    } else if (executedFilter === 'false') {
      query += ' AND executed = 0';
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const commands = db.prepare(query).all(...params) as RemoteCommand[];

    // Pobierz też statystyki
    const statsQuery = siteId
      ? db
          .prepare(
            `
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN executed = 1 THEN 1 ELSE 0 END) as executed,
                    SUM(CASE WHEN executed = 0 THEN 1 ELSE 0 END) as pending
                FROM remote_commands
                WHERE site_id = ?
            `,
          )
          .get(siteId)
      : db
          .prepare(
            `
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN executed = 1 THEN 1 ELSE 0 END) as executed,
                    SUM(CASE WHEN executed = 0 THEN 1 ELSE 0 END) as pending
                FROM remote_commands
            `,
          )
          .get();

    const stats = statsQuery as { total: number; executed: number; pending: number };

    // Pobierz listę unikalnych site_id
    const sites = db
      .prepare(
        `
            SELECT DISTINCT site_id FROM remote_commands ORDER BY site_id
        `,
      )
      .all() as { site_id: string }[];

    return NextResponse.json({
      commands: commands.map((cmd) => ({
        ...cmd,
        payload: JSON.parse(cmd.payload || '{}'),
        executed: Boolean(cmd.executed),
      })),
      stats,
      sites: sites.map((s) => s.site_id),
      pagination: {
        limit,
        offset,
        hasMore: commands.length === limit,
      },
    });
  } catch (error) {
    console.error('Błąd pobierania historii komend:', error);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}
