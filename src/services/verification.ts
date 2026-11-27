/**
 * Starting an identity verification, and reading back the result.
 *
 * This sits outside `DataService` on purpose. That contract describes data
 * the screens read, and has a seed implementation standing in for a backend;
 * verification is neither — it is an action against Supabase Edge Functions
 * that either works or honestly reports that it cannot. Faking it against
 * seed data would mean a Verified badge nobody earned, which is the one thing
 * the schema goes out of its way to make impossible.
 *
 * The flow, and why it looks like this:
 *
 *   1. Ask `verification-start` for a hosted Persona URL. The function reads
 *      the caller from the JWT, so the device cannot nominate a user.
 *   2. Open it in the in-app browser. The person photographs a government ID
 *      and takes a selfie there, and Persona matches the two.
 *   3. Read `profiles.verified` back from the server.
 *
 * Step 3 is a read, not a return value, because the verdict never travels
 * through the device. Persona posts it to `verification-webhook`, which is
 * the only writer the schema permits. That also means this module needs no
 * redirect URL and no deep link: there is nothing for Persona to hand back
 * that we would trust.
 *
 * It uses `openBrowserAsync` rather than `openAuthSessionAsync`. The latter
 * exists to capture a redirect, which — per the above — we do not need, and
 * on iOS it runs in `ASWebAuthenticationSession`, a context hardened for
 * OAuth whose camera access is the open question in
 * `docs/verification-provider.md`. `openBrowserAsync` gets
 * `SFSafariViewController`, an ordinary browser view. If the camera turns out
 * to work in neither, the fallback is `react-native-webview` and only this
 * file changes.
 */

import * as WebBrowser from 'expo-web-browser';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type StartResult = { ok: true } | { ok: false; message: string };

const NOT_CONFIGURED =
  'Verification needs the backend configured. Fill in the Supabase keys and sign in first.';

/**
 * Creates an inquiry and opens the hosted flow.
 *
 * Resolves when the browser closes, which says the person finished with the
 * page — not that they passed. Read the flag afterwards for that.
 */
export async function startVerification(): Promise<StartResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, message: NOT_CONFIGURED };
  }

  const client = supabase();

  // Passed explicitly rather than relying on the client to attach it. The
  // function runs under `auth: 'user'` and rejects an unauthenticated call,
  // so a missing token should fail here with a clear message instead of as a
  // 401 from the edge.
  const { data: sessionData } = await client.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    return { ok: false, message: 'Sign in before verifying.' };
  }

  const { data, error } = await client.functions.invoke<{ url?: string }>('verification-start', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (error) {
    return { ok: false, message: 'Could not start verification. Try again in a moment.' };
  }

  const url = data?.url;
  if (!url) {
    return { ok: false, message: 'Verification is not available right now.' };
  }

  await WebBrowser.openBrowserAsync(url);
  return { ok: true };
}

/**
 * The server's view of whether this account is verified.
 *
 * `undefined` means the question could not be answered — no backend, nobody
 * signed in, or the read failed — which the caller must not treat as `false`.
 * Only the service role can set this column, so whatever comes back is the
 * only trustworthy answer.
 */
export async function fetchVerifiedFlag(): Promise<boolean | undefined> {
  if (!isSupabaseConfigured) {
    return undefined;
  }

  const client = supabase();
  const { data: sessionData } = await client.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) {
    return undefined;
  }

  const { data, error } = await client
    .from('profiles')
    .select('verified')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) {
    return undefined;
  }

  return Boolean(data.verified);
}
