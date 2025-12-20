import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import * as os from 'os';

export const dynamic = 'force-dynamic';

// Typy dla diagnostyki
interface AnomalyEntry {
    id: string;
    type: 'high_latency' | 'error_spike' | 'unusual_traffic' | 'connection_lost' | 'suspicious_activity' | 'rate_limit';
    severity: 'low' | 'medium' | 'high' | 'critical';
    site_id: string;
    message: string;
    details: Record<string, unknown>;
    timestamp: string;
}

interface SiteHealth {
    site_id: string;
    origin: string | null;
    status: 'healthy' | 'warning' | 'error' | 'offline';
    last_activity: string;
    avg_latency_ms: number;
    error_rate: number;
    requests_last_hour: number;
    events_last_hour: number;
    anomalies: AnomalyEntry[];
    uptime_percent: number;
}

interface DebuggerResponse {
    // Status ogólny
    system_health: 'healthy' | 'warning' | 'error' | 'critical';
    
    // Diagnostyka serwera
    server: {
        process_memory_mb: number;
        heap_used_mb: number;
        heap_total_mb: number;
        external_mb: number;
        cpu_usage_percent: number;
        event_loop_lag_ms: number;
        active_handles: number;
        active_requests: number;
        uptime_seconds: number;
        node_version: string;
        platform: string;
        db_connection: 'connected' | 'error';
        db_size_mb: number;
        db_tables_count: number;
    };
    
    // Strony i ich stan zdrowia
    sites: SiteHealth[];
    
    // Anomalie i alerty
    anomalies: AnomalyEntry[];
    
    // Statystyki komunikacji
    communication: {
        total_requests_24h: number;
        successful_requests_24h: number;
        failed_requests_24h: number;
        avg_response_time_ms: number;
        p95_response_time_ms: number;
        p99_response_time_ms: number;
        requests_per_minute: number;
        bytes_received_24h: number;
        bytes_sent_24h: number;
        unique_ips_24h: number;
        unique_user_agents_24h: number;
    };
    
    // Ostatnie błędy
    recent_errors: Array<{
        id: string;
        timestamp: string;
        site_id: string;
        endpoint: string;
        status_code: number;
        error_message: string | null;
        ip: string;
    }>;
    
    // Historia pingów
    ping_history: Array<{
        timestamp: string;
        success: boolean;
        latency_ms: number;
    }>;
    
    timestamp: string;
}

