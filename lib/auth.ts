import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { NextRequest } from 'next/server';

// Sekret JWT - MUSI być ustawiony w zmiennych środowiskowych w produkcji
// W development używamy stałego sekretu aby uniknąć problemów z hot-reload
const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-key-change-in-production';

// Hasło dashboardu - MUSI być ustawione w zmiennych środowiskowych
const DASHBOARD_PASSWORD_HASH = process.env.DASHBOARD_PASSWORD_HASH;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD;

// Pobiera API Tokeny dynamicznie z env
function getApiTokens(): Set<string> {
  return new Set((process.env.API_TOKENS || '').split(',').filter(Boolean));
}

export interface JwtPayload {
  sub: string;
  type: 'dashboard' | 'api';
  iat: number;
  exp: number;
}

/**
 * Weryfikuje hasło dashboardu
 */
export async function verifyDashboardPassword(password: string): Promise<boolean> {
  // Jeśli mamy hash hasła w env - użyj bcrypt
  if (DASHBOARD_PASSWORD_HASH) {
    return bcryptjs.compare(password, DASHBOARD_PASSWORD_HASH);
  }

  // Fallback na plain text (tylko dla developmentu!)
  if (DASHBOARD_PASSWORD) {
    // W produkcji loguj ostrzeżenie
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '[SECURITY] Używasz plain text hasła w produkcji! Ustaw DASHBOARD_PASSWORD_HASH.',
      );
    }
    return password === DASHBOARD_PASSWORD;
  }

  // Domyślne hasło tylko w development
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      '[SECURITY] Używasz domyślnego hasła! Ustaw DASHBOARD_PASSWORD lub DASHBOARD_PASSWORD_HASH.',
    );
    return password === 'admin123';
  }

  // W produkcji bez hasła - odmów dostępu
  return false;
}

/**
 * Generuje hash hasła (do użycia przy ustawianiu hasła)
 */
export async function hashPassword(password: string): Promise<string> {
  return bcryptjs.hash(password, 12);
}

/**
 * Generuje JWT token dla sesji dashboardu
 */
export function generateDashboardToken(): string {
  const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
    sub: 'dashboard',
    type: 'dashboard',
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '7d',
  });
}

/**
 * Weryfikuje JWT token
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Sprawdza czy podany API token jest prawidłowy
 * Token może być w formacie: siteId:secretToken
 */
export function verifyApiToken(token: string | null): boolean {
  const tokens = getApiTokens();
  // Jeśli nie skonfigurowano tokenów - akceptuj wszystko (development mode)
  if (tokens.size === 0) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[SECURITY] Brak skonfigurowanych API_TOKENS w produkcji!');
    }
    return true;
  }

  if (!token) {
    return false;
  }

  return getApiTokens().has(token);
}

/**
 * Generuje nowy API token dla strony
 */
export function generateApiToken(siteId: string): string {
  const secret = uuidv4();
  return `${siteId}:${secret}`;
}

/**
 * Wyciąga siteId z tokenu API
 */
export function extractSiteIdFromToken(token: string): string | null {
  const parts = token.split(':');
  if (parts.length >= 2) {
    return parts[0];
  }
  return null;
}

/**
 * Sprawdza czy request pochodzi od zalogowanego użytkownika dashboardu
 * Na podstawie cookie dashboard_token
 */
export function isAuthenticated(request: NextRequest): boolean {
  const authToken = request.cookies.get('dashboard_token')?.value;

  if (!authToken) {
    return false;
  }

  // Weryfikuj token JWT
  const payload = verifyToken(authToken);

  if (!payload) {
    return false;
  }

  // Sprawdź czy to token dashboardu
  return payload.type === 'dashboard';
}
