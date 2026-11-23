/**
 * Pieces every data-layer implementation needs, and that none of them owns.
 */

import type { Conversation } from '@/types';

/** The signed-in person's id. Messages from them carry this as `senderId`. */
// TODO(supabase): once profiles come from the backend this is the auth uid,
// which is not known at module load. It becomes a function on DataService.
export const CURRENT_USER_ID = 'me';

/**
 * Stands in for network latency so loading states are exercised in
 * development rather than appearing for the first time against a real API.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Timestamp used to order the matches list: newest message, else the match itself. */
export function lastActivityAt(conversation: Conversation): string {
  const last = conversation.messages.at(-1);
  return last ? last.sentAt : conversation.matchedAt;
}
