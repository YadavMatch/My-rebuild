# NearMatch — selfie verification provider

Build step 7 in [`product-spec.md`](product-spec.md) needs a provider. This
records which one, why the other two were rejected, and what is still
unverified — so the choice can be re-examined later without redoing the
research.

**Decision: Persona, through its Hosted Flow.** Not its React Native SDK.

The decision is final on provider. It is **not yet proven runnable**: one
technical question is open, and it is the kind that can send the integration
down a different path. See *What this does not settle*.

Checked 25 November 2026. Every number and endpoint below came from the
provider's own docs or pricing pages on that date; pricing pages move, so
re-check before signing anything.

---

## What the check has to do

Four constraints, and they do most of the deciding.

**1. A selfie, with no government ID.**
The copy in `product-spec.md` promises an "AI selfie check" that adds a
Verified badge. It does not promise document KYC, and NearMatch has no
regulatory reason to collect identity documents. A provider that can only
check a selfie *against an ID* cannot implement what the app says it does.

**2. The photo is discarded.**
`verification_attempts` in `supabase/migrations/0001_initial_schema.sql` has
no column for an image, by design. That makes the promise structural on our
side, but the provider still holds the selfie — so the provider must offer
deletion we can call per verification, not a retention window measured in
months.

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

**It has no selfie-only mode.** Selfie is an option on a document session
(`options.document.require_matching_selfie: true`), and the docs instruct you
to "first follow the guide to collect and verify identity documents." It
matches face geometry between an ID and a selfie. Constraint 1 rules it out
even for a company that could buy it.

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

**No selfie-only first verification.** Biometric Authentication is explicitly
a returning-user product: it matches a selfie against an earlier enrolment.
Selfie-only *enrolment* exists but lives in a separate integration whose
prerequisites say to "contact your Solutions Engineer for configuration."
There is also a "Presence Verification" product described as confirming live
human presence without documents — that came from a one-line index entry on a
page nobody opened, and it is not a basis for a decision. If Persona falls
through, this is the first thing to go and read properly.

---

## Why Persona

**Standalone selfie verification.** Type `verification/selfie`: "The
individual is asked to take a video of their face in real-time, and Persona
checks that the individual is live and real." Face *comparison* happens only
"if a government ID was also submitted." Liveness plus optional age
estimation, with no document — constraint 1, met directly.

This also sidesteps a gap in the research: Persona's per-country *document*
coverage sits behind a dashboard map that could not be read, so Indian ID
support is unconfirmed. It does not matter. A liveness check reads a face,
not a document, so document coverage is not on the critical path. (An Aadhaar
database check type does exist, `verification/database-aadhaar`, if an
identity check is ever wanted on top.)

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

**1. Can the camera open inside the in-app browser?** Unresolved, and it
decides the integration path. A selfie check needs `getUserMedia`. The Expo
SDK 58 documentation for `expo-web-browser` is silent on camera access, and
the two ways of opening a URL use different native containers:
`openAuthSessionAsync` gets `ASWebAuthenticationSession` on iOS, which is a
hardened context built for OAuth; `openBrowserAsync` gets
`SFSafariViewController`. Persona's own WebView guidance asks for
`is-webview=true` and an `NSCameraUsageDescription` entry, which hints the
camera is not free here.

A spike exists to answer it: `src/app/dev/camera-spike.tsx`, opened in
[PR #9](https://github.com/YadavMatch/My-rebuild/pull/9). It runs in Expo Go
and needs a physical device, because the simulator has no camera and would
fail regardless. Outcomes:

| Result | Path |
| --- | --- |
| `openAuthSessionAsync` works | Hosted Flow as planned |
| only `openBrowserAsync` works | Hosted Flow, with a `Linking` listener and `dismissBrowser` for the redirect |
| neither works | `react-native-webview` plus camera permissions in `app.json` — an install and a dev build |

**2. Persona's price is unknown.** `withpersona.com/pricing` returned HTTP
403 and was never read. Treat "usage-priced" as an assumption. For a floor to
compare against, Veriff is $0.80 per verification on a $49 monthly minimum,
and Stripe publishes $1.50. If Persona lands materially above those, the
trade is real money against a promise already printed in the app — but note
that Veriff Premium's $209 monthly minimum buys a delete endpoint that still
cannot keep up, so cost alone does not reopen the decision.

**3. The selfie crosses a border.** Persona is a US processor. The Mumbai
region was chosen in [`supabase-setup.md`](supabase-setup.md) precisely
because "NearMatch handles sensitive personal data for people in India."
Verify-then-discard keeps the image out of our database, but a selfie is
biometric data and sending it to a US provider is a cross-border transfer
under the DPDP Act. The privacy policy copy has to say so, and the legal
screen at `src/app/legal/[doc].tsx` already notes this area is "checked
closely by app stores and regulators."

India-domiciled alternatives exist — HyperVerge, IDfy, Signzy — and **none of
them were evaluated.** They are named here so the option is not forgotten,
not as a recommendation. If on-shore processing turns out to be a
requirement rather than a preference, that research has to happen before any
Persona integration work, not after.

---

## How it wires in

The schema already dictates the shape, and nothing here is specific to
Persona beyond the string in the `provider` column — switching providers
later means rewriting two Edge Functions, not a migration.

1. An Edge Function creates an inquiry and returns the hosted URL. (`supabase/`
   currently holds only `migrations/` and `tests/`; this would be its first
   function.)
2. The app opens that URL and comes back via `myrebuild://`.
3. Persona's webhook hits a second Edge Function, which — with the service
   role — inserts into `verification_attempts` with `provider: 'persona'` and
   sets `profiles.verified` and `verified_at`. This is the only path that can
   work, given the revokes in constraint 3.
4. That same handler calls `DELETE /api/v1/inquiries/{inquiry-id}`.

Step 4 belongs in the webhook handler and not in a nightly cleanup job: a
cleanup job that fails quietly leaves selfies on a third party's servers
while the app says otherwise.

The Persona API key is server-only. It belongs in Supabase Edge Function
secrets, never in an `EXPO_PUBLIC_*` variable.

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
  deletion cap means the "photo not stored" copy would have to change.

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
