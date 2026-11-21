import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { WelcomeEffects } from '@/components/welcome-effects';
import { APP_NAME, APP_TAGLINE } from '@/constants/app';
import { BRAND_GRADIENT, Fonts, LOGO_FONT, Radius, Spacing } from '@/constants/theme';
import { useDecisions } from '@/store/decisions';

export default function WelcomeScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { state, completeWelcome } = useDecisions();

  // Reduced motion keeps the fade — it explains that content arrived — and
  // drops the upward travel.
  const entrance = (delay: number) =>
    reducedMotion ? FadeIn.delay(delay).duration(240) : FadeInDown.delay(delay).duration(420);

  function enter() {
    completeWelcome().catch(() => {});
    router.replace('/(tabs)');
  }

  // Deep-linking straight to /welcome must not skip the age gate.
  if (state.hydrated && state.underageBlockedAt) {
    return <Redirect href="/underage" />;
  }
  if (state.hydrated && !state.ageConfirmedAt) {
    return <Redirect href="/age-gate" />;
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={BRAND_GRADIENT}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <WelcomeEffects />

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.hero}>
          <Animated.View entering={entrance(80)}>
            <Image
              source={require('@/assets/images/heart-mark.png')}
              style={styles.logoMark}
              contentFit="contain"
              accessibilityLabel={`${APP_NAME} logo`}
            />
          </Animated.View>

          <Animated.View entering={entrance(200)}>
            <ThemedText style={styles.title} accessibilityRole="header">
              {APP_NAME}
            </ThemedText>
          </Animated.View>

          <Animated.View entering={entrance(320)}>
            <ThemedText style={styles.tagline}>{APP_TAGLINE}</ThemedText>
          </Animated.View>
        </View>

        {/*
          A scrim under the buttons. The rising hearts pass behind this area,
          and without it one drifting across a label reads as a rendering
          glitch rather than as ambience.
        */}
        <LinearGradient
          colors={['transparent', 'rgba(20, 10, 7, 0.45)']}
          style={styles.actionsScrim}
          pointerEvents="none"
        />

        <Animated.View entering={entrance(460)} style={styles.actions}>
          <PressableScale
            onPress={enter}
            accessibilityRole="button"
            accessibilityLabel="Create an account"
            style={[styles.button, styles.primaryButton]}>
            <ThemedText type="smallBold" style={styles.primaryLabel}>
              Create an account
            </ThemedText>
          </PressableScale>

          <PressableScale
            onPress={enter}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
            style={[styles.button, styles.secondaryButton]}>
            <ThemedText type="smallBold" style={styles.secondaryLabel}>
              I already have an account
            </ThemedText>
          </PressableScale>

          <PressableScale
            onPress={enter}
            accessibilityRole="button"
            accessibilityLabel="Skip for now and look around"
            style={styles.skip}>
            <ThemedText type="small" style={styles.skipLabel}>
              Skip for now
            </ThemedText>
          </PressableScale>

          <ThemedText type="small" style={styles.legal}>
            {/*
              Neither button signs anyone in yet — there is no auth. Both go
              straight to the app, and the copy below says so rather than
              implying an account exists.
            */}
            Accounts are not wired up yet, so all three buttons just open the app.
          </ThemedText>
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
  logoMark: {
    width: 132,
    height: 132,
  },
  title: {
    fontFamily: LOGO_FONT,
    fontSize: 46,
    lineHeight: 68,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  tagline: {
    fontFamily: Fonts.rounded,
    fontWeight: '600',
    fontSize: 17,
    lineHeight: 24,
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
    maxWidth: 300,
  },
  actionsScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 320,
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
  primaryButton: {
    backgroundColor: '#ffffff',
  },
  primaryLabel: {
    fontFamily: Fonts.rounded,
    color: '#D1674A',
    fontSize: 16,
  },
  secondaryButton: {
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.6)',
  },
  secondaryLabel: {
    fontFamily: Fonts.rounded,
    color: '#FFFFFF',
    fontSize: 16,
  },
  skip: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipLabel: {
    color: 'rgba(255, 255, 255, 0.8)',
    textDecorationLine: 'underline',
  },
  legal: {
    color: 'rgba(255, 255, 255, 0.75)',
    textAlign: 'center',
    paddingHorizontal: Spacing.three,
  },
});
