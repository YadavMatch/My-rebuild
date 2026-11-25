/**
 * The Supabase implementation of the data layer.
 *
 * Reads go through `discover_feed`, which is the only thing that can compute
 * a proximity label: the coordinates it is derived from live on the
 * owner-only table and no client can read them.
 *
 * Several shapes differ from the seed implementation and are reconciled here
 * rather than in the screens:
 *   - a "conversation" is a match plus its messages
 *   - a message's text is `body`, and its sender is a uuid, not 'me'
 *   - whether a like produced a match is decided by a database trigger, so
 *     it is read back after the insert rather than predicted
 */

import { supabase } from '@/lib/supabase';
import type { DataService, LikeResult, ReportContext } from '@/services/types';
import type { Conversation, CurrentUser, Message, Profile, Prompt } from '@/types';

/**
 * The signed-in uid, mirrored here so the synchronous getters can work.
 *
 * Screens need "is this message mine?" during render, which cannot await.
 * AuthProvider owns the subscription and pushes changes in; this module
 * deliberately starts no subscription of its own, because module-level
 * Supabase auth work runs during the web server render, where there is no
 * window and AsyncStorage throws.
 */
let currentUserIdValue: string | null = null;

/** Called by AuthProvider whenever the session changes. */
export function setCurrentUserId(id: string | null): void {
  currentUserIdValue = id;
}

/** The signed-in uid, or null. */
export function currentUserId(): string | null {
  return currentUserIdValue;
}

/** Whether a Supabase session is active, for choosing the implementation. */
export function hasSupabaseSession(): boolean {
  return currentUserIdValue !== null;
}

function requireUser(): string {
  if (!currentUserIdValue) {
    throw new Error('Not signed in.');
  }
  return currentUserIdValue;
}

/**
 * Writes the 18+ declaration the age gate collected to the owner-only table.
 *
 * The gate runs before sign-in, so the date sits in local storage until there
 * is an account to attach it to. Keeping it only on the device would make the
 * declaration unverifiable, which is the one thing it exists to be.
 */
export async function recordAgeConfirmation(
  dateOfBirth: string,
  ageConfirmedAt: string,
): Promise<void> {
  const me = requireUser();
  await supabase()
    .from('profiles_private')
    .upsert({ id: me, date_of_birth: dateOfBirth, age_confirmed_at: ageConfirmedAt });
}

/** Profiles already seen, so rows that hold only an id can render without a fetch. */
const profileCache = new Map<string, Profile>();

type PromptRow = { prompt_id: number; answer: string; prompts: { question: string } | null };

/** Prompt answers for several profiles at once, to avoid a query per card. */
async function promptsFor(ids: string[]): Promise<Map<string, Prompt[]>> {
  const byProfile = new Map<string, Prompt[]>();
  if (ids.length === 0) {
    return byProfile;
  }
  const { data, error } = await supabase()
    .from('profile_prompts')
    .select('profile_id, prompt_id, answer, prompts(question)')
    .in('profile_id', ids)
    .order('position');
  if (error || !data) {
    return byProfile;
  }
  for (const row of data as unknown as (PromptRow & { profile_id: string })[]) {
    const list = byProfile.get(row.profile_id) ?? [];
    list.push({
      id: String(row.prompt_id),
      question: row.prompts?.question ?? '',
      answer: row.answer,
    });
    byProfile.set(row.profile_id, list);
  }
  return byProfile;
}

type ProfileRow = {
  id: string;
  name: string;
  age: number;
  job_title: string | null;
  location_label: string | null;
  bio: string | null;
  interests: string[] | null;
  emoji: string | null;
  verified: boolean;
};

function toProfile(row: ProfileRow, proximity: string, prompts: Prompt[]): Profile {
  return {
    id: row.id,
    name: row.name,
    age: row.age,
    jobTitle: row.job_title ?? '',
    location: row.location_label ?? '',
    proximity,
    emoji: row.emoji ?? '👋',
    verified: row.verified,
    bio: row.bio ?? '',
    interests: row.interests ?? [],
    prompts,
  };
}

