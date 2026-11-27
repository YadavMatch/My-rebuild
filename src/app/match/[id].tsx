import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MatchEffects } from '@/components/match-effects';
import { PressableScale } from '@/components/pressable-scale';
import { ProfilePhoto } from '@/components/profile-photo';
import { EmptyState } from '@/components/screen-state';
import { ThemedText } from '@/components/themed-text';
import { BRAND_GRADIENT, Fonts, LOGO_FONT, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getCurrentUserSync, getProfileSync } from '@/services';

export default function MatchScreen() {
  const { id, conversationId } = useLocalSearchParams<{ id: string; conversationId?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const reducedMotion = useReducedMotion();

  const profile = getProfileSync(id);
  const me = getCurrentUserSync();

  // One haptic, at the moment the screen appears — not per animation step.
  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {
      // Off system-wide for many people and silent on most Android hardware.
      // The visual has to stand alone, and it does.
    });
  }, []);

  const mine = useSharedValue(0);
  const theirs = useSharedValue(0);
  const heart = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      mine.set(1);
      theirs.set(1);
      heart.set(1);
      return;
    }
    // A match carries momentum, so the avatars overshoot slightly as they
    // land. Bounce is right here and wrong almost everywhere else.
    const spring = { duration: 520, dampingRatio: 0.6 } as const;
    mine.set(withDelay(60, withSpring(1, spring)));
    theirs.set(withDelay(160, withSpring(1, spring)));
    heart.set(withDelay(380, withSpring(1, { duration: 440, dampingRatio: 0.5 })));
  }, [mine, theirs, heart, reducedMotion]);

  const mineStyle = useAnimatedStyle(() => ({
    opacity: mine.get(),
    transform: [
      { translateX: (1 - mine.get()) * -140 },
      { rotateZ: `${-8 + (1 - mine.get()) * -12}deg` },
    ],
  }));

  const theirsStyle = useAnimatedStyle(() => ({
    opacity: theirs.get(),
    transform: [
      { translateX: (1 - theirs.get()) * 140 },
      { rotateZ: `${8 + (1 - theirs.get()) * 12}deg` },
    ],
  }));

  const heartStyle = useAnimatedStyle(() => ({
    opacity: heart.get(),
    // Never scale from zero: nothing in the real world appears from nothing.
    transform: [{ scale: 0.6 + heart.get() * 0.4 }],
  }));

  const entrance = (delay: number) =>
    reducedMotion ? FadeIn.delay(delay).duration(240) : FadeInDown.delay(delay).duration(420);

  if (!profile) {
    return (
      <EmptyState
        emoji="💔"
        title="Match unavailable"
        body="We could not load this match. It may have been removed."
      />
    );
  }

  function openChat() {
    if (conversationId) {
      // Replace, not push: coming back from the chat should land on the deck,
      // not on a celebration for a match you have already seen.
      router.replace(`/chat/${conversationId}`);
      return;
    }
    router.back();
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={BRAND_GRADIENT}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.hero}>
          <View style={styles.avatars}>
            <MatchEffects reducedMotion={reducedMotion} />

            <Animated.View style={[styles.avatarWrap, mineStyle]}>
              <ProfilePhoto
                emoji={me.emoji}
                photoUrl={me.photoUrl}
                name={me.name}
                size={44}
                style={[styles.avatar, { borderColor: theme.backgroundElement }]}
              />
            </Animated.View>

            <Animated.View style={[styles.avatarWrap, styles.avatarRight, theirsStyle]}>
              <ProfilePhoto
                emoji={profile.emoji}
                photoUrl={profile.photoUrl}
                name={profile.name}
                size={44}
                style={[styles.avatar, { borderColor: theme.backgroundElement }]}
              />
            </Animated.View>

            <Animated.View
              style={[styles.heartBadge, { backgroundColor: theme.accent }, heartStyle]}>
              <Text style={styles.heartGlyph} allowFontScaling={false}>
                ♥
              </Text>
            </Animated.View>
          </View>

          <Animated.View entering={entrance(430)}>
            <ThemedText style={styles.headline} accessibilityRole="header">
              It&apos;s a match!
            </ThemedText>
          </Animated.View>

          <Animated.View entering={entrance(520)}>
            <ThemedText style={styles.subtitle}>
              You and {profile.name} liked each other.
            </ThemedText>
          </Animated.View>
        </View>

        <Animated.View entering={entrance(620)} style={styles.actions}>
          <PressableScale
            onPress={openChat}
            accessibilityRole="button"
            accessibilityLabel={`Send ${profile.name} a message`}
            style={[styles.button, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText style={[styles.primaryLabel, { color: theme.accent }]}>
              Send a message
            </ThemedText>
          </PressableScale>

          <PressableScale
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Keep swiping"
            style={[styles.button, styles.secondaryButton]}>
            <ThemedText style={styles.secondaryLabel}>Keep swiping</ThemedText>
          </PressableScale>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#241611',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    justifyContent: 'space-between',
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  avatars: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.four,
    minHeight: 150,
  },
  avatarWrap: {
    marginHorizontal: -Spacing.two,
  },
  avatarRight: {
    marginLeft: -Spacing.three,
  },
  avatar: {
    width: 130,
    height: 130,
    borderRadius: Radius.pill,
    borderWidth: 5,
  },
  heartBadge: {
    position: 'absolute',
    width: 54,
    height: 54,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#FFFFFF',
  },
  heartGlyph: {
    fontSize: 24,
    lineHeight: 30,
    color: '#FFFFFF',
  },
  headline: {
    fontFamily: LOGO_FONT,
    fontSize: 44,
    lineHeight: 64,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: Fonts.rounded,
    fontSize: 18,
    lineHeight: 25,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.92)',
    textAlign: 'center',
    maxWidth: 300,
  },
  actions: {
    gap: Spacing.two,
  },
  button: {
    minHeight: 54,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  secondaryButton: {
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.7)',
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
    color: '#FFFFFF',
  },
});
