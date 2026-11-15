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

/** Shakes a second: back-and-forth turns of the wrist, counted on the axis that turns most. */
export function rate(gesture) {
  const seconds = (gesture[gesture.length - 1].t - gesture[0].t) / 1000;
  if (!(seconds > 0)) return 0;
  let best = null;
  for (const axis of ['gx', 'gy', 'gz']) {
    const values = gesture.map((sample) => sample[axis]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const spread = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
    if (!best || spread > best.spread) best = { values, mean, spread };
  }
  if (best.spread < QUIET) return 0;
  // Count the turns from one side to the other. A turn only counts once the value is well
  // past the middle, so small wobbles near it are not counted again and again.
  const margin = 0.4 * best.spread;
  let side = 0, turns = 0;
  for (const value of best.values) {
    const now = value > best.mean + margin ? 1 : value < best.mean - margin ? -1 : 0;
    if (now && side && now !== side) turns++;
    if (now) side = now;
  }
  return turns / 2 / seconds;
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
