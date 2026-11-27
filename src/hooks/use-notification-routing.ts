/**
 * Opens the screen a notification points at.
 *
 * Handles both ways a notification can arrive: tapped while the app is
 * running, and tapped to launch the app cold — the second is the one that is
 * usually forgotten, and it is the common case for a message that arrives
 * overnight.
 *
 * Everything is guarded for web and for SSR. expo-notifications has no web
 * implementation, and this runs inside the root layout, which is rendered on
 * the server for the web build.
 */

import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

function redirect(notification: Notifications.Notification): void {
  const url = notification.request.content.data?.url;
  if (typeof url === 'string' && url.startsWith('/')) {
    // Only in-app paths. A notification is remote input, and following an
    // arbitrary url from one would be an open redirect.
    router.push(url as Parameters<typeof router.push>[0]);
    Notifications.clearLastNotificationResponse();
  }
}

export function useNotificationRouting(): void {
  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    // Cold start: the app was launched by tapping a notification.
    const launched = Notifications.getLastNotificationResponse();
    if (launched?.notification) {
      redirect(launched.notification);
    }

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      redirect(response.notification);
    });
    return () => subscription.remove();
  }, []);
}
