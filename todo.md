# TODO - User Activity Tracker

## 🔐 Bezpieczeństwo danych wrażliwych

### Do zrobienia w przyszłości:

- [ ] **Zabezpieczenie haseł i danych wrażliwych w bazie danych**
  - Obecnie hasła są zbierane w postaci jawnej (plaintext)
  - Należy dodać szyfrowanie przed zapisem do bazy (np. AES-256)
  - Lub haszowanie dla danych, które nie muszą być odczytywane (np. bcrypt/argon2)
  
- [ ] **Szyfrowanie pól wrażliwych w `tracker.js`**
  - Pola typu: password, haslo, card, karta, cvv, pin, pesel, credit
  - Rozważyć szyfrowanie po stronie klienta przed wysłaniem
  - Klucz szyfrowania przechowywany bezpiecznie po stronie serwera

- [ ] **Kontrola dostępu do danych wrażliwych**
  - Dodatkowa autoryzacja do podglądu haseł
  - Logowanie kto i kiedy przeglądał dane wrażliwe
  - Możliwość automatycznego usuwania starych haseł

- [ ] **Maskowanie w UI z opcją odkrycia**
  - Hasła domyślnie ukryte (••••••••)
  - Odkrycie wymaga potwierdzenia/PIN-u
  - Czas automatycznego ukrycia po X sekundach

---

*Ostatnia aktualizacja: 2024-12-20*

