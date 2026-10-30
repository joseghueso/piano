'use strict';

// ---------- Configuración ----------
const MIDI_MIN = 21;  // A0
const MIDI_MAX = 108; // C8
const ZOOM_STEPS = [8, 11, 15, 22, 29]; // teclas blancas visibles
const NAMES_EN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NAMES_ES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
const LABEL_MODES = ['es', 'en', 'off'];
const LABEL_TEXT = { es: 'Do Re Mi', en: 'C D E', off: 'Notas' };

const isBlack = (m) => [1, 3, 6, 8, 10].includes(m % 12);
const octaveOf = (m) => Math.floor(m / 12) - 1;
const nameOf = (m, mode) => (mode === 'es' ? NAMES_ES : NAMES_EN)[m % 12] + octaveOf(m);

const settings = load({
  startOctave: 3,
  zoom: 2,
  labels: 'es',
  sustain: false,
  haptics: false,
  volume: 0.8,
});

function load(defaults) {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem('piano-settings') || '{}') };
  } catch {
    return defaults;
  }
}
function save() {
  try { localStorage.setItem('piano-settings', JSON.stringify(settings)); } catch {}
}

// ---------- Audio ----------
let ctx = null;
let master = null;
let wave = null;
const voices = new Map(); // midi -> voice

function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.ratio.value = 4;
  master = ctx.createGain();
  master.gain.value = settings.volume;
  master.connect(comp).connect(ctx.destination);

  // Timbre de piano aproximado: armónicos que decaen rápido
  const amps = [0, 1, 0.55, 0.32, 0.2, 0.14, 0.08, 0.05, 0.035, 0.02, 0.012];
  const real = new Float32Array(amps.length);
  const imag = Float32Array.from(amps);
  wave = ctx.createPeriodicWave(real, imag);
}

function noteOn(midi) {
  if (!ctx) return;
  const old = voices.get(midi);
  if (old) stopVoice(old, 0.02);

  const t = ctx.currentTime;
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  // Graves suenan más tiempo que agudos
  const k = (midi - MIDI_MIN) / (MIDI_MAX - MIDI_MIN);
  const decay = 2.2 - 1.8 * k;
  const vel = 0.32 - 0.12 * k;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.5;
  filter.frequency.setValueAtTime(Math.min(freq * 10, 16000), t);
  filter.frequency.setTargetAtTime(Math.min(freq * 3, 8000), t, decay * 0.25);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vel, t + 0.004);
  gain.gain.setTargetAtTime(vel * 0.35, t + 0.004, 0.12);
  gain.gain.setTargetAtTime(0, t + 0.15, decay);

  filter.connect(gain).connect(master);

  // Dos "cuerdas" ligeramente desafinadas para dar cuerpo
  const oscs = [-1.5, 1.5].map((cents) => {
    const o = ctx.createOscillator();
    o.setPeriodicWave(wave);
    o.frequency.value = freq;
    o.detune.value = cents;
    o.connect(filter);
    o.start(t);
    o.stop(t + 0.15 + decay * 7);
    return o;
  });

  const voice = { midi, gain, oscs, held: true };
  oscs[0].onended = () => { if (voices.get(midi) === voice) voices.delete(midi); };
  voices.set(midi, voice);
}

function noteOff(midi) {
  const v = voices.get(midi);
  if (!v) return;
  v.held = false;
  if (!settings.sustain) stopVoice(v, 0.12);
}

function stopVoice(v, tau) {
  const t = ctx.currentTime;
  const g = v.gain.gain;
  if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t);
  else { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); }
  g.setTargetAtTime(0, t, tau);
  v.oscs.forEach((o) => { try { o.stop(t + tau * 8); } catch {} });
  if (voices.get(v.midi) === v) voices.delete(v.midi);
}

function releaseSustained() {
  for (const v of [...voices.values()]) if (!v.held) stopVoice(v, 0.15);
}

// ---------- Teclado ----------
const keyboard = document.getElementById('keyboard');
const keyEls = new Map(); // midi -> element
const pressCount = new Map(); // midi -> nº de dedos sobre la tecla

function visibleRange() {
  const whites = ZOOM_STEPS[settings.zoom];
  let start = 12 * (settings.startOctave + 1); // C de la octava
  const keys = [];
  let m = start;
  let count = 0;
  while (count < whites) {
    if (!isBlack(m)) count++;
    keys.push(m);
    m++;
  }
  return keys.filter((k) => k >= MIDI_MIN && k <= MIDI_MAX);
}

function render() {
  keyboard.innerHTML = '';
  keyEls.clear();
  keyboard.classList.toggle('hide-labels', settings.labels === 'off');

  const keys = visibleRange();
  const whites = keys.filter((k) => !isBlack(k));
  const w = 100 / whites.length;

  let whiteIndex = 0;
  for (const m of keys) {
    const el = document.createElement('div');
    el.className = 'key ' + (isBlack(m) ? 'black' : 'white');
    el.dataset.midi = m;
    const label = document.createElement('span');
    label.className = 'note-name' + (m % 12 === 0 ? ' c' : '');
    label.textContent = nameOf(m, settings.labels);
    el.appendChild(label);

    if (isBlack(m)) {
      const bw = w * 0.62;
      el.style.width = bw + '%';
      el.style.left = (whiteIndex * w - bw / 2) + '%';
    } else {
      whiteIndex++;
    }
    if (pressCount.get(m)) el.classList.add('down');
    keyboard.appendChild(el);
    keyEls.set(m, el);
  }

  const first = keys[0];
  const last = keys[keys.length - 1];
  document.getElementById('rangeLabel').textContent =
    `${nameOf(first, settings.labels === 'es' ? 'es' : 'en')} – ${nameOf(last, settings.labels === 'es' ? 'es' : 'en')}`;
}

