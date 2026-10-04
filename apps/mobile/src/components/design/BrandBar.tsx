import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors } from '../../theme';
import { focusRing } from '../ui';

export function BrandBar({ back = false }: { back?: boolean }) {
  const router = useRouter();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4, marginBottom: 12 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={back ? 'Wróć do planowania' : 'PewnySzlak — strona główna'} onPress={() => router.replace('/')} style={(s) => [{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, borderRadius: 16 }, focusRing(s)]}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#111111', alignItems: 'center', justifyContent: 'center' }}>
          <Feather name={back ? 'arrow-left' : 'activity'} size={18} color="#FFFFFF" />
        </View>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.6 }}>PewnySzlak</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Zmień preferencje trasy" onPress={() => router.push('/preferences')} style={(s) => [{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, focusRing(s)]}>
        <Feather name="sliders" size={18} color={colors.text} />
      </Pressable>
    </View>
  );
}
