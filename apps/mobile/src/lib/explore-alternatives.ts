import {
  activityLabels,
  applyEffort,
  effortLabels,
  formatDistance,
  formatDuration,
  type Coordinate,
  type Preferences,
  type RouteResult,
} from '@pewnyszlak/domain';
import { api } from '../api/client';
import { haversineM } from './geo';

export type RouteVariant = {
  id: string;
  label: string;
  blurb: string;
  includesVia: boolean;
  destinationLabel: string;
  viaLabels: string[];
  preferences: Preferences;
  route: RouteResult | null;
  error: string | null;
  destination: Coordinate;
  waypoints: Coordinate[];
  targetLengthM?: number | null;
  roundTrip?: boolean;
};

function clonePrefs(base: Preferences, effort: Preferences['effort'], maxIncline?: number): Preferences {
  const next = applyEffort({ ...base, effort });
  if (maxIncline != null) return { ...next, maxIncline };
  return next;
}

type PlaceRef = { id: string; name: string; coordinate: Coordinate; distanceM?: number };

const START_REF = (origin: Coordinate): PlaceRef => ({ id: '__start__', name: 'Start', coordinate: origin, distanceM: 0 });

/** Dopuszczalne odchylenie od wybranej długości (trasa po sieci OSM nie trafi co do metra). */
const LENGTH_TOLERANCE = 0.1;

async function tryRoute(
  id: string,
  label: string,
  blurb: string,
  origin: Coordinate,
  destination: PlaceRef,
  waypoints: PlaceRef[],
  preferences: Preferences,
  targetLengthM?: number | null,
  roundTrip = false,
): Promise<RouteVariant> {
  const wps = waypoints.map((w) => w.coordinate);
  try {
    const route = await api.route(origin, destination.coordinate, preferences, wps);
    return {
      id,
      label,
      blurb,
      includesVia: waypoints.length > 0,
      destinationLabel: destination.name,
      viaLabels: waypoints.map((w) => w.name),
      preferences,
      route,
      error: null,
      destination: destination.coordinate,
      waypoints: wps,
      targetLengthM,
      roundTrip,
    };
  } catch (e) {
    return {
      id,
      label,
      blurb,
      includesVia: waypoints.length > 0,
      destinationLabel: destination.name,
      viaLabels: waypoints.map((w) => w.name),
      preferences,
      route: null,
      error: e instanceof Error ? e.message : 'Nie udało się wyznaczyć tego wariantu',
      destination: destination.coordinate,
      waypoints: wps,
      targetLengthM,
      roundTrip,
    };
  }
}

/** Pętla: start → punkty → z powrotem do startu. */
async function tryRoundTrip(
  id: string,
  label: string,
  blurb: string,
  origin: Coordinate,
  turnarounds: PlaceRef[],
  preferences: Preferences,
  targetLengthM?: number | null,
): Promise<RouteVariant> {
  return tryRoute(id, label, blurb, origin, START_REF(origin), turnarounds, preferences, targetLengthM, true);
}

function crowDistance(origin: Coordinate, c: PlaceRef): number {
  return c.distanceM ?? haversineM(origin, c.coordinate);
}

/** Cele w paśmie odległości pod docelową długość odcinka (w jedną stronę). */
function pickForLegLength(origin: Coordinate, candidates: PlaceRef[], legAimM: number, count: number): PlaceRef[] {
  // Trasa drogowa ~ 1.15–1.5 × linia prosta.
  const aimCrow = legAimM / 1.3;
  const scored = candidates.map((c) => {
    const d = crowDistance(origin, c);
    return { c, score: Math.abs(d - aimCrow), d };
  }).sort((a, b) => a.score - b.score);

  const out: PlaceRef[] = [];
  for (const row of scored) {
    if (out.length >= count) break;
    if (row.d < aimCrow * 0.55 || row.d > aimCrow * 1.55) {
      if (out.length >= 3) continue;
    }
    const tooSimilar = out.some((o) => Math.abs(crowDistance(origin, o) - row.d) < legAimM * 0.06);
    if (tooSimilar && out.length >= 2) continue;
    out.push(row.c);
  }
  return out.length ? out : scored.slice(0, count).map((r) => r.c);
}

