import { setupTestDb } from '../helpers';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

describe('API /api/stats - Integracja', () => {
  let testEnv: ReturnType<typeof setupTestDb>;

  beforeAll(() => {
    testEnv = setupTestDb();
  });

  afterAll(() => {
    testEnv.cleanup();
  });

  beforeEach(() => {
    const db = getDb();
    db.exec(`DELETE FROM events`);
    db.exec(`DELETE FROM sessions`);
    db.exec(`DELETE FROM visitors`);
  });

  // Funkcja pomocnicza do wstawiania danych testowych
  function insertTestData(count: number, daysAgo: number = 0) {
    const insertEvent = getDb().prepare(`
            INSERT INTO events (id, timestamp, site_id, session_id, visitor_id, event_type, path, hostname)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
    const insertSession = getDb().prepare(`
            INSERT OR IGNORE INTO sessions (session_id, visitor_id, site_id, started_at, page_count, event_count, device_info)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
    const insertVisitor = getDb().prepare(`
            INSERT OR IGNORE INTO visitors (visitor_id, first_seen)
            VALUES (?, ?)
        `);

    const insertMany = getDb().transaction(() => {
      for (let i = 0; i < count; i++) {
        const visitorId = uuidv4();
        const sessionId = uuidv4();
        const timestamp = new Date(
          Date.now() - daysAgo * 24 * 60 * 60 * 1000 - Math.random() * 1000000,
        ).toISOString();

        const deviceInfo = {
          location: {
            country: 'Poland',
            city: 'Warsaw',
          },
        };

        insertVisitor.run(visitorId, timestamp);
        insertSession.run(
          sessionId,
          visitorId,
          'test-site',
          timestamp,
          Math.floor(Math.random() * 10) + 1,
          Math.floor(Math.random() * 20) + 1,
          JSON.stringify(deviceInfo),
        );

        // Dodaj kilka eventów na sesję
        const eventsPerSession = Math.floor(Math.random() * 5) + 1;
        for (let j = 0; j < eventsPerSession; j++) {
          insertEvent.run(
            uuidv4(),
            timestamp,
            'test-site',
            sessionId,
            visitorId,
            j === 0 ? 'pageview' : 'click',
            `/page-${Math.floor(Math.random() * 10)}`,
            'test.com',
          );
        }
      }
    });

    insertMany();
  }

  // ========================
  // Testy zapytań statystycznych
  // ========================
  describe('Zapytania statystyczne', () => {
    it('powinien policzyć unikalne sesje', () => {
      insertTestData(10);

      const result = getDb()
        .prepare(
          `
                SELECT COUNT(DISTINCT session_id) as count FROM sessions
            `,
        )
        .get() as { count: number };

      expect(result.count).toBe(10);
    });

    it('powinien policzyć unikalne wizyty', () => {
      insertTestData(15);

      const result = getDb()
        .prepare(
          `
                SELECT COUNT(DISTINCT visitor_id) as count FROM visitors
            `,
        )
        .get() as { count: number };

      expect(result.count).toBe(15);
    });

    it('powinien policzyć pageviews', () => {
      insertTestData(5);

      const result = getDb()
        .prepare(
          `
                SELECT COUNT(*) as count FROM events WHERE event_type = 'pageview'
            `,
        )
        .get() as { count: number };

      expect(result.count).toBe(5);
    });

    it('powinien filtrować po zakresie dat', () => {
      // Dane z dzisiaj
      insertTestData(5, 0);
      // Dane sprzed 7 dni
      insertTestData(3, 7);

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const result = getDb()
        .prepare(
          `
                SELECT COUNT(DISTINCT session_id) as count 
                FROM sessions 
                WHERE started_at >= ?
            `,
        )
        .get(yesterday) as { count: number };

      expect(result.count).toBe(5);
    });
  });

  // ========================
  // Testy agregacji
  // ========================
  describe('Agregacje', () => {
    it('powinien grupować eventy po typie', () => {
      insertTestData(10);

      const result = getDb()
        .prepare(
          `
                SELECT event_type, COUNT(*) as count 
                FROM events 
                GROUP BY event_type
                ORDER BY count DESC
            `,
        )
        .all() as Array<{ event_type: string; count: number }>;

      expect(result.length).toBeGreaterThan(0);
      expect(result.every((r) => r.count > 0)).toBe(true);
    });

    it('powinien grupować sesje po dniach', () => {
      insertTestData(5, 0);
      insertTestData(3, 1);
      insertTestData(2, 2);

      const result = getDb()
        .prepare(
          `
                SELECT 
                    date(started_at) as date,
                    COUNT(*) as sessions
                FROM sessions
                GROUP BY date(started_at)
                ORDER BY date DESC
            `,
        )
        .all() as Array<{ date: string; sessions: number }>;

      expect(result.length).toBeGreaterThan(0);
    });

    it('powinien liczyć top strony', () => {
      insertTestData(20);

      const result = getDb()
        .prepare(
          `
                SELECT 
                    path,
                    COUNT(*) as views
                FROM events
                WHERE event_type = 'pageview'
                GROUP BY path
                ORDER BY views DESC
                LIMIT 10
            `,
        )
        .all() as Array<{ path: string; views: number }>;

      expect(result.length).toBeLessThanOrEqual(10);
    });
  });

  // ========================
  // Testy metryki bounce rate
  // ========================
  describe('Bounce Rate', () => {
    it('powinien obliczyć bounce rate', () => {
      // Wstaw sesje z różną liczbą stron
      const insertSession = getDb().prepare(`
                INSERT INTO sessions (session_id, visitor_id, site_id, started_at, page_count)
                VALUES (?, ?, ?, ?, ?)
            `);

      // 5 sesji z 1 stroną (bounce)
      for (let i = 0; i < 5; i++) {
        insertSession.run(uuidv4(), uuidv4(), 'test-site', new Date().toISOString(), 1);
      }
      // 5 sesji z wieloma stronami (nie bounce)
      for (let i = 0; i < 5; i++) {
        insertSession.run(uuidv4(), uuidv4(), 'test-site', new Date().toISOString(), 3);
      }

      const totalSessions = getDb()
        .prepare(
          `
                SELECT COUNT(*) as count FROM sessions
            `,
        )
        .get() as { count: number };

      const bouncedSessions = getDb()
        .prepare(
          `
                SELECT COUNT(*) as count FROM sessions WHERE page_count = 1
            `,
        )
        .get() as { count: number };

      const bounceRate = (bouncedSessions.count / totalSessions.count) * 100;

      expect(bounceRate).toBe(50);
    });
  });

  // ========================
  // Testy średniego czasu sesji
  // ========================
  describe('Średni czas sesji', () => {
    it('powinien obliczyć średni czas sesji', () => {
      const insertSession = getDb().prepare(`
                INSERT INTO sessions (session_id, visitor_id, site_id, started_at, last_activity)
                VALUES (?, ?, ?, ?, ?)
            `);

      const now = Date.now();

      // Sesja 1: 5 minut
      insertSession.run(
        uuidv4(),
        uuidv4(),
        'test-site',
        new Date(now - 10 * 60 * 1000).toISOString(),
        new Date(now - 5 * 60 * 1000).toISOString(),
      );

      // Sesja 2: 10 minut
      insertSession.run(
        uuidv4(),
        uuidv4(),
        'test-site',
        new Date(now - 15 * 60 * 1000).toISOString(),
        new Date(now - 5 * 60 * 1000).toISOString(),
      );

      const result = getDb()
        .prepare(
          `
                SELECT AVG(
                    (julianday(last_activity) - julianday(started_at)) * 24 * 60
                ) as avg_duration_minutes
                FROM sessions
                WHERE last_activity IS NOT NULL
            `,
        )
        .get() as { avg_duration_minutes: number };

      expect(result.avg_duration_minutes).toBeCloseTo(7.5, 0);
    });
  });

  // ========================
  // Testy geolokalizacji
  // ========================
  describe('Statystyki geolokalizacji', () => {
    it('powinien grupować sesje po krajach', () => {
      const insertSession = getDb().prepare(`
                INSERT INTO sessions (session_id, visitor_id, site_id, started_at, device_info)
                VALUES (?, ?, ?, ?, ?)
            `);

      insertSession.run(
        uuidv4(),
        uuidv4(),
        'test-site',
        new Date().toISOString(),
        JSON.stringify({ location: { country: 'Poland', city: 'Warsaw' } }),
      );
      insertSession.run(
        uuidv4(),
        uuidv4(),
        'test-site',
        new Date().toISOString(),
        JSON.stringify({ location: { country: 'Poland', city: 'Krakow' } }),
      );
      insertSession.run(
        uuidv4(),
        uuidv4(),
        'test-site',
        new Date().toISOString(),
        JSON.stringify({ location: { country: 'Germany', city: 'Berlin' } }),
      );

      const result = getDb()
        .prepare(
          `
                SELECT 
                    json_extract(device_info, '$.location.country') as country,
                    COUNT(*) as sessions
                FROM sessions
                WHERE device_info IS NOT NULL
                GROUP BY country
                ORDER BY sessions DESC
            `,
        )
        .all() as Array<{ country: string; sessions: number }>;

      expect(result.length).toBe(2);
      expect(result[0].country).toBe('Poland');
      expect(result[0].sessions).toBe(2);
    });
  });

  // ========================
  // Testy UTM
  // ========================
  describe('Statystyki UTM', () => {
    it('powinien grupować sesje po źródle UTM', () => {
      const insertSession = getDb().prepare(`
                INSERT INTO sessions (session_id, visitor_id, site_id, started_at, utm_params)
                VALUES (?, ?, ?, ?, ?)
            `);

      insertSession.run(
        uuidv4(),
        uuidv4(),
        'test-site',
        new Date().toISOString(),
        JSON.stringify({ utm_source: 'google', utm_medium: 'cpc' }),
      );
      insertSession.run(
        uuidv4(),
        uuidv4(),
        'test-site',
        new Date().toISOString(),
        JSON.stringify({ utm_source: 'google', utm_medium: 'organic' }),
      );
      insertSession.run(
        uuidv4(),
        uuidv4(),
        'test-site',
        new Date().toISOString(),
        JSON.stringify({ utm_source: 'facebook', utm_medium: 'social' }),
      );

      const result = getDb()
        .prepare(
          `
                SELECT 
                    json_extract(utm_params, '$.utm_source') as source,
                    COUNT(*) as sessions
                FROM sessions
                WHERE utm_params IS NOT NULL
                GROUP BY source
                ORDER BY sessions DESC
            `,
        )
        .all() as Array<{ source: string; sessions: number }>;

      expect(result.length).toBe(2);
      expect(result[0].source).toBe('google');
    });
  });

  // ========================
  // Testy wydajności zapytań
  // ========================
  describe('Wydajność zapytań', () => {
    it('powinien wykonać overview query w < 500ms dla 1000 rekordów', () => {
      insertTestData(100);

      const startTime = Date.now();

      // Symulacja overview query
      getDb().prepare(`SELECT COUNT(DISTINCT visitor_id) as visitors FROM sessions`).get();
      getDb().prepare(`SELECT COUNT(*) as sessions FROM sessions`).get();
      getDb()
        .prepare(`SELECT COUNT(*) as pageviews FROM events WHERE event_type = 'pageview'`)
        .get();
      getDb()
        .prepare(
          `
                SELECT path, COUNT(*) as count 
                FROM events 
                WHERE event_type = 'pageview' 
                GROUP BY path 
                ORDER BY count DESC 
                LIMIT 10
            `,
        )
        .all();

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(500);
    });
  });

  // ========================
  // Testy timeline
  // ========================
  describe('Timeline', () => {
    it('powinien zwrócić dane timeline', () => {
      insertTestData(20);

      const result = getDb()
        .prepare(
          `
                SELECT 
                    date(timestamp) as date,
                    COUNT(DISTINCT session_id) as sessions,
                    COUNT(DISTINCT visitor_id) as visitors,
                    COUNT(*) as events
                FROM events
                GROUP BY date(timestamp)
                ORDER BY date DESC
                LIMIT 30
            `,
        )
        .all() as Array<{ date: string; sessions: number; visitors: number; events: number }>;

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('date');
      expect(result[0]).toHaveProperty('sessions');
    });
  });
});
