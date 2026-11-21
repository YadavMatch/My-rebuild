import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { APP_NAME } from '@/constants/app';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { FREE_DAILY_LIKES } from '@/types';

const PERKS = [
  { emoji: '💛', label: 'Unlimited likes' },
  { emoji: '🚀', label: 'Your likes shown first' },
  { emoji: '👀', label: 'See everyone who liked you' },
] as const;

/**
 * Shown when a free account runs out of likes.
 *
 * A real screen rather than `Alert.alert`, which is a no-op in
 * react-native-web — so on web the old version refused the like and told the
 * person nothing at all. This is also the one moment Premium is genuinely
 * worth mentioning, and a system alert is a poor place to do it.
 */
export default function PaywallScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [resetsIn, setResetsIn] = useState(() => timeUntilMidnight());

  // The countdown is the honest part of the offer: the likes do come back,
  // and saying when is more respectful than only showing the upsell.
  useEffect(() => {
    const timer = setInterval(() => setResetsIn(timeUntilMidnight()), 60_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.emoji} allowFontScaling={false}>
          💛
        </Text>

        <ThemedText style={styles.title} accessibilityRole="header">
          You&apos;re out of likes for today
        </ThemedText>

        <ThemedText style={[styles.body, { color: theme.textSecondary }]}>
          Free accounts get {FREE_DAILY_LIKES} likes a day. Yours come back in {resetsIn}.
        </ThemedText>

        <View style={[styles.perks, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText style={[styles.perksTitle, { color: theme.textSecondary }]}>
            WITH {APP_NAME.toUpperCase()} PREMIUM
          </ThemedText>
          {PERKS.map((perk) => (
            <View key={perk.label} style={styles.perk}>
              <Text style={styles.perkEmoji} allowFontScaling={false}>
                {perk.emoji}
              </Text>
              <ThemedText style={styles.perkLabel}>{perk.label}</ThemedText>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <PressableScale
            onPress={() => {
              // Replace, not push: backing out of Premium should return to
              // the deck, not to the sheet that sent you there.
              router.replace('/(tabs)/premium');
            }}
            accessibilityRole="button"
            accessibilityLabel={`See ${APP_NAME} Premium`}
            style={[styles.button, { backgroundColor: theme.accent }]}>
            <ThemedText style={[styles.primaryLabel, { color: theme.onAccent }]}>
              See Premium
            </ThemedText>
          </PressableScale>

          <PressableScale
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Wait for tomorrow"
            style={[styles.button, styles.secondary, { borderColor: theme.border }]}>
            <ThemedText style={[styles.secondaryLabel, { color: theme.textSecondary }]}>
              Wait for tomorrow
            </ThemedText>
          </PressableScale>
        </View>

        <ThemedText style={[styles.note, { color: theme.textSecondary }]}>
          {/* Billing is not wired up; saying so beats a button that does nothing. */}
          Premium is not on sale yet — this is a preview of what it will include.
        </ThemedText>
      </ScrollView>
    </View>
  );
}

/** Time until the local day rolls over, which is when the quota resets. */
function timeUntilMidnight(): string {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);

  const minutes = Math.max(0, Math.round((midnight.getTime() - now.getTime()) / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) {
    return `${rest} ${rest === 1 ? 'minute' : 'minutes'}`;
  }
  if (rest === 0) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  return `${hours}h ${rest}m`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
    alignItems: 'center',
  },
  emoji: { fontSize: 46, lineHeight: 56 },
  title: {
    fontFamily: Fonts.rounded,
    fontSize: 24,
    lineHeight: 31,
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
  perks: {
    alignSelf: 'stretch',
    borderRadius: Radius.xl,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  perksTitle: {
    fontFamily: Fonts.rounded,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  perk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  perkEmoji: { fontSize: 19, lineHeight: 25 },
  perkLabel: {
    fontFamily: Fonts.rounded,
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
  },
  actions: {
    alignSelf: 'stretch',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  button: {
    minHeight: 52,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  secondary: {
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  primaryLabel: {
    fontFamily: Fonts.rounded,
    fontSize: 17,
    fontWeight: '700',
  },
  secondaryLabel: {
    fontFamily: Fonts.rounded,
    fontSize: 17,
    fontWeight: '700',
  },
  note: {
    fontFamily: Fonts.rounded,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    textAlign: 'center',
    maxWidth: 320,
  },
});
