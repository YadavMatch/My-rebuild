import { useEffect } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  interpolate,
} from 'react-native-reanimated';

import { Radius } from '@/constants/theme';

const HEART_COUNT = 7;
const ORB_COUNT = 3;

/**
 * Ambient motion for the welcome screen.
 *
 * This is the one place in the app with a real delight budget: it is seen
 * once, at first launch, so it can afford motion that would be intolerable
 * on a screen opened fifty times a day.
 *
 * Everything animates `transform` and `opacity` only — both are free, handled
 * entirely on the UI runtime, and never trigger a layout pass. Nothing here
 * re-renders React after mount.
 */
export function WelcomeEffects() {
  const reducedMotion = useReducedMotion();

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: ORB_COUNT }, (_, i) => (
        <Orb key={`orb-${i}`} index={i} reducedMotion={reducedMotion} />
      ))}
      {Array.from({ length: HEART_COUNT }, (_, i) => (
        <Heart key={`heart-${i}`} index={i} reducedMotion={reducedMotion} />
      ))}
    </View>
  );
}

/** A soft blob of colour that drifts slowly behind the content. */
function Orb({ index, reducedMotion }: { index: number; reducedMotion: boolean }) {
  const { width, height } = useWindowDimensions();
  const progress = useSharedValue(0);

  const size = width * (0.7 + index * 0.25);
  const left = index % 2 === 0 ? -size * 0.35 : width - size * 0.65;
  const top = height * (0.1 + index * 0.28);

  useEffect(() => {
    if (reducedMotion) {
      return;
    }
    // Writing a shared value from an effect is fine. Writing one during
    // render is not — a re-render would replay the write.
    progress.set(
      withRepeat(
        withTiming(1, { duration: 9000 + index * 2500, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      ),
    );
  }, [progress, index, reducedMotion]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(progress.get(), [0, 1], [0, index % 2 === 0 ? 40 : -40]) },
      { translateY: interpolate(progress.get(), [0, 1], [0, index % 2 === 0 ? -50 : 35]) },
      { scale: interpolate(progress.get(), [0, 1], [1, 1.12]) },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.orb,
        {
          width: size,
          height: size,
          left,
          top,
          borderRadius: size / 2,
          backgroundColor: ORB_COLOURS[index % ORB_COLOURS.length],
        },
        style,
      ]}
    />
  );
}

const ORB_COLOURS = ['rgba(255, 92, 138, 0.45)', 'rgba(124, 77, 255, 0.38)', 'rgba(255, 159, 67, 0.3)'];

/** A heart that rises up the screen and fades out, then starts again. */
function Heart({ index, reducedMotion }: { index: number; reducedMotion: boolean }) {
  const { height } = useWindowDimensions();
  const progress = useSharedValue(0);

  // Deterministic spread rather than Math.random, so the layout is stable
  // across re-renders and identical between runs.
  const left = ((index * 37) % 80) + 8;
  const size = 14 + ((index * 13) % 18);
  const duration = 7000 + ((index * 1300) % 4000);

  useEffect(() => {
    if (reducedMotion) {
      return;
    }
    progress.set(
      withDelay(
        index * 900,
        withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false),
      ),
    );
  }, [progress, index, duration, reducedMotion]);

  const style = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      opacity: interpolate(p, [0, 0.12, 0.75, 1], [0, 0.75, 0.55, 0]),
      transform: [
        { translateY: interpolate(p, [0, 1], [height * 0.25, -height * 0.5]) },
        // A gentle sway, so they do not rise in straight lines.
        { translateX: interpolate(p, [0, 0.5, 1], [0, index % 2 === 0 ? 22 : -22, 0]) },
        { scale: interpolate(p, [0, 0.2, 1], [0.7, 1, 0.85]) },
      ],
    };
  });

  if (reducedMotion) {
    return null;
  }

  return (
    <Animated.View style={[styles.heart, { left: `${left}%`, bottom: 0 }, style]}>
      <Text style={{ fontSize: size, color: 'rgba(255,255,255,0.9)' }} allowFontScaling={false}>
        ♥
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  orb: {
    position: 'absolute',
    // A large, very soft shape. No blur filter: blurring on Android
    // re-renders every frame, and a translucent circle reads the same here.
    opacity: 0.85,
    borderCurve: 'continuous',
  },
  heart: {
    position: 'absolute',
    borderRadius: Radius.pill,
  },
});
