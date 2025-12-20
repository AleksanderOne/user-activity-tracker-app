# Jak uruchomić tracker

## 1. Uruchom aplikację

```bash
npm run dev
```

Aplikacja będzie dostępna pod `http://localhost:3000`

## 2. Zobacz dashboard

Otwórz: **http://localhost:3000/dashboard**

Początkowo będzie puste - trzeba wygenerować dane.

## 3. Zobacz stronę demo

Otwórz: **http://localhost:3000/demo.html**

Ta strona automatycznie używa trackera i wysyła eventy do API.

## 4. Interakcja ze stroną demo

Możesz:
- Klikać w przyciski (wszystkie są śledzone)
- Scrollować stronę (śledzenie głębokości: 25%, 50%, 75%, 100%)
- Wypełnić formularz (focus na polach i submit są śledzone)
- Zaznaczać tekst (selekcja jest śledzona)
- Kopiować tekst (kopiowanie jest śledzone)

## 5. Zobacz dane w dashboardzie

Po interakcji ze stroną demo odśwież dashboard:
**http://localhost:3000/dashboard**

Zobaczysz:
- ✅ Realtime stats (aktywni użytkownicy)
- ✅ Statystyki ogólne (odsłony, sesje, eventy)
- ✅ Wykresy aktywności w czasie
- ✅ Breakdown eventów (typy eventów)
- ✅ Top strony
- ✅ Ostatnie sesje

## 6. API Endpoints

Możesz też testować API bezpośrednio:

```bash
# Statystyki ogólne
curl http://localhost:3000/api/stats/overview?days=7

# Realtime
curl http://localhost:3000/api/stats/realtime

# Eventy
curl http://localhost:3000/api/stats/events?days=7

# Timeline
curl http://localhost:3000/api/stats/timeline?days=7&granularity=hour

# Sesje
curl http://localhost:3000/api/sessions?limit=10
```

## 7. Dodaj tracker do własnej strony

1. Skopiuj `/public/tracker.js`
2. Edytuj konfigurację:
```javascript
const CONFIG = {
    endpoint: 'http://localhost:3000/api',
    siteId: 'twoja-strona',
    // ...
};
```
3. Dodaj do swojej strony:
```html
<script src="/tracker.js"></script>
```

## Baza danych

Baza SQLite tworzona jest automatycznie: `tracker.db`

Możesz ją podejrzeć:
```bash
sqlite3 tracker.db
.tables
.schema events
SELECT * FROM events LIMIT 10;
```

## Troubleshooting

### Dashboard jest pusty
- Upewnij się że odwiedziłeś `/demo.html` i kliknąłeś coś
- Sprawdź console w przeglądarce czy są błędy
- Sprawdź czy tracker wysyła requesty (zakładka Network w DevTools)

### Port zajęty
Jeśli port 3000 jest zajęty, Next.js automatycznie użyje innego portu (np. 3005).
Sprawdź w terminalu jaki port został użyty.

### Błędy przy instalacji
```bash
rm -rf node_modules package-lock.json
npm install
```
