// Gesture to speech, hands free. After Connect the page teaches itself: it asks for each
// gesture three times, one phrase after the other, with no buttons. Then it keeps
// recognising: every gesture is written down and spoken (ElevenLabs through this
// project's own server at /speak; the browser's voice if that does not answer).
// Built on the kit's gesture trainer (recogniser.js is the kit's, unchanged).
import { $, say, attempt, onConnect } from '../shared/page.js';
import { Segmenter, GYRO_SCALE } from './recogniser.js';
import { features, match, distance, rate, shakeOf, liveRate } from './rhythm.js';
import { MOTIONS } from './motions.js';
import { SCENES } from './scenes.js';
import { captions } from './captions.js';
import { oggPackets } from '../vexo-open-kit/js/src/audio.js';

const GESTURES = document.querySelectorAll('input[id^="name-"]').length;   // rows in the table on the page
const COMMANDS = 4;              // shake rhythm: slow, fast, slow x2, fast x2
const EXAMPLES = 3;              // how many times you show each gesture
const SETTLE_MS = 1500;          // after a phrase is learned: time to bring the arm back, nothing counts
const PAUSE_MS = 1500;           // AI sentences: the hand still for this long ends the sentence
const RETRIES = 2;               // how often an odd example is thrown out before the row is taken as it is
const STORE = 'gesture-speak-v5';   // examples and phrases are kept in this browser, so a reload keeps them (v5: shapes end with the shake rate)
const LINES = { ax: '#ff5c5c', ay: '#5cd65c', az: '#5c9dff', gx: '#ffa13d', gy: '#c77dff', gz: '#3dd6d6' };

const segmenter = new Segmenter();
let examples = Array.from({ length: GESTURES }, () => []);   // one list of shapes per phrase

let band = null;
let recording = -1;              // the row being learned, or -1 = recognising
let ignoreUntil = 0;             // gestures before this moment (computer time) do not count
let retries = 0;                 // odd examples thrown out for the row being learned
let resting = null;              // timer that waits for the pretend hand to finish a motion
let nextTimer = null;            // waits a moment before the next phrase is asked for
const talk = [];                 // the conversation, newest last: { who: 'me' | 'them', text }
let live = '';                   // what the other person is saying right now (captions, not finished)
let talking = 0;                 // this page is speaking: the band's microphone is not sent, or it would caption us
let pending = [];                // AI sentences: the phrases of the sentence being made
let pauseTimer = null;

// ---- keeping the examples across a reload
function save() {
  const phrases = Array.from({ length: GESTURES }, (_, g) => $(`#name-${g}`).value);
  const rphrases = Array.from({ length: COMMANDS }, (_, i) => $(`#rname-${i}`).value);
  localStorage.setItem(STORE, JSON.stringify({ examples, phrases, rphrases, limit: $('#limit').value, scene: $('#scene').value,
    mode: $('#mode').value, boundary: $('#boundary').value }));
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
    if (kept.scene in SCENES) $('#scene').value = kept.scene;
    if (kept.mode === 'rhythm' || kept.mode === 'taught') $('#mode').value = kept.mode;
    if (Number(kept.boundary) >= 2 && Number(kept.boundary) <= 6) $('#boundary').value = kept.boundary;
    for (let i = 0; i < COMMANDS; i++) if (typeof kept.rphrases?.[i] === 'string') $(`#rname-${i}`).value = kept.rphrases[i].slice(0, 60);
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
    talking++;
    try {
      if (!address) return await browserVoice(text);
      await new Promise((done) => {
        const sound = new Audio(address);
        sound.onended = sound.onerror = () => done();
        sound.play().catch(() => browserVoice(text).then(done));
        setTimeout(done, 8000);
      });
    } finally {
      setTimeout(() => talking--, 400);          // the room still echoes for a moment
    }
  });
}
/** Fetch every phrase now, so the first time a gesture is made the sound is there already. */
function warmVoice() {
  for (let g = 0; g < GESTURES; g++) fetchSound(nameOf(g));
  for (let i = 0; i < COMMANDS; i++) fetchSound(cmdPhrase(i));
}

