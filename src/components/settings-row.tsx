import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();

  return (
    <View style={styles.section}>
      <ThemedText style={[styles.sectionTitle, { color: theme.textSecondary }]}>
        {title}
      </ThemedText>
      <View style={[styles.group, { backgroundColor: theme.backgroundElement }]}>{children}</View>
    </View>
  );
}

export function SettingsRow({
  emoji,
  label,
  onPress,
  destructive,
  last,
}: {
  emoji: string;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  last?: boolean;
}) {
  const theme = useTheme();

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}>
      <Text style={styles.emoji} allowFontScaling={false}>
        {emoji}
      </Text>
      <ThemedText
        style={[styles.label, destructive && { color: theme.danger }]}
        numberOfLines={2}>
        {label}
      </ThemedText>
      <ThemedText style={[styles.chevron, { color: theme.textSecondary }]}>›</ThemedText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  sectionTitle: {
    fontFamily: Fonts.rounded,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.2,
    paddingHorizontal: Spacing.one,
  },
  group: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    minHeight: 60,
  },
  emoji: {
    fontSize: 20,
    lineHeight: 26,
  },
  label: {
    flex: 1,
    fontFamily: Fonts.rounded,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
  },
  chevron: {
    fontSize: 22,
    fontWeight: '700',
  },
});
