import { useState } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { css, cubicBezier } from 'react-native-reanimated';

type Props = PressableProps & {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

/**
 * easeOutQuint. Must be the `cubicBezier` object, not the CSS string:
 * Reanimated's `transitionTimingFunction` accepts a predefined name
 * ('linear', 'ease-out', …) or a parametrized easing, and a string like
 * 'cubic-bezier(0.23, 1, 0.32, 1)' is read as a name, so it fails the
 * lookup at render time instead of being parsed.
 */
const EASE_OUT_QUINT = cubicBezier(0.23, 1, 0.32, 1);

/**
 * Press feedback for anything tappable.
 *
 * A CSS transition rather than a shared value: this fires twice per press,
 * not once per frame, so `setState` is the right tool and a worklet would be
 * over-engineering. 120ms and 3% is the ceiling for something touched this
 * often — longer or larger starts to feel sluggish.
 */
export function PressableScale({ style, children, ...rest }: Props) {
  const [pressed, setPressed] = useState(false);

  return (
    <Pressable
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      hitSlop={12}
      pressRetentionOffset={16}
      {...rest}>
      <Animated.View style={[styles.base, pressed && styles.pressed, style]}>{children}</Animated.View>
    </Pressable>
  );
}

// `css.create`, not `StyleSheet.create`: a Reanimated easing object is not
// assignable to React Native's own `transitionTimingFunction`, which is typed
// `string | Function`. This is the stylesheet that owns these properties.
const styles = css.create({
  base: {
    transform: [{ scale: 1 }],
    transitionProperty: 'transform',
    transitionDuration: '120ms',
    transitionTimingFunction: EASE_OUT_QUINT,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
});
