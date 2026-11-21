import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { APP_NAME } from '@/constants/app';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const BENEFITS = [
  { emoji: '💛', label: 'Unlimited likes' },
  { emoji: '👀', label: 'See everyone who liked you' },
  { emoji: '⚡', label: 'Daily 30-minute Profile Boost' },
  { emoji: '🚀', label: 'Priority placement in Discover' },
  { emoji: '✓', label: 'Browse verified profiles only' },
] as const;

export default function PremiumScreen() {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText style={styles.navTitle} accessibilityRole="header">
            {APP_NAME} Premium
          </ThemedText>

          <View style={styles.hero}>
            <Text style={styles.crown} allowFontScaling={false}>
              👑
            </Text>
            <ThemedText style={styles.headline}>Get more matches</ThemedText>
          </View>

          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            {BENEFITS.map((benefit) => (
              <View key={benefit.label} style={styles.benefit}>
                <Text style={styles.benefitEmoji} allowFontScaling={false}>
                  {benefit.emoji}
                </Text>
                <ThemedText style={styles.benefitLabel}>{benefit.label}</ThemedText>
              </View>
            ))}
          </View>

          {/*
            No purchase button, because there is nothing to buy: billing is
            not wired up. A button that took a tap and did nothing would be
            worse than saying so.
          */}
          <View style={[styles.notice, { backgroundColor: theme.accentPale }]}>
            <ThemedText style={[styles.noticeTitle, { color: theme.accent }]}>
              Launching soon
            </ThemedText>
            <ThemedText style={[styles.noticeBody, { color: theme.accent }]}>
              Premium memberships are coming to {APP_NAME} very soon. We&apos;ll let you know in
              the app the moment they are ready.
            </ThemedText>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.four,
  },
  navTitle: {
    fontFamily: Fonts.rounded,
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '700',
    textAlign: 'center',
    paddingTop: Spacing.two,
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.four,
  },
  crown: {
    fontSize: 64,
    lineHeight: 74,
  },
  headline: {
    fontFamily: Fonts.rounded,
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '700',
  },
  card: {
    borderRadius: Radius.card,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  benefit: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  benefitEmoji: {
    fontSize: 20,
    lineHeight: 27,
  },
  benefitLabel: {
    fontFamily: Fonts.rounded,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '700',
    flex: 1,
  },
  notice: {
    borderRadius: Radius.xl,
    padding: Spacing.four,
    gap: Spacing.two,
    alignItems: 'center',
  },
  noticeTitle: {
    fontFamily: Fonts.rounded,
    fontSize: 20,
    fontWeight: '700',
  },
  noticeBody: {
    fontFamily: Fonts.rounded,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '500',
    textAlign: 'center',
  },
});
