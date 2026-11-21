# My Rebuild

An iOS app built with [Expo](https://expo.dev) (SDK 58) and shipped with
[EAS](https://docs.expo.dev/eas/) — Expo Application Services.

Stack: Expo Router (file-based navigation), React Native 0.88, React 19.3,
TypeScript, `@expo/ui` native components.

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
src/app/            screens — each file is a route (expo-router)
  _layout.tsx       root layout, theme provider, tab navigator
  index.tsx         Home tab
  explore.tsx       Explore tab
src/components/     reusable UI; *.web.tsx files are web-only variants
src/constants/      design tokens — colors, spacing, fonts
src/hooks/          shared hooks
assets/             icons, splash, images
```

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
npx expo export --platform ios
```

The second command bundles the app the same way a real build does, so it
catches import and asset errors without needing a Mac.

## Notes

- `ios.bundleIdentifier` in `app.json` is currently `com.myrebuild.app`.
  Change it to your own reverse-domain identifier before a production build —
  it is permanent once the app is on the App Store.
- `appVersionSource` is `remote`, so EAS owns the build number and increments
  it on each production build.
