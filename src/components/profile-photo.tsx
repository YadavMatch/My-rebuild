import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { gradientForId } from '@/constants/theme';

type Props = {
  /** Drives the gradient, so the same person always looks the same. */
  id: string;
  name: string;
  style?: StyleProp<ViewStyle>;
  /** Font size for the initial. Scales with the surface it sits on. */
  initialSize?: number;
  children?: React.ReactNode;
};

/**
 * Stands in for a profile photo.
 *
 * The app deliberately ships no stock portraits — using photos of real people
 * as fake profiles is the kind of thing that ends up in a news story. Replace
 * this with `expo-image` once profiles carry uploaded photos; nothing else
 * needs to change, because callers only pass an id and a name.
 */
export function ProfilePhoto({ id, name, style, initialSize = 120, children }: Props) {
  const [from, to] = gradientForId(id);

  return (
    <View style={[styles.container, style]}>
      <LinearGradient colors={[from, to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Text
        style={[styles.initial, { fontSize: initialSize }]}
        // The gradient is decoration; the name is always rendered as real text
        // elsewhere on screen, so this must not be announced twice.
        accessibilityElementsHidden
        importantForAccessibility="no"
        allowFontScaling={false}>
        {name.slice(0, 1).toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    color: 'rgba(255, 255, 255, 0.92)',
    fontWeight: '700',
  },
});
