import { NextRequest, NextResponse } from 'next/server';
import { getDb, RemoteCommand } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

// Generuje UUID v4
function generateId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

/**
 * GET /api/commands
 * Pobiera komendy do wykonania dla danej strony/sesji
 * Używane przez tracker.js do pollowania komend
 * 
 * Query params:
 * - site_id: ID strony (wymagane)
 * - session_id: ID sesji (opcjonalne)
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const siteId = searchParams.get('site_id');
        const sessionId = searchParams.get('session_id');
        
        if (!siteId) {
            return NextResponse.json(
                { error: 'Brak site_id' },
                { status: 400 }
            );
        }
        
        const db = getDb();
        const now = new Date().toISOString();
        
        // Pobierz niewykonane komendy dla tej strony/sesji
        // Komendy bez session_id = dla wszystkich sesji na tej stronie
        // Komendy z session_id = tylko dla konkretnej sesji
        const commands = db.prepare(`
            SELECT id, command_type, payload, created_at, expires_at
            FROM remote_commands
            WHERE site_id = ?
              AND executed = 0
              AND (session_id IS NULL OR session_id = ?)
              AND (expires_at IS NULL OR expires_at > ?)
            ORDER BY created_at ASC
        `).all(siteId, sessionId || '', now) as RemoteCommand[];
        
        // Oznacz komendy jako wykonane
        if (commands.length > 0) {
            const ids = commands.map(c => c.id);
            const placeholders = ids.map(() => '?').join(',');
            db.prepare(`
                UPDATE remote_commands
                SET executed = 1, executed_at = ?
                WHERE id IN (${placeholders})
            `).run(now, ...ids);
        }
        
        // Parsuj payload każdej komendy
        const parsedCommands = commands.map(cmd => ({
            id: cmd.id,
            type: cmd.command_type,
            payload: JSON.parse(cmd.payload || '{}'),
            created_at: cmd.created_at
        }));
        
        return NextResponse.json({
            commands: parsedCommands,
            timestamp: now
        });
        
    } catch (error) {
        console.error('Błąd pobierania komend:', error);
        return NextResponse.json(
            { error: 'Błąd serwera' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/commands
 * Wysyła nową komendę do strony/sesji
 * Wymaga autoryzacji (sesja administratora)
 * 
 * Body:
 * - site_id: ID strony (wymagane)
 * - session_id: ID sesji (opcjonalne - jeśli brak, dotyczy wszystkich)
 * - command_type: Typ komendy (wymagane)
 * - payload: Obiekt z parametrami komendy
 * - expires_in: Czas wygaśnięcia w sekundach (opcjonalne)
 */
export async function POST(request: NextRequest) {
    try {
        // Sprawdź autoryzację - używamy tokenu JWT z cookie dashboard_token
        const authToken = request.cookies.get('dashboard_token')?.value;
        if (!authToken || !verifyToken(authToken)) {
            return NextResponse.json(
                { error: 'Brak autoryzacji' },
                { status: 401 }
            );
        }
        
        const body = await request.json();
        const { site_id, session_id, command_type, payload, expires_in } = body;
        
        if (!site_id || !command_type) {
            return NextResponse.json(
                { error: 'Brak wymaganych pól: site_id, command_type' },
                { status: 400 }
            );
        }
        
        const db = getDb();
        const now = new Date();
        const id = generateId();
        
        // Oblicz czas wygaśnięcia
        let expiresAt: string | null = null;
        if (expires_in && typeof expires_in === 'number') {
            expiresAt = new Date(now.getTime() + expires_in * 1000).toISOString();
        }
        
        // Zapisz komendę
        db.prepare(`
            INSERT INTO remote_commands (id, created_at, site_id, session_id, command_type, payload, expires_at, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            id,
            now.toISOString(),
            site_id,
            session_id || null,
            command_type,
            JSON.stringify(payload || {}),
            expiresAt,
            'admin' // TODO: można rozbudować o rzeczywistą nazwę użytkownika
        );
        
        return NextResponse.json({
            success: true,
            command_id: id,
            message: `Komenda "${command_type}" wysłana do ${session_id ? `sesji ${session_id}` : `wszystkich sesji na ${site_id}`}`
        });
        
    } catch (error) {
        console.error('Błąd wysyłania komendy:', error);
        return NextResponse.json(
            { error: 'Błąd serwera' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/commands
 * Anuluje/usuwa komendy
 * Wymaga autoryzacji
 * 
 * Query params:
 * - id: ID konkretnej komendy do usunięcia (opcjonalne)
 * - site_id: Usuń wszystkie komendy dla strony (opcjonalne)
 * - pending_only: Usuń tylko niewykonane (opcjonalne, domyślnie true)
 */
export async function DELETE(request: NextRequest) {
    try {
        // Sprawdź autoryzację - używamy tokenu JWT z cookie dashboard_token
        const authToken = request.cookies.get('dashboard_token')?.value;
        if (!authToken || !verifyToken(authToken)) {
            return NextResponse.json(
                { error: 'Brak autoryzacji' },
                { status: 401 }
            );
        }
        
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const siteId = searchParams.get('site_id');
        const pendingOnly = searchParams.get('pending_only') !== 'false';
        
        const db = getDb();
        let result;
        
        if (id) {
            // Usuń konkretną komendę
            result = db.prepare('DELETE FROM remote_commands WHERE id = ?').run(id);
        } else if (siteId) {
            // Usuń komendy dla strony
            if (pendingOnly) {
                result = db.prepare('DELETE FROM remote_commands WHERE site_id = ? AND executed = 0').run(siteId);
            } else {
                result = db.prepare('DELETE FROM remote_commands WHERE site_id = ?').run(siteId);
            }
        } else {
            return NextResponse.json(
                { error: 'Podaj id lub site_id' },
                { status: 400 }
            );
        }
        
        return NextResponse.json({
            success: true,
            deleted: result.changes
        });
        
    } catch (error) {
        console.error('Błąd usuwania komend:', error);
        return NextResponse.json(
            { error: 'Błąd serwera' },
            { status: 500 }
        );
    }
}

