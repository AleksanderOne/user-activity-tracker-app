import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Funkcja generująca UUID
function generateLogId(): string {
    return 'ping-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
}

/**
 * GET /api/logs/ping - Endpoint do testowania połączenia
 * Strony mogą użyć tego endpointu aby sprawdzić czy komunikacja działa
 * Query params:
 *   - site_id: ID strony (opcjonalnie)
 */
export async function GET(request: NextRequest) {
    const startTime = Date.now();
    const origin = request.headers.get('origin') || request.headers.get('referer') || null;
    const userAgent = request.headers.get('user-agent') || null;
    
    // Pobierz IP
    let ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? '127.0.0.1';
    if (ip.includes(',')) ip = ip.split(',')[0].trim();
    if (ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('site_id') || 'ping-test';

    try {
        const db = getDb();
        
        // Zapisz log pinga
        const insertLog = db.prepare(`
            INSERT INTO communication_logs 
            (id, timestamp, site_id, origin, ip, method, endpoint, status_code, 
             request_size, response_size, duration_ms, events_count, error_message, 
             user_agent, session_id, visitor_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const response = {
            status: 'ok',
            message: 'Połączenie z backendem działa poprawnie',
            timestamp: new Date().toISOString(),
            site_id: siteId,
            server_time: Date.now(),
            your_ip: ip
        };
        
        const responseSize = JSON.stringify(response).length;
        const durationMs = Date.now() - startTime;

        insertLog.run(
            generateLogId(),
            new Date().toISOString(),
            siteId,
            origin,
            ip,
            'GET',
            '/api/logs/ping',
            200,
            0,
            responseSize,
            durationMs,
            0,
            null,
            userAgent,
            null,
            null
        );

        return NextResponse.json(response, {
            headers: {
                'X-Response-Time': `${durationMs}ms`
            }
        });

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[API/logs/ping] Error:', error);
        
        return NextResponse.json({
            status: 'error',
            message: 'Błąd serwera',
            error: errorMsg,
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
}

/**
 * POST /api/logs/ping - Endpoint do testowania połączenia (POST)
 * Alternatywna metoda dla stron które preferują POST
 */
export async function POST(request: NextRequest) {
    const startTime = Date.now();
    const origin = request.headers.get('origin') || request.headers.get('referer') || null;
    const userAgent = request.headers.get('user-agent') || null;
    
    // Pobierz IP
    let ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? '127.0.0.1';
    if (ip.includes(',')) ip = ip.split(',')[0].trim();
    if (ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');

    try {
        const body = await request.json().catch(() => ({}));
        const siteId = body.site_id || 'ping-test';
        const requestSize = JSON.stringify(body).length;

        const db = getDb();
        
        // Zapisz log pinga
        const insertLog = db.prepare(`
            INSERT INTO communication_logs 
            (id, timestamp, site_id, origin, ip, method, endpoint, status_code, 
             request_size, response_size, duration_ms, events_count, error_message, 
             user_agent, session_id, visitor_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const response = {
            status: 'ok',
            message: 'Połączenie z backendem działa poprawnie',
            timestamp: new Date().toISOString(),
            site_id: siteId,
            server_time: Date.now(),
            your_ip: ip,
            received_data: !!body.site_id
        };
        
        const responseSize = JSON.stringify(response).length;
        const durationMs = Date.now() - startTime;

        insertLog.run(
            generateLogId(),
            new Date().toISOString(),
            siteId,
            origin,
            ip,
            'POST',
            '/api/logs/ping',
            200,
            requestSize,
            responseSize,
            durationMs,
            0,
            null,
            userAgent,
            null,
            null
        );

        return NextResponse.json(response, {
            headers: {
                'X-Response-Time': `${durationMs}ms`
            }
        });

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[API/logs/ping] Error:', error);
        
        return NextResponse.json({
            status: 'error',
            message: 'Błąd serwera',
            error: errorMsg,
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
}

// Obsługa OPTIONS dla CORS preflight
export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}

