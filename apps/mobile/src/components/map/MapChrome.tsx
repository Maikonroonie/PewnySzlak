import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors } from '../../theme';
import { focusRing } from '../ui';

export function MapChrome({ threeD, onToggle, error }: { threeD: boolean; onToggle: () => void; error?: boolean }) {
  return <View pointerEvents="box-none" style={{ position: 'absolute', top: 16, left: 16, right: 62, flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={threeD ? 'Przełącz mapę na 2D' : 'Przełącz mapę na 3D'} onPress={onToggle} style={s => [{ minWidth: 58, minHeight: 48, paddingHorizontal: 12, borderRadius: 16, backgroundColor: colors.primary, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' }, focusRing(s)]}><Feather name="layers" size={16} color="white" /><Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>{threeD ? '3D' : '2D'}</Text></Pressable>
    {error ? <View accessibilityRole="alert" style={{ flex: 1, borderRadius: 14, padding: 10, backgroundColor: '#FFF9EB' }}><Text style={{ color: colors.warn, fontSize: 12 }}>Podkład mapy niedostępny. Skorzystaj z listy trasy.</Text></View> : null}
  </View>;
}
