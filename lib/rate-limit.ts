/**
 * Prosty rate limiter oparty na pamięci
 * W produkcji lepiej użyć Redis
 */

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

// Mapa przechowująca limity dla IP
const rateLimitMap = new Map<string, RateLimitEntry>();

// Czyść stare wpisy co 5 minut
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitMap.entries()) {
        if (entry.resetAt < now) {
            rateLimitMap.delete(key);
        }
    }
}, 5 * 60 * 1000);

export interface RateLimitConfig {
    maxRequests: number;      // Maksymalna liczba requestów
    windowMs: number;         // Okno czasowe w ms
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: number;
}

/**
 * Sprawdza rate limit dla danego klucza (np. IP)
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
    const now = Date.now();
    const entry = rateLimitMap.get(key);

    // Jeśli nie ma wpisu lub okno wygasło - resetuj
    if (!entry || entry.resetAt < now) {
        const newEntry: RateLimitEntry = {
            count: 1,
            resetAt: now + config.windowMs,
        };
        rateLimitMap.set(key, newEntry);
        return {
            allowed: true,
            remaining: config.maxRequests - 1,
            resetAt: newEntry.resetAt,
        };
    }

    // Inkrementuj licznik
    entry.count++;

    // Sprawdź czy przekroczono limit
    if (entry.count > config.maxRequests) {
        return {
            allowed: false,
            remaining: 0,
            resetAt: entry.resetAt,
        };
    }

    return {
        allowed: true,
        remaining: config.maxRequests - entry.count,
        resetAt: entry.resetAt,
    };
}

// Domyślne konfiguracje
export const RATE_LIMITS = {
    // Dla /api/collect - 100 requestów na minutę na IP
    collect: {
        maxRequests: 100,
        windowMs: 60 * 1000,
    },
    // Dla logowania - 5 prób na 15 minut
    login: {
        maxRequests: 5,
        windowMs: 15 * 60 * 1000,
    },
    // Dla API stats - 60 requestów na minutę
    stats: {
        maxRequests: 60,
        windowMs: 60 * 1000,
    },
} as const;