function toCurrentUser(row: ProfileRow, prompts: Prompt[]): CurrentUser {
  const { proximity: _ignored, ...rest } = toProfile(row, '', prompts);
  return rest;
}

const PROFILE_COLUMNS = 'id, name, age, job_title, location_label, bio, interests, emoji, verified';

/** A placeholder so a screen rendering before the first fetch has a shape to use. */
const UNKNOWN_USER: CurrentUser = {
  id: '',
  name: '',
  age: 18,
  jobTitle: '',
  location: '',
  emoji: '👋',
  verified: false,
  bio: '',
  interests: [],
  prompts: [],
};
let currentUserCache: CurrentUser = UNKNOWN_USER;

type MatchRow = { id: string; user_a: string; user_b: string; created_at: string };
type MessageRow = {
  id: string;
  match_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.match_id,
    senderId: row.sender_id,
    text: row.body,
    sentAt: row.created_at,
  };
}

/** Matches, with their messages, as the conversations the screens expect. */
async function loadConversations(): Promise<Conversation[]> {
  const me = requireUser();
  const client = supabase();

  const { data: matches, error } = await client
    .from('matches')
    .select('id, user_a, user_b, created_at');
  if (error || !matches || matches.length === 0) {
    return [];
  }

  const ids = (matches as MatchRow[]).map((m) => m.id);
  const { data: messages } = await client
    .from('messages')
    .select('id, match_id, sender_id, body, created_at')
    .in('match_id', ids)
    .order('created_at');

  const byMatch = new Map<string, Message[]>();
  for (const row of (messages ?? []) as MessageRow[]) {
    const list = byMatch.get(row.match_id) ?? [];
    list.push(toMessage(row));
    byMatch.set(row.match_id, list);
  }

  // Warm the cache so the matches list can render names without a fetch.
  const others = (matches as MatchRow[]).map((m) => (m.user_a === me ? m.user_b : m.user_a));
  await hydrateProfiles(others);

  return (matches as MatchRow[]).map((m) => ({
    id: m.id,
    profileId: m.user_a === me ? m.user_b : m.user_a,
    matchedAt: m.created_at,
    messages: byMatch.get(m.id) ?? [],
  }));
}

/** Fetches any of these profiles that are not cached yet. */
async function hydrateProfiles(ids: string[]): Promise<void> {
  const missing = [...new Set(ids)].filter((id) => !profileCache.has(id));
  if (missing.length === 0) {
    return;
  }
  const { data } = await supabase().from('profiles').select(PROFILE_COLUMNS).in('id', missing);
  const prompts = await promptsFor(missing);
  for (const row of (data ?? []) as ProfileRow[]) {
    profileCache.set(row.id, toProfile(row, 'Distance unknown', prompts.get(row.id) ?? []));
  }
}

async function recordSwipe(
  profileId: string,
  decision: 'like' | 'pass' | 'superlike',
): Promise<LikeResult> {
  const me = requireUser();
  const client = supabase();

  const { error } = await client
    .from('swipes')
    .insert({ actor_id: me, target_id: profileId, decision });
  if (error) {
    // The daily cap is a trigger, so this is the server refusing rather than
    // the client having miscounted.
    if (/daily_like_limit_reached/.test(error.message)) {
      throw new Error('daily_like_limit_reached');
    }
    throw new Error(error.message);
  }

  if (decision === 'pass') {
    return { matched: false };
  }

  // Whether that produced a match is the trigger's decision, read back.
  const [lo, hi] = [me, profileId].sort();
  const { data } = await client
    .from('matches')
    .select('id')
    .eq('user_a', lo)
    .eq('user_b', hi)
    .maybeSingle();

  return data ? { matched: true, conversationId: data.id } : { matched: false };
}