function lengthDelta(v: RouteVariant, targetM: number): number {
  if (!v.route) return Infinity;
  return Math.abs(v.route.distanceM - targetM);
}

function withinTolerance(v: RouteVariant, targetM: number, tol = LENGTH_TOLERANCE): boolean {
  if (!v.route) return false;
  return lengthDelta(v, targetM) / targetM <= tol;
}

function sortByTarget(variants: RouteVariant[], targetM: number | null | undefined): RouteVariant[] {
  if (!targetM) return variants;
  return [...variants].sort((a, b) => {
    if (!!a.route !== !!b.route) return a.route ? -1 : 1;
    if (!a.route || !b.route) return 0;
    const da = lengthDelta(a, targetM);
    const db = lengthDelta(b, targetM);
    if (da !== db) return da - db;
    return a.route.distanceM - b.route.distanceM;
  });
}

function preferExactLength(variants: RouteVariant[], targetM: number | null | undefined): RouteVariant[] {
  if (!targetM) return variants;
  const sorted = sortByTarget(variants, targetM);
  const tight = sorted.filter((v) => withinTolerance(v, targetM));
  const loose = sorted.filter((v) => v.route && !withinTolerance(v, targetM));
  const failed = sorted.filter((v) => !v.route);
  // Najpierw trafione w tolerancję, potem najbliższe poza, na końcu błędy.
  return [...tight, ...loose.slice(0, 2), ...failed.slice(0, 1)];
}

async function tryRouteResilient(
  id: string,
  label: string,
  blurb: string,
  origin: Coordinate,
  destination: PlaceRef,
  waypoints: PlaceRef[],
  preferences: Preferences,
  targetLengthM?: number | null,
  roundTrip = false,
): Promise<RouteVariant> {
  const run = (dest: PlaceRef, wps: PlaceRef[], suffix: string, note: string) =>
    roundTrip
      ? tryRoundTrip(`${id}${suffix}`, label, `${blurb}${note}`, origin, [...wps, dest].filter((p) => p.id !== '__start__'), preferences, targetLengthM)
      : tryRoute(`${id}${suffix}`, label, `${blurb}${note}`, origin, dest, wps, preferences, targetLengthM, false);

  const first = await run(destination, waypoints, '', '');
  if (first.route || waypoints.length === 0) return { ...first, id };

  for (let keep = waypoints.length - 1; keep >= 1; keep--) {
    const subset = waypoints.slice(0, keep);
    const skipped = waypoints.slice(keep).map((w) => w.name);
    const retry = await run(destination, subset, `-n${keep}`, ` Pominięto niedostępne: ${skipped.join(', ')}.`);
    if (retry.route) return { ...retry, id };
  }

  const direct = await run(destination, [], '-direct', ' Punkty „przez” poza siecią OSM — trasa bez nich.');
  if (direct.route) return { ...direct, id, includesVia: false, viaLabels: roundTrip ? direct.viaLabels : [] };
  return { ...first, id };
}

function dedupe(variants: RouteVariant[]): RouteVariant[] {
  const out: RouteVariant[] = [];
  for (const v of variants) {
    if (!v.route) {
      const hasOk = out.some((o) => o.route && o.destinationLabel === v.destinationLabel && o.preferences.maxIncline === v.preferences.maxIncline);
      if (hasOk) continue;
      out.push(v);
      continue;
    }
    const dup = out.find(
      (o) =>
        o.route
        && Math.abs(o.route.distanceM - v.route!.distanceM) / Math.max(o.route.distanceM, 1) < 0.04
        && o.roundTrip === v.roundTrip
        && o.preferences.maxIncline === v.preferences.maxIncline,
    );
    if (dup) continue;
    out.push(v);
  }
  return out;
}

/**
 * Szuka tras możliwie blisko wybranej długości (w jedną stronę albo z powrotem).
 */
