import { NextRequest } from 'next/server';
import { GET, POST, DELETE } from '@/app/api/tracking/settings/route';
import { setupTestDb, createMockRequest } from '../../helpers';
import { getDb } from '@/lib/db';
import { generateDashboardToken } from '@/lib/auth';

describe('Dashboard API - Tracking Settings', () => {
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
        db.exec(`DELETE FROM tracking_settings`);
        db.exec(`DELETE FROM events`);
        db.exec(`DELETE FROM sessions`);
        // Domyślne globalne włączone
        db.prepare(`INSERT INTO tracking_settings (setting_type, site_id, enabled) VALUES ('global', NULL, 1)`).run();
    });

    const createAuthRequest = (url: string, method: string = 'GET', body: any = null) => {
        return createMockRequest({
            url,
            method,
            body,
            headers: {
                cookie: `dashboard_token=${validToken}`
            }
        });
    };

    describe('GET /api/tracking/settings', () => {
        it('powinien zwrócić 401 bez tokena', async () => {
            const req = createMockRequest({ url: 'http://localhost/api/tracking/settings', method: 'GET' });
            const res = await GET(req);
            expect(res.status).toBe(401);
        });

        it('powinien zwrócić ustawienia dla zalogowanego admina', async () => {
            const req = createAuthRequest('http://localhost/api/tracking/settings');
            const res = await GET(req);
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data.global.enabled).toBe(true); // API zwraca boolean (true/false)
        });

        it('powinien zwrócić listę stron z ich statusem', async () => {
            const db = getDb();
            // Wstawiamy jakiegoś eventa ORAZ sesję, żeby strona była widoczna jako "tracked"
            db.prepare(`INSERT INTO events (id, timestamp, site_id, session_id, visitor_id, event_type) 
                   VALUES (?, ?, ?, ?, ?, ?)`).run('ev-1', new Date().toISOString(), 'site-1', 'sess-1', 'vis-1', 'pageview');

            db.prepare(`INSERT OR IGNORE INTO sessions (session_id, visitor_id, site_id, started_at) 
                   VALUES (?, ?, ?, ?)`).run('sess-1', 'vis-1', 'site-1', new Date().toISOString());

            // Dodajemy niestandardowe ustawienie dla tej strony
            db.prepare(`INSERT INTO tracking_settings (setting_type, site_id, enabled) VALUES ('site', 'site-1', 0)`).run();

            const req = createAuthRequest('http://localhost/api/tracking/settings');
            const res = await GET(req);
            const data = await res.json();
            console.log('DEBUG DATA:', JSON.stringify(data, null, 2));

            const site = data.sites.find((s: any) => s.site_id === 'site-1');
            expect(site).toBeDefined();
            expect(site.custom_enabled).toBe(false);
            expect(site.enabled).toBe(false); // isTrackingEnabled zwraca boolean
        });
    });

    describe('POST /api/tracking/settings', () => {
        it('powinien zmienić ustawienie globalne', async () => {
            const req = createAuthRequest('http://localhost/api/tracking/settings', 'POST', {
                type: 'global',
                enabled: false
            });
            const res = await POST(req);
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data.success).toBe(true);

            const db = getDb();
            const global = db.prepare(`SELECT enabled FROM tracking_settings WHERE setting_type = 'global'`).get() as any;
            expect(global.enabled).toBe(0);
        });

        it('powinien zmienić ustawienie dla konkretnej strony', async () => {
            const req = createAuthRequest('http://localhost/api/tracking/settings', 'POST', {
                type: 'site',
                site_id: 'new-site',
                enabled: false
            });
            const res = await POST(req);
            expect(res.status).toBe(200);

            const db = getDb();
            const siteSetting = db.prepare(`SELECT enabled FROM tracking_settings WHERE setting_type = 'site' AND site_id = ?`).get('new-site') as any;
            expect(siteSetting.enabled).toBe(0);
        });

        it('powinien walidować brakujące dane', async () => {
            const req = createAuthRequest('http://localhost/api/tracking/settings', 'POST', {
                type: 'site',
                // brak site_id
                enabled: false
            });
            const res = await POST(req);
            expect(res.status).toBe(400);
        });
    });

    describe('DELETE /api/tracking/settings', () => {
        it('powinien usunąć ustawienie specyficzne dla strony', async () => {
            const db = getDb();
            db.prepare(`INSERT INTO tracking_settings (setting_type, site_id, enabled) VALUES ('site', 'to-delete', 0)`).run();

            const req = createAuthRequest('http://localhost/api/tracking/settings', 'DELETE', {
                site_id: 'to-delete'
            });
            const res = await DELETE(req);
            expect(res.status).toBe(200);

            const setting = db.prepare(`SELECT * FROM tracking_settings WHERE site_id = ?`).get('to-delete');
            expect(setting).toBeUndefined();
        });
    });
});
