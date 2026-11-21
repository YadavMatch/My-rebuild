import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** The teal check shown beside a verified person's name. */
export function VerifiedBadge({ size = 22, label }: { size?: number; label?: string }) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.check,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.verified },
      ]}
      accessibilityRole="image"
      accessibilityLabel={label ?? 'Verified profile'}>
      <Text style={[styles.checkGlyph, { fontSize: size * 0.55 }]} allowFontScaling={false}>
        ✓
      </Text>
    </View>
  );
}

type PillProps = {
  label: string;
  /** `filled` for the primary state, `outline` for a secondary one. */
  variant?: 'filled' | 'outline' | 'tinted';
  /** Base colour. Defaults to the accent. */
  colour?: string;
  glyph?: string;
  style?: StyleProp<ViewStyle>;
};

/** The small rounded labels in the header and across the app. */
export function Pill({ label, variant = 'outline', colour, glyph, style }: PillProps) {
  const theme = useTheme();
  const base = colour ?? theme.accent;

  const palette =
    variant === 'filled'
      ? { backgroundColor: base, borderColor: base, textColor: theme.onAccent }
      : variant === 'tinted'
        ? { backgroundColor: theme.accentPale, borderColor: 'transparent', textColor: base }
        : { backgroundColor: 'transparent', borderColor: base, textColor: base };

  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: palette.backgroundColor, borderColor: palette.borderColor },
        style,
      ]}>
      <ThemedText style={[styles.pillLabel, { color: palette.textColor }]} numberOfLines={1}>
        {glyph ? `${glyph} ${label}` : label}
      </ThemedText>
    </View>
  );
}

/** An outlined interest tag, as shown under a profile's bio. */
export function InterestChip({ label }: { label: string }) {
  const theme = useTheme();

  return (
    <View style={[styles.chip, { borderColor: theme.border }]}>
      <ThemedText style={[styles.chipLabel, { color: theme.textSecondary }]}>{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  check: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkGlyph: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  pill: {
    minHeight: 38,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
    borderRadius: Radius.pill,
    borderWidth: 1.5,
  },
  pillLabel: {
    fontFamily: Fonts.rounded,
    fontSize: 15,
    fontWeight: '700',
  },
  chip: {
    minHeight: 38,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
    borderRadius: Radius.pill,
    borderWidth: 1.5,
  },
  chipLabel: {
    fontFamily: Fonts.rounded,
    fontSize: 15,
    fontWeight: '600',
  },
});
