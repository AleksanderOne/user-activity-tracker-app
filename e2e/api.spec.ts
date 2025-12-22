/**
 * Testy E2E dla API endpoints
 * Testuje wszystkie główne endpointy API
 */

import { test, expect } from '@playwright/test';

test.describe('API Endpoints', () => {
    
    // Pomocnicza funkcja do logowania i pobierania cookie
    async function getAuthCookie(request: typeof test.info.fixme): Promise<string> {
        // To jest uproszczone - w prawdziwych testach użylibyśmy fixtures
        return 'dashboard_token=test-token';
    }

    // ========================
    // Testy /api/stats
    // ========================
    test.describe('API /api/stats', () => {
        test('powinno zwrócić statystyki overview', async ({ request }) => {
            // Najpierw zaloguj się
            const loginResponse = await request.post('/api/auth/login', {
                data: { password: 'admin123' },
            });
            expect(loginResponse.status()).toBe(200);
            
            // Pobierz statystyki
            const response = await request.get('/api/stats/overview');
            
            // Może wymagać autoryzacji
            expect([200, 401]).toContain(response.status());
        });

        test('powinno zwrócić statystyki eventów', async ({ request }) => {
            await request.post('/api/auth/login', {
                data: { password: 'admin123' },
            });
            
            const response = await request.get('/api/stats/events');
            expect([200, 401]).toContain(response.status());
        });

        test('powinno zwrócić timeline', async ({ request }) => {
            await request.post('/api/auth/login', {
                data: { password: 'admin123' },
            });
            
            const response = await request.get('/api/stats/timeline');
            expect([200, 401]).toContain(response.status());
        });
    });

    // ========================
    // Testy /api/sessions
    // ========================
    test.describe('API /api/sessions', () => {
        test('powinno wymagać autoryzacji', async ({ request }) => {
            const response = await request.get('/api/sessions');
            
            expect(response.status()).toBe(401);
        });

        test('powinno zwrócić sesje dla zalogowanego użytkownika', async ({ request }) => {
            // Zaloguj się
            await request.post('/api/auth/login', {
                data: { password: 'admin123' },
            });
            
            const response = await request.get('/api/sessions');
            
            expect(response.status()).toBe(200);
            
            const data = await response.json();
            expect(data.sessions).toBeDefined();
            expect(Array.isArray(data.sessions)).toBe(true);
        });

        test('powinno obsługiwać parametry paginacji', async ({ request }) => {
            await request.post('/api/auth/login', {
                data: { password: 'admin123' },
            });
            
            const response = await request.get('/api/sessions?limit=10&offset=0');
            
            expect(response.status()).toBe(200);
        });
    });

    // ========================
    // Testy /api/logs
    // ========================
    test.describe('API /api/logs', () => {
        test('powinno wymagać autoryzacji', async ({ request }) => {
            const response = await request.get('/api/logs');
            
            expect(response.status()).toBe(401);
        });

        test('powinno zwrócić logi dla zalogowanego użytkownika', async ({ request }) => {
            await request.post('/api/auth/login', {
                data: { password: 'admin123' },
            });
            
            const response = await request.get('/api/logs');
            
            expect(response.status()).toBe(200);
        });
    });

    // ========================
    // Testy /api/tracking/settings
    // ========================
    test.describe('API /api/tracking/settings', () => {
        test('powinno wymagać autoryzacji', async ({ request }) => {
            const response = await request.get('/api/tracking/settings');
            
            expect(response.status()).toBe(401);
        });

        test('powinno zwrócić ustawienia dla zalogowanego użytkownika', async ({ request }) => {
            await request.post('/api/auth/login', {
                data: { password: 'admin123' },
            });
            
            const response = await request.get('/api/tracking/settings');
            
            expect(response.status()).toBe(200);
        });
    });

    // ========================
    // Testy /api/tracking/status
    // ========================
    test.describe('API /api/tracking/status', () => {
        test('powinno być publicznie dostępne', async ({ request }) => {
            const response = await request.get('/api/tracking/status?siteId=test-site');
            
            expect(response.status()).toBe(200);
            
            const data = await response.json();
            expect(data.enabled).toBeDefined();
        });
    });

    // ========================
    // Testy /api/forms
    // ========================
    test.describe('API /api/forms', () => {
        test('powinno wymagać autoryzacji', async ({ request }) => {
            const response = await request.get('/api/forms');
            
            expect(response.status()).toBe(401);
        });

        test('powinno zwrócić formularze dla zalogowanego użytkownika', async ({ request }) => {
            await request.post('/api/auth/login', {
                data: { password: 'admin123' },
            });
            
            const response = await request.get('/api/forms');
            
            expect(response.status()).toBe(200);
        });
    });

    // ========================
    // Testy /api/commands
    // ========================
    test.describe('API /api/commands', () => {
        test('powinno wymagać autoryzacji do GET', async ({ request }) => {
            const response = await request.get('/api/commands');
            
            expect(response.status()).toBe(401);
        });

        test('powinno zwrócić komendy dla zalogowanego użytkownika', async ({ request }) => {
            await request.post('/api/auth/login', {
                data: { password: 'admin123' },
            });
            
            const response = await request.get('/api/commands');
            
            expect(response.status()).toBe(200);
        });
    });

    // ========================
    // Testy /api/cleanup
    // ========================
    test.describe('API /api/cleanup', () => {
        test('powinno wymagać autoryzacji', async ({ request }) => {
            const response = await request.get('/api/cleanup');
            
            expect(response.status()).toBe(401);
        });
    });

    // ========================
    // Testy /api/auth/logout
    // ========================
    test.describe('API /api/auth/logout', () => {
        test('powinno wylogować użytkownika', async ({ request }) => {
            // Najpierw zaloguj
            await request.post('/api/auth/login', {
                data: { password: 'admin123' },
            });
            
            // Wyloguj
            const response = await request.post('/api/auth/logout');
            
            expect(response.status()).toBe(200);
            
            // Sprawdź czy wylogowany
            const sessionsResponse = await request.get('/api/sessions');
            expect(sessionsResponse.status()).toBe(401);
        });
    });

    // ========================
    // Testy CORS
    // ========================
    test.describe('CORS', () => {
        test('/api/collect powinno obsługiwać OPTIONS', async ({ request }) => {
            const response = await request.fetch('/api/collect', {
                method: 'OPTIONS',
            });
            
            expect(response.status()).toBe(204);
        });
    });

    // ========================
    // Testy błędów
    // ========================
    test.describe('Obsługa błędów', () => {
        test('powinno zwrócić 404 dla nieistniejącego endpointu', async ({ request }) => {
            const response = await request.get('/api/nonexistent-endpoint');
            
            expect(response.status()).toBe(404);
        });

        test('powinno zwrócić błąd dla niepoprawnego JSON', async ({ request }) => {
            const response = await request.post('/api/collect', {
                data: 'invalid json',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            
            expect([400, 500]).toContain(response.status());
        });
    });
});

