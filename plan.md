# PewnySzlak — aplikacja mobilna dla całego Krakowa

## 1. Ustalony zakres

Kompletne MVP na podstawie [PRD](/home/ubuntter/Projects/PewnySzlak/prd.md) oraz wymagań konkursowych ([krakow.pdf](/home/ubuntter/Projects/PewnySzlak/krakow.pdf)).

- Aplikacja React Native na Androida i iOS, wspólna wersja web, backend, baza danych i rzeczywisty routing obejmujący cały Kraków.
- Pierwszy profil potrzeb: osoba poruszająca się na wózku; konfiguracja przez preferencje barier, bez konta i informacji o zdrowiu.
- Jasny, spokojny interfejs: ciepła biel, ciemna zieleń, duże przyciski i czytelne karty.
- Prowadzenie GPS podczas korzystania z otwartej aplikacji.
- Uruchomienie bez płatnych kluczy; dodatkowy tryb rozmowy AI po konfiguracji.
- Dostarczone będą instrukcje, testy i scenariusz demonstracji. Prezentacja konkursowa, film i publikacja w sklepach pozostają poza zakresem.

## 2. Architektura i technologie

- **Frontend:** TypeScript, Expo SDK 57, React Native 0.86, Expo Router, TanStack Query oraz lokalne przechowywanie preferencji. Zależności natywne dobierane przez `expo install`, wersje utrwalone w lockfile. [Zgodność Expo](https://docs.expo.dev/versions/latest/)
- **Software Mansion:** Reanimated do animacji kart i paneli, Gesture Handler do gestów, React Native Screens w nawigacji. Wszystkie gesty otrzymają odpowiedniki przyciskowe, a animacje będą respektować ograniczenie ruchu.
- **Mapa:** MapLibre Native na telefonach i MapLibre GL JS na webie, ze wspólnymi danymi GeoJSON. Własne development builds; biblioteka natywna wymaga przebudowania aplikacji. [Dokumentacja MapLibre](https://maplibre.org/maplibre-react-native/docs/setup/getting-started/)
- **Backend:** Node.js 24, Fastify, PostgreSQL/PostGIS; osobny proces synchronizacji danych oraz importer OSM w Pythonie z pyosmium. Uruchomienie usług przez Docker Compose.
- **Kontrakty:** wspólne typy TypeScript i walidacja Zod dla preferencji, miejsc, obserwacji dostępności, barier, odcinków trasy i odpowiedzi asystenta.
- **API `/v1`:** wyszukiwanie miejsc i placówek, obliczanie tras, pobieranie barier, dodawanie zgłoszeń i potwierdzeń, wiadomości asystenta oraz stan źródeł. Wynik trasy zawiera geometrię, instrukcje, bariery, braki danych i źródła — mapa oraz widok tekstowy korzystają z tego samego wyniku.

## 3. Funkcje aplikacji

- **Preferencje:** unikanie schodów i trudnych nawierzchni, maksymalne nachylenie i wysokość krawężnika, minimalna szerokość oraz wybór postępowania z brakującymi danymi. Początkowy, edytowalny preset: 6%, 2 cm i 90 cm; nieznane parametry pozostają wyraźnie oznaczone.
- **Planowanie:** start z GPS, wyszukiwarki lub mapy; analogiczny wybór celu, zamiana punktów i przeliczenie po zmianie preferencji.
- **Wynik:** przebieg, dystans, orientacyjny czas, lista przeszkód i zakres brakujących informacji. Odcinki niepewne wyróżnione także wzorem linii i etykietą.
- **Szczegóły:** nawierzchnia, schody, krawężniki, szerokość, nachylenie i dostępne informacje o udogodnieniach. Każda obserwacja ma źródło, daty oraz status wiarygodności.
- **Widok tekstowy:** kompletna uporządkowana trasa, instrukcje, bariery i szczegóły miejsc, dostępne bez interakcji z mapą.
- **Prowadzenie GPS:** bieżąca pozycja, kolejny krok, postęp i propozycja przeliczenia po zejściu z trasy. Odmowa uprawnień pozostawia ręczne planowanie; utrata internetu zachowuje ostatni wynik.
- **Społeczność:** zgłoszenie bariery, potwierdzenie, zakwestionowanie i zgłoszenie usunięcia przeszkody. Dane zapisują się w backendzie. Anonimowe potwierdzenia nie stają się automatycznie formalną weryfikacją.
- **Dostępność:** etykiety czytników, skalowanie tekstu, odpowiedni kontrast, widoczny fokus, obsługa klawiaturą i prawidłowe zarządzanie fokusem paneli.

## 4. Routing, źródła i AI

- **Pełny graf miasta:** import regionalnego PBF z [Geofabrik](https://download.geofabrik.de/europe/poland/malopolskie.html), wycięcie Krakowa z buforem 2 km oraz zachowanie identyfikatorów, tagów i dat OSM. Wyszukiwanie adresów i miejsc wykorzystuje lokalny indeks.
- **Silnik A\*:** obliczenia w backendzie, uwzględniające bariery zarówno na drogach, jak i w węzłach. Połączenia wynikają z topologii OSM; przecięcie ulic na mapie nie tworzy połączenia między poziomami.
- **Reguły:** znane bariery naruszające preferencje wykluczają odcinek; brak danych zwiększa koszt albo wyklucza odcinek zgodnie z ustawieniem użytkownika. Brak dopuszczalnej trasy zwraca wyjaśnienie. Niezmapowane dojście do wejścia pozostaje oznaczone jako niezweryfikowane.
- **Aktualizacje:** wersjonowane importy OSM raz w tygodniu; MCP i dane NFZ codziennie. Nieudany import zachowuje poprzednią wersję. Zmiany barier działają jako oddzielna warstwa bez przebudowy grafu.
- **MCP z-dykty:** integracja `https://z-dykty.pl/api/mcp`, paginacja, deduplikacja i przechowywanie dowodów. Przetarg tworzy sygnał możliwego utrudnienia; blokowanie wymaga potwierdzonej lokalizacji i aktualności przeszkody. [Dokumentacja źródła](https://z-dykty.pl/dla-programistow)
- **Placówki NFZ:** adresy i deklarowane udogodnienia z [API NFZ ITL](https://apinfz.nfz.gov.pl/app-itl-api-pcus/index.html), wyszukiwanie według świadczenia; demonstracja na poradniach rehabilitacyjnych. Współrzędne podlegają kontroli granic i adresu. PSOZ przez poprawny endpoint `https://psoz.pl/api/mcp` dostarcza dodatkowych informacji dla dopasowanych placówek.
- **Wiarygodność:** oddzielić potwierdzenie informacji od jej aktualności. Zachować sprzeczne obserwacje; data edycji OSM lub aktualizacji kolejki NFZ nie jest datą sprawdzenia wejścia.
- **Asystent:** bez klucza dostępne działania i odpowiedzi szablonowe oparte na rzeczywistych danych. Po ustawieniu `OPENAI_API_KEY` i `OPENAI_MODEL` — rozmowa przez Responses API z walidowanymi wywołaniami narzędzi. Model proponuje cel i objaśnia dane; backend wyznacza trasę i kontroluje statusy. [Function calling](https://developers.openai.com/api/docs/guides/function-calling)
- **Tryb demonstracyjny:** oddzielny, jawnie oznaczony zestaw danych pokazujący remont, objazd, konflikt i awarię źródła. Nie zastępuje automatycznie danych rzeczywistych.
- **Prywatność i utrzymanie:** klucze wyłącznie na serwerze, brak utrwalania śladu GPS, ograniczenia zgłoszeń i wywołań AI, narzędzie operatora do korekt, kopie bazy oraz rejestr licencji. Podkład mapowy konfigurowalny, z atrybucją i bez masowego pobierania kafelków publicznych.

## 5. Kolejność realizacji i odbiór

1. Przygotować strukturę projektu, kontrakty, bazę, Compose i importer; uruchomić routing na pełnym grafie Krakowa.
2. Zbudować interfejs, preferencje, mapę, widok tekstowy i prowadzenie GPS.
3. Dodać zgłoszenia, synchronizację MCP/NFZ, asystenta oraz izolowany scenariusz demonstracyjny.
4. Zweryfikować:
   - omijanie schodów, krawężników i aktywnej blokady;
   - zmianę przebiegu po zmianie preferencji lub bariery;
   - brak fikcyjnych połączeń przez wiadukty i przerwy grafu;
   - niepełne, sprzeczne i nieaktualne dane oraz niedostępność źródeł;
   - trwałość zgłoszeń i brak fałszywego potwierdzania dostępności przez AI;
   - cały scenariusz klawiaturą przez Playwright, kontrolę axe oraz testy TalkBack/VoiceOver;
   - odmowę GPS, utratę sieci, duży tekst i ograniczone animacje.
5. Wykonać eksport web, kompilację Androida, testy tras między dzielnicami i benchmark pełnego grafu. Test iOS wymaga macOS lub EAS; raport odbioru wskaże rzeczywiście wykonane kontrole.
6. Dostarczyć README z uruchomieniem, konfiguracją kluczy, aktualizacją danych, scenariuszem demo, ograniczeniami dostępności i opisem utrzymania poza infrastrukturą miasta.

**Kryterium ukończenia:** działający przepływ od wyboru preferencji do rzeczywistej trasy, szczegółów źródeł, prowadzenia GPS i zgłoszenia bariery. Pełne pokrycie Krakowa oznacza import dostępnej sieci OSM; braki wiedzy o dostępności pozostają widoczne.
