import { NextRequest, NextResponse } from 'next/server';
import { getDb, isTrackingEnabled } from '@/lib/db';
import { validateCollectPayload } from '@/lib/validation';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { verifyApiToken } from '@/lib/auth';
import { getGeoInfo } from '@/lib/geo-cache';

export const dynamic = 'force-dynamic';

// Funkcja generująca UUID
function generateLogId(): string {
    return 'log-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
}

// Funkcja logująca komunikację do bazy danych
function logCommunication(params: {
    siteId: string;
    origin: string | null;
    ip: string;
    method: string;
    endpoint: string;
    statusCode: number;
    requestSize: number;
    responseSize: number;
    durationMs: number;
    eventsCount: number;
    errorMessage: string | null;
    userAgent: string | null;
    sessionId: string | null;
    visitorId: string | null;
}) {
    try {
        const db = getDb();
        const insertLog = db.prepare(`
            INSERT INTO communication_logs 
            (id, timestamp, site_id, origin, ip, method, endpoint, status_code, 
             request_size, response_size, duration_ms, events_count, error_message, 
             user_agent, session_id, visitor_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        insertLog.run(
            generateLogId(),
            new Date().toISOString(),
            params.siteId,
            params.origin,
            params.ip,
            params.method,
            params.endpoint,
            params.statusCode,
            params.requestSize,
            params.responseSize,
            params.durationMs,
            params.eventsCount,
            params.errorMessage,
            params.userAgent,
            params.sessionId,
            params.visitorId
        );
    } catch (err) {
        console.error('[LogCommunication] Error:', err);
    }
}

export async function POST(request: NextRequest) {
    const startTime = Date.now();
    const origin = request.headers.get('origin') || request.headers.get('referer') || null;
    const userAgent = request.headers.get('user-agent') || null;
    
    // Przybliżony rozmiar żądania
    let requestSize = 0;
    let siteId = 'unknown';
    let sessionId: string | null = null;
    let visitorId: string | null = null;
    let eventsCount = 0;

    try {
        // 1. Pobierz IP
        let ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? '127.0.0.1';
        if (ip.includes(',')) ip = ip.split(',')[0].trim();
        if (ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');

        // 2. Rate limiting
        const rateLimit = checkRateLimit(`collect:${ip}`, RATE_LIMITS.collect);
        if (!rateLimit.allowed) {
            const response = { status: 'error', message: 'Rate limit exceeded' };
            const responseSize = JSON.stringify(response).length;
            
            logCommunication({
                siteId,
                origin,
                ip,
                method: 'POST',
                endpoint: '/api/collect',
                statusCode: 429,
                requestSize,
                responseSize,
                durationMs: Date.now() - startTime,
                eventsCount: 0,
                errorMessage: 'Rate limit exceeded',
                userAgent,
                sessionId: null,
                visitorId: null
            });
            
            return NextResponse.json(
                response,
                {
                    status: 429,
                    headers: {
                        'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
                        'X-RateLimit-Remaining': '0',
                        'X-RateLimit-Reset': String(rateLimit.resetAt),
                    },
                }
            );
        }

        // 3. Weryfikacja API tokenu (opcjonalna w development)
        const apiToken = request.headers.get('x-api-token');
        if (!verifyApiToken(apiToken)) {
            const response = { status: 'error', message: 'Invalid or missing API token' };
            const responseSize = JSON.stringify(response).length;
            
            logCommunication({
                siteId,
                origin,
                ip,
                method: 'POST',
                endpoint: '/api/collect',
                statusCode: 401,
                requestSize,
                responseSize,
                durationMs: Date.now() - startTime,
                eventsCount: 0,
                errorMessage: 'Invalid or missing API token',
                userAgent,
                sessionId: null,
                visitorId: null
            });
            
            return NextResponse.json(
                response,
                { status: 401 }
            );
        }

        // 4. Parsuj i waliduj dane
        const body = await request.json();
        requestSize = JSON.stringify(body).length;
        const validation = validateCollectPayload(body);

        if (!validation.success) {
            const response = { status: 'error', message: validation.error };
            const responseSize = JSON.stringify(response).length;
            
            logCommunication({
                siteId,
                origin,
                ip,
                method: 'POST',
                endpoint: '/api/collect',
                statusCode: 400,
                requestSize,
                responseSize,
                durationMs: Date.now() - startTime,
                eventsCount: 0,
                errorMessage: validation.error || 'Validation failed',
                userAgent,
                sessionId: null,
                visitorId: null
            });
            
            return NextResponse.json(
                response,
                { status: 400 }
            );
        }

        const { events, device, utm } = validation.data;
        
        // Wyciągnij siteId, sessionId i visitorId z pierwszego eventu
        if (events.length > 0) {
            siteId = events[0].siteId || 'unknown';
            sessionId = events[0].sessionId || null;
            visitorId = events[0].visitorId || null;
            eventsCount = events.length;
        }

        // === SPRAWDZENIE CZY ŚLEDZENIE JEST WŁĄCZONE ===
        // Jeśli tracking wyłączony globalnie lub dla tego site_id - odrzuć dane
        if (!isTrackingEnabled(siteId)) {
            const response = { 
                success: false, 
                message: 'Śledzenie wstrzymane', 
                tracking_disabled: true 
            };
            const responseSize = JSON.stringify(response).length;
            
            // Logujemy jako "odrzucone" ale z kodem 202 (accepted but not processed)
            logCommunication({
                siteId,
                origin,
                ip,
                method: 'POST',
                endpoint: '/api/collect',
                statusCode: 202,
                requestSize,
                responseSize,
                durationMs: Date.now() - startTime,
                eventsCount,
                errorMessage: 'Tracking disabled - data rejected',
                userAgent,
                sessionId,
                visitorId
            });
            
            // Zwracamy 202 zamiast błędu - tracker nie powinien ponawiać
            return NextResponse.json(
                response,
                { 
                    status: 202,
                    headers: {
                        'X-Tracking-Disabled': 'true'
                    }
                }
            );
        }
        
        const userAgentHeader = request.headers.get('user-agent') || '';

        // 5. Przygotuj dane urządzenia
        let extendedDevice: Record<string, unknown> = device
            ? { ...device, ip, userAgentServer: userAgentHeader }
            : { ip, userAgentServer: userAgentHeader };

        // 6. Pobierz GeoIP dla nowych wizyt
        const isNewVisit = events.some((e) => e.eventType === 'pageview');

        if (isNewVisit) {
            const geoInfo = await getGeoInfo(ip);
            if (geoInfo) {
                extendedDevice = {
                    ...extendedDevice,
                    location: {
                        country: geoInfo.country,
                        city: geoInfo.city,
                        isp: geoInfo.isp,
                        org: geoInfo.org,
                    },
                };
            }
        }

        const now = new Date().toISOString();
        const db = getDb();

        // 7. Przygotuj zapytania SQL
        // Użyj UPSERT żeby aktualizować device_info gdy mamy nowe dane lokalizacji
        const upsertSession = db.prepare(`
            INSERT INTO sessions (session_id, site_id, visitor_id, device_info, started_at, last_activity, utm_params)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET
                device_info = CASE 
                    WHEN json_extract(excluded.device_info, '$.location') IS NOT NULL 
                         AND json_extract(sessions.device_info, '$.location') IS NULL
                    THEN excluded.device_info
                    ELSE sessions.device_info
                END,
                last_activity = excluded.last_activity
        `);

        const updateSession = db.prepare(`
            UPDATE sessions 
            SET last_activity = ?, 
                event_count = event_count + ?, 
                page_count = page_count + ? 
            WHERE session_id = ?
        `);

        const insertEvent = db.prepare(`
            INSERT INTO events (id, timestamp, site_id, session_id, visitor_id, event_type, path, data, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // Przygotuj zapytanie dla formularzy
        const insertFormSubmission = db.prepare(`
            INSERT INTO form_submissions 
            (id, timestamp, site_id, session_id, visitor_id, form_id, form_name, 
             form_action, page_url, page_path, form_data, fill_duration, 
             fields_count, has_files)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // Przygotuj zapytanie dla prób logowania
        const insertLoginAttempt = db.prepare(`
            INSERT INTO login_attempts 
            (id, timestamp, site_id, session_id, visitor_id, form_submission_id,
             email, username, password_length, page_url, page_path,
             login_success, detection_method, error_message, redirect_url, response_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // Przygotuj zapytanie do aktualizacji wyniku logowania
        const updateLoginResult = db.prepare(`
            UPDATE login_attempts 
            SET login_success = ?, detection_method = ?, error_message = ?, redirect_url = ?
            WHERE site_id = ? AND session_id = ? AND visitor_id = ? 
              AND login_success IS NULL
            ORDER BY timestamp DESC LIMIT 1
        `);

        // Mapa do przechowywania ID prób logowania w tej transakcji
        const loginAttemptIds = new Map<string, string>();

        // 8. Wykonaj transakcję
        const runTransaction = db.transaction(() => {
            if (events.length > 0) {
                const first = events[0];

                const newEventsCount = events.length;
                const newPageviewsCount = events.filter((e) => e.eventType === 'pageview').length;

                // Zapisz/aktualizuj sesję (z aktualizacją device_info jeśli mamy nową lokalizację)
                upsertSession.run(
                    first.sessionId,
                    first.siteId,
                    first.visitorId,
                    JSON.stringify(extendedDevice),
                    now,
                    now,
                    JSON.stringify(utm || {})
                );

                // Aktualizuj liczniki
                updateSession.run(now, newEventsCount, newPageviewsCount, first.sessionId);

                // Zapisz eventy
                for (const event of events) {
                    insertEvent.run(
                        event.id,
                        event.timestamp || now,
                        event.siteId,
                        event.sessionId,
                        event.visitorId,
                        event.eventType,
                        event.page?.path || '/',
                        JSON.stringify(event.data || {}),
                        now
                    );

                    // Jeśli to form_submit, zapisz również do tabeli form_submissions
                    if (event.eventType === 'form_submit' && event.data) {
                        const formData = event.data as Record<string, unknown>;
                        const formSubmissionId = 'form-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
                        
                        insertFormSubmission.run(
                            formSubmissionId,
                            event.timestamp || now,
                            event.siteId,
                            event.sessionId,
                            event.visitorId,
                            (formData.formId as string) || null,
                            (formData.formName as string) || null,
                            (formData.formAction as string) || null,
                            event.page?.url || null,
                            event.page?.path || '/',
                            JSON.stringify(formData.values || {}),
                            (formData.duration as number) || 0,
                            (formData.fieldsCount as number) || 0,
                            formData.hasFiles ? 1 : 0
                        );
                    }

                    // Jeśli to próba logowania, zapisz do tabeli login_attempts
                    if (event.eventType === 'login_attempt' && event.data) {
                        const loginData = event.data as Record<string, unknown>;
                        const loginAttemptId = 'login-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
                        
                        // Zapisz ID dla późniejszej aktualizacji wynikiem
                        const key = `${event.siteId}-${event.sessionId}-${event.visitorId}`;
                        loginAttemptIds.set(key, loginAttemptId);

                        insertLoginAttempt.run(
                            loginAttemptId,
                            event.timestamp || now,
                            event.siteId,
                            event.sessionId,
                            event.visitorId,
                            null, // form_submission_id - możemy powiązać później
                            (loginData.email as string) || null,
                            (loginData.username as string) || null,
                            (loginData.passwordLength as number) || 0,
                            event.page?.url || null,
                            event.page?.path || '/',
                            null, // login_success - jeszcze nieznane
                            null, // detection_method
                            null, // error_message
                            null, // redirect_url
                            null  // response_status
                        );
                    }

                    // Jeśli to wynik logowania, zaktualizuj rekord
                    if (event.eventType === 'login_result' && event.data) {
                        const resultData = event.data as Record<string, unknown>;
                        const success = resultData.success;
                        
                        updateLoginResult.run(
                            success === true ? 1 : (success === false ? 0 : null),
                            (resultData.detectionMethod as string) || 'unknown',
                            (resultData.errorMessage as string) || null,
                            (resultData.redirectUrl as string) || (resultData.endUrl as string) || null,
                            event.siteId,
                            event.sessionId,
                            event.visitorId
                        );
                    }
                }
            }
        });

        try {
            runTransaction();
            
            const response = { success: true, count: events.length };
            const responseSize = JSON.stringify(response).length;
            
            // Loguj sukces
            logCommunication({
                siteId,
                origin,
                ip,
                method: 'POST',
                endpoint: '/api/collect',
                statusCode: 200,
                requestSize,
                responseSize,
                durationMs: Date.now() - startTime,
                eventsCount,
                errorMessage: null,
                userAgent,
                sessionId,
                visitorId
            });
            
            return NextResponse.json(
                response,
                {
                    headers: {
                        'X-RateLimit-Remaining': String(rateLimit.remaining),
                        'X-RateLimit-Reset': String(rateLimit.resetAt),
                    },
                }
            );
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            console.error('[API] Transaction failed:', errorMessage);
            
            const response = { status: 'error', message: 'Database error' };
            const responseSize = JSON.stringify(response).length;
            
            logCommunication({
                siteId,
                origin,
                ip,
                method: 'POST',
                endpoint: '/api/collect',
                statusCode: 500,
                requestSize,
                responseSize,
                durationMs: Date.now() - startTime,
                eventsCount,
                errorMessage: 'Database error: ' + errorMessage,
                userAgent,
                sessionId,
                visitorId
            });
            
            return NextResponse.json(
                response,
                { status: 500 }
            );
        }
    } catch (error) {
        console.error('Error in /api/collect:', error);
        
        const response = { status: 'error', message: 'Internal Server Error' };
        const responseSize = JSON.stringify(response).length;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        
        // Loguj błąd ogólny
        logCommunication({
            siteId: 'unknown',
            origin: null,
            ip: '0.0.0.0',
            method: 'POST',
            endpoint: '/api/collect',
            statusCode: 500,
            requestSize: 0,
            responseSize,
            durationMs: Date.now() - startTime,
            eventsCount: 0,
            errorMessage: 'Internal Server Error: ' + errorMsg,
            userAgent: null,
            sessionId: null,
            visitorId: null
        });
        
        return NextResponse.json(
            response,
            { status: 500 }
        );
    }
}

// Obsługa OPTIONS dla CORS preflight
export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}
