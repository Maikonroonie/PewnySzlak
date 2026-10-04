# PewnySzlak — launch film

Samodzielny 60-sekundowy film koncepcyjny w HTML, CSS i JavaScript. Własna ilustracja SVG miasta z budynkami, perspektywa CSS 3D, płynny ruch kamery, animowana trasa, interfejs telefonu i autorska ilustracja burgera. Bez kluczy API, CDN, zewnętrznych fontów i zależności od backendu.

## Podgląd

```sh
npm run dev:launch
```

Otwórz http://localhost:8090. W uruchomionej aplikacji Expo pliki są również dostępne pod `/launch/index.html`.

- `Space`: odtwarzanie / pauza. Przy fokusie na przycisku działa standardowa aktywacja przycisku.
- Strzałki lewo/prawo: przeskok o 5 sekund (suwak zachowuje natywne sterowanie).
- `C`: czysty kadr. `Escape`: wyjście z czystego kadru.
- Rozdziały, suwak, restart i prędkość 0.5× / 1× / 1.5× pod filmem.
- Film zatrzymuje się po 60 sekundach oraz po ukryciu karty.
- Preferencja ograniczenia ruchu blokuje automatyczny start; ręczne odtworzenie pozostaje dostępne.

## Nagranie do MP4

1. Ustaw okno na 1920×1080, proporcje 16:9, skalowanie przeglądarki 100%.
2. Otwórz `http://localhost:8090/?clean=1&t=0`. Kadr nie zawiera kontrolek odtwarzacza.
3. Uruchom nagrywanie okna przeglądarki w OBS lub systemowym rejestratorze, najlepiej 60 fps.
4. Naciśnij `Space`, nagraj pełne 60 sekund i zakończ po planszy końcowej.
5. Eksportuj / remuksuj materiał do MP4 H.264. Film jest bez dźwięku; ścieżkę muzyczną można dodać w montażu.

`?autoplay=1` uruchamia film automatycznie (poza ograniczonym ruchem), `?t=36` ustawia konkretny moment, `?clean=1` ukrywa otoczenie odtwarzacza. Można łączyć parametry.

Nie wygenerowano pliku MP4 — dostarczona animacja jest gotowa do nagrania. Mapa, 50-kilometrowa pętla, czasy, GPS, lokale, ocena i rekomendacje są jawnie oznaczoną symulacją reklamową; nie pochodzą z silnika tras i nie dodają tych funkcji do aplikacji produkcyjnej.

## Montaż

- 00:00–00:10 — preferencje: walking / bicycle / wheelchair, krajobraz, spokojniejsze ulice i tempo.
- 00:10–00:18 — wybór roweru, animacja naciśnięcia i karta potwierdzenia.
- 00:18–00:29 — wpisanie 50 km, pętla, generowanie i wynik.
- 00:29–00:43 — kamera nad miastem, ruch pozycji GPS, instrukcja skrętu, postęp.
- 00:43–00:55 — asystent, dwie przykładowe propozycje burgerów, dodanie postoju.
- 00:55–01:00 — plansza końcowa marki.

Cały stan jest funkcją czasu. `window.launchFilm.seek(seconds)`, `.play()`, `.pause()` oraz `.time` pozwalają uzyskać powtarzalne kadry; mapa używa stałego ziarna generatora. Treść i kadrowanie: `apps/mobile/public/launch/index.html`; styl: `film.css`; sekwencja i mapa: `film.js`.

## Weryfikacja

```sh
npm run test:launch
```

Oddzielne testy Playwright: pięć rozdziałów, trasa i GPS, powtarzalne przewijanie całej osi czasu, odtwarzanie / pauza, czysty kadr i wyjście klawiaturą, ekran mobilny, ograniczenie ruchu, brak wyjątków JavaScript. Testy zapisują cztery kadry w tym katalogu. Nie wymagają API ani bazy danych.

Ilustracje miasta, ikony i burger powstały bezpośrednio w kodzie na potrzeby filmu. Mapę celowo stylizowano; nie jest to podkład geograficzny Krakowa.
