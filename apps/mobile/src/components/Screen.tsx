import React from 'react';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, tabBarHeight } from '../theme';
import { TabBar } from './TabBar';

/** Przewijany ekran z paddingiem i bezpiecznymi marginesami; główna treść oznaczona jako region „main”. */
export function Screen({ children, style, scroll = true, testID, chrome = true }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; scroll?: boolean; testID?: string; chrome?: boolean }) {
  const insets = useSafeAreaInsets();
  const bottom = (chrome ? tabBarHeight + 18 : 0) + insets.bottom + spacing(3);
  const inner = [{ padding: spacing(2.5), paddingBottom: bottom, maxWidth: 820, width: '100%' as const, alignSelf: 'center' as const }, style];
  const body = !scroll
    ? <View role="main" testID={testID} style={[{ flex: 1, backgroundColor: colors.bg }, inner]}>{children}</View>
    : <ScrollView role="main" testID={testID} style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={inner} keyboardShouldPersistTaps="handled">{children}</ScrollView>;
  return <View style={{ flex: 1, backgroundColor: colors.bg }}>{body}{chrome ? <TabBar /> : null}</View>;
}
