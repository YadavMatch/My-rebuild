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

## 2. Run the migrations

There are seven now, applied in order. `docs/going-live.md` lists what each
one does and what still needs an account of yours.


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

### PostGIS

The migration installs it into the `extensions` schema, which is where
Supabase expects extensions to live, and puts that schema on the search path
for the rest of the file. You should not need to do anything by hand. If the
extension line fails on your plan, enable **postgis** under
**Database → Extensions** and run the migration again — it is transactional,
so the failed attempt left nothing behind.

## 3. Check it landed

Paste `supabase/tests/verify_on_supabase.sql` into the SQL editor and run it.
It writes nothing — it inspects the catalogue and prints a row per property:

```
 #  |                           check                            | result
----+------------------------------------------------------------+--------
  1 | PostGIS installed                                          | PASS
  3 | Row-level security on every public table                   | PASS
  9 | Clients CANNOT update profiles.verified                    | PASS
 10 | Clients CAN still update profiles.bio                      | PASS
 11 | Clients CANNOT update entitlements (no Premium self-grant) | PASS
 ...
```

Every row should say PASS. If any says FAIL, send me the output rather than
pointing the app at the project — a FAIL on rows 9 to 12 means a client could
grant itself a verified badge or Premium.

If you run the migration twice it refuses with
`NearMatch schema is already applied to this database. Nothing was changed.`
rather than a confusing duplicate-object error, and changes nothing.

## 4. Turn on phone sign-in

**Authentication → Providers → Phone.**

This is the part that costs money and paperwork rather than effort. Supabase
does not send the SMS itself — you connect a provider (MSG91 or Twilio are
the usual choices for India), and sending transactional SMS to Indian numbers
requires **DLT registration** with a telecom operator. Start that early; it
is not same-day.

For development you can leave phone off and use email sign-in, which needs no
provider. That is what the app signs in with today.

### Email confirmation, during development

**Authentication → Sign In / Providers → Email → Confirm email.**

Leave this **off while building**. With it on, signing up returns an account
with no active session until the link in the email is clicked, so a new user
cannot get into the app — and neither can an automated check, which is what
verifies that row-level security actually holds for a signed-in person.

The sign-up screen handles confirmation correctly either way: when a sign-up
comes back without a session it stops on "check your email" rather than
opening the deck as though it had worked.

**Turn it back on before launch.** Without it, anyone can create an account
against an address they do not own.

## 5. Send me two values

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

Spins up a throwaway Postgres, applies every migration in order and asserts
the security properties: that a client cannot grant itself a verified badge
or Premium, cannot forge a match or a verification, cannot read anyone else's
swipes or date of birth, that blocking hides a conversation from both sides
at once, and that one Persona inquiry can only ever record one attempt.

It needs an unprivileged user — `initdb` refuses to run as root — so under a
root shell, `runuser -u postgres -- bash supabase/tests/run.sh`.

Worth running after any schema change. Two of those assertions failed the
first time they were written, including one that let a client verify itself.

The webhook's signature check has its own test, since `verify_jwt` is off for
that endpoint and the signature is all that protects it:

```bash
node --experimental-strip-types supabase/tests/verification_signature.mjs
```

Both run in CI.

---

## The identity check

Separate from the steps above, and only needed when you want verification
working. The reasoning behind the provider choice is in
[`verification-provider.md`](verification-provider.md); this is just what to
do.

### 1. Apply the later migrations

The first migration is `0001_initial_schema.sql`. Anything numbered above it
applies the same way — paste it into the SQL editor, or `npx supabase db
push`. Each is wrapped in a transaction and safe to run twice.

`0008_verification_inquiry_id.sql` is what makes a retried webhook harmless:
without it, each of Persona's retries records another attempt for the same
check.

**Why this branch jumps from 0001 to 0008.** Migrations 0002 to 0007 are not
missing: they live on `claude/stoic-cerf-j3hy5o`, which has never been merged,
and they move geo into `profiles_private`, add profile photos, message push
and the premium grant functions. They were applied to the live project before
0008 was, so numbering the verification migration 0002 would both claim it ran
first and collide with that branch's own `0002_hide_geo.sql`. The range is
reserved on purpose.

Two consequences worth knowing, because neither is obvious from this branch:

- **These migrations do not reproduce the live database.** `0001` creates
  `profiles.geo` with a GIST index and `discover_feed` reads it; production has
  no such column, because `0003_move_geo_private.sql` dropped it and moved geo
  to `profiles_private`. Confirmed on 27 November against the live project:
  selecting `profiles.geo` returns `42703 column does not exist`, while
  `profiles_private.geo` reads fine. So a fresh database built from this branch
  alone is **not** a copy of production, and `supabase db reset` against this
  branch would not give you one.
- **`supabase/tests/verify_rls.mjs` is not on this branch either.** It is the
  RLS harness, it lives on that same branch, and anything that tells you to run
  it will fail here until the branch is merged.

Then paste `supabase/tests/verify_on_supabase.sql` again and confirm rows
**17** and **18** read PASS. They are specifically the 0008 checks, so they
fail on a project that has only had 0001 applied.

### 2. Set the function secrets

Three, all server-only. None of them may become an `EXPO_PUBLIC_` variable:
those are compiled into the app bundle where anyone can read them, and the
Persona key can read every selfie in the account.

```bash
npx supabase secrets set PERSONA_API_KEY=... PERSONA_TEMPLATE_ID=itmpl_... PERSONA_WEBHOOK_SECRET=...
```

