import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors } from '../../theme';
import { focusRing } from '../ui';

export function BrandBar({ back = false }: { back?: boolean }) {
  const router = useRouter();
  return <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, marginBottom: 20 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={back ? 'Wróć do planowania' : 'PewnySzlak — strona główna'} onPress={() => router.replace('/')} style={s => [{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, borderRadius: 14 }, focusRing(s)]}>
      <View style={{ width: 43, height: 43, borderRadius: 15, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}><Feather name={back ? 'arrow-left' : 'navigation'} size={23} color="white" /></View>
      <View><Text style={{ color: colors.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.7 }}>pewny<Text style={{ fontWeight: '400' }}>szlak</Text><Text style={{ color: colors.primary }}>.</Text></Text><Text style={{ fontSize: 10, letterSpacing: 2.1, color: colors.textMuted }}>MIASTO W TWOIM TEMPIE</Text></View>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Otwórz ustawienia" onPress={() => router.push('/preferences')} style={s => [{ width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' }, focusRing(s)]}><Feather name="sliders" size={20} color={colors.primary} /></Pressable>
  </View>;
}
