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
  /** Rounded, never exact — showing an exact distance lets people trilaterate an address. */
  distanceKm: number;
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

/** What someone did with a card in the deck. */
export type Decision = 'like' | 'pass';

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

export type Report = {
  profileId: string;
  reason: ReportReason;
  /** ISO 8601. */
  reportedAt: string;
};
