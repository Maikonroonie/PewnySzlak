# Raport odbioru – PewnySzlak

Data: 3 października 2026. Zakres: realizacja etapów 1–6 z [`plan.md`](../plan.md). Zawiera wyłącznie sprawdzenia, które zostały faktycznie wykonane; to, czego nie zrobiono, jest wymienione w sekcji „Niewykonane / ograniczenia”.

## 1. Stan danych

| Element | Wartość |
|---|---|
| Źródło grafu | Geofabrik `malopolskie-latest.osm.pbf`, wycięty do granic Krakowa + 2 km bufora |
| Wersja grafu | `osm-20261003T130058Z` |
| Rozmiar | 281 817 węzłów, 344 284 odcinków (skierowanych, z atrybutami nawierzchni, nachylenia, szerokości, krawężników, schodów, przejść) |
| Czas importu | ok. 10 min (pyosmium, jeden przebieg + zapis do PostGIS COPY) |
| Wczytanie grafu do pamięci API | ok. 8 s, RSS procesu ok. 820 MB |
| Źródła zewnętrzne | z-dykty MCP (przetargi BZP dla Krakowa, klasyfikacja „dotyczy ruchu pieszego”), NFZ ITL (poradnie rehabilitacyjne z deklaracjami udogodnień), psoz MCP; wszystkie bez kluczy; każda próba zapisana w `source_runs` |

## 2. Testy automatyczne

### 2.1 Jednostkowe (`apps/api/test/unit`, 33 testy, wszystkie zaliczone)

Routing na małych grafach syntetycznych i wycinkach:

- unikanie schodów, krawężników > limitu, nawierzchni z listy wykluczeń, odcinków węższych niż limit, nachylenia > limitu;
- polityka „brak danych”: `penalize` (kara, trasa z ostrzeżeniem) vs `exclude` (odcinek wykluczony);
- bariery zgłoszone blokujące vs tylko ostrzegające, bariery przedawnione (`validUntil`), bariery spornych i nieaktualnych;
- **wiadukt / kładka**: krawędzie krzyżujące się geometrycznie bez wspólnego węzła nie są połączone (brak fałszywych zejść z wiaduktu);
- zmiana preferencji zmienia trasę (ten sam graf, inne ograniczenia → inna geometria i inne ostrzeżenia);
- wykluczenie wszystkiego daje jawne `destination-unreachable` / `blocked-by-preferences` z listą pojedynczych złagodzeń, które odblokowują trasę („Trasa istnieje, jeśli dopuścisz: schody”);
- przyciąganie punktu startu/celu: brak cichego przeskakiwania do odległego odcinka (limit = najbliższy odcinek + 75 m);
- parsowanie tagów OSM (kerb, incline w %, °, up/down, surface, width z jednostkami, highway=steps), wyliczanie dowodów (`updatedAt` z OSM ≠ `observedAt`);
- klasyfikacja przetargów (słowa kluczowe + wykluczenia), ekstrakcja ulic z tytułów, klient MCP (JSON-RPC, błędy sieci → `ok:false`), sygnały nieaktualne po `validUntil`.

### 2.2 Integracyjne (`apps/api/test/integration`, 10 testów na żywej bazie i pełnym grafie, wszystkie zaliczone)

- `/v1/health`, `/v1/sources` (w trybie demo źródło psoz raportowane jako `unavailable` z komunikatem o pracy na ostatnich danych);
- wyszukiwanie i geokodowanie odwrotne miejsc;
- trasa Rynek Główny → Wawel: **live** prowadzi Grodzką, **demo** omija Grodzką (bariera z przetargu + weryfikacja operatora); zmiana preferencji (schody dozwolone) zmienia trasę;
- punkt poza zasięgiem → 422 z czytelnym komunikatem;
- szczegóły odcinka: tagi OSM, dowody z osobnymi datami;
- **trwałość zgłoszenia**: `POST /v1/reports` → bariera w `GET /v1/barriers` → trasa omija odcinki → 3 × „potwierdzam” nie daje statusu `verified` → 4 × „zniknęła” → stan `resolved` → trasa wraca na pierwotny przebieg;
- bariery demo (sporna, nieaktualna, potencjalna z przetargu, rozwiązana) niewidoczne w trybie live;
- asystent regułowy: odpowiedź o placówkach zawiera „deklar…” i nie zawiera „jest dostępn”;
- walidacja 400 (zły payload) i 401 (operator bez tokena).

### 2.3 End-to-end web (`e2e/`, Playwright + axe-core, 7 testów, wszystkie zaliczone)

