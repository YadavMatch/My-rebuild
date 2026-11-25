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

import { isSupabaseConfigured } from '@/lib/supabase';
import { seedService } from '@/services/seed';
import { CURRENT_USER_ID } from '@/services/shared';
import {
  recordAgeConfirmation as supabaseRecordAge,
  currentUserId as supabaseCurrentUserId,
  hasSupabaseSession,
  supabaseService,
} from '@/services/supabase-service';
import type { DataService } from '@/services/types';

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
