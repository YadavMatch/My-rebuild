# Supabase setup

What you need to do, and what I need back. Should take about fifteen minutes.

The schema is already written and tested — see
[`data-model.md`](data-model.md) for why it looks the way it does.

---

## 1. Create the project

At [supabase.com/dashboard](https://supabase.com/dashboard), create a new
project.

**Choose the Mumbai region (`ap-south-1`).** NearMatch handles sensitive
personal data for people in India, and region is not something you can change
later without migrating. If you are taking a view on DPDP obligations, take
it before this step rather than after.

Save the database password somewhere safe. You will not be shown it again,
and you need it for the CLI.

## 2. Run the migration

Easiest path — the dashboard:

1. Open **SQL Editor**
2. Paste the whole of `supabase/migrations/0001_initial_schema.sql`
3. Run it

It is wrapped in a transaction, so it either applies completely or not at
all. There is nothing to undo if it fails.

Or with the CLI, if you prefer:

```bash
npx supabase link --project-ref <your-project-ref>
```

```bash
npx supabase db push
```

### Enable PostGIS first

The migration starts with `create extension if not exists postgis`. On most
Supabase projects that works as-is. If it complains, enable **postgis** under
**Database → Extensions** and run the migration again.

## 3. Turn on phone sign-in

**Authentication → Providers → Phone.**

This is the part that costs money and paperwork rather than effort. Supabase
does not send the SMS itself — you connect a provider (MSG91 or Twilio are
the usual choices for India), and sending transactional SMS to Indian numbers
requires **DLT registration** with a telecom operator. Start that early; it
is not same-day.

For development you can leave phone off and use email sign-in, which needs no
provider.

## 4. Send me two values

From **Project Settings → API**:

- **Project URL** — `https://<ref>.supabase.co`
- **anon / public key** — the long one labelled `anon`

Both are safe to share and safe to ship: the anon key is designed to live
inside the app, and row-level security is what actually protects the data.

**Do not send the `service_role` key.** It bypasses every policy in the
schema. It belongs only in server-side code, and nothing in this repo needs
it.

I will put them in `.env`, which is gitignored:

```
EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

---

## What happens after that

I rewrite `src/services` against Supabase. The screens do not change, because
they only ever call that layer — which is the whole reason it was built that
way.

In order:

1. **Auth** — sign-up and sign-in, and the age gate writing to
   `profiles_private` instead of device storage
2. **Profiles and the feed** — `discover_feed()` replacing the seed deck
3. **Swipes and matches** — the trigger making the match, as tested
4. **Messages** — including realtime, which is the part the current app
   cannot fake at all
5. **Blocking and reports** — enforced server-side at last
6. **Photos** — Supabase Storage, with moderation on upload

The app keeps working on seed data throughout: `isSupabaseConfigured` is
false until the two values exist, so nothing breaks while this is in
progress.

## Verifying the schema yourself

```bash
./supabase/tests/run.sh
```

Spins up a throwaway Postgres, applies the migration and asserts the
security properties: that a client cannot grant itself a verified badge or
Premium, cannot forge a match or a verification, cannot read anyone else's
swipes or date of birth, and that blocking hides a conversation from both
sides at once.

Worth running after any schema change. Two of those assertions failed the
first time they were written, including one that let a client verify itself.