// Funkcja wykrywająca anomalie
function detectAnomalies(db: ReturnType<typeof getDb>, siteId: string, avgLatency: number, errorRate: number): AnomalyEntry[] {
    const anomalies: AnomalyEntry[] = [];
    const now = new Date().toISOString();
    
    // Sprawdź wysokie opóźnienie
    if (avgLatency > 1000) {
        anomalies.push({
            id: `anomaly-${Date.now()}-latency`,
            type: 'high_latency',
            severity: avgLatency > 3000 ? 'critical' : avgLatency > 2000 ? 'high' : 'medium',
            site_id: siteId,
            message: `Wysokie opóźnienie odpowiedzi: ${Math.round(avgLatency)}ms`,
            details: { avg_latency_ms: avgLatency },
            timestamp: now
        });
    }
    
    // Sprawdź wysoki wskaźnik błędów
    if (errorRate > 10) {
        anomalies.push({
            id: `anomaly-${Date.now()}-errors`,
            type: 'error_spike',
            severity: errorRate > 50 ? 'critical' : errorRate > 30 ? 'high' : 'medium',
            site_id: siteId,
            message: `Wysoki wskaźnik błędów: ${errorRate.toFixed(1)}%`,
            details: { error_rate: errorRate },
            timestamp: now
        });
    }
    
    // Sprawdź nagły wzrost ruchu (requesty w ostatnich 5 minutach vs poprzednie 5 minut)
    try {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        
        const recentTraffic = db.prepare(`
            SELECT COUNT(*) as count FROM communication_logs 
            WHERE site_id = ? AND timestamp >= ?
        `).get(siteId, fiveMinAgo) as { count: number };
        
        const previousTraffic = db.prepare(`
            SELECT COUNT(*) as count FROM communication_logs 
            WHERE site_id = ? AND timestamp >= ? AND timestamp < ?
        `).get(siteId, tenMinAgo, fiveMinAgo) as { count: number };
        
        if (previousTraffic.count > 0 && recentTraffic.count > previousTraffic.count * 3) {
            anomalies.push({
                id: `anomaly-${Date.now()}-traffic`,
                type: 'unusual_traffic',
                severity: recentTraffic.count > previousTraffic.count * 10 ? 'high' : 'medium',
                site_id: siteId,
                message: `Nagły wzrost ruchu: ${recentTraffic.count} requestów (vs ${previousTraffic.count} wcześniej)`,
                details: { recent: recentTraffic.count, previous: previousTraffic.count },
                timestamp: now
            });
        }
    } catch {
        // Ignoruj błędy wykrywania anomalii
    }
    
    // Sprawdź podejrzaną aktywność (dużo różnych IP w krótkim czasie)
    try {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const uniqueIps = db.prepare(`
            SELECT COUNT(DISTINCT ip) as count FROM communication_logs 
            WHERE site_id = ? AND timestamp >= ?
        `).get(siteId, fiveMinAgo) as { count: number };
        
        if (uniqueIps.count > 50) {
            anomalies.push({
                id: `anomaly-${Date.now()}-ips`,
                type: 'suspicious_activity',
                severity: uniqueIps.count > 200 ? 'critical' : uniqueIps.count > 100 ? 'high' : 'medium',
                site_id: siteId,
                message: `Duża liczba unikalnych IP: ${uniqueIps.count} w ciągu 5 minut`,
                details: { unique_ips: uniqueIps.count },
                timestamp: now
            });
        }
    } catch {
        // Ignoruj błędy wykrywania anomalii
    }
    
    return anomalies;
}

/**
 * GET /api/debugger - Pobierz pełną diagnostykę systemu
 */
