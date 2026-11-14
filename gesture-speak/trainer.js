// Gesture to speech, hands free. After Connect the page teaches itself: it asks for each
// gesture three times, one phrase after the other, with no buttons. Then it keeps
// recognising: every gesture is written down and spoken (ElevenLabs through this
// project's own server at /speak; the browser's voice if that does not answer).
// Built on the kit's gesture trainer (recogniser.js is the kit's, unchanged).
import { $, say, attempt, onConnect } from '../shared/page.js';
import { Segmenter, toShape, match, distance, GYRO_SCALE } from './recogniser.js';
import { MOTIONS } from './motions.js';

const GESTURES = 4;              // rows in the table on the page
const EXAMPLES = 3;              // how many times you show each gesture
const SETTLE_MS = 1500;          // after a phrase is learned: time to bring the arm back, nothing counts
const PAUSE_MS = 1500;           // AI sentences: the hand still for this long ends the sentence
const RETRIES = 2;               // how often an odd example is thrown out before the row is taken as it is
const STORE = 'gesture-speak-v3';   // examples and phrases are kept in this browser, so a reload keeps them
const LINES = { ax: '#ff5c5c', ay: '#5cd65c', az: '#5c9dff', gx: '#ffa13d', gy: '#c77dff', gz: '#3dd6d6' };

const segmenter = new Segmenter();
let examples = Array.from({ length: GESTURES }, () => []);   // one list of shapes per phrase

let band = null;
let recording = -1;              // the row being learned, or -1 = recognising
let ignoreUntil = 0;             // gestures before this moment (computer time) do not count
let retries = 0;                 // odd examples thrown out for the row being learned
let resting = null;              // timer that waits for the pretend hand to finish a motion
let nextTimer = null;            // waits a moment before the next phrase is asked for
const spoken = [];               // what was said, newest last
let pending = [];                // AI sentences: the phrases of the sentence being made
let pauseTimer = null;

// ---- keeping the examples across a reload
function save() {
  const phrases = Array.from({ length: GESTURES }, (_, g) => $(`#name-${g}`).value);
  localStorage.setItem(STORE, JSON.stringify({ examples, phrases, limit: $('#limit').value }));
}
function load() {
  try {
    const kept = JSON.parse(localStorage.getItem(STORE));
    if (!kept || !Array.isArray(kept.examples)) return;
    for (let g = 0; g < GESTURES; g++) {
      const list = kept.examples[g];
      if (Array.isArray(list)) examples[g] = list.filter((s) => Array.isArray(s) && s.every(Number.isFinite)).slice(0, EXAMPLES);
      if (typeof kept.phrases?.[g] === 'string') $(`#name-${g}`).value = kept.phrases[g].slice(0, 60);
    }
    if (Number(kept.limit) >= 0.2 && Number(kept.limit) <= 2) $('#limit').value = kept.limit;
  } catch { /* nothing kept, or not ours: start empty */ }
}

// ---- the voice: ElevenLabs through /speak, one phrase after the other
const sounds = new Map();        // phrase -> Promise of a sound address (or null: use the browser's voice)
let line = Promise.resolve();    // what is being said now; the next phrase waits for it

