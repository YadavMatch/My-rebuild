/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    /** Brand colour, used for the primary action on a screen and nothing else. */
    accent: '#E0245E',
    accentPressed: '#C01A4E',
    /** Text and icons that sit on top of `accent`. */
    onAccent: '#ffffff',
    /** The two swipe outcomes. Paired with icons and text, never colour alone. */
    like: '#1D9A6C',
    pass: '#D1495B',
    border: '#E4E4E7',
    /** Scrim behind sheets and over the bottom of a photo card. */
    overlay: 'rgba(0, 0, 0, 0.55)',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    accent: '#FF5C8A',
    accentPressed: '#E0245E',
    onAccent: '#1A0710',
    like: '#3DD598',
    pass: '#FF6B81',
    border: '#2E3135',
    overlay: 'rgba(0, 0, 0, 0.65)',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 20,
  card: 28,
  pill: 999,
} as const;

/**
 * Gradient pairs used for profile avatars, picked deterministically from a
 * profile id so the same person always gets the same colours.
 *
 * Generated rather than photographic on purpose: the app ships no stock
 * portraits of real people. Swap `ProfilePhoto` for a real image component
 * once profiles carry uploaded photos.
 */
export const AvatarGradients = [
  ['#FF6B6B', '#C9184A'],
  ['#4C6EF5', '#1864AB'],
  ['#12B886', '#0B7285'],
  ['#F59F00', '#E8590C'],
  ['#AE3EC9', '#6741D9'],
  ['#FF8787', '#E8590C'],
  ['#20C997', '#0CA678'],
  ['#5C7CFA', '#3B5BDB'],
] as const;

/** Stable index into `AvatarGradients` for a given id. */
export function gradientForId(id: string): readonly [string, string] {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 100000;
  }
  return AvatarGradients[hash % AvatarGradients.length] as unknown as readonly [string, string];
}
