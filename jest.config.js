const nextJest = require('next/jest');

const createJestConfig = nextJest({
    // Ścieżka do aplikacji Next.js
    dir: './',
});

// Konfiguracja Jest
const customJestConfig = {
    // Środowisko testowe
    testEnvironment: 'jest-environment-jsdom',
    
    // Pliki setup uruchamiane przed testami
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
    
    // Ścieżki do testów
    testMatch: [
        '**/__tests__/**/*.test.ts',
        '**/__tests__/**/*.test.tsx',
    ],
    
    // Mapowanie aliasów
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
    },
    
    // Ignorowanie katalogów
    testPathIgnorePatterns: [
        '<rootDir>/node_modules/',
        '<rootDir>/.next/',
        '<rootDir>/e2e/',
    ],
    
    // Transformacja modułów ESM w node_modules
    transformIgnorePatterns: [
        '/node_modules/(?!(uuid)/)',
    ],
    
    // Raportowanie pokrycia kodu
    collectCoverageFrom: [
        'lib/**/*.{ts,tsx}',
        'components/**/*.{ts,tsx}',
        'app/api/**/*.ts',
        '!**/*.d.ts',
        '!**/node_modules/**',
    ],
    
    // Verbose output
    verbose: true,
};

module.exports = createJestConfig(customJestConfig);

