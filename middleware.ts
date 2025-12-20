import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// Dozwolone domeny dla CORS - ustaw w zmiennych środowiskowych
// Format: "https://example.com,https://app.example.com"
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : [];

// W trybie development - akceptuj wszystko
const isDevelopment = process.env.NODE_ENV !== 'production';

// Sekret JWT - musi być taki sam jak w lib/auth.ts
const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-key-change-in-production';

// Konwersja sekret do Uint8Array (wymagane przez jose)
const secretKey = new TextEncoder().encode(JWT_SECRET);

// Weryfikacja tokenu JWT w middleware (kompatybilna z Edge Runtime)
async function verifyTokenInMiddleware(token: string): Promise<boolean> {
    try {
        const { payload } = await jwtVerify(token, secretKey);
        return payload.type === 'dashboard';
    } catch {
        return false;
    }
}

export async function middleware(request: NextRequest) {
    const origin = request.headers.get('origin') || '';

    // Sprawdzenie czy użytkownik jest zalogowany (pełna weryfikacja JWT)
    const authToken = request.cookies.get('dashboard_token')?.value;
    const isAuthenticated = authToken ? await verifyTokenInMiddleware(authToken) : false;

    // Jeśli próbuje dostać się do dashboard bez logowania - przekieruj na login
    if (request.nextUrl.pathname.startsWith('/dashboard') && !isAuthenticated) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // Jeśli jest już zalogowany i próbuje dostać się do login - przekieruj na dashboard
    if (request.nextUrl.pathname === '/login' && isAuthenticated) {
        return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    // Obsługa CORS dla API
    if (request.nextUrl.pathname.startsWith('/api/')) {
        // Obsługa preflight OPTIONS
        if (request.method === 'OPTIONS') {
            const response = new NextResponse(null, { status: 204 });
            setCorsHeaders(response, origin);
            return response;
        }

        const response = NextResponse.next();
        setCorsHeaders(response, origin);
        return response;
    }

    return NextResponse.next();
}

function setCorsHeaders(response: NextResponse, origin: string): void {
    // W development akceptuj wszystko
    if (isDevelopment) {
        response.headers.set('Access-Control-Allow-Origin', origin || '*');
    } else {
        // W produkcji sprawdź czy origin jest dozwolony
        if (ALLOWED_ORIGINS.length === 0) {
            // Brak skonfigurowanych domen - akceptuj wszystko z ostrzeżeniem
            response.headers.set('Access-Control-Allow-Origin', origin || '*');
        } else if (ALLOWED_ORIGINS.includes(origin)) {
            response.headers.set('Access-Control-Allow-Origin', origin);
        } else {
            // Origin nie jest dozwolony - nie ustawiaj nagłówka CORS
            // Przeglądarka zablokuje request
            return;
        }
    }

    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Token');
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Max-Age', '86400'); // Cache preflight na 24h
}

export const config = {
    matcher: ['/api/:path*', '/dashboard/:path*', '/login'],
};
