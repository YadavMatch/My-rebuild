import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Colors } from '@/constants/theme';
import { DecisionsProvider } from '@/store/decisions';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? Colors.dark : Colors.light;

  return (
    // Without this wrapper gestures silently do nothing — no error, no warning.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
        <DecisionsProvider>
          <Stack
            screenOptions={{
              headerTintColor: theme.accent,
              headerStyle: { backgroundColor: theme.background },
              contentStyle: { backgroundColor: theme.background },
            }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="welcome" options={{ headerShown: false }} />
            <Stack.Screen name="profile/[id]" options={{ title: '' }} />
            <Stack.Screen name="chat/[id]" options={{ title: '' }} />
            <Stack.Screen
              name="report/[id]"
              options={{
                // A real UISheetPresentationController rather than a modal
                // rebuilt in JS, so it gets the platform's own behaviour free.
                presentation: 'formSheet',
                title: 'Report',
                sheetAllowedDetents: [0.6, 1],
              }}
            />
          </Stack>
        </DecisionsProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
