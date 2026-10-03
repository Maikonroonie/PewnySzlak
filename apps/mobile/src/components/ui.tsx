import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type PressableProps, type PressableStateCallbackType, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';

/** Widoczny pierścień fokusu dla klawiatury (react-native-web przekazuje `focused`). */
export const focusRing = (st: PressableStateCallbackType): StyleProp<ViewStyle> => ((st as { focused?: boolean }).focused ? styles.focus : null);
import { colors, minTouch, radius, spacing } from '../theme';

type TextProps = { children: React.ReactNode; style?: StyleProp<TextStyle>; muted?: boolean; nativeID?: string; accessibilityRole?: 'header' | 'text'; numberOfLines?: number };

export const H1 = React.forwardRef<Text, TextProps>(function H1({ children, style, nativeID }, ref) {
  return <Text ref={ref} nativeID={nativeID} accessibilityRole="header" aria-level={1} accessible style={[styles.h1, style]}>{children}</Text>;
});
export const H2 = ({ children, style, nativeID }: TextProps) => <Text nativeID={nativeID} accessibilityRole="header" aria-level={2} style={[styles.h2, style]}>{children}</Text>;
export const P = ({ children, style, muted, numberOfLines }: TextProps) => <Text numberOfLines={numberOfLines} style={[styles.p, muted && { color: colors.textMuted }, style]}>{children}</Text>;
export const Small = ({ children, style, muted = true }: TextProps) => <Text style={[styles.small, muted && { color: colors.textMuted }, style]}>{children}</Text>;

type ButtonProps = PressableProps & { title: string; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; loading?: boolean; icon?: string; style?: StyleProp<ViewStyle> };
export function Button({ title, variant = 'primary', loading, icon, style, disabled, accessibilityLabel, ...rest }: ButtonProps) {
  const bg = variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : variant === 'secondary' ? colors.surface : 'transparent';
  const fg = variant === 'primary' || variant === 'danger' ? colors.primaryText : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }}
      disabled={disabled || loading}
      style={(st) => [styles.button, { backgroundColor: bg, borderColor: variant === 'secondary' || variant === 'ghost' ? colors.primary : bg }, (disabled || loading) && { opacity: 0.55 }, st.pressed && { opacity: 0.8 }, focusRing(st), style]}
      {...rest}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{icon ? `${icon} ` : ''}{title}</Text>}
    </Pressable>
  );
}

export function Card({ children, style, tone }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; tone?: 'ok' | 'warn' | 'danger' | 'info' }) {
  const border = tone === 'ok' ? colors.ok : tone === 'warn' ? colors.warn : tone === 'danger' ? colors.danger : tone === 'info' ? colors.info : colors.border;
  return <View style={[styles.card, { borderColor: border, borderLeftWidth: tone ? 6 : 1 }, style]}>{children}</View>;
}

export function Badge({ text, tone = 'info' }: { text: string; tone?: 'ok' | 'warn' | 'danger' | 'info' | 'muted' }) {
  const c = tone === 'ok' ? colors.ok : tone === 'warn' ? colors.warn : tone === 'danger' ? colors.danger : tone === 'muted' ? colors.textMuted : colors.info;
  return <View style={[styles.badge, { borderColor: c }]}><Text style={[styles.badgeText, { color: c }]}>{text}</Text></View>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: spacing(2) }}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Small>{hint}</Small> : null}
      {children}
    </View>
  );
}

export const Input = React.forwardRef<TextInput, TextInputProps>(function Input(props, ref) {
  return <TextInput ref={ref} placeholderTextColor={colors.textMuted} {...props} style={[styles.input, props.style]} />;
});

export function Row({ children, style, wrap }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; wrap?: boolean }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }, wrap && { flexWrap: 'wrap' }, style]}>{children}</View>;
}

export function Switch({ value, onChange, label, hint }: { value: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} aria-checked={value} accessibilityLabel={label} accessibilityHint={hint} onPress={() => onChange(!value)} style={(st) => [styles.switchRow, focusRing(st)]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.p}>{label}</Text>
        {hint ? <Small>{hint}</Small> : null}
      </View>
      <View style={[styles.switchTrack, value && { backgroundColor: colors.primary }]}>
        <Text style={[styles.switchText, value && { color: colors.primaryText }]}>{value ? 'TAK' : 'NIE'}</Text>
      </View>
    </Pressable>
  );
}

/** Wybór jednej z kilku wartości – zamiast suwaka (lepsza obsługa klawiaturą i czytnikiem). */
export function Choice<T extends string | number>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <View role="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1) }}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable key={String(o.value)} role="radio" accessibilityState={{ checked: selected, selected }} aria-checked={selected} accessibilityLabel={`${o.label}${selected ? ', wybrane' : ''}`} onPress={() => onChange(o.value)} style={(st) => [styles.chip, selected && { backgroundColor: colors.primary, borderColor: colors.primary }, focusRing(st)]}>
            <Text style={[styles.chipText, selected && { color: colors.primaryText }]}>{selected ? '● ' : '○ '}{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Notice({ tone, title, text }: { tone: 'ok' | 'warn' | 'danger' | 'info'; title: string; text?: string }) {
  const prefix = tone === 'ok' ? 'OK' : tone === 'warn' ? 'Uwaga' : tone === 'danger' ? 'Błąd' : 'Informacja';
  return (
    <Card tone={tone} style={{ marginBottom: spacing(1.5) }}>
      <Text accessibilityRole="alert" style={[styles.p, { fontWeight: '700' }]}>{prefix}: {title}</Text>
      {text ? <P>{text}</P> : null}
    </Card>
  );
}

export function Loading({ text = 'Wczytywanie…' }: { text?: string }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={text} style={{ padding: spacing(3), alignItems: 'center', gap: spacing(1) }}>
      <ActivityIndicator color={colors.primary} />
      <P muted>{text}</P>
    </View>
  );
}

export const styles = StyleSheet.create({
  h1: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: spacing(1) },
  h2: { fontSize: 19, fontWeight: '700', color: colors.text, marginTop: spacing(2), marginBottom: spacing(1) },
  p: { fontSize: 17, lineHeight: 24, color: colors.text },
  small: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  label: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 },
  button: { minHeight: minTouch, paddingHorizontal: spacing(2), paddingVertical: spacing(1.25), borderRadius: radius, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 17, fontWeight: '700' },
  focus: { outlineWidth: 3, outlineColor: colors.focus, outlineStyle: 'solid', borderColor: colors.focus } as ViewStyle,
  card: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius, padding: spacing(1.5), marginBottom: spacing(1) },
  badge: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontSize: 13, fontWeight: '700' },
  input: { minHeight: minTouch, borderWidth: 2, borderColor: colors.border, borderRadius: radius, paddingHorizontal: spacing(1.5), fontSize: 17, color: colors.text, backgroundColor: colors.bg },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), minHeight: minTouch, paddingVertical: spacing(1), borderRadius: radius },
  switchTrack: { minWidth: 64, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, borderWidth: 2, borderColor: colors.primary, alignItems: 'center' },
  switchText: { fontWeight: '800', color: colors.primary },
  chip: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 999, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.bg },
  chipText: { fontSize: 16, fontWeight: '600', color: colors.text },
});
