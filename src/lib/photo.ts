/**
 * Choosing a profile photo.
 *
 * Asks for base64 rather than reading the returned file:// uri, because on
 * native `fetch(uri).blob()` is unreliable and storage wants bytes either
 * way. Quality is capped and the crop is square, so a 12-megapixel camera
 * photo does not become a multi-megabyte upload or a memory spike while it
 * is base64-encoded.
 */

import * as ImagePicker from 'expo-image-picker';

export type PhotoChoice =
  | { ok: true; base64: string; mimeType: string }
  | { ok: false; reason: 'cancelled' | 'denied' | 'failed'; message: string };

const MAX_BYTES = 5 * 1024 * 1024; // matches the bucket's limit

export async function choosePhoto(): Promise<PhotoChoice> {
  try {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return {
        ok: false,
        reason: 'denied',
        message: permission.canAskAgain
          ? 'NearMatch needs access to your photos to set a picture.'
          : 'Photo access is off for NearMatch. Turn it on in Settings.',
      };
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });

    if (result.canceled) {
      return { ok: false, reason: 'cancelled', message: '' };
    }

    const asset = result.assets[0];
    if (!asset?.base64) {
      return { ok: false, reason: 'failed', message: 'That image could not be read.' };
    }
    // base64 inflates by about a third, so compare on the decoded size.
    if ((asset.base64.length * 3) / 4 > MAX_BYTES) {
      return { ok: false, reason: 'failed', message: 'That photo is too large. Try a smaller one.' };
    }

    return {
      ok: true,
      base64: asset.base64,
      // The crop re-encodes as JPEG, but a passthrough can keep the original
      // type, and the bucket only accepts three.
      mimeType:
        asset.mimeType === 'image/png' || asset.mimeType === 'image/webp'
          ? asset.mimeType
          : 'image/jpeg',
    };
  } catch {
    return { ok: false, reason: 'failed', message: 'The photo picker could not be opened.' };
  }
}
