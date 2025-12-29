import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { isAuthenticated } from '@/lib/auth';

// Typy dla wyników zapytań
interface QueryResult {
  success: boolean;
  data?: Record<string, unknown>[];
  columns?: string[];
  rowCount?: number;
  changes?: number;
  error?: string;
  executionTime?: number;
  queryType?: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'OTHER';
}

// Lista tabel systemowych
interface TableInfo {
  name: string;
  type: string;
  columns: ColumnInfo[];
  rowCount: number;
}

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

// Pobieranie listy tabel i ich struktury
export async function GET(req: NextRequest) {
  // Sprawdzenie autoryzacji
  const authResult = await isAuthenticated(req);
  if (!authResult) {
    return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 });
  }

  try {
    const db = getDb();

    // Pobierz listę tabel
    const tables = db
      .prepare(
        `
            SELECT name, type FROM sqlite_master 
            WHERE type IN ('table', 'view') 
            AND name NOT LIKE 'sqlite_%'
            ORDER BY type DESC, name ASC
        `,
      )
      .all() as { name: string; type: string }[];

    // Pobierz strukturę każdej tabeli
    const tablesWithInfo: TableInfo[] = tables.map((table) => {
      // Pobierz kolumny
      const columns = db.prepare(`PRAGMA table_info("${table.name}")`).all() as ColumnInfo[];

      // Pobierz liczbę wierszy
      const countResult = db.prepare(`SELECT COUNT(*) as count FROM "${table.name}"`).get() as {
        count: number;
      };

      return {
        name: table.name,
        type: table.type,
        columns,
        rowCount: countResult.count,
      };
    });

    return NextResponse.json({
      tables: tablesWithInfo,
      databaseInfo: {
        totalTables: tables.filter((t) => t.type === 'table').length,
        totalViews: tables.filter((t) => t.type === 'view').length,
        version: db.prepare('SELECT sqlite_version() as version').get() as { version: string },
      },
    });
  } catch (error) {
    console.error('Błąd pobierania struktury bazy:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Nieznany błąd',
      },
      { status: 500 },
    );
  }
}

// Wykonywanie zapytania SQL
export async function POST(req: NextRequest) {
  // Sprawdzenie autoryzacji
  const authResult = await isAuthenticated(req);
  if (!authResult) {
    return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { query, params = [] } = body as { query: string; params?: unknown[] };

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: 'Brak zapytania SQL',
        } as QueryResult,
        { status: 400 },
      );
    }

    // Trim i podstawowa walidacja
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return NextResponse.json(
        {
          success: false,
          error: 'Puste zapytanie SQL',
        } as QueryResult,
        { status: 400 },
      );
    }

    const db = getDb();
    const startTime = performance.now();

    // Określ typ zapytania
    const upperQuery = trimmedQuery.toUpperCase();
    let queryType: QueryResult['queryType'] = 'OTHER';

    if (
      upperQuery.startsWith('SELECT') ||
      upperQuery.startsWith('PRAGMA') ||
      upperQuery.startsWith('EXPLAIN')
    ) {
      queryType = 'SELECT';
    } else if (upperQuery.startsWith('INSERT')) {
      queryType = 'INSERT';
    } else if (upperQuery.startsWith('UPDATE')) {
      queryType = 'UPDATE';
    } else if (upperQuery.startsWith('DELETE')) {
      queryType = 'DELETE';
    }

    let result: QueryResult;

    if (queryType === 'SELECT') {
      // Zapytania SELECT - zwracamy dane
      const stmt = db.prepare(trimmedQuery);
      const data = params.length > 0 ? stmt.all(...params) : stmt.all();

      // Pobierz nazwy kolumn
      const columns = data.length > 0 ? Object.keys(data[0] as object) : [];

      result = {
        success: true,
        data: data as Record<string, unknown>[],
        columns,
        rowCount: data.length,
        executionTime: Math.round(performance.now() - startTime),
        queryType,
      };
    } else {
      // Zapytania modyfikujące (INSERT, UPDATE, DELETE)
      const stmt = db.prepare(trimmedQuery);
      const info = params.length > 0 ? stmt.run(...params) : stmt.run();

      result = {
        success: true,
        changes: info.changes,
        rowCount: info.changes,
        executionTime: Math.round(performance.now() - startTime),
        queryType,
      };
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Błąd wykonywania zapytania SQL:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Nieznany błąd SQL',
        executionTime: 0,
      } as QueryResult,
      { status: 400 },
    );
  }
}
