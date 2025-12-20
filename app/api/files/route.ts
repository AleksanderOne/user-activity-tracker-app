import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { isAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    // Sprawdź autoryzację
    if (!isAuthenticated(request)) {
        return NextResponse.json(
            { status: 'error', message: 'Unauthorized' },
            { status: 401 }
        );
    }

    try {
        const { searchParams } = new URL(request.url);
        const siteId = searchParams.get('site_id');
        const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
        const offset = parseInt(searchParams.get('offset') || '0');
        const days = parseInt(searchParams.get('days') || '7');
        const withContent = searchParams.get('with_content') === 'true';

        const db = getDb();
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

        // Kolumny do pobrania (bez zawartości pliku domyślnie)
        const contentColumn = withContent ? ', uf.file_content' : '';

        let query = `
            SELECT 
                uf.id,
                uf.timestamp,
                uf.site_id,
                uf.session_id,
                uf.visitor_id,
                uf.form_submission_id,
                uf.field_name,
                uf.file_name,
                uf.file_type,
                uf.file_size,
                uf.file_extension,
                uf.page_url,
                uf.page_path,
                uf.created_at,
                CASE WHEN uf.file_content IS NOT NULL THEN 1 ELSE 0 END as has_content
                ${contentColumn}
            FROM uploaded_files uf
            WHERE uf.timestamp >= ?
        `;

        const params: (string | number)[] = [since];

        if (siteId) {
            query += ' AND uf.site_id = ?';
            params.push(siteId);
        }

        query += ' ORDER BY uf.timestamp DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const files = db.prepare(query).all(...params) as Array<{
            id: string;
            timestamp: string;
            site_id: string;
            session_id: string;
            visitor_id: string;
            form_submission_id: string | null;
            field_name: string | null;
            file_name: string;
            file_type: string | null;
            file_size: number;
            file_extension: string | null;
            page_url: string | null;
            page_path: string | null;
            created_at: string;
            has_content: number;
            file_content?: Buffer;
        }>;

        // Konwertuj zawartość pliku do base64 jeśli jest
        const processedFiles = files.map(file => {
            const result: Record<string, unknown> = {
                ...file,
                has_content: file.has_content === 1
            };

            if (withContent && file.file_content) {
                result.file_content = `data:${file.file_type || 'application/octet-stream'};base64,${file.file_content.toString('base64')}`;
            } else {
                delete result.file_content;
            }

            return result;
        });

        // Pobierz statystyki
        let statsQuery = `
            SELECT 
                COUNT(*) as total_files,
                COUNT(DISTINCT visitor_id) as unique_visitors,
                SUM(file_size) as total_size,
                SUM(CASE WHEN file_content IS NOT NULL THEN 1 ELSE 0 END) as with_content,
                COUNT(DISTINCT file_extension) as unique_extensions
            FROM uploaded_files
            WHERE timestamp >= ?
        `;

        const statsParams: (string | number)[] = [since];

        if (siteId) {
            statsQuery += ' AND site_id = ?';
            statsParams.push(siteId);
        }

        const stats = db.prepare(statsQuery).get(...statsParams) as {
            total_files: number;
            unique_visitors: number;
            total_size: number;
            with_content: number;
            unique_extensions: number;
        };

        // Pobierz najpopularniejsze typy plików
        let typesQuery = `
            SELECT 
                file_extension,
                COUNT(*) as count,
                SUM(file_size) as total_size
            FROM uploaded_files
            WHERE timestamp >= ? AND file_extension IS NOT NULL
        `;

        const typesParams: (string | number)[] = [since];

        if (siteId) {
            typesQuery += ' AND site_id = ?';
            typesParams.push(siteId);
        }

        typesQuery += ' GROUP BY file_extension ORDER BY count DESC LIMIT 10';

        const fileTypes = db.prepare(typesQuery).all(...typesParams) as Array<{
            file_extension: string;
            count: number;
            total_size: number;
        }>;

        return NextResponse.json({
            files: processedFiles,
            stats: {
                totalFiles: stats.total_files,
                uniqueVisitors: stats.unique_visitors,
                totalSize: stats.total_size || 0,
                withContent: stats.with_content,
                uniqueExtensions: stats.unique_extensions
            },
            fileTypes,
            pagination: {
                limit,
                offset,
                hasMore: files.length === limit
            }
        });

    } catch (error) {
        console.error('[API/files] Error:', error);
        return NextResponse.json(
            { status: 'error', message: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