function press(midi) {
  const n = (pressCount.get(midi) || 0) + 1;
  pressCount.set(midi, n);
  if (n === 1) {
    noteOn(midi);
    keyEls.get(midi)?.classList.add('down');
    if (settings.haptics && navigator.vibrate) navigator.vibrate(8);
  }
}

function release(midi) {
  const n = (pressCount.get(midi) || 0) - 1;
  if (n > 0) { pressCount.set(midi, n); return; }
  pressCount.delete(midi);
  noteOff(midi);
  keyEls.get(midi)?.classList.remove('down');
}

// ---------- Multitáctil ----------
const pointers = new Map(); // pointerId -> midi | null

function keyAt(x, y) {
  const el = document.elementFromPoint(x, y)?.closest('.key');
  return el && keyboard.contains(el) ? Number(el.dataset.midi) : null;
}

keyboard.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  initAudio();
  requestWakeLock();
  const midi = keyAt(e.clientX, e.clientY);
  pointers.set(e.pointerId, midi);
  if (midi !== null) press(midi);
});

keyboard.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  // Permite deslizar el dedo de una tecla a otra (glissando)
  const midi = keyAt(e.clientX, e.clientY);
  const prev = pointers.get(e.pointerId);
  if (midi === prev) return;
  if (prev !== null) release(prev);
  pointers.set(e.pointerId, midi);
  if (midi !== null) press(midi);
});

function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  const midi = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (midi !== null) release(midi);
}
keyboard.addEventListener('pointerup', endPointer);
keyboard.addEventListener('pointercancel', endPointer);
keyboard.addEventListener('lostpointercapture', endPointer);
keyboard.addEventListener('contextmenu', (e) => e.preventDefault());

// Teclado físico (útil para probar en ordenador): A W S E D F T G Y H U J K
const PC_KEYS = 'awsedftgyhujkolp;';
const pcDown = new Set();
window.addEventListener('keydown', (e) => {
  const i = PC_KEYS.indexOf(e.key.toLowerCase());
  if (i < 0 || e.repeat || pcDown.has(i)) return;
  initAudio();
  pcDown.add(i);
  press(12 * (settings.startOctave + 1) + i);
});
window.addEventListener('keyup', (e) => {
  const i = PC_KEYS.indexOf(e.key.toLowerCase());
  if (i < 0 || !pcDown.has(i)) return;
  pcDown.delete(i);
  release(12 * (settings.startOctave + 1) + i);
});

// ---------- Controles ----------
const $ = (id) => document.getElementById(id);

function setToggle(el, on) { el.setAttribute('aria-pressed', String(on)); }

$('octDown').addEventListener('click', () => {
  if (settings.startOctave > 0) { settings.startOctave--; save(); render(); }
});
$('octUp').addEventListener('click', () => {
  if (settings.startOctave < 7) { settings.startOctave++; save(); render(); }
});
$('zoomOut').addEventListener('click', () => {
  if (settings.zoom < ZOOM_STEPS.length - 1) { settings.zoom++; save(); render(); }
});
$('zoomIn').addEventListener('click', () => {
  if (settings.zoom > 0) { settings.zoom--; save(); render(); }
});

$('sustain').addEventListener('click', (e) => {
  settings.sustain = !settings.sustain;
  setToggle(e.currentTarget, settings.sustain);
  if (!settings.sustain && ctx) releaseSustained();
  save();
});

function syncLabelsButton() {
  const btn = $('labels');
  btn.textContent = LABEL_TEXT[settings.labels];
  setToggle(btn, settings.labels !== 'off');
}
$('labels').addEventListener('click', () => {
  settings.labels = LABEL_MODES[(LABEL_MODES.indexOf(settings.labels) + 1) % LABEL_MODES.length];
  syncLabelsButton();
  save();
  render();
});

$('haptics').addEventListener('click', (e) => {
  settings.haptics = !settings.haptics;
  setToggle(e.currentTarget, settings.haptics);
  save();
});

$('volume').addEventListener('input', (e) => {
  settings.volume = Number(e.target.value);
  if (master) master.gain.setTargetAtTime(settings.volume, ctx.currentTime, 0.02);
  save();
});

$('fullscreen').addEventListener('click', async () => {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      await screen.orientation?.lock?.('landscape');
    } else {
      await document.exitFullscreen();
    }
  } catch {}
});

// Mantener la pantalla encendida mientras se toca
let wakeLock = null;
async function requestWakeLock() {
  if (wakeLock || !('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ctx) requestWakeLock();
});

// ---------- Inicio ----------
setToggle($('sustain'), settings.sustain);
setToggle($('haptics'), settings.haptics);
$('volume').value = settings.volume;
syncLabelsButton();
render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
