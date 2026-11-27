/**
 * Verification state for a screen.
 *
 * Owns the one piece of timing that matters. The check happens in the system
 * browser, in another app, and its verdict reaches the server by webhook
 * rather than through the device — so there is no moment when this code can
 * ask "did it pass?" and expect an answer. What it can do is notice when the
 * person comes back and look then.
 *
 * Hence the `AppState` listener: returning to the foreground while a check is
 * outstanding starts a short poll. `pending` is an honest resting state, not
 * a failure — the badge may arrive seconds after the person returns, or after
 * they have closed the app entirely, in which case the next launch reads it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { fetchVerifiedFlag, startVerification } from '@/services/verification';
import { useAuth } from '@/store/auth';

export type VerificationState =
  /** No backend configured, or nobody signed in. Nothing to offer. */
  | 'unavailable'
  /** Known not to be verified. The flow can be started. */
  | 'unverified'
  /** Handed off to the browser, or the result has not arrived yet. */
  | 'pending'
  | 'verified';

/** Six attempts, two seconds apart: about twelve seconds of grace. */
const POLL_ATTEMPTS = 6;
const POLL_INTERVAL_MS = 2000;

/** `undefined` means the question could not be answered, which is not `false`. */
function stateFor(verified: boolean | undefined): VerificationState {
  if (verified === undefined) {
    return 'unavailable';
  }

  return verified ? 'verified' : 'unverified';
}

export function useVerification() {
  const { session, ready } = useAuth();
  const [state, setState] = useState<VerificationState>('unavailable');
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  // Guards async writes that can outlive the screen. The effect below uses
  // its own flag instead, so nothing in an effect body reaches a setter
  // directly.
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  // First read once auth has settled; re-runs on sign-in and sign-out.
  useEffect(() => {
    if (!ready) {
      return;
    }

    let cancelled = false;

    fetchVerifiedFlag()
      .then((verified) => {
        if (!cancelled) {
          setState(stateFor(verified));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState('unavailable');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [ready, session?.user.id]);

  const refresh = useCallback(async () => {
    const verified = await fetchVerifiedFlag();
    if (live.current) {
      setState(stateFor(verified));
    }

    return verified;
  }, []);

  /** Looks a few times, then settles. The webhook may still be in flight. */
  const poll = useCallback(async () => {
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
      const verified = await refresh();
      if (!live.current || verified) {
        return;
      }

      setState('pending');
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      if (!live.current) {
        return;
      }
    }

    if (live.current) {
      setMessage('Still waiting on the result. The badge appears here once it arrives.');
    }
  }, [refresh]);

  // Read through refs so the listener below can be registered once, rather
  // than torn down and rebuilt on every state change.
  const stateRef = useRef(state);
  const pollRef = useRef(poll);
  useEffect(() => {
    stateRef.current = state;
    pollRef.current = poll;
  }, [state, poll]);

  // The person finishes the check in another app, so coming back is the only
  // cue we get that it is worth looking again.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' && stateRef.current === 'pending') {
        pollRef.current().catch(() => {});
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const start = useCallback(async () => {
    setBusy(true);
    setMessage(undefined);

    try {
      const result = await startVerification();
      if (!live.current) {
        return;
      }

      if (!result.ok) {
        setMessage(result.message);
        return;
      }

      // The browser has the URL and the person is on their way out of the
      // app. Nothing more to do until they return.
      setState('pending');
      setMessage('Finish the check in your browser, then come back to this screen.');
    } catch {
      if (live.current) {
        setMessage('Something went wrong starting verification.');
      }
    } finally {
      if (live.current) {
        setBusy(false);
      }
    }
  }, []);

  return { state, message, busy, start, refresh };
}
