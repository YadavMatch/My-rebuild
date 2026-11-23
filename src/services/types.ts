/**
 * The contract between the screens and whatever is behind them.
 *
 * Screens import from `@/services` and never from an implementation. Adding a
 * backend means writing a new object of this shape and selecting it in
 * `index.ts`; no screen changes, because the return types do not.
 */

import type { Conversation, CurrentUser, Message, Profile } from '@/types';

export type LikeResult = {
  matched: boolean;
  /** Set when `matched` is true, so the UI can open the new conversation. */
  conversationId?: string;
};

export type ReportContext = 'profile' | 'conversation';

export interface DataService {
  /**
   * Profiles for the deck, excluding anyone already decided on or blocked.
   *
   * An implementation does this filtering server-side — never ship the full
   * user table to the client and filter it on the device.
   */
  fetchDeck(excludedIds: string[]): Promise<Profile[]>;
  fetchProfile(id: string): Promise<Profile | undefined>;
  /** Synchronous lookup for rows that already hold an id, to avoid a spinner per row. */
  getProfileSync(id: string): Profile | undefined;

  fetchCurrentUser(): Promise<CurrentUser>;
  /** Synchronous read, for screens that must render the user immediately. */
  getCurrentUserSync(): CurrentUser;

  fetchConversations(blockedIds: string[]): Promise<Conversation[]>;
  fetchConversation(id: string): Promise<Conversation | undefined>;
  sendMessage(conversationId: string, text: string): Promise<Message>;
  /** Starts a conversation after a match, or returns the existing one. */
  createConversation(profileId: string): Promise<Conversation | undefined>;
  /** Clears saved conversations. Used by the reset action in Settings. */
  resetConversations(): Promise<void>;

  /** Whether the like produced a match is the server's decision, not the client's. */
  registerLike(profileId: string): Promise<LikeResult>;
  registerSuperLike(profileId: string): Promise<LikeResult>;
  registerPass(profileId: string): Promise<void>;

  submitReport(
    profileId: string,
    reason: string,
    context: ReportContext,
    conversationId?: string,
  ): Promise<void>;
}
