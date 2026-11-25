import { Image } from 'expo-image';
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
  /** A signed URL for an uploaded photo. The emoji is the fallback. */
  photoUrl?: string | null;
};

/**
 * A profile photo, or the emoji standing in for one.
 *
 * The app ships no stock portraits — using photographs of real people as
 * fake profiles is the kind of thing that ends up in a news story — so a
 * profile with no upload shows the emoji its owner picked.
 */
export function ProfilePhoto({ emoji, name, style, size = 64, background, photoUrl }: Props) {
  const theme = useTheme();

  if (photoUrl) {
    return (
      <View
        style={[styles.container, { backgroundColor: background ?? theme.photoBackground }, style]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        <Image
          source={{ uri: photoUrl }}
          style={styles.image}
          contentFit="cover"
          // The URL expires, so a stale cached copy would outlive its
          // signature and start failing. Memory-only keeps it for the
          // session without persisting a dead link.
          cachePolicy="memory"
          transition={150}
        />
      </View>
    );
  }

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
  image: { width: '100%', height: '100%' },
});
