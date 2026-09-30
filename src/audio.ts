// Tiny Web Audio chiptune synth: SFX, eaten notes that climb the level's scale, and music that
// swells as the snake grows: public-domain tunes (notes taken from MIDI files, see
// tools/midi2ts.py) in chiptune arrangements, or a sequencer that plays back the notes you've eaten.
import { BOLERO_A, BOLERO_B, BOLERO_OSTINATO, BOLERO_SNARE, CRAB, CAIRO } from './tunes';

let ctx: AudioContext | null = null;
let master: GainNode;
let noiseBuf: AudioBuffer;

export function unlockAudio() {
  // iOS: play through the silent switch like a media app (Safari 16.4+).
  const session = (navigator as { audioSession?: { type: string } }).audioSession;
  if (session && session.type !== 'playback') session.type = 'playback';
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

export const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

function tone(freq: number, dur: number, type: OscillatorType, vol: number, at = 0, slideTo?: number) {
  if (!ctx) return;
  const t = at || ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.setValueAtTime(vol, t + dur * 0.7);
  g.gain.linearRampToValueAtTime(0, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.01);
}

function noise(dur: number, vol: number, cutoff: number, at = 0, type: BiquadFilterType = 'lowpass') {
  if (!ctx) return;
  const t = at || ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = cutoff;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur);
}

function arp(notes: number[], step: number, vol = 0.25, type: OscillatorType = 'square') {
  if (!ctx) return;
  const t = ctx.currentTime;
  notes.forEach((n, i) => n && tone(midiHz(n), step, type, vol, t + i * step));
}

/** Midi note of scale degree `i` (wrapping into higher octaves) above a pitch class root. */
export function scaleMidi(root: number, steps: number[], i: number, base = 60) {
  const r = base + root - (root >= 6 ? 12 : 0);
  return r + steps[i % steps.length] + 12 * Math.floor(i / steps.length);
}

export const sfx = {
  move: () => tone(1400, 0.02, 'square', 0.12),
  select: () => tone(988, 0.04, 'square', 0.18),
  start: () => arp([72, 76, 79, 84], 0.05),
  pause: () => arp([84, 79], 0.06, 0.18),
  /** The i-th note of the level's scale, with a little echo. */
  note(root: number, steps: number[], i: number) {
    if (!ctx) return;
    const f = midiHz(scaleMidi(root, steps, i, 72));
    const t = ctx.currentTime;
    tone(f, 0.22, 'square', 0.26, t);
    tone(f * 2, 0.05, 'square', 0.1, t);
    tone(f, 0.18, 'triangle', 0.3, t + 0.16);
    tone(f, 0.14, 'triangle', 0.14, t + 0.32);
  },
  /** The whole scale as a run, then its root chord. */
  scale(root: number, steps: number[]) {
    const run = Array.from({ length: steps.length + 1 }, (_, i) => scaleMidi(root, steps, i, 72));
    arp([...run, 0, run[0], run[run.length - 1]], 0.06, 0.22);
  },
  exitStep: (k: number) => tone(midiHz(60 + (k % 24)), 0.04, 'square', 0.12),
  die: () => {
    noise(0.4, 0.7, 700);
    arp([67, 63, 60, 55, 51, 48], 0.07, 0.22);
  },
  portal: () => tone(300, 0.18, 'sine', 0.5, 0, 1800),
  gate: () => {
    noise(0.15, 0.5, 400);
    tone(90, 0.12, 'square', 0.18, 0, 60);
  },
  gateWarn: () => tone(1800, 0.03, 'square', 0.08),
  roar: () => {
    noise(0.5, 0.6, 250);
    tone(110, 0.45, 'sawtooth', 0.25, 0, 55);
  },
  heartbeat: (vol: number) => {
    tone(55, 0.08, 'sine', vol, 0, 40);
    if (ctx) tone(50, 0.08, 'sine', vol * 0.7, ctx.currentTime + 0.14, 38);
  },
  labrys: () => arp([64, 67, 71, 76, 79, 83], 0.04, 0.24),
  thread: () => arp([79, 83, 86, 91], 0.05, 0.2, 'triangle'),
  eatMinotaur: () => {
    noise(0.25, 0.5, 1200);
    arp([60, 64, 67, 72, 76, 79, 84], 0.04, 0.24);
  },
  oneUp: () => arp([76, 79, 88, 84, 86, 91], 0.07, 0.22),
  over: () => arp([67, 63, 60, 55, 51, 48], 0.12, 0.22),
  win: () => arp([72, 0, 72, 76, 79, 0, 76, 79, 84, 84, 84], 0.09, 0.24),
};

