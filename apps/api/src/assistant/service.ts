import type { AssistantAction, AssistantRequest, AssistantResponse, Evidence, Facility, Place } from '@pewnyszlak/domain';
import { DEFAULT_PREFERENCES, formatDistance, formatDuration } from '@pewnyszlak/domain';
import { config } from '../config.ts';
import type { AppContext } from '../context.ts';
import { haversineM } from '../graph/geo.ts';
import { describeEvidence, runTool, toolDefinitions, toolSchemas, type ToolContext, type ToolName } from './tools.ts';

/** Demo: kilka realnych lokali burgerowych w Krakowie (gdy OSM zwraca same sieciówki). */
const DEMO_BURGERS: { name: string; address: string; latitude: number; longitude: number }[] = [
  { name: 'Pasibus', address: 'ul. Szewska 23, Kraków', latitude: 50.06295, longitude: 19.93485 },
  { name: 'Bobby Burger', address: 'ul. Pawia 5, Kraków', latitude: 50.06775, longitude: 19.94555 },
  { name: 'Meat Love', address: 'ul. Krakowska 19, Kraków', latitude: 50.04985, longitude: 19.94435 },
];

function demoBurgerPlaces(from: { latitude: number; longitude: number } | null): Place[] {
  const now = new Date().toISOString();
  return DEMO_BURGERS.map((b, i) => {
    const distanceM = from
      ? Math.round(haversineM(from.longitude, from.latitude, b.longitude, b.latitude))
      : undefined;
    const evidence: Evidence[] = [{
      id: `demo-burger-${i}`,
      source: 'demo',
      sourceId: `burger-${i}`,
      sourceUrl: null,
      updatedAt: null,
      fetchedAt: now,
      observedAt: null,
      status: 'mapped',
      isStale: false,
      description: 'Propozycja demonstracyjna lokalu (hardkod pod demo). Nie jest oceną dostępności.',
    }];
    return {
      id: `demo-burger-${i}`,
      name: b.name,
      kind: 'place' as const,
      category: 'amenity=fast_food',
      address: b.address,
      coordinate: { latitude: b.latitude, longitude: b.longitude },
      accessibility: {},
      amenities: { ramp: null, toilet: null, elevator: null, carPark: null, rest: null },
      evidence,
      entranceVerified: false,
      ...(distanceM != null ? { distanceM } : {}),
    };
  }).sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
}

export const DISCLAIMER = 'Asystent nie potwierdza dostępności. Podaje wyłącznie to, co wynika z danych (OSM, NFZ, przetargi, zgłoszenia) wraz ze źródłem, datą i statusem wiarygodności. Brak informacji nie oznacza braku barier.';

const SYSTEM_PROMPT = `Jesteś asystentem aplikacji PewnySzlak (Kraków) dla osób poruszających się na wózku. Odpowiadasz po polsku, krótko i konkretnie.
Zasady, których nie wolno łamać:
1. Nigdy nie stwierdzasz, że miejsce lub trasa „jest dostępna”. Mówisz, co mówią dane, kto je podał, kiedy i z jakim statusem (zmapowane / deklaracja / zgłoszenie niezweryfikowane / sygnał z przetargu / potwierdzone przez operatora).
2. Brak danych to brak danych – nie zakładaj braku barier. Wyraźnie wskazuj braki.
3. Korzystasz WYŁĄCZNIE z narzędzi; nie wymyślasz adresów, współrzędnych ani udogodnień. Jeśli narzędzie nic nie zwróciło, powiedz to.
4. Trasę wyznacza backend (narzędzie check_route) – ty ją streszczasz: dystans, czas, bariery, braki danych. Nie oceniasz jej jako „bezpiecznej”.
5. Udogodnienia NFZ to deklaracje świadczeniodawcy; data aktualizacji kolejki NFZ ani data edycji OSM nie są datą sprawdzenia wejścia.
6. Nie proś o informacje o zdrowiu ani niepełnosprawności. Wystarczą preferencje dotyczące barier.
7. Gdy proponujesz cel, podaj nazwę i adres z narzędzia; aplikacja pokaże przycisk „Wyznacz trasę”.
Jeśli pytanie nie dotyczy poruszania się po Krakowie, dostępności, barier ani placówek – odpowiedz krótko, że to poza zakresem.`;

