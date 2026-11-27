/**
 * Asking for, and storing, where someone is.
 *
 * Two deliberate limits:
 *
 * Accuracy is Balanced (about 100 m), not High. The app only ever publishes
 * a label rounded to the kilometre, so a GPS-grade fix would burn battery to
 * produce precision that is then thrown away — and stored precision is a
 * liability if the database is ever read by someone it should not be.
 *
 * Foreground only. Background location would let the app track someone's
 * movements all day, which is not needed to answer "who is near me now", and
 * on iOS it is a far harder permission to justify at review.
 */

import * as Location from 'expo-location';

import { saveLocation } from '@/services';

export type LocationOutcome =
  | { ok: true }
  | {
      ok: false;
      /** `blocked` means the system will not ask again; only Settings can change it. */
      reason: 'denied' | 'blocked' | 'unavailable' | 'failed';
      message: string;
    };

/**
 * Asks for permission if needed, reads the position, and stores it.
 *
 * Returns rather than throws, because every one of these outcomes is a thing
 * the UI has to say out loud — a silent failure here looks like the deck is
 * broken.
 */
export async function captureLocation(): Promise<LocationOutcome> {
  let permission: Location.LocationPermissionResponse;
  try {
    permission = await Location.requestForegroundPermissionsAsync();
  } catch {
    return {
      ok: false,
      reason: 'unavailable',
      message: 'Location is not available on this device.',
    };
  }

  if (!permission.granted) {
    return permission.canAskAgain
      ? {
          ok: false,
          reason: 'denied',
          message: 'Location is off, so distances cannot be shown.',
        }
      : {
          ok: false,
          reason: 'blocked',
          message: 'Location is turned off for NearMatch. Turn it on in Settings to see distances.',
        };
  }

  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    await saveLocation(position.coords.latitude, position.coords.longitude);
    return { ok: true };
  } catch {
    return {
      ok: false,
      reason: 'failed',
      message: 'Could not get a location fix. Try again in a moment.',
    };
  }
}

/** Whether permission is already granted, so the UI can skip the prompt. */
export async function hasLocationPermission(): Promise<boolean> {
  try {
    return (await Location.getForegroundPermissionsAsync()).granted;
  } catch {
    return false;
  }
}
