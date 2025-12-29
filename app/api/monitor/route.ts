import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Status strony na podstawie ostatniej aktywności
type SiteStatus = 'online' | 'idle' | 'offline';

// Interfejs dla monitorowanej strony
interface MonitoredSite {
  site_id: string;
  origin: string | null;
  status: SiteStatus;
  status_label: string;
  last_event_at: string | null;
  last_log_at: string | null;
  last_activity: string | null;
  active_sessions: number;
  events_last_5min: number;
  events_last_hour: number;
  total_events_today: number;
  errors_last_hour: number;
  avg_response_time: number;
  recent_events: Array<{
    event_type: string;
    timestamp: string;
    page_path: string | null;
  }>;
}

// Interfejs dla podsumowania monitoringu
interface MonitorSummary {
  total_sites: number;
  online_count: number;
  idle_count: number;
  offline_count: number;
  total_active_sessions: number;
  total_events_5min: number;
}

/**
 * Określa status strony na podstawie ostatniej aktywności
 * - online: aktywność w ciągu ostatnich 2 minut
 * - idle (czeka): aktywność w ciągu 2-10 minut
 * - offline (wyłączona): brak aktywności powyżej 10 minut
 */
function getSiteStatus(lastActivityTimestamp: string | null): {
  status: SiteStatus;
  label: string;
} {
  if (!lastActivityTimestamp) {
    return { status: 'offline', label: 'Wyłączona' };
  }

  const lastActivity = new Date(lastActivityTimestamp).getTime();
  const now = Date.now();
  const diffMinutes = (now - lastActivity) / (1000 * 60);

  if (diffMinutes <= 2) {
    return { status: 'online', label: 'Online' };
  } else if (diffMinutes <= 10) {
    return { status: 'idle', label: 'Czeka' };
  } else {
    return { status: 'offline', label: 'Wyłączona' };
  }
}

/**
 * GET /api/monitor - Pobierz status wszystkich monitorowanych stron
 * Query params:
 *   - site_ids: Lista ID stron do monitorowania (rozdzielone przecinkami) - jeśli puste, zwraca wszystkie
 */
