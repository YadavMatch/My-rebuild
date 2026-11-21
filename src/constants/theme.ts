/**
 * Design tokens for NearMatch.
 *
 * Warm cream background, terracotta primary, teal for verification, warm
 * brown for secondary text. Dark mode keeps the same hues at lower
 * luminance rather than inverting to grey, so the brand survives it.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#3F372F',
    textSecondary: '#9C8168',
    background: '#F3F2E8',
    /** Cards, grouped rows, anything raised off the background. */
    backgroundElement: '#FAFCFB',
    backgroundSelected: '#E9E4D6',
    /** Terracotta. The primary action, and the logo. */
    accent: '#D1674A',
    accentPressed: '#B4543A',
    /** Tinted terracotta, for the Invite pill and notice cards. */
    accentPale: '#F7E3DB',
    onAccent: '#FFFFFF',
    /** Teal: verification, and the pass action. */
    verified: '#3E8E80',
    verifiedPale: '#E3F1EC',
    like: '#D1674A',
    pass: '#3E8E80',
    border: '#E7E1D4',
    /** The photo area at the top of a profile card. */
    photoBackground: '#F2DDD8',
    overlay: 'rgba(40, 30, 24, 0.5)',
    danger: '#C0442F',
  },
  dark: {
    text: '#F2EDE4',
    textSecondary: '#B4A08A',
    background: '#1C1916',
    backgroundElement: '#262220',
    backgroundSelected: '#332D28',
    accent: '#E8826A',
    accentPressed: '#D1674A',
    accentPale: '#3A2620',
    onAccent: '#1C1916',
    verified: '#5FB3A2',
    verifiedPale: '#1F322E',
    like: '#E8826A',
    pass: '#5FB3A2',
    border: '#3A332E',
    photoBackground: '#3A2B27',
    overlay: 'rgba(0, 0, 0, 0.6)',
    danger: '#E8705A',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    /** The design is set in a rounded face throughout. */
    rounded: 'ui-rounded',
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

/** The script face used for the wordmark. Loaded in the root layout. */
export const LOGO_FONT = 'Pacifico_400Regular';

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  card: 24,
  pill: 999,
} as const;

/** Height of the custom tab bar, excluding the home-indicator inset. */
export const TAB_BAR_HEIGHT = 64;
/** Clearance for content sitting above the tab bar. */
export const BottomTabInset = TAB_BAR_HEIGHT + 16;
export const MaxContentWidth = 800;
