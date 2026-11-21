# My Rebuild

A dating app for iOS, built with [Expo](https://expo.dev) (SDK 58) and shipped
with [EAS](https://docs.expo.dev/eas/) — Expo Application Services.

Stack: Expo Router (file-based navigation), React Native 0.88, React 19.3,
TypeScript, Reanimated 4 and Gesture Handler v3.

## What works

A complete core loop, running on seed data:

- **Discover** — a swipe deck. Drag a card, or use the Pass / Like buttons.
- **Profile detail** — photos, bio, interests and prompts, plus report and block.
- **Matches** — everyone who liked you back, newest activity first.
- **Chat** — a thread per match, with a working composer.
- **You** — your own profile, interests, prompts and swipe counters.

Likes, passes and blocks persist across launches via AsyncStorage.

## Getting started

```bash
npm install
```

```bash
npx expo start
```

Press `i` to open the iOS Simulator (macOS only), or scan the QR code with
Expo Go on an iPhone.

## Project layout

```
src/app/               screens — each file is a route (expo-router)
  _layout.tsx          root: gesture root, theme, decisions provider, stack
  (tabs)/index.tsx     Discover — the swipe deck
  (tabs)/matches.tsx   Matches list
  (tabs)/profile.tsx   Your own profile
  profile/[id].tsx     Someone else's profile, with report and block
  chat/[id].tsx        A conversation
  report/[id].tsx      Report reasons, as a native form sheet
src/components/        reusable UI; *.web.tsx files are web-only variants
src/services/          the data layer — swap this for a real backend
src/store/             likes, passes, blocks and reports (persisted)
src/data/              seed profiles and conversations (JSON)
src/constants/theme.ts design tokens — colours, spacing, radii, fonts
assets/                icons and splash
```

## Where the data comes from

Screens never import `src/data/*.json`. They go through `src/services`, which
is the single seam a real backend plugs into — rewrite those function bodies
against Supabase, Firebase or your own API and the screens keep working,
because the return types do not change.

The seed data is committed to the repo. That is fine for development and
wrong for production: a public repository is not a place for anyone's profile
or messages. Real user data belongs in a database with row-level access
control before anybody but you uses this app.

Two more things the mock layer only pretends to do, which a backend must
really do:

- **Blocking.** A client-side block only hides someone from your screen. Until
  it is enforced server-side, the other person can still see and message you.
- **Reporting.** Reports currently log and resolve. They have to reach a
  moderation queue that a human reads.

Profile photos are generated gradients with an initial rather than stock
portraits — using photographs of real people as fake profiles is a bad idea.
Swap `ProfilePhoto` for `expo-image` once profiles carry uploads.

## EAS builds

Build profiles live in `eas.json`:

| Profile | What it produces | Needs an Apple Developer account? |
| --- | --- | --- |
| `simulator` | `.app` that runs in the iOS Simulator | No |
| `development` | Dev client for a registered physical device | Yes |
| `preview` | Internal-distribution build for testers | Yes |
| `production` | App Store / TestFlight build | Yes |

### One-time setup

```bash
npm install -g eas-cli
```

```bash
eas login
```

```bash
npx eas-cli@latest init
```

`init` creates the project on Expo's servers and writes `extra.eas.projectId`
into `app.json`. Commit that change.

### Build for the iOS Simulator (no Apple account needed)

```bash
npx eas-cli@latest build --platform ios --profile simulator
```

When it finishes, download the artifact and run it:

```bash
npx eas-cli@latest build:run --platform ios
```

### Build for a real device or the App Store

Requires a paid Apple Developer account ($99/year). EAS will prompt for your
Apple credentials and generate the signing certificates and provisioning
profiles for you.

```bash
npx eas-cli@latest build --platform ios --profile production
```

```bash
npx eas-cli@latest submit --platform ios --latest
```

Manage credentials at any time with `npx eas-cli@latest credentials`.

## Checks

```bash
npx tsc --noEmit
```

```bash
npx expo lint
```

```bash
npx expo export --platform ios
```

The last command bundles the app the same way a real build does, so it
catches import and asset errors without needing a Mac.

## CI

`.github/workflows/ci.yml` runs on every pull request and every push to
`main`, as three parallel jobs:

| Job | Runs | Catches |
| --- | --- | --- |
| `Typecheck & lint` | `tsc --noEmit`, `expo lint` | type errors, lint violations |
| `Project health` | `expo-doctor` | dependency version mismatches, config problems |
| `iOS bundle` | `expo export --platform ios` | broken imports, missing assets, Metro resolution errors |

The jobs are separate so each failure is its own status check and the slow
bundle job does not hold up the fast ones. Within the first job, lint runs
even when the typecheck fails, so one run reports both.

The `iOS bundle` job is the closest thing to a real build that runs without
a Mac or an EAS account — it bundles through Metro exactly as `eas build`
does, so it catches a broken import that typecheck and lint both miss.

### Two things worth knowing

`Typecheck & lint` runs `npx expo customize tsconfig.json` before `tsc`. That
generates `expo-env.d.ts`, which is gitignored but which `tsconfig.json`
includes — without it `tsc` cannot resolve the CSS module import in
`src/constants/theme.ts`. Run the same command locally if a fresh clone fails
to typecheck.

`expo-doctor` reaches the npm registry and Expo's API to compare installed
package versions against the SDK, so it can turn red after an upstream
release with no change in this repository. If that becomes annoying, add
`continue-on-error: true` to its step to make it advisory instead of
blocking. It is pinned in `package-lock.json`, so the checks themselves
only change when the dependency is bumped.

## Notes

- `ios.bundleIdentifier` in `app.json` is currently `com.myrebuild.app`.
  Change it to your own reverse-domain identifier before a production build —
  it is permanent once the app is on the App Store.
- `appVersionSource` is `remote`, so EAS owns the build number and increments
  it on each production build.
- Typed routes are on. The route types in `.expo/types` are generated by the
  dev server, so after adding or renaming a screen, run `npx expo start` once
  or `tsc` will still be checking against the old routes.
- Before the App Store will take a dating app it needs working report and
  block (both are built), plus an account-deletion path and an age gate —
  neither of which exists yet.