async function buildLengthMatchedVariants(opts: {
  origin: Coordinate;
  candidates: PlaceRef[];
  preferences: Preferences;
  targetLengthM: number;
  roundTrip: boolean;
  fixedVias?: PlaceRef[];
  fixedDest?: PlaceRef | null;
}): Promise<RouteVariant[]> {
  const { origin, candidates, preferences, targetLengthM, roundTrip, fixedVias = [], fixedDest = null } = opts;
  const legAim = roundTrip ? targetLengthM / 2 : targetLengthM;
  const modeLabel = roundTrip ? 'tam i z powrotem' : 'w jedną stronę';
  const flatPrefs = clonePrefs(
    preferences,
    'easy',
    Math.min(preferences.maxIncline, preferences.activity === 'bike' ? 6 : preferences.activity === 'wheelchair' ? 4 : 8),
  );
  const hardPrefs = clonePrefs(preferences, 'hard');

  const jobs: Promise<RouteVariant>[] = [];

  if (fixedDest || fixedVias.length) {
    let dest = fixedDest;
    let wps = fixedVias.filter((v) => v.id !== fixedDest?.id);
    if (!dest && wps.length) {
      dest = wps[wps.length - 1]!;
      wps = wps.slice(0, -1);
    }
    if (!dest) return [];

    const viaNote = wps.length ? `Przez: ${wps.map((w) => w.name).join(', ')}. ` : '';
    jobs.push(tryRouteResilient(
      'fixed-limits',
      roundTrip ? `Pętla · ${formatDistance(targetLengthM)}` : `Do: ${dest.name} · ${formatDistance(targetLengthM)}`,
      `${viaNote}${modeLabel}, cel dokładnie ${formatDistance(targetLengthM)}.`,
      origin,
      dest,
      wps,
      preferences,
      targetLengthM,
      roundTrip,
    ));
    jobs.push(tryRouteResilient(
      'fixed-flat',
      'Spokojniej / płaskiej',
      `${viaNote}${modeLabel}, cel ${formatDistance(targetLengthM)}.`,
      origin,
      dest,
      wps,
      flatPrefs,
      targetLengthM,
      roundTrip,
    ));

    // Dobierz dodatkowy punkt zwrotny pod długość
    const stretchPool = pickForLegLength(
      origin,
      candidates.filter((c) => c.id !== dest!.id && !wps.some((w) => w.id === c.id)),
      legAim,
      4,
    );
    for (const s of stretchPool.slice(0, 3)) {
      jobs.push(tryRouteResilient(
        `fixed-stretch-${s.id}`,
        roundTrip ? `Przez ${s.name} · powrót` : `Przez ${s.name}`,
        `Dobór pod ${formatDistance(targetLengthM)} (${modeLabel}).`,
        origin,
        dest,
        [...wps, s].slice(0, 5),
        preferences,
        targetLengthM,
        roundTrip,
      ));
    }
  } else {
    const picks = pickForLegLength(origin, candidates, legAim, 12);
    for (const place of picks) {
      const label = roundTrip
        ? `Pętla przez ${place.name}`
        : `Do: ${place.name}`;
      jobs.push(
        roundTrip
          ? tryRoundTrip(
            `len-${place.id}`,
            label,
            `Cel: dokładnie ${formatDistance(targetLengthM)} ${modeLabel}.`,
            origin,
            [place],
            preferences,
            targetLengthM,
          )
          : tryRoute(
            `len-${place.id}`,
            label,
            `Cel: dokładnie ${formatDistance(targetLengthM)} ${modeLabel}.`,
            origin,
            place,
            [],
            preferences,
            targetLengthM,
            false,
          ),
      );
    }

    // Dwa punkty zwrotne – dłuższa pętla, gdy sam jeden punkt jest za krótki
    if (roundTrip && picks.length >= 2) {
      for (let i = 0; i < Math.min(4, picks.length - 1); i++) {
        const a = picks[i]!;
        const b = picks[i + 1]!;
        jobs.push(tryRoundTrip(
          `len-2-${a.id}-${b.id}`,
          `Pętla: ${a.name} → ${b.name}`,
          `Dwa punkty pod ${formatDistance(targetLengthM)} z powrotem.`,
          origin,
          [a, b],
          preferences,
          targetLengthM,
        ));
      }
    }

    // Warianty limitów na najlepszym kandydacie (po pierwszej fali)
  }

  let list = dedupe(await Promise.all(jobs));
  list = preferExactLength(list, targetLengthM);

  // Na 1–2 najlepszych dystansach dorzuć spokojniej / podjazdy
  const best = list.filter((v) => v.route).slice(0, 2);
  const extra: Promise<RouteVariant>[] = [];
  for (const base of best) {
    const turn = base.viaLabels.length
      ? candidates.filter((c) => base.viaLabels.includes(c.name)).slice(0, 3)
      : [];
    const turnRefs = turn.length
      ? turn
      : candidates.filter((c) => c.name === base.destinationLabel || base.label.includes(c.name)).slice(0, 1);
    if (!turnRefs.length && !roundTrip) {
      const dest = candidates.find((c) => c.name === base.destinationLabel);
      if (dest) {
        extra.push(tryRoute(`${base.id}-flat`, `${base.label} · spokojniej`, `Cel ${formatDistance(targetLengthM)}.`, origin, dest, [], flatPrefs, targetLengthM, false));
        if (preferences.activity === 'bike' || preferences.activity === 'run') {
          extra.push(tryRoute(`${base.id}-hard`, `${base.label} · podjazdy`, `Cel ${formatDistance(targetLengthM)}.`, origin, dest, [], hardPrefs, targetLengthM, false));
        }
      }
    } else if (roundTrip && turnRefs.length) {
      extra.push(tryRoundTrip(`${base.id}-flat`, `${base.label} · spokojniej`, `Cel ${formatDistance(targetLengthM)} z powrotem.`, origin, turnRefs, flatPrefs, targetLengthM));
      if (preferences.activity === 'bike' || preferences.activity === 'run') {
        extra.push(tryRoundTrip(`${base.id}-hard`, `${base.label} · podjazdy`, `Cel ${formatDistance(targetLengthM)} z powrotem.`, origin, turnRefs, hardPrefs, targetLengthM));
      }
    }
  }

  if (extra.length) {
    list = preferExactLength(dedupe([...list, ...await Promise.all(extra)]), targetLengthM);
  }

  // Oznacz w blurbię czy trafiliśmy w długość
  return list.map((v) => {
    if (!v.route || !v.targetLengthM) return v;
    const pct = Math.round((lengthDelta(v, v.targetLengthM) / v.targetLengthM) * 100);
    const hit = withinTolerance(v, v.targetLengthM);
    return {
      ...v,
      blurb: hit
        ? `${v.blurb} Trafienie w długość (±${pct}%).`
        : `${v.blurb} Najbliższa dostępna w sieci OSM (odchyłka ${pct}%).`,
    };
  });
}

