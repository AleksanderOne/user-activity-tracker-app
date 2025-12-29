/**
 * Testy jednostkowe dla modułu rate-limit
 * Testuje mechanizm ograniczania liczby żądań
 */

import { checkRateLimit, RATE_LIMITS, RateLimitConfig } from '@/lib/rate-limit';

describe('Rate Limiting', () => {
  // Pomocnicza konfiguracja dla testów
  const testConfig: RateLimitConfig = {
    maxRequests: 5,
    windowMs: 1000, // 1 sekunda
  };

  // Generuje unikalny klucz dla każdego testu
  const generateUniqueKey = () => `test-${Date.now()}-${Math.random().toString(36)}`;

  describe('checkRateLimit', () => {
    it('powinien pozwolić na pierwszy request', () => {
      const key = generateUniqueKey();

      const result = checkRateLimit(key, testConfig);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4); // 5 - 1 = 4
    });

    it('powinien zmniejszać remaining z każdym requestem', () => {
      const key = generateUniqueKey();

      const result1 = checkRateLimit(key, testConfig);
      const result2 = checkRateLimit(key, testConfig);
      const result3 = checkRateLimit(key, testConfig);

      expect(result1.remaining).toBe(4);
      expect(result2.remaining).toBe(3);
      expect(result3.remaining).toBe(2);
    });

    it('powinien zablokować po przekroczeniu limitu', () => {
      const key = generateUniqueKey();

      // Wykonaj maxRequests + 1 żądań
      for (let i = 0; i < testConfig.maxRequests; i++) {
        checkRateLimit(key, testConfig);
      }

      const blockedResult = checkRateLimit(key, testConfig);

      expect(blockedResult.allowed).toBe(false);
      expect(blockedResult.remaining).toBe(0);
    });

    it('powinien zwracać czas resetu', () => {
      const key = generateUniqueKey();
      const now = Date.now();

      const result = checkRateLimit(key, testConfig);

      expect(result.resetAt).toBeGreaterThan(now);
      expect(result.resetAt).toBeLessThanOrEqual(now + testConfig.windowMs + 100);
    });

    it('powinien działać niezależnie dla różnych kluczy', () => {
      const key1 = generateUniqueKey();
      const key2 = generateUniqueKey();

      // Wyczerpaj limit dla key1
      for (let i = 0; i < testConfig.maxRequests + 1; i++) {
        checkRateLimit(key1, testConfig);
      }

      // key2 powinien nadal działać
      const result = checkRateLimit(key2, testConfig);

      expect(result.allowed).toBe(true);
    });

    it('powinien pozwolić dokładnie maxRequests żądań', () => {
      const key = generateUniqueKey();

      const results = [];
      for (let i = 0; i < testConfig.maxRequests; i++) {
        results.push(checkRateLimit(key, testConfig));
      }

      // Wszystkie powinny być dozwolone
      expect(results.every((r) => r.allowed)).toBe(true);

      // Ostatni powinien mieć remaining = 0
      expect(results[results.length - 1].remaining).toBe(0);
    });

    it('powinien zresetować po upływie okna czasowego', async () => {
      const shortConfig: RateLimitConfig = {
        maxRequests: 2,
        windowMs: 100, // 100ms
      };
      const key = generateUniqueKey();

      // Wyczerpaj limit
      checkRateLimit(key, shortConfig);
      checkRateLimit(key, shortConfig);
      const blocked = checkRateLimit(key, shortConfig);

      expect(blocked.allowed).toBe(false);

      // Poczekaj na reset
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Powinno być zresetowane
      const afterReset = checkRateLimit(key, shortConfig);

      expect(afterReset.allowed).toBe(true);
      expect(afterReset.remaining).toBe(1);
    });
  });

  describe('RATE_LIMITS konfiguracje', () => {
    it('powinien mieć konfigurację dla collect', () => {
      expect(RATE_LIMITS.collect).toBeDefined();
      expect(RATE_LIMITS.collect.maxRequests).toBe(100);
      expect(RATE_LIMITS.collect.windowMs).toBe(60 * 1000);
    });

    it('powinien mieć konfigurację dla login', () => {
      expect(RATE_LIMITS.login).toBeDefined();
      expect(RATE_LIMITS.login.maxRequests).toBe(5);
      expect(RATE_LIMITS.login.windowMs).toBe(15 * 60 * 1000);
    });

    it('powinien mieć konfigurację dla stats', () => {
      expect(RATE_LIMITS.stats).toBeDefined();
      expect(RATE_LIMITS.stats.maxRequests).toBe(60);
      expect(RATE_LIMITS.stats.windowMs).toBe(60 * 1000);
    });
  });

  describe('Scenariusze brzegowe', () => {
    it('powinien obsłużyć bardzo duży limit', () => {
      const largeConfig: RateLimitConfig = {
        maxRequests: 1000000,
        windowMs: 60000,
      };
      const key = generateUniqueKey();

      const result = checkRateLimit(key, largeConfig);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(999999);
    });

    it('powinien obsłużyć limit równy 1', () => {
      const singleConfig: RateLimitConfig = {
        maxRequests: 1,
        windowMs: 60000,
      };
      const key = generateUniqueKey();

      const first = checkRateLimit(key, singleConfig);
      const second = checkRateLimit(key, singleConfig);

      expect(first.allowed).toBe(true);
      expect(first.remaining).toBe(0);
      expect(second.allowed).toBe(false);
    });

    it('powinien działać z bardzo krótkim oknem czasowym', () => {
      const shortConfig: RateLimitConfig = {
        maxRequests: 100,
        windowMs: 1, // 1ms
      };
      const key = generateUniqueKey();

      const result = checkRateLimit(key, shortConfig);

      expect(result.allowed).toBe(true);
    });
  });
});
