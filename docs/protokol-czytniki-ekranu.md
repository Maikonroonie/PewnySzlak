# Protokół testów z czytnikiem ekranu (TalkBack / VoiceOver)

Testy ręczne – nie da się ich w pełni zautomatyzować. Każdy punkt ma oczekiwany rezultat; wynik wpisuje się w kolumnie „Wynik” (OK / BŁĄD + opis). Czas: ok. 40 min na platformę.

Automatycznie sprawdzone wcześniej (Playwright + axe, web): brak naruszeń WCAG 2.1 A/AA o wadze *serious/critical* na każdym ekranie, pełny przepływ wyłącznie klawiaturą, duży tekst 200 %, `prefers-reduced-motion`, odmowa lokalizacji, tryb offline. Patrz `e2e/`.

## Przygotowanie

- Android: Ustawienia → Dostępność → TalkBack = wł.; rozmiar czcionki = największy; „Usuń animacje” = wł.
- iOS: Ustawienia → Dostępność → VoiceOver = wł.; Ekran i wielkość tekstu → Większy tekst = maks.; Ruch → Ogranicz ruch = wł.
- API uruchomione (`docker compose up`), aplikacja w trybie **Demo** (Preferencje → Dane → Demo), lokalizacja: raz z odmową, raz z zgodą.

## Scenariusze

