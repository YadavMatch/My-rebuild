/**
 * Who we have liked, passed, blocked and reported.
 *
 * Persisted to AsyncStorage so the deck does not reset on every reload. This
 * is device-local by design: the authoritative copy belongs on a server,
 * which is also the only place a block can actually be enforced.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';

import {
  registerLike,
  registerPass,
  registerSuperLike,
  resetConversations,
  submitReport,
} from '@/services';
import { FREE_DAILY_LIKES, type Decision, type DecisionRecord, type Report, type ReportReason } from '@/types';

const STORAGE_KEY = 'decisions.v2';

type State = {
  liked: string[];
  passed: string[];
  blocked: string[];
  reports: Report[];
  /** Most recent decision last. Drives the rewind button. */
  history: DecisionRecord[];
  /** False until the welcome screen has been dismissed once. */
  seenWelcome: boolean;
  /**
   * When the person confirmed they are 18 or over, ISO 8601.
   *
   * Stored as a timestamp rather than a boolean so there is a record of
   * when the confirmation was given, which is what an age declaration is
   * worth anything for.
   */
  ageConfirmedAt: string | null;
  /** Date of birth they entered, ISO date. Kept to recheck the declaration. */
  dateOfBirth: string | null;
  /** Set when someone declared an age under 18. A hard stop. */
  underageBlockedAt: string | null;
  /**
   * Whether this account has Premium.
   *
   * There is no billing yet, so nothing can set this except the developer
   * toggle in Settings. It is modelled now so the cap and the paywall are
   * one mechanism rather than two, which is how the backend enforces it.
   */
  premium: boolean;
  /** False until AsyncStorage has been read, so the deck does not flash stale cards. */
  hydrated: boolean;
};

const initialState: State = {
  liked: [],
  passed: [],
  blocked: [],
  reports: [],
  history: [],
  seenWelcome: false,
  ageConfirmedAt: null,
  dateOfBirth: null,
  underageBlockedAt: null,
  premium: false,
  hydrated: false,
};

type Action =
  | { type: 'hydrated'; state: Omit<State, 'hydrated'> }
  | { type: 'decided'; profileId: string; decision: Decision }
  | { type: 'undone' }
  | { type: 'blocked'; profileId: string }
  | { type: 'reported'; report: Report }
  | { type: 'seenWelcome' }
  | { type: 'showWelcome' }
  | { type: 'ageConfirmed'; dateOfBirth: string }
  | { type: 'underage' }
  | { type: 'setPremium'; premium: boolean }
  | { type: 'reset' };

/** Adds an id to a list without duplicating it. */
function add(list: string[], id: string): string[] {
  return list.includes(id) ? list : [...list, id];
}

/** Removes every occurrence of an id. */
function remove(list: string[], id: string): string[] {
  return list.filter((entry) => entry !== id);
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'hydrated':
      return { ...action.state, hydrated: true };
    case 'decided': {
      const history = [
        ...state.history,
        { profileId: action.profileId, decision: action.decision, at: new Date().toISOString() },
      ];
      return action.decision === 'pass'
        ? { ...state, passed: add(state.passed, action.profileId), history }
        : { ...state, liked: add(state.liked, action.profileId), history };
    }
    case 'undone': {
      const last = state.history.at(-1);
      if (!last) {
        return state;
      }
      // A blocked person is deliberately not restored by rewind — undoing a
      // block should be a separate, explicit act, not a side effect of
      // tapping back once.
      if (state.blocked.includes(last.profileId)) {
        return { ...state, history: state.history.slice(0, -1) };
      }
      return {
        ...state,
        liked: remove(state.liked, last.profileId),
        passed: remove(state.passed, last.profileId),
        history: state.history.slice(0, -1),
      };
    }
    case 'ageConfirmed':
      return {
        ...state,
        ageConfirmedAt: new Date().toISOString(),
        dateOfBirth: action.dateOfBirth,
        underageBlockedAt: null,
      };
    case 'underage':
      return { ...state, underageBlockedAt: new Date().toISOString(), ageConfirmedAt: null };
    case 'setPremium':
      return { ...state, premium: action.premium };
    case 'seenWelcome':
      return { ...state, seenWelcome: true };
    case 'showWelcome':
      return { ...state, seenWelcome: false };
    case 'blocked':
      // A blocked person is also removed from the deck, hence `passed` too.
      return {
        ...state,
        blocked: add(state.blocked, action.profileId),
        passed: add(state.passed, action.profileId),
      };
    case 'reported':
      return { ...state, reports: [...state.reports, action.report] };
    case 'reset':
      // Keeps `seenWelcome`, so resetting swipes during development does not
      // also throw the welcome screen back in your face.
      return {
        ...initialState,
        seenWelcome: state.seenWelcome,
        ageConfirmedAt: state.ageConfirmedAt,
        dateOfBirth: state.dateOfBirth,
        underageBlockedAt: state.underageBlockedAt,
        premium: state.premium,
        hydrated: true,
      };
    default:
      return state;
  }
}

