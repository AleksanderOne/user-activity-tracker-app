# 🚀 Instrukcja Integracji Trackera Aktywności

Ten dokument opisuje, jak w **bardzo prosty sposób** podłączyć system śledzenia (Activity Tracker) do dowolnej strony internetowej.

## 📋 Szybki Start (Kopiuj-Wklej)

Aby zacząć zbierać dane, wystarczy, że wkleisz poniższy kod w sekcji `<head>` lub na końcu sekcji `<body>` każdej podstrony, którą chcesz śledzić.

```html
<script
  src="https://twoja-domena-trackera.pl/tracker.js"
  data-site-id="twoja-nazwa-strony"
  data-endpoint="https://twoja-domena-trackera.pl/api"
  async
></script>
```

### Co musisz zmienić?

1.  **`src`**: Podaj adres URL, gdzie hostujesz plik `tracker.js`.
2.  **`data-site-id`**: Unikalna nazwa dla strony, którą śledzisz (np. `sklep-internetowy`, `blog-osobisty`). Dzięki temu w dashboardzie będziesz mógł filtrować dane.
3.  **`data-endpoint`**: Adres API twojego trackera (zwykle domena trackera + `/api`). Jeśli tracker i strona są na tej samej domenie, ten parametr jest opcjonalny.

---

## ⚙️ Zaawansowana Konfiguracja

Tracker działa automatycznie zaraz po załadowaniu, ale możesz dostosować niektóre opcje.

### Automatyczne wykrywanie

Jeśli nie podasz parametrów, tracker spróbuje zgadnąć ustawienia:

- **`siteId`**: Zostanie użyta nazwa domeny (np. `google.com`).
- **`endpoint`**: Zostanie użyty relatywny adres `/api` (zakłada, że tracker działa na tej samej domenie co strona).

### Atrybuty `data-`

| Atrybut         | Opis                                 | Wymagany | Domyślnie     |
| :-------------- | :----------------------------------- | :------: | :------------ |
| `data-site-id`  | Identyfikator witryny w dashboardzie |   NIE    | Domena strony |
| `data-endpoint` | Adres API do wysyłania danych        |   NIE    | `/api`        |

---

### Co jest śledzone automatycznie?

Po wklejeniu powyższego kodu, tracker automatycznie zacznie zbierać:

1.  **Odsłony stron (Pageviews)**: Z pełnym adresem URL, tytułem strony i domeną.
2.  **Urządzenie i Sieć**:
    - Typ urządzenia (Mobile/Desktop), System operacyjny, Przeglądarka.
    - Rozdzielczość ekranu, Język.
    - **Lokalizacja**: Kraj, Miasto (GeoIP).
    - **Sieć**: Dostawca internetu (ISP), IP.
3.  **Interakcje**:
    - **Kliknięcia**: Wszystkie kliknięcia w przyciski i linki.
    - **Formularze**: Czas wypełniania, wysłanie formularza.
    - **Wpisywanie tekstu (Keylogging)**: Śledzenie wpisywania w pola tekstowe (z pominięciem pól hasła).
    - **Schowek**: Kopiowanie, Wklejanie, Wycinanie (wraz z fragmentem treści).
    - **Rage Clicks**: Wykrywanie frustracji (wściekłe klikanie).
    - **Przewijanie**: Głębokość scrollowania strony.

> 🔒 **Prywatność**: Pola typu `password` oraz te zawierające w nazwie "password" są automatycznie ignorowane przez tracker wpisywania tekstu. Mimo to, zachowaj ostrożność przy zbieraniu danych osobowych.

- **Źródła ruchu** (Referrers)
- **Kampanie marketingowe** (Parametry UTM: source, medium, campaign)
- **Błędy JavaScript** (abyś wiedział, gdy coś się psuje u użytkownika)

---

## 🎯 Śledzenie niestandardowych elementów (Opcjonalne)

Jeśli chcesz śledzić konkretne elementy (np. czy użytkownik zobaczył reklamę, albo kliknął w specyficzny baner), możesz dodać specjalne atrybuty do swojego kodu HTML.

### 1. Śledzenie widoczności elementu

Dodaj atrybut `data-track-view`, aby dowiedzieć się, kiedy użytkownik przewinął stronę do tego elementu.

```html
<div id="oferta-specjalna" data-track-view="sekcja-promocji">
  <!-- Treść promocji -->
</div>
```

### 2. Śledzenie kliknięć z własną nazwą

Możesz nadać czytelną nazwę dla kliknięć w dashboardzie.

```html
<button data-track="przycisk-kup-teraz">Kup Teraz</button>
```

---

## 🛠️ Panel Administratora

Dostęp do statystyk znajduje się pod adresem:
**`/dashboard`**

Domyślne dane logowania (zmień je w pliku `.env`!):

- **Hasło**: `admin123`

---

## 🔒 Prywatność i RODO

Tracker został zaprojektowany z myślą o prywatności:

- Nie używa plików cookie śledzących użytkownika po innych stronach (3rd party cookies).
- Możesz skonfigurować haszowanie adresów IP.
- Dane są przechowywane na Twoim serwerze, a nie sprzedawane firmom trzecim.

---

_Wygenerowano dla Activity Tracker v2.0_
