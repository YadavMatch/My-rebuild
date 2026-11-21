import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { APP_NAME } from '@/constants/app';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function InviteScreen() {
  const theme = useTheme();

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}>
      <ThemedText style={styles.title} accessibilityRole="header">
        Invite a friend
      </ThemedText>
      <ThemedText style={[styles.body, { color: theme.textSecondary }]}>
        Sharing an invite needs a backend to issue and track the link, so there is nothing to
        send yet. When it exists, this screen hands the link to the system share sheet.
      </ThemedText>

      <View style={[styles.notice, { backgroundColor: theme.accentPale }]}>
        <ThemedText style={[styles.noticeText, { color: theme.accent }]}>
          {APP_NAME} invites are coming soon.
        </ThemedText>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  title: {
    fontFamily: Fonts.rounded,
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '700',
  },
  body: {
    fontFamily: Fonts.rounded,
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '500',
  },
  notice: {
    borderRadius: Radius.lg,
    padding: Spacing.three,
  },
  noticeText: {
    fontFamily: Fonts.rounded,
    fontSize: 16,
    fontWeight: '700',
  },
});