export class AssistantService {
  constructor(private readonly ctx: AppContext) {}

  get llmEnabled(): boolean { return Boolean(config.openai.apiKey && config.openai.model); }

  async answer(req: AssistantRequest, mode: 'live' | 'demo'): Promise<AssistantResponse> {
    const t: ToolContext = { ctx: this.ctx, coordinate: req.coordinate ?? null, preferences: req.preferences ?? DEFAULT_PREFERENCES, mode };
    if (this.llmEnabled) {
      try {
        return await this.answerWithLlm(req, t);
      } catch (e) {
        this.ctx.log.warn(`assistant llm failed, falling back to rules: ${e instanceof Error ? e.message : e}`);
      }
    }
    return this.answerWithRules(req, t);
  }

  // ----------------------------------------------------------------------------------------
  // Tryb regułowy – działa bez klucza; odpowiedzi szablonowe oparte na rzeczywistych danych.
  // ----------------------------------------------------------------------------------------
  async answerWithRules(req: AssistantRequest, t: ToolContext): Promise<AssistantResponse> {
    const msg = req.message.toLowerCase();
    const base = { mode: 'rules' as const, citations: [] as Evidence[], places: [] as Place[], actions: [] as AssistantAction[], suggestedDestination: null as AssistantResponse['suggestedDestination'], disclaimer: DISCLAIMER };

    if (/(źród|zrod|skąd|skad|wiarygod|aktual|dane|status)/.test(msg)) {
      const out = await runTool('source_status', {}, t);
      const s = out.result as Awaited<ReturnType<typeof runTool>>['result'] & { sources: { name: string; state: string; lastSuccessAt: string | null; recordCount: number }[]; graphVersion: string | null };
      const lines = s.sources.map((x) => `• ${x.name}: ${x.state === 'available' ? 'dostępne' : x.state === 'stale' ? 'nieaktualne' : x.state === 'unavailable' ? 'NIEDOSTĘPNE – używamy ostatnich zapisanych danych' : 'jeszcze nie pobrane'}${x.lastSuccessAt ? `, ostatnio ${x.lastSuccessAt.slice(0, 10)}` : ''}, rekordów: ${x.recordCount}`);
      return { ...base, message: `Stan źródeł (graf ${s.graphVersion ?? 'brak'}):\n${lines.join('\n')}\n\nKażda informacja w aplikacji ma źródło, datę i status. Dane niepotwierdzone nie są prezentowane jako zapewnienie dostępności.`, actions: [{ type: 'open-sources', label: 'Pokaż szczegóły źródeł' }] };
    }

    if (/(jedzeni|restaur|pizza|burger|włosk|wlosk|azjat|sushi|kebab|kawiarn|cafe|kawa|fast.?food)/.test(msg)) {
      const query =
        /pizza/.test(msg) ? 'pizza'
          : /burger/.test(msg) ? 'burger'
            : /(włosk|wlosk|italian)/.test(msg) ? 'wloska'
              : /(azjat|sushi|ramen|thai|chino)/.test(msg) ? 'sushi'
                : /(kawiarn|cafe|kawa)/.test(msg) ? 'kawiarnia'
                  : /kebab/.test(msg) ? 'kebab'
                    : null;
      // Burgery: hardkod 3 konkretnych lokali pod demo (OSM często zwraca same sieciówki).
      if (query === 'burger') {
        const list = demoBurgerPlaces(t.coordinate);
        const lines = list.map((p, i) => `${i + 1}. ${p.name}${p.address ? ` – ${p.address}` : ''}${p.distanceM != null ? ` · ${formatDistance(p.distanceM)}` : ''}`);
        return {
          ...base,
          message: `Trzy propozycje burgerów w Krakowie${t.coordinate ? ' (od najbliższego do Twojego startu)' : ''}:\n${lines.join('\n')}\n\nWybierz lokal, a aplikacja wyznaczy trasę według Twoich limitów.`,
          places: list,
          citations: list.flatMap((p) => p.evidence),
          actions: list.filter((p) => p.coordinate).map((p) => ({ type: 'route-to' as const, label: `Trasa: ${p.name}`, destination: p.coordinate!, placeName: p.name })),
          suggestedDestination: list.find((p) => p.coordinate)?.coordinate ?? null,
        };
      }

      if (!t.coordinate) {
        return {
          ...base,
          message: 'Ustaw punkt startu na ekranie głównym — wtedy znajdę najbliższe lokale od Twojej pozycji (z mapy OSM).',
          actions: [{ type: 'open-explore', label: 'Odkryj okolice' }],
        };
      }
      // Najbliższe lokale od startu (dystans), nie „najlepsze dopasowanie nazwy”.
      const radiusM = query === 'pizza' || query === 'kebab' ? 4_000 : 3_000;
      let list = await t.ctx.places.nearbyFood(t.coordinate.longitude, t.coordinate.latitude, radiusM, 8, query);
      if (list.length < 3 && query) {
        const broader = await t.ctx.places.nearbyFood(t.coordinate.longitude, t.coordinate.latitude, radiusM, 8, null);
        const seen = new Set(list.map((p) => p.id));
        for (const p of broader) {
          if (seen.has(p.id)) continue;
          list.push(p);
          if (list.length >= 8) break;
        }
      }
      list = list.slice(0, 5);
      if (list.length === 0) {
        return {
          ...base,
          message: `W promieniu ${formatDistance(radiusM)} od startu nie mam lokali${query ? ` typu „${query}”` : ''} w danych OSM. Zwiększ zasięg startu albo wpisz nazwę lokalu.`,
          actions: [{ type: 'open-explore', label: 'Odkryj okolice' }],
        };
      }
      const label = query ?? 'jedzenie';
      const lines = list.map((p, i) => `${i + 1}. ${p.name}${p.address ? ` – ${p.address}` : ''}${p.distanceM != null ? ` · ${formatDistance(p.distanceM)}` : ''}`);
      return {
        ...base,
        message: `Najbliższe (${label}) od Twojego startu — kolejność według odległości, nie jakości:\n${lines.join('\n')}\n\nWybierz lokal, a aplikacja wyznaczy trasę według Twoich limitów.`,
        places: list,
        citations: list.flatMap((p) => p.evidence),
        actions: list.filter((p) => p.coordinate).slice(0, 3).map((p) => ({ type: 'route-to' as const, label: `Trasa: ${p.name.slice(0, 36)}`, destination: p.coordinate!, placeName: p.name })),
        suggestedDestination: list.find((p) => p.coordinate)?.coordinate ?? null,
      };
    }

    if (/(odkryj|co .*w okolicy|dla wózka|komfort.*okol)/.test(msg)) {
      return {
        ...base,
        message: 'Odkrywanie okolicy pokazuje zabytki, muzea, parki i sprawdzone miejsca wokół startu oraz sieć chodników dopasowaną do Twoich limitów wózka. Nie potwierdza dostępności – pokazuje, co wynika z danych (OSM, MSIP, weryfikacja operatora).',
        actions: [{ type: 'open-explore', label: 'Odkryj okolice' }, { type: 'open-preferences', label: 'Moje limity' }],
      };
    }

    if (/(toalet|wc|łazienk|lazienk)/.test(msg)) {
      const out = await runTool('search_places', { query: 'toaleta', limit: 5 }, t);
      const toilets = out.places.filter((p) => /toilet|toalet/i.test(`${p.name} ${p.category ?? ''}`) || p.amenities?.toilet === true);
      if (toilets.length === 0 && t.coordinate) {
        return {
          ...base,
          message: 'W indeksie OSM wokół Ciebie nie mam pewnych toalet. W Odkryj okolice włącz warstwę udogodnień albo zgłoś obserwację. Brak wpisu ≠ brak toalety.',
          actions: [{ type: 'open-explore', label: 'Odkryj okolice' }],
          citations: out.citations,
        };
      }
      const list = (toilets.length ? toilets : out.places).slice(0, 4);
      const lines = list.map((p, i) => `${i + 1}. ${p.name}${p.address ? ` – ${p.address}` : ''}${p.distanceM != null ? ` · ${formatDistance(p.distanceM)}` : ''}`);
      return {
        ...base,
        message: `Toalety / miejsca z tagiem toalety (dane mapy, nie gwarancja):\n${lines.join('\n')}\n\nSprawdź kartę miejsca przed wizytą.`,
        places: list,
        citations: out.citations,
        actions: [
          ...list.filter((p) => p.coordinate).slice(0, 3).map((p) => ({ type: 'route-to' as const, label: `Trasa: ${p.name.slice(0, 36)}`, destination: p.coordinate!, placeName: p.name })),
          { type: 'open-explore', label: 'Odkryj okolice' },
        ],
        suggestedDestination: list.find((p) => p.coordinate)?.coordinate ?? null,
      };
    }

    if (/(omija.*remont|remont.*omija|grodzk)/.test(msg) && t.coordinate) {
      const out = await runTool('barriers_near', { latitude: t.coordinate.latitude, longitude: t.coordinate.longitude, radiusM: 1200 }, t);
      const barriers = (out.result as { barriers: { title: string; state: string; evidence: string[]; isDemo: boolean }[] }).barriers;
      const remont = barriers.filter((b) => /remont|robot|grodz/i.test(b.title));
      const lines = (remont.length ? remont : barriers).slice(0, 5).map((b) => `• ${b.title} (${b.state}${b.isDemo ? ', DEMO' : ''})`);
      return {
        ...base,
        message: lines.length
          ? `Sygnały o remontach / robotach w pobliżu:\n${lines.join('\n')}\n\nTrasa A→B omija aktywne blokady przypisane do odcinków. Włącz tryb Demo, by zobaczyć remont Grodzkiej.`
          : 'Nie mam sygnału o aktywnym remoncie w pobliżu. To nie gwarantuje braku robót – sprawdź Odkryj / Źródła.',
        citations: out.citations,
        actions: [{ type: 'open-explore', label: 'Odkryj okolice' }, { type: 'open-sources', label: 'Źródła danych' }],
      };
    }

    if (/(rehabilit|przychodn|poradni|lekarz|nfz|placówk|placowk|fizjoter|ortoped|neurolog|szpital)/.test(msg)) {
      const benefit = /ortoped/.test(msg) ? 'PORADNIA CHIRURGII URAZOWO-ORTOPEDYCZNEJ' : /neurolog/.test(msg) ? 'PORADNIA NEUROLOGICZNA' : undefined;
      const out = await runTool('find_facilities', { benefit, limit: 3 }, t);
      const facilities = out.places as Facility[];
      if (facilities.length === 0) {
        return { ...base, message: 'Nie mam jeszcze danych o placówkach NFZ dla tego świadczenia – synchronizacja z API NFZ nie została wykonana albo nic nie znaleziono. Spróbuj wyszukać adres w planerze.', actions: [{ type: 'open-sources', label: 'Stan źródeł' }] };
      }
      const lines = facilities.map((f, i) => {
        const amen = [f.amenities.ramp ? 'podjazd' : null, f.amenities.elevator ? 'winda' : null, f.amenities.toilet ? 'toaleta dla osób z niepełnosprawnością' : null].filter(Boolean);
        return `${i + 1}. ${f.name}\n   ${f.address ?? 'adres nieznany'}${f.distanceM !== undefined ? ` · ${formatDistance(f.distanceM)} w linii prostej` : ''}\n   Deklarowane udogodnienia (NFZ, dane za ${f.dataMonth ?? '?'}): ${amen.length ? amen.join(', ') : 'brak deklaracji'}${!f.coordsValid ? '\n   Uwaga: współrzędne z NFZ nie przeszły kontroli – lokalizacja wymaga potwierdzenia.' : ''}`;
      });
      const first = facilities.find((f) => f.coordinate);
      const actions: AssistantAction[] = facilities.filter((f) => f.coordinate).slice(0, 3).map((f) => ({ type: 'route-to', label: `Trasa: ${f.name.slice(0, 40)}`, destination: f.coordinate!, placeName: f.name }));
      actions.push({ type: 'show-facilities', label: 'Wszystkie poradnie rehabilitacyjne', benefit: facilities[0]!.benefit });
      return { ...base, message: `${t.coordinate ? 'Najbliższe' : 'Przykładowe'} placówki NFZ (${facilities[0]!.benefit.toLowerCase()}):\n\n${lines.join('\n\n')}\n\nUdogodnienia to deklaracje świadczeniodawcy – nie zostały sprawdzone w terenie. Wybierz placówkę, a aplikacja wyznaczy trasę według Twoich preferencji.`, citations: out.citations, places: facilities, actions, suggestedDestination: first?.coordinate ?? null };
    }

    if (/(barier|remont|utrudni|przeszkod|roboty|zamkni|winda)/.test(msg) && t.coordinate) {
      const out = await runTool('barriers_near', { latitude: t.coordinate.latitude, longitude: t.coordinate.longitude, radiusM: 800 }, t);
      const barriers = (out.result as { barriers: { title: string; state: string; evidence: string[]; isDemo: boolean }[] }).barriers;
      if (barriers.length === 0) return { ...base, message: 'W promieniu 800 m od Twojej pozycji nie mamy żadnych zgłoszeń ani sygnałów o barierach. To nie znaczy, że ich nie ma – po prostu nikt ich nie zgłosił, a przetargi nie wskazują remontów w tym miejscu.', citations: out.citations };
      const lines = barriers.slice(0, 6).map((b) => `• ${b.title} – ${b.state === 'active' ? 'aktywna (niezweryfikowana formalnie)' : b.state === 'potential' ? 'możliwe utrudnienie (sygnał z przetargu)' : b.state === 'disputed' ? 'sprzeczne zgłoszenia' : b.state}${b.isDemo ? ' [DEMO]' : ''}\n   ${b.evidence[0] ?? ''}`);
      return { ...base, message: `Bariery i sygnały w pobliżu (800 m):\n${lines.join('\n')}`, citations: out.citations };
    }

    const routeMatch = msg.match(/(?:do|na|pod)\s+(.{3,80})$/);
    if (/(trasa|trasę|dojść|dojechać|dotrzeć|dostać|jak .* do|zaprowadź|prowadź)/.test(msg) || routeMatch) {
      const query = routeMatch?.[1]?.replace(/[?.!]+$/, '').trim();
      if (query) {
        const out = await runTool('search_places', { query, limit: 3 }, t);
        if (out.places.length > 0) {
          const p = out.places[0]!;
          let routeText = '';
          if (t.coordinate && p.coordinate) {
            const r = await runTool('check_route', { destinationLatitude: p.coordinate.latitude, destinationLongitude: p.coordinate.longitude, destinationName: p.name }, t);
            const res = r.result as { distanceM?: number; durationSeconds?: number; unknownSurfaceM?: number; warnings?: string[]; noRoute?: { explanation: string } };
            if (res.noRoute) routeText = `\n\nTrasa z Twojej pozycji: brak trasy spełniającej preferencje – ${res.noRoute.explanation}`;
            else if (res.distanceM !== undefined) routeText = `\n\nTrasa z Twojej pozycji wg Twoich preferencji: ${formatDistance(res.distanceM)}, ${formatDuration(res.durationSeconds ?? 0)}; bez danych o nawierzchni: ${formatDistance(res.unknownSurfaceM ?? 0)}.${res.warnings?.length ? `\nOstrzeżenia: ${res.warnings.join(' ')}` : ''}`;
            out.citations.push(...r.citations);
          }
          const osm = p.accessibility.wheelchair ? `OSM oznacza to miejsce jako wheelchair=${p.accessibility.wheelchair}` : 'OSM nie zawiera oznaczenia dostępności tego miejsca';
          return {
            ...base,
            message: `Znalazłem: ${p.name}${p.address ? `, ${p.address}` : ''}. ${osm} (${describeEvidence(p.evidence[0]!)}).${routeText}\n\nMogę ustawić to miejsce jako cel – trasę wyznaczy aplikacja według Twoich preferencji.`,
            citations: out.citations, places: out.places,
            actions: out.places.filter((x) => x.coordinate).slice(0, 3).map((x) => ({ type: 'route-to', label: `Wyznacz trasę: ${x.name.slice(0, 40)}`, destination: x.coordinate!, placeName: x.name })),
            suggestedDestination: p.coordinate,
          };
        }
        return { ...base, message: `Nie znalazłem „${query}” w lokalnym indeksie miejsc i adresów Krakowa (OpenStreetMap). Spróbuj podać ulicę z numerem albo nazwę obiektu.` };
      }
    }

    return {
      ...base,
      message: 'Działam bez modelu językowego (tryb regułowy). Mogę:\n• znaleźć jedzenie (pizza, burgery, włoskie…),\n• wskazać toaletę w danych mapy („toaleta blisko”),\n• sprawdzić remonty („czy omija remont”),\n• znaleźć poradnię NFZ („najbliższa rehabilitacja”),\n• zaproponować cel („trasa do Rynek Główny 1”),\n• opisać źródła („skąd są dane”).\nTrasy wyznacza backend według Twoich preferencji; ja niczego nie potwierdzam.',
      actions: [{ type: 'open-explore', label: 'Odkryj okolice' }, { type: 'open-preferences', label: 'Moje preferencje' }, { type: 'open-sources', label: 'Źródła danych' }],
    };
  }

