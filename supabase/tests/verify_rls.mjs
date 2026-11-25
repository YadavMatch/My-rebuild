/**
 * Does row-level security actually hold for a signed-in user?
 *
 * The SQL tests prove the schema is shaped correctly. This proves the policies
 * behave correctly against the live API, as two real users — which is the only
 * way to catch a policy that reads right and permits the wrong thing. A
 * column-level REVOKE that silently did nothing was found exactly this way.
 *
 * Needs email confirmation turned OFF (Authentication -> Sign In / Providers
 * -> Email -> Confirm email), otherwise sign-up returns no session and there
 * is nobody to test as. Turn it back on afterwards.
 *
 *   node supabase/tests/verify_rls.mjs
 *
 * Every check asserts that something is DENIED. A pass means the attack
 * failed, which is what we want.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);

const URL_ = env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!URL_ || !KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY in .env');
  process.exit(1);
}

const results = [];
const record = (name, passed, detail) => {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

/** An attack is a pass when it is refused, and a fail when it succeeds. */
function denied(name, { error, data }) {
  if (error) {
    record(name, true, error.code ? `${error.code} ${error.message}` : error.message);
    return;
  }
  // A write that matches no row under RLS returns no error and no rows. That
  // is still a refusal, and distinguishing the two matters: an empty result
  // means the policy filtered it, not that it was written.
  if (Array.isArray(data) && data.length === 0) {
    record(name, true, 'no rows affected (filtered by policy)');
    return;
  }
  record(name, false, `ALLOWED: ${JSON.stringify(data)?.slice(0, 160)}`);
}

function client() {
  return createClient(URL_, KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Refuses to run while confirmation is on.
 *
 * Not just because sign-up would return no session, but because each attempt
 * would send a real confirmation email to an address nobody owns. With
 * autoconfirm on, Supabase sends nothing at all, so the test addresses below
 * can never reach a mailbox.
 */
async function assertAutoconfirmOn() {
  const res = await fetch(`${URL_}/auth/v1/settings`, { headers: { apikey: KEY } });
  const settings = await res.json();
  if (settings.mailer_autoconfirm !== true) {
    throw new Error(
      'Email confirmation is still ON, so this would send real email and yield no session.\n' +
        'Authentication -> Sign In / Providers -> Email -> turn off "Confirm email", then Save.\n' +
        'Turn it back on when the run finishes.',
    );
  }
}

async function makeUser(label) {
  const c = client();
  // A real domain, because Supabase rejects reserved ones such as example.com.
  // Nothing is delivered: assertAutoconfirmOn() has already established that
  // the project sends no confirmation mail.
  const email = `nearmatch.rls.${label}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@gmail.com`;
  const password = `Rls-${label}-${Math.random().toString(36).slice(2)}-9f2`;

  const { data, error } = await c.auth.signUp({ email, password });
  if (error) {
    throw new Error(`sign-up failed for ${label}: ${error.message}`);
  }
  if (!data.session) {
    throw new Error(
      'sign-up returned no session: email confirmation is still ON. ' +
        'Authentication -> Sign In / Providers -> Email -> turn off "Confirm email", then Save.',
    );
  }
  return { client: c, id: data.user.id, email };
}

const main = async () => {
  await assertAutoconfirmOn();
  console.log('Creating two users...\n');
  const a = await makeUser('a');
  const b = await makeUser('b');
  console.log(`A = ${a.id}\nB = ${b.id}\n`);

  // The signup trigger must have produced a profile and a free entitlement.
  const ownProfile = await a.client.from('profiles').select('id, verified').eq('id', a.id).single();
  record(
    'signup trigger created A a profile',
    !ownProfile.error && ownProfile.data?.id === a.id,
    ownProfile.error?.message ?? `verified=${ownProfile.data?.verified}`,
  );
  const ownEnt = await a.client.from('entitlements').select('tier').eq('user_id', a.id).single();
  record(
    'signup trigger gave A a free entitlement',
    !ownEnt.error && ownEnt.data?.tier === 'free',
    ownEnt.error?.message ?? `tier=${ownEnt.data?.tier}`,
  );

  console.log('');

  // 1. Self-granting the verification badge.
  denied(
    'A cannot grant itself verified',
    await a.client.from('profiles').update({ verified: true }).eq('id', a.id).select(),
  );

  // 2. Self-granting Premium.
  denied(
    'A cannot upgrade its own entitlement to premium',
    await a.client.from('entitlements').update({ tier: 'premium' }).eq('user_id', a.id).select(),
  );

  // 3. Forging a match with someone who never liked back.
  const [lo, hi] = [a.id, b.id].sort();
  denied(
    'A cannot forge a match with B',
    await a.client.from('matches').insert({ user_a: lo, user_b: hi }).select(),
  );

  // 4. Reading another person's date of birth.
  denied(
    "A cannot read B's date of birth",
    await a.client.from('profiles_private').select('date_of_birth').eq('id', b.id),
  );

  // 5. Reading another person's swipes.
  denied(
    "A cannot read B's swipes",
    await a.client.from('swipes').select('*').eq('actor_id', b.id),
  );

  // 6. Editing someone else's profile.
  denied(
    "A cannot edit B's profile",
    await a.client.from('profiles').update({ name: 'Owned' }).eq('id', b.id).select(),
  );

  // 7. Sending a message into a match that does not exist.
  denied(
    'A cannot message without a match',
    await a.client
      .from('messages')
      .insert({ match_id: '00000000-0000-0000-0000-000000000000', sender_id: a.id, body: 'hi' })
      .select(),
  );

  console.log('');
  const failed = results.filter((r) => !r.passed);
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log('\nFAILED:');
    failed.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
    process.exitCode = 1;
  }
};

main().catch((e) => {
  console.error('\n' + e.message);
  process.exitCode = 1;
});
