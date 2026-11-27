# NearMatch — identity verification provider

Build step 7 in [`product-spec.md`](product-spec.md) needs a provider. This
records which one, why the other two were rejected, and what is still
unverified — so the choice can be re-examined later without redoing the
research.

**Decision: Persona, through its Hosted Flow.** Not its React Native SDK.

> **Amended 27 November 2026 — the requirement changed.** This document was
> written for a **selfie-only** liveness check. The product decision is now
> **government ID + selfie**: the document is read and the selfie's face is
> matched against the photo on it. That is identity verification, not just
> liveness.
>
> What that changes, and what it does not:
>
> * **Persona still fits**, and no code changed. The functions pass a
>   template id and Persona's template decides the steps, so this was a
>   configuration change.
> * **Constraint 1 below is inverted** — it argued for selfie-only. It is
>   kept, struck through, because the reasoning it records is why the first
>   templates were built that way.
> * **Veriff's main disqualification no longer applies.** It was rejected
>   partly for having no selfie-only path; document + selfie is its core
>   product. Its deletion cap still conflicts with discarding per
>   verification, so the conclusion stands, but on one ground instead of two.
> * **Stripe Identity is unaffected** — still out, because India is not a
>   supported business location.
> * **The privacy exposure grows.** See open question 3.

The decision is final on provider. It is **not yet proven runnable**: one
technical question is open, and it is the kind that can send the integration
down a different path. See *What this does not settle*.

Checked 25 November 2026. Every number and endpoint below came from the
provider's own docs or pricing pages on that date; pricing pages move, so
re-check before signing anything.

---

## What the check has to do

Four constraints, and they do most of the deciding.

**1. A government ID, and a selfie matched against it.** *(Amended; the
original read "A selfie, with no government ID" — the reasoning for that is
below, because it explains how the first templates were configured.)*
The check reads an identity document and compares the face on it with a live
selfie. That proves who someone is, not only that they are real.

> ~~The copy in `product-spec.md` promises an "AI selfie check" that adds a
> Verified badge. It does not promise document KYC, and NearMatch has no
> regulatory reason to collect identity documents. A provider that can only
> check a selfie *against an ID* cannot implement what the app says it
> does.~~
>
> Superseded. The copy has been changed to describe a document check, and
> the regulatory weight that argument avoided is now accepted deliberately
> — see open question 3.

**2. The document and the photo are discarded.**
`verification_attempts` in `supabase/migrations/0001_initial_schema.sql` has
no column for an image or for any identity field, by design. That makes the
promise structural on our side, but the provider still holds the selfie and
now the document too — so the provider must offer deletion we can call per
verification, not a retention window measured in months. With an identity
document in the flow, this constraint matters more than it did, not less.

**3. The badge is awarded server-side only.**
`revoke insert, update, delete on verification_attempts from authenticated`,
plus the column-level grants on `profiles`, mean no client can record a
result or set `verified`. The provider must therefore support a
server-to-server webhook. A client-side SDK callback is not sufficient — it
can be made to lie.

**4. It must work under Continuous Native Generation.**
Expo SDK 58, React Native 0.88, no `ios/` or `android/` directories. A
provider whose only mobile path is a hand-linked native SDK costs a config
plugin and a dev build before the first test.

---

## Why not Stripe Identity

Rejected on two independent counts, either one fatal.

**It cannot onboard an Indian business.** Stripe's own
`docs.stripe.com/identity/use-cases` says Identity is "generally available
for businesses based in" **GB, JP, US**, with a self-serve public beta for
around thirty EU, Canadian, Australian and New Zealand countries. India is on
neither list.

The trap here is worth recording, because it is easy to get wrong: India *is*
in Identity's document-coverage list of roughly 150 countries. That list is
about whose passports Stripe can read, not about where the merchant may be.
Document coverage is not account eligibility.

