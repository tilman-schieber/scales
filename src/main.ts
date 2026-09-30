import { Game, Action, Input } from './game';
import { render, W, H } from './render';
import { unlockAudio, music } from './audio';
import { setupTouch, setupSwipe, TouchButton } from './touch';
import type { Dir } from './world';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
ctx.imageSmoothingEnabled = false;

const touchPanel = setupTouch(onTouch);

function resize() {
  const reserved = touchPanel ? touchPanel.el.offsetHeight + 8 : 0;
  const scale = Math.min(innerWidth / W, (innerHeight - reserved) / H);
  // Whole-number scaling keeps pixels crisp; phones may need a fractional fit.
  const s = scale >= 2 ? Math.floor(scale) : Math.max(0.5, scale);
  canvas.style.width = `${Math.floor(W * s)}px`;
  canvas.style.height = `${Math.floor(H * s)}px`;
}
addEventListener('resize', resize);
resize();

// By e.key so labels match any layout.
const ARROWS: Record<string, Action> = { arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right' };
const KEYS: Record<string, Action> = {
  ...ARROWS,
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  ' ': 'boost',
  shift: 'boost',
  x: 'boost',
  enter: 'start',
  p: 'start',
  escape: 'back',
  backspace: 'quit',
  m: 'mute',
  h: 'scores',
};
const DIRS: Partial<Record<Action, Dir>> = { up: 0, right: 1, down: 2, left: 3 };

const game = new Game();
const input: Input = { held: new Set(), pressed: new Set(), dirs: [], typed: [] };
/** Keys currently down: e.code -> lower-cased e.key at press time (key-up may report a different key). */
const heldKeys = new Map<string, string>();
const touchHeld = new Set<TouchButton>();

/** While typing a name, letters are letters. */
const actionFor = (key: string) => (game.phase === 'entry' ? ARROWS[key] ?? (key === 'enter' ? undefined : KEYS[key]) : KEYS[key]);

function press(a: Action) {
  input.pressed.add(a);
  const d = DIRS[a];
  if (d !== undefined) input.dirs.push(d);
}

addEventListener('keydown', (e) => {
  unlockAudio();
  const key = e.key.toLowerCase();
  if (/^[a-z0-9]$/i.test(e.key) && !e.repeat) input.typed.push(e.key.toUpperCase());
  else if (e.key === 'Backspace' || (e.key === 'Enter' && !e.repeat)) input.typed.push(e.key);
  const a = actionFor(key);
  if (a || e.key === 'Backspace') e.preventDefault();
  heldKeys.set(e.code, key);
  if (!e.repeat && a) press(a);
});
addEventListener('keyup', (e) => heldKeys.delete(e.code));
// Any tap unlocks sound; mobile browsers only allow it after a gesture.
for (const ev of ['pointerdown', 'pointerup', 'touchend']) addEventListener(ev, unlockAudio, { passive: true });
addEventListener('blur', () => {
  heldKeys.clear();
  if (game.phase === 'play' && !game.paused) input.pressed.add('start');
});

function onTouch(b: TouchButton, down: boolean) {
  unlockAudio();
  if (!down) return void touchHeld.delete(b);
  touchHeld.add(b);
  press(b.a);
  if (b.typed) input.typed.push(b.typed);
}

const SWIPE: Action[] = ['up', 'right', 'down', 'left'];
setupSwipe(canvas, (d) => {
  unlockAudio();
  press(SWIPE[d]);
});

function refreshHeld() {
  input.held.clear();
  for (const key of heldKeys.values()) {
    const a = actionFor(key);
    if (a) input.held.add(a);
  }
  for (const b of touchHeld) input.held.add(b.a);
}

// Fixed 60 Hz simulation.
const STEP = 1000 / 60;
let acc = 0;
let last = performance.now();
let frame = 0;

function loop(now: number) {
  acc += Math.min(250, now - last);
  last = now;
  while (acc >= STEP) {
    refreshHeld();
    game.step(input);
    input.pressed.clear();
    input.dirs.length = 0;
    input.typed.length = 0;
    acc -= STEP;
    frame++;
  }
  render(ctx, game, frame);
  touchPanel?.update(music.enabled);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

if (import.meta.env.DEV) Object.assign(window, { game, music });
