/**
 * Testy jednostkowe dla modułu walidacji
 * Testuje schematy Zod i funkcje pomocnicze
 */

import { 
    validateCollectPayload, 
    CollectPayloadSchema,
    LoginSchema 
} from '@/lib/validation';

// Pomocnicza funkcja generująca UUID (zamiast uuid package który ma problemy z ESM)
function uuidv4(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

describe('Walidacja danych', () => {
    
    // ========================
    // Testy CollectPayloadSchema
    // ========================
    describe('CollectPayloadSchema', () => {
        
        // Pomocnicza funkcja do generowania poprawnego eventu
        const createValidEvent = (overrides = {}) => ({
            id: uuidv4(),
            timestamp: new Date().toISOString(),
            siteId: 'test-site',
            sessionId: uuidv4(),
            visitorId: uuidv4(),
            eventType: 'pageview',
            ...overrides,
        });

        describe('Poprawne dane', () => {
            it('powinien zaakceptować minimalny poprawny payload', () => {
                const payload = {
                    events: [createValidEvent()],
                };
                
                const result = CollectPayloadSchema.safeParse(payload);
                
                expect(result.success).toBe(true);
            });

            it('powinien zaakceptować pełny payload z device i utm', () => {
                const payload = {
                    events: [createValidEvent()],
                    device: {
                        userAgent: 'Mozilla/5.0 Test',
                        language: 'pl-PL',
                        screenWidth: 1920,
                        screenHeight: 1080,
                        platform: 'MacIntel',
                    },
                    utm: {
                        utm_source: 'google',
                        utm_medium: 'cpc',
                        utm_campaign: 'test-campaign',
                    },
                };
                
                const result = CollectPayloadSchema.safeParse(payload);
                
                expect(result.success).toBe(true);
            });

            it('powinien zaakceptować wiele eventów (do 100)', () => {
                const events = Array.from({ length: 50 }, () => createValidEvent());
                const payload = { events };
                
                const result = CollectPayloadSchema.safeParse(payload);
                
                expect(result.success).toBe(true);
            });

            it('powinien zaakceptować event z danymi dodatkowymi', () => {
                const payload = {
                    events: [createValidEvent({
                        data: {
                            buttonId: 'submit-btn',
                            x: 100,
                            y: 200,
                        },
                        page: {
                            url: 'https://example.com/test',
                            path: '/test',
                            hostname: 'example.com',
                            title: 'Test Page',
                        },
                    })],
                };
                
                const result = CollectPayloadSchema.safeParse(payload);
                
                expect(result.success).toBe(true);
            });
        });

        describe('Niepoprawne dane', () => {
            it('powinien odrzucić pusty payload', () => {
                const result = CollectPayloadSchema.safeParse({});
                
                expect(result.success).toBe(false);
            });

            it('powinien odrzucić payload bez eventów', () => {
                const result = CollectPayloadSchema.safeParse({ events: [] });
                
                expect(result.success).toBe(false);
            });

            it('powinien odrzucić więcej niż 100 eventów', () => {
                const events = Array.from({ length: 101 }, () => createValidEvent());
                const result = CollectPayloadSchema.safeParse({ events });
                
                expect(result.success).toBe(false);
            });

            it('powinien odrzucić event bez id', () => {
                const event = createValidEvent();
                delete (event as Record<string, unknown>).id;
                
                const result = CollectPayloadSchema.safeParse({ events: [event] });
                
                expect(result.success).toBe(false);
            });

            it('powinien odrzucić event z niepoprawnym UUID', () => {
                const event = createValidEvent({ id: 'not-a-uuid' });
                
                const result = CollectPayloadSchema.safeParse({ events: [event] });
                
                expect(result.success).toBe(false);
            });

            it('powinien odrzucić event z niepoprawnym timestamp', () => {
                const event = createValidEvent({ timestamp: 'invalid-date' });
                
                const result = CollectPayloadSchema.safeParse({ events: [event] });
                
                expect(result.success).toBe(false);
            });

            it('powinien odrzucić event bez eventType', () => {
                const event = createValidEvent();
                delete (event as Record<string, unknown>).eventType;
                
                const result = CollectPayloadSchema.safeParse({ events: [event] });
                
                expect(result.success).toBe(false);
            });

            it('powinien odrzucić event z pustym siteId', () => {
                const event = createValidEvent({ siteId: '' });
                
                const result = CollectPayloadSchema.safeParse({ events: [event] });
                
                expect(result.success).toBe(false);
            });
        });

        describe('Walidacja urządzenia', () => {
            it('powinien zaakceptować null dla device', () => {
                const payload = {
                    events: [createValidEvent()],
                    device: null,
                };
                
                const result = CollectPayloadSchema.safeParse(payload);
                
                expect(result.success).toBe(true);
            });

            it('powinien odrzucić zbyt duży screenWidth', () => {
                const payload = {
                    events: [createValidEvent()],
                    device: {
                        screenWidth: 99999,
                    },
                };
                
                const result = CollectPayloadSchema.safeParse(payload);
                
                expect(result.success).toBe(false);
            });

            it('powinien odrzucić ujemny screenHeight', () => {
                const payload = {
                    events: [createValidEvent()],
                    device: {
                        screenHeight: -100,
                    },
                };
                
                const result = CollectPayloadSchema.safeParse(payload);
                
                expect(result.success).toBe(false);
            });
        });
    });

    // ========================
    // Testy validateCollectPayload
    // ========================
    describe('validateCollectPayload', () => {
        const createValidEvent = () => ({
            id: uuidv4(),
            timestamp: new Date().toISOString(),
            siteId: 'test-site',
            sessionId: uuidv4(),
            visitorId: uuidv4(),
            eventType: 'click',
        });

        it('powinien zwrócić success: true dla poprawnych danych', () => {
            const result = validateCollectPayload({
                events: [createValidEvent()],
            });
            
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.events).toHaveLength(1);
            }
        });

        it('powinien zwrócić success: false i błąd dla niepoprawnych danych', () => {
            const result = validateCollectPayload({
                events: [{ invalid: 'data' }],
            });
            
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toContain('Validation failed');
            }
        });

        it('powinien zwrócić success: false dla null', () => {
            const result = validateCollectPayload(null);
            
            expect(result.success).toBe(false);
        });

        it('powinien zwrócić success: false dla undefined', () => {
            const result = validateCollectPayload(undefined);
            
            expect(result.success).toBe(false);
        });
    });

    // ========================
    // Testy LoginSchema
    // ========================
    describe('LoginSchema', () => {
        it('powinien zaakceptować poprawne hasło', () => {
            const result = LoginSchema.safeParse({ password: 'test-password' });
            
            expect(result.success).toBe(true);
        });

        it('powinien odrzucić puste hasło', () => {
            const result = LoginSchema.safeParse({ password: '' });
            
            expect(result.success).toBe(false);
        });

        it('powinien odrzucić brak pola password', () => {
            const result = LoginSchema.safeParse({});
            
            expect(result.success).toBe(false);
        });

        it('powinien odrzucić zbyt długie hasło (>255 znaków)', () => {
            const longPassword = 'a'.repeat(256);
            const result = LoginSchema.safeParse({ password: longPassword });
            
            expect(result.success).toBe(false);
        });

        it('powinien zaakceptować hasło o maksymalnej długości (255 znaków)', () => {
            const maxPassword = 'a'.repeat(255);
            const result = LoginSchema.safeParse({ password: maxPassword });
            
            expect(result.success).toBe(true);
        });
    });
});

