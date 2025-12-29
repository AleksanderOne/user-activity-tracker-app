import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { isAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Sprawdź autoryzację
  if (!isAuthenticated(request)) {
    return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('site_id');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
    const offset = parseInt(searchParams.get('offset') || '0');
    const days = parseInt(searchParams.get('days') || '7');

    const db = getDb();
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Pobierz wysłane formularze
    let query = `
            SELECT 
                fs.id,
                fs.timestamp,
                fs.site_id,
                fs.session_id,
                fs.visitor_id,
                fs.form_id,
                fs.form_name,
                fs.form_action,
                fs.page_url,
                fs.page_path,
                fs.form_data,
                fs.fill_duration,
                fs.fields_count,
                fs.has_files,
                fs.created_at
            FROM form_submissions fs
            WHERE fs.timestamp >= ?
        `;

    const params: (string | number)[] = [since];

    if (siteId) {
      query += ' AND fs.site_id = ?';
      params.push(siteId);
    }

    query += ' ORDER BY fs.timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const forms = db.prepare(query).all(...params) as Array<{
      id: string;
      timestamp: string;
      site_id: string;
      session_id: string;
      visitor_id: string;
      form_id: string | null;
      form_name: string | null;
      form_action: string | null;
      page_url: string | null;
      page_path: string | null;
      form_data: string;
      fill_duration: number;
      fields_count: number;
      has_files: number;
      created_at: string;
    }>;

    // Parsuj JSON form_data
    const parsedForms = forms.map((form) => ({
      ...form,
      form_data: JSON.parse(form.form_data || '{}'),
      has_files: form.has_files === 1,
    }));

    // Pobierz statystyki
    let statsQuery = `
            SELECT 
                COUNT(*) as total_submissions,
                COUNT(DISTINCT visitor_id) as unique_visitors,
                COUNT(DISTINCT form_id) as unique_forms,
                SUM(CASE WHEN has_files = 1 THEN 1 ELSE 0 END) as with_files,
                AVG(fill_duration) as avg_fill_duration
            FROM form_submissions
            WHERE timestamp >= ?
        `;

    const statsParams: (string | number)[] = [since];

    if (siteId) {
      statsQuery += ' AND site_id = ?';
      statsParams.push(siteId);
    }

    const stats = db.prepare(statsQuery).get(...statsParams) as {
      total_submissions: number;
      unique_visitors: number;
      unique_forms: number;
      with_files: number;
      avg_fill_duration: number;
    };

    return NextResponse.json({
      forms: parsedForms,
      stats: {
        totalSubmissions: stats.total_submissions,
        uniqueVisitors: stats.unique_visitors,
        uniqueForms: stats.unique_forms,
        withFiles: stats.with_files,
        avgFillDuration: Math.round(stats.avg_fill_duration || 0),
      },
      pagination: {
        limit,
        offset,
        hasMore: forms.length === limit,
      },
    });
  } catch (error) {
    console.error('[API/forms] Error:', error);
    return NextResponse.json(
      { status: 'error', message: 'Internal Server Error' },
      { status: 500 },
    );
  }
}
