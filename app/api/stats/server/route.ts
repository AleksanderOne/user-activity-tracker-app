import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import * as os from 'os';

export const dynamic = 'force-dynamic';

interface ServerStats {
  // Czas działania
  server_started_at: string | null; // Pierwsza aktywność
  uptime_since_first_event: number; // Sekundy od pierwszego eventu

  // Statystyki ogólne
  total_events: number;
  total_sessions: number;
  total_visitors: number;
  total_form_submissions: number;
  total_uploaded_files: number;

  // Domeny/Strony
  domains: Array<{
    site_id: string;
    hostname: string | null;
    event_count: number;
    session_count: number;
    first_seen: string;
    last_seen: string;
  }>;

  // Statystyki logów komunikacji
  logs_stats: {
    total_requests: number;
    successful_requests: number;
    failed_requests: number;
    avg_response_time_ms: number;
    min_response_time_ms: number;
    max_response_time_ms: number;
    total_data_received_bytes: number;
    total_data_sent_bytes: number;
    success_rate: number;
    requests_per_minute: number;
    status_codes: Array<{ code: number; count: number }>;
    top_endpoints: Array<{ endpoint: string; count: number; avg_time: number }>;
    recent_requests: Array<{
      endpoint: string;
      method: string;
      status_code: number;
      duration_ms: number;
      created_at: string;
    }>;
  };

  // Dane systemu
  system_info: {
    node_version: string;
    platform: string;
    hostname: string;
    cpus: number;
    cpu_model: string;
    cpu_arch: string;
    memory_total_gb: number;
    memory_free_gb: number;
    memory_used_percent: number;
    os_uptime_hours: number;
    process_uptime_hours: number;
    process_pid: number;
    cwd: string;
    node_env: string;
    load_avg: number[];
    network_interfaces: number;
  };

  // Rozmiar bazy danych
  db_size_mb: number | null;
}

