import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { Radius } from '@/constants/theme';

const PIECES = 18;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/** Brand colours, so the burst reads as part of the app rather than stock confetti. */
const COLOURS = ['#D1674A', '#3E8E80', '#F2DDD8', '#E8A87C', '#9C8168'];

/**
 * A one-shot confetti burst behind the matched avatars.
 *
 * A match is the rarest and best moment in the app, which is where the
 * delight budget belongs — this would be intolerable on a screen opened
 * fifty times a day. It animates `transform` and `opacity` only, runs
 * entirely on the UI runtime, and never re-renders React.
 */
export function MatchEffects({ reducedMotion }: { reducedMotion: boolean }) {
  if (reducedMotion) {
    // Reduced motion means fewer and gentler, and a burst radiating across
    // the screen is exactly what it asks us to drop.
    return null;
  }

  return (
    <View style={styles.container} pointerEvents="none">
      {Array.from({ length: PIECES }, (_, i) => (
        <Piece key={i} index={i} />
      ))}
    </View>
  );
}

function Piece({ index }: { index: number }) {
  const progress = useSharedValue(0);

  // Deterministic spread rather than Math.random, so the burst is identical
  // between runs and stable across re-renders.
  const angle = (index / PIECES) * Math.PI * 2;
  const distance = 110 + ((index * 53) % 130);
  const size = 8 + ((index * 7) % 8);
  const colour = COLOURS[index % COLOURS.length];
  const spin = index % 2 === 0 ? 220 : -220;

  useEffect(() => {
    // Writing a shared value from an effect is fine; writing during render
    // is not, because a re-render would replay the write.
    progress.set(
      withDelay(index * 22, withTiming(1, { duration: 1150, easing: EASE_OUT })),
    );
  }, [progress, index]);

  const style = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      opacity: interpolate(p, [0, 0.12, 0.65, 1], [0, 1, 0.9, 0]),
      transform: [
        { translateX: interpolate(p, [0, 1], [0, Math.cos(angle) * distance]) },
        // Slight downward bias at the end, so it falls rather than floating.
        { translateY: interpolate(p, [0, 1], [0, Math.sin(angle) * distance + 40]) },
        { rotateZ: `${interpolate(p, [0, 1], [0, spin])}deg` },
        { scale: interpolate(p, [0, 0.2, 1], [0.4, 1, 0.65]) },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.piece,
        {
          width: size,
          height: size * 1.6,
          backgroundColor: colour,
          borderRadius: index % 3 === 0 ? Radius.pill : 2,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    // Written out rather than spreading `absoluteFillObject`, which RN 0.88
    // no longer declares.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  piece: {
    position: 'absolute',
  },
});