/**
 * Warianty tras:
 * - z docelową długością → dobór pod dokładny dystans (tam / tam i z powrotem),
 * - tylko start → propozycje z okolicy,
 * - cel + „przez” → klasyczne warianty limitów.
 */
export async function buildExploreVariants(opts: {
  origin: Coordinate;
  destination: PlaceRef | null;
  vias: PlaceRef[];
  candidates: PlaceRef[];
  preferences: Preferences;
  targetLengthM?: number | null;
  roundTrip?: boolean;
}): Promise<RouteVariant[]> {
  const { origin, destination, vias, candidates, preferences, targetLengthM = null, roundTrip = false } = opts;

  if (targetLengthM && targetLengthM > 0) {
    return buildLengthMatchedVariants({
      origin,
      candidates,
      preferences,
      targetLengthM,
      roundTrip,
      fixedVias: vias,
      fixedDest: destination,
    });
  }

  const jobs: Promise<RouteVariant>[] = [];
  const flatPrefs = clonePrefs(
    preferences,
    'easy',
    Math.min(preferences.maxIncline, preferences.activity === 'bike' ? 6 : preferences.activity === 'wheelchair' ? 4 : 8),
  );
  const hardPrefs = clonePrefs(preferences, 'hard');

  if (!destination && vias.length === 0) {
    const picks = candidates.slice(0, 4);
    for (const dest of picks) {
      jobs.push(tryRoute(`open-${dest.id}-normal`, `Do: ${dest.name}`, 'Propozycja z okolicy · Twoje limity.', origin, dest, [], preferences));
    }
    const top = picks[0];
    if (top) {
      jobs.push(tryRoute(`open-${top.id}-easy`, `Do: ${top.name} · spokojniej`, 'Niższe nachylenie — wygodniejsza trasa.', origin, top, [], flatPrefs));
      if (preferences.activity === 'bike' || preferences.activity === 'run') {
        jobs.push(tryRoute(`open-${top.id}-hard`, `Do: ${top.name} · więcej podjazdów`, 'Wyższe dopuszczalne nachylenie.', origin, top, [], hardPrefs));
      }
    }
    return dedupe(await Promise.all(jobs));
  }

  let dest = destination;
  let waypoints = vias.filter((v) => v.id !== destination?.id);
  if (!dest && vias.length > 0) {
    dest = vias[vias.length - 1]!;
    waypoints = vias.slice(0, -1);
  }
  if (!dest) return [];

  const viaNote = waypoints.length ? `Przez: ${waypoints.map((w) => w.name).join(', ')}.` : 'Bez punktów pośrednich.';

  jobs.push(tryRouteResilient('with-points', waypoints.length ? 'Z punktami · Twoje limity' : `Do: ${dest.name} · Twoje limity`, viaNote, origin, dest, waypoints, preferences));
  jobs.push(tryRouteResilient('flatter', 'Spokojniej / płaskiej', `${viaNote} Niższe dopuszczalne nachylenie.`, origin, dest, waypoints, flatPrefs));
  jobs.push(tryRoute('harder', waypoints.length ? 'Więcej podjazdów · bez punktów' : 'Więcej podjazdów', waypoints.length ? 'Bez punktów „przez”.' : 'Wyższe dopuszczalne nachylenie.', origin, dest, [], hardPrefs));
  if (waypoints.length >= 1) {
    jobs.push(tryRouteResilient('via-first-only', `Tylko przez: ${waypoints[0]!.name}`, 'Skrócona lista punktów.', origin, dest, [waypoints[0]!], preferences));
    jobs.push(tryRoute('direct-limits', 'Bez punktów · Twoje limity', 'Ta sama trasa bez „przez”.', origin, dest, [], preferences));
  }

  return dedupe(await Promise.all(jobs));
}