Na statycznym eksporcie `expo export --platform web`, Chrome, 420 × 900:

1. Pełny przepływ **wyłącznie klawiaturą**: preferencje (preset wózka, tryb demo) → wyszukiwanie start/cel → trasa → odcinek i źródła → widok tekstowy → prowadzenie (tryb ręczny) → zgłoszenie bariery → ekran bariery → potwierdzenie (licznik 1, nadal „Bez formalnej weryfikacji”) → sprawdzenie w API, że zgłoszenie jest w bazie → sprzątanie przez operatora. Na **każdym ekranie** uruchomiony axe (WCAG 2.1 A/AA, bez kontenera mapy) – 0 naruszeń poważnych/krytycznych.
2. Scenariusz demo: komunikat „Trasa omija…”, brak odcinków Grodzkiej, ekran źródeł pokazuje źródło niedostępne.
3. Asystent: pytanie o „dostępne poradnie” nie daje odpowiedzi twierdzącej o dostępności; cytowane są źródła i daty.
4. Odmowa GPS: komunikat i alternatywa (wpisanie adresu / wskazanie na mapie); aplikacja działa dalej.
5. Offline (wszystkie żądania `/v1/**` przerwane): ostatnia trasa dostępna z pamięci urządzenia z wyraźnym komunikatem, że może być nieaktualna.
6. Powiększenie 200 %: brak poziomego przewijania, teksty nie są ucięte.
7. `prefers-reduced-motion`: brak animacji CSS, nawigacja Stack bez animacji.

Zrzuty ekranu z przebiegu: `docs/screens/01-planowanie.png` … `07-zrodla-demo.png`.

### 2.4 Benchmark pełnego grafu (`npm run bench --workspace=@pewnyszlak/api`)

8 par między dzielnicami (Rynek→Wawel, Dworzec→Kazimierz, Nowa Huta→Rynek, Bronowice→Podgórze, Ruczaj→Krowodrza, Prądnik Czerwony→Dębniki, Bieżanów→Zabłocie, Mistrzejowice→Czyżyny), po rozgrzaniu:

| Zestaw preferencji | Trasy znalezione | Czas na trasę | Uwagi |
|---|---|---|---|
| domyślne (bez schodów, krawężnik ≤ 3 cm, brak danych = kara) | 7 / 8 | 78–230 ms, śr. 221 ms | Prądnik Czerwony → Dębniki: cel w „kieszeni” 2 węzłów otoczonej schodami; odpowiedź po 857 ms z diagnozą „Trasa istnieje, jeśli dopuścisz: schody” |
| brak danych = wyklucz | 1 / 8 | 44–593 ms | Oczekiwane: większość sieci OSM w Krakowie nie ma tagów `kerb`/`surface`/`width`; aplikacja pokazuje, które ograniczenie odblokowuje trasę |
| luźne (schody dozwolone, krawężnik ≤ 6 cm) | 8 / 8 | 48–204 ms, śr. 127 ms | Najdłuższa trasa 7,9 km / 111 odcinków |

Wniosek: pełny graf miasta mieści się w pamięci jednego procesu i odpowiada poniżej 1 s również w przypadku braku trasy (dwukierunkowe BFS z budżetem jako wstępne sprawdzenie, diagnostyka złagodzeń na współdzielonym cache ocen).

## 3. Sprawdzenia ręczne

- Przebieg demo z [`README.md`](../README.md) wykonany w przeglądarce (Chrome) – wszystkie kroki działają; zrzuty w `docs/screens/`.
- Prowadzenie: tryb symulacji 1,2 m/s zmienia komunikaty po przejściu punktów, zejście z trasy ≥ 35 m w 3 kolejnych odczytach wywołuje przeliczenie (z 20 s odstępem), dotarcie < 15 m od celu kończy prowadzenie.
- Zgłoszenie w prowadzeniu jest tworzone bez przypisania do odcinków (punktowe), aby nie blokować własnej trasy.
- Narzędzie operatora: `verify`, `set-state`, `locate`, `delete`, `graph`, `backup` uruchomione na bazie; akcje widoczne w `operator_log`.
- Kopia zapasowa: `scripts/backup-db.sh` → plik `pg_dump -Fc` ok. 35 MB w `data/backups/`.
- Czytnik ekranu: przygotowany 20-krokowy protokół TalkBack/VoiceOver ([`protokol-czytniki-ekranu.md`](protokol-czytniki-ekranu.md)). W trakcie prac sprawdzono na web: kolejność fokusu, nagłówki, komunikaty na żywo, role i stany (axe + przegląd drzewa dostępności). **Przejście z fizycznym czytnikiem na telefonie nie zostało wykonane** – do zrobienia na urządzeniu przed finałem.

