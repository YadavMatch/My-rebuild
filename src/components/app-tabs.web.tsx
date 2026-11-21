import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, View, useColorScheme } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, MaxContentWidth, Radius, Spacing } from '@/constants/theme';

/**
 * Web stand-in for the native tab bar.
 *
 * `NativeTabs` renders a real UITabBar, which has no web equivalent, so the
 * web build gets a plain row of links instead. iOS is the target platform;
 * this exists so `expo export -p web` keeps working.
 */
export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={styles.slot} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="index" href="/" asChild>
            <TabButton>Discover</TabButton>
          </TabTrigger>
          <TabTrigger name="matches" href="/matches" asChild>
            <TabButton>Matches</TabButton>
          </TabTrigger>
          <TabTrigger name="profile" href="/profile" asChild>
            <TabButton>You</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  const colors = useColors();

  return (
    <Pressable
      {...(props as React.ComponentProps<typeof Pressable>)}
      style={({ pressed }) => pressed && styles.pressed}>
      <View
        style={[
          styles.tabButton,
          { backgroundColor: isFocused ? colors.backgroundSelected : colors.backgroundElement },
        ]}>
        <ThemedText type="small" themeColor={isFocused ? 'text' : 'textSecondary'}>
          {children}
        </ThemedText>
      </View>
    </Pressable>
  );
}

function CustomTabList({ children, ...props }: { children?: React.ReactNode }) {
  return (
    <View {...props} style={styles.tabList}>
      {children}
    </View>
  );
}

function useColors() {
  const scheme = useColorScheme();
  return Colors[scheme === 'dark' ? 'dark' : 'light'];
}

const styles = StyleSheet.create({
  slot: {
    // `height: '100%'` plus the tab row below it overflows the viewport by the
    // height of the row. Flex makes the slot take the space that is left.
    flex: 1,
  },
  tabList: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    maxWidth: MaxContentWidth,
  },
  tabButton: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    minHeight: 44,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
