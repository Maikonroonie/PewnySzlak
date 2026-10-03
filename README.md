# PewnySzlak — Kraków w Twoim tempie

Aplikacja (Android / iOS / web) wyznaczająca trasy piesze dla osób z ograniczoną mobilnością na **pełnej sieci pieszej Krakowa z OpenStreetMap** (281 817 węzłów, 344 284 odcinków), z jawnym pokazywaniem **skąd pochodzi każda informacja, kiedy zmieniła się w źródle i czy ktoś sprawdził ją w terenie**. Projekt na HackYeah 2026, zadanie „Kraków bez barier”. Założenia i decyzje: [`plan.md`](plan.md), [`prd.md`](prd.md).

Aplikacja **nie potwierdza, że droga jest dostępna** – pokazuje, co wynika z danych i czego w nich brakuje.

## Co jest w repozytorium

| Katalog | Zawartość |
|---|---|
| `apps/api` | Fastify (Node 24) – routing A* w pamięci, bariery, miejsca, placówki NFZ, asystent, synchronizacja źródeł, CLI operatora, benchmark |
| `apps/mobile` | Expo SDK 57 (React Native + Expo Router) – aplikacja na Android/iOS/web, MapLibre |
| `packages/domain` | Wspólne kontrakty TypeScript/Zod (trasa, odcinek, dowód, bariera, preferencje, etykiety) |
| `services/importer` | Importer OSM (Python, pyosmium) – graf pieszy, adresy, miejsca, ulice |
| `infra/db/schema.sql` | Schemat PostgreSQL 17 + PostGIS 3.5 (idempotentny) |
| `e2e/` | Testy Playwright + axe na wyeksportowanej aplikacji web |
| `docs/` | Raport odbioru, protokół testów z czytnikiem ekranu, rejestr licencji, zrzuty ekranu |
| `scripts/` | Kopia zapasowa / przywracanie bazy |

## Uruchomienie lokalne (od zera)

Wymagania: Docker + Docker Compose, Node 24 (`nvm use 24`), Python ≥ 3.10, ok. 3 GB wolnego miejsca (PBF Małopolski 200 MB + baza).

```bash
cp .env.example .env            # bez żadnych kluczy – wszystko działa; OPERATOR_TOKEN ustaw, jeśli chcesz korekt przez HTTP
npm install                     # workspaces: api, mobile, domain, testy e2e
docker compose up -d db         # PostgreSQL + PostGIS

# importer OSM (Python)
python3 -m venv .venv && .venv/bin/pip install -r services/importer/requirements.txt

# pobranie Małopolski z Geofabrik i import pełnego grafu Krakowa (+2 km bufora) – ok. 10–15 min
npm run sync -- --once --source=osm

# źródła zewnętrzne (z-dykty, NFZ, PSOZ) – bez kluczy, ok. 1 min
npm run sync -- --once

# scenariusz demo (odizolowane bariery pokazowe, widoczne tylko w trybie Demo)
npm run demo:seed --workspace=@pewnyszlak/api

npm run dev:api                 # API: http://localhost:4000 (graf wczytuje się ~8 s)
npm run dev:web                 # aplikacja web: http://localhost:8081
```

Android/iOS (development build, bo MapLibre to moduł natywny):

```bash
cd apps/mobile
npx expo prebuild --platform android      # generuje ./android (sprawdzone)
npx expo run:android                      # wymaga Android SDK + urządzenia/emulatora
# iOS: wymaga macOS/Xcode lub EAS Build (eas.json jest przygotowany)
```

W emulatorze Androida API jest pod `http://10.0.2.2:4000` (aplikacja ustawia to domyślnie); na fizycznym telefonie ustaw `EXPO_PUBLIC_API_URL` na adres komputera w sieci lokalnej.

### Wszystko w Dockerze

```bash
docker compose up -d --build     # db + api (:4000) + sync (harmonogram) + web (:8080)
docker compose exec sync npx tsx src/sync/main.ts --once --source=osm   # pierwszy import grafu
```

## Klucze i konfiguracja

Żadne klucze nie są wymagane. Opcjonalnie (`.env`, tylko po stronie serwera):

