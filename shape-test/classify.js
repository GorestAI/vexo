// Can the wrist tell hand shapes apart? The sums, with no page and no band in here.
// A trial is the motion samples around one cue: { t, ax, ay, az, gx, gy, gz }.
export const POINTS = 28;        // each trial becomes this many points in time
export const BEFORE_MS = 300;    // kept before the strongest moment of the movement
export const AFTER_MS = 400;     // kept after it
export const GYRO_SCALE = 30;    // degrees/second that count as much as...
export const ACCEL_SCALE = 0.05; // ...this many g (finger movements are small)
export const POSE_SCALE = 0.03;  // g: how much the resting tilt of the wrist changed
const AXES = ['ax', 'ay', 'az', 'gx', 'gy', 'gz'];

const mean = (list, key) => list.reduce((sum, s) => sum + s[key], 0) / Math.max(1, list.length);

/** One trial -> { shape: numbers to compare, peakGyro: how big the movement was (degrees/second) }. */
export function features(samples) {
  const start = samples[0].t, end = samples[samples.length - 1].t;
  const early = samples.filter((s) => s.t - start <= 150);
  const late = samples.filter((s) => end - s.t <= 150);
  const rest = { ax: mean(early, 'ax'), ay: mean(early, 'ay'), az: mean(early, 'az') };
  // The strongest moment: the trials are lined up on it, because people react at different speeds.
  let peak = samples[0], most = -1, peakGyro = 0;
  for (const s of samples) {
    const gyro = Math.hypot(s.gx, s.gy, s.gz);
    const energy = gyro / GYRO_SCALE + Math.hypot(s.ax - rest.ax, s.ay - rest.ay, s.az - rest.az) / ACCEL_SCALE;
    if (energy > most) { most = energy; peak = s; }
    if (gyro > peakGyro) peakGyro = gyro;
  }
  const from = peak.t - BEFORE_MS, length = BEFORE_MS + AFTER_MS;
  const shape = [];
  let i = 0;
  for (let p = 0; p < POINTS; p++) {
    const t = from + (length * p) / (POINTS - 1);
    while (i < samples.length - 2 && samples[i + 1].t < t) i++;
    const a = samples[i], b = samples[i + 1] ?? a;
    const part = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
    for (const axis of AXES) {
      const value = a[axis] + (b[axis] - a[axis]) * part;
      shape.push(axis[0] === 'g' ? value / GYRO_SCALE : (value - rest[axis]) / ACCEL_SCALE);
    }
  }
  // How the wrist lies afterwards compared with before: a held fist can tilt it a little.
  for (const axis of ['ax', 'ay', 'az']) shape.push((mean(late, axis) - rest[axis]) / POSE_SCALE);
  return { shape, peakGyro };
}

export function distance(one, other) {
  let sum = 0;
  for (let k = 0; k < one.length; k++) sum += (one[k] - other[k]) ** 2;
  return Math.sqrt(sum / one.length);
}

/**
 * Leave one out: each trial is named by its nearest neighbour among all the others.
 * `trials` is a list of { label, shape }. Returns { right, total, table } where
 * table[asked][answered] counts the trials.
 */
export function leaveOneOut(trials, labels) {
  const table = Object.fromEntries(labels.map((a) => [a, Object.fromEntries(labels.map((b) => [b, 0]))]));
  let right = 0;
  trials.forEach((trial, i) => {
    let best = null, near = Infinity;
    trials.forEach((other, j) => {
      if (i === j) return;
      const d = distance(trial.shape, other.shape);
      if (d < near) { near = d; best = other.label; }
    });
    table[trial.label][best]++;
    if (best === trial.label) right++;
  });
  return { right, total: trials.length, table };
}

/** What the score means, in one sentence. Guessing gets 1 in `labels`. */
export function verdict(right, total, labels) {
  const share = right / total, guess = 1 / labels;
  const sd = Math.sqrt(total * guess * (1 - guess));
  const above = (right - total * guess) / sd;          // how many spreads above guessing
  if (share >= 0.8) return 'Yes: the band tells these hand shapes apart on your wrist.';
  if (above >= 2.5) return 'Partly: clearly better than guessing, but not reliable enough to build on alone.';
  return 'No: this is about what guessing gets. The band cannot tell these hand shapes apart.';
}