// ---------- music ----------
// Each tune is a loop of time units. Intensity 0-5 comes from the snake's length:
// instruments join as it grows. Tunes are transposed to the level's key.

interface Tune {
  name: string;
  /** Seconds per unit at tempo 1. */
  unit: number;
  length: number;
  /** Schedule whatever sounds at unit i (already wrapped into the loop). */
  play(i: number, t: number, lv: number, tr: number, unitSec: number): void;
}

/** Indexes flat [onset, midi, length] triples by onset. */
function onsets(flat: number[], offset = 0, map = new Map<number, [number, number][]>()) {
  for (let k = 0; k < flat.length; k += 3) {
    const at = flat[k] + offset;
    if (!map.has(at)) map.set(at, []);
    map.get(at)!.push([flat[k + 1], flat[k + 2]]);
  }
  return map;
}

/** Semitone shift from a tune's own key to the level's, kept within a tritone. */
const shiftTo = (transpose: number, home: number) => ((transpose - home + 18) % 12) - 6;

const perc = {
  snare: (t: number, vol: number) => noise(0.05, vol, 7000, t, 'highpass'),
  hat: (t: number, vol: number) => noise(0.03, vol, 9000, t, 'highpass'),
  kick: (t: number, vol: number) => {
    tone(120, 0.12, 'sine', vol, t, 40);
    noise(0.04, vol * 0.4, 300, t);
  },
};

// --- Ravel, Bolero. Theme A (flute) then theme B (bassoon), each in an 18-bar window
// over the pizzicato ostinato and the snare. Unit: 1/12 beat, 36 per 3/4 bar.
const BAR = 36;
const BOLERO_MELODY = onsets(BOLERO_B, 18 * BAR, onsets(BOLERO_A));
const BOLERO_BASS = onsets(BOLERO_OSTINATO);
const BOLERO_DRUM = onsets(BOLERO_SNARE);

const BOLERO: Tune = {
  name: 'BOLERO',
  unit: 60 / 88 / 12,
  length: 36 * BAR,
  play(i, t, lv, transpose, u) {
    const inTwo = i % (2 * BAR);
    // The grand finale: the whole thing lifts to E, as in the original.
    const tr = transpose + (lv >= 5 ? 4 : 0);
    const snare = BOLERO_DRUM.has(inTwo);
    if (snare) perc.snare(t, (inTwo % 12 === 0 ? 0.16 : 0.1) * (1 + lv * 0.35));
    if (lv >= 1)
      for (const [m] of BOLERO_BASS.get(inTwo) ?? []) {
        tone(midiHz(m + tr), u * 5, 'triangle', 0.2 + lv * 0.03, t);
        if (lv >= 4) tone(midiHz(m + tr + 12), u * 3, 'square', 0.03, t);
      }
    if (lv >= 3 && inTwo % BAR === 0) noise(0.18, 0.5, 160, t);
    for (const [m, len] of BOLERO_MELODY.get(i) ?? []) {
      const f = midiHz(m + tr);
      const d = len * u * 0.95;
      // Flute first, then brighter and doubled, then Ravel's parallel harmonics.
      if (lv <= 1) tone(f, d, 'triangle', 0.32, t);
      else tone(f, d, 'square', 0.07 + lv * 0.012, t);
      if (lv >= 2) tone(f, d, 'triangle', 0.22, t);
      if (lv >= 3) tone(f * 2, d, 'square', 0.035, t);
      if (lv >= 4) tone(midiHz(m + tr + 7), d, 'square', 0.03, t);
      if (lv >= 5) tone(midiHz(m + tr + 16), d, 'square', 0.025, t);
    }
    if (lv >= 2 && snare && inTwo % 6 === 0) {
      const chord = i >= 18 * BAR ? [56, 60, 65] : [55, 60, 64];
      for (const c of chord) tone(midiHz(c + tr), u * 3, 'square', 0.018 + lv * 0.006, t);
    }
  },
};

// --- Thornton, The Streets of Cairo: the snake charmer song, in E minor, over a drone and
// hand drums. Unit: sixteenth note.
const CAIRO_MELODY = onsets(CAIRO);

