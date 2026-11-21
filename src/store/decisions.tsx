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

import { registerLike, registerPass, submitReport } from '@/services';
import type { Report, ReportReason } from '@/types';

const STORAGE_KEY = 'decisions.v1';

type State = {
  liked: string[];
  passed: string[];
  blocked: string[];
  reports: Report[];
  /** False until AsyncStorage has been read, so the deck does not flash stale cards. */
  hydrated: boolean;
};

const initialState: State = {
  liked: [],
  passed: [],
  blocked: [],
  reports: [],
  hydrated: false,
};

type Action =
  | { type: 'hydrated'; state: Omit<State, 'hydrated'> }
  | { type: 'liked'; profileId: string }
  | { type: 'passed'; profileId: string }
  | { type: 'blocked'; profileId: string }
  | { type: 'reported'; report: Report }
  | { type: 'reset' };

/** Adds an id to a list without duplicating it. */
function add(list: string[], id: string): string[] {
  return list.includes(id) ? list : [...list, id];
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'hydrated':
      return { ...action.state, hydrated: true };
    case 'liked':
      return { ...state, liked: add(state.liked, action.profileId) };
    case 'passed':
      return { ...state, passed: add(state.passed, action.profileId) };
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
      return { ...initialState, hydrated: true };
    default:
      return state;
  }
}

type DecisionsValue = {
  state: State;
  /** Ids to exclude from the deck: everyone already seen or blocked. */
  excludedIds: string[];
  isBlocked: (profileId: string) => boolean;
  /** Resolves to the conversation id when the like produced a match. */
  like: (profileId: string) => Promise<string | undefined>;
  pass: (profileId: string) => Promise<void>;
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
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          dispatch({ type: 'hydrated', state: { liked: [], passed: [], blocked: [], reports: [] } });
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
    const { liked, passed, blocked, reports } = state;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ liked, passed, blocked, reports })).catch(
      () => {
        // Persistence is a convenience here; failing to write must not break the app.
      },
    );
  }, [state]);

  const like = useCallback(async (profileId: string) => {
    dispatch({ type: 'liked', profileId });
    const result = await registerLike(profileId);
    return result.matched ? result.conversationId : undefined;
  }, []);

  const pass = useCallback(async (profileId: string) => {
    dispatch({ type: 'passed', profileId });
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

  const reset = useCallback(async () => {
    dispatch({ type: 'reset' });
    await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  }, []);

  const value = useMemo<DecisionsValue>(() => {
    const excludedIds = [...new Set([...state.liked, ...state.passed, ...state.blocked])];
    return {
      state,
      excludedIds,
      isBlocked: (profileId: string) => state.blocked.includes(profileId),
      like,
      pass,
      block,
      report,
      reset,
    };
  }, [state, like, pass, block, report, reset]);

  return <DecisionsContext.Provider value={value}>{children}</DecisionsContext.Provider>;
}

export function useDecisions(): DecisionsValue {
  const value = useContext(DecisionsContext);
  if (!value) {
    throw new Error('useDecisions must be used inside a DecisionsProvider');
  }
  return value;
}
