import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Interfejs ustawień automatycznego czyszczenia
interface AutoCleanupSettings {
  enabled: boolean;
  interval_hours: number;
  min_events: number;
  min_duration_seconds: number;
  no_interaction: boolean;
  last_run: string | null;
  next_run: string | null;
  total_runs: number;
  total_deleted: number;
}

// GET - pobierz ustawienia
export async function GET() {
  try {
    const db = getDb();

    // Utwórz tabelę jeśli nie istnieje
    db.exec(`
            CREATE TABLE IF NOT EXISTS auto_cleanup_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                enabled INTEGER DEFAULT 0,
                interval_hours INTEGER DEFAULT 24,
                min_events INTEGER DEFAULT 2,
                min_duration_seconds INTEGER DEFAULT 5,
                no_interaction INTEGER DEFAULT 1,
                last_run TEXT,
                next_run TEXT,
                total_runs INTEGER DEFAULT 0,
                total_deleted INTEGER DEFAULT 0,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

    // Wstaw domyślne ustawienia jeśli nie istnieją
    db.exec(`
            INSERT OR IGNORE INTO auto_cleanup_settings (id, enabled, interval_hours, min_events, min_duration_seconds, no_interaction)
            VALUES (1, 0, 24, 2, 5, 1)
        `);

    const settings = db
      .prepare(
        `
            SELECT * FROM auto_cleanup_settings WHERE id = 1
        `,
      )
      .get() as {
      enabled: number;
      interval_hours: number;
      min_events: number;
      min_duration_seconds: number;
      no_interaction: number;
      last_run: string | null;
      next_run: string | null;
      total_runs: number;
      total_deleted: number;
    };

    // Pobierz historię automatycznych czyszczeń
    const history = db
      .prepare(
        `
            SELECT timestamp, total_deleted, message
            FROM cleanup_history
            WHERE mode = 'smart' AND filters LIKE '%"auto":true%'
            ORDER BY timestamp DESC
            LIMIT 10
        `,
      )
      .all() as Array<{
      timestamp: string;
      total_deleted: number;
      message: string | null;
    }>;

    return NextResponse.json({
      settings: {
        enabled: settings.enabled === 1,
        interval_hours: settings.interval_hours,
        min_events: settings.min_events,
        min_duration_seconds: settings.min_duration_seconds,
        no_interaction: settings.no_interaction === 1,
        last_run: settings.last_run,
        next_run: settings.next_run,
        total_runs: settings.total_runs,
        total_deleted: settings.total_deleted,
      } as AutoCleanupSettings,
      history,
    });
  } catch (error) {
    console.error('Błąd pobierania ustawień auto-cleanup:', error);
    return NextResponse.json({ error: 'Błąd pobierania ustawień' }, { status: 500 });
  }
}

// POST - zapisz ustawienia
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { enabled, interval_hours, min_events, min_duration_seconds, no_interaction } = body;

    const db = getDb();

    // Utwórz tabelę jeśli nie istnieje
    db.exec(`
            CREATE TABLE IF NOT EXISTS auto_cleanup_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                enabled INTEGER DEFAULT 0,
                interval_hours INTEGER DEFAULT 24,
                min_events INTEGER DEFAULT 2,
                min_duration_seconds INTEGER DEFAULT 5,
                no_interaction INTEGER DEFAULT 1,
                last_run TEXT,
                next_run TEXT,
                total_runs INTEGER DEFAULT 0,
                total_deleted INTEGER DEFAULT 0,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

    // Oblicz następne uruchomienie
    let next_run: string | null = null;
    if (enabled) {
      const nextDate = new Date();
      nextDate.setHours(nextDate.getHours() + (interval_hours || 24));
      next_run = nextDate.toISOString();
    }

    // Zapisz ustawienia
    db.prepare(
      `
            INSERT INTO auto_cleanup_settings (id, enabled, interval_hours, min_events, min_duration_seconds, no_interaction, next_run, updated_at)
            VALUES (1, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                enabled = excluded.enabled,
                interval_hours = excluded.interval_hours,
                min_events = excluded.min_events,
                min_duration_seconds = excluded.min_duration_seconds,
                no_interaction = excluded.no_interaction,
                next_run = excluded.next_run,
                updated_at = CURRENT_TIMESTAMP
        `,
    ).run(
      enabled ? 1 : 0,
      interval_hours || 24,
      min_events ?? 2,
      min_duration_seconds ?? 5,
      no_interaction ? 1 : 0,
      next_run,
    );

    return NextResponse.json({
      success: true,
      message: enabled ? 'Automatyczne czyszczenie włączone' : 'Automatyczne czyszczenie wyłączone',
      next_run,
    });
  } catch (error) {
    console.error('Błąd zapisywania ustawień auto-cleanup:', error);
    return NextResponse.json({ error: 'Błąd zapisywania ustawień' }, { status: 500 });
  }
}

// DELETE - uruchom natychmiast (trigger manual)
export async function DELETE() {
  try {
    const db = getDb();

    // Pobierz ustawienia
    const settings = db
      .prepare(
        `
            SELECT * FROM auto_cleanup_settings WHERE id = 1
        `,
      )
      .get() as
      | {
          min_events: number;
          min_duration_seconds: number;
          no_interaction: number;
        }
      | undefined;

    if (!settings) {
      return NextResponse.json({ error: 'Brak ustawień' }, { status: 400 });
    }

    // Wykonaj czyszczenie
    const minEvents = settings.min_events;
    const minDuration = settings.min_duration_seconds;
    const noInteraction = settings.no_interaction === 1;

    // Warunki do usuwania sesji
    const conditions: string[] = [];

    // Sesje z małą ilością eventów
    conditions.push(`event_count < ${minEvents}`);

    // Sesje krótkie
    conditions.push(`(julianday(last_activity) - julianday(started_at)) * 86400 < ${minDuration}`);

    // Sesje bez interakcji
    if (noInteraction) {
      conditions.push(`session_id IN (
                SELECT s.session_id FROM sessions s
                WHERE NOT EXISTS (
                    SELECT 1 FROM events e 
                    WHERE e.session_id = s.session_id 
                    AND e.event_type IN ('click', 'form_submit', 'form_start', 'input_sequence', 'rage_click')
                )
            )`);
    }

    const smartWhere = conditions.length > 0 ? `WHERE (${conditions.join(' OR ')})` : '';

    // Wykonaj usuwanie
    const deletedEvents = db
      .prepare(
        `
            DELETE FROM events 
            WHERE session_id IN (SELECT session_id FROM sessions ${smartWhere})
        `,
      )
      .run().changes;

    const deletedSessions = db.prepare(`DELETE FROM sessions ${smartWhere}`).run().changes;

    const deletedVisitors = db
      .prepare(
        `
            DELETE FROM visitors 
            WHERE visitor_id NOT IN (SELECT DISTINCT visitor_id FROM sessions)
        `,
      )
      .run().changes;

    const totalDeleted = deletedEvents + deletedSessions + deletedVisitors;

    // Aktualizuj statystyki
    db.prepare(
      `
            UPDATE auto_cleanup_settings 
            SET last_run = CURRENT_TIMESTAMP,
                next_run = datetime('now', '+' || interval_hours || ' hours'),
                total_runs = total_runs + 1,
                total_deleted = total_deleted + ?
            WHERE id = 1
        `,
    ).run(totalDeleted);

    // Zapisz do historii
    db.prepare(
      `
            INSERT INTO cleanup_history (
                timestamp, mode, dry_run,
                events_deleted, sessions_deleted, visitors_deleted,
                communication_logs_deleted, form_submissions_deleted, uploaded_files_deleted,
                total_deleted, filters, message
            ) VALUES (CURRENT_TIMESTAMP, 'smart', 0, ?, ?, ?, 0, 0, 0, ?, ?, ?)
        `,
    ).run(
      deletedEvents,
      deletedSessions,
      deletedVisitors,
      totalDeleted,
      JSON.stringify({ auto: true, minEvents, minDuration, noInteraction }),
      `Auto-cleanup: usunięto ${totalDeleted} rekordów`,
    );

    return NextResponse.json({
      success: true,
      deleted: {
        events: deletedEvents,
        sessions: deletedSessions,
        visitors: deletedVisitors,
        total: totalDeleted,
      },
      message: `Usunięto ${totalDeleted} rekordów`,
    });
  } catch (error) {
    console.error('Błąd wykonywania auto-cleanup:', error);
    return NextResponse.json({ error: 'Błąd wykonywania czyszczenia' }, { status: 500 });
  }
}
