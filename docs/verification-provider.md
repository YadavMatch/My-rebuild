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

On which documents to accept, and on Aadhaar specifically, see *Indian
documents, and the Aadhaar question* below. The short version: Persona offers
PAN, voter ID, passport and driving licence for India, and does not offer
Aadhaar at all.

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

## Indian documents, and the Aadhaar question

Researched 27 November 2026, after the requirement changed to a document
check. This is the section to read before configuring a template.

### What Persona offers for India

Its documented government-ID classes for India are `pan` ("India Permanent
Account Number Card") and `vid` ("Voter Id"), plus the generic `dl` (driving
licence), `pp` (passport) and `id`. Per-country support is not fully listed in
the docs — "See the full set of Government ID Verification checks ... in your
Dashboard" — so confirm against the dashboard's coverage map before relying on
any of it.

**Aadhaar is not among them.** "Include Aadhaar in the Persona template" is
not an option that exists.

> **Correction.** An earlier version of this document claimed Persona exposes
> an Aadhaar database check at `verification/database-aadhaar`. That came from
> a single sighting in a long object-type enumeration and could not be found
> documented on a second pass — the documented database types are AAMVA,
> ECBSV, phone carrier, SERPRO and TIN. The claim should not have been made.

### Confirmed against the live flow, 27 November 2026

Everything above this heading was read from documentation. The sandbox flow
has since been driven from this repository, through the deployed
`verification-start`, which settles it by observation rather than reading.
After selecting India, the hosted flow asks for exactly one of:

| Accepted document |
| --- |
| Driver License |
| National ID |
| PAN Card |
| Passport |
| Voter ID |

That is the documented set — `dl`, `id`, `pan`, `pp`, `vid` — with nothing
missing and nothing extra. **Aadhaar does not appear**, which confirms the
correction above rather than softening it. "National ID" is a generic class
and is not a synonym for Aadhaar: nothing observed suggests Persona reads an
Aadhaar number or checks one against UIDAI.

Two further things the same run established first-hand:

* **There is no upload path in a headless browser.** At the document step the
  flow offers a QR code and an email handoff and nothing else — no file input
  anywhere in the page, shadow roots and iframes included. Note what this
  does *not* prove: capture methods are configured separately for desktop
  web, mobile web and native mobile apps, and Persona appears to classify a
  headless browser as desktop web whatever user agent it sends. It offered
  "Continue on another device" even to an iPhone user agent with a working
  synthetic camera, and rendered no `<video>` element. So this observation
  settles the desktop-web behaviour only; whether upload is offered on mobile
  web has to be seen on a real phone. Either way, no automated test can cover
  the half of the flow that runs after the link opens.
* **The one-time link is genuinely single-use.** Loading it a second time no
  longer offers "Begin verifying". Any retry has to call `verification-start`
  for a fresh link, which the client already does.

What the run did *not* establish: no verification was completed, so the
webhook has never fired. The `verification_attempts` write, the badge write
and the `reference-id` mapping on a real webhook payload all remain unproven.
The device run in open item 1 is what closes them.

### If Aadhaar is wanted: the OVSE route, and it cannot go through Persona

UIDAI registers Offline Verification Seeking Entities for consent-based
offline identity verification, and its published use cases include
**"Social/Community/Matchmaking"** — this app's category, named explicitly. A
registered entity "may collect and store verifiable credentials shared with
the explicit consent of the Aadhaar Number Holder."

The line that decides the architecture: **"Offline verification cannot be
performed on behalf of another entity."** Persona is another entity. So
Aadhaar cannot ride inside the Persona flow; it is a separate integration run
by us, as a registered OVSE.

Applications go through `ovse.uidai.gov.in`. The stated technical
requirements are an SVG logo under 10KB, a callback URL, the organisation name
as shown in the Aadhaar app, a domain name, and a Class 2 or 3 public
certificate with two-year validity. UIDAI gives
`ovse.registration@uidai.net.in` for eligibility questions.

### DigiLocker: plausible, and arguably better than photographing anything

DigiLocker's Requester role exists for this purpose — "Use DigiLocker to
verify identities, perform KYC, or check income proofs." Onboarding runs
through APISetu: sign up with an authorised representative's email, take "a
quick verification call", accept the Terms of Use or Agreement, and apply as a
Requester "subject to applicable permissions", submitting "a valid use case
and the required onboarding documents". Credentials (`orgId` and an API key)
are issued after approval.

Its categorical advantage: documents come **from the issuing source**, so
document forgery stops being a threat rather than being detected. That is a
stronger guarantee than reading a photograph of a document, however good the
reader.

### What could not be verified, and therefore is not advice

The statute itself was unreadable: `indiacode.nic.in` and MeitY returned 403
for the Aadhaar Act 2016, the 2019 Amendment Act and the DPDP Act, and the
Aadhaar (Authentication and Offline Verification) Regulations PDF returned 503
twice. So this document **cannot** tell you:

