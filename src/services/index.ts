/**
 * The data layer.
 *
 * Every screen reads through these functions and none of them import an
 * implementation or the seed JSON directly. Swapping the backend is a change
 * to the line below, not to any screen, because `DataService` fixes the
 * return types.
 *
 * Implementations:
 *   - `seed.ts`     sample data, on-device. What runs today.
 *   - (next) Supabase, selected on `isSupabaseConfigured`, ported function by
 *     function once each can be checked against live row-level security.
 */

import { seedService } from '@/services/seed';
import type { DataService } from '@/services/types';

const service: DataService = seedService;

export { CURRENT_USER_ID, lastActivityAt } from '@/services/shared';
export type { DataService, LikeResult, ReportContext } from '@/services/types';

export const fetchDeck: DataService['fetchDeck'] = (ids) => service.fetchDeck(ids);
export const fetchProfile: DataService['fetchProfile'] = (id) => service.fetchProfile(id);
export const getProfileSync: DataService['getProfileSync'] = (id) => service.getProfileSync(id);

export const fetchCurrentUser: DataService['fetchCurrentUser'] = () => service.fetchCurrentUser();
export const getCurrentUserSync: DataService['getCurrentUserSync'] = () =>
  service.getCurrentUserSync();

export const fetchConversations: DataService['fetchConversations'] = (blocked) =>
  service.fetchConversations(blocked);
export const fetchConversation: DataService['fetchConversation'] = (id) =>
  service.fetchConversation(id);
export const sendMessage: DataService['sendMessage'] = (id, text) => service.sendMessage(id, text);
export const createConversation: DataService['createConversation'] = (id) =>
  service.createConversation(id);
export const resetConversations: DataService['resetConversations'] = () =>
  service.resetConversations();

export const registerLike: DataService['registerLike'] = (id) => service.registerLike(id);
export const registerSuperLike: DataService['registerSuperLike'] = (id) =>
  service.registerSuperLike(id);
export const registerPass: DataService['registerPass'] = (id) => service.registerPass(id);

export const submitReport: DataService['submitReport'] = (id, reason, context, conversationId) =>
  service.submitReport(id, reason, context, conversationId);
