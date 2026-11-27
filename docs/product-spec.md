# NearMatch — product spec

The positioning copy below is the product target. It is **not** the App Store
listing yet: several claims describe work that is not built. The status table
after it tracks which are true today.

Write the real store listing at submission time, against what actually ships
then. Claiming verification, moderation or age-gating the app does not have
fails App Review guideline 2.3.1, and for a dating app those are safety
representations rather than marketing.

---

## Positioning

> NearMatch is a dating app built the way dating apps should have been built
> from day one — with real verification, real moderation, and a real backend
> behind every swipe, not a slick front end covering a fragile core.
>
> **DISCOVER PEOPLE NEARBY**
> Browse a smart candidate feed that never repeats someone you've already
> swiped on, sorted by real proximity — not guesswork.
>
> **MATCH & CHAT INSTANTLY**
> Matches are created the moment two people like each other, and messages
> arrive in real time — no refreshing, no waiting.
>
> **VERIFIED, REAL PROFILES**
> Add an actual photo or pick an avatar, write a bio, and share your
> interests. An optional ID check — a government ID plus a selfie, matched
> against each other — adds a visible Verified badge. Neither the document
> nor the photo is kept after the check.
>
> **SAFETY BUILT IN, NOT BOLTED ON**
> - Every signup requires an explicit, timestamped 18+ confirmation
> - Blocking is enforced everywhere — a blocked person can't reconnect
>   through any path
> - One-tap reporting on any profile or conversation
> - Swipes and messages are rate-limited to keep spam and bots out
>
> **GO PREMIUM WHEN YOU'RE READY**
> Free to join and swipe. Upgrade to Premium anytime for unlimited daily
> likes and to see everyone who's already liked you — no more guessing.
>
> NearMatch is rolling out across India, with a focus on cities that
> incumbent apps have overlooked.
>
> You must be 18 or older to use NearMatch.

---

## Status

| Claim | Status | What it needs |
| --- | --- | --- |
| Feed never repeats a swipe | **Done** | — |
| Sorted by real proximity | **Done** | — `discover_feed` filters on `st_dwithin` and orders by `pp.geo <-> me.geo`; location is captured by `expo-location` into `profiles_private.geo` |
| Match on mutual like | **Done** | — the `swipes_create_match` trigger does it server-side; verified against the live project by `verify_rls.mjs` |
| Real-time messages | **Built, broken in production** | The app subscribes to `postgres_changes` on `messages`, but the live project delivers nothing — see [#20](https://github.com/YadavMatch/My-rebuild/issues/20). One SQL statement away |
| Photo upload / avatar choice | **Built** | Moderation on upload. The bucket, its four policies and the picker all exist; nothing inspects what is uploaded |
| ID + selfie check, nothing kept | **Starting works; finishing blocked** | A decisioning step in Persona. A completed inquiry parks at Needs Review and no verdict event ever fires, so the badge cannot set itself — and the step that would automate it is not on Persona's Startup plan. See open items 4 and 5 of the [decision record](verification-provider.md); "nothing kept" is separately contradicted by Persona's own consent screen |
| Timestamped 18+ confirmation | **Done** | — |
| Blocking enforced everywhere | **Done** | — enforced server-side at nine call sites: the feed, the matches and messages policies, and the swipes trigger. `verify_rls.mjs` also proves a push is suppressed after a block |
| One-tap report on profile | **Done** | Moderation queue to receive it |
| One-tap report on conversation | **Done** | Moderation queue to receive it |
| Swipe and message rate limits | **Likes capped; messages not** | A message rate limit. Likes are capped by a database trigger, so the client cannot talk its way past it; nothing limits messages |
| Free tier: 6 likes a day | **Done** | — enforced by the `swipes_rate_limit` trigger and verified against the live project: the 7th like is refused with `daily_like_limit_reached` |
| Premium: unlimited likes | **Done in the database** | Billing. The cap already reads `entitlements` and lifts for a live premium row; there is no way to buy one |
| Premium: priority likes | **Done** | Real users. `discover_feed` already ranks a premium liker above a non-premium liker above everyone else |
| Premium: see who liked you | **Backend has it; the screen does not** | `src/app/(tabs)/likes.tsx` still reads the local decisions store. The inbound likes are in `swipes` and the feed already joins them |

## Build order

Sequenced so each step unblocks the next rather than by feature glamour.

1. **Age gate** — required for submission, no dependencies. *Done.*
2. **Backend and auth** — the single largest unlock. Real accounts make
   matching, inbound likes, enforced blocking and rate limits possible at
   all. Everything below depends on it. *Done:* every screen reads through
   the `DataService` contract, which serves sample data when signed out and
   the real backend as soon as there is a session.
3. **Server-side blocking and the moderation queue** — safety claims become
   true. *Blocking is done*, enforced at nine server-side call sites rather
   than in the client. **The moderation queue is not built**, so reports
   still reach nobody — which is the remaining half of the safety claim and
   the more important half.
4. **Photos** — upload and storage *done*; **moderation on upload is not**.
   Nothing inspects an image before it is public.
5. **Real-time messaging** — *written*, and broken on the live project: the
   `messages` table appears not to publish changes. See
   [#20](https://github.com/YadavMatch/My-rebuild/issues/20).
6. **Location and proximity sorting** — *done.* Geo lives in
   `profiles_private`, never on `profiles`, and the feed filters and orders
   by real distance.
7. **Identity verification** — *written, configured, and starting works end
   to end; finishing does not.* See
   [`verification-provider.md`](verification-provider.md). Persona's Hosted
   Flow: a government ID plus a selfie matched against it, verify-then-discard
   as the copy promises — the result is recorded and the whole inquiry,
   document and selfie both, is deleted at the provider in the same handler.
   Scope changed on 27 November from a selfie-only liveness check to a
   document check.

   What is settled since: the Indian document coverage is confirmed by
   driving the live flow (driving licence, national ID, PAN, passport, voter
   ID — no Aadhaar), `verification-start` returns a hosted link, and
   redaction works. What blocks it is **a decisioning step in Persona**: a
   completed inquiry parks at Needs Review, no verdict event fires, and the
   badge therefore cannot set itself. Automating that needs a Workflow step
   Persona does not offer on its Startup plan, so the account's plan decides
   whether this feature can ship at all. Open item 5 of the record.
8. **Premium** — *the mechanics are done*: the 6-a-day free cap, its lift for
   a live premium entitlement, and priority placement in the feed all work in
   the database. What is missing is **billing** — there is no way to buy an
   entitlement — and the inbound-likes screen, which still reads a local
   store rather than the `swipes` rows the feed already joins.
