import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Interfejsy dla opcji czyszczenia
interface CleanupOptions {
    mode: 'all' | 'period' | 'site' | 'visitor' | 'ip' | 'smart';
    dateFrom?: string;
    dateTo?: string;
    siteId?: string;
    hostname?: string;
    visitorId?: string;
    ipAddress?: string;
    // Opcje dla trybu inteligentnego
    smart?: {
        minEvents?: number;          // Minimalna liczba eventów (domyślnie 2)
        minDurationSeconds?: number; // Minimalna długość sesji w sekundach (domyślnie 5)
        includeBotsOnly?: boolean;   // Czy usuwać tylko boty
        noInteraction?: boolean;     // Usuwaj sesje bez interakcji (tylko pageviews)
    };
    dryRun?: boolean; // Czy tylko symulować (zwraca liczbę do usunięcia bez usuwania)
}

interface CleanupResult {
    success: boolean;
    mode: string;
    dryRun: boolean;
    deleted: {
        events: number;
        sessions: number;
        visitors: number;
        communication_logs: number;
        form_submissions: number;
        uploaded_files: number;
    };
    message: string;
}

// GET - pobieranie statystyk przed czyszczeniem (podgląd)
export async function GET(request: NextRequest) {
    // Weryfikacja sesji admina
    const authToken = request.cookies.get('dashboard_token')?.value;
    if (!authToken || !verifyToken(authToken)) {
        return NextResponse.json(
            { error: 'Nieautoryzowany dostęp' },
            { status: 401 }
        );
    }

    try {
        const db = getDb();
        
        // Pobierz statystyki do wyświetlenia w interfejsie
        const stats = {
            events: (db.prepare('SELECT COUNT(*) as count FROM events').get() as { count: number }).count,
            sessions: (db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number }).count,
            visitors: (db.prepare('SELECT COUNT(*) as count FROM visitors').get() as { count: number }).count,
            communication_logs: (db.prepare('SELECT COUNT(*) as count FROM communication_logs').get() as { count: number }).count,
            form_submissions: (db.prepare('SELECT COUNT(*) as count FROM form_submissions').get() as { count: number }).count,
            uploaded_files: (db.prepare('SELECT COUNT(*) as count FROM uploaded_files').get() as { count: number }).count,
        };
        
        // Pobierz unikalne wartości dla filtrów
        const sites = db.prepare(`
            SELECT DISTINCT site_id, 
                   (SELECT hostname FROM events WHERE events.site_id = sessions.site_id LIMIT 1) as hostname,
                   COUNT(*) as session_count
            FROM sessions 
            WHERE site_id IS NOT NULL 
            GROUP BY site_id 
            ORDER BY session_count DESC
        `).all() as { site_id: string; hostname: string | null; session_count: number }[];
        
        const ips = db.prepare(`
            SELECT DISTINCT ip, COUNT(*) as request_count
            FROM communication_logs 
            WHERE ip IS NOT NULL AND ip != ''
            GROUP BY ip 
            ORDER BY request_count DESC
            LIMIT 100
        `).all() as { ip: string; request_count: number }[];
        
        // Lista unikalnych użytkowników (visitor_id) z dodatkowymi informacjami
        const visitors = db.prepare(`
            SELECT 
                s.visitor_id,
                COUNT(DISTINCT s.session_id) as session_count,
                SUM(s.event_count) as total_events,
                MIN(s.started_at) as first_seen,
                MAX(s.last_activity) as last_seen,
                (SELECT json_extract(device_info, '$.browserName') FROM sessions WHERE visitor_id = s.visitor_id ORDER BY started_at DESC LIMIT 1) as browser,
                (SELECT json_extract(device_info, '$.platform') FROM sessions WHERE visitor_id = s.visitor_id ORDER BY started_at DESC LIMIT 1) as platform,
                (SELECT json_extract(device_info, '$.location.country') FROM sessions WHERE visitor_id = s.visitor_id ORDER BY started_at DESC LIMIT 1) as country
            FROM sessions s
            WHERE s.visitor_id IS NOT NULL
            GROUP BY s.visitor_id
            ORDER BY last_seen DESC
            LIMIT 100
        `).all() as Array<{
            visitor_id: string;
            session_count: number;
            total_events: number;
            first_seen: string;
            last_seen: string;
            browser: string | null;
            platform: string | null;
            country: string | null;
        }>;
        
        // Statystyki dla trybu inteligentnego
        const smartStats = {
            // Sesje z 0-1 eventów
            lowEventSessions: (db.prepare(`
                SELECT COUNT(*) as count FROM sessions WHERE event_count <= 1
            `).get() as { count: number }).count,
            
            // Sesje bardzo krótkie (< 5 sekund między first i last event)
            shortSessions: (db.prepare(`
                SELECT COUNT(*) as count FROM sessions s
                WHERE (julianday(s.last_activity) - julianday(s.started_at)) * 86400 < 5
                AND s.event_count > 0
            `).get() as { count: number }).count,
            
            // Sesje bez interakcji (tylko pageviews, bez kliknięć/formularzy)
            noInteractionSessions: (db.prepare(`
                SELECT COUNT(DISTINCT s.session_id) as count 
                FROM sessions s
                WHERE NOT EXISTS (
                    SELECT 1 FROM events e 
                    WHERE e.session_id = s.session_id 
                    AND e.event_type IN ('click', 'form_submit', 'form_start', 'input_sequence', 'rage_click', 'clipboard_action')
                )
            `).get() as { count: number }).count,
            
            // Stare eventy (> 30 dni)
            oldEvents: (db.prepare(`
                SELECT COUNT(*) as count FROM events 
                WHERE datetime(timestamp) < datetime('now', '-30 days')
            `).get() as { count: number }).count,
            
            // Stare sesje (> 30 dni)
            oldSessions: (db.prepare(`
                SELECT COUNT(*) as count FROM sessions 
                WHERE datetime(started_at) < datetime('now', '-30 days')
            `).get() as { count: number }).count,
        };
        
        // Pobierz historię czyszczenia
        const cleanupHistory = db.prepare(`
            SELECT 
                id, timestamp, mode, dry_run, 
                events_deleted, sessions_deleted, visitors_deleted,
                communication_logs_deleted, form_submissions_deleted, uploaded_files_deleted,
                total_deleted, filters, message
            FROM cleanup_history
            WHERE dry_run = 0
            ORDER BY timestamp DESC
            LIMIT 50
        `).all() as Array<{
            id: number;
            timestamp: string;
            mode: string;
            dry_run: number;
            events_deleted: number;
            sessions_deleted: number;
            visitors_deleted: number;
            communication_logs_deleted: number;
            form_submissions_deleted: number;
            uploaded_files_deleted: number;
            total_deleted: number;
            filters: string | null;
            message: string | null;
        }>;
        
        // Podsumowanie historii - ile łącznie usunięto
        const historySummary = db.prepare(`
            SELECT 
                COUNT(*) as operations_count,
                COALESCE(SUM(events_deleted), 0) as total_events,
                COALESCE(SUM(sessions_deleted), 0) as total_sessions,
                COALESCE(SUM(visitors_deleted), 0) as total_visitors,
                COALESCE(SUM(communication_logs_deleted), 0) as total_logs,
                COALESCE(SUM(form_submissions_deleted), 0) as total_forms,
                COALESCE(SUM(uploaded_files_deleted), 0) as total_files,
                COALESCE(SUM(total_deleted), 0) as grand_total
            FROM cleanup_history
            WHERE dry_run = 0
        `).get() as {
            operations_count: number;
            total_events: number;
            total_sessions: number;
            total_visitors: number;
            total_logs: number;
            total_forms: number;
            total_files: number;
            grand_total: number;
        };
        
        return NextResponse.json({
            stats,
            sites,
            ips,
            visitors,
            smartStats,
            cleanupHistory,
            historySummary,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Błąd pobierania statystyk czyszczenia:', error);
        return NextResponse.json(
            { error: 'Błąd pobierania statystyk' },
            { status: 500 }
        );
    }
}

// POST - wykonanie czyszczenia
export async function POST(request: NextRequest) {
    // Weryfikacja sesji admina
    const authToken = request.cookies.get('dashboard_token')?.value;
    if (!authToken || !verifyToken(authToken)) {
        return NextResponse.json(
            { error: 'Nieautoryzowany dostęp' },
            { status: 401 }
        );
    }

    try {
        const options: CleanupOptions = await request.json();
        const db = getDb();
        
        let result: CleanupResult = {
            success: true,
            mode: options.mode,
            dryRun: options.dryRun || false,
            deleted: {
                events: 0,
                sessions: 0,
                visitors: 0,
                communication_logs: 0,
                form_submissions: 0,
                uploaded_files: 0,
            },
            message: ''
        };
        
        // Funkcja pomocnicza do budowania warunków WHERE
        const buildWhereClause = (table: string): { clause: string; params: (string | number)[] } => {
            const conditions: string[] = [];
            const params: (string | number)[] = [];
            
            // Okres czasowy
            if (options.dateFrom) {
                const timestampCol = table === 'visitors' ? 'first_seen' : 'timestamp';
                const realCol = ['sessions'].includes(table) ? 'started_at' : timestampCol;
                conditions.push(`datetime(${realCol}) >= datetime(?)`);
                params.push(options.dateFrom);
            }
            if (options.dateTo) {
                const timestampCol = table === 'visitors' ? 'last_seen' : 'timestamp';
                const realCol = ['sessions'].includes(table) ? 'last_activity' : timestampCol;
                conditions.push(`datetime(${realCol}) <= datetime(?)`);
                params.push(options.dateTo);
            }
            
            // Site ID
            if (options.siteId && table !== 'visitors') {
                conditions.push('site_id = ?');
                params.push(options.siteId);
            }
            
            // Hostname (przez podzapytanie)
            if (options.hostname && table === 'events') {
                conditions.push('hostname = ?');
                params.push(options.hostname);
            }
            
            // Visitor ID
            if (options.visitorId && table !== 'communication_logs') {
                conditions.push('visitor_id = ?');
                params.push(options.visitorId);
            }
            
            // IP Address
            if (options.ipAddress) {
                if (table === 'communication_logs') {
                    conditions.push('ip = ?');
                    params.push(options.ipAddress);
                } else if (['events', 'sessions'].includes(table)) {
                    conditions.push('ip_hash = ?');
                    params.push(options.ipAddress);
                }
            }
            
            return {
                clause: conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '',
                params
            };
        };
        
        // Funkcja do czyszczenia z danej tabeli
        const cleanTable = (table: string): number => {
            const { clause, params } = buildWhereClause(table);
            
            if (options.dryRun) {
                const countQuery = `SELECT COUNT(*) as count FROM ${table} ${clause}`;
                const countResult = db.prepare(countQuery).get(...params) as { count: number };
                return countResult.count;
            } else {
                const deleteQuery = `DELETE FROM ${table} ${clause}`;
                const deleteResult = db.prepare(deleteQuery).run(...params);
                return deleteResult.changes;
            }
        };
        
        switch (options.mode) {
            case 'all':
                // Usuń wszystko ze wszystkich tabel
                if (options.dryRun) {
                    result.deleted.uploaded_files = (db.prepare('SELECT COUNT(*) as count FROM uploaded_files').get() as { count: number }).count;
                    result.deleted.form_submissions = (db.prepare('SELECT COUNT(*) as count FROM form_submissions').get() as { count: number }).count;
                    result.deleted.events = (db.prepare('SELECT COUNT(*) as count FROM events').get() as { count: number }).count;
                    result.deleted.communication_logs = (db.prepare('SELECT COUNT(*) as count FROM communication_logs').get() as { count: number }).count;
                    result.deleted.sessions = (db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number }).count;
                    result.deleted.visitors = (db.prepare('SELECT COUNT(*) as count FROM visitors').get() as { count: number }).count;
                } else {
                    // Usuwanie w odpowiedniej kolejności (foreign keys)
                    result.deleted.uploaded_files = db.prepare('DELETE FROM uploaded_files').run().changes;
                    result.deleted.form_submissions = db.prepare('DELETE FROM form_submissions').run().changes;
                    result.deleted.events = db.prepare('DELETE FROM events').run().changes;
                    result.deleted.communication_logs = db.prepare('DELETE FROM communication_logs').run().changes;
                    result.deleted.sessions = db.prepare('DELETE FROM sessions').run().changes;
                    result.deleted.visitors = db.prepare('DELETE FROM visitors').run().changes;
                }
                result.message = 'Usunięto wszystkie dane z bazy';
                break;
                
            case 'period':
                if (!options.dateFrom && !options.dateTo) {
                    return NextResponse.json({ error: 'Wymagany jest zakres dat' }, { status: 400 });
                }
                result.deleted.uploaded_files = cleanTable('uploaded_files');
                result.deleted.form_submissions = cleanTable('form_submissions');
                result.deleted.events = cleanTable('events');
                result.deleted.communication_logs = cleanTable('communication_logs');
                result.deleted.sessions = cleanTable('sessions');
                // Dla visitors sprawdzamy czy mają jeszcze sesje
                if (!options.dryRun) {
                    result.deleted.visitors = db.prepare(`
                        DELETE FROM visitors 
                        WHERE visitor_id NOT IN (SELECT DISTINCT visitor_id FROM sessions)
                    `).run().changes;
                }
                result.message = `Usunięto dane z okresu ${options.dateFrom || 'początku'} - ${options.dateTo || 'teraz'}`;
                break;
                
            case 'site':
                if (!options.siteId && !options.hostname) {
                    return NextResponse.json({ error: 'Wymagany jest site_id lub hostname' }, { status: 400 });
                }
                result.deleted.uploaded_files = cleanTable('uploaded_files');
                result.deleted.form_submissions = cleanTable('form_submissions');
                result.deleted.events = cleanTable('events');
                result.deleted.communication_logs = cleanTable('communication_logs');
                result.deleted.sessions = cleanTable('sessions');
                // Usuń osieroconych visitors
                if (!options.dryRun) {
                    result.deleted.visitors = db.prepare(`
                        DELETE FROM visitors 
                        WHERE visitor_id NOT IN (SELECT DISTINCT visitor_id FROM sessions)
                    `).run().changes;
                }
                result.message = `Usunięto dane dla strony: ${options.siteId || options.hostname}`;
                break;
                
            case 'dashboard':
                // Specjalny tryb: usuwa wszystkie dane dashboardu (tracker nie powinien śledzić samego siebie)
                const dashboardPattern = 'dashboard%';
                
                if (options.dryRun) {
                    result.deleted.uploaded_files = (db.prepare(`SELECT COUNT(*) as count FROM uploaded_files WHERE site_id LIKE ?`).get(dashboardPattern) as { count: number }).count;
                    result.deleted.form_submissions = (db.prepare(`SELECT COUNT(*) as count FROM form_submissions WHERE site_id LIKE ?`).get(dashboardPattern) as { count: number }).count;
                    result.deleted.events = (db.prepare(`SELECT COUNT(*) as count FROM events WHERE site_id LIKE ?`).get(dashboardPattern) as { count: number }).count;
                    result.deleted.communication_logs = (db.prepare(`SELECT COUNT(*) as count FROM communication_logs WHERE site_id LIKE ?`).get(dashboardPattern) as { count: number }).count;
                    result.deleted.sessions = (db.prepare(`SELECT COUNT(*) as count FROM sessions WHERE site_id LIKE ?`).get(dashboardPattern) as { count: number }).count;
                } else {
                    result.deleted.uploaded_files = db.prepare(`DELETE FROM uploaded_files WHERE site_id LIKE ?`).run(dashboardPattern).changes;
                    result.deleted.form_submissions = db.prepare(`DELETE FROM form_submissions WHERE site_id LIKE ?`).run(dashboardPattern).changes;
                    result.deleted.events = db.prepare(`DELETE FROM events WHERE site_id LIKE ?`).run(dashboardPattern).changes;
                    result.deleted.communication_logs = db.prepare(`DELETE FROM communication_logs WHERE site_id LIKE ?`).run(dashboardPattern).changes;
                    result.deleted.sessions = db.prepare(`DELETE FROM sessions WHERE site_id LIKE ?`).run(dashboardPattern).changes;
                    // Usuń osieroconych visitors
                    result.deleted.visitors = db.prepare(`
                        DELETE FROM visitors 
                        WHERE visitor_id NOT IN (SELECT DISTINCT visitor_id FROM sessions)
                    `).run().changes;
                }
                result.message = 'Usunięto dane dashboardu (tracker nie powinien śledzić samego siebie)';
                break;
                
            case 'visitor':
                if (!options.visitorId) {
                    return NextResponse.json({ error: 'Wymagany jest visitor_id' }, { status: 400 });
                }
                result.deleted.uploaded_files = cleanTable('uploaded_files');
                result.deleted.form_submissions = cleanTable('form_submissions');
                result.deleted.events = cleanTable('events');
                result.deleted.sessions = cleanTable('sessions');
                if (options.dryRun) {
                    result.deleted.visitors = 1;
                } else {
                    result.deleted.visitors = db.prepare('DELETE FROM visitors WHERE visitor_id = ?').run(options.visitorId).changes;
                }
                result.message = `Usunięto dane użytkownika: ${options.visitorId}`;
                break;
                
            case 'ip':
                if (!options.ipAddress) {
                    return NextResponse.json({ error: 'Wymagany jest adres IP' }, { status: 400 });
                }
                result.deleted.communication_logs = cleanTable('communication_logs');
                result.deleted.events = cleanTable('events');
                result.deleted.sessions = cleanTable('sessions');
                // Usuń osieroconych visitors
                if (!options.dryRun) {
                    result.deleted.visitors = db.prepare(`
                        DELETE FROM visitors 
                        WHERE visitor_id NOT IN (SELECT DISTINCT visitor_id FROM sessions)
                    `).run().changes;
                }
                result.message = `Usunięto dane z IP: ${options.ipAddress}`;
                break;
                
            case 'smart':
                const smart = options.smart || {};
                const minEvents = smart.minEvents ?? 2;
                const minDuration = smart.minDurationSeconds ?? 5;
                
                // Znajdź sesje do usunięcia (spełniające kryteria "śmieciowe")
                let smartConditions: string[] = [];
                
                // Sesje z małą liczbą eventów
                if (minEvents > 0) {
                    smartConditions.push(`event_count < ${minEvents}`);
                }
                
                // Sesje krótkie
                if (minDuration > 0) {
                    smartConditions.push(`(julianday(last_activity) - julianday(started_at)) * 86400 < ${minDuration}`);
                }
                
                // Sesje bez interakcji (tylko pageviews)
                if (smart.noInteraction) {
                    smartConditions.push(`session_id NOT IN (
                        SELECT DISTINCT session_id FROM events 
                        WHERE event_type IN ('click', 'form_submit', 'form_start', 'input_sequence', 'rage_click', 'clipboard_action')
                    )`);
                }
                
                const smartWhere = smartConditions.length > 0 
                    ? 'WHERE (' + smartConditions.join(' OR ') + ')'
                    : '';
                
                if (options.dryRun) {
                    // Policz sesje do usunięcia
                    const sessionsToDelete = db.prepare(`SELECT COUNT(*) as count FROM sessions ${smartWhere}`).get() as { count: number };
                    result.deleted.sessions = sessionsToDelete.count;
                    
                    // Policz powiązane eventy
                    const eventsToDelete = db.prepare(`
                        SELECT COUNT(*) as count FROM events 
                        WHERE session_id IN (SELECT session_id FROM sessions ${smartWhere})
                    `).get() as { count: number };
                    result.deleted.events = eventsToDelete.count;
                    
                    // Policz powiązane formularze
                    const formsToDelete = db.prepare(`
                        SELECT COUNT(*) as count FROM form_submissions 
                        WHERE session_id IN (SELECT session_id FROM sessions ${smartWhere})
                    `).get() as { count: number };
                    result.deleted.form_submissions = formsToDelete.count;
                    
                    // Policz powiązane pliki
                    const filesToDelete = db.prepare(`
                        SELECT COUNT(*) as count FROM uploaded_files 
                        WHERE session_id IN (SELECT session_id FROM sessions ${smartWhere})
                    `).get() as { count: number };
                    result.deleted.uploaded_files = filesToDelete.count;
                    
                } else {
                    // Usuń pliki powiązane z sesjami
                    result.deleted.uploaded_files = db.prepare(`
                        DELETE FROM uploaded_files 
                        WHERE session_id IN (SELECT session_id FROM sessions ${smartWhere})
                    `).run().changes;
                    
                    // Usuń formularze powiązane z sesjami
                    result.deleted.form_submissions = db.prepare(`
                        DELETE FROM form_submissions 
                        WHERE session_id IN (SELECT session_id FROM sessions ${smartWhere})
                    `).run().changes;
                    
                    // Usuń eventy powiązane z sesjami
                    result.deleted.events = db.prepare(`
                        DELETE FROM events 
                        WHERE session_id IN (SELECT session_id FROM sessions ${smartWhere})
                    `).run().changes;
                    
                    // Usuń sesje
                    result.deleted.sessions = db.prepare(`DELETE FROM sessions ${smartWhere}`).run().changes;
                    
                    // Usuń osieroconych visitors
                    result.deleted.visitors = db.prepare(`
                        DELETE FROM visitors 
                        WHERE visitor_id NOT IN (SELECT DISTINCT visitor_id FROM sessions)
                    `).run().changes;
                }
                
                result.message = `Tryb inteligentny: usunięto sesje z < ${minEvents} eventów, < ${minDuration}s, bez interakcji`;
                break;
                
            default:
                return NextResponse.json({ error: 'Nieznany tryb czyszczenia' }, { status: 400 });
        }
        
        // Zapisz do historii (zawsze, nawet dry run dla celów diagnostycznych)
        const totalDeleted = Object.values(result.deleted).reduce((sum, val) => sum + val, 0);
        
        // Przygotuj filtry jako JSON
        const filters: Record<string, unknown> = {};
        if (options.dateFrom) filters.dateFrom = options.dateFrom;
        if (options.dateTo) filters.dateTo = options.dateTo;
        if (options.siteId) filters.siteId = options.siteId;
        if (options.hostname) filters.hostname = options.hostname;
        if (options.visitorId) filters.visitorId = options.visitorId;
        if (options.ipAddress) filters.ipAddress = options.ipAddress;
        if (options.smart) filters.smart = options.smart;
        
        db.prepare(`
            INSERT INTO cleanup_history (
                timestamp, mode, dry_run,
                events_deleted, sessions_deleted, visitors_deleted,
                communication_logs_deleted, form_submissions_deleted, uploaded_files_deleted,
                total_deleted, filters, message
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            new Date().toISOString(),
            options.mode,
            options.dryRun ? 1 : 0,
            result.deleted.events,
            result.deleted.sessions,
            result.deleted.visitors,
            result.deleted.communication_logs,
            result.deleted.form_submissions,
            result.deleted.uploaded_files,
            totalDeleted,
            Object.keys(filters).length > 0 ? JSON.stringify(filters) : null,
            result.message
        );
        
        // VACUUM bazy po dużym usunięciu (tylko jeśli nie dryRun)
        if (!options.dryRun) {
            try {
                db.exec('VACUUM');
            } catch {
                // VACUUM może nie zadziałać w WAL mode, to normalne
            }
        }
        
        return NextResponse.json(result);
        
    } catch (error) {
        console.error('Błąd czyszczenia danych:', error);
        return NextResponse.json(
            { error: 'Błąd podczas czyszczenia danych', details: String(error) },
            { status: 500 }
        );
    }
}