**It has no selfie-only mode** — *no longer a disqualification either.* The
27 November amendment voids this one the same way it voids Veriff's second
reason. Selfie on Stripe is an option on a document session
(`options.document.require_matching_selfie: true`), matching face geometry
between an ID and a selfie — which is precisely the amended requirement. So
Stripe now fails on **one** ground rather than two, and that ground is
enough: a business in India cannot buy it at all.

For reference, had it been available: $1.50 per verification, first 50 free.

---

## Why not Veriff

Veriff is the closest call, and it wins on two real points: its pricing is
public and self-serve (no sales call, $0.80 per verification on Essential
against a $49 monthly minimum, a 15-day trial with 50 free live
verifications), and it has a hosted redirect flow at
`magic.veriff.me/v/{sessionURL}` that needs no mobile SDK. Indian passports,
ID cards and driver's licences are supported.

It fails constraint 2, decisively.

**Deletion is rate-limited below our throughput.** `DELETE /v1/sessions/{id}`
is Premium-only ($1.89 per verification, $209 monthly minimum), is "not
available by default" and must be enabled through a Solutions Engineer, and
is capped at **10 sessions per 24 hours and 5 per hour**. Verify-then-discard
means one deletion per verification. Eleven signups in a day and the promise
in the app is false. Buying the most expensive tier does not raise the cap.

**Default retention is months.** Three on Essential, six on Plus and Premium,
and Veriff reserves the right to "retain the Personal Data for its own
purposes irrespective of the retention schedule." The selfie sits on their
infrastructure either way.

**No selfie-only first verification** — *no longer a disqualification.* This
was the second reason for rejecting Veriff, and the 27 November amendment
removes it: document + selfie is Veriff's core product, with Indian
passports, ID cards and driving licences supported. The deletion cap above
is now the only thing ruling it out, and it rules it out on its own. Kept for
the record: Biometric Authentication is a returning-user product that matches
a selfie against an earlier enrolment, and selfie-only enrolment needed a
Solutions Engineer to configure.

If Persona ever falls through, Veriff is the first place to look again — but
check the deletion cap first, because nothing else about it has changed.

---

## Why Persona

**Government ID and selfie, in one template.** Persona's selfie verification
is documented as: "The individual is asked to take a video of their face in
real-time, and Persona checks that the individual is live and real," and face
*comparison* happens "if a government ID was also submitted." The amended
requirement needs exactly that pairing, and it is a template setting rather
than a different product — which is why the switch cost no code.

**This re-opens a gap the original version dismissed.** Persona's per-country
*document* coverage sits behind a dashboard map that could not be read, so
**Indian ID support is still unconfirmed**. When the check was liveness-only
that did not matter, because a face is not a document. It matters now: the
flow is useless if it cannot read the documents Indian users actually hold.
Confirm in the dashboard which Indian documents the template accepts before
relying on this.

On which documents to accept: passport, driving licence and voter ID are
ordinary choices. **Aadhaar carries its own legal constraints in India** on
collection and storage, and should stay out of the accepted set without
advice. Persona does expose an Aadhaar database check
(`verification/database-aadhaar`) if that is ever wanted deliberately.

**Deletion is an ordinary API call with no cap.**
`DELETE /api/v1/inquiries/{inquiry-id}` "permanently deletes personally
identifiable information (PII) for an Inquiry and all associated
Verifications, Reports, or other Persona resources" and "cannot be undone."
There is an account-level equivalent at
`DELETE /api/v1/accounts/{account-id}`. No tier gate, no rate limit, no
support ticket to enable it. Persona also offers a standing retention policy
on request, which is belt-and-braces on top of calling it ourselves.

**Hosted Flow needs no native code.** A URL of the form
`https://<subdomain>.withpersona.com/verify?...`. No SDK, no config plugin,
no prebuild — constraint 4, met by not engaging with it at all. The
`redirect-uri` parameter "supports custom schemes such as mobile intents",
which matches `"scheme": "myrebuild"` already set in `app.json`, and Persona
returns `inquiry-id`, `reference-id` and `status` on the way back.

