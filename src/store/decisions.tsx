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
import type { Decision, DecisionRecord, Report, ReportReason } from '@/types';

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
      const history = [...state.history, { profileId: action.profileId, decision: action.decision }];
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
      return { ...initialState, seenWelcome: state.seenWelcome, hydrated: true };
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
    const { liked, passed, blocked, reports, history, seenWelcome } = state;
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ liked, passed, blocked, reports, history, seenWelcome }),
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

    return {
      state,
      excludedIds,
      isBlocked: (profileId: string) => state.blocked.includes(profileId),
      canUndo: state.history.length > 0,
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
      block,
      report,
      reset,
    };
  }, [state, like, superLike, pass, block, report, reset, completeWelcome, showWelcomeAgain]);

  return <DecisionsContext.Provider value={value}>{children}</DecisionsContext.Provider>;
}

export function useDecisions(): DecisionsValue {
  const value = useContext(DecisionsContext);
  if (!value) {
    throw new Error('useDecisions must be used inside a DecisionsProvider');
  }
  return value;
}
