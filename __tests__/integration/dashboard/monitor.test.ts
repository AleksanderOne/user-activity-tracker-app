import { NextRequest } from 'next/server';
import { GET } from '@/app/api/monitor/route';
import { setupTestDb, createMockRequest } from '../../helpers';
import { getDb } from '@/lib/db';
import { generateDashboardToken } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';

describe('Dashboard API - Monitor', () => {
    let testEnv: ReturnType<typeof setupTestDb>;
    let validToken: string;

    beforeAll(() => {
        testEnv = setupTestDb();
        validToken = generateDashboardToken();
    });

    afterAll(() => {
        testEnv.cleanup();
    });

    beforeEach(() => {
        const db = getDb();
        db.exec(`DELETE FROM events`);
        db.exec(`DELETE FROM communication_logs`);
        db.exec(`DELETE FROM sessions`);
    });

    const createAuthRequest = (url: string) => {
        return createMockRequest({
            url,
            method: 'GET',
            headers: {
                cookie: `dashboard_token=${validToken}`
            }
        });
    };

    it('powinien zwrócić statusy stron na podstawie aktywności', async () => {
        const db = getDb();
        const now = new Date();
        const onlineTime = now.toISOString();
        const idleTime = new Date(now.getTime() - 5 * 60 * 1000).toISOString(); // 5 min temu -> idle
        const offlineTime = new Date(now.getTime() - 15 * 60 * 1000).toISOString(); // 15 min temu -> offline

        // Strona 1: Online (przez event)
        db.prepare(`INSERT INTO events (id, timestamp, site_id, session_id, visitor_id, event_type) 
               VALUES (?, ?, ?, ?, ?, ?)`).run(uuidv4(), onlineTime, 'site-online', uuidv4(), uuidv4(), 'pageview');

        // Strona 2: Idle (przez logi)
        db.prepare(`INSERT INTO communication_logs (id, timestamp, site_id, method, endpoint, status_code, duration_ms, ip) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(uuidv4(), idleTime, 'site-idle', 'POST', '/api/collect', 200, 50, '127.0.0.1');

        // Strona 3: Offline
        db.prepare(`INSERT INTO events (id, timestamp, site_id, session_id, visitor_id, event_type) 
               VALUES (?, ?, ?, ?, ?, ?)`).run(uuidv4(), offlineTime, 'site-offline', uuidv4(), uuidv4(), 'pageview');

        const req = createAuthRequest('http://localhost/api/monitor');
        const res = await GET(req);
        const data = await res.json();

        expect(res.status).toBe(200);

        const onlineSite = data.sites.find((s: any) => s.site_id === 'site-online');
        const idleSite = data.sites.find((s: any) => s.site_id === 'site-idle');
        const offlineSite = data.sites.find((s: any) => s.site_id === 'site-offline');

        expect(onlineSite.status).toBe('online');
        expect(idleSite.status).toBe('idle');
        expect(offlineSite.status).toBe('offline');

        expect(data.summary.online_count).toBe(1);
        expect(data.summary.idle_count).toBe(1);
        expect(data.summary.offline_count).toBe(1);
    });

    it('powinien poprawnie grupować błędy i czas odpowiedzi', async () => {
        const db = getDb();
        const now = new Date().toISOString();

        // Dodaj logi: 1 sukces (100ms), 1 błąd (500ms)
        db.prepare(`INSERT INTO communication_logs (id, timestamp, site_id, method, endpoint, status_code, duration_ms, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(uuidv4(), now, 'test-site', 'POST', '/api/collect', 200, 100, '127.0.0.1');

        db.prepare(`INSERT INTO communication_logs (id, timestamp, site_id, method, endpoint, status_code, duration_ms, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(uuidv4(), now, 'test-site', 'POST', '/api/collect', 500, 500, '127.0.0.1');

        const req = createAuthRequest('http://localhost/api/monitor');
        const res = await GET(req);
        const data = await res.json();

        const site = data.sites[0];
        expect(site.errors_last_hour).toBe(1);
        expect(site.avg_response_time).toBe(300); // (100+500)/2
    });

    it('powinien filtrować po site_ids', async () => {
        const db = getDb();
        const now = new Date().toISOString();
        db.prepare(`INSERT INTO events (id, timestamp, site_id, session_id, visitor_id, event_type) VALUES (?, ?, ?, ?, ?, ?)`).run(uuidv4(), now, 'site-a', uuidv4(), uuidv4(), 'pageview');
        db.prepare(`INSERT INTO events (id, timestamp, site_id, session_id, visitor_id, event_type) VALUES (?, ?, ?, ?, ?, ?)`).run(uuidv4(), now, 'site-b', uuidv4(), uuidv4(), 'pageview');

        const req = createAuthRequest('http://localhost/api/monitor?site_ids=site-a');
        const res = await GET(req);
        const data = await res.json();

        expect(data.sites.length).toBe(1);
        expect(data.sites[0].site_id).toBe('site-a');
    });
});
