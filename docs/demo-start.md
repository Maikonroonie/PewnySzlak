# Start dema PewnySzlak (3 komendy)

## Lokalnie

```bash
# 1. Baza + API (graf ~8 s przy starcie)
npm run dev:api

# 2. Zestaw demonstracyjny (remont Grodzka, konflikt, nieaktualna winda, awaria PSOZ)
npm run demo:seed --workspace=@pewnyszlak/api

# 3. Aplikacja web
npm run dev:web
```

Otwórz **http://localhost:8081**. W Preferencjach / Ja włącz **Tryb demo**.

## Docker (jeden stack)

```bash
docker compose up -d --build
npm run demo:seed --workspace=@pewnyszlak/api
```

Web: **http://localhost:8080** · API: **http://localhost:4000**.

Telefon fizyczny: ustaw `EXPO_PUBLIC_API_URL=http://<IP-LAN>:4000` przed `npx expo start`.

## Ścieżka 90 s dla jury

1. Tryb **Wózek** (domyślny) → ustaw start na Rynek (GPS / wyszukiwanie).
2. **Odkryj okolice** → karta ze badge **Sprawdzone w terenie** + siatka 8 cech.
3. **Trasa** do miejsca → omija remont Grodzkiej (demo).
4. Karta **Scenariusze demo**: sporna bariera · nieaktualne · Źródła (awaria PSOZ).
5. Widok tekstowy trasy / źródła danych.

Aplikacja **nie gwarantuje** dostępności – pokazuje, co wynika z danych.