export async function GET() {
  try {
    const db = getDb();

    // 1. Pierwszy event (od kiedy działa tracker)
    const firstEventResult = db
      .prepare(
        `
            SELECT MIN(timestamp) as first_event 
            FROM events
        `,
      )
      .get() as { first_event: string | null };

    const serverStartedAt = firstEventResult?.first_event || null;
    let uptimeSinceFirstEvent = 0;

    if (serverStartedAt) {
      uptimeSinceFirstEvent = Math.floor((Date.now() - new Date(serverStartedAt).getTime()) / 1000);
    }

    // 2. Ogólne statystyki
    const totalStats = db
      .prepare(
        `
            SELECT 
                (SELECT COUNT(*) FROM events) as total_events,
                (SELECT COUNT(*) FROM sessions) as total_sessions,
                (SELECT COUNT(*) FROM visitors) as total_visitors,
                (SELECT COUNT(*) FROM form_submissions) as total_form_submissions,
                (SELECT COUNT(*) FROM uploaded_files) as total_uploaded_files
        `,
      )
      .get() as {
      total_events: number;
      total_sessions: number;
      total_visitors: number;
      total_form_submissions: number;
      total_uploaded_files: number;
    };

    // 3. Domeny/Strony (unikalne site_id z dodatkowymi informacjami)
    const domainsData = db
      .prepare(
        `
            SELECT 
                e.site_id,
                e.hostname,
                COUNT(DISTINCT e.id) as event_count,
                COUNT(DISTINCT e.session_id) as session_count,
                MIN(e.timestamp) as first_seen,
                MAX(e.timestamp) as last_seen
            FROM events e
            WHERE e.site_id IS NOT NULL
            GROUP BY e.site_id
            ORDER BY event_count DESC
            LIMIT 20
        `,
      )
      .all() as Array<{
      site_id: string;
      hostname: string | null;
      event_count: number;
      session_count: number;
      first_seen: string;
      last_seen: string;
    }>;

    // 4. Statystyki logów komunikacji
    const logsStats = db
      .prepare(
        `
            SELECT 
                COUNT(*) as total_requests,
                SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END) as successful_requests,
                SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as failed_requests,
                AVG(duration_ms) as avg_response_time_ms,
                MIN(duration_ms) as min_response_time_ms,
                MAX(duration_ms) as max_response_time_ms,
                SUM(request_size) as total_data_received_bytes,
                SUM(response_size) as total_data_sent_bytes,
                MIN(created_at) as first_request_at
            FROM communication_logs
        `,
      )
      .get() as {
      total_requests: number;
      successful_requests: number;
      failed_requests: number;
      avg_response_time_ms: number;
      min_response_time_ms: number;
      max_response_time_ms: number;
      total_data_received_bytes: number;
      total_data_sent_bytes: number;
      first_request_at: string | null;
    };

    // Rozkład status codes
    const statusCodes = db
      .prepare(
        `
            SELECT status_code as code, COUNT(*) as count
            FROM communication_logs
            GROUP BY status_code
            ORDER BY count DESC
        `,
      )
      .all() as Array<{ code: number; count: number }>;

    // Top endpointy
    const topEndpoints = db
      .prepare(
        `
            SELECT 
                endpoint,
                COUNT(*) as count,
                ROUND(AVG(duration_ms)) as avg_time
            FROM communication_logs
            GROUP BY endpoint
            ORDER BY count DESC
            LIMIT 5
        `,
      )
      .all() as Array<{ endpoint: string; count: number; avg_time: number }>;

    // Ostatnie requesty
    const recentRequests = db
      .prepare(
        `
            SELECT endpoint, method, status_code, duration_ms, created_at
            FROM communication_logs
            ORDER BY created_at DESC
            LIMIT 10
        `,
      )
      .all() as Array<{
      endpoint: string;
      method: string;
      status_code: number;
      duration_ms: number;
      created_at: string;
    }>;

    // Oblicz requests per minute
    let requestsPerMinute = 0;
    if (logsStats.first_request_at && logsStats.total_requests > 0) {
      const firstReq = new Date(logsStats.first_request_at).getTime();
      const now = Date.now();
      const minutesElapsed = Math.max(1, (now - firstReq) / 1000 / 60);
      requestsPerMinute = Math.round((logsStats.total_requests / minutesElapsed) * 100) / 100;
    }

    // 5. Rozmiar bazy danych
    let dbSizeMb: number | null = null;
    try {
      const dbSizeResult = db
        .prepare(
          `
                SELECT page_count * page_size as size 
                FROM pragma_page_count(), pragma_page_size()
            `,
        )
        .get() as { size: number };
      dbSizeMb = dbSizeResult ? Math.round((dbSizeResult.size / 1024 / 1024) * 100) / 100 : null;
    } catch {
      // Jeśli nie uda się pobrać rozmiaru, pozostaw null
    }

    // 6. Informacje o systemie
    const memoryTotalGb = os.totalmem() / 1024 / 1024 / 1024;
    const memoryFreeGb = os.freemem() / 1024 / 1024 / 1024;
    const memoryUsedPercent = Math.round(((memoryTotalGb - memoryFreeGb) / memoryTotalGb) * 100);

    const cpuInfo = os.cpus()[0];
    const networkInterfaces = Object.keys(os.networkInterfaces()).length;

    const systemInfo = {
      node_version: process.version,
      platform: os.platform(),
      hostname: os.hostname(),
      cpus: os.cpus().length,
      cpu_model: cpuInfo?.model || 'Unknown',
      cpu_arch: os.arch(),
      memory_total_gb: Math.round(memoryTotalGb * 100) / 100,
      memory_free_gb: Math.round(memoryFreeGb * 100) / 100,
      memory_used_percent: memoryUsedPercent,
      os_uptime_hours: Math.round((os.uptime() / 3600) * 100) / 100,
      process_uptime_hours: Math.round((process.uptime() / 3600) * 100) / 100,
      process_pid: process.pid,
      cwd: process.cwd(),
      node_env: process.env.NODE_ENV || 'development',
      load_avg: os.loadavg().map((l) => Math.round(l * 100) / 100),
      network_interfaces: networkInterfaces,
    };

    const result: ServerStats = {
      server_started_at: serverStartedAt,
      uptime_since_first_event: uptimeSinceFirstEvent,

      total_events: totalStats.total_events,
      total_sessions: totalStats.total_sessions,
      total_visitors: totalStats.total_visitors,
      total_form_submissions: totalStats.total_form_submissions,
      total_uploaded_files: totalStats.total_uploaded_files,

      domains: domainsData,

      logs_stats: {
        total_requests: logsStats.total_requests || 0,
        successful_requests: logsStats.successful_requests || 0,
        failed_requests: logsStats.failed_requests || 0,
        avg_response_time_ms: Math.round(logsStats.avg_response_time_ms || 0),
        min_response_time_ms: logsStats.min_response_time_ms || 0,
        max_response_time_ms: logsStats.max_response_time_ms || 0,
        total_data_received_bytes: logsStats.total_data_received_bytes || 0,
        total_data_sent_bytes: logsStats.total_data_sent_bytes || 0,
        success_rate:
          logsStats.total_requests > 0
            ? Math.round((logsStats.successful_requests / logsStats.total_requests) * 100)
            : 0,
        requests_per_minute: requestsPerMinute,
        status_codes: statusCodes,
        top_endpoints: topEndpoints,
        recent_requests: recentRequests,
      },

      system_info: systemInfo,
      db_size_mb: dbSizeMb,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in /api/stats/server:', error);
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 },
    );
  }
}
