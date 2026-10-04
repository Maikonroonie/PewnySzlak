import React from 'react';
import { Feather } from '@expo/vector-icons';
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
const buttonIcons: Record<string, React.ComponentProps<typeof Feather>['name']> = { '➜': 'arrow-up-right', '⇅': 'repeat', '◎': 'navigation', '≡': 'align-left', '⚑': 'flag', '✎': 'message-circle', 'ⓘ': 'info', '⌖': 'crosshair', '▶': 'play', 'Ⅱ': 'pause' };

export function Button({ title, variant = 'primary', loading, icon, style, disabled, accessibilityLabel, ...rest }: ButtonProps) {
  const bg = variant === 'primary' ? '#111111' : variant === 'danger' ? colors.danger : variant === 'secondary' ? colors.paper : 'transparent';
  const fg = variant === 'primary' || variant === 'danger' ? '#FFFFFF' : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }}
      disabled={disabled || loading}
      style={(st) => [styles.button, { backgroundColor: bg, borderColor: variant === 'secondary' ? colors.border : bg }, (disabled || loading) && { opacity: 0.55 }, st.pressed && { opacity: 0.8 }, focusRing(st), style]}
      {...rest}
    >
      {loading ? <ActivityIndicator color={fg} /> : <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }}>{icon ? <Feather name={buttonIcons[icon] ?? 'arrow-right'} size={18} color={fg} /> : null}<Text style={[styles.buttonText, { color: fg }]}>{title}</Text></View>}
    </Pressable>
  );
}

export function Card({ children, style, tone }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; tone?: 'ok' | 'warn' | 'danger' | 'info' }) {
  const border = tone === 'ok' ? colors.ok : tone === 'warn' ? colors.warn : tone === 'danger' ? colors.danger : tone === 'info' ? colors.info : colors.border;
  return <View style={[styles.card, { borderColor: border, borderLeftWidth: tone ? 3 : 1 }, style]}>{children}</View>;
}

export function Badge({ text, tone = 'info' }: { text: string; tone?: 'ok' | 'warn' | 'danger' | 'info' | 'muted' }) {
  const c = tone === 'ok' ? colors.ok : tone === 'warn' ? colors.warn : tone === 'danger' ? colors.danger : tone === 'muted' ? colors.textMuted : colors.info;
  return <View style={[styles.badge, { borderColor: 'transparent', backgroundColor: tone === 'danger' ? '#FAEAE4' : tone === 'warn' ? '#F7EDDA' : tone === 'ok' ? '#E6EDE1' : colors.surface }]}><Text style={[styles.badgeText, { color: c }]}>{text}</Text></View>;
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
      <View style={[styles.switchTrack, value && { backgroundColor: '#111111', borderColor: '#111111' }]}>
        <Text style={[styles.switchText, value && { color: '#FFFFFF' }]}>{value ? 'TAK' : 'NIE'}</Text>
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
          <Pressable key={String(o.value)} role="radio" accessibilityState={{ checked: selected, selected }} aria-checked={selected} accessibilityLabel={`${o.label}${selected ? ', wybrane' : ''}`} onPress={() => onChange(o.value)} style={(st) => [styles.chip, selected && { backgroundColor: '#111111', borderColor: '#111111' }, focusRing(st)]}>
            <Text style={[styles.chipText, selected && { color: '#FFFFFF' }]}>{selected ? '● ' : '○ '}{o.label}</Text>
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
  h1: { fontSize: 30, letterSpacing: -0.8, fontWeight: '700', color: colors.text, marginBottom: spacing(1) },
  h2: { fontSize: 20, letterSpacing: -0.4, fontWeight: '700', color: colors.text, marginTop: spacing(2), marginBottom: spacing(1) },
  p: { fontSize: 17, lineHeight: 24, color: colors.text },
  small: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  label: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 },
  button: { minHeight: minTouch, paddingHorizontal: spacing(2), paddingVertical: spacing(1.25), borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 15, fontWeight: '700' },
  focus: { outlineWidth: 3, outlineColor: colors.focus, outlineStyle: 'solid', borderColor: colors.focus } as ViewStyle,
  card: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, borderRadius: radius, padding: spacing(2), marginBottom: spacing(1.5), shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  badge: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  input: { minHeight: 54, borderWidth: 1, borderColor: colors.border, borderRadius: radius, paddingHorizontal: spacing(1.5), fontSize: 17, color: colors.text, backgroundColor: colors.bg },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), minHeight: minTouch, paddingVertical: spacing(1), borderRadius: radius },
  switchTrack: { minWidth: 64, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, borderWidth: 2, borderColor: colors.border, alignItems: 'center' },
  switchText: { fontWeight: '800', color: colors.textMuted },
  chip: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.paper },
  chipText: { fontSize: 15, fontWeight: '700', color: colors.text },
});
