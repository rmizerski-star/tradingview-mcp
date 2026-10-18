# Rejestr prowizji

Aplikacja w przeglądarce do prowadzenia prowizji pracowników hotelu: rezerwacje, śniadania (kod 505), obiadokolacje (kod 518), upsell i parking. Działa w sieci lokalnej: serwer stoi na jednym komputerze, a każdy pracownik otwiera ją w przeglądarce na swoim komputerze i loguje się własnym loginem i hasłem.

## Uruchomienie (Windows)

1. Zainstaluj **Node.js LTS** ze strony https://nodejs.org (wersja 20 lub nowsza).
2. Skopiuj folder `prowizje` na komputer, który będzie serwerem. Ten komputer musi być włączony, gdy pracownicy korzystają z aplikacji.
3. Kliknij dwukrotnie `start.bat`. Przy pierwszym uruchomieniu zainstalują się biblioteki (potrzebny internet).
4. W oknie pojawią się adresy, np.:
   ```
   Na tym komputerze:  http://localhost:3000
   W sieci lokalnej:   http://192.168.1.20:3000
   ```
5. Otwórz adres w przeglądarce i utwórz konto administratora.
6. W zakładce **Użytkownicy** załóż konta pracownikom (imię i nazwisko, login, hasło startowe).
7. Pracownicy wpisują adres **„W sieci lokalnej”** w przeglądarce na swoich komputerach i logują się. Hasło zmieniają w zakładce **Konto**.

Przy pierwszym uruchomieniu Windows może zapytać o dostęp przez zaporę. Zaznacz **sieci prywatne** i kliknij **Zezwól**. Bez tego inne komputery nie połączą się z serwerem.

Żeby adres się nie zmieniał, ustaw w routerze stały adres IP (rezerwację DHCP) dla komputera z serwerem.

## Uruchomienie (Linux, macOS)

```
npm install --omit=dev
npm start
```

## Ustawienia

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `PORT` | `3000` | Port serwera |
| `HOST` | `0.0.0.0` | Adres nasłuchu (`0.0.0.0` = cała sieć lokalna, `127.0.0.1` = tylko ten komputer) |
| `DATA_DIR` | `./data` | Folder z bazą danych |
| `COOKIE_SECURE` | — | Ustaw `1`, gdy aplikacja działa za HTTPS (np. reverse proxy) |

## Dane i kopie zapasowe

Wszystko jest w pliku `data/db.json`. Codziennie przy pierwszym zapisie aplikacja kopiuje go do `data/kopie/db-RRRR-MM-DD.json`. Dla bezpieczeństwa kopiuj też folder `data` na inny dysk.

Aby przenieść aplikację na inny komputer, skopiuj cały folder razem z `data`.

## Zasady naliczania

- Rezerwacje: 1% wartości, minus 8% VAT.
- Śniadania, obiadokolacje, upsell: 5% wartości, minus 8% VAT.
- Do wypłaty liczą się tylko pozycje zatwierdzone przez administratora.
- Parking: administrator wpisuje kwotę na miesiąc, dzielona jest po równo na zaznaczone osoby.

Stawki, VAT i sposób liczenia VAT (odjęcie od prowizji albo wydzielenie z kwoty brutto) zmienia administrator w zakładce **Ustawienia**.

## Import z Excela (.xlsx)

- **Lista rezerwacji**: A nr rezerwacji, F gość, I–J daty pobytu. Kwotę i nr rachunku można wpisać od razu albo później, po wystawieniu rachunku. Rezerwacja z numerem, który był już we wcześniejszym miesiącu, jest oznaczona jako **powielona**.
- **Śniadania / obiadokolacje**: J nazwisko lub apartament, N pobyt, S nr rachunku (pusty można uzupełnić), Y wartość. Wartości ujemne to anulacje. Administrator łączy je w pary z pozycją dodatnią w zakładce **Anulacje**.

## Bezpieczeństwo

- Hasła są przechowywane jako skrót scrypt z solą, nigdy jawnym tekstem.
- Po 5 nieudanych próbach logowania konto jest blokowane na 5 minut dla danego komputera.
- Pracownik widzi i edytuje tylko swoje pozycje, i tylko dopóki nie zostały rozpatrzone.
- Aplikacja jest przeznaczona do sieci lokalnej (HTTP). Nie wystawiaj portu do internetu bez HTTPS (reverse proxy z certyfikatem) i `COOKIE_SECURE=1`.

## Testy

```
npm install
npm test
```