function fetchSound(text) {
  if (!sounds.has(text)) {
    sounds.set(text, fetch('/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
      .then((answer) => (answer.ok ? answer.blob() : null))
      .then((blob) => (blob ? URL.createObjectURL(blob) : null))
      .catch(() => null));
  }
  return sounds.get(text);
}

function browserVoice(text) {
  return new Promise((done) => {
    if (!('speechSynthesis' in window)) return done();
    const words = new SpeechSynthesisUtterance(text);
    words.onend = words.onerror = () => done();
    speechSynthesis.speak(words);
    setTimeout(done, 6000);      // never wait for ever
  });
}

function speak(text) {
  if (!text) return;
  const ready = fetchSound(text);                // starts at once, plays when its turn comes
  line = line.then(async () => {
    const address = await ready;
    $('#voice').textContent = address ? '(voice: ElevenLabs)' : '(voice: this browser; ElevenLabs did not answer)';
    if (!address) return browserVoice(text);
    return new Promise((done) => {
      const sound = new Audio(address);
      sound.onended = sound.onerror = () => done();
      sound.play().catch(() => browserVoice(text).then(done));
      setTimeout(done, 8000);
    });
  });
}
/** Fetch every phrase now, so the first time a gesture is made the sound is there already. */
function warmVoice() {
  for (let g = 0; g < GESTURES; g++) fetchSound(nameOf(g));
}

// ---- the page
function show(text, detail = '', colour = '', sign = null) {
  $('#status').textContent = text;
  $('#status').style.color = colour;
  $('#detail').textContent = detail;
  $('#now-sign').hidden = sign === null;
  if (sign !== null) $('#now-sign').src = signOf(sign);
}
const nameOf = (g) => $(`#name-${g}`).value.trim() || `Phrase ${g + 1}`;
const signOf = (g) => $(`#name-${g}`).closest('tr').querySelector('img.sign').getAttribute('src');
const trained = () => examples.some((list) => list.length > 0);
const limit = () => Number($('#limit').value);
const skipped = new Set();     // phrases you skipped: left out until the next Connect
const nextToLearn = () => examples.findIndex((list, g) => list.length < EXAMPLES && !skipped.has(g));

function showTable() {
  for (let g = 0; g < GESTURES; g++) {
    $(`#count-${g}`).textContent = `${examples[g].length} of ${EXAMPLES}`;
    $(`#record-${g}`).textContent = recording === g ? 'Skip' : 'Redo';
    $(`#record-${g}`).disabled = !band;
  }
  $('#limit-text').textContent = limit().toFixed(2);
}

function waitForGesture() {
  if (recording !== -1) {
    show(`Show me "${nameOf(recording)}"`, `${examples[recording].length + 1} of ${EXAMPLES}. Hold still, make the gesture, hold still again.`, '', recording);
  } else if (trained()) show('Listening', 'Make any gesture you taught. Hold still for a moment between two.');
  else show('Nothing learned', 'Press Redo next to a phrase to teach it.');
}

/** Start learning one phrase. Called by the page itself after Connect, and by Redo. */
function learn(g) {
  clearTimeout(nextTimer);
  recording = g;
  retries = 0;
  examples[g] = [];
  segmenter.reset();
  ignoreUntil = Date.now() + 600;
  attempt(band.setLed('#ffffff', { pattern: 'breathe', period: 1500 }));    // white and breathing: "I am learning"
  save();
  showTable();
  waitForGesture();
}

/** Recognise from now on, or go on to the next phrase that still has to be learned. */
function carryOn() {
  clearTimeout(nextTimer);
  const next = nextToLearn();
  if (band && next !== -1) return learn(next);
  recording = -1;
  if (band) attempt(band.ledOff());
  save();
  showTable();
  waitForGesture();
}

/** The example that does not look like the other two (an arm coming back to rest, a bump), or -1. */
function oddOne(list) {
  const near = list.map((one, i) => Math.min(...list.filter((_, j) => j !== i).map((other) => distance(one, other))));
  const worst = near.indexOf(Math.max(...near));
  const others = list.filter((_, i) => i !== worst);
  const between = distance(others[0], others[1]);
  return near[worst] > limit() && near[worst] > 2 * between ? worst : -1;
}

/** Draw the samples of one gesture: six lines over time. */
function draw(gesture) {
  const canvas = $('#picture');
  const pen = canvas.getContext('2d');
  const { width, height } = canvas;
  pen.clearRect(0, 0, width, height);
  if (!gesture) return;
  const start = gesture[0].t, length = gesture[gesture.length - 1].t - start;
  pen.lineWidth = 2;
  for (const [axis, colour] of Object.entries(LINES)) {
    const scale = axis[0] === 'g' ? GYRO_SCALE * 2 : 2;
    pen.strokeStyle = colour;
    pen.beginPath();
    for (const sample of gesture) {
      pen.lineTo(10 + ((sample.t - start) / length) * (width - 20), height / 2 - (sample[axis] / scale) * (height / 2 - 8));
    }
    pen.stroke();
  }
}

function showSpoken() {
  const waiting = pending.length ? ` [${pending.join(' + ')} ...]` : '';
  $('#spoken').textContent = spoken.length || waiting ? spoken.slice(-40).join(' ') + waiting : 'Nothing yet.';
}

/** One recognised phrase: said at once, or kept until the sentence is over when AI sentences is on. */
function heard(phrase) {
  if (!$('#ai').checked) {
    speak(phrase);
    spoken.push(phrase);
    return showSpoken();
  }
  pending.push(phrase);
  fetchSound(phrase);                            // ready in case it stays a sentence of one
  showSpoken();
  clearTimeout(pauseTimer);
  pauseTimer = setTimeout(endSentence, PAUSE_MS);
}

/** The hand paused: turn the phrases so far into one sentence (OpenAI through /sentence) and say it. */
async function endSentence() {
  clearTimeout(pauseTimer);
  const phrases = pending;
  pending = [];
  if (phrases.length === 0) return;
  let text = phrases.join(' ');                  // one phrase, or no answer: said as it is
  if (phrases.length > 1) {
    try {
      const answer = await fetch('/sentence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phrases }) });
      if (answer.ok) text = (await answer.json()).text || text;
    } catch { /* said as it is */ }
  }
  speak(text);
  spoken.push(text);
  showSpoken();
}

function onGesture(gesture) {
  if (Date.now() < ignoreUntil) return;
  draw(gesture);
  const shape = toShape(gesture);
  const seconds = ((gesture[gesture.length - 1].t - gesture[0].t) / 1000).toFixed(1);
  if (recording !== -1) {
    const g = recording;
    examples[g].push(shape);
    if (examples[g].length === EXAMPLES) {
      const odd = retries < RETRIES ? oddOne(examples[g]) : -1;
      if (odd !== -1) {
        retries++;
        examples[g].splice(odd, 1);
        show(`Once more: "${nameOf(g)}"`, 'One of the three looked different from the other two, so it was dropped.', '', g);
      } else {
        const colour = $(`#colour-${g}`).value;
        show(`Learned "${nameOf(g)}"`, 'Bring your arm back to rest.', colour, g);
        attempt(band.setLed(colour));
        recording = -1;
        ignoreUntil = Date.now() + SETTLE_MS;
        clearTimeout(nextTimer);
        nextTimer = setTimeout(carryOn, SETTLE_MS);
      }
    } else {
      waitForGesture();
    }
    save();
    showTable();
    return;
  }
  if (!trained()) return;
  const candidates = examples.flatMap((list, g) => list.map((one) => ({ label: g, shape: one })));
  const found = match(shape, candidates, limit());
  const detail = `${seconds} seconds. Distance to the nearest example: ${found.distance.toFixed(2)} (not sure above ${limit().toFixed(2)}).`;
  if (found.label === null) {
    show('Not sure', detail);
    attempt(band.ledOff());
  } else {
    const colour = $(`#colour-${found.label}`).value;
    const phrase = nameOf(found.label);
    show(phrase, detail, colour, found.label);
    heard(phrase);
    attempt(band.setLed(colour));
  }
}

// ---- the parts of the page that work without a band
load();
showTable();
for (let g = 0; g < GESTURES; g++) {
  $(`#speak-${g}`).onclick = () => speak(nameOf(g));
  $(`#name-${g}`).onchange = () => { save(); fetchSound(nameOf(g)); };
}
$('#limit').oninput = () => { showTable(); save(); };
$('#clear').onclick = () => { spoken.length = 0; pending = []; clearTimeout(pauseTimer); showSpoken(); };
$('#ai').onchange = () => { if (!$('#ai').checked) endSentence(); };
$('#forget').onclick = () => {
  examples = Array.from({ length: GESTURES }, () => []);
  save();
  skipped.clear();
  if (band) carryOn(); else showTable();      // connected: it starts teaching itself again
};

onConnect(async (theBand, pretend) => {
  band = theBand;
  band.on('motion', (sample) => {
    const gesture = segmenter.feed(sample);
    // The hand is moving: the sentence is not over, whatever this movement turns out to be.
    if (pending.length && segmenter.samples.length) { clearTimeout(pauseTimer); pauseTimer = setTimeout(endSentence, PAUSE_MS); }
    if (gesture) onGesture(gesture);
  });

  const stop = (text) => { segmenter.reset(); clearTimeout(nextTimer); recording = -1; showTable(); show(text); };
  band.on('reconnecting', () => stop('Link lost...'));
  band.on('reconnected', () => carryOn());
  band.on('disconnect', () => {
    band = null;
    stop('Not connected');
    clearInterval(resting);
    for (const name of Object.keys(MOTIONS)) $(`#pretend-${name}`).disabled = true;
  });

  // Redo teaches one phrase again. While that phrase is being learned the button says Skip.
  for (let g = 0; g < GESTURES; g++) {
    $(`#record-${g}`).onclick = () => {
      if (recording !== g) { skipped.delete(g); return learn(g); }
      examples[g] = [];              // skipped: this phrase matches nothing, the page goes on to the next
      skipped.add(g);
      carryOn();
    };
  }
  if (pretend) {
    const buttons = (on) => { for (const name of Object.keys(MOTIONS)) $(`#pretend-${name}`).disabled = !on; };
    pretend.playMotion([{}]);
    for (const [name, [shape, seconds]] of Object.entries(MOTIONS)) {
      $(`#pretend-${name}`).onclick = () => {
        pretend.playMotion(shape, { seconds });
        pretend.playMotion({}, { seconds: 0.5 });
        buttons(false);
        clearInterval(resting);
        resting = setInterval(() => { if (!pretend.moving) { clearInterval(resting); buttons(Boolean(band)); } }, 50);
      };
    }
    buttons(true);
  }

  await band.configure({ motion: 50 });
  say(`Connected to ${band.name}.`);
  warmVoice();
  skipped.clear();
  carryOn();
});

