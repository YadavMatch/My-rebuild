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
 *   2. Open it in the system browser. The person photographs a government ID
 *      and takes a selfie there, and Persona matches the two.
 *   3. Read `profiles.verified` back from the server.
 *
 * Step 3 is a read, not a return value, because the verdict never travels
 * through the device. Persona posts it to `verification-webhook`, which is
 * the only writer the schema permits. That also means this module needs no
 * redirect URL and no deep link: there is nothing for Persona to hand back
 * that we would trust.
 *
 * It hands the URL to the **system browser** with `Linking.openURL`, rather
 * than opening an in-app browser or a webview. Persona's own documentation
 * drove that:
 *
 *   * Its supported browsers are the real ones — Chrome 79+, Firefox 74+,
 *     Safari 13+, Edge 80+, Brave — and it says "In-app browsers (e.g.
 *     Facebook Browser, Instagram Browser) are not supported", warning that
 *     "Aspects of the Inquiry flow may be degraded or not function
 *     entirely". A system-browser wrapper such as `SFSafariViewController`
 *     is not named either way, which is not a guarantee worth building on
 *     when the flow needs a camera.
 *   * "We do not support using the WebView integration with React Native",
 *     so `react-native-webview` is not a fallback.
 *   * Its own recommendation for React Native is the native SDK, which needs
 *     a prebuild and gives up Continuous Native Generation.
 *
 * Handing the URL to Safari or Chrome itself sidesteps all three: it is a
 * browser Persona supports, so camera access is the platform's own and not a
 * wrapper's, and nothing native is added.
 *
 * The cost is that the person leaves the app. Persona's Hosted Flow lists
 * exactly that as a requirement — "It's acceptable for users to leave your
 * site temporarily" — and it costs us nothing architecturally, because the
 * verdict was never coming back through the device anyway.
 *
 * So `ok` here means the browser opened, not that the check finished or
 * passed. `use-verification.ts` picks the result up when the app returns to
 * the foreground.
 */

import * as Linking from 'expo-linking';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type StartResult = { ok: true } | { ok: false; message: string };

const NOT_CONFIGURED =
  'Verification needs the backend configured. Fill in the Supabase keys and sign in first.';

/**
 * Creates an inquiry and hands its hosted URL to the system browser.
 *
 * Resolves once the browser has been handed the URL. It says nothing about
 * whether the person completed the check, let alone passed it: they are in
 * another app at that point, and the verdict reaches the server directly.
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

  // Throws if nothing can open the URL, which on a device with no browser is
  // a real possibility worth reporting rather than swallowing.
  try {
    await Linking.openURL(url);
  } catch (cause) {
    console.error('Could not open the verification URL', cause);
    return { ok: false, message: 'Could not open your browser to start the check.' };
  }

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
