import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

/**
 * The Supabase client.
 *
 * Both values come from the environment. `EXPO_PUBLIC_` variables are
 * inlined into the app bundle at build time, which is correct for these two
 * and correct for nothing else: the anon key is designed to be public and is
 * safe only because row-level security decides what it can reach. The
 * service-role key must never appear in this file, this repo, or any
 * `EXPO_PUBLIC_` variable — it bypasses every policy in the schema.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** True once both values are present, so callers can fall back to seed data. */
export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

/**
 * Returns the client, creating it on first use.
 *
 * Throws rather than returning a half-configured client: a client built
 * against an undefined URL fails later with an opaque network error, which
 * is much harder to diagnose than this.
 */
export function supabase(): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error(
      'Supabase is not configured. Copy .env.example to .env and fill in ' +
        'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart the dev server.',
    );
  }

  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        // Sessions persist on the device so people are not signed out on
        // every launch. AsyncStorage is the React Native equivalent of the
        // localStorage the library reaches for by default.
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        // There is no URL-based auth callback in a native app.
        detectSessionInUrl: false,
      },
    });
  }

  return client;
}