---

## Hosted Flow, not the React Native SDK

`react-native-persona` exists, and it is the wrong tool here.

Its documentation mentions Expo only in troubleshooting, where it tells you
to run `npx expo run:android` or `npx expo run:ios` to generate the native
projects — i.e. to abandon CNG. It wants the Persona Maven repository in
`android/build.gradle`, `compileSdkVersion` 33+, AGP 8+, an iOS deployment
target of 13, and CocoaPods. There is no official config plugin; the only one
in circulation is unofficial and merely adds the Maven line.

That is a prebuild and a dev build, permanently, for a flow each user passes
through once. The hosted page costs none of it.

---

## What this does not settle

Three open items. The first is a blocker; the others are commitments to
make with open eyes.

**1. Can the camera open inside the in-app browser?** Unresolved. A selfie
check needs `getUserMedia`, and the Expo SDK 58 documentation for
`expo-web-browser` is silent on camera access. Persona's own WebView guidance
asks for `is-webview=true` and an `NSCameraUsageDescription` entry, which
hints the camera is not free here.

This was originally written up as deciding between two browser modes. It no
longer does, and the reason is worth recording. The verdict never travels
through the device — Persona posts it to the webhook, the only writer the
schema permits — so the client has no redirect to capture. That removes any
need for `openAuthSessionAsync`, whose whole purpose is capturing one, and
with it the dependency on `ASWebAuthenticationSession`, the OAuth-hardened
container that was the more doubtful of the two. `src/services/verification.ts`
uses `openBrowserAsync`, which gets an ordinary `SFSafariViewController`.

So one question remains, with one bit of answer:

| Result | Path |
| --- | --- |
| the camera works in `openBrowserAsync` | nothing to change |
| it does not | `react-native-webview` plus camera permissions in `app.json` — an install and a dev build, and only `src/services/verification.ts` changes |

