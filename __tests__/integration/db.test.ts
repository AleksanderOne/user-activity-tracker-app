import { setupTestDb } from '../helpers';
import { getDb } from '@/lib/db';

describe('Baza danych', () => {
  let testEnv: ReturnType<typeof setupTestDb>;

  beforeAll(() => {
    testEnv = setupTestDb();
  });

  afterAll(() => {
    testEnv.cleanup();
  });

  // ========================
  // Testy tabeli events
  // ========================
  describe('Tabela events', () => {
    it('powinna pozwalać na wstawienie eventu', () => {
      const insertEvent = getDb().prepare(`
                INSERT INTO events (id, timestamp, site_id, session_id, visitor_id, event_type, path)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);

      const result = insertEvent.run(
        'test-event-1',
        new Date().toISOString(),
        'test-site',
        'session-1',
        'visitor-1',
        'pageview',
        '/test',
      );

      expect(result.changes).toBe(1);
    });

    it('powinna pozwalać na pobranie eventów', () => {
      const getEvents = getDb().prepare('SELECT * FROM events WHERE site_id = ?');

      const events = getEvents.all('test-site');

      expect(events.length).toBeGreaterThan(0);
    });

    it('powinna odrzucać duplikaty id', () => {
      const insertEvent = getDb().prepare(`
                INSERT INTO events (id, timestamp, site_id, session_id, visitor_id, event_type, path)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);

      // Próba wstawienia eventu z tym samym id
      expect(() => {
        insertEvent.run(
          'test-event-1', // to samo id
          new Date().toISOString(),
          'test-site',
          'session-2',
          'visitor-2',
          'click',
          '/other',
        );
      }).toThrow();
    });

    it('powinna pozwalać na filtrowanie po event_type', () => {
      // Wstaw różne typy eventów
      const insertEvent = getDb().prepare(`
                INSERT INTO events (id, timestamp, site_id, session_id, visitor_id, event_type, path)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);

      insertEvent.run(
        'click-1',
        new Date().toISOString(),
        'test-site',
        'session-1',
        'visitor-1',
        'click',
        '/',
      );
      insertEvent.run(
        'scroll-1',
        new Date().toISOString(),
        'test-site',
        'session-1',
        'visitor-1',
        'scroll',
        '/',
      );

      const getClicks = getDb().prepare('SELECT * FROM events WHERE event_type = ?');
      const clicks = getClicks.all('click') as Array<{ event_type: string }>;

      expect(clicks.length).toBeGreaterThanOrEqual(1);
      expect(clicks.every((e) => e.event_type === 'click')).toBe(true);
    });
  });

  // ========================
  // Testy tabeli sessions
  // ========================
  describe('Tabela sessions', () => {
    it('powinna pozwalać na wstawienie sesji', () => {
      const insertSession = getDb().prepare(`
                INSERT INTO sessions (session_id, visitor_id, site_id, started_at, page_count, event_count)
                VALUES (?, ?, ?, ?, ?, ?)
            `);

      const result = insertSession.run(
        'test-session-1',
        'visitor-1',
        'test-site',
        new Date().toISOString(),
        0,
        0,
      );

      expect(result.changes).toBe(1);
    });

    it('powinna pozwalać na aktualizację sesji', () => {
      const updateSession = getDb().prepare(`
                UPDATE sessions SET page_count = page_count + 1, event_count = event_count + 1
                WHERE session_id = ?
            `);

      const result = updateSession.run('test-session-1');

      expect(result.changes).toBe(1);

      // Sprawdź zaktualizowane wartości
      const getSession = getDb().prepare('SELECT * FROM sessions WHERE session_id = ?');
      const session = getSession.get('test-session-1') as {
        page_count: number;
        event_count: number;
      };

      expect(session.page_count).toBe(1);
      expect(session.event_count).toBe(1);
    });

    it('powinna obsługiwać device_info jako JSON', () => {
      const deviceInfo = {
        userAgent: 'Mozilla/5.0 Test',
        screenWidth: 1920,
        screenHeight: 1080,
      };

      const insertSession = getDb().prepare(`
                INSERT INTO sessions (session_id, visitor_id, site_id, started_at, device_info)
                VALUES (?, ?, ?, ?, ?)
            `);

      insertSession.run(
        'test-session-2',
        'visitor-2',
        'test-site',
        new Date().toISOString(),
        JSON.stringify(deviceInfo),
      );

      const getSession = getDb().prepare('SELECT * FROM sessions WHERE session_id = ?');
      const session = getSession.get('test-session-2') as { device_info: string };

      const parsedDeviceInfo = JSON.parse(session.device_info);
      expect(parsedDeviceInfo.screenWidth).toBe(1920);
    });
  });

  // ========================
  // Testy wydajnościowe
  // ========================
  describe('Wydajność', () => {
    it('powinna obsłużyć wiele eventów w transakcji', () => {
      const insertEvent = getDb().prepare(`
                INSERT INTO events (id, timestamp, site_id, session_id, visitor_id, event_type, path)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);

      const insertMany = getDb().transaction((events: Array<{ id: string; type: string }>) => {
        for (const event of events) {
          insertEvent.run(
            event.id,
            new Date().toISOString(),
            'test-site',
            'session-perf',
            'visitor-perf',
            event.type,
            '/perf-test',
          );
        }
      });

      const events = Array.from({ length: 100 }, (_, i) => ({
        id: `perf-event-${i}`,
        type: 'pageview',
      }));

      const startTime = Date.now();
      insertMany(events);
      const duration = Date.now() - startTime;

      // Powinno być szybkie (< 500ms dla 100 eventów)
      expect(duration).toBeLessThan(500);

      // Sprawdź czy wszystkie wstawione
      const count = getDb()
        .prepare('SELECT COUNT(*) as cnt FROM events WHERE session_id = ?')
        .get('session-perf') as { cnt: number };
      expect(count.cnt).toBe(100);
    });
  });

  // ========================
  // Testy zapytań
  // ========================
  describe('Zapytania', () => {
    it('powinna obsługiwać COUNT z GROUP BY', () => {
      const query = getDb().prepare(`
                SELECT event_type, COUNT(*) as count 
                FROM events 
                GROUP BY event_type
            `);

      const results = query.all();

      expect(results.length).toBeGreaterThan(0);
    });

    it('powinna obsługiwać JOIN między events i sessions', () => {
      const query = getDb().prepare(`
                SELECT e.*, s.device_info
                FROM events e
                LEFT JOIN sessions s ON e.session_id = s.session_id
                LIMIT 5
            `);

      const results = query.all();

      expect(Array.isArray(results)).toBe(true);
    });

    it('powinna obsługiwać LIKE do wyszukiwania', () => {
      const query = getDb().prepare(`
                SELECT * FROM events WHERE path LIKE ?
            `);

      const results = query.all('%test%');

      expect(results.length).toBeGreaterThan(0);
    });
  });
});
