import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getProfileSync } from '@/services';
import { useDecisions } from '@/store/decisions';
import { REPORT_REASONS, type ReportContext, type ReportReason } from '@/types';

export default function ReportScreen() {
  const { id, context, conversationId } = useLocalSearchParams<{
    id: string;
    context?: ReportContext;
    conversationId?: string;
  }>();
  const fromConversation = context === 'conversation';
  const router = useRouter();
  const theme = useTheme();
  const { report } = useDecisions();
  const [submitting, setSubmitting] = useState(false);

  const profile = getProfileSync(id);
  const name = profile?.name ?? 'this person';

  function submit(reason: ReportReason) {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    report(id, reason, fromConversation ? 'conversation' : 'profile', conversationId)
      .catch(() => {})
      .finally(() => {
        // Reporting blocks, so the conversation underneath this sheet is now
        // unreachable. Dismissing back onto it would show a dead screen, so
        // the list is where this has to land.
        if (fromConversation) {
          router.replace('/(tabs)/messages');
          return;
        }
        // Dismissing either way: a failed report must not look like it
        // vanished, but nor should the person be trapped in the sheet. A real
        // implementation retries in the background.
        router.back();
      });
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ThemedText type="small" themeColor="textSecondary">
        Reporting {name}
        {fromConversation ? ' and this conversation' : ''}. They will be blocked straight away and
        our moderation team will review the report. They are not told who reported them.
      </ThemedText>

      <View style={styles.reasons}>
        {REPORT_REASONS.map((reason) => (
          <PressableScale
            key={reason}
            onPress={() => submit(reason)}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel={`Report for ${reason}`}
            style={[
              styles.reason,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}>
            <ThemedText>{reason}</ThemedText>
          </PressableScale>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  reasons: {
    gap: Spacing.two,
  },
  reason: {
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
