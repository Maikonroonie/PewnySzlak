import { Feather } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../state/store';
import { colors, minTouch } from '../theme';
import { focusRing } from './ui';

type Item = { href: string; icon: React.ComponentProps<typeof Feather>['name']; label: string; needsRoute?: boolean; needsOrigin?: boolean };

const ITEMS: Item[] = [
  { href: '/explore', icon: 'compass', label: 'Odkryj', needsOrigin: true },
  { href: '/route', icon: 'navigation', label: 'Trasa', needsRoute: true },
  { href: '/route/guide', icon: 'crosshair', label: 'GPS', needsRoute: true },
  { href: '/assistant', icon: 'message-circle', label: 'Czat' },
  { href: '/preferences', icon: 'sliders', label: 'Ja' },
];

function active(path: string, href: string) {
  if (href === '/explore') return path === '/explore' || path.startsWith('/explore');
  if (href === '/route') return path === '/route' || path === '/route/text' || path.startsWith('/route/segment');
  return path === href || path.startsWith(`${href}/`);
}

export function TabBar() {
  const path = usePathname();
  const router = useRouter();
  const { route, origin } = useStore();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom: Math.max(insets.bottom, 10), alignItems: 'center' }}>
      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          maxWidth: 440,
          backgroundColor: 'rgba(255,255,255,0.94)',
          borderRadius: 36,
          paddingHorizontal: 8,
          paddingVertical: 6,
          borderWidth: 1,
          borderColor: 'rgba(0,0,0,0.06)',
          shadowColor: '#000',
          shadowOpacity: 0.12,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 10 },
          elevation: 12,
        }}
      >
        {ITEMS.map((it) => {
          const on = active(path, it.href);
          const disabled = !!(it.needsRoute && !route) || !!(it.needsOrigin && !origin);
          return (
            <Pressable
              key={it.href}
              accessibilityRole="tab"
              accessibilityState={{ selected: on, disabled }}
              accessibilityLabel={it.label}
              disabled={disabled}
              onPress={() => router.push(it.href as '/')}
              style={(st) => [{ minWidth: minTouch, minHeight: minTouch + 4, paddingHorizontal: 8, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? '#111111' : 'transparent', opacity: disabled ? 0.35 : 1 }, focusRing(st)]}
            >
              <Feather name={it.icon} size={18} color={on ? '#FFFFFF' : colors.text} />
              <Text style={{ fontSize: 10, fontWeight: '700', marginTop: 2, color: on ? '#FFFFFF' : colors.textMuted }}>{it.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
