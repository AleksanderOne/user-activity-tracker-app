require('@testing-library/jest-dom');

// Mockowanie console.warn i console.error w testach
// aby nie zaśmiecać outputu
const originalWarn = console.warn;
const originalError = console.error;

beforeAll(() => {
    console.warn = jest.fn();
    console.error = jest.fn();
});

afterAll(() => {
    console.warn = originalWarn;
    console.error = originalError;
});

// Mockowanie zmiennych środowiskowych dla testów
process.env.JWT_SECRET = 'test-secret-key-for-testing';
process.env.DASHBOARD_PASSWORD = 'test-password';
process.env.NODE_ENV = 'test';

