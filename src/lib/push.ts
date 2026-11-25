/**
 * Registering this device for push notifications.
 *
 * Two hard requirements that cannot be worked around in code, so they are
 * reported rather than hidden:
 *
 *   - An EAS project id. getExpoPushTokenAsync mints a token scoped to a
 *     project, so the app has to be linked with `eas init` first.
 *   - A development build. Remote notifications were removed from Expo Go on
 *     Android in SDK 53, and iOS needs the APNs entitlement that only a real
 *     build carries.
 *
 * Local notifications work in Expo Go, which is why the handler below is set
 * up regardless.
 */

import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import { savePushToken } from '@/services';

export type PushOutcome =
  | { ok: true; token: string }
  | {
      ok: false;
      reason: 'denied' | 'blocked' | 'no-project-id' | 'unsupported' | 'failed';
      message: string;
    };

/** Foreground behaviour: show the banner, do not touch the badge. */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

function projectId(): string | null {
  const fromConfig = Constants.expoConfig?.extra?.eas?.projectId;
  const fromEas = Constants.easConfig?.projectId;
  return (typeof fromConfig === 'string' && fromConfig) || (typeof fromEas === 'string' && fromEas)
    ? ((fromConfig as string) ?? fromEas)
    : null;
}

export async function registerForPush(): Promise<PushOutcome> {
  if (Platform.OS === 'web') {
    return {
      ok: false,
      reason: 'unsupported',
      message: 'Push notifications are not available on the web build.',
    };
  }

  // Android 13+ shows no permission prompt until a channel exists, and the
  // token cannot be minted before one either.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages and matches',
      importance: AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  const granted =
    existing.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) {
    return existing.canAskAgain
      ? { ok: false, reason: 'denied', message: 'Notifications are off, so new messages stay quiet.' }
      : {
          ok: false,
          reason: 'blocked',
          message: 'Notifications are turned off for NearMatch. Turn them on in Settings.',
        };
  }

  const id = projectId();
  if (!id) {
    return {
      ok: false,
      reason: 'no-project-id',
      message:
        'This build is not linked to an EAS project yet, so a push token cannot be issued. Run `eas init`.',
    };
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    await savePushToken(token, Platform.OS);
    return { ok: true, token };
  } catch (e) {
    return {
      ok: false,
      reason: 'failed',
      message:
        e instanceof Error
          ? e.message
          : 'A push token could not be issued. A development build is required.',
    };
  }
}