type DecisionsValue = {
  state: State;
  /** Ids to exclude from the deck: everyone already seen or blocked. */
  excludedIds: string[];
  isBlocked: (profileId: string) => boolean;
  /** True when there is a decision the rewind button can take back. */
  canUndo: boolean;
  /** Resolves to the conversation id when the like produced a match. */
  like: (profileId: string) => Promise<string | undefined>;
  /** A super like always matches, and always opens a conversation. */
  superLike: (profileId: string) => Promise<string | undefined>;
  pass: (profileId: string) => Promise<void>;
  /** Takes back the last like or pass and returns the profile id undone. */
  undo: () => string | undefined;
  completeWelcome: () => Promise<void>;
  showWelcomeAgain: () => Promise<void>;
  /** Likes sent today. Passes do not count. */
  likesUsedToday: number;
  /** Likes left today, or null when there is no cap. */
  likesRemaining: number | null;
  /** False once a free account has used its daily likes. */
  canLike: boolean;
  setPremium: (premium: boolean) => Promise<void>;
  /** Records an 18+ declaration against the date of birth given. */
  confirmAge: (dateOfBirth: Date) => Promise<void>;
  /** Records that someone declared an age under 18. */
  blockUnderage: () => Promise<void>;
  block: (profileId: string) => Promise<void>;
  report: (profileId: string, reason: ReportReason) => Promise<void>;
  reset: () => Promise<void>;
};

const DecisionsContext = createContext<DecisionsValue | undefined>(undefined);

