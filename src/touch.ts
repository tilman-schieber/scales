// On-screen controls for phones and tablets, plus swipes on the game screen.
import type { Action } from './game';

export interface TouchButton {
  id: string;
  label: string;
  a: Action;
  typed?: string;
  wide?: boolean;
}

const ROWS: TouchButton[][] = [
  [
    { id: 'music', label: '♪', a: 'mute' },
    { id: 'up', label: '▲', a: 'up' },
    { id: 'start', label: 'START', a: 'start', typed: 'Enter' },
  ],
  [
    { id: 'left', label: '◀', a: 'left' },
    { id: 'down', label: '▼', a: 'down' },
    { id: 'right', label: '▶', a: 'right' },
  ],
  [{ id: 'boost', label: 'BOOST', a: 'boost', wide: true }],
];

export interface TouchPanel {
  el: HTMLElement;
  update(musicOn: boolean): void;
}

/** Builds the touch panel on touch devices; returns it, or null elsewhere. */
export function setupTouch(onButton: (b: TouchButton, down: boolean) => void): TouchPanel | null {
  if (!matchMedia('(pointer: coarse)').matches) return null;
  const panel = document.createElement('div');
  panel.id = 'touch';
  let musicEl: HTMLButtonElement | null = null;

  for (const row of ROWS) {
    const r = document.createElement('div');
    r.className = 'row';
    for (const b of row) {
      const el = document.createElement('button');
      el.textContent = b.label;
      if (b.wide) el.classList.add('wide');
      const release = () => {
        el.classList.remove('on');
        onButton(b, false);
      };
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        el.classList.add('on');
        onButton(b, true);
      });
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      if (b.id === 'music') musicEl = el;
      r.appendChild(el);
    }
    panel.appendChild(r);
  }
  document.body.appendChild(panel);
  document.body.classList.add('has-touch');

  let last: boolean | null = null;
  return {
    el: panel,
    update(musicOn) {
      if (musicOn === last || !musicEl) return;
      last = musicOn;
      musicEl.textContent = musicOn ? '♪' : '♪ OFF';
      musicEl.classList.toggle('off', !musicOn);
    },
  };
}

/** Calls `onSwipe` with 0-3 (up, right, down, left) as a finger moves across `el`. */
export function setupSwipe(el: HTMLElement, onSwipe: (dir: 0 | 1 | 2 | 3) => void) {
  let ox = 0, oy = 0, active = false;
  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', (e) => {
    active = true;
    ox = e.clientX;
    oy = e.clientY;
  });
  el.addEventListener('pointermove', (e) => {
    if (!active) return;
    const dx = e.clientX - ox, dy = e.clientY - oy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
    onSwipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
    // Keep tracking from here so one drag can make several turns.
    ox = e.clientX;
    oy = e.clientY;
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => (active = false));
}
