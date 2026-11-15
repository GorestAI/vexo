// The motions of the pretend hand, for the buttons in the dashed box. Each one says what
// the sensor reads `s` seconds into the motion: ax ay az in g, gx gy gz in degrees/second.
// They are played with the kit's pretend band: pretend.playMotion(shape, { seconds }).
// A real band needs none of this.
//
// Every gesture is a round trip: from the ready pose (forearm level, palm down, so gravity
// reads straight down the band's z axis) to a pose where the arm points somewhere else,
// and straight back. Where gravity points at the far end is what tells the gestures apart,
// so the far ends are spread out: up, down, palm up, thumb up, and the poses between.
// The axes are a guess at how the band sits on the wrist (x along the forearm, z out of
// the back of the hand). A real band learns from your own examples, so the guess only
// matters for these pretend motions.

const READY = [0, 0, 1];
const norm = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** A round trip from READY to `target` (where gravity reads at the far end) and back. */
function trip(target, seconds, roll = [1, 0, 0]) {
  const to = norm(target);
  const angle = Math.acos(Math.max(-1, Math.min(1, dot(READY, to))));
  const c = cross(READY, to);
  const axis = Math.hypot(...c) < 1e-6 ? roll : norm(c);   // straight opposite: turn about `roll`
  const k = cross(axis, READY);
  const shape = (s) => {
    const u = Math.min(1, s / seconds);
    const turned = angle * Math.sin(Math.PI * u);                               // out, then back
    const speed = (angle * Math.PI / seconds) * Math.cos(Math.PI * u) * 180 / Math.PI;   // degrees/second
    const [cos, sin] = [Math.cos(turned), Math.sin(turned)];
    // Rodrigues: READY turned about `axis` (axis is at right angles to READY).
    const g = READY.map((r, i) => r * cos + k[i] * sin);
    return { ax: g[0], ay: g[1], az: g[2], gx: axis[0] * speed, gy: axis[1] * speed, gz: axis[2] * speed };
  };
  return [shape, seconds];
}

/**
 * Shaking: the forearm twists left and right `times` times, `perSecond` times a second.
 * Every speed turns at the same top speed (so a faster shake is a smaller one, as a real
 * wrist does), and every one is the same number of shakes: after the recogniser stretches
 * them to one length they look alike, and only the shake rate tells them apart.
 */
function shake(perSecond, times = 3) {
  const top = 300;                                         // degrees/second at the middle of each swing
  const swing = top / (2 * Math.PI * perSecond);           // degrees either side
  const shape = (s) => {
    const phase = 2 * Math.PI * perSecond * s;
    const angle = (swing * Math.sin(phase) * Math.PI) / 180;
    return { ax: 0, ay: Math.sin(angle), az: Math.cos(angle), gx: top * Math.cos(phase), gy: 0, gz: 0 };
  };
  return [shape, times / perSecond];
}

const STILL = { ax: 0, ay: 0, az: 1, gx: 0, gy: 0, gz: 0 };
/** The same motion twice, with a short stop between: long enough to end the first burst. */
function twice([shape, seconds], pause = 0.5) {
  return [(s) => (s < seconds ? shape(s) : s < seconds + pause ? STILL : shape(s - seconds - pause)), 2 * seconds + pause];
}

export const MOTIONS = {
  slow: shake(2),                        // about 2 shakes a second
  medium: shake(4),                      // about 4
  fast: shake(7),                        // about 7
  slow2: twice(shake(2)),                // slow, stop, slow
  fast2: twice(shake(7)),                // fast, stop, fast
  up: trip([1, 0, 0], 1.0),              // hand straight up high
  mouth: trip([0.7, 0.7, 0], 1.0),       // hand up to the mouth, thumb toward you
  heart: trip([0, -1, 0], 0.9),          // forearm across the chest, palm in
  palmup: trip([0, 0, -1], 0.9),         // turn the palm up, as if offering something
  thumbup: trip([0, 1, 0], 0.8),         // turn the hand thumb up
  down: trip([-1, 0, 0], 1.0),           // let the arm drop straight down
  lowpalm: trip([-0.58, 0.58, -0.58], 1.0), // arm swung down and out, palm turned forward
  hip: trip([-0.7, -0.7, 0], 0.9),       // hand down to the hip, palm in
};
