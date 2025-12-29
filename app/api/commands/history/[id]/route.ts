import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Brak ID komendy' }, { status: 400 });
    }

    const db = getDb();

    // Sprawdź czy komenda istnieje
    const existing = db
      .prepare(
        `
            SELECT id FROM commands WHERE id = ?
        `,
      )
      .get(id);

    if (!existing) {
      return NextResponse.json({ error: 'Komenda nie znaleziona' }, { status: 404 });
    }

    // Usuń komendę
    db.prepare(`DELETE FROM commands WHERE id = ?`).run(id);

    return NextResponse.json({
      success: true,
      message: 'Komenda usunięta z historii',
    });
  } catch (error) {
    console.error('Error deleting command:', error);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Brak ID komendy' }, { status: 400 });
    }

    const db = getDb();

    const command = db
      .prepare(
        `
            SELECT * FROM commands WHERE id = ?
        `,
      )
      .get(id);

    if (!command) {
      return NextResponse.json({ error: 'Komenda nie znaleziona' }, { status: 404 });
    }

    return NextResponse.json(command);
  } catch (error) {
    console.error('Error getting command:', error);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}
