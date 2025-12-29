import { setupTestDb } from '../helpers';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

describe('API /api/collect - Integracja', () => {
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
    db.exec(`DELETE FROM form_submissions`);
    db.exec(`DELETE FROM login_attempts`);
  });

  // ========================
  // Testy zapisywania eventów
  // ========================
  describe('Zapisywanie eventów', () => {
    it('powinien zapisać pojedynczy event pageview', () => {
      const eventId = uuidv4();
      const sessionId = uuidv4();
      const visitorId = uuidv4();
      const now = new Date().toISOString();

      // Symulacja logiki z route.ts
      const insertEvent = getDb().prepare(`
                INSERT INTO events (id, timestamp, site_id, session_id, visitor_id, event_type, path, data, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

      insertEvent.run(
        eventId,
        now,
        'test-site',
        sessionId,
        visitorId,
        'pageview',
        '/test-page',
        JSON.stringify({}),
        now,
      );

      // Sprawdź czy event został zapisany
      const savedEvent = getDb().prepare('SELECT * FROM events WHERE id = ?').get(eventId) as {
        event_type: string;
      };

      expect(savedEvent).toBeDefined();
      expect(savedEvent.event_type).toBe('pageview');
    });

    it('powinien zapisać wiele eventów w transakcji', () => {
      const sessionId = uuidv4();
      const visitorId = uuidv4();
      const now = new Date().toISOString();

      const insertEvent = getDb().prepare(`
                INSERT INTO events (id, timestamp, site_id, session_id, visitor_id, event_type, path, data, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

      const insertMany = getDb().transaction(
        (events: Array<{ id: string; type: string; path: string }>) => {
          for (const event of events) {
            insertEvent.run(
              event.id,
              now,
              'test-site',
              sessionId,
              visitorId,
              event.type,
              event.path,
              JSON.stringify({}),
              now,
            );
          }
        },
      );

      const events = [
        { id: uuidv4(), type: 'pageview', path: '/' },
        { id: uuidv4(), type: 'click', path: '/' },
        { id: uuidv4(), type: 'scroll', path: '/' },
      ];

      insertMany(events);

      // Sprawdź czy wszystkie eventy zostały zapisane
      const count = getDb()
        .prepare('SELECT COUNT(*) as cnt FROM events WHERE session_id = ?')
        .get(sessionId) as { cnt: number };

      expect(count.cnt).toBe(3);
    });

    it('powinien zapisać event z danymi dodatkowymi', () => {
      const eventId = uuidv4();
      const eventData = {
        buttonId: 'submit-btn',
        x: 150,
        y: 200,
        target: 'button.primary',
      };

      getDb()
        .prepare(
          `
                INSERT INTO events (id, timestamp, site_id, session_id, visitor_id, event_type, path, data, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
        )
        .run(
          eventId,
          new Date().toISOString(),
          'test-site',
          uuidv4(),
          uuidv4(),
          'click',
          '/',
          JSON.stringify(eventData),
          new Date().toISOString(),
        );

      const savedEvent = getDb().prepare('SELECT data FROM events WHERE id = ?').get(eventId) as {
        data: string;
      };
      const parsedData = JSON.parse(savedEvent.data);

      expect(parsedData.buttonId).toBe('submit-btn');
      expect(parsedData.x).toBe(150);
    });
  });

  // ========================
  // Testy sesji
  // ========================
  describe('Zarządzanie sesjami', () => {
    it('powinien utworzyć nową sesję dla pierwszego eventu', () => {
      const sessionId = uuidv4();
      const visitorId = uuidv4();
      const now = new Date().toISOString();
      const deviceInfo = { userAgent: 'Test Agent', screenWidth: 1920 };
      const utmParams = { utm_source: 'google' };

      // UPSERT sesji
      getDb()
        .prepare(
          `
                INSERT INTO sessions (session_id, site_id, visitor_id, device_info, started_at, last_activity, utm_params)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(session_id) DO UPDATE SET last_activity = excluded.last_activity
            `,
        )
        .run(
          sessionId,
          'test-site',
          visitorId,
          JSON.stringify(deviceInfo),
          now,
          now,
          JSON.stringify(utmParams),
        );

      const session = getDb()
        .prepare('SELECT * FROM sessions WHERE session_id = ?')
        .get(sessionId) as { visitor_id: string };

      expect(session).toBeDefined();
      expect(session.visitor_id).toBe(visitorId);
    });

    it('powinien aktualizować last_activity dla istniejącej sesji', () => {
      const sessionId = uuidv4();
      const startTime = new Date(Date.now() - 60000).toISOString(); // 1 minuta temu
      const updateTime = new Date().toISOString();

      // Utwórz sesję
      getDb()
        .prepare(
          `
                INSERT INTO sessions (session_id, site_id, visitor_id, started_at, last_activity)
                VALUES (?, ?, ?, ?, ?)
            `,
        )
        .run(sessionId, 'test-site', uuidv4(), startTime, startTime);

      // Aktualizuj
      getDb()
        .prepare(
          `
                UPDATE sessions SET last_activity = ? WHERE session_id = ?
            `,
        )
        .run(updateTime, sessionId);

      const session = getDb()
        .prepare('SELECT last_activity FROM sessions WHERE session_id = ?')
        .get(sessionId) as { last_activity: string };

      expect(session.last_activity).toBe(updateTime);
    });

    it('powinien inkrementować liczniki sesji', () => {
      const sessionId = uuidv4();

      // Utwórz sesję
      getDb()
        .prepare(
          `
                INSERT INTO sessions (session_id, site_id, visitor_id, started_at, page_count, event_count)
                VALUES (?, ?, ?, ?, 0, 0)
            `,
        )
        .run(sessionId, 'test-site', uuidv4(), new Date().toISOString());

      // Inkrementuj liczniki
      getDb()
        .prepare(
          `
                UPDATE sessions SET event_count = event_count + 5, page_count = page_count + 2 WHERE session_id = ?
            `,
        )
        .run(sessionId);

      const session = getDb()
        .prepare('SELECT page_count, event_count FROM sessions WHERE session_id = ?')
        .get(sessionId) as { page_count: number; event_count: number };

      expect(session.event_count).toBe(5);
      expect(session.page_count).toBe(2);
    });
  });

  // ========================
  // Testy formularzy
  // ========================
  describe('Zapisywanie formularzy', () => {
    it('powinien zapisać form_submit do form_submissions', () => {
      const formSubmissionId = 'form-' + Date.now();
      const formData = {
        name: 'Test User',
        email: 'test@example.com',
      };

      getDb()
        .prepare(
          `
                INSERT INTO form_submissions 
                (id, timestamp, site_id, session_id, visitor_id, form_id, form_name, form_action, page_url, page_path, form_data, fill_duration, fields_count, has_files)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
        )
        .run(
          formSubmissionId,
          new Date().toISOString(),
          'test-site',
          uuidv4(),
          uuidv4(),
          'contact-form',
          'Contact Form',
          '/api/contact',
          'https://example.com/contact',
          '/contact',
          JSON.stringify(formData),
          45,
          2,
          0,
        );

      const submission = getDb()
        .prepare('SELECT * FROM form_submissions WHERE id = ?')
        .get(formSubmissionId) as { form_name: string; fill_duration: number };

      expect(submission).toBeDefined();
      expect(submission.form_name).toBe('Contact Form');
      expect(submission.fill_duration).toBe(45);
    });
  });

  // ========================
  // Testy prób logowania
  // ========================
  describe('Zapisywanie prób logowania', () => {
    it('powinien zapisać login_attempt', () => {
      const loginAttemptId = 'login-' + Date.now();

      getDb()
        .prepare(
          `
                INSERT INTO login_attempts 
                (id, timestamp, site_id, session_id, visitor_id, email, username, password_length, page_url, page_path)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
        )
        .run(
          loginAttemptId,
          new Date().toISOString(),
          'test-site',
          uuidv4(),
          uuidv4(),
          'user@example.com',
          'testuser',
          8,
          'https://example.com/login',
          '/login',
        );

      const attempt = getDb()
        .prepare('SELECT * FROM login_attempts WHERE id = ?')
        .get(loginAttemptId) as { email: string; password_length: number };

      expect(attempt).toBeDefined();
      expect(attempt.email).toBe('user@example.com');
      expect(attempt.password_length).toBe(8);
    });

    it('powinien aktualizować wynik logowania', () => {
      const loginAttemptId = 'login-result-' + Date.now();
      const sessionId = uuidv4();

      // Wstaw próbę logowania
      getDb()
        .prepare(
          `
                INSERT INTO login_attempts 
                (id, timestamp, site_id, session_id, visitor_id, email, password_length)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
        )
        .run(
          loginAttemptId,
          new Date().toISOString(),
          'test-site',
          sessionId,
          uuidv4(),
          'user@test.com',
          10,
        );

      // Aktualizuj wynik
      getDb()
        .prepare(
          `
                UPDATE login_attempts 
                SET login_success = 1, detection_method = 'redirect', redirect_url = '/dashboard'
                WHERE id = ?
            `,
        )
        .run(loginAttemptId);

      const attempt = getDb()
        .prepare(
          'SELECT login_success, detection_method, redirect_url FROM login_attempts WHERE id = ?',
        )
        .get(loginAttemptId) as {
          login_success: number;
          detection_method: string;
          redirect_url: string;
        };

      expect(attempt.login_success).toBe(1);
      expect(attempt.detection_method).toBe('redirect');
      expect(attempt.redirect_url).toBe('/dashboard');
    });
  });

  // ========================
  // Testy wydajnościowe
  // ========================
  describe('Wydajność', () => {
    it('powinien obsłużyć batch 100 eventów w < 500ms', () => {
      const sessionId = uuidv4();
      const visitorId = uuidv4();
      const now = new Date().toISOString();

      const insertEvent = getDb().prepare(`
                INSERT INTO events (id, timestamp, site_id, session_id, visitor_id, event_type, path, data, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

      const insertMany = getDb().transaction((events: Array<{ id: string }>) => {
        for (const event of events) {
          insertEvent.run(
            event.id,
            now,
            'perf-test-site',
            sessionId,
            visitorId,
            'click',
            '/perf',
            JSON.stringify({ index: event.id }),
            now,
          );
        }
      });

      const events = Array.from({ length: 100 }, () => ({
        id: uuidv4(),
      }));

      const startTime = Date.now();
      insertMany(events);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(500);
    });
  });
});
