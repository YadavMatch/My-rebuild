import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing, TAB_BAR_HEIGHT } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Per-route presentation. Keyed by route name so the bar stays declarative
 * and adding a tab is a one-line change here plus a file in `(tabs)`.
 */
const TABS: Record<string, { label: string; glyph: string; centre?: boolean }> = {
  index: { label: 'Discover', glyph: '🔥' },
  likes: { label: 'Likes', glyph: '❤️' },
  premium: { label: 'Premium', glyph: '👑', centre: true },
  messages: { label: 'Messages', glyph: '💬' },
  settings: { label: 'Settings', glyph: '⚙️' },
};

/**
 * The app's tab bar.
 *
 * Hand-built rather than `NativeTabs`, because the design puts an elevated
 * circular button in the middle of the bar and a real UITabBar cannot do
 * that. The trade-off is losing the platform's own bar — so the touch
 * targets, labels and safe-area inset are handled explicitly below.
 */
export function TabBar({ state, navigateToTab, insets }: BottomTabBarProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: theme.backgroundElement,
          borderTopColor: theme.border,
          paddingBottom: insets.bottom,
          height: TAB_BAR_HEIGHT + insets.bottom,
        },
      ]}>
      {state.routes.map((route, index) => {
        const config = TABS[route.name];
        if (!config) {
          return null;
        }

        const focused = state.index === index;

        return (
          <Pressable
            key={route.key}
            onPress={() => navigateToTab(route.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={config.label}
            style={styles.tab}>
            {config.centre ? (
              // Sits above the bar, so it needs its own background and a ring
              // to separate it from whatever scrolls underneath.
              <View
                style={[
                  styles.centreButton,
                  { backgroundColor: theme.accent, borderColor: theme.backgroundElement },
                ]}>
                <Text style={styles.centreGlyph} allowFontScaling={false}>
                  {config.glyph}
                </Text>
              </View>
            ) : (
              <Text style={styles.glyph} allowFontScaling={false}>
                {config.glyph}
              </Text>
            )}
            <ThemedText
              style={[
                styles.label,
                config.centre && styles.centreLabel,
                { color: focused ? theme.accent : theme.textSecondary },
              ]}
              numberOfLines={1}>
              {config.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
    // Lets the centre button overflow upward without being clipped.
    overflow: 'visible',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 2,
    // 44pt minimum target, met by the glyph plus label plus padding.
    minHeight: 44,
  },
  glyph: {
    fontSize: 22,
    lineHeight: 26,
  },
  label: {
    fontFamily: Fonts.rounded,
    fontSize: 11,
    fontWeight: '600',
  },
  centreButton: {
    width: 56,
    height: 56,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    // Raised above the bar, as in the design. The negative bottom margin
    // gives back the layout height the negative top margin did not, so the
    // label lines up with the other tabs instead of sitting lower.
    marginTop: -26,
    marginBottom: -6,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  centreGlyph: {
    fontSize: 26,
    lineHeight: 30,
  },
  centreLabel: {
    marginTop: 0,
  },
});
