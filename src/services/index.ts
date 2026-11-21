/**
 * The data layer.
 *
 * Every screen reads through these functions and none of them import the
 * seed JSON directly. That is deliberate: to move onto a real backend you
 * rewrite the bodies here — hitting Supabase, Firebase or your own API — and
 * the screens keep working, because the return types do not change.
 *
 * The seed data lives in `src/data/*.json`, committed alongside the code.
 * Note that a public repository is not a place for real user data: profiles
 * and messages belong in a database with row-level access control before
 * anyone but you uses this app.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import conversationsSeed from '@/data/conversations.json';
import meSeed from '@/data/me.json';
import profilesSeed from '@/data/profiles.json';
import type { Conversation, CurrentUser, Message, Profile } from '@/types';

/** The signed-in person's id. Messages from them carry this as `senderId`. */
export const CURRENT_USER_ID = 'me';

/**
 * Stands in for network latency so loading states are exercised in
 * development rather than appearing for the first time against a real API.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const profiles: Profile[] = profilesSeed;
const currentUser: CurrentUser = meSeed;

const CONVERSATIONS_KEY = 'conversations.v1';

/**
 * The message log: matches made and messages sent.
 *
 * Persisted, and that is not incidental. Decisions are saved by the store, so
 * if conversations were only held in memory then after a restart you would
 * have liked someone, lost the match, and still have them excluded from the
 * deck — they would be unreachable. Server state has to outlive the process
 * in the same way the decisions that produced it do.
 *
 * A real backend replaces this wholesale; it is modelled here so the screens
 * already treat conversations as state they re-read rather than own.
 */
let conversations: Conversation[] | null = null;
let loading: Promise<Conversation[]> | null = null;

function seedConversations(): Conversation[] {
  return conversationsSeed.map((c) => ({ ...c, messages: [...c.messages] }));
}

/** Loads the log once, from storage if present and from the seed if not. */
function loadConversations(): Promise<Conversation[]> {
  if (conversations) {
    return Promise.resolve(conversations);
  }
  if (!loading) {
    loading = AsyncStorage.getItem(CONVERSATIONS_KEY)
      .then((raw) => (raw ? (JSON.parse(raw) as Conversation[]) : seedConversations()))
      .catch(() => seedConversations())
      .then((list) => {
        conversations = list;
        return list;
      });
  }
  return loading;
}

function persistConversations(): void {
  if (!conversations) {
    return;
  }
  AsyncStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations)).catch(() => {
    // Best effort. Losing a write is better than crashing mid-conversation.
  });
}

/** Clears saved conversations and returns to the seed. Used by the reset action. */
export async function resetConversations(): Promise<void> {
  conversations = seedConversations();
  loading = null;
  await AsyncStorage.removeItem(CONVERSATIONS_KEY).catch(() => {});
}

/**
 * Profiles to show in the deck, excluding anyone already decided on or blocked.
 *
 * A real implementation does this filtering server-side — never ship the full
 * user table to the client and filter it on the device.
 */
export async function fetchDeck(excludedIds: string[]): Promise<Profile[]> {
  await delay(400);
  const excluded = new Set(excludedIds);
  return profiles.filter((p) => !excluded.has(p.id));
}

export async function fetchProfile(id: string): Promise<Profile | undefined> {
  await delay(200);
  return profiles.find((p) => p.id === id);
}

/** Synchronous lookup for rows that already hold an id, to avoid a spinner per row. */
export function getProfileSync(id: string): Profile | undefined {
  return profiles.find((p) => p.id === id);
}

export async function fetchCurrentUser(): Promise<CurrentUser> {
  await delay(150);
  return currentUser;
}

/** Synchronous read, for screens that must render the user immediately. */
export function getCurrentUserSync(): CurrentUser {
  return currentUser;
}

export async function fetchConversations(blockedIds: string[]): Promise<Conversation[]> {
  const all = await loadConversations();
  await delay(300);
  const blocked = new Set(blockedIds);
  return all
    .filter((c) => !blocked.has(c.profileId))
    .slice()
    .sort((a, b) => lastActivityAt(b).localeCompare(lastActivityAt(a)));
}

export async function fetchConversation(id: string): Promise<Conversation | undefined> {
  const all = await loadConversations();
  await delay(200);
  return all.find((c) => c.id === id);
}

export async function sendMessage(conversationId: string, text: string): Promise<Message> {
  const all = await loadConversations();
  const conversation = all.find((c) => c.id === conversationId);
  if (!conversation) {
    throw new Error(`No conversation with id ${conversationId}`);
  }

  const message: Message = {
    id: `${conversationId}-m${conversation.messages.length + 1}-${Date.now()}`,
    conversationId,
    senderId: CURRENT_USER_ID,
    text,
    sentAt: new Date().toISOString(),
  };

  conversation.messages.push(message);
  persistConversations();
  await delay(120);
  return message;
}

/**
 * Starts a conversation after a match, or returns the existing one.
 *
 * Returns `undefined` when the profile does not exist, rather than throwing,
 * so a stale deck card cannot crash the app.
 */
export async function createConversation(profileId: string): Promise<Conversation | undefined> {
  const all = await loadConversations();
  const existing = all.find((c) => c.profileId === profileId);
  if (existing) {
    return existing;
  }
  if (!profiles.some((p) => p.id === profileId)) {
    return undefined;
  }

  const conversation: Conversation = {
    id: `c-${profileId}-${Date.now()}`,
    profileId,
    matchedAt: new Date().toISOString(),
    messages: [],
  };
  all.push(conversation);
  persistConversations();
  await delay(120);
  return conversation;
}

/** Timestamp used to order the matches list: newest message, else the match itself. */
export function lastActivityAt(conversation: Conversation): string {
  const last = conversation.messages.at(-1);
  return last ? last.sentAt : conversation.matchedAt;
}

/**
 * Profiles that like us back, so a like can turn into a match.
 *
 * On a real backend this is a lookup against the other person's own likes and
 * the client cannot know the answer in advance. Keeping it here, behind the
 * same async call shape, means the screens already handle "the server decides
 * whether this was a match".
 */
const LIKES_US_BACK = new Set(['p1', 'p3', 'p6', 'p9']);

export type LikeResult = {
  matched: boolean;
  /** Set when `matched` is true, so the UI can open the new conversation. */
  conversationId?: string;
};

export async function registerLike(profileId: string): Promise<LikeResult> {
  await delay(180);
  if (!LIKES_US_BACK.has(profileId)) {
    return { matched: false };
  }
  const conversation = await createConversation(profileId);
  return conversation ? { matched: true, conversationId: conversation.id } : { matched: false };
}

export async function registerPass(_profileId: string): Promise<void> {
  await delay(80);
}

/**
 * A super like. The other person is told straight away, so for the purposes
 * of this mock it always produces a match — which also makes the feature
 * easy to see working.
 */
export async function registerSuperLike(profileId: string): Promise<LikeResult> {
  await delay(180);
  const conversation = await createConversation(profileId);
  return conversation ? { matched: true, conversationId: conversation.id } : { matched: false };
}

/**
 * Reporting and blocking.
 *
 * These resolve locally, but on a real backend a report must reach moderation
 * and a block must be enforced server-side — a client-side block alone still
 * lets the other person see and message you.
 */
export async function submitReport(profileId: string, reason: string): Promise<void> {
  await delay(250);
  if (__DEV__) {
    console.log(`[moderation] report filed against ${profileId}: ${reason}`);
  }
}
