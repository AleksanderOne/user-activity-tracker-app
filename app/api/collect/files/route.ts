import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { verifyApiToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Maksymalny rozmiar pliku (5MB w base64)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Funkcja generująca UUID
function generateId(): string {
    return 'file-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
}

// Interfejs dla danych pliku
interface FileUploadPayload {
    sessionId: string;
    visitorId: string;
    siteId: string;
    page: {
        url?: string;
        path?: string;
    };
    file: {
        fieldName: string;
        fileName: string;
        fileType: string;
        fileSize: number;
        fileExtension: string | null;
        fileContent: string | null; // Base64
        formId: string | null;
        formAction: string | null;
        reason?: string;
    };
    timestamp: string;
}

// Walidacja payloadu
function validatePayload(body: unknown): { success: true; data: FileUploadPayload } | { success: false; error: string } {
    if (!body || typeof body !== 'object') {
        return { success: false, error: 'Invalid payload' };
    }

    const payload = body as Record<string, unknown>;

    if (!payload.sessionId || typeof payload.sessionId !== 'string') {
        return { success: false, error: 'Missing or invalid sessionId' };
    }

    if (!payload.visitorId || typeof payload.visitorId !== 'string') {
        return { success: false, error: 'Missing or invalid visitorId' };
    }

    if (!payload.siteId || typeof payload.siteId !== 'string') {
        return { success: false, error: 'Missing or invalid siteId' };
    }

    if (!payload.file || typeof payload.file !== 'object') {
        return { success: false, error: 'Missing or invalid file data' };
    }

    const file = payload.file as Record<string, unknown>;

    if (!file.fileName || typeof file.fileName !== 'string') {
        return { success: false, error: 'Missing or invalid fileName' };
    }

    // Sprawdź rozmiar pliku
    if (file.fileContent && typeof file.fileContent === 'string') {
        // Base64 string - przybliżony rozmiar oryginalnego pliku
        const estimatedSize = Math.floor(file.fileContent.length * 0.75);
        if (estimatedSize > MAX_FILE_SIZE) {
            return { success: false, error: 'File too large (max 5MB)' };
        }
    }

    return {
        success: true,
        data: {
            sessionId: payload.sessionId as string,
            visitorId: payload.visitorId as string,
            siteId: payload.siteId as string,
            page: (payload.page as { url?: string; path?: string }) || {},
            file: {
                fieldName: (file.fieldName as string) || 'file',
                fileName: file.fileName as string,
                fileType: (file.fileType as string) || 'application/octet-stream',
                fileSize: (file.fileSize as number) || 0,
                fileExtension: (file.fileExtension as string) || null,
                fileContent: (file.fileContent as string) || null,
                formId: (file.formId as string) || null,
                formAction: (file.formAction as string) || null,
                reason: file.reason as string | undefined
            },
            timestamp: (payload.timestamp as string) || new Date().toISOString()
        }
    };
}

export async function POST(request: NextRequest) {
    const startTime = Date.now();

    try {
        // 1. Pobierz IP
        let ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? '127.0.0.1';
        if (ip.includes(',')) ip = ip.split(',')[0].trim();
        if (ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');

        // 2. Rate limiting (bardziej restrykcyjny dla plików)
        const rateLimit = checkRateLimit(`files:${ip}`, { 
            maxRequests: 30, // 30 plików na minutę
            windowMs: 60 * 1000 
        });

        if (!rateLimit.allowed) {
            return NextResponse.json(
                { status: 'error', message: 'Rate limit exceeded' },
                {
                    status: 429,
                    headers: {
                        'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
                    },
                }
            );
        }

        // 3. Weryfikacja API tokenu
        const apiToken = request.headers.get('x-api-token');
        if (!verifyApiToken(apiToken)) {
            return NextResponse.json(
                { status: 'error', message: 'Invalid or missing API token' },
                { status: 401 }
            );
        }

        // 4. Parsuj i waliduj dane
        const body = await request.json();
        const validation = validatePayload(body);

        if (!validation.success) {
            return NextResponse.json(
                { status: 'error', message: validation.error },
                { status: 400 }
            );
        }

        const { sessionId, visitorId, siteId, page, file, timestamp } = validation.data;

        // 5. Zdekoduj base64 do Buffer (jeśli jest zawartość)
        let fileContentBuffer: Buffer | null = null;
        if (file.fileContent) {
            try {
                // Usuń prefix data:xxx/xxx;base64,
                const base64Data = file.fileContent.replace(/^data:[^;]+;base64,/, '');
                fileContentBuffer = Buffer.from(base64Data, 'base64');
            } catch (err) {
                console.warn('[API/files] Failed to decode base64:', err);
                // Kontynuuj bez zawartości pliku
            }
        }

        // 6. Zapisz do bazy danych
        const db = getDb();
        const fileId = generateId();

        const insertFile = db.prepare(`
            INSERT INTO uploaded_files 
            (id, timestamp, site_id, session_id, visitor_id, form_submission_id, 
             field_name, file_name, file_type, file_size, file_extension, 
             file_content, page_url, page_path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        insertFile.run(
            fileId,
            timestamp,
            siteId,
            sessionId,
            visitorId,
            null, // form_submission_id - będzie linkowane później jeśli potrzeba
            file.fieldName,
            file.fileName,
            file.fileType,
            file.fileSize,
            file.fileExtension,
            fileContentBuffer,
            page.url || null,
            page.path || null
        );

        const durationMs = Date.now() - startTime;

        console.log(`[API/files] Saved file: ${file.fileName} (${file.fileSize} bytes) in ${durationMs}ms`);

        return NextResponse.json(
            { 
                success: true, 
                fileId: fileId,
                fileName: file.fileName,
                fileSize: file.fileSize,
                hasContent: fileContentBuffer !== null
            },
            {
                headers: {
                    'X-RateLimit-Remaining': String(rateLimit.remaining),
                },
            }
        );

    } catch (error) {
        console.error('[API/files] Error:', error);
        
        return NextResponse.json(
            { status: 'error', message: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

// Obsługa OPTIONS dla CORS preflight
export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}

