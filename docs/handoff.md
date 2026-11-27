# Handoff — 27 November 2026

Written for whoever picks this up next, agent or human. It records where
things actually stand, what is unproven, and the traps that cost time to
find. Everything here was observed in this session, not inferred.

If you change something listed here, update this file in the same commit.

---

## What this app is

NearMatch, an Expo SDK 58 / React Native dating app for India, on Supabase.
Continuous Native Generation — there is no `ios/` or `android/` directory and
you must not create one. Native behaviour is configured in `app.json` and
config plugins.

Read `AGENTS.md` first. Its most important rule: **Expo's APIs move between
SDK releases, so do not answer from memory.** Check `package.json` for the
major, then read the matching versioned docs.

---

## The state of the database

Migrations `0001`–`0015` are in `main`.

| | |
| --- | --- |
| `0001` | the initial schema: profiles, matches, swipes, messages, blocks, reports, entitlements, verification_attempts |
| `0002`–`0004` | geo moved off `profiles` into `profiles_private`, feed rebuilt around it |
| `0005`–`0007` | profile photos, message push, premium and verification grant functions |
| `0008` | `verification_attempts.inquiry_id`, so a retried webhook is harmless |
| `0009` | `delete_my_profile()` — a member can erase their own account |
| `0010` | `is_discoverable` defaults false, clamped until a profile is ready |
| `0011` | proximity discovery: six radii, mutual eligibility, coarse locations |
| `0012` | the photo bucket policy, which used to let anyone read any photo |
| `0013` | advisory lock on the like cap |
| `0014` | message rate limits |
| `0015` | the moderation queue |

### Which of these are applied to the live project

**Unknown past `0010`, and you must check rather than assume.** As of this
session's last observation, the live project (`gsogrvpstliezlurjsvf`) had
`0001`–`0008` applied, plus whatever the owner has run since.

Run `supabase/tests/verify_on_supabase.sql` in the SQL editor. It reports 24
checks covering `0001`–`0010`. Checks 1 and 15 are expected to fail locally
but should pass on the live project.

Scripts were prepared for the owner to paste — preflight, the realtime fix,
`0009`+`0010`, and hiding the placeholder profiles. `0011`–`0015` need the
same treatment and had not been written when this session ended.

---

## The two test harnesses, and why there are two

```
supabase/tests/run.sh              privileges, policies, triggers
supabase/tests/run_proximity.sh    anything geographic
```

`run.sh` **stubs PostGIS out** — `geography` becomes `text`, `st_dwithin`
becomes `true`. That is fine for what it tests and fatal for anything about
distance, so migrations that need real geometry carry a
`-- requires-postgis:` marker and `run.sh` skips them, saying so.

`run_proximity.sh` applies the whole chain against real PostGIS. It needs:

```bash
apt-get install -y postgresql-16-postgis-3
```

It skips with a message rather than passing vacuously if PostGIS is missing.
**CI has no PostGIS**, so the proximity assertions do not run there. If you
change `0011` or anything about distance, you must run this harness yourself.

Both need an unprivileged user: `runuser -u postgres -- bash supabase/tests/run.sh`.

### The RLS harness

`supabase/tests/verify_rls.mjs` attacks the **live** API as real users. It
scored 33/34 when last run. Before you run it:

- it needs a `.env` with `EXPO_PUBLIC_SUPABASE_URL` and `_ANON_KEY`
- it needs "Confirm email" turned **off** in Supabase Auth
- **it creates nine accounts it cannot delete.** They are prefixed
  `nearmatch.rls.` and have to be removed by hand under Authentication →
  Users. Do not run it casually.

---

## Open issues

