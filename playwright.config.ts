import { defineConfig, devices } from '@playwright/test';

/**
 * Konfiguracja Playwright dla testów E2E
 */
export default defineConfig({
    // Katalog z testami E2E
    testDir: './e2e',
    
    // Maksymalny czas na pojedynczy test
    timeout: 30 * 1000,
    
    // Timeout dla expect
    expect: {
        timeout: 5000,
    },
    
    // Pełne tracowanie przy błędach
    fullyParallel: true,
    
    // Nie powtarzaj testów przy błędzie na CI
    forbidOnly: !!process.env.CI,
    
    // Powtórzenia przy błędzie
    retries: process.env.CI ? 2 : 0,
    
    // Liczba workerów
    workers: process.env.CI ? 1 : undefined,
    
    // Reporter
    reporter: 'html',
    
    // Wspólne ustawienia dla wszystkich projektów
    use: {
        // Base URL dla testów
        baseURL: 'http://localhost:3000',
        
        // Tracowanie przy pierwszym powtórzeniu
        trace: 'on-first-retry',
        
        // Screenshot przy błędzie
        screenshot: 'only-on-failure',
    },
    
    // Konfiguracja przeglądarek
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
        },
        {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
        },
    ],
    
    // Uruchom serwer deweloperski przed testami
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
    },
});

