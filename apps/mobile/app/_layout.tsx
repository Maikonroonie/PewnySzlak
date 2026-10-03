import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Platform, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useReduceMotion } from '../src/lib/a11y';
import { StoreProvider } from '../src/state/store';
import { colors } from '../src/theme';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

function LiveRegion() {
  if (Platform.OS !== 'web') return null;
  // aria-live dla komunikatów (announce) na web; poza ekranem, ale czytany przez czytniki.
  return <View nativeID="a11y-live" accessibilityLiveRegion="polite" role="status" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 }} />;
}

export default function RootLayout() {
  const reduceMotion = useReduceMotion();
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
                headerTintColor: colors.primary,
                headerTitleStyle: { color: colors.text, fontWeight: '700' },
                headerBackTitle: 'Wstecz',
                animation: reduceMotion ? 'none' : 'default',
                contentStyle: { backgroundColor: colors.bg },
                // Tytuł paska nie jest nagłówkiem – każdy ekran ma własny H1 z fokusem.
                headerTitle: ({ children }) => <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{children}</Text>,
              }}
            >
              <Stack.Screen name="index" options={{ title: 'PewnySzlak' }} />
              <Stack.Screen name="preferences" options={{ title: 'Moje preferencje' }} />
              <Stack.Screen name="route/index" options={{ title: 'Trasa' }} />
              <Stack.Screen name="route/text" options={{ title: 'Trasa – widok tekstowy' }} />
              <Stack.Screen name="route/guide" options={{ title: 'Prowadzenie' }} />
              <Stack.Screen name="route/segment/[id]" options={{ title: 'Szczegóły odcinka' }} />
              <Stack.Screen name="report" options={{ title: 'Zgłoś barierę' }} />
              <Stack.Screen name="barrier/[id]" options={{ title: 'Bariera' }} />
              <Stack.Screen name="assistant" options={{ title: 'Asystent' }} />
              <Stack.Screen name="sources" options={{ title: 'Źródła danych' }} />
              <Stack.Screen name="pick" options={{ title: 'Wskaż punkt na mapie' }} />
            </Stack>
          </StoreProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
