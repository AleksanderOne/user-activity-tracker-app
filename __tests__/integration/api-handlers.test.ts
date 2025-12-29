import { POST } from '@/app/api/collect/route';
import { setupTestDb, createMockRequest } from '../helpers';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

describe('API Handlers Integration', () => {
  let testEnv: ReturnType<typeof setupTestDb>;
  const originalTokens = process.env.API_TOKENS;

  beforeEach(() => {
    testEnv = setupTestDb();
    process.env.API_TOKENS = 'dev-token,prod-token-123';
  });

  afterEach(() => {
    testEnv.cleanup();
    process.env.API_TOKENS = originalTokens;
  });

  describe('/api/collect', () => {
    it('powinien poprawnie zapisać eventy przez rzeczywisty handler POST', async () => {
      const eventId = uuidv4();
      const sessionId = uuidv4();
      const visitorId = uuidv4();

      const payload = {
        events: [
          {
            id: eventId,
            timestamp: new Date().toISOString(),
            siteId: 'test-site',
            sessionId: sessionId,
            visitorId: visitorId,
            eventType: 'pageview',
            page: { path: '/home', url: 'http://test.com/home' },
          },
        ],
        device: {
          userAgent: 'TestBrowser',
          screenWidth: 1920,
          screenHeight: 1080,
        },
      };

      const request = createMockRequest({
        body: payload,
        headers: {
          'x-api-token': 'dev-token',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      const db = getDb();
      const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId) as Record<
        string,
        unknown
      >;
      expect(event).toBeDefined();
      expect(event.path).toBe('/home');
    });

    it('powinien odrzucić żądanie bez poprawnego tokenu', async () => {
      const payload = {
        events: [
          {
            id: uuidv4(),
            timestamp: new Date().toISOString(),
            siteId: 'test-site',
            sessionId: uuidv4(),
            visitorId: uuidv4(),
            eventType: 'pageview',
          },
        ],
      };
      const request = createMockRequest({
        body: payload,
        headers: {
          'x-api-token': 'wrong-token',
        },
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
    });

    it('powinien uszanować ustawienie isTrackingEnabled', async () => {
      const siteId = 'disabled-site';
      const eventId = uuidv4();

      const db = getDb();
      db.prepare(
        `
                INSERT INTO tracking_settings (setting_type, site_id, enabled)
                VALUES ('site', ?, 0)
            `,
      ).run(siteId);

      const payload = {
        events: [
          {
            id: eventId,
            timestamp: new Date().toISOString(),
            siteId: siteId,
            sessionId: uuidv4(),
            visitorId: uuidv4(),
            eventType: 'pageview',
          },
        ],
      };

      const request = createMockRequest({
        body: payload,
        headers: { 'x-api-token': 'dev-token' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(202);
      expect(data.tracking_disabled).toBe(true);

      const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
      expect(event).toBeUndefined();
    });
  });
});
