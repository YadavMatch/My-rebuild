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

/**
 * A control: something that must SUCCEED.
 *
 * Every "cannot read X" check needs one. Without it an empty table passes
 * trivially — the row has to exist, and its owner has to be able to see it,
 * before "someone else cannot see it" means anything at all.
 */
function allowed(name, { error, data }, expectRows = true) {
  if (error) {
    record(name, false, `${error.code ?? ''} ${error.message}`.trim());
    return;
  }
  if (expectRows && Array.isArray(data) && data.length === 0) {
    record(name, false, 'succeeded but affected no rows');
    return;
  }
  record(name, true);
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

  console.log('--- controls: the data under test must exist and be readable by its owner\n');

  // B gives itself a private row, so "A cannot read B's DOB" is a real test
  // rather than a query against nothing.
  allowed(
    'B can create its own private row',
    await b.client
      .from('profiles_private')
      .insert({ id: b.id, date_of_birth: '1994-03-14', age_confirmed_at: new Date().toISOString() })
      .select(),
  );
  allowed(
    'B can read its own date of birth',
    await b.client.from('profiles_private').select('date_of_birth').eq('id', b.id),
  );

  // Likewise a swipe, so "A cannot read B's swipes" has something to fail on.
  allowed(
    'B can record its own swipe',
    await b.client.from('swipes').insert({ actor_id: b.id, target_id: a.id, decision: 'like' }).select(),
  );
  allowed('B can read its own swipes', await b.client.from('swipes').select('*').eq('actor_id', b.id));

  // And a write that must work, so "A cannot edit B" is not passing because
  // updates are broken for everyone.
  allowed(
    'A can rename itself',
    await a.client.from('profiles').update({ name: 'Test A' }).eq('id', a.id).select(),
  );

  console.log('\n--- attacks: every one of these must be refused\n');

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

  // 4. Reading another person's date of birth. The row now exists.
  denied(
    "A cannot read B's date of birth",
    await a.client.from('profiles_private').select('date_of_birth').eq('id', b.id),
  );

  // 5. Reading another person's swipes. The swipe now exists.
  denied("A cannot read B's swipes", await a.client.from('swipes').select('*').eq('actor_id', b.id));

  // 6. Editing someone else's profile.
  denied(
    "A cannot edit B's profile",
    await a.client.from('profiles').update({ name: 'Owned' }).eq('id', b.id).select(),
  );

  // 7. Reading another person's exact location.
  //
  // 0001 granted SELECT on every column of profiles, so this returned the
  // precise coordinates of any discoverable profile — the home address, not
  // a trilateration risk. 0003 moved the column to the owner-only table.
  allowed(
    'A can set its own location',
    await a.client
      .from('profiles_private')
      .upsert({
        id: a.id,
        date_of_birth: '1994-03-14',
        age_confirmed_at: new Date().toISOString(),
        geo: 'POINT(77.6408 12.9784)',
      })
      .select('id'),
  );
  allowed(
    'A can read its own location back',
    await a.client.from('profiles_private').select('geo').eq('id', a.id),
  );
  denied(
    "B cannot read A's coordinates",
    await b.client.from('profiles_private').select('geo').eq('id', a.id),
  );
  denied(
    'and geo is gone from profiles entirely',
    await b.client.from('profiles').select('geo').eq('id', a.id),
  );

  // The trap 0002 introduced and 0003 removed: `select *` must work.
  allowed(
    'select * on profiles still works',
    await b.client.from('profiles').select('*').eq('id', a.id),
  );

  // 8. Sending a message into a match that does not exist.
  denied(
    'A cannot message without a match',
    await a.client
      .from('messages')
      .insert({ match_id: '00000000-0000-0000-0000-000000000000', sender_id: a.id, body: 'hi' })
      .select(),
  );

  // ---------------------------------------------------------------------
  // The daily like cap: 6 for free accounts, and passes are exempt.
  //
  // This is the product rule, and it is enforced by a trigger rather than by
  // the client, so it is worth proving against the real database. The pass
  // case matters because an earlier version of the trigger capped passes too,
  // which trapped you on a card you did not want once your likes ran out.
  // ---------------------------------------------------------------------
  console.log('\n--- the daily like cap\n');

  const targetClients = [];
  for (let i = 0; i < 7; i++) {
    targetClients.push(await makeUser(`t${i}`));
  }
  const targets = targetClients.map((t) => t.id);

  let likesAccepted = 0;
  let capError = null;
  for (let i = 0; i < 7; i++) {
    const { error } = await a.client
      .from('swipes')
      .insert({ actor_id: a.id, target_id: targets[i], decision: 'like' });
    if (error) {
      capError = error;
      break;
    }
    likesAccepted++;
  }

  record(
    'a free account gets exactly 6 likes',
    likesAccepted === 6,
    `${likesAccepted} accepted before refusal`,
  );
  record(
    'the 7th like is refused by the database',
    Boolean(capError) && /daily_like_limit_reached/.test(capError?.message ?? ''),
    capError ? capError.message : 'no error raised',
  );

  // At the cap, passing must still work.
  const passAtCap = await a.client
    .from('swipes')
    .insert({ actor_id: a.id, target_id: targets[6], decision: 'pass' })
    .select();
  allowed('passing still works at the cap', passAtCap);

  // ---------------------------------------------------------------------
  // The reciprocal-like trigger: a match appears only when both sides like.
  // ---------------------------------------------------------------------
  console.log('\n--- matching\n');

  // A already liked targets 0..5. Nobody has liked A back yet.
  const beforeMatch = await a.client.from('matches').select('*');
  record(
    'no match exists before the like is returned',
    !beforeMatch.error && (beforeMatch.data ?? []).length === 0,
    beforeMatch.error?.message ?? `${(beforeMatch.data ?? []).length} rows`,
  );

  // target0 likes A back.
  const t0 = targetClients[0];
  allowed(
    'target0 can like A back',
    await t0.client.from('swipes').insert({ actor_id: t0.id, target_id: a.id, decision: 'like' }).select(),
  );

  const afterA = await a.client.from('matches').select('*');
  record(
    'the match is created automatically for A',
    !afterA.error && (afterA.data ?? []).length === 1,
    afterA.error?.message ?? `${(afterA.data ?? []).length} rows`,
  );

  const afterT0 = await t0.client.from('matches').select('*');
  record(
    'and the other side sees the same match',
    !afterT0.error &&
      (afterT0.data ?? []).length === 1 &&
      afterT0.data[0].id === afterA.data?.[0]?.id,
    afterT0.error?.message ?? `${(afterT0.data ?? []).length} rows`,
  );

  // B is a stranger to that match and must not see it.
  const strangerView = await b.client.from('matches').select('*');
  record(
    'a stranger cannot see that match',
    !strangerView.error && (strangerView.data ?? []).length === 0,
    strangerView.error?.message ?? `${(strangerView.data ?? []).length} rows`,
  );

  // Tidy up. The anon key cannot delete an auth user, but each account can
  // hide its own profile, which keeps throwaway rows out of everyone's deck.
  for (const u of [a, b, ...targetClients]) {
    await u.client
      .from('profiles')
      .update({ is_discoverable: false, deleted_at: new Date().toISOString() })
      .eq('id', u.id);
  }
  console.log('\ntest profiles hidden from the deck');

  console.log('');
  const failed = results.filter((r) => !r.passed);
  console.log(`${results.length - failed.length}/${results.length} passed`);
  console.log(
    '\nThis run created 9 throwaway accounts. Delete them in the dashboard\n' +
      'under Authentication -> Users (they all start "nearmatch.rls."), and turn\n' +
      '"Confirm email" back on before launch.',
  );
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
