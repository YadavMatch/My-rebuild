/**
 * Who is signed in.
 *
 * Wraps Supabase auth so the rest of the app never imports the client
 * directly. When Supabase is not configured the provider reports a settled,
 * signed-out state rather than throwing, so the app still runs on seed data.
 */

import type { Session, User } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { setCurrentUserId } from '@/services/supabase-service';

type AuthResult = { ok: true; needsEmailConfirmation?: boolean } | { ok: false; message: string };

type AuthValue = {
  /** Null until `ready`, and null afterwards when nobody is signed in. */
  session: Session | null;
  user: User | null;
  /** False until the stored session has been read. */
  ready: boolean;
  /** False when there is no backend configured; the app runs on seed data. */
  enabled: boolean;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }

    let cancelled = false;
    const client = supabase();

    // The stored session is read once; onAuthStateChange then keeps this in
    // step with token refreshes and sign-outs from anywhere in the app.
    client.auth
      .getSession()
      .then(({ data }) => {
        if (!cancelled) {
          setSession(data.session);
          setCurrentUserId(data.session?.user.id ?? null);
          setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setReady(true);
        }
      });

    const { data: subscription } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // The data layer picks its implementation from this, so it has to be
      // updated before any screen re-renders and refetches.
      setCurrentUserId(next?.user.id ?? null);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!isSupabaseConfigured) {
      return { ok: false, message: 'No backend is configured yet.' };
    }
    const { data, error } = await supabase().auth.signUp({ email, password });
    if (error) {
      return { ok: false, message: error.message };
    }
    // With email confirmation on, sign-up succeeds but returns no session.
    // Saying so beats a screen that looks like it worked and then does not.
    return { ok: true, needsEmailConfirmation: !data.session };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!isSupabaseConfigured) {
      return { ok: false, message: 'No backend is configured yet.' };
    }
    const { error } = await supabase().auth.signInWithPassword({ email, password });
    return error ? { ok: false, message: error.message } : { ok: true };
  }, []);

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured) {
      return;
    }
    await supabase().auth.signOut().catch(() => {});
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      user: session?.user ?? null,
      ready,
      enabled: isSupabaseConfigured,
      signUp,
      signIn,
      signOut,
    }),
    [session, ready, signUp, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return value;
}
