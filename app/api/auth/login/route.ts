import { NextRequest, NextResponse } from 'next/server';
import { verifyDashboardPassword, generateDashboardToken } from '@/lib/auth';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { LoginSchema } from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    // Pobierz IP dla rate limitingu
    let ip =
      request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown';
    if (ip.includes(',')) ip = ip.split(',')[0].trim();

    // Sprawdź rate limit
    const rateLimit = checkRateLimit(`login:${ip}`, RATE_LIMITS.login);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: 'Zbyt wiele prób logowania. Spróbuj ponownie później.',
          retryAfter: Math.ceil((rateLimit.resetAt - Date.now()) / 1000),
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
          },
        },
      );
    }

    // Walidacja danych wejściowych
    const body = await request.json();
    const parseResult = LoginSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { success: false, message: 'Nieprawidłowe dane wejściowe' },
        { status: 400 },
      );
    }

    const { password } = parseResult.data;

    // Weryfikacja hasła
    const isValid = await verifyDashboardPassword(password);

    if (isValid) {
      // Generuj JWT token
      const token = generateDashboardToken();

      // Stwórz odpowiedź z cookie
      const response = NextResponse.json({ success: true });

      // Ustaw cookie z tokenem JWT używając NextResponse
      response.cookies.set('dashboard_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 dni
        path: '/',
      });

      return response;
    } else {
      return NextResponse.json({ success: false, message: 'Nieprawidłowe hasło' }, { status: 401 });
    }
  } catch (error) {
    console.error('Błąd logowania:', error);
    return NextResponse.json({ success: false, message: 'Błąd serwera' }, { status: 500 });
  }
}
