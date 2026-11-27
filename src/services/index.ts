/**
 * The data layer.
 *
 * Every screen reads through these functions and none of them import an
 * implementation or the seed JSON directly. Swapping the backend is a change
 * to the line below, not to any screen, because `DataService` fixes the
 * return types.
 *
 * Implementations:
 *   - `seed.ts`               sample data, on-device. Used when signed out.
 *   - `supabase-service.ts`   the real backend. Used as soon as there is a
 *                             session.
 */

import { DEFAULT_DISCOVERY_RADIUS_M } from '@/lib/discovery';
import { isSupabaseConfigured } from '@/lib/supabase';
import { seedService } from '@/services/seed';
import { CURRENT_USER_ID } from '@/services/shared';
import {
  fetchEntitlement as supabaseFetchEntitlement,
  savePushToken as supabaseSavePushToken,
  forgetPushToken as supabaseForgetPushToken,
  uploadProfilePhoto as supabaseUploadPhoto,
  removeProfilePhoto as supabaseRemovePhoto,
  subscribeToMyMessages as supabaseSubscribeMine,
  subscribeToConversation as supabaseSubscribe,
  fetchPromptCatalogue as supabaseFetchPrompts,
  saveMyPrompts as supabaseSavePrompts,
  updateMyProfile as supabaseUpdateProfile,
  PLACEHOLDER_NAME,
  type ProfileEdit,
  hasStoredLocation as supabaseHasLocation,
  saveLocation as supabaseSaveLocation,
  fetchDiscoveryStatus as supabaseDiscoveryStatus,
  saveDiscoveryRadius as supabaseSaveRadius,
  recordAgeConfirmation as supabaseRecordAge,
  currentUserId as supabaseCurrentUserId,
  hasSupabaseSession,
  supabaseService,
} from '@/services/supabase-service';
import type { DataService } from '@/services/types';
import type { Message } from '@/types';

/**
 * Chosen per call, not once at startup, because it depends on whether
 * somebody is signed in.
 *
 * "Skip for now" is a real path: it browses the sample profiles without an
 * account. Binding to Supabase at module load would make every one of those
 * screens throw "Not signed in".
 */
function service(): DataService {
  return isSupabaseConfigured && hasSupabaseSession() ? supabaseService : seedService;
}

export { CURRENT_USER_ID, lastActivityAt } from '@/services/shared';

/**
 * The signed-in person's id, for "is this message mine?".
 *
 * A function rather than the CURRENT_USER_ID constant because on Supabase it
 * is the auth uid, which is not known until someone signs in. Comparing a
 * uuid against the literal 'me' silently renders every message as the other
 * person's.
 */
export function currentUserId(): string {
  return isSupabaseConfigured && hasSupabaseSession()
    ? (supabaseCurrentUserId() ?? CURRENT_USER_ID)
    : CURRENT_USER_ID;
}
export type { DataService, LikeResult, ReportContext } from '@/services/types';

/**
 * Sends the age declaration to the backend, if there is one.
 *
 * Not part of DataService: it belongs to account setup rather than to
 * reading and writing app data, and it does nothing on the seed backend.
 */
export async function recordAgeConfirmation(
  dateOfBirth: string,
  ageConfirmedAt: string,
): Promise<void> {
  if (isSupabaseConfigured && hasSupabaseSession()) {
    await supabaseRecordAge(dateOfBirth, ageConfirmedAt);
  }
}

/**
 * Stores where the signed-in person is. A no-op on the seed backend, whose
 * proximity labels are fixed strings in the sample data.
 */
export async function saveLocation(latitude: number, longitude: number): Promise<void> {
  if (isSupabaseConfigured && hasSupabaseSession()) {
    await supabaseSaveLocation(latitude, longitude);
  }
}

/** Whether a location is stored. False without an account, which never prompts. */
export async function hasStoredLocation(): Promise<boolean> {
  if (isSupabaseConfigured && hasSupabaseSession()) {
    return supabaseHasLocation();
  }
  return true;
}

/**
 * How far this member chose to look, and whether they have a location to look
 * from.
 *
 * On the seed backend there is no account and no server, so it reports a
 * usable location and the default range: the sample deck carries fixed
 * proximity strings and should not be gated behind a prompt nobody can
 * satisfy.
 */
export async function fetchDiscoveryStatus(): Promise<{
  hasLocation: boolean;
  radiusM: number | null;
}> {
  if (isSupabaseConfigured && hasSupabaseSession()) {
    return supabaseDiscoveryStatus();
  }
  return { hasLocation: true, radiusM: DEFAULT_DISCOVERY_RADIUS_M };
}

/** Saves the chosen range. A no-op on the seed backend. */
export async function saveDiscoveryRadius(radiusM: number): Promise<void> {
  if (isSupabaseConfigured && hasSupabaseSession()) {
    await supabaseSaveRadius(radiusM);
  }
}

