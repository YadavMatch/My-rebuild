import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/screen-state';
import { ThemedText } from '@/components/themed-text';
import { APP_NAME } from '@/constants/app';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Placeholder legal text.
 *
 * These are honest stubs, not a policy. Shipping invented legal copy would
 * be worse than shipping none — a privacy policy has to describe what the
 * app actually does with data, which only you can write, and for a dating
 * app it is reviewed before the store will take it.
 */
const DOCS: Record<string, { title: string; body: string[] }> = {
  privacy: {
    title: 'Privacy Policy',
    body: [
      `This is a placeholder. ${APP_NAME} does not yet have a privacy policy, and one has to be written before the app can be submitted.`,
      'It must say what personal data is collected, why, how long it is kept, who it is shared with, and how someone exercises their rights over it. A dating app handles sensitive data, so this is checked closely by app stores and regulators.',
      'Right now the app stores your swipes, matches and messages on this device only. Nothing is sent anywhere, because there is no backend yet.',
    ],
  },
  terms: {
    title: 'Terms & Conditions',
    body: [
      `This is a placeholder. ${APP_NAME} does not yet have terms of service.`,
      'Real terms set out acceptable behaviour, what happens when someone breaks the rules, how accounts are ended, and the limits of your liability as the operator.',
      'Apple requires a dating app to have terms that cover objectionable content and a process for acting on reports.',
    ],
  },
  'data-request': {
    title: 'Data request / support',
    body: [
      'This is a placeholder for your support channel.',
      'People need a way to ask for a copy of their data, ask for it to be corrected or deleted, and report a problem with another person on the app.',
      'A real implementation puts a monitored email address or a support form here, and answers within the window your privacy policy promises.',
    ],
  },
};

export default function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const theme = useTheme();
  const content = DOCS[doc];

  if (!content) {
    return <EmptyState emoji="📄" title="Not found" body="That page does not exist." />;
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}>
      <ThemedText style={styles.title} accessibilityRole="header">
        {content.title}
      </ThemedText>

      <View style={[styles.notice, { backgroundColor: theme.accentPale }]}>
        <ThemedText style={[styles.noticeText, { color: theme.accent }]}>
          Placeholder text — not a real policy.
        </ThemedText>
      </View>

      {content.body.map((paragraph) => (
        <ThemedText key={paragraph.slice(0, 24)} style={styles.paragraph}>
          {paragraph}
        </ThemedText>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  title: {
    fontFamily: Fonts.rounded,
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '700',
  },
  notice: {
    borderRadius: Radius.lg,
    padding: Spacing.three,
  },
  noticeText: {
    fontFamily: Fonts.rounded,
    fontSize: 15,
    fontWeight: '700',
  },
  paragraph: {
    fontFamily: Fonts.rounded,
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '500',
  },
});
