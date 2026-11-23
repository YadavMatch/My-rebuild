/**
 * The sample-data implementation.
 *
 * Runs the whole app with no backend: profiles and the first conversations
 * come from `src/data/*.json`, committed alongside the code, and everything
 * afterwards is kept on the device. It is what "Skip for now" browses, and
 * what a build with no Supabase credentials falls back to.
 *
 * A public repository is not a place for real user data: profiles and
 * messages belong in a database with row-level access control before anyone
 * but you uses this app.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import conversationsSeed from '@/data/conversations.json';
import meSeed from '@/data/me.json';
import profilesSeed from '@/data/profiles.json';
import { CURRENT_USER_ID, delay, lastActivityAt } from '@/services/shared';
import type { DataService, LikeResult, ReportContext } from '@/services/types';
import type { Conversation, CurrentUser, Message, Profile } from '@/types';

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

async function createConversation(profileId: string): Promise<Conversation | undefined> {
  const all = await loadConversations();
  const existing = all.find((c) => c.profileId === profileId);
  if (existing) {
    return existing;
  }
  // Returns undefined rather than throwing, so a stale deck card cannot crash
  // the app.
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

/**
 * Profiles that like us back, so a like can turn into a match.
 *
 * On a real backend this is a lookup against the other person's own likes and
 * the client cannot know the answer in advance. Keeping it here, behind the
 * same async call shape, means the screens already handle "the server decides
 * whether this was a match".
 */
const LIKES_US_BACK = new Set(['p1', 'p3', 'p6', 'p9']);

export const seedService: DataService = {
  async fetchDeck(excludedIds: string[]): Promise<Profile[]> {
    await delay(400);
    const excluded = new Set(excludedIds);
    return profiles.filter((p) => !excluded.has(p.id));
  },

  async fetchProfile(id: string): Promise<Profile | undefined> {
    await delay(200);
    return profiles.find((p) => p.id === id);
  },

  getProfileSync(id: string): Profile | undefined {
    return profiles.find((p) => p.id === id);
  },

  async fetchCurrentUser(): Promise<CurrentUser> {
    await delay(150);
    return currentUser;
  },

  getCurrentUserSync(): CurrentUser {
    return currentUser;
  },

  async fetchConversations(blockedIds: string[]): Promise<Conversation[]> {
    const all = await loadConversations();
    await delay(300);
    const blocked = new Set(blockedIds);
    return all
      .filter((c) => !blocked.has(c.profileId))
      .slice()
      .sort((a, b) => lastActivityAt(b).localeCompare(lastActivityAt(a)));
  },

  async fetchConversation(id: string): Promise<Conversation | undefined> {
    const all = await loadConversations();
    await delay(200);
    return all.find((c) => c.id === id);
  },

  async sendMessage(conversationId: string, text: string): Promise<Message> {
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
  },

  createConversation,

  async resetConversations(): Promise<void> {
    conversations = seedConversations();
    loading = null;
    await AsyncStorage.removeItem(CONVERSATIONS_KEY).catch(() => {});
  },

  async registerLike(profileId: string): Promise<LikeResult> {
    await delay(180);
    if (!LIKES_US_BACK.has(profileId)) {
      return { matched: false };
    }
    const conversation = await createConversation(profileId);
    return conversation ? { matched: true, conversationId: conversation.id } : { matched: false };
  },

  /**
   * A super like. The other person is told straight away, so for the purposes
   * of this mock it always produces a match — which also makes the feature
   * easy to see working.
   */
  async registerSuperLike(profileId: string): Promise<LikeResult> {
    await delay(180);
    const conversation = await createConversation(profileId);
    return conversation ? { matched: true, conversationId: conversation.id } : { matched: false };
  },

  async registerPass(_profileId: string): Promise<void> {
    await delay(80);
  },

  /**
   * Resolves locally. On a real backend a report must reach moderation and a
   * block must be enforced server-side — a client-side block alone still lets
   * the other person see and message you.
   */
  async submitReport(
    profileId: string,
    reason: string,
    context: ReportContext,
    conversationId?: string,
  ): Promise<void> {
    await delay(250);
    if (__DEV__) {
      console.log(
        `[moderation] report filed against ${profileId} from ${context}` +
          `${conversationId ? ` (${conversationId})` : ''}: ${reason}`,
      );
    }
  },
};
