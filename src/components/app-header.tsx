import { StyleSheet, View } from 'react-native';

import { Pill } from '@/components/badges';
import { ThemedText } from '@/components/themed-text';
import { APP_NAME } from '@/constants/app';
import { LOGO_FONT, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** The wordmark plus the Boost and Verified pills, as on Discover. */
export function AppHeader() {
  const theme = useTheme();

  return (
    <View style={styles.header}>
      <ThemedText
        style={[styles.logo, { color: theme.accent }]}
        accessibilityRole="header"
        numberOfLines={1}
        allowFontScaling={false}>
        {APP_NAME}
      </ThemedText>

      <View style={styles.pills}>
        <Pill label="Boost" glyph="⚡" variant="outline" />
        <Pill label="Verified" glyph="✓" variant="filled" colour={theme.verified} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  logo: {
    fontFamily: LOGO_FONT,
    fontSize: 26,
    lineHeight: 38,
    flexShrink: 1,
  },
  pills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