| Zmienna | Znaczenie |
|---|---|
| `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL` | Asystent w trybie LLM (OpenAI Responses API, `store: false`, narzędzia walidowane Zod). Bez klucza działa tryb regułowy z tymi samymi danymi i cytowaniami. |
| `OPERATOR_TOKEN` | Nagłówek `x-operator-token` dla `PATCH/DELETE /v1/operator/barriers/:id` i `POST /v1/operator/graph/reload`. Puste = operator tylko przez CLI. |
| `RATE_LIMIT_*` | Limity zgłoszeń i pytań do asystenta na instalację/godzinę |
| `EXPO_PUBLIC_MAP_STYLE_URL` | Styl mapy podkładowej (domyślnie OpenFreeMap `liberty`, bez klucza). Atrybucja wyświetlana pod mapą; brak masowego pobierania kafelków. |
| `SYNC_OSM_CRON`, `SYNC_SOURCES_CRON` | Harmonogram odświeżania (domyślnie OSM co tydzień, źródła codziennie) |

## Aktualizacja danych

- **OSM**: `npm run sync -- --once --source=osm` pobiera nowy PBF i tworzy **nową wersję grafu**; aktywacja następuje dopiero po udanym imporcie, API wczytuje ją automatycznie (do 5 min) lub po `POST /v1/operator/graph/reload`. Nieudany import zostawia poprzednią wersję. Rollback: `npm run operator -- graph-activate <wersja>`.
- **Źródła zewnętrzne**: `npm run sync -- --once --source=zdykty|nfz|psoz`. Każde uruchomienie zapisuje się w `source_runs`; stan (dostępne / nieodświeżane / niedostępne) widać w `GET /v1/sources` i na ekranie „Źródła danych”. Awaria źródła nie psuje aplikacji – używane są ostatnie zapisane dane, a użytkownik to widzi.
- **Warstwa barier** (zgłoszenia, sygnały, weryfikacje) jest niezależna od wersji grafu i odświeżana co 60 s.
- **Kopia zapasowa**: `scripts/backup-db.sh` (pg_dump, rotacja 14 kopii, `data/backups/`), przywracanie `scripts/restore-db.sh <plik>`.

## Narzędzie operatora

```bash
npm run operator -- barriers            # lista barier
npm run operator -- barrier <id>        # szczegóły z dowodami
npm run operator -- verify <id>         # formalna weryfikacja (jedyna droga do statusu „zweryfikowane”)
npm run operator -- set-state <id> resolved|active|disputed|potential [--blocks true|false] [--until 2026-12-31]
npm run operator -- locate <id> <edgeId,...>   # przypisanie sygnału z przetargu do odcinków
npm run operator -- tenders --relevant  # sygnały z BZP sklasyfikowane jako dotyczące ruchu pieszego
npm run operator -- facility-coords <id> <lat> <lon>
npm run operator -- graph | graph-activate <wersja> | backup
```

Każda akcja trafia do `operator_log`. Potwierdzenia użytkowników zmieniają stan bariery (≥2 „zniknęła” przeważające nad potwierdzeniami → usunięta, ≥2 zaprzeczenia → sporna), ale nigdy nie dają statusu „zweryfikowane”.

## Scenariusz demo (5 min)

1. **Preferencje** → „Ustaw dla wózka” (6 %, 2 cm, 90 cm, bez schodów) → Dane: **Demo**.
2. Start „Rynek Główny 1”, cel „Wawel” → **Wyznacz trasę**. Trasa (ok. 1,6 km) **omija remont na Grodzkiej** (sygnał z przetargu z-dykty + weryfikacja operatora + zgłoszenie); bez demo szłaby Grodzką (ok. 1,5 km).
3. Dotknij odcinka → **Skąd to wiemy**: status „Zmapowane w OSM (niesprawdzone w terenie)”, data edycji OSM osobno od „Sprawdzono w terenie: nie”, link do obiektu OSM, lista tagów.
4. **Widok tekstowy** – pełna alternatywa bez mapy; **Prowadź mnie** → „Symuluj przejście trasy” (komunikaty zmieniają się po przejściu punktów; przy odmowie GPS tryb ręczny).
5. **Zgłoś barierę tutaj** → zgłoszenie od razu widoczne i omijane; **Potwierdzam** → licznik rośnie, status pozostaje „Bez formalnej weryfikacji”.
6. Mapa barier w demo: sporny krawężnik (sprzeczne obserwacje), nieaktualne zgłoszenie windy („może być nieaktualne”), potencjalna bariera z przetargu na Floriańskiej, bariera usunięta. **Źródła danych**: jedno źródło „Niedostępne – używamy ostatnich pobranych danych” (symulowana awaria).
7. **Asystent**: „najbliższa poradnia rehabilitacyjna” → placówki NFZ z deklaracjami udogodnień i źródłem; „skąd są dane?”; „trasa do Wawel”. Asystent nigdy nie twierdzi, że coś „jest dostępne”.