The spike that would settle it was removed from the tree without being run.
It is preserved as `src/app/dev/camera-spike.tsx` in commit `cb8fa88` of
[PR #9](https://github.com/YadavMatch/My-rebuild/pull/9), and comes back with
`git checkout cb8fa88 -- src/app/dev/camera-spike.tsx`. It runs in Expo Go
and needs a physical device, because the simulator has no camera and would
fail regardless.

**2. Persona's price is unknown.** `withpersona.com/pricing` returned HTTP
403 and was never read. Treat "usage-priced" as an assumption. For a floor to
compare against, Veriff is $0.80 per verification on a $49 monthly minimum,
and Stripe publishes $1.50. If Persona lands materially above those, the
trade is real money against a promise already printed in the app — but note
that Veriff Premium's $209 monthly minimum buys a delete endpoint that still
cannot keep up, so cost alone does not reopen the decision.

**3. Identity documents cross a border.** *Materially larger since the 27
November amendment.* Persona is a US processor. The Mumbai region was chosen
in [`supabase-setup.md`](supabase-setup.md) precisely because "NearMatch
handles sensitive personal data for people in India." Verify-then-discard
keeps both the image and the document out of our database, but a selfie is
biometric data and an identity document is more sensitive still, and sending
either to a US provider is a cross-border transfer under the DPDP Act.

A privacy policy now has to disclose that identity documents are collected,
what is extracted from them, that they leave India, and that they are deleted
after the check. The legal screen at `src/app/legal/[doc].tsx` is still an
honest placeholder; it says so itself, and writing real policy text is not
something this document can do for you. It is worth saying plainly: this was
the compliance weight that constraint 1 originally existed to avoid, and the
amendment accepts it on purpose.

India-domiciled alternatives exist — HyperVerge, IDfy, Signzy — and **none of
them were evaluated.** They are named here so the option is not forgotten,
not as a recommendation. If on-shore processing turns out to be a
requirement rather than a preference, that research has to happen before any
Persona integration work, not after.

---

## How it wires in

Built, and waiting only on configuration. The schema dictated the shape, and
nothing is specific to Persona beyond the string in the `provider` column —
switching providers later means rewriting two Edge Functions, not a
migration.

1. `supabase/functions/verification-start` creates an inquiry and returns a
   single-use hosted URL. It runs under `auth: 'user'`, so the caller comes
   from the JWT and a device cannot nominate someone else. An
   already-verified caller is turned away, because every inquiry is billable.
2. `src/services/verification.ts` opens that URL with `openBrowserAsync`.
   There is no redirect and no deep link: see open question 1 for why none is
   needed.
3. `supabase/functions/verification-webhook` verifies Persona's HMAC over the
   raw bytes, then — with the service role — upserts into
   `verification_attempts` with `provider: 'persona'` and sets
   `profiles.verified` and `verified_at`. This is the only path that can
   work, given the revokes in constraint 3.
4. That same handler calls `DELETE /api/v1/inquiries/{inquiry-id}`.
5. `src/hooks/use-verification.ts` reads `profiles.verified` back, polling
   for about twelve seconds, because the webhook is usually still in flight
   when the browser closes.

Step 4 belongs in the webhook handler and not in a nightly cleanup job: a
cleanup job that fails quietly leaves selfies on a third party's servers
while the app says otherwise. It returns 500 when redaction fails, so
Persona retries rather than the failure passing unnoticed — at the cost of a
duplicate delivery, which migration 0002 makes harmless.

The Persona API key is server-only. It belongs in Supabase Edge Function
secrets, never in an `EXPO_PUBLIC_*` variable. The three secrets the
functions read are listed in
[`supabase-setup.md`](supabase-setup.md#the-identity-check).

---

## What would reverse this

- The camera cannot be made to work in any in-app browser *and* the WebView
  fallback also fails. Then the hosted page is unusable and the native SDK
  and its prebuild come back on the table.
- On-shore processing becomes a hard requirement. Then the Indian providers
  above need evaluating and this document is obsolete.
- Persona's pricing turns out to be enterprise-only with no self-serve tier,
  which would make step 4a's "~1 hour, usage-priced" estimate wrong and put
  Veriff's $0.80 self-serve tier back in contention — accepting that its
  deletion cap means the "nothing is kept" copy would have to change.
- Persona cannot read the Indian documents your users hold. Unconfirmed, and
  it only became load-bearing with the 27 November amendment; see *Why
  Persona*. Veriff publishes support for Indian passports, ID cards and
  driving licences, so this is the scenario where it returns.

---

## Sources

All read 25 November 2026.

- Stripe: [Identity use cases](https://docs.stripe.com/identity/use-cases) ·
  [verification checks](https://docs.stripe.com/identity/verification-checks) ·
  [hosted redirect flow](https://docs.stripe.com/identity/verify-identity-documents) ·
  [pricing](https://stripe.com/identity)
- Veriff: [pricing](https://www.veriff.com/pricing) ·
  [redirection guide](https://devdocs.veriff.com/docs/redirection-guide-1.md) ·
  [session deletion](https://devdocs.veriff.com/apidocs/v1sessionsid-3) ·
  [biometric authentication](https://devdocs.veriff.com/docs/biometric-authentication.md) ·
  [supported countries](https://www.veriff.com/supported-countries)
- Persona: [integration methods](https://docs.withpersona.com/docs/choosing-an-integration-method) ·
  [hosted flow](https://docs.withpersona.com/docs/hosted-flow) ·
  [verification types](https://docs.withpersona.com/2026-09-29/verification-types) ·
  [redact an inquiry](https://docs.withpersona.com/2026-09-29/api-reference/inquiries/redact-an-inquiry) ·
  [React Native guide](https://docs.withpersona.com/2026-09-29/react-native-sdk-v2-integration-guide) ·
  [WebView considerations](https://docs.withpersona.com/2022-09-01/hosted-flow-webview-considerations)
- Expo: [expo-web-browser, SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/webbrowser/)
