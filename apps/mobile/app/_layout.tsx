import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { LogBox, Platform, Pressable, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { focusRing } from '../src/components/ui';
import { useReduceMotion } from '../src/lib/a11y';
import { StoreProvider } from '../src/state/store';
import { colors } from '../src/theme';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

// MapLibre + RN-web w WebView (np. Messenger) miesza touch responder — szum, nie crash.
LogBox.ignoreLogs([
  'Cannot find single active touch',
  'Encountered two children with the same key',
]);

function LiveRegion() {
  if (Platform.OS !== 'web') return null;
  return <View nativeID="a11y-live" accessibilityLiveRegion="polite" role="status" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 }} />;
}

function silenceMapTouchNoise() {
  if (Platform.OS !== 'web' || typeof console === 'undefined') return;
  const orig = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const msg = args.map((a) => (typeof a === 'string' ? a : '')).join(' ');
    if (msg.includes('Cannot find single active touch')) return;
    if (msg.includes('Encountered two children with the same key')) return;
    orig(...args);
  };
  return () => { console.error = orig; };
}

function PickHeaderBack() {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Wróć do ekranu startowego"
      onPress={() => router.replace('/')}
      style={(st) => [{ paddingHorizontal: 8, paddingVertical: 8, minHeight: 44, justifyContent: 'center' }, focusRing(st)]}
      hitSlop={8}
    >
      <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>‹ Wstecz</Text>
    </Pressable>
  );
}

export default function RootLayout() {
  const reduceMotion = useReduceMotion();
  useEffect(() => silenceMapTouchNoise(), []);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StoreProvider>
            <StatusBar style="dark" />
            <LiveRegion />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: colors.bg },
                headerTintColor: colors.text,
                headerShadowVisible: false,
                headerTitleStyle: { color: colors.text, fontWeight: '700' },
                headerBackTitle: 'Wstecz',
                animation: reduceMotion ? 'none' : 'default',
                contentStyle: { backgroundColor: colors.bg },
                headerTitle: ({ children }) => <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{children}</Text>,
              }}
            >
              <Stack.Screen name="index" options={{ title: 'PewnySzlak', headerShown: false }} />
              <Stack.Screen name="explore" options={{ title: 'Odkryj okolice' }} />
              <Stack.Screen name="preferences" options={{ title: 'Moje preferencje' }} />
              <Stack.Screen name="route/index" options={{ title: 'Trasa', headerShown: false }} />
              <Stack.Screen name="route/text" options={{ title: 'Trasa – widok tekstowy' }} />
              <Stack.Screen name="route/guide" options={{ title: 'Prowadzenie' }} />
              <Stack.Screen name="route/segment/[id]" options={{ title: 'Szczegóły odcinka' }} />
              <Stack.Screen name="report" options={{ title: 'Zgłoś barierę' }} />
              <Stack.Screen name="barrier/[id]" options={{ title: 'Bariera' }} />
              <Stack.Screen name="assistant" options={{ title: 'Asystent' }} />
              <Stack.Screen name="sources" options={{ title: 'Źródła danych' }} />
              <Stack.Screen name="pick" options={{ title: 'Punkt na mapie', headerLeft: () => <PickHeaderBack /> }} />
            </Stack>
          </StoreProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
