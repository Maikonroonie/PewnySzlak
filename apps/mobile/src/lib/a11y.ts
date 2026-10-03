import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, Platform } from 'react-native';

/** Preferencja „ogranicz ruch” z systemu – wyłącza animacje kamery i przejść. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (active) setReduce(v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => { active = false; sub.remove(); };
  }, []);
  return reduce;
}

export function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isScreenReaderEnabled().then((v) => { if (active) setOn(v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setOn);
    return () => { active = false; sub.remove(); };
  }, []);
  return on;
}

/** Komunikat dla czytnika ekranu (TalkBack / VoiceOver / aria-live na web). */
export function announce(text: string): void {
  if (!text) return;
  if (Platform.OS === 'web') {
    const el = typeof document !== 'undefined' ? document.getElementById('a11y-live') : null;
    if (el) { el.textContent = ''; setTimeout(() => { el.textContent = text; }, 50); return; }
  }
  AccessibilityInfo.announceForAccessibility(text);
}

/** Przeniesienie fokusu na element (nagłówek ekranu / wynik) po zmianie widoku. */
export function useFocusOnMount<T>(deps: unknown[] = []) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const node = ref.current as unknown as { focus?: () => void } | null;
      if (!node) return;
      if (Platform.OS === 'web') { node.focus?.(); return; }
      const handle = findNodeHandle(node as never);
      if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
    }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}