// ---- the page
function show(text, detail = '', colour = '', sign = null) {
  $('#status').textContent = text;
  $('#status').style.color = colour;
  $('#detail').textContent = detail;
  $('#now-sign').hidden = sign === null;
  if (sign !== null) $('#now-sign').src = typeof sign === 'number' ? signOf(sign) : sign;     // a table row, or a picture
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
  if (isRhythm()) return show('Listening for shakes', 'Shake slow or fast, once or twice. Stop for a moment after each.');
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
  light('#ffffff', { pattern: 'breathe', period: 1500 });    // white and breathing: "I am learning"
  save();
  showTable();
  waitForGesture();
}

/** Recognise from now on, or go on to the next phrase that still has to be learned. */
function carryOn() {
  clearTimeout(nextTimer);
  const next = nextToLearn();
  if (band && next !== -1 && !isRhythm()) return learn(next);
  recording = -1;
  light(null);
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
  const lines = talk.slice(-40).map(({ who, text }) => line_(who, text));
  if (pending.length) lines.push(line_('me', `${pending.join(' + ')} ...`, true));
  if (live) lines.push(line_('them', live, true));
  if (!lines.length) lines.push(line_('', 'Nothing yet.'));
  $('#spoken').replaceChildren(...lines);
  $('#spoken').scrollTop = $('#spoken').scrollHeight;
  $('#live').textContent = live || (talk.findLast((one) => one.who === 'them')?.text ?? '');
  $('#live').classList.toggle('guess', Boolean(live));
}
function line_(who, text, guess = false) {
  const p = document.createElement('p');
  p.className = `${who}${guess ? ' guess' : ''}`;
  if (who) {
    const name = document.createElement('b');
    name.textContent = who === 'me' ? 'Me' : 'Them';
    p.append(name, ' ');
  }
  p.append(text);
  return p;
}

