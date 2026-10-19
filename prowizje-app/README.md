# Rejestr prowizji

Aplikacja webowa do prowadzenia rejestru prowizji pracowników hotelu. Każdy pracownik loguje się na swoje konto
i widzi tylko swoje wpisy oraz swoje podsumowanie. Administrator zatwierdza lub anuluje wpisy, wprowadza prowizję
za parking i widzi zestawienie wszystkich pracowników z eksportem do Excela.

## Uruchomienie

Wymagany **Node.js 22.5 lub nowszy** (baza SQLite jest wbudowana w Node – nic więcej nie trzeba instalować).

```
cd prowizje-app
npm install
npm start
```

Na Windows wystarczy dwuklik na `start.bat`. Aplikacja działa pod adresem `http://localhost:3000`
(pozostali pracownicy w sieci lokalnej: `http://<adres-IP-komputera>:3000`).

Przy pierwszym uruchomieniu tworzone jest konto **admin / admin** – zmień hasło w zakładce „Moje konto”
(albo ustaw zmienną `ADMIN_PASSWORD` przed pierwszym startem). Dane zapisują się w `data/prowizje.db` –
ten plik warto regularnie kopiować (kopia zapasowa).

Zmienne środowiskowe: `PORT` (domyślnie 3000), `HOST` (domyślnie 0.0.0.0), `DB_FILE`, `ADMIN_PASSWORD`.

## Tabele prowizji

| Tabela | Stawka domyślna | Podstawa |
|---|---|---|
| Rezerwacje | 1% | łączna wartość rezerwacji |
| Śniadania | 5% | wartość rachunku |
| Obiadokolacje | 5% | wartość rachunku |
| Upsell | 5% | wartość sprzedaży |
| Parking | kwota wpisana przez administratora | dzielona równo |

Prowizja liczona jest od kwoty **netto** (po odjęciu VAT 8%). Domyślnie `netto = brutto / 1,08`
(kwoty w raportach zawierają VAT). W Ustawieniach można przełączyć na `netto = brutto × 0,92`
i zmienić stawki – zmiana dotyczy nowych wpisów (każdy wpis zapamiętuje stawkę z chwili dodania).

Do podsumowania wliczane są tylko wpisy **zatwierdzone** przez administratora; oczekujące pokazywane są osobno.

## Import z Excela

**Rezerwacje** (raport „Lista rezerwacji”): A = nr rezerwacji, F = imię i nazwisko gościa, I/J = przyjazd/wyjazd.
Wartość rezerwacji i nr rachunku wpisuje się ręcznie w podglądzie importu.

**Śniadania / obiadokolacje** (raport „Księgowania wg kodów”): J = nazwisko lub apartament prywatny,
N = pobyt, S = nr rachunku (gdy brak – można wpisać ręcznie w podglądzie), Y = wartość.
Wiersze „*Korekta*”, „Razem”, „Ogółem” są pomijane. Miesiąc i rodzaj raportu są rozpoznawane z nagłówka pliku.

**Upsell** – import w tym samym układzie kolumn co śniadania (lub wpisy ręczne).

Ponowny import tego samego pliku nie dubluje wpisów (wiersze oznaczone „JUŻ ZAIMPORTOWANO”).
Administrator może importować / dodawać wpisy w imieniu wybranego pracownika.

## Oznaczenia

- **POWIELONA** – rezerwacja o tym samym numerze występuje już w innym miesiącu (lub u innego pracownika).
  Oznaczany jest każdy wpis poza pierwszym.
- **ANULACJA** – rachunek z wartością ujemną. Oznaczane są wszystkie wpisy z tym samym nr rachunku w danej tabeli,
  także dodatni wpis u innego pracownika (osoba X anuluje rachunek osoby Y). Administrator decyduje,
  które wpisy zatwierdzić, a które anulować.

## Parking

Administrator w zakładce „Podsumowanie” wpisuje kwotę prowizji za parking dla miesiąca. Kwota dzielona jest równo
na wszystkich aktywnych pracowników z zaznaczonym „Udział w parkingu” (zakładka Pracownicy) – niezależnie od tego,
czy mają w danym miesiącu inne prowizje. Administrator domyślnie też uczestniczy w podziale; można to wyłączyć.

## Testy

```
npm test
```
