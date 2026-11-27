/**
 * The distance a member chose to look, and what the app may say about it.
 *
 * Six presets, in metres, because the database stores metres and a check
 * constraint rejects anything else. Keeping the list here as well means the
 * picker and the server cannot drift: `0011_proximity_discovery.sql` carries
 * the same six values, and a seventh added in one place fails loudly in the
 * other rather than quietly widening somebody's range.
 *
 * Nothing in this file computes or displays a distance. The server never sends
 * one — the feed returns "Nearby" or a city the candidate chose to publish —
 * so there is nothing here to accidentally render.
 */

export const DISCOVERY_RADII_M = [10_000, 25_000, 50_000, 75_000, 100_000, 150_000] as const;

export type DiscoveryRadiusM = (typeof DISCOVERY_RADII_M)[number];

/** What a new member gets, and the narrowest option. */
export const DEFAULT_DISCOVERY_RADIUS_M: DiscoveryRadiusM = 10_000;

export const WIDEST_DISCOVERY_RADIUS_M: DiscoveryRadiusM =
  DISCOVERY_RADII_M[DISCOVERY_RADII_M.length - 1];

export function isSupportedRadius(m: number | null | undefined): m is DiscoveryRadiusM {
  return typeof m === 'number' && (DISCOVERY_RADII_M as readonly number[]).includes(m);
}

/** "25 km". The unit is always kilometres; the presets are all whole ones. */
export function radiusLabel(m: DiscoveryRadiusM | number): string {
  return `${Math.round(m / 1000)} km`;
}

/**
 * The next preset up, or null at the widest.
 *
 * Used for the one-tap widening the feed offers when it runs short. An
 * unsupported value returns the narrowest preset that still exceeds it, so a
 * row holding something unexpected widens by the smallest step available
 * rather than jumping to 150 km.
 */
export function nextRadiusUp(m: number | null | undefined): DiscoveryRadiusM | null {
  if (m === null || m === undefined) {
    return DEFAULT_DISCOVERY_RADIUS_M;
  }
  const next = DISCOVERY_RADII_M.find((r) => r > m);
  return next ?? null;
}

/**
 * How few profiles counts as "running low".
 *
 * The feed offers to widen at this point rather than waiting for zero, so the
 * offer arrives before the deck is empty and the member is staring at nothing.
 */
export const RUNNING_LOW_THRESHOLD = 3;

/** What the settings screen tells members, in one place so it reads the same everywhere. */
export const DISCOVERY_RANGE_EXPLAINER =
  'Distances are approximate. We compare a rounded version of each location, ' +
  'so someone right on the edge of your range may fall either side of it.';

export const DISCOVERY_MUTUAL_EXPLAINER =
  'You and the other person both have to be in range. If they are 90 km away ' +
  'and you choose 100 km, you will still not see each other unless they chose ' +
  '100 km too. Choosing a wider range decides who you can see, not who can see you.';
