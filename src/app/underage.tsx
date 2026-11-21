import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { APP_NAME } from '@/constants/app';
import { BRAND_GRADIENT, Fonts, Spacing } from '@/constants/theme';

/**
 * Shown when someone declares an age under 18.
 *
 * A hard stop with no way forward and no "try again" button. The block is
 * persisted, so relaunching the app returns here rather than offering a
 * fresh attempt at the date — an age gate that lets you immediately retype
 * your birthday is not a gate.
 */
export default function UnderageScreen() {
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={BRAND_GRADIENT}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safeArea}>
        <Text style={styles.emoji} allowFontScaling={false}>
          🔒
        </Text>
        <ThemedText style={styles.title} accessibilityRole="header">
          You need to be 18 to use {APP_NAME}
        </ThemedText>
        <ThemedText style={styles.body}>
          Thanks for being honest. {APP_NAME} is an adults-only app, so we can&apos;t let you in
          yet. You&apos;re welcome back once you turn 18.
        </ThemedText>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#241611' },
  safeArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  emoji: { fontSize: 52, lineHeight: 62 },
  title: {
    fontFamily: Fonts.rounded,
    fontSize: 26,
    lineHeight: 34,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  body: {
    fontFamily: Fonts.rounded,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    maxWidth: 320,
  },
});
