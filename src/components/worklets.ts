/**
 * Worklet helpers shared by the gesture code.
 *
 * Both run on the UI runtime, so they carry the `'worklet'` directive — a
 * plain function called from a gesture handler throws on device while
 * appearing to work under the debugger.
 */

/**
 * Where a flick would come to rest if it kept decelerating.
 *
 * Apple's exponential-decay form. Using this instead of raw distance is what
 * makes a fast, short swipe commit and a slow, long drag spring back.
 */
export function project(velocity: number, decelerationRate = 0.998): number {
  'worklet';
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** The further past an edge, the less the element follows the finger. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  'worklet';
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}