export function DecisionsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Read persisted state once on mount. A corrupt or absent value is not an
  // error worth surfacing — we just start fresh.
  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled) {
          return;
        }
        const parsed = raw ? (JSON.parse(raw) as Partial<State>) : {};
        dispatch({
          type: 'hydrated',
          state: {
            liked: parsed.liked ?? [],
            passed: parsed.passed ?? [],
            blocked: parsed.blocked ?? [],
            reports: parsed.reports ?? [],
            history: parsed.history ?? [],
            seenWelcome: parsed.seenWelcome ?? false,
            ageConfirmedAt: parsed.ageConfirmedAt ?? null,
            dateOfBirth: parsed.dateOfBirth ?? null,
            underageBlockedAt: parsed.underageBlockedAt ?? null,
            premium: parsed.premium ?? false,
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          dispatch({
            type: 'hydrated',
            state: {
              liked: [],
              passed: [],
              blocked: [],
              reports: [],
              history: [],
              seenWelcome: false,
              ageConfirmedAt: null,
              dateOfBirth: null,
              underageBlockedAt: null,
              premium: false,
            },
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Mirror every change back to storage. Only after hydration, or the first
  // write would overwrite saved state with the empty initial value.
  useEffect(() => {
    if (!state.hydrated) {
      return;
    }
    const {
      liked,
      passed,
      blocked,
      reports,
      history,
      seenWelcome,
      ageConfirmedAt,
      dateOfBirth,
      underageBlockedAt,
      premium,
    } = state;
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        liked,
        passed,
        blocked,
        reports,
        history,
        seenWelcome,
        ageConfirmedAt,
        dateOfBirth,
        underageBlockedAt,
        premium,
      }),
    ).catch(
      () => {
        // Persistence is a convenience here; failing to write must not break the app.
      },
    );
  }, [state]);

  const like = useCallback(async (profileId: string) => {
    dispatch({ type: 'decided', profileId, decision: 'like' });
    const result = await registerLike(profileId);
    return result.matched ? result.conversationId : undefined;
  }, []);

  const superLike = useCallback(async (profileId: string) => {
    dispatch({ type: 'decided', profileId, decision: 'superlike' });
    const result = await registerSuperLike(profileId);
    return result.matched ? result.conversationId : undefined;
  }, []);

  const pass = useCallback(async (profileId: string) => {
    dispatch({ type: 'decided', profileId, decision: 'pass' });
    await registerPass(profileId);
  }, []);

  const block = useCallback(async (profileId: string) => {
    dispatch({ type: 'blocked', profileId });
  }, []);

  const report = useCallback(async (profileId: string, reason: ReportReason) => {
    dispatch({
      type: 'reported',
      report: { profileId, reason, reportedAt: new Date().toISOString() },
    });
    // Reporting someone also blocks them — nobody reports a profile and then
    // wants to keep seeing it.
    dispatch({ type: 'blocked', profileId });
    await submitReport(profileId, reason);
  }, []);

  const setPremium = useCallback(async (premium: boolean) => {
    dispatch({ type: 'setPremium', premium });
  }, []);

  const confirmAge = useCallback(async (dateOfBirth: Date) => {
    dispatch({ type: 'ageConfirmed', dateOfBirth: dateOfBirth.toISOString().slice(0, 10) });
  }, []);

  const blockUnderage = useCallback(async () => {
    dispatch({ type: 'underage' });
  }, []);

  const completeWelcome = useCallback(async () => {
    dispatch({ type: 'seenWelcome' });
  }, []);

  const showWelcomeAgain = useCallback(async () => {
    dispatch({ type: 'showWelcome' });
  }, []);

  const reset = useCallback(async () => {
    dispatch({ type: 'reset' });
    // Conversations are reset too. Clearing the swipes while leaving matches
    // behind would leave conversations with people who are back in the deck.
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {}),
      resetConversations().catch(() => {}),
    ]);
  }, []);

  const value = useMemo<DecisionsValue>(() => {
    const excludedIds = [...new Set([...state.liked, ...state.passed, ...state.blocked])];
    const last = state.history.at(-1);

    // Counted from the start of the local day. The backend counts from
    // date_trunc('day', now()) in the same way; this mirrors it so the two
    // do not disagree about when the quota resets.
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const likesUsedToday = state.history.filter(
      (entry) => entry.decision !== 'pass' && new Date(entry.at).getTime() >= startOfDay.getTime(),
    ).length;

    return {
      state,
      excludedIds,
      isBlocked: (profileId: string) => state.blocked.includes(profileId),
      canUndo: state.history.length > 0,
      likesUsedToday,
      likesRemaining: state.premium ? null : Math.max(0, FREE_DAILY_LIKES - likesUsedToday),
      canLike: state.premium || likesUsedToday < FREE_DAILY_LIKES,
      setPremium,
      like,
      superLike,
      pass,
      undo: () => {
        if (!last) {
          return undefined;
        }
        dispatch({ type: 'undone' });
        // Blocked people stay gone, so there is nothing for the deck to
        // restore in that case.
        return state.blocked.includes(last.profileId) ? undefined : last.profileId;
      },
      completeWelcome,
      showWelcomeAgain,
      confirmAge,
      blockUnderage,
      block,
      report,
      reset,
    };
  }, [
    state,
    like,
    superLike,
    pass,
    block,
    report,
    reset,
    completeWelcome,
    showWelcomeAgain,
    confirmAge,
    blockUnderage,
    setPremium,
  ]);

  return <DecisionsContext.Provider value={value}>{children}</DecisionsContext.Provider>;
}

export function useDecisions(): DecisionsValue {
  const value = useContext(DecisionsContext);
  if (!value) {
    throw new Error('useDecisions must be used inside a DecisionsProvider');
  }
  return value;
}