/** One recognised phrase: said at once, or kept until the sentence is over when AI sentences is on. */
function heard(phrase) {
  if (!$('#ai').checked) {
    speak(phrase);
    talk.push({ who: 'me', text: phrase });
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
  talk.push({ who: 'me', text });
  showSpoken();
}

function onGesture(gesture) {
  if (Date.now() < ignoreUntil) return;
  draw(gesture);
  if (isRhythm()) return onShake(gesture);
  const shape = features(gesture);
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
        light(colour);
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
  const detail = `${seconds} seconds, ${rate(gesture).toFixed(1)} shakes a second. Distance to the nearest example: ${found.distance.toFixed(2)} (not sure above ${limit().toFixed(2)}).`;
  if (found.label === null) {
    show('Not sure', detail);
    light(null);
  } else {
    const colour = $(`#colour-${found.label}`).value;
    const phrase = nameOf(found.label);
    show(phrase, detail, colour, found.label);
    heard(phrase);
    followScript(found.label);
    light(colour);
  }
}

// ---- scenes: ready-made phrase sets, some with a script to act out in a demo
let step = 0;                    // the script line being acted out now
const scene = () => SCENES[$('#scene').value];

const scriptLines = () => (isRhythm() ? scene()?.rhythm?.script : scene()?.script);
function showScript() {
  const script = scriptLines();
  $('#script-card').hidden = !script;
  if (!script) return;
  $('#script-title').textContent = `Demo script: ${scene().title}`;
  $('#script').replaceChildren(...script.map((line, i) => {
    const item = document.createElement('li');
    item.className = i < step ? 'done' : i === step ? 'now' : '';
    const sign = document.createElement('img');
    sign.className = 'sign';
    sign.src = isRhythm() ? cmdPicture(line.cmd) : signOf(line.row);
    sign.alt = isRhythm() ? RHYTHM_NAMES[line.cmd] : $(`#name-${line.row}`).closest('tr').querySelector('img.sign').alt;
    const they = document.createElement('span');
    they.className = 'they';
    they.textContent = line.they;
    const you = document.createElement('span');
    you.className = 'you';
    you.textContent = isRhythm() ? cmdPhrase(line.cmd) : nameOf(line.row);
    item.append(they, sign, you);
    return item;
  }));
}
/** A phrase was recognised: if it answers the current script line, go on to the next. */
function followScript(key) {
  const script = scriptLines();
  if (!script || step >= script.length || (isRhythm() ? script[step].cmd : script[step].row) !== key) return;
  step++;
  showScript();
}
/** Fill the phrase boxes from the scene. The learned gestures stay: only the words change. */
function useScene() {
  scene().phrases.forEach((phrase, g) => { if (g < GESTURES) $(`#name-${g}`).value = phrase; });
  scene().rhythm?.phrases.forEach((phrase, i) => { $(`#rname-${i}`).value = phrase; });
  step = 0;
  save();
  warmVoice();
  showScript();
}

// ---- shake rhythm: nothing to teach
// Four commands, told apart by speed (slow or fast, the line is the slider) and by how many
// bursts (one, or two with a short stop between). A burst waits GAP_MS for a second one.
const RHYTHM_NAMES = ['Slow shake', 'Fast shake', 'Slow shake ×2', 'Fast shake ×2'];
const RHYTHM_COLOURS = ['#0a84ff', '#ff9500', '#0a84ff', '#ff9500'];
const GAP_MS = 900;              // after a burst: this long to start a second one
const MOST_WAIT_MS = 4000;       // a second burst that never ends: the first is said anyway
const METER_TOP = 9;             // shakes a second at the right end of the meter
const isRhythm = () => $('#mode').value === 'rhythm';
const boundary = () => Number($('#boundary').value);
const cmdPhrase = (i) => $(`#rname-${i}`).value.trim() || RHYTHM_NAMES[i];
const cmdPicture = (i) => $(`#tile-${i} img`).getAttribute('src');
let held = null;                 // { fast, detail, since }: a burst waiting to see if a second one comes
let holdTimer = null;
let meterAt = 0;

function onShake(gesture) {
  const shake = shakeOf(gesture);
  if (!shake) return show('Not a shake', 'Turn the wrist left and right a few times, then stop.');
  const fast = shake.perSecond >= boundary();
  const detail = `${shake.perSecond.toFixed(1)} shakes a second, ${fast ? 'fast' : 'slow'} (the line is at ${boundary()}).`;
  if (held && held.fast === fast) {          // the second burst, same speed: x2
    held = null;
    return said(fast ? 3 : 2, detail);
  }
  if (held) said(held.fast ? 1 : 0, held.detail);   // a different speed: the first one stands on its own
  held = { fast, detail, since: Date.now() };
  const i = fast ? 1 : 0;
  show(`${RHYTHM_NAMES[i]}...`, `${detail} Shake the same way again now for ×2.`, RHYTHM_COLOURS[i], cmdPicture(i));
  clearTimeout(holdTimer);
  holdTimer = setTimeout(waitForSecond, GAP_MS);
}
function waitForSecond() {
  if (!held) return;
  // A second burst is under way: wait for it to end (it decides x1 or x2).
  if (segmenter.samples.length && Date.now() - held.since < MOST_WAIT_MS) { holdTimer = setTimeout(waitForSecond, 100); return; }
  const one = held;
  held = null;
  said(one.fast ? 1 : 0, one.detail);
}
function said(i, detail) {
  clearTimeout(holdTimer);
  const phrase = cmdPhrase(i);
  show(phrase, `${RHYTHM_NAMES[i]}. ${detail}`, RHYTHM_COLOURS[i], cmdPicture(i));
  heard(phrase);
  followScript(i);
  light(RHYTHM_COLOURS[i]);
  const tile = $(`#tile-${i}`);
  tile.classList.add('hit');
  setTimeout(() => tile.classList.remove('hit'), 1500);
}
function showMeter(perSecond) {
  $('#needle').style.left = `${(Math.min(perSecond, METER_TOP) / METER_TOP) * 100}%`;
  $('#meter-text').textContent = perSecond > 0
    ? `${perSecond.toFixed(1)} shakes a second: ${perSecond >= boundary() ? 'FAST' : 'slow'}` : 'not shaking';
}
function showBoundary() {
  $('#meter-slow').style.width = `${(boundary() / METER_TOP) * 100}%`;
  $('#boundary-text').textContent = String(boundary());
}
function showMode() {
  $('#rhythm-card').hidden = !isRhythm();
  $('#taught-card').hidden = isRhythm();
  held = null;
  clearTimeout(holdTimer);
  step = 0;
  showScript();
}

// ---- live captions: the other person's words, from the band's microphone
let micOn = false;               // the band's microphone is on: its light is solid blue and cannot be changed
let voice = null;                // the pretend band's sample voice, loaded once
/** The band's light, unless the microphone owns it. null = off. */
function light(colour, options) {
  if (!band || micOn) return;
  attempt(colour === null ? band.ledOff() : band.setLed(colour, options));
}
const STATES = {
  connecting: 'Connecting to Deepgram...',
  on: "Captions on. Everything the band's microphone hears is sent to Deepgram until you switch them off.",
  off: 'Captions off.',
  'no-key': 'Captions need DEEPGRAM_API_KEY in the .env file next to server.py.',
  failed: 'Deepgram did not answer. Check the key and the internet, then switch captions on again.',
};
const listener = captions({
  text(text, final) {
    if (final) { live = ''; talk.push({ who: 'them', text }); } else live = text;
    showSpoken();
  },
  async state(state) {
    $('#captions-state').textContent = STATES[state];
    $('#captions-state').classList.toggle('warn', state === 'on');
    if (state !== 'on' && state !== 'connecting') {
      $('#captions').checked = false;
      live = '';
      showSpoken();
      await mic(false);
    }
  },
});
async function mic(on) {
  if (!band || micOn === on) return;
  micOn = on;
  try { await band.configure({ audio: on }); } catch (e) { say(e.message); }
}
async function switchCaptions() {
  if (!$('#captions').checked) return listener.stop();
  if (!band) return ($('#captions-state').textContent = 'Connect the band first: captions use its microphone.', $('#captions').checked = false);
  await mic(true);
  listener.start();
}

// ---- the parts of the page that work without a band
for (const [key, { title }] of Object.entries(SCENES)) $('#scene').add(new Option(title, key));
load();
showBoundary();
showMode();
showMeter(0);
showTable();
for (let g = 0; g < GESTURES; g++) {
  $(`#speak-${g}`).onclick = () => speak(nameOf(g));
  $(`#name-${g}`).onchange = () => { save(); fetchSound(nameOf(g)); showScript(); };
}
$('#limit').oninput = () => { showTable(); save(); };
$('#scene').onchange = useScene;
$('#mode').onchange = () => { showMode(); save(); if (band) carryOn(); else waitForGesture(); };
$('#boundary').oninput = () => { showBoundary(); save(); };
for (let i = 0; i < COMMANDS; i++) {
  $(`#rspeak-${i}`).onclick = () => speak(cmdPhrase(i));
  $(`#rname-${i}`).onchange = () => { save(); fetchSound(cmdPhrase(i)); showScript(); };
}
$('#script-restart').onclick = () => { step = 0; showScript(); };
$('#clear').onclick = () => { talk.length = 0; live = ''; pending = []; clearTimeout(pauseTimer); showSpoken(); };
$('#captions').onchange = switchCaptions;
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
    if (isRhythm() && Date.now() - meterAt > 100) { meterAt = Date.now(); showMeter(liveRate(segmenter.samples)); }
  });
  band.on('audio', (packet) => { if (!talking) listener.send(packet.opus); });

  const stop = (text) => { segmenter.reset(); clearTimeout(nextTimer); recording = -1; showTable(); show(text); };
  band.on('reconnecting', () => stop('Link lost...'));
  band.on('reconnected', () => carryOn());
  band.on('disconnect', () => {
    if ($('#captions').checked) listener.stop();
    micOn = false;
    held = null;
    clearTimeout(holdTimer);
    showMeter(0);
    $('#pretend-voice').disabled = true;
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
    // Someone speaks to you: the kit's sample voice, played through the pretend microphone.
    $('#pretend-voice').disabled = false;
    $('#pretend-voice').onclick = async () => {
      voice ??= fetch('../vexo-open-kit/dashboard/speech/sample-speech.opus').then((r) => r.arrayBuffer()).then((b) => oggPackets(new Uint8Array(b)));
      const packets = await voice;
      pretend.playLoudness(0.75, { seconds: packets.length * 0.02, packets });
    };
  }

  await band.configure({ motion: 50 });
  say(`Connected to ${band.name}.`);
  warmVoice();
  skipped.clear();
  carryOn();
});

