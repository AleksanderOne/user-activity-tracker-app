import { NextRequest, NextResponse } from 'next/server';
import { isTrackingEnabled } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tracking/status
 * Publiczny endpoint dla tracker.js - sprawdza czy śledzenie jest włączone dla danego site_id
 *
 * Query params:
 * - site_id: string (wymagane)
 *
 * Zwraca:
 * - enabled: boolean - czy tracker powinien wysyłać dane
 * - message: string - opcjonalny komunikat
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('site_id');

    if (!siteId) {
      return NextResponse.json(
        {
          enabled: true, // Domyślnie włączone jeśli nie podano site_id
          message: 'Brak site_id - domyślnie włączone',
        },
        {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        },
      );
    }

    const enabled = isTrackingEnabled(siteId);

    return NextResponse.json(
      {
        enabled,
        site_id: siteId,
        message: enabled ? 'Śledzenie aktywne' : 'Śledzenie wstrzymane przez administratora',
      },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      },
    );
  } catch (error) {
    console.error('[API/tracking/status] Error:', error);
    // W razie błędu - domyślnie włączone (bezpieczne podejście)
    return NextResponse.json(
      {
        enabled: true,
        message: 'Błąd sprawdzania - domyślnie włączone',
      },
      {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      },
    );
  }
}

// CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
