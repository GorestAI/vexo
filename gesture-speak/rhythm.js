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

// ---- finding shakes in the live stream
// A real arm does not hold still before and after a shake: it is lifted, shaken, lowered,
// all in one go, often for longer than the recogniser's 3 seconds. So shakes are found
// straight in the stream instead: the slow part of the turning (lifting, lowering, walking)
// is taken out, and what is left is counted turn by turn. A burst ends when the wrist has
// not turned for BURST_GAP_MS, however long it took.
const TURN_SPEED = 80;           // degrees/second past the slow part before a turn counts (at rest: about 2)
const SMOOTH_MS = 150;           // what changes slower than this is "the slow part"
const BURST_GAP_MS = 450;        // no turn for this long: the burst is over
const LINK_GAP_MS = 500;         // no sample for this long (link trouble): start again

export class ShakeDetector {
  constructor() { this.reset(); }

  reset() {
    this.slow = null;            // the slow part of gx gy gz
    this.side = [0, 0, 0];       // which side of the slow part each axis is on
    this.turns = [[], [], []];   // turn times of this burst, per axis
    this.lastTurn = null;        // band time of the newest turn, null = no burst going on
    this.lastT = null;
  }

  /** A burst is going on: the wrist turned in the last BURST_GAP_MS. */
  get busy() { return this.lastTurn !== null; }

  /**
   * Feed one motion sample. Returns { perSecond, turns } when a burst has just ended,
   * otherwise null. `turns` below MIN_TURNS means it was no shake (a flick, a reach).
   */
  feed(sample) {
    const t = sample.t;
    if (!Number.isFinite(t)) return null;
    if (this.lastT !== null && (t < this.lastT || t - this.lastT > LINK_GAP_MS)) this.reset();
    const step = this.lastT === null ? 20 : t - this.lastT;
    this.lastT = t;
    const turning = [sample.gx, sample.gy, sample.gz];
    if (!this.slow) this.slow = [...turning];
    const k = Math.min(1, step / SMOOTH_MS);
    turning.forEach((value, i) => {
      this.slow[i] += k * (value - this.slow[i]);
      const quick = value - this.slow[i];
      const now = quick > TURN_SPEED ? 1 : quick < -TURN_SPEED ? -1 : 0;
      if (now && this.side[i] && now !== this.side[i]) {
        this.turns[i].push(t);
        this.lastTurn = t;
      }
      if (now) this.side[i] = now;
    });
    if (this.lastTurn !== null && t - this.lastTurn > BURST_GAP_MS) return this.end();
    return null;
  }

  /** How fast the burst going on now shakes (its last second), 0 when there is none. */
  live() {
    if (!this.busy) return 0;
    const best = this.best();
    return perSecond(best.filter((one) => one >= best[best.length - 1] - 1000));
  }

  best() { return this.turns.reduce((most, one) => (one.length > most.length ? one : most)); }

  end() {
    const best = this.best();
    const burst = { perSecond: perSecond(best), turns: best.length };
    this.turns = [[], [], []];
    this.side = [0, 0, 0];
    this.lastTurn = null;
    return burst;
  }
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
