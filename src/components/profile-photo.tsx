import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

type Props = {
  /** The profile's emoji, standing in for a photo. */
  emoji: string;
  name: string;
  style?: StyleProp<ViewStyle>;
  size?: number;
  /** Override the tint behind the emoji. Defaults to the card photo colour. */
  background?: string;
};

/**
 * Stands in for a profile photo.
 *
 * The app ships no stock portraits — using photographs of real people as
 * fake profiles is the kind of thing that ends up in a news story. Replace
 * this with `expo-image` once profiles carry uploads; callers pass an emoji
 * and a name, so nothing else has to change.
 */
export function ProfilePhoto({ emoji, name, style, size = 64, background }: Props) {
  const theme = useTheme();

  return (
    <View
      style={[styles.container, { backgroundColor: background ?? theme.photoBackground }, style]}
      // The emoji is decoration; the name is rendered as real text alongside.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Text style={{ fontSize: size }} allowFontScaling={false}>
        {emoji || name.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
