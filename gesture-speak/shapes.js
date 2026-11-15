// Shapes drawn in the air (or with the mouse), and which one a drawing is.
//
// The shapes are fixed here, so nothing has to be taught: each one is a template made
// from a formula. A drawing is compared with the $P point-cloud recogniser (Vatavu, Anthony
// and Wobbrock, 2012): both are turned into 32 points of the same size around the same
// middle, and the distance is how far the points have to move to cover each other. It does
// not care where the drawing starts, which way it goes or how many strokes it has, which is
// what a hand in the air needs. It does care which way up it is: a check is not a V on its side.

const N = 32;                    // points a drawing is turned into
export const FAR = 1.55;         // further than this from every shape is no shape (measured: shapes mostly below 1.45, scribbles mostly above 1.65)
export const CLEAR = 0.8;        // the best must be this much closer than the second best, or it is a close call

/** Points along a function of t from 0 to 1, y pointing down. */
const along = (f, count = 64) => Array.from({ length: count }, (_, i) => f(i / (count - 1)));
/** Points along straight lines through the corners. */
function lines(corners, count = 64) {
  const legs = corners.slice(1).map((c, i) => Math.hypot(c[0] - corners[i][0], c[1] - corners[i][1]));
  const total = legs.reduce((a, b) => a + b, 0);
  return along((t) => {
    let d = t * total;
    for (let i = 0; i < legs.length; i++) {
      if (d <= legs[i] || i === legs.length - 1) {
        const k = legs[i] ? Math.min(1, d / legs[i]) : 0;
        return [corners[i][0] + k * (corners[i + 1][0] - corners[i][0]), corners[i][1] + k * (corners[i + 1][1] - corners[i][1])];
      }
      d -= legs[i];
    }
    return corners[corners.length - 1];
  }, count);
}
const TURN = 2 * Math.PI;

export const SHAPES = [
  { key: 'circle', name: 'Circle', how: 'one round circle',
    points: along((t) => [Math.cos(TURN * t), Math.sin(TURN * t)]) },
  { key: 'check', name: 'Check', how: 'a tick: short down, long up',
    points: lines([[0, 0.45], [0.35, 1], [1, 0]]) },
  { key: 'line', name: 'Line', how: 'one straight line across, like crossing it out',
    points: lines([[0, 0], [1, 0]]) },
  { key: 'question', name: 'Question mark', how: 'a hook, then straight down',
    points: [
      ...along((t) => { const a = Math.PI + t * 1.5 * Math.PI; return [0.4 * Math.cos(a), -0.4 + 0.4 * Math.sin(a)]; }, 48),
      ...lines([[0, 0], [0, 0.45]], 16),
    ] },
  { key: 'heart', name: 'Heart', how: 'a heart, point down',
    points: along((t) => { const a = TURN * t; return [16 * Math.sin(a) ** 3, -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a))]; }, 80) },
];

// ---- $P
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** strokes: [[{x, y}, ...], ...] -> N points, same size, centred. */
function normalise(strokes) {
  const points = strokes.flatMap((stroke, id) => stroke.map((p) => ({ x: p.x, y: p.y, id })));
  // resample to N points spread evenly along the strokes
  let length = 0;
  for (let i = 1; i < points.length; i++) if (points[i].id === points[i - 1].id) length += dist(points[i - 1], points[i]);
  const step = length / (N - 1);
  const out = [{ ...points[0] }];
  let gone = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].id !== points[i - 1].id) continue;
    let a = points[i - 1];
    const b = points[i];
    let d = dist(a, b);
    while (step > 0 && gone + d >= step && out.length < N) {
      const k = (step - gone) / d;
      a = { x: a.x + k * (b.x - a.x), y: a.y + k * (b.y - a.y), id: b.id };
      out.push(a);
      d = dist(a, b);
      gone = 0;
    }
    gone += d;
  }
  while (out.length < N) out.push({ ...points[points.length - 1] });
  // the same size (the larger side becomes 1), the middle at 0,0
  const xs = out.map((p) => p.x), ys = out.map((p) => p.y);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
  const cx = xs.reduce((a, b) => a + b, 0) / N, cy = ys.reduce((a, b) => a + b, 0) / N;
  return out.map((p) => ({ x: (p.x - cx) / size, y: (p.y - cy) / size }));
}

function cloudDistance(points, template, start) {
  const matched = new Array(N).fill(false);
  let sum = 0;
  let i = start;
  do {
    let best = Infinity, index = 0;
    for (let j = 0; j < N; j++) {
      if (matched[j]) continue;
      const d = dist(points[i], template[j]);
      if (d < best) { best = d; index = j; }
    }
    matched[index] = true;
    sum += (1 - ((i - start + N) % N) / N) * best;
    i = (i + 1) % N;
  } while (i !== start);
  return sum;
}

function greedyMatch(points, template) {
  const step = Math.floor(Math.sqrt(N));
  let best = Infinity;
  for (let i = 0; i < N; i += step) {
    best = Math.min(best, cloudDistance(points, template, i), cloudDistance(template, points, i));
  }
  return best;
}

const TEMPLATES = SHAPES.map((shape) => ({ key: shape.key, cloud: normalise([shape.points.map(([x, y]) => ({ x, y }))]) }));

/**
 * Which shape a drawing is. strokes: [[{x, y}, ...], ...] (any units, y down).
 * Returns { key, distance, nextKey, nextDistance, sure }: the nearest shape and the one after
 * it, and whether the answer is clear (near enough, and clearly nearer than the second).
 */
export function recognise(strokes) {
  const points = normalise(strokes.filter((stroke) => stroke.length));
  const near = TEMPLATES.map((t) => ({ key: t.key, distance: greedyMatch(points, t.cloud) }))
    .sort((a, b) => a.distance - b.distance);
  const [best, second] = near;
  return {
    key: best.key, distance: best.distance, nextKey: second.key, nextDistance: second.distance,
    sure: best.distance <= FAR && best.distance <= CLEAR * second.distance,
  };
}

/** A small SVG picture of a shape, for the page. */
export function picture(key, size = 72) {
  const shape = SHAPES.find((one) => one.key === key);
  const xs = shape.points.map((p) => p[0]), ys = shape.points.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = (size - 16) / Math.max(x1 - x0, y1 - y0);
  const ox = (size - (x1 - x0) * scale) / 2, oy = (size - (y1 - y0) * scale) / 2;
  const path = shape.points.map(([x, y], i) => `${i ? 'L' : 'M'}${(ox + (x - x0) * scale).toFixed(1)},${(oy + (y - y0) * scale).toFixed(1)}`).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`
    + `<rect width="${size}" height="${size}" rx="10" fill="#fff"/>`
    + `<path d="${path}" fill="none" stroke="#e5446d" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
