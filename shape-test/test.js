// Hand shape test: asks for Fist / Flat hand / Point in a mixed order, records the wrist's
// motion around each one at the fastest rate the link allows, and then checks how often
// a trial is named right by its nearest neighbour among all the other trials.
import { $, say, onConnect } from '../shared/page.js';
import { features, leaveOneOut, verdict } from './classify.js';

const SHAPES = ['Fist', 'Flat hand', 'Point'];
const EACH = 8;                  // trials per shape
const RELAX_MS = 1800;           // loose hand before each cue
const HOLD_MS = 1500;            // the shape is asked for and held this long
const LEAD_MS = 200;             // motion kept from before the cue

let band = null, pretend = null;
let recent = [];                 // the last few seconds of motion samples
let running = false;
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

function cue(text, hint = '', go = false) {
  $('#cue').textContent = text;
  $('#cue').classList.toggle('go', go);
  $('#hint').textContent = hint;
}

// The pretend hand: a small, different twitch for each shape (or the same one, to see "No").
const twitch = {
  Fist: (k) => (s) => ({ az: 1, gx: 25 * k * Math.sin(Math.PI * s / 0.3), ay: 0.03 * k * Math.sin(Math.PI * s / 0.3) }),
  'Flat hand': (k) => (s) => ({ az: 1, gy: -20 * k * Math.sin(Math.PI * s / 0.25), ax: -0.03 * k * Math.sin(Math.PI * s / 0.25) }),
  Point: (k) => (s) => ({ az: 1, gz: 15 * k * Math.sin(2 * Math.PI * s / 0.3), ax: 0.02 * k * Math.sin(Math.PI * s / 0.3) }),
};
function pretendMove(shape) {
  const k = 0.8 + 0.4 * Math.random();
  const kind = $('#pretend-same').checked ? 'Fist' : shape;
  const noise = () => (Math.random() - 0.5);
  const base = twitch[kind](k);
  const noisy = (s) => { const m = base(s); return { ...m, gx: (m.gx ?? 0) + 6 * noise(), gy: (m.gy ?? 0) + 6 * noise(), gz: (m.gz ?? 0) + 6 * noise() }; };
  pretend.playMotion({ az: 1 }, { seconds: 0.15 + 0.2 * Math.random() });   // people react at different speeds
  pretend.playMotion(noisy, { seconds: 0.3 });
  pretend.playMotion({ az: 1 }, { seconds: 0.2 });
}

async function run() {
  running = true;
  $('#start').disabled = true;
  $('#result').hidden = true;
  const order = SHAPES.flatMap((shape) => Array(EACH).fill(shape));
  for (let i = order.length - 1; i > 0; i--) {            // shuffle
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const trials = [];
  let lost = 0;
  for (let n = 0; n < order.length && band && running; n++) {
    $('#progress').textContent = `${n + 1} of ${order.length}`;
    cue('Relax', 'Hand loose, arm still.');
    await wait(RELAX_MS);
    if (!band || !running || recent.length === 0) break;
    const at = recent[recent.length - 1].t;                // the band's time at the cue
    cue(order[n], 'Make the shape now and hold it.', true);
    if (pretend) pretendMove(order[n]);
    await wait(HOLD_MS);
    const samples = recent.filter((s) => s.t >= at - LEAD_MS && s.t <= at + HOLD_MS - 100);
    if (samples.length < 40) { lost++; continue; }         // the link dropped samples: skip this one
    const made = features(samples);
    trials.push({ label: order[n], shape: made.shape, peakGyro: made.peakGyro });
  }
  running = false;
  $('#start').disabled = !band;
  $('#progress').textContent = '';
  if (trials.length < SHAPES.length * 3) { cue('Stopped', 'Too few trials were recorded to say anything.'); return; }
  report(trials, lost);
}

function report(trials, lost) {
  const found = leaveOneOut(trials, SHAPES);
  const percent = Math.round((100 * found.right) / found.total);
  cue('Done', 'Press Start to run it again.');
  $('#score').textContent = `${found.right} of ${found.total} right (${percent}%)`;
  $('#verdict').firstChild.textContent = verdict(found.right, found.total, SHAPES.length);
  const table = $('#table');
  table.textContent = '';
  const row = (cells, head = false) => {
    const tr = document.createElement('tr');
    for (const text of cells) { const cell = document.createElement(head ? 'th' : 'td'); cell.textContent = text; tr.append(cell); }
    table.append(tr);
  };
  row(['Asked for', ...SHAPES.map((s) => `named ${s}`)], true);
  for (const asked of SHAPES) row([asked, ...SHAPES.map((s) => found.table[asked][s])]);
  const peaks = trials.map((t) => t.peakGyro).sort((a, b) => a - b);
  $('#size').textContent = `Guessing gets about ${Math.round(100 / SHAPES.length)}%. Strongest wrist turn per trial: `
    + `middle ${peaks[Math.floor(peaks.length / 2)].toFixed(0)}, smallest ${peaks[0].toFixed(0)}, largest ${peaks[peaks.length - 1].toFixed(0)} degrees/second `
    + `(a band at rest reads about 2).${lost ? ` ${lost} trials were skipped because samples were lost.` : ''}`;
  $('#result').hidden = false;
  window.lastResult = { right: found.right, total: found.total, table: found.table };
}

$('#start').onclick = run;

onConnect(async (theBand, thePretend) => {
  band = theBand;
  pretend = thePretend;
  band.on('motion', (sample) => {
    recent.push(sample);
    if (recent.length > 4000) recent = recent.slice(-2500);
  });
  band.on('disconnect', () => { band = null; running = false; $('#start').disabled = true; cue('Not connected'); });
  if (pretend) pretend.playMotion({ az: 1 });               // lies still until a cue
  const streams = await band.configure({ motion: 'fastest', sensors: 'both' });
  say(`Connected to ${band.name}. Motion at ${streams.motion} samples a second.`);
  $('#start').disabled = false;
  cue('Ready', 'Forearm on the table, hand loose. Press Start.');
});