- [#13](https://github.com/YadavMatch/My-rebuild/issues/13) — part 2 is done
  (`0010`); part 1, hiding the ~78 existing placeholder profiles, needs the
  service role. SQL is in `docs/supabase-setup.md`.
- [#20](https://github.com/YadavMatch/My-rebuild/issues/20) — realtime
  messages are not delivered on the live project. The app subscribes
  correctly; `messages` is not in the `supabase_realtime` publication. One
  statement fixes it. Check 15 of `verify_on_supabase.sql` confirms it.

---

## The identity check, and why it is stuck

Persona, Hosted Flow, opened in the system browser. Read
`docs/verification-provider.md` — it is long because the dead ends are
recorded, which is the point.

What works, verified: `verification-start` returns a hosted link; the
template asks for a government ID plus a selfie; India offers driving
licence, national ID, PAN, passport and voter ID, with **no Aadhaar**;
redaction works and sets `redacted-at`; nothing reaches the client but a
result.

**What blocks it is not code.** A completed inquiry parks at *Needs Review*
and no verdict event ever fires, so `verification-webhook` — which acts on
`inquiry.approved`/`declined`/`failed` and ignores `completed`, correctly —
never hears anything. Automating the verdict needs a Workflow with an
*Approve Inquiry* action, which Persona lists as **unavailable on its Startup
plan**.

So the first question is which plan the account is on. If it is Startup, this
feature cannot ship as designed and no amount of code changes that.

Also outstanding there:

- The Sandbox webhook does not exist. Webhooks are **per-environment** and
  fail silently: a completed sandbox inquiry produced zero delivery attempts
  because the only webhook lived in Production. Subscribe it to
  `inquiry.approved`, `inquiry.declined`, `inquiry.failed` — **not**
  `inquiry.completed`.
- Open item 4 of the decision record: Persona's own consent screen says
  biometric data is kept "for no more than 3 years" and used to "improve
  Persona's platform", while `src/app/edit-profile.tsx` tells the user both
  images "are deleted once the check finishes". No code fixes that. It is a
  launch blocker and a decision about what you are willing to promise.

---

## What is genuinely not built

**The moderation queue has no human.** `0015` makes reports queryable and
actionable by something holding the service key. There is no moderator UI, no
notification, no assignment, and resolving a report as `actioned` suspends
nobody. The store copy in `docs/product-spec.md` claims "real moderation";
that is not true yet, and the spec says so.

**Nothing inspects an uploaded photo.** The bucket, its policies and the
picker all work. Moderation on upload needs a service.

**There is no billing.** Premium works end to end in the database — the cap
lifts for a live entitlement, the feed ranks premium likers first — and there
is no way to buy one.

---

## Traps that cost time in this session

**Migration numbering.** `0002` collided once already: the live project had
`0002_hide_geo` applied while `main` carried `0002_verification_inquiry_id`.
The latter was renumbered to `0008`. Check both `main` and any open branch
before choosing a number.

**`run.sh`'s stubs can corrupt qualified calls.** Its sed replaces
`st_distance(pp.geo, me.geo)` with `0`, which turns
`extensions.st_distance(...)` into `extensions.0`. Hence the
`requires-postgis` marker.

**`service_role` in `run.sh` now has `BYPASSRLS`,** as Supabase's does.
Without it a service-role read returns nothing and reads as a broken
function.

**`information_schema.columns` says nothing about a function's OUT columns.**
A privacy check written against it returns no rows and passes vacuously. Use
`pg_proc.proargnames`/`proargmodes`.

**`@example.com` signups are rejected** by the project's Auth settings, so
test users need another domain. `verify_rls.mjs` uses `@gmail.com`.

**`saveLocation` invents a date of birth** (`1900-01-01`) when no
`profiles_private` row exists, which satisfies `0010`'s "has a date of birth"
clamp without the member ever having passed the age gate. Flagged, not fixed.
Worth tightening.

**The Expo token in this environment is expired** — `api.expo.dev` returns
401 on every path, so `expo install --fix`, `expo-doctor` against the API and
`eas build` all fail here. CI's Project health job runs `expo-doctor`
successfully, so use that as the check.

**The agent proxy blocks git ref deletion** (HTTP 403), so stale branches
have to be deleted in GitHub's UI.

---

## Test accounts owed cleanup in the live project

Created by this session and not removable without admin access:

- `claude-verify-test-1795746515@example.com` — `44e2debb-8419-4b41-9f43-373393e55b61`
- `claude-verify-test-1795751324@example.com` — `469fb574-83b0-4f9f-b41d-ec4a836721b2`
- nine accounts prefixed `nearmatch.rls.` from the RLS harness

Sandbox Persona inquiries created during testing were all redacted.

---

## If you are an agent picking this up

The owner's standing rules are in their preferences and they matter:

- read the actual files before proposing changes; do not guess IDs, keys or
  API behaviour
- ask before anything destructive, before touching live Supabase RLS or auth
  settings, and before EAS builds or submissions
- never leave mocked logic in place of real functionality unless asked, and
  label it if you do
- never commit or print API keys, `.p8` files, JWT secrets or Expo tokens
- **run the checks and quote the output.** Do not report something as working
  that you have not seen pass. This file tries to hold to that: where
  something is unverified it says so.
