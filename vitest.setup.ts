import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Jeśli używasz globals: true w vitest.config.ts, możesz używać 'vi' lub 'jest' (przez aliasy)
// Dla łatwej migracji z Jesta:
// @ts-expect-error - alias dla kompatybilności z Jeste m
globalThis.jest = vi;

// Mockowanie fetch jeśli potrzebne
global.fetch = vi.fn();

// Polyfill dla ResizeObserver jeśli używasz Recharts/Radix
class ResizeObserver {
  observe() { }
  unobserve() { }
  disconnect() { }
}

global.ResizeObserver = ResizeObserver;

// Ustawienia dla testów (np. auth)
process.env.DASHBOARD_PASSWORD = 'test-password';
process.env.JWT_SECRET = 'test-secret-key-for-testing';
process.env.API_TOKENS = 'test-token-1,test-token-2';
