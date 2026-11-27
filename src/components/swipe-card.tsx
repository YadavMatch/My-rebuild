import * as Haptics from 'expo-haptics';
import { forwardRef, useImperativeHandle } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { InterestChip, VerifiedBadge } from '@/components/badges';
import { ThemedText } from '@/components/themed-text';
import { ProfilePhoto } from '@/components/profile-photo';
import { project } from '@/components/worklets';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import type { Decision, Profile } from '@/types';

/** Fraction of the screen width a projected swipe must pass to commit. */
const COMMIT_FRACTION = 0.28;
/** Degrees the card tilts at a full-width swipe. */
const MAX_TILT = 12;

export type SwipeCardHandle = {
  /** Plays the exit animation and then reports the decision, as a real swipe does. */
  swipe: (decision: Decision) => void;
};

type Props = {
  profile: Profile;
  /** Called once the card has left the screen. */
  onDecision: (profile: Profile, decision: Decision) => void;
  onOpenProfile: (profileId: string) => void;
  colors: typeof Colors.light | typeof Colors.dark;
};

export const SwipeCard = forwardRef<SwipeCardHandle, Props>(function SwipeCard(
  { profile, onDecision, onOpenProfile, colors },
  ref,
) {
  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();

  const x = useSharedValue(0);
  const y = useSharedValue(0);
  // Captured at gesture start so grabbing a card mid-spring continues from
  // where it is on screen instead of teleporting back to zero.
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  // Only used on the reduced-motion path, where the card fades instead of flying.
  const opacityOverride = useSharedValue(1);

  const commitDistance = width * COMMIT_FRACTION;

  /**
   * Sends the card off screen and reports the decision when it lands.
   *
   * Shared values are written here from the RN runtime, which is allowed —
   * only reading or writing during render is not.
   */
  function runExit(decision: Decision, velocityX = 0) {
    const direction = decision === 'like' ? 1 : -1;
    const target = direction * width * 1.5;

    // The haptic fires now, in the same frame as the commit, rather than when
    // the animation finishes — feedback that lags its cause reads as a glitch.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
      // Haptics are unavailable on plenty of hardware and off system-wide for
      // many people. The animation is the real feedback.
    });

    if (reducedMotion) {
      // Fewer and gentler: no fling across the screen, just a short fade out.
      opacityOverride.set(
        withTiming(0, { duration: 160 }, (finished) => {
          'worklet';
          if (finished) {
            scheduleOnRN(onDecision, profile, decision);
          }
        }),
      );
      return;
    }

    const settle = { duration: 320, dampingRatio: 1, overshootClamping: true } as const;

    if (decision === 'superlike') {
      y.set(
        withSpring(-height * 1.2, { ...settle, velocity: -1200 }, (finished) => {
          'worklet';
          if (finished) {
            scheduleOnRN(onDecision, profile, decision);
          }
        }),
      );
      return;
    }

    x.set(
      withSpring(target, { ...settle, velocity: velocityX }, (finished) => {
        'worklet';
        if (finished) {
          scheduleOnRN(onDecision, profile, decision);
        }
      }),
    );
  }

  useImperativeHandle(ref, () => ({
    swipe: (decision: Decision) => runExit(decision),
  }));

  const pan = usePanGesture({
    // Declaring the axis matters: without it this handler competes with
    // vertical scrolling and the whole screen feels broken.
    activeOffsetX: [-12, 12],
    failOffsetY: [-80, 80],
    onActivate: () => {
      'worklet';
      startX.set(x.get());
      startY.set(y.get());
    },
    onUpdate: (event) => {
      'worklet';
      x.set(startX.get() + event.translationX);
      // Vertical movement is damped — this is a horizontal interaction and
      // letting the card roam freely up and down feels loose.
      y.set(startY.get() + event.translationY * 0.35);
    },
    onDeactivate: (event) => {
      'worklet';
      if (event.canceled) {
        x.set(withSpring(0, { duration: 300, dampingRatio: 0.8 }));
        y.set(withSpring(0, { duration: 300, dampingRatio: 0.8 }));
        return;
      }

      // Velocity decides, not distance alone: a quick flick commits even a
      // short way across, which is what makes the deck feel responsive.
      const projected = x.get() + project(event.velocityX);

      if (projected > commitDistance) {
        scheduleOnRN(runExit, 'like', event.velocityX);
        return;
      }
      if (projected < -commitDistance) {
        scheduleOnRN(runExit, 'pass', event.velocityX);
        return;
      }

      // Snapped home. Velocity is handed to the spring so there is no seam
      // between the finger lifting and the animation taking over.
      x.set(withSpring(0, { duration: 300, dampingRatio: 0.8, velocity: event.velocityX }));
      y.set(withSpring(0, { duration: 300, dampingRatio: 0.8, velocity: event.velocityY }));
    },
  });

  const cardStyle = useAnimatedStyle(() => {
    const tilt = reducedMotion
      ? 0
      : interpolate(x.get(), [-width, 0, width], [-MAX_TILT, 0, MAX_TILT], Extrapolation.CLAMP);

    return {
      opacity: opacityOverride.get(),
      transform: [{ translateX: x.get() }, { translateY: y.get() }, { rotateZ: `${tilt}deg` }],
    };
  });

  // Both badges derive from the same shared value, so they are always in sync
  // with the card and cost nothing extra.
  const likeBadgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.get(), [0, commitDistance], [0, 1], Extrapolation.CLAMP),
  }));

  const passBadgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.get(), [-commitDistance, 0], [1, 0], Extrapolation.CLAMP),
  }));

  const prompt = profile.prompts[0];

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[styles.card, { backgroundColor: colors.backgroundElement }, cardStyle]}>
        <View style={[styles.photo, { backgroundColor: colors.photoBackground }]}>
          <ProfilePhoto
            emoji={profile.emoji}
            photoUrl={profile.photoUrl}
            name={profile.name}
            size={88}
            style={styles.photoInner}
            background="transparent"
          />
        </View>

        <Animated.View
          style={[styles.badge, styles.likeBadge, { borderColor: colors.like }, likeBadgeStyle]}
          pointerEvents="none">
          <ThemedText style={[styles.badgeText, { color: colors.like }]}>LIKE</ThemedText>
        </Animated.View>

        <Animated.View
          style={[styles.badge, styles.passBadge, { borderColor: colors.pass }, passBadgeStyle]}
          pointerEvents="none">
          <ThemedText style={[styles.badgeText, { color: colors.pass }]}>PASS</ThemedText>
        </Animated.View>

        <Pressable
          onPress={() => onOpenProfile(profile.id)}
          accessibilityRole="button"
          accessibilityLabel={`Open ${profile.name}'s full profile`}
          style={styles.body}>
          <View style={styles.nameRow}>
            <ThemedText style={styles.name}>
              {profile.name}
              <ThemedText style={[styles.age, { color: colors.textSecondary }]}>
                , {profile.age}
              </ThemedText>
            </ThemedText>
            {profile.verified ? (
              <VerifiedBadge label={`${profile.name} is verified`} />
            ) : null}
          </View>

          <ThemedText style={[styles.proximity, { color: colors.textSecondary }]}>
            {profile.proximity}
          </ThemedText>

          <ThemedText style={styles.bio} numberOfLines={2}>
            {profile.bio}
          </ThemedText>

          {prompt ? (
            <View style={[styles.prompt, { borderColor: colors.border }]}>
              <ThemedText style={[styles.promptQuestion, { color: colors.textSecondary }]}>
                {prompt.question}
              </ThemedText>
              <ThemedText style={styles.promptAnswer} numberOfLines={2}>
                {prompt.answer}
              </ThemedText>
            </View>
          ) : null}

          <View style={styles.chips}>
            {profile.interests.slice(0, 3).map((interest) => (
              <InterestChip key={interest} label={interest} />
            ))}
          </View>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: Radius.card,
    overflow: 'hidden',
  },
  photo: {
    height: 165,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoInner: {
    width: '100%',
    height: '100%',
  },
  body: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.two,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  name: {
    fontFamily: Fonts.rounded,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
  },
  age: {
    fontFamily: Fonts.rounded,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '600',
  },
  proximity: {
    fontFamily: Fonts.rounded,
    fontSize: 15,
    fontWeight: '600',
    marginTop: -Spacing.one,
  },
  bio: {
    fontFamily: Fonts.rounded,
    fontSize: 17,
    lineHeight: 24,
  },
  prompt: {
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  promptQuestion: {
    fontFamily: Fonts.rounded,
    fontSize: 15,
    fontWeight: '600',
  },
  promptAnswer: {
    fontFamily: Fonts.rounded,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '700',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  badge: {
    position: 'absolute',
    top: Spacing.three,
    borderWidth: 3,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    zIndex: 2,
  },
  likeBadge: {
    left: Spacing.three,
    transform: [{ rotateZ: '-12deg' }],
  },
  passBadge: {
    right: Spacing.three,
    transform: [{ rotateZ: '12deg' }],
  },
  badgeText: {
    fontFamily: Fonts.rounded,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 2,
  },
});