* what the 2019 Amendment changed about private-entity use, or the current
  status of the struck-down Section 57;
* the penalties for collecting or storing an Aadhaar number or a copy of an
  Aadhaar letter;
* whether UIDAI permits a business to accept an Aadhaar card as ordinary
  photo ID, as distinct from performing verification against UIDAI.

The OVSE and DigiLocker quotes above are from official sites and are solid.
Whether this app is approved for either is "apply and find out" — the
matchmaking use case is encouraging, not a guarantee. Both want a lawyer's
sign-off before launch, and so does the DPDP position in open question 3.

### The practical sequence

1. **Now:** passport, driving licence, voter ID and PAN in the sandbox
   template. Enough coverage to test and to launch with.
2. **Later, if coverage proves too thin:** OVSE or DigiLocker as a *second*
   provider. The schema already allows it — `verification_attempts.provider`
   is free text precisely so a second provider can coexist, and 0008's unique
   index is scoped by provider rather than by inquiry id alone.

Aadhaar is the most widely held ID in India, so this is a real coverage
question rather than a theoretical one. It is simply not a reason to hold up
the first working version.

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

Five open items. The first is a blocker; the others are commitments to
make with open eyes.

**1. ~~Can the camera open inside the in-app browser?~~ Settled on 27
November by not using an in-app browser.** The flow now opens in the system
browser, via `Linking.openURL` in `src/services/verification.ts`.

Reading Persona's own documentation closed off the two paths this section
used to weigh between:

* **In-app browsers are not endorsed.** Their supported browsers are the real
  ones — Chrome 79+, Firefox 74+, Safari 13+, Edge 80+, Brave — and they say
  "In-app browsers (e.g. Facebook Browser, Instagram Browser) are not
  supported", warning that "Aspects of the Inquiry flow may be degraded or
  not function entirely". `SFSafariViewController` is not named either way.
  That is not a guarantee to build a camera-dependent flow on.
* **The WebView fallback does not exist.** "We do not support using the
  WebView integration with React Native." So `react-native-webview`, which
  this section previously named as the fallback, was never an option.
* **Their recommendation for React Native is the native SDK**, which needs a
  prebuild and gives up Continuous Native Generation — the thing constraint 4
  rejected it for.

Handing the URL to Safari or Chrome itself answers all of it. It is a browser
Persona supports, so the camera is the platform's own rather than a wrapper's;
nothing native is added; and CNG survives. The price is that the person leaves
the app, which Persona's Hosted Flow requires anyway — "It's acceptable for
users to leave your site temporarily. (Required)" — and which costs this
design nothing, because the verdict was never returning through the device.

`use-verification.ts` therefore collects the result on `AppState` becoming
active rather than when a browser sheet closes.