| # | Ekran / krok | Oczekiwany rezultat | Wynik |
|---|---|---|---|
| 1 | Start aplikacji | Fokus trafia na nagłówek „Poznaj Kraków według komfortu”; czytnik odczytuje nagłówek poziomu 1, tryb aktywności i odznakę trybu danych. | |
| 2 | Pole „Start (początek odkrywania)” | Odczytane jako pole edycji z etykietą i podpowiedzią. Po wpisaniu „Rynek” czytnik ogłasza liczbę wyników („N wyników…”). | |
| 2a | „Odkryj okolice” (CTA / TabBar) | Przycisk / zakładka „Odkryj”; bez startu – komunikat o braku punktu. Z startem – H1 „Odkryj okolice”, live region przy ładowaniu. | |
| 2b | Karta miejsca w Odkryj | Nazwa, kategoria, status w 1–2 liniach, siatka 8 cech (każda komórka z etykietą „Schody: tak/nie/brak danych”), badge „Sprawdzone w terenie” gdy dotyczy. Przyciski „Trasa” i „Zgłoś”. | |
| 2c | Klik odcinka na mapie komfortu | Ogłoszenie statusu + 2 zdania (pasuje / niepewne / wykluczone). Szczegóły odcinka dostępne przyciskiem (mapa pomijana). | |
| 3 | Lista wyników wyszukiwania | Każdy wynik to przycisk; nazwa zawiera adres, typ (placówka NFZ) i ostrzeżenie „dojście do wejścia niezweryfikowane”, gdy dotyczy. Aktywacja ogłasza „Początek trasy: …”. | |
| 4 | Przycisk „Moja lokalizacja” przy **odmowie** uprawnień | Komunikat roli *alert* o braku zgody i alternatywach (adres, mapa); pole adresu nadal dostępne. | |
| 5 | Przycisk „Moja lokalizacja” przy zgodzie | Ogłoszenie „Początek trasy: Moja lokalizacja (…)”; brak kolejnych pytań systemowych. | |
| 6 | „Zmień preferencje trasy” | Nowy ekran, fokus na H1 „Moje preferencje”. Przełączniki mają rolę *switch* ze stanem (wł./wył.); grupy wyboru mają rolę *radio* ze stanem „wybrane”. Zmiana wartości ogłasza nową wartość. | |
| 7 | „Wyznacz trasę” | Ogłoszenie „Wyznaczam trasę…”, następnie podsumowanie („Trasa 1,6 km, 20 odcinków, omija 1 barier”). Fokus na nagłówku z dystansem i czasem. | |
| 8 | Ekran trasy – mapa | Mapa odczytana jako jeden element z opisem (dystans, liczba odcinków, informacja, że lista jest pod mapą). Czytnik **nie** wchodzi do elementów mapy (kafelki, kanwa). | |
| 9 | Lista odcinków | Rola lista / element listy. Każdy odcinek odczytany w całości: numer, rodzaj, nazwa, długość, „odcinek niepewny”, nawierzchnia/krawężnik/szerokość, „brak danych: …”, bariery. | |
| 10 | Szczegóły odcinka | Fokus na H1; tabela cech czytana parami „Nawierzchnia: kostka kamienna”, „Nachylenie: brak danych”. Sekcja „Skąd to wiemy” zawiera status (np. „Zmapowane w OSM (niesprawdzone w terenie)”), daty **oddzielnie**: „Zmiana w źródle”, „pobrano”, „Sprawdzono w terenie: nie”. Link „Zobacz w źródle” ma rolę link. | |
| 11 | „Widok tekstowy” | Pełna alternatywa: kroki jako lista („Krok 1: …, następnie 87 m”), odcinki z pełnymi zdaniami, bariery omijane. Da się przejść całość bez mapy. | |
| 12 | „Prowadź mnie” bez lokalizacji | Komunikat *alert* „Brak lokalizacji…”; przyciski „Poprzedni krok” / „Następny krok” dostępne; każda zmiana kroku ogłasza instrukcję (region live *assertive*). | |
| 13 | „Prowadź mnie” z lokalizacją (spacer ≥ 100 m lub „Symuluj przejście trasy”) | Automatyczne ogłoszenia: nowa instrukcja po przejściu punktu; „Za N metrów: …” przed zakrętem; „Zeszliśmy z trasy…” po ≥ 35 m poza trasą i 3 odczytach, następnie „Przeliczono trasę…”; „Jesteś u celu” < 15 m od celu. Przy włączonym czytniku na urządzeniu mobilnym mapa jest ukryta, a lista kolejnych kroków widoczna. | |
| 14 | „Zgłoś” / szybkie zgłoszenie | Tryb szybki: wybór rodzaju (przyciski) + Wyślij bez obowiązkowego tytułu. Pełny formularz za „Więcej szczegółów”. Po wysłaniu ogłoszenie i ekran bariery. | |
| 15 | Ekran bariery | Odznaki: stan, typ, „Sporne” / „Może być nieaktualne” / „DEMO”. Liczniki potwierdzeń. | |
| 16 | Asystent | Skróty: „Co w okolicy dla wózka?”, „Toaleta blisko”, „Czy omija remont?”. Akcja „Odkryj okolice”. Odpowiedź z zastrzeżeniem i źródłami; nigdy „jest dostępne” bez źródła. | |
| 17 | Źródła danych | Każde źródło: nazwa, stan słowny, rekordów, daty, licencja. W demo: karta awarii PSOZ + jedno źródło „Niedostępne…”. | |
| 18 | Duży tekst (maks. systemowy) | Wszystkie przyciski i etykiety widoczne, zawijane; brak ucięć; cele dotykowe ≥ 48 dp. | |
| 19 | Ograniczony ruch | Przejścia między ekranami bez animacji; kamera mapy skacze zamiast płynąć. | |
| 20 | Tryb samolotowy po wyznaczeniu trasy | Ekran główny: Notice „Serwer niedostępny – tryb offline”, karta „Zapisana trasa”; Odkryj może pokazać cache z godziną. | |
| 21 | Scenariusze demo (home) | Przy włączonym Demo: karta z linkami do spornej bariery, nieaktualnego zgłoszenia i źródeł (awaria). | |

## Znane ograniczenia

- Mapa (MapLibre) nie jest obsługiwana czytnikiem – to świadoma decyzja; każda funkcja ma odpowiednik tekstowy.
- Na web wykrywanie czytnika ekranu nie jest możliwe – mapa pozostaje widoczna, a lista kroków jest zawsze pod nią.
- Ogłoszenia głosowe w prowadzeniu zależą od czytnika ekranu (brak własnego TTS) – bez czytnika komunikaty są wyłącznie wizualne.
- iOS/VoiceOver: brak możliwości wykonania na Linuksie w tym repozytorium – protokół do wykonania na macOS/urządzeniu.
