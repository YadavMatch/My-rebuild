import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Prompt } from '@/types';

export function PromptCard({ prompt }: { prompt: Prompt }) {
  const theme = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="small" themeColor="textSecondary">
        {prompt.question}
      </ThemedText>
      <ThemedText style={styles.answer}>{prompt.answer}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.four,
    borderRadius: Radius.lg,
    gap: Spacing.two,
  },
  answer: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '600',
  },
});
