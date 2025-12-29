import { NextRequest } from 'next/server';
import { getDb, closeDb } from '../lib/db';
import fs from 'fs';
import path from 'path';

/**
 * Inicjalizuje czystą bazę danych do testów.
 * Używa pliku tymczasowego, aby uniknąć problemów z wieloma połączeniami do :memory:
 * w różnych modułach.
 */
export function setupTestDb() {
  const testDbPath = path.join(process.cwd(), `test-${Math.random().toString(36).substring(7)}.db`);

  // Ustaw zmienną środowiskową dla getDb()
  process.env.TRACKER_DB = testDbPath;

  // Zamknij istniejące połączenie jeśli jest
  closeDb();

  const db = getDb();

  return {
    db,
    cleanup: () => {
      closeDb();
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
      if (fs.existsSync(`${testDbPath}-wal`)) {
        fs.unlinkSync(`${testDbPath}-wal`);
      }
      if (fs.existsSync(`${testDbPath}-shm`)) {
        fs.unlinkSync(`${testDbPath}-shm`);
      }
      delete process.env.TRACKER_DB;
    },
  };
}

/**
 * Tworzy mocka NextRequest do testowania handlerów API
 */
export function createMockRequest(options: {
  method?: string;
  url?: string;
  body?: unknown;
  headers?: Record<string, string>;
  ip?: string;
}) {
  const {
    method = 'POST',
    url = 'http://localhost/api/test',
    body = {},
    headers = {},
    ip = '127.0.0.1',
  } = options;

  const requestHeaders = new Headers();
  Object.entries(headers).forEach(([key, value]) => {
    requestHeaders.set(key, value);
  });

  // Dodaj IP do nagłówków, bo handlery Next.js tak go szukają
  if (!requestHeaders.has('x-forwarded-for')) {
    requestHeaders.set('x-forwarded-for', ip);
  }

  return new NextRequest(url, {
    method,
    headers: requestHeaders,
    body: method !== 'GET' ? JSON.stringify(body) : undefined,
  });
}
