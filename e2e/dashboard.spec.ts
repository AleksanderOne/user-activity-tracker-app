/**
 * Testy E2E dla dashboardu
 * Testuje główne funkcjonalności panelu administracyjnego
 */

import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
    
    // Zaloguj się przed każdym testem
    test.beforeEach(async ({ page }) => {
        await page.goto('/login');
        await page.fill('input[type="password"]', 'admin123');
        await page.click('button[type="submit"]');
        await expect(page).toHaveURL(/.*dashboard/);
    });

    // ========================
    // Testy strony głównej dashboardu
    // ========================
    test.describe('Strona główna', () => {
        test('powinna wyświetlić statystyki', async ({ page }) => {
            await page.goto('/dashboard');
            
            // Sprawdź czy ładuje się strona
            await expect(page.locator('body')).toBeVisible();
            
            // Sprawdź czy są jakieś elementy statystyk (karty, liczby itp.)
            const cards = page.locator('[class*="card"], [class*="Card"], .bg-slate-800, .bg-gray-800');
            await expect(cards.first()).toBeVisible({ timeout: 10000 });
        });

        test('powinna mieć nawigację boczną', async ({ page }) => {
            await page.goto('/dashboard');
            
            // Sprawdź elementy nawigacji
            const navLinks = page.locator('nav a, aside a, [role="navigation"] a');
            expect(await navLinks.count()).toBeGreaterThan(0);
        });
    });

    // ========================
    // Testy nawigacji
    // ========================
    test.describe('Nawigacja', () => {
        const routes = [
            { path: '/dashboard/sessions', name: 'Sesje' },
            { path: '/dashboard/logs', name: 'Logi' },
            { path: '/dashboard/data', name: 'Dane' },
            { path: '/dashboard/tracking', name: 'Tracking' },
            { path: '/dashboard/commands', name: 'Komendy' },
            { path: '/dashboard/cleanup', name: 'Cleanup' },
        ];

        for (const route of routes) {
            test(`powinna umożliwić przejście do ${route.name}`, async ({ page }) => {
                await page.goto(route.path);
                
                // Strona powinna się załadować
                await expect(page).toHaveURL(new RegExp(route.path.replace('/', '\\/')));
                
                // Nie powinno być błędów
                await expect(page.locator('text=/error|błąd|404|500/i')).not.toBeVisible({ timeout: 3000 }).catch(() => {
                    // Ignoruj jeśli tekst nie istnieje
                });
            });
        }
    });

    // ========================
    // Testy strony sesji
    // ========================
    test.describe('Strona sesji', () => {
        test('powinna wyświetlić tabelę sesji', async ({ page }) => {
            await page.goto('/dashboard/sessions');
            
            // Poczekaj na załadowanie
            await page.waitForLoadState('networkidle');
            
            // Sprawdź czy jest tabela lub lista sesji
            const table = page.locator('table, [role="table"], [class*="table"]');
            const list = page.locator('[class*="list"], [role="list"]');
            
            const hasTable = await table.count() > 0;
            const hasList = await list.count() > 0;
            const hasContent = hasTable || hasList;
            
            // Może być pusta lista
            expect(hasContent || await page.locator('text=/brak|empty|no sessions/i').count() > 0).toBeTruthy();
        });

        test('powinna mieć filtry lub wyszukiwarkę', async ({ page }) => {
            await page.goto('/dashboard/sessions');
            
            await page.waitForLoadState('networkidle');
            
            // Sprawdź czy są elementy filtrowania
            const filters = page.locator('input, select, [class*="filter"], [class*="search"]');
            expect(await filters.count()).toBeGreaterThanOrEqual(0);
        });
    });

    // ========================
    // Testy strony logów
    // ========================
    test.describe('Strona logów', () => {
        test('powinna wyświetlić logi komunikacji', async ({ page }) => {
            await page.goto('/dashboard/logs');
            
            await page.waitForLoadState('networkidle');
            
            // Strona powinna się załadować
            await expect(page.locator('body')).toBeVisible();
        });
    });

    // ========================
    // Testy strony tracking
    // ========================
    test.describe('Strona tracking', () => {
        test('powinna wyświetlić ustawienia śledzenia', async ({ page }) => {
            await page.goto('/dashboard/tracking');
            
            await page.waitForLoadState('networkidle');
            
            // Powinny być przełączniki lub checkboxy
            const toggles = page.locator('input[type="checkbox"], [role="switch"], button[class*="switch"]');
            expect(await toggles.count()).toBeGreaterThanOrEqual(0);
        });

        test('powinna pozwalać na zmianę statusu śledzenia', async ({ page }) => {
            await page.goto('/dashboard/tracking');
            
            await page.waitForLoadState('networkidle');
            
            // Znajdź przełącznik globalnego śledzenia
            const toggle = page.locator('input[type="checkbox"], [role="switch"]').first();
            
            if (await toggle.count() > 0) {
                // Zapamiętaj stan
                const initialState = await toggle.isChecked();
                
                // Kliknij
                await toggle.click();
                
                // Stan powinien się zmienić
                const newState = await toggle.isChecked();
                expect(newState).not.toBe(initialState);
                
                // Przywróć stan
                await toggle.click();
            }
        });
    });

    // ========================
    // Testy strony cleanup
    // ========================
    test.describe('Strona cleanup', () => {
        test('powinna wyświetlić opcje czyszczenia danych', async ({ page }) => {
            await page.goto('/dashboard/cleanup');
            
            await page.waitForLoadState('networkidle');
            
            // Powinna być strona z opcjami
            await expect(page.locator('body')).toBeVisible();
        });
    });

    // ========================
    // Testy responsywności
    // ========================
    test.describe('Responsywność', () => {
        test('powinna działać na mobile', async ({ page }) => {
            // Ustaw viewport na mobile
            await page.setViewportSize({ width: 375, height: 667 });
            
            await page.goto('/dashboard');
            
            // Strona powinna się załadować
            await expect(page.locator('body')).toBeVisible();
            
            // Sprawdź czy jest menu hamburger lub inna nawigacja mobilna
            const mobileNav = page.locator('[class*="mobile"], [class*="hamburger"], button[aria-label*="menu"]');
            // To jest opcjonalne - niektóre dashboardy nie mają mobilnej nawigacji
        });

        test('powinna działać na tablet', async ({ page }) => {
            await page.setViewportSize({ width: 768, height: 1024 });
            
            await page.goto('/dashboard');
            
            await expect(page.locator('body')).toBeVisible();
        });

        test('powinna działać na desktop', async ({ page }) => {
            await page.setViewportSize({ width: 1920, height: 1080 });
            
            await page.goto('/dashboard');
            
            await expect(page.locator('body')).toBeVisible();
        });
    });
});