const CHARMER: Tune = {
  name: 'CHARMER',
  unit: 60 / 104 / 4,
  length: 480,
  play(i, t, lv, transpose, u) {
    const tr = shiftTo(transpose, 4);
    const inBar = i % 16;
    // A drone of root and fifth, like a pungi's drone pipe.
    if (inBar === 0) {
      tone(midiHz(40 + tr), u * 15.6, 'triangle', 0.28, t);
      tone(midiHz(47 + tr), u * 15.6, 'triangle', 0.14, t);
    }
    // Hand drums: dum on 1 and the "and" of 2, tek in between.
    if (lv >= 1) {
      if (inBar === 0 || inBar === 6) tone(95, 0.14, 'sine', 0.45, t, 60);
      if (inBar === 4 || inBar === 12 || (lv >= 3 && inBar % 4 === 2)) perc.snare(t, 0.08 + lv * 0.02);
    }
    if (lv >= 4 && inBar === 8) tone(midiHz(52 + tr), u * 7, 'triangle', 0.18, t);
    for (const [n, len] of CAIRO_MELODY.get(i) ?? []) {
      const m = n + tr;
      const d = len * u * 0.92;
      tone(midiHz(m), d, 'square', 0.09 + lv * 0.01, t);
      // A slide down into long notes gives it that reedy wail.
      if (len >= 4) tone(midiHz(m + 1), u * 0.6, 'square', 0.05, t, midiHz(m));
      if (lv >= 2) tone(midiHz(m - 12), d, 'triangle', 0.22, t);
      if (lv >= 3) tone(midiHz(m + 12), d, 'square', 0.025, t);
      if (lv >= 5) tone(midiHz(m - 5), d, 'square', 0.03, t);
    }
  },
};

// --- Bach, Musical Offering: Canon a 2 cancrizans. One voice plays the line forwards while
// the other plays it backwards. In G minor. Unit: eighth note.
const CRAB_END = Math.max(...CRAB.filter((_, k) => k % 3 === 0).map((s, k) => s + CRAB[k * 3 + 2]));
const CRAB_FWD = onsets(CRAB);
const CRAB_BACK = onsets(CRAB.map((v, k) => (k % 3 === 0 ? CRAB_END - v - CRAB[k + 2] : v)));

const CRAB_TUNE: Tune = {
  name: 'CRAB',
  unit: 60 / 150 / 2,
  length: CRAB_END,
  play(i, t, lv, transpose, u) {
    const tr = shiftTo(transpose, 7);
    for (const [m, len] of CRAB_FWD.get(i) ?? []) {
      const d = len * u * 0.95;
      tone(midiHz(m + tr), d, lv >= 2 ? 'square' : 'triangle', lv >= 2 ? 0.07 : 0.3, t);
      if (lv >= 4) tone(midiHz(m + 12 + tr), d, 'square', 0.025, t);
    }
    for (const [m, len] of CRAB_BACK.get(i) ?? []) {
      const d = len * u * 0.95;
      tone(midiHz(m - 12 + tr), d, 'triangle', 0.3, t);
      if (lv >= 3) tone(midiHz(m - 24 + tr), d, 'triangle', 0.2, t);
    }
    // A harpsichord-ish pulse on the beat once the snake has some length.
    if (lv >= 1 && i % 2 === 0) tone(midiHz(43 + tr), u * 0.5, 'square', 0.03 + lv * 0.01, t);
    if (lv >= 5 && i % 2 === 1) perc.hat(t, 0.05);
  },
};

// --- Sequencer: the notes you eat become the melody. 16 sixteenth steps; each new note takes
// the next slot in bit-reversed order, so the first ones land on the strongest beats.
const SLOT_ORDER = [0, 8, 4, 12, 2, 10, 6, 14, 1, 9, 5, 13, 3, 11, 7, 15];
let seqRoot = 0;
let seqSteps = [0, 2, 4, 7, 9];
let seqSlots: (number | undefined)[] = [];

export interface SeqPattern {
  root: number;
  steps: number[];
  degrees: number[];
}
/** Title-screen demo: patterns that take turns, two loops each. */
let demo: SeqPattern[] = [];
let demoAt = 0;
let demoLoops = 0;

function loadPattern(p: SeqPattern) {
  seqRoot = p.root;
  seqSteps = p.steps;
  seqSlots = [];
  p.degrees.forEach((d, k) => (seqSlots[SLOT_ORDER[k % 16]] = d));
}