What is left is not a blocker but a confirmation: run one sandbox check on a
real device and watch the camera open in Safari. The spike built for the old
question is preserved as `src/app/dev/camera-spike.tsx` in commit `cb8fa88`
of [PR #9](https://github.com/YadavMatch/My-rebuild/pull/9) — it probed the
in-app browser, so it now tests something the app no longer does.

Two requirements worth carrying into that run, both from Persona's docs:
cameras below **640×480** are unsupported, and **file upload is disabled by
default on mobile** (Configure → General → Image capture methods), which
matters for a government-ID flow where some people will want to upload rather
than photograph.

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

**4. Persona's own consent text contradicts this app's promise.** *Found on
27 November by reading the first screen of the live flow, not the docs.*
Before anything is photographed, Persona tells the user their biometric
information is processed to "verify your identity, identify fraud, and
improve Persona's platform", and that it "will be stored for no more than 3
years".

Both halves sit badly with the copy in `src/app/edit-profile.tsx`, which
tells the user "both images are deleted once the check finishes — neither
ever reaches our database". The second clause is true and verified. The first
is where the trouble is:

* **Three years is not "deleted once the check finishes".** The integration
  calls Persona's redaction endpoint as soon as a verdict arrives, and that
  is verified to work — `redacted-at` comes back set. Redaction is why the
  app can honestly say *it* keeps nothing. But the user is consenting to a
  three-year ceiling, and the distance between the ceiling they agree to and
  what we actually do is something the app's wording never acknowledges.
* **"Improve Persona's platform" is a second purpose.** The app asks for an
  identity check. It does not ask permission to contribute a face to a
  vendor's product development, and the screen obtaining that consent is one
  the app never shows and cannot reword.

No code change fixes this; redaction already does everything code can do. It
is a question of whether the in-app copy and the privacy policy can be made
truthful alongside a consent screen we do not control — and if they cannot,
whether a vendor with compatible consent text is needed instead. Resolve it
before launch: it is the kind of discrepancy that reads as deception even
when the engineering underneath is honest.

**5. Nothing decides the inquiry, and deciding it is plan-gated.** *Found on
27 November by completing a sandbox inquiry and watching the badge not
appear.*

The integration waits for an `inquiry.approved` event. One will never arrive
until the Persona account holds something that issues verdicts. Persona's
mechanism is a Workflow carrying an **Inquiry → Approve Inquiry** action:
Automation → All Workflows, then saved *and published*.

The catch is the price list. Persona's plan table marks the Approve Inquiry
step **not available on the Startup Program**, and available on Essential,
Growth and Enterprise. On Startup, every signup needs a human to approve it
in the Persona dashboard before a badge appears — which is not a feature
anyone can launch. **The plan, not the code, decides whether this ships.**
Settle which plan the account is on before building anything else on top of
this.

Two things Persona's documentation does not answer, to be settled by
observation rather than assumption:

* whether a Workflow approval fires the same `inquiry.approved` webhook a
  manual approval does. Both are documented as "set via post-inquiry
  processes or manual update", which implies a single event, but no page says
  so.
* whether Workflows are environment-scoped the way webhooks are.

When the Workflow is built, follow Persona's own best practice: write the
flagging rules first and auto-approve in the `else` branch, rather than
approving everything that completes. A badge that approves unconditionally is
a badge that means nothing — and this one exists to tell one stranger that
another is real.

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
2. `src/services/verification.ts` hands that URL to the system browser with
   `Linking.openURL`. There is no redirect and no deep link: see open
   question 1 for why none is needed, and why an in-app browser is not used.
3. `supabase/functions/verification-webhook` verifies Persona's HMAC over the
   raw bytes, then — with the service role — upserts into
   `verification_attempts` with `provider: 'persona'` and sets
   `profiles.verified` and `verified_at`. This is the only path that can
   work, given the revokes in constraint 3.
4. That same handler calls `DELETE /api/v1/inquiries/{inquiry-id}`.
5. `src/hooks/use-verification.ts` reads `profiles.verified` back, polling
   for about twelve seconds, because the webhook is usually still in flight
   when the browser closes.

**The chain has a prerequisite that is not in this repository.** Step 3 acts
on `inquiry.approved`, `inquiry.declined` and `inquiry.failed`, and ignores
`inquiry.completed` on purpose: completed means the user reached the end of
the steps, not that they passed, and Persona's own guidance is to "disregard
the completed status and only use the approved status". But nothing in a
Persona account issues a verdict by itself. A completed inquiry sits at
**Needs Review** until a post-inquiry Workflow or a human decides it —
approval is "set via post-inquiry processes or manual update", and there is
no default. Until that decisioning step exists, the badge can never set
itself, however correct the code is. See open item 5.

**Webhooks are per-environment, and the failure is silent.** One registered
in Production delivers nothing for a sandbox inquiry: no error, no retry, an
empty delivery log. Confirmed on 27 November, when a completed sandbox
inquiry produced zero delivery attempts because the only webhook lived in the
other environment. The webhook must also be subscribed to the three events
above; subscribing to `inquiry.completed` alone gets a 204 and nothing else.

Step 4 belongs in the webhook handler and not in a nightly cleanup job: a
cleanup job that fails quietly leaves selfies on a third party's servers
while the app says otherwise. It returns 500 when redaction fails, so
Persona retries rather than the failure passing unnoticed — at the cost of a
duplicate delivery, which migration 0008 makes harmless.

The Persona API key is server-only. It belongs in Supabase Edge Function
secrets, never in an `EXPO_PUBLIC_*` variable. The three secrets the
functions read are listed in
[`supabase-setup.md`](supabase-setup.md#the-identity-check).

---

## What would reverse this

- The camera cannot be made to work in the system browser. That would be
  surprising — it is Safari or Chrome, which Persona supports outright — but
  it is the one thing the sandbox run still has to show. There is no WebView
  fallback to drop to, since Persona does not support one with React Native,
  so the native SDK and its prebuild would be the only way left.
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

Mostly read 25 November 2026; the Indian-document section was researched on
27 November and lists its own sources at the end.

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

Read 27 November 2026, for *Indian documents, and the Aadhaar question*:

- Persona: [government ID verifications](https://docs.withpersona.com/2026-09-29/api-reference/verifications/government-id-verifications) ·
  [database verifications](https://docs.withpersona.com/2026-09-29/api-reference/verifications/database-verifications) ·
  [browser and device support](https://docs.withpersona.com/2026-09-29/browser-device-support) ·
  [WebView vs native](https://docs.withpersona.com/2026-09-29/webview-vs-native-mobile-integration) ·
  [WebView troubleshooting](https://docs.withpersona.com/2026-09-29/troubleshooting-common-issues-webview)
- UIDAI: [offline verification seeking entities](https://uidai.gov.in/hi/ovse)
- DigiLocker: [partner introduction](https://www.digilocker.gov.in/web/partners/introductions) ·
  [partner FAQ](https://www.digilocker.gov.in/web/partners/partner-faq)
- caniuse: [getUserMedia support data](https://github.com/Fyrd/caniuse/blob/main/features-json/stream.json),
  for the note that `getUserMedia` returned no video devices in `WKWebView`
  before iOS 14.3
