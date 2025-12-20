import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface EventRow {
    id: string;
    timestamp: string;
    site_id: string;
    session_id: string;
    visitor_id: string;
    event_type: string;
    path: string | null;
    data: string | null;
    created_at: string;
}

interface SessionRow {
    session_id: string;
    visitor_id: string;
    site_id: string;
    started_at: string;
    last_activity: string | null;
    device_info: string | null;
    utm_params: string | null;
    ip_hash: string | null;
    page_count: number;
    event_count: number;
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    try {
        const { sessionId } = await params;

        // Walidacja sessionId - musi wyglądać jak UUID
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(sessionId)) {
            return NextResponse.json(
                { status: 'error', message: 'Invalid session ID format' },
                { status: 400 }
            );
        }

        const db = getDb();

        // Pobierz dane sesji
        const session = db.prepare(`
            SELECT * FROM sessions WHERE session_id = ?
        `).get(sessionId) as SessionRow | undefined;

        // Pobierz eventy
        const events = db.prepare(`
            SELECT * FROM events 
            WHERE session_id = ? 
            ORDER BY created_at ASC
        `).all(sessionId) as EventRow[];

        // Parsuj eventy
        const parsedEvents = events.map(e => {
            let payload = {};
            try {
                payload = JSON.parse(e.data || '{}');
            } catch {
                payload = {};
            }

            return {
                id: e.id,
                timestamp: e.timestamp,
                event_type: e.event_type,
                page_path: e.path,
                created_at: e.created_at,
                payload,
            };
        });

        // Oblicz statystyki
        const stats = {
            total_events: parsedEvents.length,
            pageviews: 0,
            clicks: 0,
            inputs: 0,
            forms: 0,
            rage_clicks: 0,
            errors: 0,
            scrolls: 0,
            clipboard_actions: 0,
            text_selections: 0,
            total_keystrokes: 0,
            total_input_time_ms: 0,
            unique_pages: new Set<string>(),
            event_types: {} as Record<string, number>,
            first_event: parsedEvents[0]?.created_at || null,
            last_event: parsedEvents[parsedEvents.length - 1]?.created_at || null,
        };

        // Przeanalizuj eventy
        const inputData: Array<{field: string; value: string; keystrokes: number; duration: number}> = [];
        const pageFlow: Array<{path: string; time: string; duration?: number}> = [];
        const clickHeatmap: Array<{x: number; y: number; element: string}> = [];
        const mousePath: Array<{time: string; positions: Array<{x: number; y: number; t: number}>; count: number}> = [];

        parsedEvents.forEach((e, idx) => {
            // Liczniki typów
            stats.event_types[e.event_type] = (stats.event_types[e.event_type] || 0) + 1;

            switch (e.event_type) {
                case 'pageview':
                    stats.pageviews++;
                    if (e.page_path) stats.unique_pages.add(e.page_path);
                    pageFlow.push({ 
                        path: e.page_path || '/', 
                        time: e.created_at,
                        duration: idx > 0 ? new Date(e.created_at).getTime() - new Date(parsedEvents[idx-1].created_at).getTime() : 0
                    });
                    break;
                case 'click':
                    stats.clicks++;
                    const clickPayload = e.payload as { x?: number; y?: number; tagName?: string; text?: string };
                    if (clickPayload.x && clickPayload.y) {
                        clickHeatmap.push({
                            x: clickPayload.x,
                            y: clickPayload.y,
                            element: `${clickPayload.tagName || 'unknown'}: ${(clickPayload.text || '').substring(0, 30)}`
                        });
                    }
                    break;
                case 'input_sequence':
                    stats.inputs++;
                    const inputPayload = e.payload as { fieldName?: string; fullValue?: string; keystrokes?: number; duration?: number };
                    stats.total_keystrokes += inputPayload.keystrokes || 0;
                    stats.total_input_time_ms += inputPayload.duration || 0;
                    inputData.push({
                        field: inputPayload.fieldName || 'unknown',
                        value: inputPayload.fullValue || '',
                        keystrokes: inputPayload.keystrokes || 0,
                        duration: inputPayload.duration || 0
                    });
                    break;
                case 'form_submit':
                case 'form_start':
                    stats.forms++;
                    break;
                case 'rage_click':
                    stats.rage_clicks++;
                    break;
                case 'error':
                    stats.errors++;
                    break;
                case 'scroll':
                case 'scroll_depth':
                    stats.scrolls++;
                    break;
                case 'clipboard_action':
                    stats.clipboard_actions++;
                    break;
                case 'text_selection':
                    stats.text_selections++;
                    break;
                case 'mouse_path':
                    const mousePayload = e.payload as { positions?: Array<{x: number; y: number; t: number}>; count?: number };
                    if (mousePayload.positions && mousePayload.positions.length > 0) {
                        mousePath.push({
                            time: e.created_at,
                            positions: mousePayload.positions,
                            count: mousePayload.count || mousePayload.positions.length
                        });
                    }
                    break;
            }
        });

        // Czas trwania sesji
        const duration = stats.first_event && stats.last_event 
            ? new Date(stats.last_event).getTime() - new Date(stats.first_event).getTime()
            : 0;

        // Parsuj device_info
        let deviceInfo = null;
        if (session?.device_info) {
            try {
                deviceInfo = JSON.parse(session.device_info);
            } catch {
                deviceInfo = null;
            }
        }

        // Parsuj UTM
        let utmParams = null;
        if (session?.utm_params) {
            try {
                utmParams = JSON.parse(session.utm_params);
            } catch {
                utmParams = null;
            }
        }

        return NextResponse.json({
            session: session ? {
                session_id: session.session_id,
                visitor_id: session.visitor_id,
                site_id: session.site_id,
                started_at: session.started_at,
                last_activity: session.last_activity,
                device_info: deviceInfo,
                utm_params: utmParams,
                ip_hash: session.ip_hash,
            } : null,
            events: parsedEvents,
            stats: {
                ...stats,
                unique_pages: stats.unique_pages.size,
                duration_ms: duration,
                duration_formatted: formatDuration(duration),
            },
            analysis: {
                input_data: inputData,
                page_flow: pageFlow,
                click_heatmap: clickHeatmap,
                mouse_path: mousePath,
            }
        });
    } catch (error) {
        console.error('Error fetching session events:', error);
        return NextResponse.json(
            { status: 'error', message: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}
