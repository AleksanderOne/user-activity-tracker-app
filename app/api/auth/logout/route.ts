import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
  try {
    const cookieStore = await cookies();

    // Usuń cookie z tokenem
    cookieStore.set('dashboard_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0, // Natychmiast wygaś
      path: '/',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Błąd wylogowania:', error);
    return NextResponse.json({ success: false, message: 'Błąd serwera' }, { status: 500 });
  }
}
