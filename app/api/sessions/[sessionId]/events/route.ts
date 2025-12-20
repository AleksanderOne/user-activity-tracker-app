import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { SessionEvents } from '@/lib/types';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    try {
        const { sessionId } = await params;
        const db = getDb();

        const rows = db
            .prepare('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp')
            .all(sessionId) as any[];

        const events = rows.map((row) => ({
            id: row.id,
            timestamp: row.timestamp,
            event_type: row.event_type,
            url: row.url,
            path: row.path,
            title: row.title,
            data: row.data ? JSON.parse(row.data) : null,
        }));

        const result: SessionEvents = {
            session_id: sessionId,
            events,
        };

        return NextResponse.json(result);
    } catch (error) {
        console.error('Error in /api/sessions/[sessionId]/events:', error);
        return NextResponse.json(
            { status: 'error', message: 'Internal server error' },
            { status: 500 }
        );
    }
}
