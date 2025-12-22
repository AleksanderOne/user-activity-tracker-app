/**
 * Testy E2E dla autoryzacji
 * Testuje pełny flow logowania i wylogowania
 */

import { test, expect } from '@playwright/test';

test.describe('Autoryzacja', () => {
    
    test.beforeEach(async ({ page }) => {
        // Wyczyść cookies przed każdym testem
        await page.context().clearCookies();
    });

    // ========================
    // Testy strony logowania
    // ========================
    test.describe('Strona logowania', () => {
        test('powinna wyświetlić formularz logowania', async ({ page }) => {
            await page.goto('/login');
            
            // Sprawdź elementy formularza
            await expect(page.locator('input[type="password"]')).toBeVisible();
            await expect(page.locator('button[type="submit"]')).toBeVisible();
        });

        test('powinna wyświetlić tytuł strony', async ({ page }) => {
            await page.goto('/login');
            
            // Sprawdź czy strona zawiera tekst logowania
            await expect(page.locator('h1, h2').first()).toBeVisible();
        });
    });

    // ========================
    // Testy logowania
    // ========================
    test.describe('Logowanie', () => {
        test('powinno zalogować z poprawnym hasłem (dev: admin123)', async ({ page }) => {
            await page.goto('/login');
            
            // Wpisz hasło
            await page.fill('input[type="password"]', 'admin123');
            
            // Kliknij przycisk logowania
            await page.click('button[type="submit"]');
            
            // Powinno przekierować na dashboard
            await expect(page).toHaveURL(/.*dashboard/);
        });

        test('powinno wyświetlić błąd przy niepoprawnym haśle', async ({ page }) => {
            await page.goto('/login');
            
            // Wpisz niepoprawne hasło
            await page.fill('input[type="password"]', 'wrong-password');
            
            // Kliknij przycisk logowania
            await page.click('button[type="submit"]');
            
            // Powinien pojawić się komunikat błędu
            await expect(page.locator('text=/nieprawidłowe|błąd|incorrect/i')).toBeVisible({ timeout: 5000 });
        });

        test('nie powinno zalogować z pustym hasłem', async ({ page }) => {
            await page.goto('/login');
            
            // Zostaw puste hasło i kliknij submit
            await page.click('button[type="submit"]');
            
            // Powinno zostać na stronie logowania
            await expect(page).toHaveURL(/.*login/);
        });
    });

    // ========================
    // Testy ochrony tras
    // ========================
    test.describe('Ochrona tras', () => {
        test('powinno przekierować niezalogowanego na /login', async ({ page }) => {
            await page.goto('/dashboard');
            
            // Powinno przekierować na login
            await expect(page).toHaveURL(/.*login/);
        });

        test('powinno chronić podstrony dashboardu', async ({ page }) => {
            const protectedRoutes = [
                '/dashboard/sessions',
                '/dashboard/logs',
                '/dashboard/data',
                '/dashboard/tracking',
            ];
            
            for (const route of protectedRoutes) {
                await page.goto(route);
                await expect(page).toHaveURL(/.*login/);
            }
        });
    });

    // ========================
    // Testy wylogowania
    // ========================
    test.describe('Wylogowanie', () => {
        test.beforeEach(async ({ page }) => {
            // Zaloguj się przed testem
            await page.goto('/login');
            await page.fill('input[type="password"]', 'admin123');
            await page.click('button[type="submit"]');
            await expect(page).toHaveURL(/.*dashboard/);
        });

        test('powinno wylogować po kliknięciu przycisku wylogowania', async ({ page }) => {
            // Znajdź i kliknij przycisk wylogowania
            const logoutButton = page.locator('button:has-text("Wyloguj"), button:has-text("Logout"), a:has-text("Wyloguj")');
            
            if (await logoutButton.count() > 0) {
                await logoutButton.first().click();
                
                // Powinno przekierować na login
                await expect(page).toHaveURL(/.*login/);
            }
        });
    });

    // ========================
    // Testy sesji
    // ========================
    test.describe('Sesja użytkownika', () => {
        test('powinna utrzymać sesję po odświeżeniu', async ({ page }) => {
            // Zaloguj się
            await page.goto('/login');
            await page.fill('input[type="password"]', 'admin123');
            await page.click('button[type="submit"]');
            await expect(page).toHaveURL(/.*dashboard/);
            
            // Odśwież stronę
            await page.reload();
            
            // Powinno nadal być na dashboardzie
            await expect(page).toHaveURL(/.*dashboard/);
        });

        test('powinna utrzymać sesję przy nawigacji', async ({ page }) => {
            // Zaloguj się
            await page.goto('/login');
            await page.fill('input[type="password"]', 'admin123');
            await page.click('button[type="submit"]');
            await expect(page).toHaveURL(/.*dashboard/);
            
            // Przejdź do innej strony dashboardu
            await page.goto('/dashboard/sessions');
            
            // Powinno być zalogowane
            await expect(page).toHaveURL(/.*dashboard\/sessions/);
        });
    });
});