## Testy

```bash
npm run test:unit --workspace=@pewnyszlak/api         # 33 testy: reguły routingu (schody, krawężniki, nawierzchnia, nachylenie, szerokość, brak danych), warstwa barier, topologia (wiadukt), parsowanie OSM, klasyfikacja przetargów, klient MCP, konflikty/nieaktualność
npm run test:integration --workspace=@pewnyszlak/api  # 10 testów na prawdziwej bazie i grafie: trasa Rynek→Wawel live/demo, trwałość zgłoszenia → wpływ na trasę → potwierdzenia → „zniknęła”, demo, asystent, walidacja
npm run build:web && npm run test:e2e                 # 7 testów Playwright: pełny przepływ klawiaturą + axe (WCAG 2.1 AA) na każdym ekranie, demo, asystent, odmowa GPS, offline, tekst 200 %, ograniczony ruch
npm run bench --workspace=@pewnyszlak/api -- --verbose  # 8 par między dzielnicami × 3 zestawy preferencji
```

Wyniki i protokół ręczny: [`docs/raport-odbioru.md`](docs/raport-odbioru.md), [`docs/protokol-czytniki-ekranu.md`](docs/protokol-czytniki-ekranu.md).

## Dostępność – co jest, czego nie ma

Jest: każdy ekran ma nagłówek H1 z przeniesieniem fokusu; wszystkie funkcje dostępne bez mapy (widok tekstowy, lista kroków, lista odcinków); role i stany ARIA (switch, radio, alert, list); komunikaty na żywo dla czytnika (wyniki wyszukiwania, trasa, prowadzenie); widoczny fokus klawiatury; cele dotykowe ≥ 48 dp; kontrast ≥ 4,5:1; znaczenie nigdy tylko kolorem; `prefers-reduced-motion` wyłącza animacje; skalowanie tekstu bez stałych wysokości; odmowa GPS i offline mają czytelne komunikaty i alternatywy.

Nie ma / ograniczenia: mapa (MapLibre) nie jest obsługiwana czytnikiem (świadomie); brak własnej syntezy mowy w prowadzeniu (komunikaty czyta czytnik ekranu); testy TalkBack/VoiceOver są ręczne (protokół w `docs/`), VoiceOver wymaga macOS; na web nie da się wykryć czytnika, więc mapa pozostaje widoczna.

## Utrzymanie poza infrastrukturą miasta

- Całość działa na jednym serwerze z Dockerem (`docker compose up -d --build`): baza, API (ok. 850 MB RAM dla grafu w pamięci), harmonogram synchronizacji, statyczny web. Nie ma zależności od systemów UMK.
- Dane wejściowe są publiczne i bez kluczy (Geofabrik/OSM, OpenFreeMap, z-dykty MCP, NFZ ITL, psoz MCP). Rejestr licencji i atrybucji: [`docs/licencje-danych.md`](docs/licencje-danych.md).
- Kopie zapasowe: `scripts/backup-db.sh` w cronie; graf jest odtwarzalny z importu, zgłoszenia i korekty – tylko z kopii.
- Prywatność: brak kont, losowy identyfikator instalacji (w bazie jako SHA-256), brak zapisu śladów GPS, klucz AI tylko po stronie serwera, limity zapytań na instalację.
- Współpraca z miastem (ZDMK/MIR) nie jest wymagana do działania, ale weryfikacje operatora i sygnały z przetargów są miejscem, gdzie dane miasta mogłyby zasilać aplikację bez zmian w kodzie (CLI operatora / tabela `barriers`).

## Licencja kodu

Kod projektu: MIT. Dane: zgodnie z [`docs/licencje-danych.md`](docs/licencje-danych.md) (OSM i graf pochodny – ODbL).
