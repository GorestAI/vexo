// How fast a gesture shakes, as one more thing the matcher compares.
//
// The kit's recogniser stretches every gesture to the same length before comparing, so
// three slow shakes and three fast shakes look exactly alike to it. Here the shake rate is
// measured in real time (shakes a second) and added to the end of the shape, and the
// distance between two gestures counts a difference in rate as well as in shape.
import { toShape, distance as shapeDistance } from './recogniser.js';

export const RATE_SCALE = 1.5;   // shakes a second that count as much as a whole shape apart... divided by this
const QUIET = 20;                // degrees/second: turning less than this (spread) is no shaking at all
const AXES = 6;                  // numbers per point in a shape

/**
 * The moments (band time, ms) the wrist turned from one side to the other, counted on the
 * axis that turns most. Empty when the hand hardly turned at all.
 */
export function turnTimes(samples) {
  if (samples.length < 3) return [];
  let best = null;
  for (const axis of ['gx', 'gy', 'gz']) {
    const values = samples.map((sample) => sample[axis]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const spread = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
    if (!best || spread > best.spread) best = { values, mean, spread };
  }
  if (best.spread < QUIET) return [];
  // A turn only counts once the value is well past the middle, so small wobbles near it
  // are not counted again and again.
  const margin = 0.4 * best.spread;
  const times = [];
  let side = 0;
  best.values.forEach((value, i) => {
    const now = value > best.mean + margin ? 1 : value < best.mean - margin ? -1 : 0;
    if (now && side && now !== side) times.push(samples[i].t);
    if (now) side = now;
  });
  return times;
}

/** Shakes a second over a whole gesture (used by taught gestures). */
export function rate(gesture) {
  const seconds = (gesture[gesture.length - 1].t - gesture[0].t) / 1000;
  return seconds > 0 ? turnTimes(gesture).length / 2 / seconds : 0;
}

// ---- shake rhythm, nothing to teach
// A shake is the wrist turning left and right a few times, then stopping. How fast decides
// slow or fast; one burst or two bursts with a short stop between decides x1 or x2.
export const MIN_TURNS = 3;       // fewer turns than this is a flick or a reach, not a shake
export const BOUNDARY = 3.5;      // shakes a second: below is slow, from here up is fast (the page has a slider)

/** Shakes a second between the first and the last turn, or 0 with fewer than two turns. */
function perSecond(times) {
  return times.length >= 2 ? (times.length - 1) / 2 / ((times[times.length - 1] - times[0]) / 1000) : 0;
}

/** One finished gesture as a shake: { perSecond, turns }, or null when it was no shake. */
export function shakeOf(gesture) {
  const times = turnTimes(gesture);
  if (times.length < MIN_TURNS) return null;
  return { perSecond: perSecond(times), turns: times.length };
}

/** For the live meter: how fast the hand is shaking over the last second of samples. */
export function liveRate(samples) {
  if (samples.length < 3) return 0;
  const end = samples[samples.length - 1].t;
  return perSecond(turnTimes(samples.filter((one) => one.t >= end - 1000)));
}

/** The shape of a gesture, with its shake rate as one more point at the end. */
export function features(gesture) {
  return [...toShape(gesture), rate(gesture), 0, 0, 0, 0, 0];
}

/** How different two gestures are: shape distance plus the difference in shake rate. */
export function distance(one, other) {
  const shape = shapeDistance(one.slice(0, -AXES), other.slice(0, -AXES));
  return shape + Math.abs(one[one.length - AXES] - other[other.length - AXES]) / RATE_SCALE;
}

/** The nearest example, as the kit's match() but with this distance. */
export function match(shape, examples, limit) {
  let best = { label: null, distance: Infinity };
  for (const example of examples) {
    const d = distance(shape, example.shape);
    if (d < best.distance) best = { label: example.label, distance: d };
  }
  return best.distance <= limit ? best : { label: null, distance: best.distance };
}
