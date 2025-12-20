/**
 * Cache dla GeoIP z TTL
 * Unika nadmiernych wywołań do zewnętrznego API
 */

interface GeoInfo {
    country: string;
    city: string;
    isp: string;
    org: string;
    query: string;
}

interface CacheEntry {
    data: GeoInfo;
    expiresAt: number;
}

// Cache w pamięci (w produkcji użyj Redis)
const geoCache = new Map<string, CacheEntry>();

// TTL dla cache - 24 godziny
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Czyść stare wpisy co godzinę
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of geoCache.entries()) {
        if (entry.expiresAt < now) {
            geoCache.delete(key);
        }
    }
}, 60 * 60 * 1000);

// Rate limiting dla API - max 40 req/min (ip-api.com limit to 45)
let apiCallCount = 0;
let apiCallResetAt = Date.now() + 60000;

function canMakeApiCall(): boolean {
    const now = Date.now();
    if (now > apiCallResetAt) {
        apiCallCount = 0;
        apiCallResetAt = now + 60000;
    }
    return apiCallCount < 40;
}

function recordApiCall(): void {
    apiCallCount++;
}

/**
 * Pobiera informacje GeoIP z cache lub API
 */
export async function getGeoInfo(ip: string): Promise<GeoInfo | null> {
    // Ignoruj localhost i prywatne IP
    if (isPrivateIP(ip)) {
        return {
            country: 'Lokalna Sieć',
            city: 'Lokalne',
            isp: 'Prywatna',
            org: 'Lokalny',
            query: ip,
        };
    }

    // Sprawdź cache
    const cached = geoCache.get(ip);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
    }

    // Sprawdź rate limit
    if (!canMakeApiCall()) {
        console.warn('[GeoIP] Rate limit exceeded, skipping API call');
        return null;
    }

    try {
        // Użyj HTTPS przez proxy lub alternatywnego API
        // ip-api.com nie wspiera HTTPS w darmowej wersji, więc używamy ipapi.co
        const res = await fetch(`https://ipapi.co/${ip}/json/`, {
            signal: AbortSignal.timeout(3000),
            headers: {
                'User-Agent': 'ActivityTracker/1.0',
            },
        });

        recordApiCall();

        if (!res.ok) {
            // Fallback do ip-api.com (HTTP)
            const fallbackRes = await fetch(
                `http://ip-api.com/json/${ip}?fields=status,country,city,isp,org,query`,
                { signal: AbortSignal.timeout(2000) }
            );
            if (fallbackRes.ok) {
                const fallbackData = await fallbackRes.json();
                if (fallbackData.status === 'success') {
                    const geoInfo: GeoInfo = {
                        country: fallbackData.country || 'Unknown',
                        city: fallbackData.city || 'Unknown',
                        isp: fallbackData.isp || 'Unknown',
                        org: fallbackData.org || 'Unknown',
                        query: ip,
                    };
                    cacheGeoInfo(ip, geoInfo);
                    return geoInfo;
                }
            }
            return null;
        }

        const data = await res.json();

        // ipapi.co format
        const geoInfo: GeoInfo = {
            country: data.country_name || data.country || 'Unknown',
            city: data.city || 'Unknown',
            isp: data.org || 'Unknown',
            org: data.org || 'Unknown',
            query: ip,
        };

        cacheGeoInfo(ip, geoInfo);
        return geoInfo;
    } catch (error) {
        console.error('[GeoIP] Lookup failed:', error);
        return null;
    }
}

function cacheGeoInfo(ip: string, data: GeoInfo): void {
    geoCache.set(ip, {
        data,
        expiresAt: Date.now() + CACHE_TTL_MS,
    });
}

function isPrivateIP(ip: string): boolean {
    // Obsługa localhost i loopback
    if (ip === '::1' || ip === '127.0.0.1' || ip === 'localhost') {
        return true;
    }
    
    // Obsługa IPv6-mapped IPv4 (::ffff:x.x.x.x)
    const ipv4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
    
    // Prywatne zakresy IPv4: 10.x.x.x, 172.16-31.x.x, 192.168.x.x
    if (ipv4.startsWith('10.') || ipv4.startsWith('192.168.')) {
        return true;
    }
    
    // Sprawdź zakres 172.16.0.0 - 172.31.255.255
    if (ipv4.startsWith('172.')) {
        const secondOctet = parseInt(ipv4.split('.')[1], 10);
        if (secondOctet >= 16 && secondOctet <= 31) {
            return true;
        }
    }
    
    return false;
}

/**
 * Zwraca statystyki cache (do debugowania)
 */
export function getCacheStats(): { size: number; apiCallsThisMinute: number } {
    return {
        size: geoCache.size,
        apiCallsThisMinute: apiCallCount,
    };
}