export async function GET(request: NextRequest) {
  try {
    // Weryfikacja autoryzacji
    const authToken = request.cookies.get('dashboard_token')?.value;
    if (!authToken || !verifyToken(authToken)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteIdsParam = searchParams.get('site_ids');
    const siteIds = siteIdsParam
      ? siteIdsParam
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const db = getDb();
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    // Pobierz wszystkie unikalne strony (z eventów i logów)
    const allSitesQuery = `
            SELECT DISTINCT site_id FROM (
                SELECT DISTINCT site_id FROM events
                UNION
                SELECT DISTINCT site_id FROM communication_logs
            )
            ORDER BY site_id
        `;
    const allSites = db.prepare(allSitesQuery).all() as { site_id: string }[];

    // Filtruj jeśli podano konkretne site_ids
    const sitesToMonitor =
      siteIds.length > 0 ? allSites.filter((s) => siteIds.includes(s.site_id)) : allSites;

    const monitoredSites: MonitoredSite[] = [];

    for (const site of sitesToMonitor) {
      const siteId = site.site_id;

      // Ostatni event
      const lastEventResult = db
        .prepare(
          `
                SELECT MAX(timestamp) as last_event_at
                FROM events WHERE site_id = ?
            `,
        )
        .get(siteId) as { last_event_at: string | null };

      // Ostatni log komunikacji
      const lastLogResult = db
        .prepare(
          `
                SELECT MAX(timestamp) as last_log_at
                FROM communication_logs WHERE site_id = ?
            `,
        )
        .get(siteId) as { last_log_at: string | null };

      // Określ ostatnią aktywność (nowsza z dwóch)
      const lastActivity =
        [lastEventResult.last_event_at, lastLogResult.last_log_at]
          .filter(Boolean)
          .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0] || null;

      // Status strony
      const { status, label } = getSiteStatus(lastActivity);

      // Aktywne sesje (w ostatnich 5 min)
      const activeSessionsResult = db
        .prepare(
          `
                SELECT COUNT(DISTINCT session_id) as count
                FROM events 
                WHERE site_id = ? AND timestamp > ?
            `,
        )
        .get(siteId, fiveMinutesAgo) as { count: number };

      // Eventy w ostatnich 5 min
      const events5minResult = db
        .prepare(
          `
                SELECT COUNT(*) as count
                FROM events 
                WHERE site_id = ? AND timestamp > ?
            `,
        )
        .get(siteId, fiveMinutesAgo) as { count: number };

      // Eventy w ostatniej godzinie
      const eventsHourResult = db
        .prepare(
          `
                SELECT COUNT(*) as count
                FROM events 
                WHERE site_id = ? AND timestamp > ?
            `,
        )
        .get(siteId, oneHourAgo) as { count: number };

      // Eventy dzisiaj
      const eventsTodayResult = db
        .prepare(
          `
                SELECT COUNT(*) as count
                FROM events 
                WHERE site_id = ? AND timestamp > ?
            `,
        )
        .get(siteId, todayStart) as { count: number };

      // Błędy w ostatniej godzinie
      const errorsHourResult = db
        .prepare(
          `
                SELECT COUNT(*) as count
                FROM communication_logs 
                WHERE site_id = ? AND timestamp > ? AND (status_code < 200 OR status_code >= 300)
            `,
        )
        .get(siteId, oneHourAgo) as { count: number };

      // Średni czas odpowiedzi (ostatnia godzina)
      const avgResponseResult = db
        .prepare(
          `
                SELECT AVG(duration_ms) as avg_ms
                FROM communication_logs 
                WHERE site_id = ? AND timestamp > ?
            `,
        )
        .get(siteId, oneHourAgo) as { avg_ms: number | null };

      // Ostatnie origin z logów
      const originResult = db
        .prepare(
          `
                SELECT origin FROM communication_logs
                WHERE site_id = ? AND origin IS NOT NULL
                ORDER BY timestamp DESC LIMIT 1
            `,
        )
        .get(siteId) as { origin: string } | undefined;

      // Ostatnie 5 eventów
      const recentEvents = db
        .prepare(
          `
                SELECT event_type, timestamp, path as page_path
                FROM events
                WHERE site_id = ?
                ORDER BY timestamp DESC
                LIMIT 5
            `,
        )
        .all(siteId) as Array<{ event_type: string; timestamp: string; page_path: string | null }>;

      monitoredSites.push({
        site_id: siteId,
        origin: originResult?.origin || null,
        status,
        status_label: label,
        last_event_at: lastEventResult.last_event_at,
        last_log_at: lastLogResult.last_log_at,
        last_activity: lastActivity,
        active_sessions: activeSessionsResult.count,
        events_last_5min: events5minResult.count,
        events_last_hour: eventsHourResult.count,
        total_events_today: eventsTodayResult.count,
        errors_last_hour: errorsHourResult.count,
        avg_response_time: Math.round(avgResponseResult.avg_ms || 0),
        recent_events: recentEvents,
      });
    }

    // Sortuj: online najpierw, potem idle, potem offline
    const statusOrder: Record<SiteStatus, number> = { online: 0, idle: 1, offline: 2 };
    monitoredSites.sort((a, b) => {
      const statusDiff = statusOrder[a.status] - statusOrder[b.status];
      if (statusDiff !== 0) return statusDiff;
      // W ramach tego samego statusu sortuj po ostatniej aktywności
      if (a.last_activity && b.last_activity) {
        return new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime();
      }
      return 0;
    });

    // Podsumowanie
    const summary: MonitorSummary = {
      total_sites: monitoredSites.length,
      online_count: monitoredSites.filter((s) => s.status === 'online').length,
      idle_count: monitoredSites.filter((s) => s.status === 'idle').length,
      offline_count: monitoredSites.filter((s) => s.status === 'offline').length,
      total_active_sessions: monitoredSites.reduce((sum, s) => sum + s.active_sessions, 0),
      total_events_5min: monitoredSites.reduce((sum, s) => sum + s.events_last_5min, 0),
    };

    // Lista wszystkich dostępnych stron (do wyboru)
    const availableSites = allSites.map((s) => s.site_id);

    return NextResponse.json({
      sites: monitoredSites,
      summary,
      available_sites: availableSites,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error('[API/monitor] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
