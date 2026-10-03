import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { RouteResult } from '@pewnyszlak/domain';

export function useRoutePreview(route: RouteResult | null, reduceMotion: boolean) {
  const [progress, setProgress] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  useEffect(() => { setProgress(null); setPlaying(false); }, [route?.id]);
  useEffect(() => { if (reduceMotion) setPlaying(false); }, [reduceMotion]);
  useEffect(() => {
    const app = AppState.addEventListener('change', s => { if (s !== 'active') setPlaying(false); });
    const visibility = () => { if (document.hidden) setPlaying(false); };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visibility);
    return () => { app.remove(); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', visibility); };
  }, []);
  useEffect(() => {
    if (!playing || !route || reduceMotion) return;
    const duration = Math.max(24, Math.min(90, route.distanceM / 45));
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now(), delta = Math.min(250, now - last); last = now;
      setProgress(p => Math.min(1, (p ?? 0) + delta / 1000 / duration * speed));
    }, 100);
    return () => clearInterval(timer);
  }, [playing, route?.id, route?.distanceM, reduceMotion, speed]);
  useEffect(() => { if (progress === 1) setPlaying(false); }, [progress]);
  return {
    progress, playing, speed,
    toggle: () => { if (!playing && !reduceMotion) { if (progress == null || progress >= 1) setProgress(0); setPlaying(true); } else setPlaying(false); },
    pause: () => setPlaying(false),
    seek: (p: number) => { setPlaying(false); setProgress(Math.max(0, Math.min(1, p))); },
    reset: () => { setPlaying(false); setProgress(null); },
    changeSpeed: () => setSpeed(s => s === 1 ? 2 : 1),
  };
}
