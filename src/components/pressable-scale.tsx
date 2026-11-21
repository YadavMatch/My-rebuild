import { useState } from 'react';
import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

type Props = PressableProps & {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

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

const styles = StyleSheet.create({
  base: {
    transform: [{ scale: 1 }],
    transitionProperty: 'transform',
    transitionDuration: '120ms',
    transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
});
