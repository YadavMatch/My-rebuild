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
| Sorted by real proximity | Not built | Location permission, geo queries server-side |
| Match on mutual like | Simulated | Backend with both users' likes |
| Real-time messages | Not built | Realtime subscriptions |
| Photo upload / avatar choice | Not built | Storage bucket, image picker, moderation on upload |
| ID + selfie check, nothing kept | **Built, unconfigured** | A sandbox template whose documents cover India, and whether the camera opens in the in-app browser |
| Timestamped 18+ confirmation | **Done** | — |
| Blocking enforced everywhere | Client-side only | Server-side filtering on feed, matches and messages |
| One-tap report on profile | **Done** | Moderation queue to receive it |
| One-tap report on conversation | **Done** | Moderation queue to receive it |
| Swipe and message rate limits | Not built | Server-side counters; client limits are advisory only |
| Free tier: 6 likes a day | Not built | Daily like cap |
| Premium: unlimited likes | Not built | The cap, then billing |
| Premium: priority likes | Not built | Feed ordering; needs real users |
| Premium: see who liked you | Not built | Backend storing inbound likes |

## Build order

Sequenced so each step unblocks the next rather than by feature glamour.

1. **Age gate** — required for submission, no dependencies. *Done.*
2. **Backend and auth** — the single largest unlock. Real accounts make
   matching, inbound likes, enforced blocking and rate limits possible at
   all. Everything below depends on it.
3. **Server-side blocking and the moderation queue** — safety claims become
   true. Reports must reach a human.
4. **Photos** — upload, storage, and moderation on upload.
5. **Real-time messaging.**
6. **Location and proximity sorting.**
7. **Identity verification** — *provider chosen and the pipeline written;
   see [`verification-provider.md`](verification-provider.md).* Persona's
   Hosted Flow: a government ID plus a selfie matched against it,
   verify-then-discard as the copy promises — the result is recorded and the
   whole inquiry, document and selfie both, is deleted at the provider in the
   same handler. Scope changed on 27 November from a selfie-only liveness
   check to a document check; the record explains what that moved. Not yet
   live — the template's Indian document coverage is unconfirmed, and the
   camera has not been shown to work inside the in-app browser.
8. **Premium** — the 6-a-day free cap, unlimited and priority placement for
   subscribers, inbound likes, then billing.