export const supabaseService: DataService = {
  async fetchDeck(_excludedIds: string[]): Promise<Profile[]> {
    // The exclusions are server-side: discover_feed already drops anyone
    // swiped on or blocked. Filtering again on the client would only let the
    // two disagree.
    const { data, error } = await supabase().rpc('discover_feed', {
      max_distance_m: 50000,
      lim: 30,
    });
    if (error) {
      throw new Error(error.message);
    }
    const rows = (data ?? []) as (ProfileRow & { proximity: string })[];
    const prompts = await promptsFor(rows.map((r) => r.id));
    const deck = rows.map((r) => toProfile(r, r.proximity, prompts.get(r.id) ?? []));
    deck.forEach((p) => profileCache.set(p.id, p));
    return deck;
  },

  async fetchProfile(id: string): Promise<Profile | undefined> {
    await hydrateProfiles([id]);
    return profileCache.get(id);
  },

  getProfileSync(id: string): Profile | undefined {
    return profileCache.get(id);
  },

  async fetchCurrentUser(): Promise<CurrentUser> {
    const me = requireUser();
    const { data, error } = await supabase()
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', me)
      .single();
    if (error || !data) {
      return currentUserCache;
    }
    const prompts = await promptsFor([me]);
    currentUserCache = toCurrentUser(data as ProfileRow, prompts.get(me) ?? []);
    return currentUserCache;
  },

  getCurrentUserSync(): CurrentUser {
    return currentUserCache;
  },

  async fetchConversations(blockedIds: string[]): Promise<Conversation[]> {
    const blocked = new Set(blockedIds);
    const all = await loadConversations();
    return all
      .filter((c) => !blocked.has(c.profileId))
      .sort((a, b) => {
        const at = a.messages.at(-1)?.sentAt ?? a.matchedAt;
        const bt = b.messages.at(-1)?.sentAt ?? b.matchedAt;
        return bt.localeCompare(at);
      });
  },

  async fetchConversation(id: string): Promise<Conversation | undefined> {
    const all = await loadConversations();
    return all.find((c) => c.id === id);
  },

  async sendMessage(conversationId: string, text: string): Promise<Message> {
    const me = requireUser();
    const { data, error } = await supabase()
      .from('messages')
      .insert({ match_id: conversationId, sender_id: me, body: text })
      .select('id, match_id, sender_id, body, created_at')
      .single();
    if (error || !data) {
      throw new Error(error?.message ?? 'Message failed to send.');
    }
    return toMessage(data as MessageRow);
  },

  async createConversation(profileId: string): Promise<Conversation | undefined> {
    // Matches are created by the reciprocal-like trigger, never by a client —
    // that is what stops someone conjuring a match with a stranger. So this
    // looks one up rather than making one.
    const all = await loadConversations();
    return all.find((c) => c.profileId === profileId);
  },

  async resetConversations(): Promise<void> {
    // Deliberately not implemented. On the seed backend this wipes local
    // state; here it would mean deleting real matches and messages, which is
    // not what a "reset swipes" button in Settings should quietly do.
    throw new Error('Resetting conversations is not available on a real account.');
  },

  registerLike(profileId: string): Promise<LikeResult> {
    return recordSwipe(profileId, 'like');
  },

  registerSuperLike(profileId: string): Promise<LikeResult> {
    return recordSwipe(profileId, 'superlike');
  },

  async registerPass(profileId: string): Promise<void> {
    await recordSwipe(profileId, 'pass');
  },

  async submitReport(
    profileId: string,
    reason: string,
    context: ReportContext,
    conversationId?: string,
  ): Promise<void> {
    const me = requireUser();
    const { error } = await supabase().from('reports').insert({
      reporter_id: me,
      reported_id: profileId,
      context,
      reason,
      match_id: conversationId ?? null,
    });
    if (error) {
      throw new Error(error.message);
    }
    // Reporting also blocks, because a report that leaves the other person
    // able to message you is not much use.
    await supabase().from('blocks').insert({ blocker_id: me, blocked_id: profileId });
  },
};
