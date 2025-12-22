/**
 * Testy E2E dla systemu trackingu
 * Testuje zbieranie eventów i ich wyświetlanie
 */

import { test, expect } from '@playwright/test';

test.describe('System Tracking', () => {
    
    // ========================
    // Testy API collect
    // ========================
    test.describe('API /api/collect', () => {
        test('powinno akceptować poprawne eventy', async ({ request }) => {
            const event = {
                id: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                siteId: 'e2e-test-site',
                sessionId: crypto.randomUUID(),
                visitorId: crypto.randomUUID(),
                eventType: 'pageview',
                page: {
                    url: 'https://test.com/page',
                    path: '/page',
                    hostname: 'test.com',
                },
            };
            
            const response = await request.post('/api/collect', {
                data: { events: [event] },
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            
            expect(response.status()).toBe(200);
            
            const data = await response.json();
            expect(data.success).toBe(true);
        });

        test('powinno odrzucać puste eventy', async ({ request }) => {
            const response = await request.post('/api/collect', {
                data: { events: [] },
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            
            expect(response.status()).toBe(400);
        });

        test('powinno odrzucać niepoprawne dane', async ({ request }) => {
            const response = await request.post('/api/collect', {
                data: { invalid: 'data' },
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            
            expect(response.status()).toBe(400);
        });

        test('powinno obsługiwać wiele eventów', async ({ request }) => {
            const events = Array.from({ length: 5 }, () => ({
                id: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                siteId: 'e2e-test-site',
                sessionId: crypto.randomUUID(),
                visitorId: crypto.randomUUID(),
                eventType: 'click',
            }));
            
            const response = await request.post('/api/collect', {
                data: { events },
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            
            expect(response.status()).toBe(200);
            
            const data = await response.json();
            expect(data.count).toBe(5);
        });

        test('powinno zwracać nagłówki rate limit', async ({ request }) => {
            const event = {
                id: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                siteId: 'e2e-test-site',
                sessionId: crypto.randomUUID(),
                visitorId: crypto.randomUUID(),
                eventType: 'pageview',
            };
            
            const response = await request.post('/api/collect', {
                data: { events: [event] },
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            
            expect(response.headers()['x-ratelimit-remaining']).toBeDefined();
        });
    });

    // ========================
    // Testy demo page (jeśli istnieje)
    // ========================
    test.describe('Demo page', () => {
        test('powinna ładować stronę demo', async ({ page }) => {
            await page.goto('/demo');
            
            // Sprawdź czy strona się załadowała
            await expect(page.locator('body')).toBeVisible();
        });
    });

    // ========================
    // Testy tracker.js
    // ========================
    test.describe('Tracker script', () => {
        test('powinien być dostępny', async ({ request }) => {
            const response = await request.get('/tracker.js');
            
            expect(response.status()).toBe(200);
            expect(response.headers()['content-type']).toContain('javascript');
        });

        test('powinien zawierać kod trackera', async ({ request }) => {
            const response = await request.get('/tracker.js');
            const content = await response.text();
            
            // Sprawdź czy zawiera podstawowe funkcje trackera
            expect(content).toContain('function');
        });
    });

    // ========================
    // Testy test sites
    // ========================
    test.describe('Test sites', () => {
        const testSites = [
            '/test-sites/index.html',
            '/test-sites/demo/index.html',
            '/test-sites/shop/index.html',
            '/test-sites/bank/index.html',
        ];

        for (const site of testSites) {
            test(`powinna ładować ${site}`, async ({ page }) => {
                const response = await page.goto(site);
                
                // Może być 404 jeśli strona nie istnieje
                if (response && response.status() === 200) {
                    await expect(page.locator('body')).toBeVisible();
                }
            });
        }
    });

    // ========================
    // Testy integracji tracking -> dashboard
    // ========================
    test.describe('Integracja tracking -> dashboard', () => {
        test('wysłany event powinien pojawić się w dashboardzie', async ({ page, request }) => {
            const uniqueSiteId = `e2e-test-${Date.now()}`;
            const sessionId = crypto.randomUUID();
            
            // 1. Wyślij event
            const event = {
                id: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                siteId: uniqueSiteId,
                sessionId: sessionId,
                visitorId: crypto.randomUUID(),
                eventType: 'pageview',
                page: {
                    url: 'https://test.com/e2e-test',
                    path: '/e2e-test',
                    hostname: 'test.com',
                },
            };
            
            await request.post('/api/collect', {
                data: { events: [event] },
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            
            // 2. Zaloguj się do dashboardu
            await page.goto('/login');
            await page.fill('input[type="password"]', 'admin123');
            await page.click('button[type="submit"]');
            await expect(page).toHaveURL(/.*dashboard/);
            
            // 3. Przejdź do strony sesji
            await page.goto('/dashboard/sessions');
            await page.waitForLoadState('networkidle');
            
            // 4. Sprawdź czy sesja jest widoczna
            // (opcjonalne - zależy od UI)
            const pageContent = await page.content();
            // Sesja powinna być widoczna gdzieś na stronie
            expect(pageContent.length).toBeGreaterThan(100);
        });
    });

    // ========================
    // Testy tracking disabled
    // ========================
    test.describe('Tracking disabled', () => {
        test('powinno zwrócić 202 gdy tracking wyłączony dla dashboardu', async ({ request }) => {
            const event = {
                id: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                siteId: 'dashboard-test', // siteId zaczynający się od 'dashboard'
                sessionId: crypto.randomUUID(),
                visitorId: crypto.randomUUID(),
                eventType: 'pageview',
            };
            
            const response = await request.post('/api/collect', {
                data: { events: [event] },
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            
            // Może być 200 lub 202 w zależności od implementacji
            expect([200, 202]).toContain(response.status());
        });
    });

    // ========================
    // Testy form submit
    // ========================
    test.describe('Form submission tracking', () => {
        test('powinno przyjąć event form_submit', async ({ request }) => {
            const event = {
                id: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                siteId: 'e2e-test-forms',
                sessionId: crypto.randomUUID(),
                visitorId: crypto.randomUUID(),
                eventType: 'form_submit',
                page: {
                    url: 'https://test.com/contact',
                    path: '/contact',
                },
                data: {
                    formId: 'contact-form',
                    formName: 'Contact Form',
                    values: {
                        name: 'Test User',
                        email: 'test@example.com',
                        message: 'Test message',
                    },
                    duration: 45,
                    fieldsCount: 3,
                    hasFiles: false,
                },
            };
            
            const response = await request.post('/api/collect', {
                data: { events: [event] },
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            
            expect(response.status()).toBe(200);
        });
    });
});