  // ----------------------------------------------------------------------------------------
  // Tryb LLM – OpenAI Responses API z walidowanymi wywołaniami narzędzi.
  // ----------------------------------------------------------------------------------------
  async answerWithLlm(req: AssistantRequest, t: ToolContext): Promise<AssistantResponse> {
    const citations = new Map<string, Evidence>();
    const places = new Map<string, Place>();
    const actions: AssistantAction[] = [];
    let suggestedDestination: AssistantResponse['suggestedDestination'] = null;
    const input: unknown[] = [
      ...req.history.map((h) => ({ role: h.role, content: h.content })),
      { role: 'user', content: `${req.message}\n\n[Kontekst: pozycja użytkownika ${t.coordinate ? `${t.coordinate.latitude.toFixed(5)}, ${t.coordinate.longitude.toFixed(5)}` : 'nieznana'}; tryb danych: ${t.mode}; preferencje: ${JSON.stringify(t.preferences)}]` },
    ];
    let previousResponseId: string | null = null;
    let pendingInput: unknown[] = input;
    for (let round = 0; round < 5; round++) {
      const body: Record<string, unknown> = {
        model: config.openai.model,
        instructions: SYSTEM_PROMPT,
        input: pendingInput,
        tools: toolDefinitions,
        tool_choice: 'auto',
        parallel_tool_calls: true,
        store: false,
        max_output_tokens: 900,
      };
      if (previousResponseId) body.previous_response_id = previousResponseId;
      const res = await fetch(`${config.openai.baseUrl}/responses`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.openai.apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = (await res.json()) as { id: string; output: { type: string; name?: string; arguments?: string; call_id?: string; content?: { type: string; text?: string }[] }[] };
      previousResponseId = data.id;
      const calls = data.output.filter((o) => o.type === 'function_call');
      if (calls.length === 0) {
        const text = data.output.filter((o) => o.type === 'message').flatMap((o) => o.content ?? []).filter((c) => c.type === 'output_text').map((c) => c.text ?? '').join('\n').trim();
        return { mode: 'llm', message: text || 'Nie udało się przygotować odpowiedzi.', citations: [...citations.values()], places: [...places.values()], actions, suggestedDestination, disclaimer: DISCLAIMER };
      }
      // store:false → kontynuacja wymaga przekazania całej historii, więc dokładamy wywołania i wyniki do wejścia.
      previousResponseId = null;
      const outputs: unknown[] = [];
      for (const call of calls) {
        const name = call.name as ToolName;
        let parsedArgs: unknown = {};
        try { parsedArgs = JSON.parse(call.arguments ?? '{}'); } catch { parsedArgs = {}; }
        let result: unknown;
        if (!(name in toolSchemas)) {
          result = { error: 'unknown_tool' };
        } else {
          const out = await runTool(name, parsedArgs, t);
          result = out.result;
          for (const c of out.citations) citations.set(c.id, c);
          for (const p of out.places) places.set(p.id, p);
          if (out.destination) {
            suggestedDestination = out.destination.coordinate;
            if (!actions.some((a) => a.type === 'route-to' && a.placeName === out.destination!.name)) actions.push({ type: 'route-to', label: `Wyznacz trasę: ${out.destination.name.slice(0, 40)}`, destination: out.destination.coordinate, placeName: out.destination.name });
          }
        }
        outputs.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result).slice(0, 12_000) });
      }
      pendingInput = [...pendingInput, ...calls.map((c) => ({ type: 'function_call', call_id: c.call_id, name: c.name, arguments: c.arguments })), ...outputs];
    }
    throw new Error('Zbyt wiele rund wywołań narzędzi');
  }
}
