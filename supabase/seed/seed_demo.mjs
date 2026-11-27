/**
 * Fills a development project with the demo profiles the app ships.
 *
 * A fresh Supabase project has no people in it, so the deck is empty and
 * nothing downstream — matching, chat, the like cap — can be exercised. This
 * creates one real account per profile in src/data/profiles.json, with
 * locations around Bengaluru so proximity labels have something to compute.
 *
 * Development only. It needs email confirmation off, and it writes each
 * profile as itself, through the same RLS every client goes through — there
 * is no service_role key here and none is wanted.
 *
 *   node supabase/seed/seed_demo.mjs [uuidOfAccountTheyShouldLike]
 *
 * Pass a user id and every demo profile likes that account, so signing in as
 * it produces instant matches to test chat with.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const env = Object.fromEntries(
  readFileSync(new URL('.env', root), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const profiles = JSON.parse(readFileSync(new URL('src/data/profiles.json', root), 'utf8'));

// Bengaluru. Offsets are chosen so the computed label roughly matches the
// proximity each profile was written with.
const CENTRE = { lon: 77.6408, lat: 12.9784 };
const KM = 1 / 111; // degrees per km, near enough at this latitude
const offsetFor = (label) => {
  const km = label === 'Nearby' ? 0.8 : Number.parseInt(label, 10) || 3;
  const angle = Math.random() * Math.PI * 2;
  return {
    lon: CENTRE.lon + Math.cos(angle) * km * KM,
    lat: CENTRE.lat + Math.sin(angle) * km * KM,
  };
};

const anon = () =>
  createClient(URL_, KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

async function assertAutoconfirmOn() {
  const r = await fetch(`${URL_}/auth/v1/settings`, { headers: { apikey: KEY } });
  if ((await r.json()).mailer_autoconfirm !== true) {
    throw new Error(
      'Email confirmation is ON. Each account would need a real mailbox.\n' +
        'Authentication -> Sign In / Providers -> Email -> turn off "Confirm email".',
    );
  }
}

const likeTargetId = process.argv[2];

async function main() {
  await assertAutoconfirmOn();

  // Prompt ids are assigned by the catalogue, so look them up by question.
  const { data: catalogue, error: promptErr } = await anon().from('prompts').select('id, question');
  if (promptErr) {
    throw new Error(`could not read the prompt catalogue: ${promptErr.message}`);
  }
  const promptId = new Map(catalogue.map((p) => [p.question, p.id]));

  const created = [];
  for (const p of profiles) {
    const client = anon();
    const email = `demo.${p.name.toLowerCase()}.${Date.now()}@gmail.com`;
    const password = `Demo-${p.name}-${Math.random().toString(36).slice(2)}-4x`;

    const { data: signUp, error: signUpErr } = await client.auth.signUp({ email, password });
    if (signUpErr || !signUp.session) {
      console.log(`SKIP  ${p.name}: ${signUpErr?.message ?? 'no session returned'}`);
      continue;
    }
    const id = signUp.user.id;

    const { error: profErr } = await client
      .from('profiles')
      .update({
        name: p.name,
        age: p.age,
        job_title: p.jobTitle,
        location_label: p.location,
        bio: p.bio,
        interests: p.interests,
        emoji: p.emoji,
        is_discoverable: true,
        last_active_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (profErr) {
      console.log(`FAIL  ${p.name}: ${profErr.message}`);
      continue;
    }

    const { lon, lat } = offsetFor(p.proximity);
    const { error: privErr } = await client.from('profiles_private').upsert({
      id,
      date_of_birth: new Date(Date.now() - p.age * 365.25 * 864e5).toISOString().slice(0, 10),
      age_confirmed_at: new Date().toISOString(),
      geo: `POINT(${lon.toFixed(6)} ${lat.toFixed(6)})`,
    });
    if (privErr) {
      console.log(`WARN  ${p.name}: no location (${privErr.message})`);
    }

    for (const [i, prompt] of p.prompts.entries()) {
      const pid = promptId.get(prompt.question);
      if (!pid) continue;
      await client
        .from('profile_prompts')
        .upsert({ profile_id: id, prompt_id: pid, answer: prompt.answer, position: i });
    }

    created.push({ name: p.name, id, email, password, client });
    console.log(`OK    ${p.name}  ${email}`);
  }

  console.log(`\n${created.length}/${profiles.length} demo profiles created.`);

  // Make them like a given account, so signing in as it yields instant
  // matches. The trigger turns the second like into the match itself.
  if (likeTargetId) {
    let liked = 0;
    for (const c of created) {
      const { error } = await c.client
        .from('swipes')
        .insert({ actor_id: c.id, target_id: likeTargetId, decision: 'like' });
      if (!error) liked++;
    }
    console.log(`${liked}/${created.length} demo profiles have liked ${likeTargetId}.`);
  }

  console.log('\nCredentials for signing in as a demo profile:');
  created.slice(0, 3).forEach((c) => console.log(`  ${c.name}: ${c.email} / ${c.password}`));
}

main().catch((e) => {
  console.error('\n' + e.message);
  process.exitCode = 1;
});
