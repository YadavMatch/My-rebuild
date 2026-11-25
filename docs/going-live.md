# What is left before launch

Everything in the app works against the live Supabase project. Three things
cannot be finished from code alone, because they need accounts only you can
open. This says exactly what each one needs and what is already waiting for
it.

## Migrations

Apply in order, in the SQL editor. Each is wrapped in a transaction, so a
failure leaves nothing half-applied.

| File | What it does |
| --- | --- |
| `0001_initial_schema.sql` | tables, RLS, triggers, the like cap |
| `0002_hide_geo.sql` | stops clients reading exact coordinates |
| `0003_move_geo_private.sql` | moves `geo` to the owner-only table |
| `0004_feed_without_location.sql` | the feed works before a location is set |
| `0005_profile_photos.sql` | the private photo bucket and its policies |
| `0006_message_push.sql` | push notification on a new message |
| `0007_grants.sql` | the only way to award Premium or the badge |

Then run `node supabase/tests/verify_rls.mjs`, which attacks the live project
as two real users and should report every check passing.

## 1. Push notifications — needs EAS

Built: permission flow, token registration, the database trigger that sends
on a new message, block suppression, and deep linking into the conversation.

Needs from you:

1. `eas init`, which writes `extra.eas.projectId` into **app.json**. Without
   it `getExpoPushTokenAsync` cannot mint a token, and the app says so rather
   than failing silently.
2. A development build (`eas build --profile development`). Expo Go dropped
   remote notifications on Android in SDK 53, and iOS needs the APNs
   entitlement that only a real build carries.
3. EAS will offer to create the APNs key on first build. Accept it.

Nothing in the app changes after that; the token registers on first launch.

## 2. Premium — needs an Apple Developer account

Built: the entitlement is read from the server, the daily cap is enforced by
a database trigger, a refused like is surfaced rather than lost, and
`grant_premium` / `revoke_premium` exist and are callable only by
`service_role`.

Not built: the purchase itself. It cannot be, from here — a subscription
product has to exist in App Store Connect before any code can buy it.

Needs from you:

1. An Apple Developer Program membership.
2. A subscription product in App Store Connect, e.g. `nearmatch.premium.monthly`.
3. A receipt validator. The least work is RevenueCat's free tier, which
   validates receipts and sends a webhook on every change.
4. Point that webhook at a function that calls, with the **service key** and
   never from the app:

   ```
   grant_premium(target, expires, store_name, transaction_id)
   revoke_premium(target)
   ```

   The service key belongs on that server only. It bypasses every policy in
   the schema; nothing in this repository should ever hold it.

The paywall and the Premium tab are labelled as a simulation until this is
connected, and the Settings toggle that fakes it is hidden once you have an
account, so nobody is shown a subscription that does not exist.

## 3. Identity verification — needs a provider

Built: `verification_attempts`, and `record_verification(target, passed,
provider)` which records the outcome and sets the badge, callable only by
`service_role`. A client cannot award itself the badge; that is asserted by
the test suite against the live project.

Not built: the check itself, which needs a vendor — Persona, Veriff and
Stripe Identity all do liveness plus document matching.

Needs from you: an account with one of them, then a webhook that calls
`record_verification` with the service key.

Note that the schema deliberately has no column for the photograph. The
check runs at the provider, the result is recorded, the image never reaches
the database — which is also what keeps a breach from being a far worse one.

## Before you ship

- Turn **Confirm email** back on: Authentication → Sign In / Providers → Email.
  It is off for development, which means anyone can sign up as an address
  they do not own.
- Delete the test accounts: Authentication → Users, everything starting
  `nearmatch.rls.`, `demo.`, `pair.`, `cap.` and similar.
- Phone sign-in needs DLT registration with an Indian telecom operator if you
  want it. Email works without it.
