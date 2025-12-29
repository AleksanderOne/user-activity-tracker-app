// Typy dla modeli danych

export interface PageInfo {
  url: string;
  path: string;
  hostname: string;
  search?: string | null;
  hash?: string | null;
  title?: string | null;
  referrer?: string | null;
}

export interface EventData {
  id: string;
  timestamp: string;
  siteId: string;
  sessionId: string;
  visitorId: string;
  eventType: string;
  page: PageInfo;
  data?: Record<string, unknown> | null;
}

export interface DeviceInfo {
  userAgent?: string | null;
  language?: string | null;
  platform?: string | null;
  screenWidth?: number | null;
  screenHeight?: number | null;
  viewportWidth?: number | null;
  viewportHeight?: number | null;
  devicePixelRatio?: number | null;
  touchSupport?: boolean | null;
  cookiesEnabled?: boolean | null;
  doNotTrack?: boolean | null;
}

export interface UtmParams {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
}

export interface EventBatch {
  events: EventData[];
  device?: DeviceInfo | null;
  utm?: UtmParams | null;
}

// Typy dla odpowiedzi API

export interface OverviewStats {
  period_days: number;
  unique_visitors: number;
  total_sessions: number;
  total_events: number;
  pageviews: number;
  avg_session_duration: number; // w sekundach
  bounce_rate: number; // procent sesji z 1 pageview
  top_pages: Array<{ path: string; views: number }>;
  top_referrers: Array<{ referrer: string; count: number }>;
  top_browsers: Array<{ browser: string; count: number }>;
  top_platforms: Array<{ platform: string; count: number }>;
  top_screen_sizes: Array<{ size: string; count: number }>;
  top_languages: Array<{ language: string; count: number }>;
  top_timezones: Array<{ timezone: string; count: number }>;
  top_utm_sources: Array<{ source: string; count: number }>;
  top_utm_campaigns: Array<{ campaign: string; count: number }>;
  trends?: {
    visitors: number;
    sessions: number;
    pageviews: number;
    duration: number;
    bounce_rate: number;
  };
}

export interface RealtimeStats {
  active_visitors: number;
  active_sessions: number;
  active_pages: Array<{ path: string; sessions: number }>;
}

export interface EventsBreakdown {
  period_days: number;
  events: Array<{ event_type: string; count: number }>;
}

export interface TimelineData {
  granularity: string;
  data: Array<{
    date: string;
    visitors: number;
    pageviews: number;
  }>;
}

export interface LocationInfo {
  country?: string;
  city?: string;
  isp?: string;
  org?: string;
}

export interface NetworkInfo {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

export interface ExtendedDeviceInfo extends DeviceInfo {
  ip?: string;
  userAgentServer?: string;
  location?: LocationInfo;
  network?: NetworkInfo;
  browserName?: string;
}

export interface SessionDetails {
  session_id: string;
  visitor_id: string;
  site_id: string;
  started_at: string;
  last_activity: string;
  page_count: number;
  event_count: number;
  device_info: ExtendedDeviceInfo | null;
  utm_params: Record<string, string> | null;
}

export interface SessionsList {
  sessions: SessionDetails[];
}

export interface SessionEvents {
  session_id: string;
  events: Array<{
    id: string;
    timestamp: string;
    event_type: string;
    url: string;
    path: string;
    title: string;
    data?: Record<string, unknown> | null;
  }>;
}

export interface HeatmapData {
  path: string | null;
  clicks: Array<{ x: number; y: number }>;
}

// Statystyki serwera
export interface ServerStats {
  server_started_at: string | null;
  uptime_since_first_event: number;

  total_events: number;
  total_sessions: number;
  total_visitors: number;
  total_form_submissions: number;
  total_uploaded_files: number;

  domains: Array<{
    site_id: string;
    hostname: string | null;
    event_count: number;
    session_count: number;
    first_seen: string;
    last_seen: string;
  }>;

  logs_stats: {
    total_requests: number;
    successful_requests: number;
    failed_requests: number;
    avg_response_time_ms: number;
    min_response_time_ms: number;
    max_response_time_ms: number;
    total_data_received_bytes: number;
    total_data_sent_bytes: number;
    success_rate: number;
    requests_per_minute: number;
    status_codes: Array<{ code: number; count: number }>;
    top_endpoints: Array<{ endpoint: string; count: number; avg_time: number }>;
    recent_requests: Array<{
      endpoint: string;
      method: string;
      status_code: number;
      duration_ms: number;
      created_at: string;
    }>;
  };

  system_info: {
    node_version: string;
    platform: string;
    hostname: string;
    cpus: number;
    cpu_model: string;
    cpu_arch: string;
    memory_total_gb: number;
    memory_free_gb: number;
    memory_used_percent: number;
    os_uptime_hours: number;
    process_uptime_hours: number;
    process_pid: number;
    cwd: string;
    node_env: string;
    load_avg: number[];
    network_interfaces: number;
  };

  db_size_mb: number | null;
}

// Typy błędów API
export interface ApiError {
  status: 'error';
  message: string;
  code?: string;
}

export interface ApiSuccess<T> {
  status?: 'success';
  data?: T;
}