export async function GET(request: NextRequest) {
    try {
        // Weryfikacja autoryzacji
        const authToken = request.cookies.get('dashboard_token')?.value;
        if (!authToken || !verifyToken(authToken)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const db = getDb();
        const now = new Date();
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

        // 1. Diagnostyka serwera
        const memoryUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        const cpuPercent = Math.round((cpuUsage.user + cpuUsage.system) / 1000000 / process.uptime() * 100) / 100;
        
        // Rozmiar bazy danych
        let dbSizeMb = 0;
        let dbTablesCount = 0;
        let dbConnection: 'connected' | 'error' = 'connected';
        
        try {
            const dbSizeResult = db.prepare(`
                SELECT page_count * page_size as size 
                FROM pragma_page_count(), pragma_page_size()
            `).get() as { size: number };
            dbSizeMb = dbSizeResult ? Math.round((dbSizeResult.size / 1024 / 1024) * 100) / 100 : 0;
            
            const tablesResult = db.prepare(`
                SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'
            `).get() as { count: number };
            dbTablesCount = tablesResult?.count || 0;
        } catch {
            dbConnection = 'error';
        }

        const serverDiag = {
            process_memory_mb: Math.round(memoryUsage.rss / 1024 / 1024 * 100) / 100,
            heap_used_mb: Math.round(memoryUsage.heapUsed / 1024 / 1024 * 100) / 100,
            heap_total_mb: Math.round(memoryUsage.heapTotal / 1024 / 1024 * 100) / 100,
            external_mb: Math.round(memoryUsage.external / 1024 / 1024 * 100) / 100,
            cpu_usage_percent: cpuPercent,
            event_loop_lag_ms: 0, // Uproszczone
            active_handles: 0,
            active_requests: 0,
            uptime_seconds: Math.round(process.uptime()),
            node_version: process.version,
            platform: os.platform(),
            db_connection: dbConnection,
            db_size_mb: dbSizeMb,
            db_tables_count: dbTablesCount
        };

        // 2. Statystyki komunikacji (24h)
        const commStats = db.prepare(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END) as success,
                SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as failed,
                AVG(duration_ms) as avg_time,
                SUM(request_size) as bytes_in,
                SUM(response_size) as bytes_out,
                COUNT(DISTINCT ip) as unique_ips,
                COUNT(DISTINCT user_agent) as unique_uas
            FROM communication_logs
            WHERE timestamp >= ?
        `).get(twentyFourHoursAgo) as {
            total: number;
            success: number;
            failed: number;
            avg_time: number;
            bytes_in: number;
            bytes_out: number;
            unique_ips: number;
            unique_uas: number;
        };

        // Percentyle czasów odpowiedzi
        const latencies = db.prepare(`
            SELECT duration_ms FROM communication_logs
            WHERE timestamp >= ?
            ORDER BY duration_ms
        `).all(twentyFourHoursAgo) as Array<{ duration_ms: number }>;
        
        let p95 = 0, p99 = 0;
        if (latencies.length > 0) {
            const p95Index = Math.floor(latencies.length * 0.95);
            const p99Index = Math.floor(latencies.length * 0.99);
            p95 = latencies[p95Index]?.duration_ms || 0;
            p99 = latencies[p99Index]?.duration_ms || 0;
        }

        // Requesty na minutę (ostatnia godzina)
        const requestsLastHour = db.prepare(`
            SELECT COUNT(*) as count FROM communication_logs
            WHERE timestamp >= ?
        `).get(oneHourAgo) as { count: number };
        const requestsPerMinute = Math.round((requestsLastHour?.count || 0) / 60 * 100) / 100;

        // 3. Status stron
        const siteStatsRaw = db.prepare(`
            SELECT 
                site_id,
                MAX(origin) as origin,
                MAX(timestamp) as last_activity,
                AVG(duration_ms) as avg_latency_ms,
                COUNT(*) as total_requests,
                SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as error_count
            FROM communication_logs
            GROUP BY site_id
            ORDER BY last_activity DESC
        `).all() as Array<{
            site_id: string;
            origin: string | null;
            last_activity: string;
            avg_latency_ms: number;
            total_requests: number;
            error_count: number;
        }>;

        const sites: SiteHealth[] = siteStatsRaw.map(site => {
            const errorRate = site.total_requests > 0 ? (site.error_count / site.total_requests) * 100 : 0;
            const isOnline = site.last_activity >= fiveMinutesAgo;
            
            // Requesty w ostatniej godzinie
            const hourlyStats = db.prepare(`
                SELECT COUNT(*) as requests, SUM(events_count) as events
                FROM communication_logs
                WHERE site_id = ? AND timestamp >= ?
            `).get(site.site_id, oneHourAgo) as { requests: number; events: number };
            
            // Wykryj anomalie
            const anomalies = detectAnomalies(db, site.site_id, site.avg_latency_ms, errorRate);
            
            // Określ status
            let status: SiteHealth['status'] = 'healthy';
            if (!isOnline) status = 'offline';
            else if (anomalies.some(a => a.severity === 'critical')) status = 'error';
            else if (anomalies.some(a => a.severity === 'high' || a.severity === 'medium')) status = 'warning';
            else if (errorRate > 5) status = 'warning';
            else if (errorRate > 20) status = 'error';
            
            // Oblicz uptime (% czasu gdy strona odpowiadała poprawnie)
            const successfulRequests = site.total_requests - site.error_count;
            const uptimePercent = site.total_requests > 0 
                ? Math.round((successfulRequests / site.total_requests) * 100) 
                : 100;
            
            return {
                site_id: site.site_id,
                origin: site.origin,
                status,
                last_activity: site.last_activity,
                avg_latency_ms: Math.round(site.avg_latency_ms || 0),
                error_rate: Math.round(errorRate * 100) / 100,
                requests_last_hour: hourlyStats?.requests || 0,
                events_last_hour: hourlyStats?.events || 0,
                anomalies,
                uptime_percent: uptimePercent
            };
        });

        // 4. Wszystkie anomalie
        const allAnomalies = sites.flatMap(s => s.anomalies);
        
        // Dodatkowe anomalie systemowe
        if (serverDiag.heap_used_mb > 500) {
            allAnomalies.push({
                id: `anomaly-${Date.now()}-memory`,
                type: 'suspicious_activity',
                severity: serverDiag.heap_used_mb > 1000 ? 'critical' : 'high',
                site_id: 'system',
                message: `Wysokie zużycie pamięci: ${serverDiag.heap_used_mb}MB`,
                details: { heap_used_mb: serverDiag.heap_used_mb },
                timestamp: now.toISOString()
            });
        }
        
        if (dbSizeMb > 500) {
            allAnomalies.push({
                id: `anomaly-${Date.now()}-db`,
                type: 'suspicious_activity',
                severity: dbSizeMb > 1000 ? 'high' : 'medium',
                site_id: 'system',
                message: `Duży rozmiar bazy danych: ${dbSizeMb}MB`,
                details: { db_size_mb: dbSizeMb },
                timestamp: now.toISOString()
            });
        }

        // 5. Ostatnie błędy
        const recentErrors = db.prepare(`
            SELECT id, timestamp, site_id, endpoint, status_code, error_message, ip
            FROM communication_logs
            WHERE status_code >= 400
            ORDER BY timestamp DESC
            LIMIT 20
        `).all() as DebuggerResponse['recent_errors'];

        // 6. Historia pingów
        const pingHistory = db.prepare(`
            SELECT timestamp, status_code, duration_ms
            FROM communication_logs
            WHERE endpoint LIKE '%/ping%'
            ORDER BY timestamp DESC
            LIMIT 50
        `).all() as Array<{ timestamp: string; status_code: number; duration_ms: number }>;

        // 7. Określ ogólny stan systemu
        let systemHealth: DebuggerResponse['system_health'] = 'healthy';
        const criticalAnomalies = allAnomalies.filter(a => a.severity === 'critical').length;
        const highAnomalies = allAnomalies.filter(a => a.severity === 'high').length;
        const offlineSites = sites.filter(s => s.status === 'offline').length;
        
        if (criticalAnomalies > 0 || dbConnection === 'error') systemHealth = 'critical';
        else if (highAnomalies > 0 || offlineSites > 0) systemHealth = 'error';
        else if (allAnomalies.length > 0) systemHealth = 'warning';

        const response: DebuggerResponse = {
            system_health: systemHealth,
            server: serverDiag,
            sites,
            anomalies: allAnomalies.sort((a, b) => {
                const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
                return severityOrder[a.severity] - severityOrder[b.severity];
            }),
            communication: {
                total_requests_24h: commStats?.total || 0,
                successful_requests_24h: commStats?.success || 0,
                failed_requests_24h: commStats?.failed || 0,
                avg_response_time_ms: Math.round(commStats?.avg_time || 0),
                p95_response_time_ms: Math.round(p95),
                p99_response_time_ms: Math.round(p99),
                requests_per_minute: requestsPerMinute,
                bytes_received_24h: commStats?.bytes_in || 0,
                bytes_sent_24h: commStats?.bytes_out || 0,
                unique_ips_24h: commStats?.unique_ips || 0,
                unique_user_agents_24h: commStats?.unique_uas || 0
            },
            recent_errors: recentErrors,
            ping_history: pingHistory.map(p => ({
                timestamp: p.timestamp,
                success: p.status_code >= 200 && p.status_code < 300,
                latency_ms: p.duration_ms
            })),
            timestamp: now.toISOString()
        };

        return NextResponse.json(response);

    } catch (error) {
        console.error('[API/debugger] Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/debugger/test - Wykonaj test komunikacji
 */
export async function POST(request: NextRequest) {
    try {
        // Weryfikacja autoryzacji
        const authToken = request.cookies.get('dashboard_token')?.value;
        if (!authToken || !verifyToken(authToken)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json().catch(() => ({}));
        const testType = body.type || 'ping'; // ping, db, full

        const results: Record<string, { success: boolean; latency_ms: number; message: string; details?: Record<string, unknown> }> = {};
        const startTime = Date.now();

        // Test 1: Ping backendu
        const pingStart = Date.now();
        results.backend_ping = {
            success: true,
            latency_ms: Date.now() - pingStart,
            message: 'Backend odpowiada poprawnie'
        };

        // Test 2: Baza danych
        if (testType === 'db' || testType === 'full') {
            const dbStart = Date.now();
            try {
                const db = getDb();
                const testQuery = db.prepare('SELECT 1 as test').get();
                results.database = {
                    success: !!testQuery,
                    latency_ms: Date.now() - dbStart,
                    message: 'Baza danych działa poprawnie'
                };
                
                // Test zapisu i odczytu
                if (testType === 'full') {
                    const writeStart = Date.now();
                    try {
                        db.prepare(`
                            INSERT INTO communication_logs 
                            (id, timestamp, site_id, origin, ip, method, endpoint, status_code, 
                             request_size, response_size, duration_ms, events_count, error_message, 
                             user_agent, session_id, visitor_id)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `).run(
                            `debug-test-${Date.now()}`,
                            new Date().toISOString(),
                            'debugger-test',
                            null,
                            '127.0.0.1',
                            'POST',
                            '/api/debugger/test',
                            200,
                            0,
                            0,
                            0,
                            0,
                            null,
                            'Debugger Test',
                            null,
                            null
                        );
                        results.database_write = {
                            success: true,
                            latency_ms: Date.now() - writeStart,
                            message: 'Zapis do bazy działa poprawnie'
                        };
                    } catch (e) {
                        results.database_write = {
                            success: false,
                            latency_ms: Date.now() - writeStart,
                            message: `Błąd zapisu: ${e instanceof Error ? e.message : 'Unknown'}`
                        };
                    }
                }
            } catch (e) {
                results.database = {
                    success: false,
                    latency_ms: Date.now() - dbStart,
                    message: `Błąd bazy danych: ${e instanceof Error ? e.message : 'Unknown'}`
                };
            }
        }

        // Test 3: Pamięć i system
        if (testType === 'full') {
            const memoryUsage = process.memoryUsage();
            const memTotal = os.totalmem();
            const memFree = os.freemem();
            
            results.memory = {
                success: true,
                latency_ms: 0,
                message: 'Sprawdzono pamięć systemową',
                details: {
                    process_heap_mb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                    system_free_mb: Math.round(memFree / 1024 / 1024),
                    system_total_mb: Math.round(memTotal / 1024 / 1024),
                    usage_percent: Math.round((1 - memFree / memTotal) * 100)
                }
            };
            
            results.cpu = {
                success: true,
                latency_ms: 0,
                message: 'Sprawdzono CPU',
                details: {
                    cores: os.cpus().length,
                    model: os.cpus()[0]?.model || 'Unknown',
                    load_avg: os.loadavg()
                }
            };
        }

        return NextResponse.json({
            success: Object.values(results).every(r => r.success),
            total_latency_ms: Date.now() - startTime,
            timestamp: new Date().toISOString(),
            tests: results
        });

    } catch (error) {
        console.error('[API/debugger] Test error:', error);
        return NextResponse.json(
            { 
                success: false,
                error: 'Test failed',
                message: error instanceof Error ? error.message : 'Unknown'
            },
            { status: 500 }
        );
    }
}