const SEQUENCER: Tune = {
  name: 'SEQUENCER',
  unit: 60 / 112 / 4,
  length: 16,
  play(i, t, lv, _tr, u) {
    if (i === 0 && demo.length) {
      if (demoLoops > 0 && demoLoops % 2 === 0) loadPattern(demo[(demoAt = (demoAt + 1) % demo.length)]);
      demoLoops++;
    }
    const n = seqSteps.length;
    const deg = (d: number, base: number) => midiHz(scaleMidi(seqRoot, seqSteps, d, base));
    if (i === 0 || i === 8) perc.kick(t, 0.5);
    if (lv >= 2 && (i === 10 || i === 14)) perc.kick(t, 0.3);
    if (lv >= 1 && (i === 4 || i === 12)) perc.snare(t, 0.12);
    if (lv >= 3 && i % 2) perc.hat(t, 0.05);
    // Bass walks root, fifth-ish, root, fourth-ish across the bar.
    const bassDeg = [0, 0, Math.round(n * 4 / 7), Math.round(n * 3 / 7)][i >> 2];
    if (i % 4 === 0) tone(deg(bassDeg, 36), u * 3.5, 'triangle', 0.32, t);
    if (lv >= 4 && i % 2 === 0) tone(deg(bassDeg, 48), u * 0.8, 'square', 0.03, t);
    const d = seqSlots[i];
    if (d !== undefined) {
      tone(deg(d, 72), u * 1.8, 'square', 0.1, t);
      tone(deg(d, 72), u * 1.5, 'triangle', 0.14, t + u * 3);
      if (lv >= 3) tone(deg(d + Math.max(1, Math.round(n * 2 / 7)), 72), u * 1.5, 'square', 0.035, t);
      if (lv >= 5) tone(deg(d, 84), u * 1.5, 'square', 0.03, t);
    }
  },
};

export const TUNES = [BOLERO, CHARMER, CRAB_TUNE, SEQUENCER];
export const TUNE = { BOLERO: 0, CHARMER: 1, CRAB: 2, SEQUENCER: 3 } as const;

/** Intensity 0-5 from the snake's length. */
export function intensityFor(length: number) {
  return length >= 44 ? 5 : length >= 32 ? 4 : length >= 22 ? 3 : length >= 12 ? 2 : length >= 6 ? 1 : 0;
}

let musicOn = true;
let playing = false;
let tune = 0;
let unit = 0;
let nextTime = 0;
let timer: number | undefined;
let transpose = 0;
let intensity = 0;
let tempo = 1;

function schedule() {
  if (!ctx) return;
  const tn = TUNES[tune];
  while (nextTime < ctx.currentTime + 0.12) {
    const u = tn.unit / tempo;
    tn.play(unit % tn.length, nextTime, intensity, transpose, u);
    unit++;
    nextTime += u;
  }
}

export const music = {
  /** Start (or keep playing) a tune; switching tunes starts it from the top. */
  play(which = tune, restart = false) {
    if (which !== tune || restart) {
      this.halt();
      tune = which;
      unit = 0;
    }
    playing = true;
    if (!ctx || !musicOn || timer !== undefined) return;
    nextTime = ctx.currentTime + 0.05;
    timer = window.setInterval(schedule, 25);
  },
  resume() {
    if (playing) this.play();
  },
  stop() {
    playing = false;
    this.halt();
  },
  halt() {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  },
  /** Transpose so the tune's tonic is the given pitch class. */
  setKey(pitchClass: number) {
    transpose = pitchClass > 6 ? pitchClass - 12 : pitchClass;
  },
  setIntensity(lv: number) {
    intensity = lv;
  },
  /** Tempo multiplier. */
  setTempo(mult: number) {
    tempo = mult;
  },
  /** The sequencer's scale and the degrees eaten so far. */
  setSequence(root: number, steps: number[], degrees: number[]) {
    demo = [];
    loadPattern({ root, steps, degrees });
  },
  /** Cycle through demo patterns, switching every two loops. */
  setDemo(patterns: SeqPattern[]) {
    demo = patterns;
    demoAt = 0;
    demoLoops = 0;
    loadPattern(patterns[0]);
  },
  toggle() {
    musicOn = !musicOn;
    if (!musicOn) this.halt();
    else if (playing) this.play();
    return musicOn;
  },
  set enabled(on: boolean) {
    if (on !== musicOn) this.toggle();
  },
  get enabled() {
    return musicOn;
  },
  get running() {
    return timer !== undefined;
  },
  get tune() {
    return tune;
  },
};
