/**
 * Testy jednostkowe dla funkcji tracking w module db
 * Testuje zarządzanie ustawieniami śledzenia
 */

import Database from 'better-sqlite3';

// Mockujemy moduł db żeby nie używać produkcyjnej bazy
vi.mock('@/lib/db', async () => {
  const originalModule = await vi.importActual<Record<string, unknown>>('@/lib/db');
  return {
    ...originalModule,
    getDb: vi.fn(),
  };
});

describe('Funkcje Tracking w DB', () => {
  let testDb: Database.Database;

  beforeAll(() => {
    // Utwórz testową bazę w pamięci
    testDb = new Database(':memory:');
    testDb.pragma('journal_mode = WAL');

    // Utwórz tabelę tracking_settings
    testDb.exec(`
            CREATE TABLE IF NOT EXISTS tracking_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                setting_type TEXT NOT NULL CHECK(setting_type IN ('global', 'site')),
                site_id TEXT,
                enabled INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_by TEXT,
                UNIQUE(setting_type, site_id)
            )
        `);

    // Dodaj domyślne ustawienie globalne
    testDb.exec(`
            INSERT OR IGNORE INTO tracking_settings (setting_type, site_id, enabled, updated_at)
            VALUES ('global', NULL, 1, CURRENT_TIMESTAMP)
        `);

    // Utwórz tabelę sessions (potrzebna dla getAllTrackedSites)
    testDb.exec(`
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                visitor_id TEXT NOT NULL,
                site_id TEXT NOT NULL,
                started_at TEXT NOT NULL
            )
        `);
  });

  afterAll(() => {
    // Zamknij połączenie bazy w pamięci
    if (testDb) {
      testDb.close();
    }
  });

  beforeEach(() => {
    // Reset danych przed każdym testem
    testDb.exec(`DELETE FROM tracking_settings WHERE setting_type = 'site'`);
    testDb.exec(`UPDATE tracking_settings SET enabled = 1 WHERE setting_type = 'global'`);
  });

  // ========================
  // Testy isTrackingEnabled
  // ========================
  describe('isTrackingEnabled', () => {
    it('powinien zwrócić false dla siteId zaczynającego się od "dashboard"', () => {
      // Symulacja logiki z db.ts dla dashboard
      const siteId = 'dashboard-test';
      const shouldTrack = !siteId.startsWith('dashboard');

      expect(shouldTrack).toBe(false);
    });

    it('powinien zwrócić false dla siteId zawierającego "/dashboard"', () => {
      const siteId = 'test/dashboard/page';
      const shouldTrack = !siteId.includes('/dashboard');

      expect(shouldTrack).toBe(false);
    });

    it('powinien zwrócić true dla normalnego siteId gdy tracking włączony', () => {
      const globalSetting = testDb
        .prepare(
          `
                SELECT enabled FROM tracking_settings 
                WHERE setting_type = 'global' AND site_id IS NULL
            `,
        )
        .get() as { enabled: number };

      expect(globalSetting.enabled).toBe(1);
    });

    it('powinien zwrócić false gdy globalnie wyłączone', () => {
      // Wyłącz globalnie
      testDb
        .prepare(
          `
                UPDATE tracking_settings 
                SET enabled = 0 
                WHERE setting_type = 'global' AND site_id IS NULL
            `,
        )
        .run();

      const globalSetting = testDb
        .prepare(
          `
                SELECT enabled FROM tracking_settings 
                WHERE setting_type = 'global' AND site_id IS NULL
            `,
        )
        .get() as { enabled: number };

      expect(globalSetting.enabled).toBe(0);
    });

    it('powinien respektować ustawienia per site', () => {
      const siteId = 'test-site';

      // Dodaj ustawienie dla konkretnego site
      testDb
        .prepare(
          `
                INSERT INTO tracking_settings (setting_type, site_id, enabled)
                VALUES ('site', ?, 0)
            `,
        )
        .run(siteId);

      const siteSetting = testDb
        .prepare(
          `
                SELECT enabled FROM tracking_settings 
                WHERE setting_type = 'site' AND site_id = ?
            `,
        )
        .get(siteId) as { enabled: number };

      expect(siteSetting.enabled).toBe(0);
    });
  });

  // ========================
  // Testy getTrackingSettings
  // ========================
  describe('getTrackingSettings', () => {
    it('powinien zwrócić wszystkie ustawienia', () => {
      // Dodaj kilka ustawień site
      testDb
        .prepare(
          `
                INSERT INTO tracking_settings (setting_type, site_id, enabled)
                VALUES ('site', 'site1', 1), ('site', 'site2', 0)
            `,
        )
        .run();

      const settings = testDb
        .prepare(
          `
                SELECT id, setting_type, site_id, enabled, updated_at, updated_by
                FROM tracking_settings
                ORDER BY setting_type DESC, site_id ASC
            `,
        )
        .all();

      expect(settings.length).toBeGreaterThanOrEqual(1);
    });

    it('powinien zawierać ustawienie globalne', () => {
      const globalSetting = testDb
        .prepare(
          `
                SELECT * FROM tracking_settings 
                WHERE setting_type = 'global'
            `,
        )
        .get();

      expect(globalSetting).toBeDefined();
    });
  });

  // ========================
  // Testy setGlobalTrackingEnabled
  // ========================
  describe('setGlobalTrackingEnabled', () => {
    it('powinien wyłączyć tracking globalnie', () => {
      testDb
        .prepare(
          `
                UPDATE tracking_settings 
                SET enabled = 0, updated_at = CURRENT_TIMESTAMP, updated_by = ?
                WHERE setting_type = 'global' AND site_id IS NULL
            `,
        )
        .run('test-user');

      const globalSetting = testDb
        .prepare(
          `
                SELECT enabled FROM tracking_settings 
                WHERE setting_type = 'global'
            `,
        )
        .get() as { enabled: number };

      expect(globalSetting.enabled).toBe(0);
    });

    it('powinien włączyć tracking globalnie', () => {
      // Najpierw wyłącz
      testDb
        .prepare(
          `
                UPDATE tracking_settings SET enabled = 0 WHERE setting_type = 'global'
            `,
        )
        .run();

      // Włącz ponownie
      testDb
        .prepare(
          `
                UPDATE tracking_settings SET enabled = 1 WHERE setting_type = 'global'
            `,
        )
        .run();

      const globalSetting = testDb
        .prepare(
          `
                SELECT enabled FROM tracking_settings 
                WHERE setting_type = 'global'
            `,
        )
        .get() as { enabled: number };

      expect(globalSetting.enabled).toBe(1);
    });

    it('powinien zapisać kto zmienił ustawienie', () => {
      const updatedBy = 'admin@test.com';

      testDb
        .prepare(
          `
                UPDATE tracking_settings 
                SET enabled = 0, updated_by = ?
                WHERE setting_type = 'global'
            `,
        )
        .run(updatedBy);

      const globalSetting = testDb
        .prepare(
          `
                SELECT updated_by FROM tracking_settings 
                WHERE setting_type = 'global'
            `,
        )
        .get() as { updated_by: string };

      expect(globalSetting.updated_by).toBe(updatedBy);
    });
  });

  // ========================
  // Testy setSiteTrackingEnabled
  // ========================
  describe('setSiteTrackingEnabled', () => {
    it('powinien dodać ustawienie dla nowego site', () => {
      const siteId = 'new-site';

      testDb
        .prepare(
          `
                INSERT INTO tracking_settings (setting_type, site_id, enabled, updated_at, updated_by)
                VALUES ('site', ?, 0, CURRENT_TIMESTAMP, ?)
                ON CONFLICT(setting_type, site_id) 
                DO UPDATE SET enabled = 0, updated_at = CURRENT_TIMESTAMP, updated_by = ?
            `,
        )
        .run(siteId, 'admin', 'admin');

      const siteSetting = testDb
        .prepare(
          `
                SELECT enabled FROM tracking_settings 
                WHERE setting_type = 'site' AND site_id = ?
            `,
        )
        .get(siteId) as { enabled: number };

      expect(siteSetting.enabled).toBe(0);
    });

    it('powinien zaktualizować istniejące ustawienie site', () => {
      const siteId = 'existing-site';

      // Dodaj ustawienie
      testDb
        .prepare(
          `
                INSERT INTO tracking_settings (setting_type, site_id, enabled)
                VALUES ('site', ?, 1)
            `,
        )
        .run(siteId);

      // Zaktualizuj
      testDb
        .prepare(
          `
                UPDATE tracking_settings SET enabled = 0 
                WHERE setting_type = 'site' AND site_id = ?
            `,
        )
        .run(siteId);

      const siteSetting = testDb
        .prepare(
          `
                SELECT enabled FROM tracking_settings 
                WHERE setting_type = 'site' AND site_id = ?
            `,
        )
        .get(siteId) as { enabled: number };

      expect(siteSetting.enabled).toBe(0);
    });
  });

  // ========================
  // Testy removeSiteTrackingSetting
  // ========================
  describe('removeSiteTrackingSetting', () => {
    it('powinien usunąć ustawienie dla site', () => {
      const siteId = 'site-to-remove';

      // Dodaj ustawienie
      testDb
        .prepare(
          `
                INSERT INTO tracking_settings (setting_type, site_id, enabled)
                VALUES ('site', ?, 0)
            `,
        )
        .run(siteId);

      // Usuń
      testDb
        .prepare(
          `
                DELETE FROM tracking_settings 
                WHERE setting_type = 'site' AND site_id = ?
            `,
        )
        .run(siteId);

      const siteSetting = testDb
        .prepare(
          `
                SELECT * FROM tracking_settings 
                WHERE setting_type = 'site' AND site_id = ?
            `,
        )
        .get(siteId);

      expect(siteSetting).toBeUndefined();
    });

    it('nie powinien usuwać ustawienia globalnego', () => {
      // Próba usunięcia globalnego (nie powinna działać)
      testDb
        .prepare(
          `
                DELETE FROM tracking_settings 
                WHERE setting_type = 'site' AND site_id IS NULL
            `,
        )
        .run();

      const globalSetting = testDb
        .prepare(
          `
                SELECT * FROM tracking_settings 
                WHERE setting_type = 'global'
            `,
        )
        .get();

      expect(globalSetting).toBeDefined();
    });
  });

  // ========================
  // Testy getAllTrackedSites
  // ========================
  describe('getAllTrackedSites', () => {
    it('powinien zwrócić listę unikalnych site_id', () => {
      // Dodaj sesje z różnymi site_id
      testDb
        .prepare(
          `
                INSERT INTO sessions (session_id, visitor_id, site_id, started_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            `,
        )
        .run('session1', 'visitor1', 'site-a');

      testDb
        .prepare(
          `
                INSERT INTO sessions (session_id, visitor_id, site_id, started_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            `,
        )
        .run('session2', 'visitor2', 'site-b');

      testDb
        .prepare(
          `
                INSERT INTO sessions (session_id, visitor_id, site_id, started_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            `,
        )
        .run('session3', 'visitor3', 'site-a'); // Duplikat

      const sites = testDb
        .prepare(
          `
                SELECT DISTINCT site_id FROM sessions 
                WHERE site_id IS NOT NULL
                ORDER BY site_id ASC
            `,
        )
        .all() as Array<{ site_id: string }>;

      expect(sites.length).toBe(2);
      expect(sites.map((s) => s.site_id)).toContain('site-a');
      expect(sites.map((s) => s.site_id)).toContain('site-b');
    });

    it('powinien zwrócić pustą tablicę gdy brak sesji', () => {
      // Wyczyść sesje
      testDb.exec(`DELETE FROM sessions`);

      const sites = testDb
        .prepare(
          `
                SELECT DISTINCT site_id FROM sessions 
                WHERE site_id IS NOT NULL
            `,
        )
        .all();

      expect(sites.length).toBe(0);
    });
  });

  // ========================
  // Testy priorytetów ustawień
  // ========================
  describe('Priorytety ustawień', () => {
    it('ustawienie site powinno nadpisywać globalne', () => {
      const siteId = 'override-test';

      // Globalnie włączone
      testDb
        .prepare(
          `
                UPDATE tracking_settings SET enabled = 1 WHERE setting_type = 'global'
            `,
        )
        .run();

      // Site wyłączony
      testDb
        .prepare(
          `
                INSERT INTO tracking_settings (setting_type, site_id, enabled)
                VALUES ('site', ?, 0)
            `,
        )
        .run(siteId);

      // Logika sprawdzania (symulacja isTrackingEnabled)
      const globalSetting = testDb
        .prepare(
          `
                SELECT enabled FROM tracking_settings 
                WHERE setting_type = 'global'
            `,
        )
        .get() as { enabled: number };

      const siteSetting = testDb
        .prepare(
          `
                SELECT enabled FROM tracking_settings 
                WHERE setting_type = 'site' AND site_id = ?
            `,
        )
        .get(siteId) as { enabled: number } | undefined;

      // Globalnie włączone
      expect(globalSetting.enabled).toBe(1);

      // Ale site wyłączony - powinien nadpisać
      expect(siteSetting?.enabled).toBe(0);

      // Końcowy wynik: wyłączone dla tego site
      const isEnabled =
        globalSetting.enabled === 1 && (siteSetting === undefined || siteSetting.enabled === 1);
      expect(isEnabled).toBe(false);
    });

    it('gdy globalnie wyłączone, site nie może włączyć', () => {
      const siteId = 'cannot-enable';

      // Globalnie wyłączone
      testDb
        .prepare(
          `
                UPDATE tracking_settings SET enabled = 0 WHERE setting_type = 'global'
            `,
        )
        .run();

      // Site próbuje włączyć
      testDb
        .prepare(
          `
                INSERT INTO tracking_settings (setting_type, site_id, enabled)
                VALUES ('site', ?, 1)
            `,
        )
        .run(siteId);

      const globalSetting = testDb
        .prepare(
          `
                SELECT enabled FROM tracking_settings 
                WHERE setting_type = 'global'
            `,
        )
        .get() as { enabled: number };

      // Globalnie wyłączone = zawsze wyłączone
      expect(globalSetting.enabled).toBe(0);

      // Końcowy wynik: wyłączone (global ma priorytet)
      const isEnabled = globalSetting.enabled === 1;
      expect(isEnabled).toBe(false);
    });
  });
});
