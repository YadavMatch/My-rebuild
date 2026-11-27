import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
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
  action,
}: {
  title: string;
  body: string;
  emoji?: string;
  /**
   * One way out of the empty state. Optional because most of them are
   * genuinely terminal — "nobody is left" is not something a button fixes.
   */
  action?: { label: string; onPress: () => void; disabled?: boolean };
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
      {action ? (
        <PressableScale
          onPress={action.onPress}
          disabled={action.disabled}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          accessibilityState={{ disabled: action.disabled }}
          style={[
            styles.action,
            { backgroundColor: action.disabled ? theme.border : theme.accent },
          ]}>
          <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
            {action.label}
          </ThemedText>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    minHeight: 48,
    paddingHorizontal: Spacing.four,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
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
