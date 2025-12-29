'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// Domyślne hasło testowe - tylko dla trybu development
const TEST_PASSWORD = 'admin123';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Sprawdź czy jesteśmy w trybie development
  const isDevelopment = process.env.NODE_ENV !== 'production';

  // Funkcja logowania
  const handleLogin = useCallback(
    async (passwordToUse: string) => {
      setLoading(true);
      setError('');

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: passwordToUse }),
        });

        if (res.ok) {
          router.push('/dashboard');
        } else {
          const data = await res.json();
          if (res.status === 429) {
            setError(`Zbyt wiele prób. Spróbuj za ${data.retryAfter || 60} sekund.`);
          } else {
            setError(data.message || 'Nieprawidłowe hasło');
          }
        }
      } catch {
        setError('Wystąpił błąd podczas logowania');
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  // Obsługa formularza
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleLogin(password);
  };

  // Szybkie logowanie testowe
  const handleTestLogin = async () => {
    setPassword(TEST_PASSWORD);
    await handleLogin(TEST_PASSWORD);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-800/50 p-8 backdrop-blur shadow-2xl">
        {/* Nagłówek */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Logowanie
          </h1>
          <p className="text-slate-400 text-sm mt-2">Activity Tracker Dashboard</p>
        </div>

        {/* Formularz logowania */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-300">
              Hasło
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-3 text-white placeholder-slate-500 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              placeholder="Wprowadź hasło"
              required
              disabled={loading}
              autoComplete="current-password"
            />
          </div>

          {/* Komunikat błędu */}
          {error && (
            <div className="rounded-lg bg-red-900/50 border border-red-700 px-4 py-3 text-red-200 text-sm flex items-center gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Przycisk logowania */}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-3 font-semibold text-white transition hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] shadow-lg shadow-blue-500/25"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⏳</span>
                Logowanie...
              </span>
            ) : (
              'Zaloguj się'
            )}
          </button>
        </form>

        {/* Separator */}
        {isDevelopment && (
          <>
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-700"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-slate-800 px-3 text-slate-500">lub w trybie testowym</span>
              </div>
            </div>

            {/* Przycisk logowania testowego */}
            <button
              type="button"
              onClick={handleTestLogin}
              disabled={loading}
              className="w-full rounded-lg bg-slate-700/50 border border-slate-600 px-6 py-3 font-medium text-slate-300 transition hover:bg-slate-700 hover:border-slate-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <span>🧪</span>
              <span>Logowanie testowe (dev)</span>
            </button>

            {/* Info o trybie dev */}
            <div className="mt-4 p-3 rounded-lg bg-amber-900/20 border border-amber-800/50">
              <p className="text-amber-400/80 text-xs text-center">
                ⚠️ Tryb development - hasło testowe:{' '}
                <code className="bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                  {TEST_PASSWORD}
                </code>
              </p>
            </div>
          </>
        )}

        {/* Stopka */}
        <p className="mt-8 text-center text-sm text-slate-500">Activity Tracker Dashboard v1.0</p>
      </div>
    </div>
  );
}
