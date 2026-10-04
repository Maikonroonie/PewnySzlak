import type { Accessibility, AccessibilityField, SegmentKind } from '@pewnyszlak/domain';
import { segmentKindLabels, surfaceLabels, smoothnessLabels, wheelchairLabel } from '@pewnyszlak/domain';
import type { EdgeAttrs, Tags } from './accessibility.ts';

export type EdgeFact = {
  id: string;
  label: string;
  value: string;
  tone: 'ok' | 'warn' | 'muted' | 'info' | 'danger';
  /** Skąd fakt – krótko dla UI. */
  via: string;
};

function yesNo(raw: string | undefined): boolean | null {
  if (!raw) return null;
  if (raw === 'yes' || raw === 'designated' || raw === 'limited') return true;
  if (raw === 'no') return false;
  return null;
}

/** Ludzkie fakty z tagów OSM + atrybutów krawędzi – zamiast surowego dumpa `key=value`. */
export function edgeFacts(tags: Tags, attrs: EdgeAttrs): EdgeFact[] {
  const out: EdgeFact[] = [];
  const a = attrs.access;
  const push = (id: string, label: string, value: string, tone: EdgeFact['tone'], via = 'OpenStreetMap') => {
    out.push({ id, label, value, tone, via });
  };

  push('kind', 'Rodzaj odcinka', segmentKindLabels[attrs.kind] ?? attrs.kind, 'info');
  if (tags.name) push('name', 'Nazwa', tags.name, 'muted');
  if (tags.highway) push('highway', 'Klasyfikacja OSM', tags.highway.replace(/_/g, ' '), 'muted');
  if (tags.footway) push('footway', 'Typ chodnika / przejścia', tags.footway.replace(/_/g, ' '), 'muted');
  if (tags.crossing) push('crossing', 'Przejście', tags.crossing.replace(/_/g, ' '), 'info');

  if (a.surface) push('surface', 'Nawierzchnia', surfaceLabels[a.surface] ?? a.surface, attrs.surfaceClass >= 2 ? 'warn' : 'ok');
  else push('surface', 'Nawierzchnia', 'brak w OSM', 'warn');

  if (a.smoothness) push('smoothness', 'Równość', smoothnessLabels[a.smoothness] ?? a.smoothness, 'muted');
  if (a.incline != null) push('incline', 'Nachylenie (OSM)', `${a.incline}%${attrs.estimated.includes('incline') ? ' · szacunek' : ''}`, a.incline > 6 ? 'warn' : 'ok');
  else push('incline', 'Nachylenie (OSM)', 'brak – OSM zwykle nie ma modelu terenu', 'warn');

  if (a.widthCm != null) push('width', 'Szerokość', `${a.widthCm} cm${attrs.estimated.includes('widthCm') ? ' · szacunek' : ''}`, 'ok');
  if (a.kerbHeightCm != null) push('kerb', 'Krawężnik', `${a.kerbHeightCm} cm${attrs.estimated.includes('kerbHeightCm') ? ' · szacunek z opisu' : ''}`, a.kerbHeightCm > 2 ? 'warn' : 'ok');
  if (attrs.crossingKerbUnknown) push('kerb-unknown', 'Krawężnik na przejściu', 'brak danych w OSM', 'warn');

  if (a.steps === true) {
    push('steps', 'Schody', attrs.rampForWheelchair ? 'tak, z oznaczoną pochylnią dla wózka' : 'tak', attrs.rampForWheelchair ? 'info' : 'danger');
  } else if (a.steps === false) push('steps', 'Schody', 'nie (wg OSM)', 'ok');

  const w = wheelchairLabel(a.wheelchair);
  if (w) push('wheelchair', 'Oznaczenie wózka', w.replace(/^OSM:\s*/, ''), a.wheelchair === 'no' ? 'danger' : a.wheelchair === 'limited' ? 'warn' : 'ok');
  else push('wheelchair', 'Oznaczenie wózka', 'brak tagu w OSM', 'warn');

  const lit = yesNo(tags.lit);
  if (lit === true) push('lit', 'Oświetlenie', 'tak', 'ok');
  else if (lit === false) push('lit', 'Oświetlenie', 'nie', 'muted');

  if (tags.covered === 'yes' || tags.tunnel === 'yes' || tags.indoor === 'yes') push('covered', 'Zadaszenie / tunel', 'tak', 'info');
  if (tags.handrail === 'yes') push('handrail', 'Poręcz', 'tak', 'ok');
  if (tags.tactile_paving === 'yes') push('tactile', 'Płytki wypukłe', 'tak', 'ok');
  else if (tags.tactile_paving === 'no') push('tactile', 'Płytki wypukłe', 'nie', 'muted');

  if (tags.ramp === 'yes' || tags['ramp:wheelchair'] === 'yes') push('ramp', 'Pochylnia', 'oznaczona w OSM', 'ok');
  if (tags.elevator === 'yes') push('elevator', 'Winda', 'w pobliżu / na odcinku (tag)', 'ok');

  if (tags.sidewalk && tags.sidewalk !== 'no') push('sidewalk', 'Chodnik (tag drogi)', tags.sidewalk, 'info');
  if (attrs.sidewalkUnknown) push('sidewalk-unk', 'Chodnik', 'droga bez osobnego chodnika w danych OSM', 'warn');
  if (attrs.conveying) push('conveying', 'Schody / chodnik ruchomy', 'wykluczone z komfortowej trasy', 'danger');

  if (tags.access && tags.access !== 'yes') push('access', 'Dostęp', tags.access, 'warn');
  if (tags.description) push('desc', 'Opis OSM', tags.description.slice(0, 160), 'muted');
  if (tags['wheelchair:description']) push('wdesc', 'Opis dostępności', tags['wheelchair:description'].slice(0, 160), 'info');

  return out;
}

export function accessibilityCoverage(access: Accessibility, missing: AccessibilityField[]): { known: number; total: number; label: string } {
  const fields: AccessibilityField[] = ['steps', 'surface', 'smoothness', 'incline', 'widthCm', 'kerbHeightCm', 'wheelchair'];
  const known = fields.filter((f) => !missing.includes(f) && access[f] != null).length;
  return { known, total: fields.length, label: `${known}/${fields.length} cech z OSM` };
}
