/**
 * Testy jednostkowe dla modułu autoryzacji
 * Testuje funkcje JWT, weryfikacji hasła i tokenów API
 */

// Mockowanie uuid przed importem auth
jest.mock('uuid', () => ({
    v4: () => 'mocked-uuid-value',
}));

import {
    verifyDashboardPassword,
    hashPassword,
    generateDashboardToken,
    verifyToken,
    verifyApiToken,
    generateApiToken,
    extractSiteIdFromToken,
} from '@/lib/auth';

describe('Autoryzacja', () => {
    
    // ========================
    // Testy weryfikacji hasła
    // ========================
    describe('verifyDashboardPassword', () => {
        // UWAGA: Zmienne środowiskowe są odczytywane podczas importu modułu,
        // więc testujemy z wartościami ustawionymi w jest.setup.js
        // process.env.DASHBOARD_PASSWORD = 'test-password' jest ustawione w setup

        it('powinien zaakceptować hasło ustawione w env (test-password)', async () => {
            const result = await verifyDashboardPassword('test-password');
            
            expect(result).toBe(true);
        });

        it('powinien odrzucić niepoprawne hasło', async () => {
            const result = await verifyDashboardPassword('wrong-password');
            
            expect(result).toBe(false);
        });

        it('powinien odrzucić puste hasło', async () => {
            const result = await verifyDashboardPassword('');
            
            expect(result).toBe(false);
        });

        it('powinien odrzucić hasło różniące się wielkością liter', async () => {
            const result = await verifyDashboardPassword('TEST-PASSWORD');
            
            expect(result).toBe(false);
        });
    });

    // ========================
    // Testy hashowania hasła
    // ========================
    describe('hashPassword', () => {
        it('powinien generować hash hasła', async () => {
            const password = 'test-password';
            
            const hash = await hashPassword(password);
            
            expect(hash).toBeDefined();
            expect(hash).not.toBe(password);
            expect(hash.startsWith('$2')).toBe(true); // bcrypt hash
        });

        it('powinien generować różne hashe dla tego samego hasła', async () => {
            const password = 'same-password';
            
            const hash1 = await hashPassword(password);
            const hash2 = await hashPassword(password);
            
            expect(hash1).not.toBe(hash2);
        });

        it('hash powinien mieć poprawną długość bcrypt', async () => {
            const password = 'my-password';
            const hash = await hashPassword(password);
            
            // Hash bcrypt ma zawsze 60 znaków
            expect(hash.length).toBe(60);
        });
    });

    // ========================
    // Testy JWT
    // ========================
    describe('JWT Token', () => {
        describe('generateDashboardToken', () => {
            it('powinien generować poprawny token JWT', () => {
                const token = generateDashboardToken();
                
                expect(token).toBeDefined();
                expect(typeof token).toBe('string');
                expect(token.split('.')).toHaveLength(3); // JWT ma 3 części
            });

            it('powinien generować weryfikowalny token', () => {
                const token = generateDashboardToken();
                const payload = verifyToken(token);
                
                expect(payload).not.toBeNull();
                expect(payload?.type).toBe('dashboard');
                expect(payload?.sub).toBe('dashboard');
            });
        });

        describe('verifyToken', () => {
            it('powinien zwrócić payload dla poprawnego tokenu', () => {
                const token = generateDashboardToken();
                
                const payload = verifyToken(token);
                
                expect(payload).not.toBeNull();
                expect(payload?.type).toBe('dashboard');
            });

            it('powinien zwrócić null dla niepoprawnego tokenu', () => {
                const invalidToken = 'invalid.jwt.token';
                
                const payload = verifyToken(invalidToken);
                
                expect(payload).toBeNull();
            });

            it('powinien zwrócić null dla pustego tokenu', () => {
                const payload = verifyToken('');
                
                expect(payload).toBeNull();
            });

            it('powinien zwrócić null dla zmodyfikowanego tokenu', () => {
                const token = generateDashboardToken();
                const modifiedToken = token.slice(0, -5) + 'xxxxx';
                
                const payload = verifyToken(modifiedToken);
                
                expect(payload).toBeNull();
            });

            it('powinien zawierać pola iat i exp', () => {
                const token = generateDashboardToken();
                
                const payload = verifyToken(token);
                
                expect(payload?.iat).toBeDefined();
                expect(payload?.exp).toBeDefined();
                expect(payload!.exp).toBeGreaterThan(payload!.iat);
            });
        });
    });

    // ========================
    // Testy API Token
    // ========================
    describe('API Token', () => {
        describe('generateApiToken', () => {
            it('powinien generować token w formacie siteId:secret', () => {
                const siteId = 'my-site';
                
                const token = generateApiToken(siteId);
                
                expect(token).toContain(':');
                expect(token.startsWith(`${siteId}:`)).toBe(true);
            });

            it('powinien generować token z częścią secret po dwukropku', () => {
                const siteId = 'test-site';
                
                const token = generateApiToken(siteId);
                const parts = token.split(':');
                
                expect(parts.length).toBe(2);
                expect(parts[0]).toBe(siteId);
                expect(parts[1].length).toBeGreaterThan(0);
            });
        });

        describe('extractSiteIdFromToken', () => {
            it('powinien wyciągnąć siteId z tokenu', () => {
                const siteId = 'my-website';
                const token = generateApiToken(siteId);
                
                const extracted = extractSiteIdFromToken(token);
                
                expect(extracted).toBe(siteId);
            });

            it('powinien zwrócić null dla niepoprawnego tokenu', () => {
                const invalidToken = 'no-colon-here';
                
                const extracted = extractSiteIdFromToken(invalidToken);
                
                expect(extracted).toBeNull();
            });

            it('powinien obsłużyć token z wieloma dwukropkami', () => {
                const token = 'site:secret:extra:parts';
                
                const extracted = extractSiteIdFromToken(token);
                
                expect(extracted).toBe('site');
            });
        });

        describe('verifyApiToken', () => {
            beforeEach(() => {
                // Bez skonfigurowanych tokenów - dev mode
                process.env.API_TOKENS = '';
            });

            it('powinien akceptować wszystko w dev mode bez skonfigurowanych tokenów', () => {
                const result = verifyApiToken('any-token');
                
                expect(result).toBe(true);
            });

            it('powinien akceptować null w dev mode', () => {
                const result = verifyApiToken(null);
                
                expect(result).toBe(true);
            });
        });
    });

    // ========================
    // Scenariusze bezpieczeństwa
    // ========================
    describe('Bezpieczeństwo', () => {
        it('nie powinien ujawniać sekretów w tokenie', () => {
            const token = generateDashboardToken();
            const parts = token.split('.');
            const payloadBase64 = parts[1];
            const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf8');
            const payload = JSON.parse(payloadJson);
            
            // Payload nie powinien zawierać wrażliwych danych
            expect(payload.password).toBeUndefined();
            expect(payload.secret).toBeUndefined();
        });

        it('hashe bcrypt powinny mieć odpowiednią siłę', async () => {
            const hash = await hashPassword('test');
            
            // Sprawdź czy używany jest odpowiedni cost factor (12)
            // Format: $2b$12$...
            const costFactor = parseInt(hash.split('$')[2], 10);
            expect(costFactor).toBeGreaterThanOrEqual(10);
        });
    });
});

