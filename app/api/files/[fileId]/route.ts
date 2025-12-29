import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { isAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ fileId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  // Sprawdź autoryzację
  if (!isAuthenticated(request)) {
    return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { fileId } = await params;
    const { searchParams } = new URL(request.url);
    const download = searchParams.get('download') === 'true';

    const db = getDb();

    // Pobierz plik z zawartością
    const file = db
      .prepare(
        `
            SELECT 
                id,
                timestamp,
                site_id,
                session_id,
                visitor_id,
                form_submission_id,
                field_name,
                file_name,
                file_type,
                file_size,
                file_extension,
                file_content,
                page_url,
                page_path,
                created_at
            FROM uploaded_files
            WHERE id = ?
        `,
      )
      .get(fileId) as
      | {
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
          file_content: Buffer | null;
          page_url: string | null;
          page_path: string | null;
          created_at: string;
        }
      | undefined;

    if (!file) {
      return NextResponse.json({ status: 'error', message: 'File not found' }, { status: 404 });
    }

    // Jeśli żądanie pobrania pliku binarnego
    if (download && file.file_content) {
      return new NextResponse(new Uint8Array(file.file_content), {
        headers: {
          'Content-Type': file.file_type || 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${file.file_name}"`,
          'Content-Length': String(file.file_size),
        },
      });
    }

    // Zwróć metadane i opcjonalnie zawartość jako base64
    const response: Record<string, unknown> = {
      id: file.id,
      timestamp: file.timestamp,
      siteId: file.site_id,
      sessionId: file.session_id,
      visitorId: file.visitor_id,
      formSubmissionId: file.form_submission_id,
      fieldName: file.field_name,
      fileName: file.file_name,
      fileType: file.file_type,
      fileSize: file.file_size,
      fileExtension: file.file_extension,
      pageUrl: file.page_url,
      pagePath: file.page_path,
      createdAt: file.created_at,
      hasContent: file.file_content !== null,
    };

    // Dodaj zawartość jako base64 jeśli jest
    if (file.file_content) {
      response.fileContent = `data:${file.file_type || 'application/octet-stream'};base64,${file.file_content.toString('base64')}`;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('[API/files/[fileId]] Error:', error);
    return NextResponse.json(
      { status: 'error', message: 'Internal Server Error' },
      { status: 500 },
    );
  }
}

// Endpoint do usuwania pliku
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  // Sprawdź autoryzację
  if (!isAuthenticated(request)) {
    return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { fileId } = await params;
    const db = getDb();

    // Sprawdź czy plik istnieje
    const file = db.prepare('SELECT id FROM uploaded_files WHERE id = ?').get(fileId);

    if (!file) {
      return NextResponse.json({ status: 'error', message: 'File not found' }, { status: 404 });
    }

    // Usuń plik
    db.prepare('DELETE FROM uploaded_files WHERE id = ?').run(fileId);

    return NextResponse.json({ success: true, message: 'File deleted' });
  } catch (error) {
    console.error('[API/files/[fileId]] DELETE Error:', error);
    return NextResponse.json(
      { status: 'error', message: 'Internal Server Error' },
      { status: 500 },
    );
  }
}
