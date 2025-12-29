import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Endpoint sprawdzający czy nadszedł czas na automatyczne czyszczenie
 * Wywoływany regularnie przez frontend lub cron job
 */
export async function GET() {
  try {
    const db = getDb();

    // Sprawdź ustawienia
    const settings = db
      .prepare(
        `
            SELECT * FROM auto_cleanup_settings WHERE id = 1
        `,
      )
      .get() as
      | {
          enabled: number;
          interval_hours: number;
          min_events: number;
          min_duration_seconds: number;
          no_interaction: number;
          next_run: string | null;
        }
      | undefined;

    if (!settings || settings.enabled !== 1) {
      return NextResponse.json({
        should_run: false,
        reason: 'Auto-cleanup wyłączone',
      });
    }

    // Sprawdź czy nadszedł czas
    if (settings.next_run) {
      const nextRunTime = new Date(settings.next_run).getTime();
      const now = Date.now();

      if (now < nextRunTime) {
        return NextResponse.json({
          should_run: false,
          reason: 'Jeszcze nie czas',
          next_run: settings.next_run,
          time_remaining_ms: nextRunTime - now,
        });
      }
    }

    // Czas na czyszczenie - wykonaj!
    const minEvents = settings.min_events;
    const minDuration = settings.min_duration_seconds;
    const noInteraction = settings.no_interaction === 1;

    const conditions: string[] = [];
    conditions.push(`event_count < ${minEvents}`);
    conditions.push(`(julianday(last_activity) - julianday(started_at)) * 86400 < ${minDuration}`);

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

    // Oblicz następne uruchomienie
    const nextRun = new Date();
    nextRun.setHours(nextRun.getHours() + settings.interval_hours);

    // Aktualizuj statystyki
    db.prepare(
      `
            UPDATE auto_cleanup_settings 
            SET last_run = CURRENT_TIMESTAMP,
                next_run = ?,
                total_runs = total_runs + 1,
                total_deleted = total_deleted + ?
            WHERE id = 1
        `,
    ).run(nextRun.toISOString(), totalDeleted);

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
      should_run: false, // Już uruchomiono
      executed: true,
      deleted: {
        events: deletedEvents,
        sessions: deletedSessions,
        visitors: deletedVisitors,
        total: totalDeleted,
      },
      next_run: nextRun.toISOString(),
      message: `Auto-cleanup wykonano: usunięto ${totalDeleted} rekordów`,
    });
  } catch (error) {
    console.error('Błąd sprawdzania auto-cleanup:', error);
    return NextResponse.json({ error: 'Błąd sprawdzania harmonogramu' }, { status: 500 });
  }
}