- `PERSONA_API_KEY` — a server-side key from the Persona dashboard.
- `PERSONA_TEMPLATE_ID` — the inquiry template, which must contain a
  **government ID step and a selfie verification**, so the face on the
  document is matched against a live face. Two things to get right in it:
  the template must be in the **same Persona environment as the API key**
  (a sandbox key cannot see a production template, which fails as a rejected
  inquiry and a 502 from `verification-start`), and its accepted documents
  must cover what your users actually hold. Choose **passport, driving
  licence, voter ID and PAN** — Persona's documented Indian classes are `pan`
  and `vid`, with driving licence and passport as generic ones. Driving the
  live sandbox flow on 27 November showed India offering exactly **Driver
  License, National ID, PAN Card, Passport and Voter ID**, which matches
  those classes, so the documented set can be trusted here; the dashboard's
  coverage map remains the authority for any other country.
  **Aadhaar is not on offer through Persona at all**, and the routes that do
  support it are separate integrations with their own registration: see
  *Indian documents, and the Aadhaar question* in
  [`verification-provider.md`](verification-provider.md).
- `PERSONA_WEBHOOK_SECRET` — the signing secret for the webhook. The handler
  rejects every request whose signature does not match, and `verify_jwt` is
  off for that function, so this secret is the only thing protecting it.

A secret name cannot begin with `SUPABASE_`; the dashboard rejects it.

### 3. Deploy the functions

```bash
npx supabase functions deploy verification-start verification-webhook
```

`verify_jwt` is already set to false for `verification-webhook` in
`config.jsonc`, because Persona has no Supabase JWT to present.

### 4. Point Persona at the webhook

Its URL is the deployed `verification-webhook` endpoint. Three things have to
be right, and getting any of them wrong fails silently:

- **Create it in the same Persona environment as the API key.** Webhooks do
  not cross environments. A webhook registered in Production delivers nothing
  for a sandbox inquiry — no error, no retry, an empty delivery log. On 27
  November a completed sandbox inquiry produced zero delivery attempts for
  exactly this reason, and nothing anywhere reported a problem.
- **Subscribe it to `inquiry.approved`, `inquiry.declined` and
  `inquiry.failed`.** Not `inquiry.completed`: the handler ignores that one
  deliberately, because completing the steps is not the same as passing, so a
  webhook subscribed only to `completed` gets a 204 and never sets a badge.
- **Set `PERSONA_WEBHOOK_SECRET` to that webhook's secret**, not another
  environment's. A mismatch shows up as HTTP 401 in Persona's delivery log;
  an unset secret shows up as 503 `Not configured`. Those two responses tell
  the two faults apart without reading function logs.

Add the app's scheme, `myrebuild://`, to Persona's redirect allowlist only if
you later decide the flow should redirect — the client does not rely on one,
because the verdict reaches the server directly.

### 5. Give Persona something that issues verdicts

**Without this step the badge never appears, and nothing reports an error.**
A completed inquiry is not an approved one: it sits at **Needs Review** until
a post-inquiry Workflow or a human decides it. The webhook handler only acts
on a verdict, so an account with no decisioning logic produces a flow that
runs perfectly and changes nothing.

Build it under Automation → All Workflows, add an **Inquiry → Approve
Inquiry** action, then Save **and Publish** — publishing is a separate step.
Write the flagging rules first and auto-approve in the `else` branch rather
than approving everything that completes.

Check the account's plan first. Persona lists the Approve Inquiry step as
**not available on the Startup Program**. On that plan every signup needs
manual approval in the dashboard, which is not something this feature can
launch on. See open item 5 in
[`verification-provider.md`](verification-provider.md).

While you are in the dashboard, ask Persona support to set up a retention
policy. The handler already deletes each inquiry after recording the result;
the policy is a second line of defence if a webhook is ever lost.

### 6. Check it end to end

Run a sandbox verification on a real device. Three things to confirm, all
noted as unresolved in the decision record:

- ~~The template can **read the documents your users hold**.~~ *Confirmed
  on 27 November by driving the flow.* Selecting India offers Driver
  License, National ID, PAN Card, Passport and Voter ID. No Aadhaar; see the
  decision record.

- The **camera opens** in the browser the check launches in. The flow opens
  in the system browser (Safari or Chrome) rather than an in-app one, which
  is a browser Persona supports outright, so this should be a formality —
  but it has not been run on a device yet. Note their two requirements:
  cameras below 640×480 are unsupported, and file upload is disabled by
  default on mobile, under Configure → General → Image capture methods, and
  the toggles are set **separately for desktop web, mobile web and native
  mobile apps**. Only *mobile web* governs this app, which opens the Hosted
  Flow in Safari or Chrome; *native mobile apps* applies to Persona's Mobile
  SDK, which this app does not use.

  Driving the flow from a headless browser shows no file input and a QR-code
  handoff, but that observation does not settle the mobile-web setting:
  Persona appears to classify a headless browser as desktop web whatever user
  agent it sends, since it offers "Continue on another device" even to an
  iPhone user agent with a working camera, and renders no `<video>` element.
  Whether upload is available on mobile web can only be seen on a real
  phone.
- The webhook payload carries a **`reference-id`**. The user id is sent in
  `meta.auto-create-account-reference-id` and nowhere else. Sending it in
  both places as well was tried and is rejected outright — Persona answers
  `400 data.attributes.reference_id cannot be present with
  meta.auto_create_account_reference_id` — so it is not a belt-and-braces
  option. Verified against the sandbox API: with only the non-deprecated
  field sent, the created inquiry still comes back with
  `data.attributes.reference-id` set to that value, which is what the webhook
  maps on. Still unconfirmed on an actual webhook delivery: a sandbox
  verification was completed on 27 November, but it parked at **Needs
  Review** and the only webhook was registered in another environment, so
  nothing was ever delivered. Steps 4 and 5 above are what that run
  uncovered.
