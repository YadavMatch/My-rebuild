/**
 * Verification state for a screen.
 *
 * Owns the one piece of timing that matters: the verdict arrives at the
 * server by webhook, not through the device, so when the browser closes the
 * answer usually is not there yet. This polls for a short while and then
 * stops claiming anything — `pending` is an honest resting state, not a
 * failure.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchVerifiedFlag, startVerification } from '@/services/verification';
import { useAuth } from '@/store/auth';

export type VerificationState =
  /** No backend configured, or nobody signed in. Nothing to offer. */
  | 'unavailable'
  /** Known not to be verified. The flow can be started. */
  | 'unverified'
  /** The browser is open, or the result has not arrived yet. */
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

  // Guards the polling loop in `start`, which can outlive the screen. The
  // effect below uses its own flag instead, so that nothing in the effect
  // body reaches a setter directly.
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

      // The browser has closed. The webhook may still be in flight, so look
      // a few times before settling on `pending`.
      setState('pending');

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

      setMessage('Check submitted. The badge appears once the result comes through.');
    } catch {
      if (live.current) {
        setMessage('Something went wrong starting verification.');
      }
    } finally {
      if (live.current) {
        setBusy(false);
      }
    }
  }, [refresh]);

  return { state, message, busy, start, refresh };
}