## 4. Budowy

| Platforma | Stan |
|---|---|
| Web | `npm run build:web` → `apps/mobile/dist` (statyczny eksport, serwowany przez nginx w `apps/mobile/Dockerfile.web` lub `npx serve`). Testy e2e przechodzą na tym eksporcie. |
| Android | `npx expo prebuild --platform android` + `assembleDebug` **zakończone powodzeniem**, APK 297 MB (debug, 4 ABI). Szczegóły w sekcji 4.1. |
| iOS | Nie budowano – wymaga macOS/Xcode lub EAS Build (konfiguracja `apps/mobile/eas.json` i opis uprawnienia lokalizacji w `app.json` są gotowe). |

### 4.1 Android `assembleDebug`

**Budowa zakończona powodzeniem** (`./gradlew assembleDebug --no-daemon`, 35 min 51 s na czysto, 728 zadań Gradle; wcześniejsza próba nie powiodła się z powodu uszkodzonego pobrania NDK przez sdkmanager – NDK r27b 27.1.12297006 zainstalowano ręcznie).

| Parametr | Wartość |
|---|---|
| Plik | `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk` (297 MB – debug, 4 ABI: arm64-v8a, armeabi-v7a, x86, x86_64, z klientem deweloperskim Expo) |
| Pakiet | `pl.pewnyszlak.app`, versionName 1.0.0 |
| SDK | minSdk 24, targetSdk 36, compileSdk 36, NDK 27.1, Kotlin 2.1.20, Gradle 9.3.1 |
| Biblioteki natywne | `libmaplibre.so` (MapLibre Native), Hermes |
| Uprawnienia | `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` (opis użycia w `app.json`) |

Nie wykonano: instalacji i uruchomienia na urządzeniu/emulatorze (brak emulatora w środowisku budowania). Do testu na telefonie: `adb install app-debug.apk`, a w aplikacji ustawić `EXPO_PUBLIC_API_URL` na adres komputera z API (w emulatorze działa domyślne `10.0.2.2:4000`). Wersja wydaniowa (`assembleRelease`, jeden ABI przez `expo build`/EAS) będzie wielokrotnie mniejsza.

## 5. Zgodność z założeniami planu

- Brak płatnych kluczy: tak (OpenFreeMap, Geofabrik, MCP z-dykty/psoz, NFZ ITL). Klucz OpenAI opcjonalny, tylko po stronie serwera.
- Brak zapisu śladów GPS: tak; pozycja używana tylko w pamięci aplikacji. Identyfikator instalacji losowy, w bazie jako SHA-256.
- Limity zapytań na instalację: zgłoszenia 20/h, asystent 60/h (konfigurowalne).
- „Potwierdzone” ≠ „aktualne”, anonimowe potwierdzenia nigdy nie dają weryfikacji: test integracyjny i e2e.
- Data edycji OSM / aktualizacji NFZ ≠ data sprawdzenia w terenie: osobne pola `updatedAt`, `fetchedAt`, `observedAt` w kontrakcie i osobne wiersze w interfejsie.
- Rejestr licencji: [`licencje-danych.md`](licencje-danych.md). Atrybucja mapy pod każdą mapą; brak masowego pobierania kafelków (tylko kafelki wyświetlane).
- Kopie zapasowe i rollback wersji grafu: skrypty + CLI operatora.

## 6. Niewykonane / ograniczenia

- iOS: brak budowy (brak macOS).
- Testy z fizycznym TalkBack/VoiceOver: tylko protokół, nie wykonano na urządzeniu.
- `unknownPolicy = exclude` w praktyce odcina większość miasta z powodu luk w tagach OSM; aplikacja komunikuje to jawnie, ale jest to ograniczenie danych, nie kodu.
- Sygnały z przetargów (z-dykty) mają lokalizację tylko na poziomie ulicy; przypisanie do odcinków wymaga operatora (`locate`) – bez tego są pokazywane jako „potencjalne”, nie wpływają na trasę.
- Wysokości (nachylenie) pochodzą wyłącznie z tagu `incline` w OSM; nie użyto NMT, więc nachylenie jest znane dla małego odsetka odcinków i raportowane jako „brak danych”.
- Asystent LLM nie był testowany z prawdziwym kluczem w tym przebiegu (brak klucza w środowisku); ścieżka regułowa jest przetestowana (integracja + e2e); ścieżka OpenAI wymaga ręcznego sprawdzenia z kluczem (narzędzia asystenta są te same i walidowane Zod po obu stronach).
