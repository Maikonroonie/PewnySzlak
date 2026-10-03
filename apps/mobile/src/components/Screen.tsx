import React from 'react';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';

/** Przewijany ekran z paddingiem i bezpiecznymi marginesami; główna treść oznaczona jako region „main”. */
export function Screen({ children, style, scroll = true, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; scroll?: boolean; testID?: string }) {
  const insets = useSafeAreaInsets();
  const inner = [{ padding: spacing(2.5), paddingBottom: insets.bottom + spacing(3), maxWidth: 1280, width: '100%' as const, alignSelf: 'center' as const }, style];
  if (!scroll) return <View role="main" testID={testID} style={[{ flex: 1, backgroundColor: colors.bg }, inner]}>{children}</View>;
  return (
    <ScrollView role="main" testID={testID} style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={inner} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}