export function variantPrefsLine(p: Preferences): string {
  const bits = [
    `nachylenie ≤ ${p.maxIncline}%`,
    `krawężnik ≤ ${p.maxKerbHeightCm} cm`,
    `szer. ≥ ${p.minWidthCm} cm`,
  ];
  if (p.avoidSteps) bits.push('bez schodów');
  if (p.avoidRoughSurface) bits.push('gładka nawierzchnia');
  if (p.activity !== 'wheelchair') bits.push(effortLabels[p.effort].toLowerCase());
  bits.push(activityLabels[p.activity].toLowerCase());
  return bits.join(' · ');
}

export function variantMeta(v: RouteVariant): string {
  const prefs = variantPrefsLine(v.preferences);
  const trip = v.roundTrip ? ' · z powrotem' : v.targetLengthM ? ' · w jedną stronę' : '';
  if (v.route) {
    const via = v.viaLabels.length ? ` · przez ${v.viaLabels.length}` : '';
    let lengthBit = `${formatDistance(v.route.distanceM)} · ${formatDuration(v.route.durationSeconds)}${via}${trip}`;
    if (v.targetLengthM) {
      const delta = v.route.distanceM - v.targetLengthM;
      const sign = delta >= 0 ? '+' : '−';
      const pct = Math.round((Math.abs(delta) / v.targetLengthM) * 100);
      lengthBit += ` · cel ${formatDistance(v.targetLengthM)} (${sign}${formatDistance(Math.abs(delta))}, ${pct}%)`;
    }
    return `${lengthBit}\n${prefs}`;
  }
  if (v.targetLengthM) return `cel ${formatDistance(v.targetLengthM)}${trip}\n${prefs}`;
  return prefs;
}