export { PLACEHOLDER_NAME } from '@/services/supabase-service';
export type { ProfileEdit } from '@/services/supabase-service';

/** Saves the editable half of the signed-in person's profile. */
export async function updateMyProfile(edit: ProfileEdit): Promise<void> {
  if (!isSupabaseConfigured || !hasSupabaseSession()) {
    throw new Error('Sign in to save your profile.');
  }
  await supabaseUpdateProfile(edit);
}

/** The prompt questions on offer. Empty without an account, which hides the section. */
export async function fetchPromptCatalogue(): Promise<{ id: number; question: string }[]> {
  if (isSupabaseConfigured && hasSupabaseSession()) {
    return supabaseFetchPrompts();
  }
  return [];
}

/** Replaces the signed-in person's prompt answers. */
export async function saveMyPrompts(
  answers: { promptId: number; answer: string }[],
): Promise<void> {
  if (isSupabaseConfigured && hasSupabaseSession()) {
    await supabaseSavePrompts(answers);
  }
}

/**
 * Whether this account still has the name the signup trigger gave it, and so
 * has never been through setup.
 */
export function needsProfileSetup(name: string): boolean {
  return name.trim().length === 0 || name === PLACEHOLDER_NAME;
}

/**
 * Calls back when someone else adds a message to this conversation.
 *
 * A no-op on the seed backend: nobody else is typing into sample data, so
 * there is nothing to push.
 */
export function subscribeToConversation(
  conversationId: string,
  onMessage: (message: Message) => void,
): () => void {
  if (isSupabaseConfigured && hasSupabaseSession()) {
    return supabaseSubscribe(conversationId, onMessage);
  }
  return () => {};
}

/** Calls back whenever any conversation of this account gains a message. */
export function subscribeToMyMessages(onChange: () => void): () => void {
  if (isSupabaseConfigured && hasSupabaseSession()) {
    return supabaseSubscribeMine(onChange);
  }
  return () => {};
}

/** Stores a profile photo and returns a signed URL for it. */
export async function uploadProfilePhoto(base64: string, mimeType: string): Promise<string> {
  if (!isSupabaseConfigured || !hasSupabaseSession()) {
    throw new Error('Sign in to add a photo.');
  }
  return supabaseUploadPhoto(base64, mimeType);
}

/** Removes the stored photo, falling back to the emoji. */
export async function removeProfilePhoto(): Promise<void> {
  if (isSupabaseConfigured && hasSupabaseSession()) {
    await supabaseRemovePhoto();
  }
}

/** Records this device's push token against the signed-in account. */
export async function savePushToken(token: string, platform: string): Promise<void> {
  if (!isSupabaseConfigured || !hasSupabaseSession()) {
    throw new Error('Sign in to enable notifications.');
  }
  await supabaseSavePushToken(token, platform);
}

/** Forgets this device's push token. */
export async function forgetPushToken(token: string): Promise<void> {
  if (isSupabaseConfigured && hasSupabaseSession()) {
    await supabaseForgetPushToken(token);
  }
}

/**
 * Whether Premium is active, from the server when there is an account.
 *
 * Returns null on the seed backend, where the Settings simulation is the
 * only source and should be left alone.
 */
export async function fetchEntitlement(): Promise<boolean | null> {
  if (isSupabaseConfigured && hasSupabaseSession()) {
    return supabaseFetchEntitlement();
  }
  return null;
}

export const fetchDeck: DataService['fetchDeck'] = (ids) => service().fetchDeck(ids);
export const fetchProfile: DataService['fetchProfile'] = (id) => service().fetchProfile(id);
export const getProfileSync: DataService['getProfileSync'] = (id) => service().getProfileSync(id);

export const fetchCurrentUser: DataService['fetchCurrentUser'] = () => service().fetchCurrentUser();
export const getCurrentUserSync: DataService['getCurrentUserSync'] = () =>
  service().getCurrentUserSync();

export const fetchConversations: DataService['fetchConversations'] = (blocked) =>
  service().fetchConversations(blocked);
export const fetchConversation: DataService['fetchConversation'] = (id) =>
  service().fetchConversation(id);
export const sendMessage: DataService['sendMessage'] = (id, text) => service().sendMessage(id, text);
export const createConversation: DataService['createConversation'] = (id) =>
  service().createConversation(id);
export const resetConversations: DataService['resetConversations'] = () =>
  service().resetConversations();

export const registerLike: DataService['registerLike'] = (id) => service().registerLike(id);
export const registerSuperLike: DataService['registerSuperLike'] = (id) =>
  service().registerSuperLike(id);
export const registerPass: DataService['registerPass'] = (id) => service().registerPass(id);

export const submitReport: DataService['submitReport'] = (id, reason, context, conversationId) =>
  service().submitReport(id, reason, context, conversationId);
