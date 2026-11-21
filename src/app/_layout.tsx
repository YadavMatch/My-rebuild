import { Pacifico_400Regular } from '@expo-google-fonts/pacifico';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Colors, Fonts } from '@/constants/theme';
import { DecisionsProvider } from '@/store/decisions';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? Colors.dark : Colors.light;

  // The wordmark is set in Pacifico. Holding the splash until it loads
  // avoids the logo rendering in the fallback face and then jumping.
  const [fontsLoaded] = useFonts({ Pacifico_400Regular });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    // Without this wrapper gestures silently do nothing — no error, no warning.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
        <DecisionsProvider>
          <Stack
            screenOptions={{
              headerTintColor: theme.accent,
              headerStyle: { backgroundColor: theme.background },
              headerTitleStyle: { fontFamily: Fonts.rounded, fontWeight: '700' },
              contentStyle: { backgroundColor: theme.background },
            }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="welcome" options={{ headerShown: false }} />
            <Stack.Screen name="age-gate" options={{ headerShown: false }} />
            <Stack.Screen
              name="underage"
              options={{
                headerShown: false,
                // No swipe back and no header: this is a stop, not a step.
                gestureEnabled: false,
              }}
            />
            <Stack.Screen
              name="match/[id]"
              options={{
                headerShown: false,
                // Full screen, because a match earns the whole screen. It is
                // the one moment in the app worth interrupting for.
                presentation: 'fullScreenModal',
                animation: 'fade',
              }}
            />
            <Stack.Screen name="profile/[id]" options={{ title: '' }} />
            <Stack.Screen name="chat/[id]" options={{ title: '' }} />
            <Stack.Screen name="edit-profile" options={{ title: 'Edit profile' }} />
            <Stack.Screen name="invite" options={{ title: 'Invite' }} />
            <Stack.Screen name="legal/[doc]" options={{ title: '' }} />
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
