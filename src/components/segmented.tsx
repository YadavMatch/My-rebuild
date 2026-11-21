import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props<T extends string> = {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
};

/**
 * The Discover / Top Picks switch.
 *
 * No sliding indicator: this is switched often, and motion on something
 * touched this frequently costs more than it gives. The selected segment
 * simply becomes the raised one.
 */
export function Segmented<T extends string>({ options, value, onChange }: Props<T>) {
  const theme = useTheme();

  return (
    <View
      style={[styles.track, { backgroundColor: theme.backgroundSelected }]}
      accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[
              styles.segment,
              selected && { backgroundColor: theme.backgroundElement },
            ]}>
            <ThemedText
              style={[
                styles.label,
                { color: selected ? theme.text : theme.textSecondary },
              ]}>
              {option}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: Radius.lg,
    padding: Spacing.half + 2,
    gap: Spacing.half,
  },
  segment: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
  },
  label: {
    fontFamily: Fonts.rounded,
    fontSize: 17,
    fontWeight: '700',
  },
});
