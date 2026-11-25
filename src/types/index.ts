/**
 * Domain models for the app.
 *
 * These are the shapes the UI consumes. The service layer in `src/services`
 * is responsible for producing them, so swapping the seed data for a real
 * backend means rewriting those functions and nothing else.
 */

/** A profile prompt and its answer, the unit people like individually. */
export type Prompt = {
  id: string;
  question: string;
  answer: string;
};

/** Someone shown in the deck. */
export type Profile = {
  id: string;
  name: string;
  age: number;
  jobTitle: string;
  location: string;
  /**
   * Coarse proximity shown on the card, e.g. "Nearby", "2 km away".
   *
   * Deliberately a label rather than a precise number: publishing an exact
   * distance that updates lets someone trilaterate a home address.
   */
  proximity: string;
  /** Stands in for a profile photo when there is no upload. */
  emoji: string;
  /**
   * A short-lived signed URL for the uploaded photo, or null.
   *
   * Signed rather than public: the bucket is private, so a leaked link stops
   * working and is useless to anyone without an account.
   */
  photoUrl?: string | null;
  /** Identity-verified. Shown as a teal check beside the name. */
  verified: boolean;
  bio: string;
  interests: string[];
  prompts: Prompt[];
};

/** The signed-in person. Separate from Profile: it is editable and has no distance. */
export type CurrentUser = {
  id: string;
  name: string;
  age: number;
  jobTitle: string;
  location: string;
  emoji: string;
  photoUrl?: string | null;
  verified: boolean;
  bio: string;
  interests: string[];
  prompts: Prompt[];
};

export type Message = {
  id: string;
  conversationId: string;
  /** `CURRENT_USER_ID` for our own messages, otherwise the other person's profile id. */
  senderId: string;
  text: string;
  /** ISO 8601. */
  sentAt: string;
};

export type Conversation = {
  id: string;
  profileId: string;
  /** ISO 8601. */
  matchedAt: string;
  messages: Message[];
};

/**
 * What someone did with a card in the deck.
 *
 * A super like is a like that tells the other person first, so it is its own
 * decision rather than a flag on a like.
 */
export type Decision = 'like' | 'pass' | 'superlike';

/** One entry in the decision history. */
export type DecisionRecord = {
  profileId: string;
  decision: Decision;
  /** ISO 8601. Used to count likes against the daily cap. */
  at: string;
};

/** Likes a free account may send per day. Premium lifts it entirely. */
export const FREE_DAILY_LIKES = 6;

/**
 * Reasons someone can report a profile.
 *
 * Apple's App Review Guideline 1.2 requires a dating app to let people report
 * objectionable content and block other users, so this is a shipping
 * requirement rather than a nice-to-have.
 */
export const REPORT_REASONS = [
  'Inappropriate photos',
  'Harassment or hate speech',
  'Fake profile or catfishing',
  'Underage',
  'Spam or scam',
  'Something else',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

/**
 * Where a report was filed from.
 *
 * Mirrors the `report_context` enum in the schema. Moderation needs it: a
 * report about a conversation should arrive with the conversation attached,
 * because the evidence is in the messages rather than on the profile.
 */
export type ReportContext = 'profile' | 'conversation';

export type Report = {
  profileId: string;
  reason: ReportReason;
  context: ReportContext;
  /** Set when the report came from a conversation. */
  conversationId?: string;
  /** ISO 8601. */
  reportedAt: string;
};
