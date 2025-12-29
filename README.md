# 🔍 User Activity Tracker

**Kompletny system śledzenia aktywności użytkowników** zbudowany na Next.js 16 + TypeScript + SQLite.

Zbiera szczegółowe dane o zachowaniu użytkowników na stronach internetowych — od prostych pageview'ów po zaawansowane metryki jak rage clicks, keylogging (bez haseł!), interakcje z UI componentami i Core Web Vitals.

---

## 📑 Spis treści

1. [Funkcjonalności](#-funkcjonalności)
2. [Architektura](#-architektura)
3. [Wymagania](#-wymagania)
4. [Instalacja](#-instalacja)
5. [Uruchomienie](#-uruchomienie)
6. [Konfiguracja](#%EF%B8%8F-konfiguracja)
7. [Integracja trackera](#-integracja-trackera-na-swojej-stronie)
8. [API Reference](#-api-reference)
9. [Dashboard](#-dashboard)
10. [Bezpieczeństwo](#-bezpieczeństwo)
11. [Baza danych](#-baza-danych)
12. [Deploy](#-deploy)
13. [Troubleshooting](#-troubleshooting)

---

## 🚀 Funkcjonalności

### Co jest śledzone automatycznie

| Kategoria                      | Zdarzenia                                                        |
| ------------------------------ | ---------------------------------------------------------------- |
| 📊 **Nawigacja**               | Pageviews, odsłony stron, referrer, parametry UTM                |
| 🖱️ **Kliknięcia**              | Wszystkie kliknięcia w linki, przyciski, elementy z `data-track` |
| 😤 **Rage Clicks**             | Wykrywanie frustracji (3+ kliknięć w <1s w promieniu 20px)       |
| 📜 **Scroll**                  | Głębokość przewijania (progi: 25%, 50%, 75%, 100%)               |
| 📝 **Formularze**              | Start wypełniania, focus na polach, submit + czas wypełniania    |
| ⌨️ **Wpisywanie**              | Sekwencje wpisywane w inputy (bez pól password!)                 |
| 📋 **Schowek**                 | Copy, cut, paste + fragment treści                               |
| ⏱️ **Czas na stronie**         | Heartbeat co 30s, całkowity czas wizyty                          |
| 🎯 **Ruch myszy**              | Ścieżki ruchu do heatmapy                                        |
| 📋 **Zaznaczanie tekstu**      | Kopiowany/zaznaczony tekst                                       |
| ⚠️ **Błędy JS**                | Runtime errors + unhandled promise rejections                    |
| 🚀 **Performance**             | Core Web Vitals, TTFB, DOM ready, FCP                            |
| 👁️ **Widoczność**              | Elementy z `data-track-view` widoczne w viewport                 |
| 🔄 **Dynamiczne UI**           | Modale, toasty, sheety, dropdowny (shadcn/radix)                 |
| ☑️ **Formularze zaawansowane** | Checkboxy, switche, slidery, taby, accordiony                    |

### Zbierane informacje o urządzeniu

- User Agent, język, platforma, strefa czasowa
- Rozdzielczość ekranu, viewport, device pixel ratio
- Touch support, ilość punktów dotyku
- GPU (vendor, renderer via WebGL)
- Bateria (poziom, ładowanie)
- Sieć (typ połączenia, RTT, downlink, saveData)
- Pamięć RAM (deviceMemory API)
- Liczba rdzeni CPU
- Canvas fingerprint
- Pluginy przeglądarki
- Lokalizacja (kraj, miasto via GeoIP)

---

## 🏗️ Architektura

```
┌─────────────────────────────────────────────────────────────────┐
│                         KLIENT (Strona www)                     │
├─────────────────────────────────────────────────────────────────┤
│  tracker.js                                                     │
│  ├── Zbiera eventy (click, scroll, form, error...)             │
│  ├── Batching (10 eventów lub 5s timeout)                      │
│  ├── sendBeacon + fetch fallback                               │
│  └── localStorage (visitorId) + sessionStorage (sessionId)     │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼ POST /api/collect
┌─────────────────────────────────────────────────────────────────┐
│                         SERWER (Next.js API)                    │
├─────────────────────────────────────────────────────────────────┤
│  proxy.ts                                                       │
│  ├── CORS headers                                               │
│  ├── JWT auth check (dashboard routes)                          │
│  └── Redirect logic                                             │
├─────────────────────────────────────────────────────────────────┤
│  /api/collect                                                   │
│  ├── Rate limiting (100 req/min per IP)                        │
│  ├── API token verification                                     │
│  ├── Zod schema validation                                      │
│  ├── GeoIP lookup (z cache)                                     │
│  └── SQLite transaction (INSERT events + UPDATE session)        │
├─────────────────────────────────────────────────────────────────┤
│  /api/stats/*                                                   │
│  ├── JWT cookie auth required                                   │
│  ├── overview, realtime, events, timeline                       │
│  └── Agregacje SQL z indeksami                                  │
├─────────────────────────────────────────────────────────────────┤
│  /api/sessions/*                                                │
│  └── Lista sesji + szczegóły z eventami                         │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BAZA DANYCH (SQLite)                       │
├─────────────────────────────────────────────────────────────────┤
│  tracker.db (better-sqlite3)                                    │
│  ├── events (id, timestamp, session_id, event_type, data...)   │
│  ├── sessions (session_id, visitor_id, device_info, utm...)    │
│  ├── visitors (visitor_id, first_seen, session_count...)       │
│  └── Złożone indeksy dla wydajności                             │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                         DASHBOARD (React)                       │
├─────────────────────────────────────────────────────────────────┤
│  /dashboard                                                     │
│  ├── Realtime stats (aktywni w 5min)                           │
│  ├── Wykresy aktywności (Recharts)                              │
│  ├── Breakdown typów eventów                                    │
│  ├── Top strony                                                 │
│  ├── Lista sesji z detalami                                     │
│  └── Filtrowanie po dacie i site_id                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📋 Wymagania

- **Node.js** 18.0+ (zalecane 20.x)
- **npm** 9.0+ lub **yarn** 1.22+
- System operacyjny: Linux, macOS, Windows (WSL2 zalecany)

> ⚠️ **Uwaga**: `better-sqlite3` wymaga kompilacji natywnej. Na Windows może być potrzebny Visual Studio Build Tools.

---

## 📦 Instalacja

### 1. Sklonuj repozytorium

```bash
git clone https://github.com/your-repo/user-activity-tracker-app.git
cd user-activity-tracker-app
```

### 2. Zainstaluj zależności

```bash
npm install
```

### 3. (Opcjonalnie) Skonfiguruj zmienne środowiskowe

Utwórz plik `.env.local`:

```bash
cp .env.example .env.local
# Edytuj plik i ustaw swoje wartości
```

---

## ▶️ Uruchomienie

### Tryb developerski

```bash
npm run dev
```

Aplikacja uruchomi się na `http://localhost:3000`

### Tryb produkcyjny

```bash
npm run build
npm start
```

### Dostępne adresy

| URL                               | Opis                                  |
| --------------------------------- | ------------------------------------- |
| `http://localhost:3000`           | Strona główna (redirect do dashboard) |
| `http://localhost:3000/login`     | Strona logowania                      |
| `http://localhost:3000/dashboard` | Panel administracyjny                 |
| `http://localhost:3000/demo.html` | Strona demo do testowania trackera    |
| `http://localhost:3000/demo`      | Interaktywna strona demo (React)      |

---

## ⚙️ Konfiguracja

### Zmienne środowiskowe (.env.local)

```bash
# ═══════════════════════════════════════════════════════════════
# BEZPIECZEŃSTWO (WYMAGANE W PRODUKCJI)
# ═══════════════════════════════════════════════════════════════

# Sekret JWT - MUSI być ustawiony w produkcji
# Wygeneruj: openssl rand -base64 32
JWT_SECRET=twoj_super_tajny_klucz_jwt_min_32_znaki

# Hasło do dashboardu (jedna z opcji):

# Opcja 1: Plain text (tylko development!)
DASHBOARD_PASSWORD=twoje_silne_haslo

# Opcja 2: Hash bcrypt (zalecane w produkcji)
# Wygeneruj: node -e "console.log(require('bcryptjs').hashSync('twoje_haslo', 12))"
DASHBOARD_PASSWORD_HASH=$2a$12$...

# ═══════════════════════════════════════════════════════════════
# CORS - Dozwolone domeny (produkcja)
# ═══════════════════════════════════════════════════════════════
ALLOWED_ORIGINS=https://twoja-strona.pl,https://app.twoja-strona.pl

# ═══════════════════════════════════════════════════════════════
# TOKENY API (opcjonalne)
# Format: siteId:secret,siteId2:secret2
# ═══════════════════════════════════════════════════════════════
API_TOKENS=moja-strona.pl:abc123xyz,sklep.pl:def456uvw

# ═══════════════════════════════════════════════════════════════
# BAZA DANYCH (opcjonalne)
# ═══════════════════════════════════════════════════════════════
TRACKER_DB=/sciezka/do/tracker.db
```

### Tryb development vs production

| Ustawienie      | Development                | Production                 |
| --------------- | -------------------------- | -------------------------- |
| CORS            | Akceptuje wszystkie domeny | Wymaga `ALLOWED_ORIGINS`   |
| API Token       | Opcjonalny                 | Zalecany (ostrzeżenie bez) |
| Hasło dashboard | Domyślnie `admin123`       | Wymaga konfiguracji        |
| JWT Secret      | Auto-generowany            | Wymaga `JWT_SECRET`        |
| Debug logs      | Włączone                   | Wyłączone                  |

---

## 🔗 Integracja trackera na swojej stronie

### Metoda 1: Prosty tag script

Dodaj przed `</body>` lub w `<head>`:

```html
<script
  src="https://twoj-tracker.pl/tracker.js"
  data-endpoint="https://twoj-tracker.pl/api"
  data-site-id="nazwa-twojej-strony"
  data-api-token="nazwa-twojej-strony:tajny_token"
  data-debug="false"
  async
></script>
```

### Metoda 2: Konfiguracja dynamiczna

```html
<script src="https://twoj-tracker.pl/tracker.js" async></script>
<script>
  // Poczekaj na załadowanie trackera
  window.addEventListener('load', function () {
    Tracker.config({
      endpoint: 'https://twoj-tracker.pl/api',
      siteId: 'moja-strona',
      debug: true, // Włącz logi w konsoli
    });
  });
</script>
```

### Atrybuty konfiguracji

| Atrybut          | Opis                 | Wymagany | Domyślnie               |
| ---------------- | -------------------- | -------- | ----------------------- |
| `data-endpoint`  | URL API trackera     | NIE      | `/api` (ta sama domena) |
| `data-site-id`   | Identyfikator strony | NIE      | Hostname strony         |
| `data-api-token` | Token autoryzacji    | NIE      | Brak                    |
| `data-debug`     | Logi w konsoli       | NIE      | `false`                 |

### Śledzenie custom eventów

```javascript
// Prosty event
Tracker.track('video_play', {
  videoId: 'abc123',
  title: 'Wprowadzenie',
});

// Event z kategoriami
Tracker.track('purchase', {
  category: 'ecommerce',
  action: 'buy',
  value: 99.99,
  currency: 'PLN',
  productId: 'SKU-001',
});

// Wymuszenie wysłania (np. przed redirectem)
Tracker.flush();
```

### Śledzenie widoczności elementów

```html
<!-- Element zostanie zarejestrowany gdy będzie widoczny w 50% viewportu -->
<section data-track-view="hero-section">
  <h1>Witaj na stronie!</h1>
</section>

<div data-track-view="pricing-table">
  <!-- Tabela cenowa -->
</div>
```

### Śledzenie kliknięć z nazwą

```html
<button data-track="signup-cta">Zarejestruj się</button>
<a href="/cennik" data-track="pricing-link">Zobacz cennik</a>
```

---

## 📡 API Reference

### Endpointy publiczne

| Metoda | Endpoint           | Opis                   | Autoryzacja                |
| ------ | ------------------ | ---------------------- | -------------------------- |
| POST   | `/api/collect`     | Zbieranie eventów      | `X-API-Token` (opcjonalny) |
| POST   | `/api/auth/login`  | Logowanie do dashboard | Brak                       |
| POST   | `/api/auth/logout` | Wylogowanie            | Brak                       |

### Endpointy chronione (wymagają JWT cookie)

| Metoda | Endpoint                    | Opis                               |
| ------ | --------------------------- | ---------------------------------- |
| GET    | `/api/stats/overview`       | Statystyki ogólne                  |
| GET    | `/api/stats/realtime`       | Aktywność na żywo (ostatnie 5 min) |
| GET    | `/api/stats/events`         | Breakdown typów eventów            |
| GET    | `/api/stats/timeline`       | Aktywność w czasie                 |
| GET    | `/api/sessions`             | Lista sesji                        |
| GET    | `/api/sessions/[id]`        | Szczegóły sesji                    |
| GET    | `/api/sessions/[id]/events` | Eventy sesji                       |
| GET    | `/api/clicks/heatmap`       | Dane do heatmapy                   |

### Parametry zapytań

```
?from=2024-01-01T00:00:00Z    # Data początkowa (ISO 8601)
?to=2024-01-31T23:59:59Z      # Data końcowa (ISO 8601)
?days=7                        # Alternatywa: ostatnie N dni
?site_id=moja-strona          # Filtrowanie po stronie
?limit=50                      # Limit wyników
?offset=0                      # Przesunięcie (paginacja)
?granularity=hour             # Dla timeline: hour/day/week
```

### Przykłady użycia API

```bash
# Statystyki z ostatnich 7 dni
curl http://localhost:3000/api/stats/overview?days=7

# Realtime (aktywni w 5 min)
curl http://localhost:3000/api/stats/realtime

# Timeline godzinowy
curl "http://localhost:3000/api/stats/timeline?days=7&granularity=hour"

# Lista sesji
curl "http://localhost:3000/api/sessions?limit=10"

# Wysyłanie eventów
curl -X POST http://localhost:3000/api/collect \
  -H "Content-Type: application/json" \
  -H "X-API-Token: moja-strona:tajny_token" \
  -d '{
    "events": [{
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "timestamp": "2024-01-15T10:30:00Z",
      "siteId": "moja-strona",
      "sessionId": "550e8400-e29b-41d4-a716-446655440001",
      "visitorId": "550e8400-e29b-41d4-a716-446655440002",
      "eventType": "pageview",
      "page": {"path": "/home"}
    }]
  }'
```

### Struktura payloadu /api/collect

```typescript
interface CollectPayload {
  events: Event[]; // Max 100 eventów na request
  device?: DeviceInfo; // Informacje o urządzeniu
  utm?: UtmParams; // Parametry kampanii
}

interface Event {
  id: string; // UUID v4
  timestamp: string; // ISO 8601
  siteId: string; // Identyfikator strony
  sessionId: string; // UUID sesji
  visitorId: string; // UUID użytkownika
  eventType: string; // Typ eventu
  page?: PageInfo; // Info o stronie
  data?: Record<string, any>; // Dodatkowe dane
}
```

---

## 📊 Dashboard

### Logowanie

- URL: `/login`
- Domyślne hasło (development): `admin123`
- JWT token ważny 7 dni

### Funkcje dashboardu

1. **Realtime Stats** - Aktywni użytkownicy w ostatnich 5 minutach
2. **Overview** - Pageviews, sesje, unikalni użytkownicy, avg. czas
3. **Timeline Chart** - Wykres aktywności w czasie (Recharts)
4. **Event Breakdown** - Rozkład typów eventów (pie chart)
5. **Top Pages** - Najpopularniejsze strony
6. **Recent Sessions** - Lista sesji z możliwością podglądu detali

### Filtrowanie danych

- Zakres dat (od/do)
- Ostatnie N dni (quick filters)
- Filtr po site_id (gdy masz wiele stron)

---

## 🔒 Bezpieczeństwo

### Wbudowane zabezpieczenia

| Funkcja                        | Opis                                              |
| ------------------------------ | ------------------------------------------------- |
| **JWT Authentication**         | Token podpisany cyfrowo (HS256)                   |
| **Rate Limiting**              | 100 req/min na `/collect`, 5 prób logowania/15min |
| **Walidacja Zod**              | Schemat dla wszystkich danych wejściowych         |
| **CORS**                       | Konfigurowalny dla dozwolonych domen              |
| **Token API**                  | Opcjonalna autoryzacja dla stron trackingowych    |
| **IP Hashing**                 | SHA256, pierwsze 16 znaków                        |
| **GeoIP Cache**                | Ochrona przed rate limit zewnętrznego API         |
| **Filtrowanie pól wrażliwych** | Pola z "password", "card", "cvv" = `[CHRONIONE]`  |

### Checklist przed produkcją

- [ ] Ustaw `JWT_SECRET` (min. 32 znaki)
- [ ] Ustaw `DASHBOARD_PASSWORD_HASH` (bcrypt)
- [ ] Skonfiguruj `ALLOWED_ORIGINS`
- [ ] Rozważ `API_TOKENS` dla każdej strony
- [ ] Włącz HTTPS
- [ ] Skonfiguruj firewall

---

## 🗄️ Baza danych

### SQLite (better-sqlite3)

Baza jest tworzona automatycznie przy pierwszym uruchomieniu.

```bash
# Lokalizacja domyślna
./tracker.db

# Lub zmień przez env
export TRACKER_DB=/var/data/tracker.db
```

### Schemat tabel

```sql
-- Eventy (główna tabela)
CREATE TABLE events (
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
    data TEXT,              -- JSON
    ip_hash TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Sesje
CREATE TABLE sessions (
    session_id TEXT PRIMARY KEY,
    visitor_id TEXT NOT NULL,
    site_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    last_activity TEXT,
    device_info TEXT,       -- JSON
    utm_params TEXT,        -- JSON
    ip_hash TEXT,
    page_count INTEGER DEFAULT 0,
    event_count INTEGER DEFAULT 0
);

-- Użytkownicy
CREATE TABLE visitors (
    visitor_id TEXT PRIMARY KEY,
    first_seen TEXT NOT NULL,
    last_seen TEXT,
    session_count INTEGER DEFAULT 0,
    total_pageviews INTEGER DEFAULT 0
);
```

### Optymalizacje

- **WAL mode** - Współbieżność odczytu/zapisu
- **Złożone indeksy** - Dla typowych zapytań
- **Cache w pamięci** - 10MB cache SQLite
- **Synchronous NORMAL** - Balans wydajność/bezpieczeństwo

### Podgląd danych

```bash
sqlite3 tracker.db

# Tabele
.tables

# Schemat
.schema events

# Ostatnie eventy
SELECT event_type, timestamp, path
FROM events
ORDER BY timestamp DESC
LIMIT 10;

# Statystyki
SELECT event_type, COUNT(*) as count
FROM events
GROUP BY event_type
ORDER BY count DESC;
```

---

## 🚀 Deploy

### Vercel

```bash
npm run build
vercel deploy
```

> ⚠️ **Uwaga**: SQLite może nie działać na Vercel (serverless). Alternatywy:
>
> - **Turso** (SQLite edge)
> - **Vercel Postgres**
> - **PlanetScale** (MySQL)

### Docker

```dockerfile
FROM node:20-alpine

# Wymagane dla better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

# Zmienne środowiskowe
ENV NODE_ENV=production
ENV JWT_SECRET=your_secret_here
ENV DASHBOARD_PASSWORD_HASH=your_hash

# Volume dla bazy danych
VOLUME ["/app/data"]
ENV TRACKER_DB=/app/data/tracker.db

EXPOSE 3000
CMD ["npm", "start"]
```

```bash
# Build
docker build -t activity-tracker .

# Run
docker run -d \
  -p 3000:3000 \
  -v tracker-data:/app/data \
  -e JWT_SECRET=super_secret \
  -e DASHBOARD_PASSWORD_HASH='$2a$12$...' \
  -e ALLOWED_ORIGINS=https://mysite.com \
  activity-tracker
```

### Docker Compose

```yaml
version: '3.8'
services:
  tracker:
    build: .
    ports:
      - '3000:3000'
    volumes:
      - tracker-data:/app/data
    environment:
      - NODE_ENV=production
      - JWT_SECRET=${JWT_SECRET}
      - DASHBOARD_PASSWORD_HASH=${DASHBOARD_PASSWORD_HASH}
      - ALLOWED_ORIGINS=${ALLOWED_ORIGINS}
    restart: unless-stopped

volumes:
  tracker-data:
```

---

## 🔧 Troubleshooting

### Dashboard jest pusty

1. Otwórz stronę demo: `http://localhost:3000/demo.html`
2. Klikaj przyciski, scrolluj, wypełniaj formularz
3. Odśwież dashboard

### Port 3000 zajęty

Next.js automatycznie znajdzie wolny port (3001, 3002...). Sprawdź terminal.

```bash
# Lub zabij proces na porcie 3000
lsof -ti:3000 | xargs kill -9
```

### Błędy przy instalacji (better-sqlite3)

```bash
# Wyczyść i zainstaluj ponownie
rm -rf node_modules package-lock.json
npm install

# Na macOS może być potrzebne
xcode-select --install
```

### Tracker nie wysyła eventów

1. Otwórz DevTools → Console (sprawdź błędy)
2. Włącz debug: `data-debug="true"` w tagu script
3. Otwórz DevTools → Network → sprawdź requesty do `/api/collect`
4. Sprawdź CORS (czy domena jest w `ALLOWED_ORIGINS`)

### Problemy z pamięcią (duża baza)

```bash
# Sprawdź rozmiar bazy
du -h tracker.db

# Vacuum (odzyskaj miejsce)
sqlite3 tracker.db "VACUUM;"

# Usuń stare eventy (starsze niż 30 dni)
sqlite3 tracker.db "DELETE FROM events WHERE timestamp < datetime('now', '-30 days');"
sqlite3 tracker.db "VACUUM;"
```

---

## 📁 Struktura projektu

```
user-activity-tracker-app/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login/route.ts        # POST - logowanie (JWT)
│   │   │   └── logout/route.ts       # POST - wylogowanie
│   │   ├── collect/route.ts          # POST - zbieranie eventów
│   │   ├── stats/
│   │   │   ├── overview/route.ts     # GET - statystyki ogólne
│   │   │   ├── realtime/route.ts     # GET - aktywność live
│   │   │   ├── events/route.ts       # GET - breakdown eventów
│   │   │   └── timeline/route.ts     # GET - timeline
│   │   ├── sessions/
│   │   │   ├── route.ts              # GET - lista sesji
│   │   │   └── [sessionId]/
│   │   │       ├── route.ts          # GET - szczegóły sesji
│   │   │       └── events/route.ts   # GET - eventy sesji
│   │   └── clicks/
│   │       └── heatmap/route.ts      # GET - dane heatmapy
│   ├── dashboard/
│   │   └── page.tsx                  # Dashboard UI (React)
│   ├── demo/
│   │   └── page.tsx                  # Strona demo (React)
│   ├── login/
│   │   └── page.tsx                  # Strona logowania
│   ├── layout.tsx                    # Root layout
│   ├── page.tsx                      # Redirect do dashboard
│   └── globals.css                   # Style globalne (Tailwind)
├── components/
│   └── ui/                           # Komponenty shadcn/ui
├── lib/
│   ├── auth.ts                       # JWT, bcrypt, tokeny API
│   ├── db.ts                         # Połączenie SQLite
│   ├── geo-cache.ts                  # Cache GeoIP
│   ├── rate-limit.ts                 # Rate limiting in-memory
│   ├── types.ts                      # Typy TypeScript
│   ├── utils.ts                      # Utility functions
│   └── validation.ts                 # Schematy Zod
├── public/
│   ├── tracker.js                    # Skrypt trackera (klient)
│   └── demo.html                     # Statyczna strona demo
├── proxy.ts                          # CORS + auth proxy
├── tracker.db                        # Baza SQLite (auto-generated)
├── package.json
├── tsconfig.json
└── next.config.ts
```

---

## 📚 Stack technologiczny

| Technologia  | Wersja | Opis                             |
| ------------ | ------ | -------------------------------- |
| Next.js      | 16.x   | Framework React (App Router)     |
| React        | 19.x   | UI Library                       |
| TypeScript   | 5.x    | Typy statyczne                   |
| SQLite       | -      | Baza danych (via better-sqlite3) |
| Tailwind CSS | 4.x    | Styling                          |
| Recharts     | 3.x    | Wykresy                          |
| Zod          | 4.x    | Walidacja schematów              |
| bcryptjs     | 3.x    | Hashowanie haseł                 |
| jsonwebtoken | 9.x    | Tokeny JWT                       |
| shadcn/ui    | -      | Komponenty UI                    |

---

## 📝 Changelog

### v2.1.0

- ✅ JWT authentication (zamiast statycznego cookie)
- ✅ Rate limiting na wszystkich endpointach
- ✅ Walidacja danych wejściowych (Zod)
- ✅ Konfigurowalny CORS
- ✅ Token API dla stron
- ✅ Cache GeoIP z HTTPS
- ✅ Indeksy złożone dla wydajności
- ✅ Tryb debug w tracker.js
- ✅ Obsługa błędów w UI
- ✅ Wykrywanie dynamicznych UI (shadcn/radix)
- ✅ Keylogging (bez haseł!)
- ✅ Rage clicks detection

---

## 📄 Licencja

MIT - Rób co chcesz, ale nie ma gwarancji.

---

## 🤝 Wsparcie

Masz pytania? Znalazłeś bug?

1. Sprawdź sekcję [Troubleshooting](#-troubleshooting)
2. Otwórz Issue na GitHub
3. Opisz problem z logami i krokami reprodukcji
