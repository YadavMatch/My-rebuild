import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function ScreenLoading({ label = 'Loading' }: { label?: string }) {
  const theme = useTheme();

  return (
    <View style={styles.centred}>
      <ActivityIndicator color={theme.accent} accessibilityLabel={label} />
    </View>
  );
}

export function EmptyState({
  title,
  body,
  emoji,
}: {
  title: string;
  body: string;
  emoji?: string;
}) {
  const theme = useTheme();

  return (
    <View style={styles.centred}>
      {emoji ? (
        <Text style={styles.emoji} allowFontScaling={false}>
          {emoji}
        </Text>
      ) : null}
      <ThemedText style={styles.title}>{title}</ThemedText>
      <ThemedText style={[styles.body, { color: theme.textSecondary }]}>{body}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.two,
  },
  emoji: {
    fontSize: 44,
    lineHeight: 52,
    marginBottom: Spacing.two,
  },
  title: {
    fontFamily: Fonts.rounded,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    fontFamily: Fonts.rounded,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '500',
    textAlign: 'center',
    maxWidth: 320,
  },
});
