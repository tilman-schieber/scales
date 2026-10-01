// Level layouts: a few hand-built gardens, then braided mazes that get ever narrower.
import { Rng } from './rng';

export const COLS = 32;
export const ROWS = 25;
export const FLOOR = 0;
export const WALL = 1;
/** Shifting walls: A is open in gate phase 0, B in phase 1. */
export const GATE_A = 2;
export const GATE_B = 3;

export const cellAt = (x: number, y: number) => y * COLS + x;
export const cx = (c: number) => c % COLS;
export const cy = (c: number) => Math.floor(c / COLS);

export interface Scale {
  name: string;
  steps: number[];
}

export const SCALES = {
  pentatonic: { name: 'PENTATONIC', steps: [0, 2, 4, 7, 9] },
  ionian: { name: 'MAJOR', steps: [0, 2, 4, 5, 7, 9, 11] },
  mixolydian: { name: 'MIXOLYDIAN', steps: [0, 2, 4, 5, 7, 9, 10] },
  dorian: { name: 'DORIAN', steps: [0, 2, 3, 5, 7, 9, 10] },
  aeolian: { name: 'MINOR', steps: [0, 2, 3, 5, 7, 8, 10] },
  phrygian: { name: 'PHRYGIAN', steps: [0, 1, 3, 5, 7, 8, 10] },
  lydian: { name: 'LYDIAN', steps: [0, 2, 4, 6, 7, 9, 11] },
  blues: { name: 'BLUES', steps: [0, 3, 5, 6, 7, 10] },
  harmonic: { name: 'HARM MINOR', steps: [0, 2, 3, 5, 7, 8, 11] },
  hungarian: { name: 'HUNGARIAN', steps: [0, 2, 3, 6, 7, 8, 11] },
  wholetone: { name: 'WHOLE TONE', steps: [0, 2, 4, 6, 8, 10] },
  locrian: { name: 'LOCRIAN', steps: [0, 1, 3, 5, 6, 8, 10] },
  chromatic: { name: 'CHROMATIC', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
} satisfies Record<string, Scale>;

export const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export interface Features {
  /** Light radius in tiles, 0 for a lit level. */
  dark: number;
  minotaur: boolean;
  /** Wall segments that shift. */
  gates: number;
  /** Portal pairs. */
  portals: number;
  /** Ariadne's thread shows the way. */
  thread: boolean;
}

export interface Theme {
  floor: string;
  wall: string;
  skin: [string, string];
  /** Floor decoration color. */
  decor: string;
  decorKind: 'flower' | 'pebble' | 'bone';
}

export interface Layout {
  grid: Uint8Array;
  start: number;
  portals: [number, number][];
}

export interface LevelDef {
  name: string;
  scale: Scale;
  /** Pitch class of the scale's root. */
  root: number;
  theme: Theme;
  features: Features;
  build(rng: Rng): Layout;
}

const NONE: Features = { dark: 0, minotaur: false, gates: 0, portals: 0, thread: false };

// ---------- hand-built layouts ----------

function blank(border = true) {
  const g = new Uint8Array(COLS * ROWS);
  if (border)
    for (let x = 0; x < COLS; x++)
      for (let y = 0; y < ROWS; y++) if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) g[cellAt(x, y)] = WALL;
  return g;
}

function rect(g: Uint8Array, x0: number, y0: number, w: number, h: number, v = WALL) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) g[cellAt(x, y)] = v;
}

/** An open field whose border has tunnels that wrap to the other side. */
function meadow(): Layout {
  const g = blank();
  rect(g, 14, 0, 4, 1, FLOOR);
  rect(g, 14, ROWS - 1, 4, 1, FLOOR);
  rect(g, 0, 11, 1, 3, FLOOR);
  rect(g, COLS - 1, 11, 1, 3, FLOOR);
  return { grid: g, start: cellAt(8, 12), portals: [] };
}

function colonnade(): Layout {
  const g = blank();
  for (let y = 4; y < ROWS - 3; y += 6) for (let x = 5; x < COLS - 4; x += 6) rect(g, x, y, 2, 2);
  return { grid: g, start: cellAt(3, 12), portals: [] };
}

function crossing(): Layout {
  const g = blank();
  // Four L-shaped walls around an open plaza.
  rect(g, 6, 6, 8, 1);
  rect(g, 6, 6, 1, 5);
  rect(g, 18, 6, 8, 1);
  rect(g, 25, 6, 1, 5);
  rect(g, 6, 18, 8, 1);
  rect(g, 6, 14, 1, 5);
  rect(g, 18, 18, 8, 1);
  rect(g, 25, 14, 1, 5);
  rect(g, 15, 11, 2, 3);
  return { grid: g, start: cellAt(3, 12), portals: [] };
}

function cloister(): Layout {
  const g = blank();
  rect(g, 15, 1, 2, ROWS - 2);
  rect(g, 1, 12, COLS - 2, 1);
  // Doorways between the four rooms.
  rect(g, 15, 5, 2, 3, FLOOR);
  rect(g, 15, 17, 2, 3, FLOOR);
  rect(g, 6, 12, 3, 1, FLOOR);
  rect(g, 23, 12, 3, 1, FLOOR);
  // A courtyard fountain in each room.
  for (const [x, y] of [[7, 5], [23, 5], [7, 17], [23, 17]]) rect(g, x, y, 2, 2);
  return { grid: g, start: cellAt(3, 3), portals: [] };
}

/** Concentric rings with gaps on alternating sides. */
function rings(): Layout {
  const g = blank();
  const ring = (k: number, gapTop: boolean) => {
    const x0 = k * 4, y0 = k * 4;
    const x1 = COLS - 1 - k * 4, y1 = ROWS - 1 - k * 4;
    for (let x = x0; x <= x1; x++) g[cellAt(x, y0)] = g[cellAt(x, y1)] = WALL;
    for (let y = y0; y <= y1; y++) g[cellAt(x0, y)] = g[cellAt(x1, y)] = WALL;
    const mx = Math.floor((x0 + x1) / 2) - 1;
    const my = Math.floor((y0 + y1) / 2) - 1;
    if (gapTop) {
      rect(g, mx, y0, 3, 1, FLOOR);
      rect(g, mx, y1, 3, 1, FLOOR);
    } else {
      rect(g, x0, my, 1, 3, FLOOR);
      rect(g, x1, my, 1, 3, FLOOR);
    }
  };
  ring(1, true);
  ring(2, false);
  rect(g, 14, 11, 4, 3);
  return { grid: g, start: cellAt(2, 2), portals: [] };
}

// ---------- mazes ----------

interface Segment {
  cells: number[];
  open: boolean;
}

function floodCount(g: Uint8Array, from: number, phase: number) {
  const passable = (c: number) => g[c] === FLOOR || (g[c] === GATE_A && phase === 0) || (g[c] === GATE_B && phase === 1);
  const seen = new Uint8Array(g.length);
  const stack = [from];
  seen[from] = 1;
  let n = 0;
  while (stack.length) {
    const c = stack.pop()!;
    n++;
    const x = cx(c), y = cy(c);
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const nc = cellAt(nx, ny);
      if (!seen[nc] && passable(nc)) {
        seen[nc] = 1;
        stack.push(nc);
      }
    }
  }
  let total = 0;
  for (let c = 0; c < g.length; c++) if (passable(c)) total++;
  return n === total;
}

export interface MazeOptions {
  /** Corridor width in tiles (1-3). */
  width: number;
  /** Share of remaining walls knocked out after braiding. */
  loops: number;
  gates: number;
  portals: number;
}

/**
 * A braided maze: carved by recursive backtracking, then every dead end is opened up,
 * because a snake can't turn around.
 */
export function maze(rng: Rng, o: MazeOptions): Layout {
  const w = o.width;
  const p = w + 1;
  const nx = Math.floor((COLS - 1) / p);
  const ny = Math.floor((ROWS - 1) / p);
  const ox = Math.floor((COLS - (nx * p + 1)) / 2);
  const oy = Math.floor((ROWS - (ny * p + 1)) / 2);
  const g = new Uint8Array(COLS * ROWS).fill(WALL);
  const X = (i: number) => ox + 1 + i * p;
  const Y = (j: number) => oy + 1 + j * p;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) rect(g, X(i), Y(j), w, w, FLOOR);

  // Walls between neighbouring cells: east wall of (i,j) and south wall of (i,j).
  const east: Segment[] = [];
  const south: Segment[] = [];
  const segs: Segment[] = [];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (i < nx - 1) {
        const s = { cells: Array.from({ length: w }, (_, t) => cellAt(X(i) + w, Y(j) + t)), open: false };
        east[k] = s;
        segs.push(s);
      }
      if (j < ny - 1) {
        const s = { cells: Array.from({ length: w }, (_, t) => cellAt(X(i) + t, Y(j) + w)), open: false };
        south[k] = s;
        segs.push(s);
      }
    }
  const links = (k: number) => {
    const i = k % nx, j = Math.floor(k / nx);
    const out: [number, Segment][] = [];
    if (i > 0) out.push([k - 1, east[k - 1]]);
    if (i < nx - 1) out.push([k + 1, east[k]]);
    if (j > 0) out.push([k - nx, south[k - nx]]);
    if (j < ny - 1) out.push([k + nx, south[k]]);
    return out;
  };
  const shuffle = <T,>(a: T[]) => {
    for (let i = a.length - 1; i > 0; i--) {
      const r = Math.floor(rng() * (i + 1));
      [a[i], a[r]] = [a[r], a[i]];
    }
    return a;
  };

  const visited = new Uint8Array(nx * ny);
  const stack = [Math.floor(rng() * nx * ny)];
  visited[stack[0]] = 1;
  while (stack.length) {
    const k = stack[stack.length - 1];
    const next = shuffle(links(k)).find(([n]) => !visited[n]);
    if (!next) {
      stack.pop();
      continue;
    }
    next[1].open = true;
    visited[next[0]] = 1;
    stack.push(next[0]);
  }
  // Braid: no dead ends.
  for (let k = 0; k < nx * ny; k++) {
    const ls = links(k);
    if (ls.filter(([, s]) => s.open).length > 1) continue;
    const closed = shuffle(ls.filter(([, s]) => !s.open));
    const deadNeighbour = closed.find(([n]) => links(n).filter(([, s]) => s.open).length === 1);
    (deadNeighbour ?? closed[0])[1].open = true;
  }
  for (const s of segs) if (!s.open && rng() < o.loops) s.open = true;
  for (const s of segs) if (s.open) for (const c of s.cells) g[c] = FLOOR;

  // Shifting walls: some walls open in phase 1 (B), some passages close in phase 1 (A).
  // Phase 0 is the maze as carved; phase 1 must stay connected too.
  const start = cellAt(X(0), Y(0));
  let placed = 0;
  for (const s of shuffle(segs.slice())) {
    if (placed >= o.gates) break;
    const v = s.open ? GATE_A : GATE_B;
    for (const c of s.cells) g[c] = v;
    if (floodCount(g, start, 1)) placed++;
    else for (const c of s.cells) g[c] = s.open ? FLOOR : WALL;
  }

  // Portals join far-apart cells.
  const portals: [number, number][] = [];
  const used = new Set<number>([start]);
  const pick = () => {
    for (let tries = 0; tries < 200; tries++) {
      const c = cellAt(X(Math.floor(rng() * nx)) + Math.floor(rng() * w), Y(Math.floor(rng() * ny)) + Math.floor(rng() * w));
      if (g[c] === FLOOR && !used.has(c) && Math.abs(cx(c) - cx(start)) + Math.abs(cy(c) - cy(start)) > 4) {
        used.add(c);
        return c;
      }
    }
    return -1;
  };
  for (let n = 0; n < o.portals; n++) {
    const a = pick();
    let b = -1;
    for (let tries = 0; tries < 20; tries++) {
      b = pick();
      if (b < 0 || Math.abs(cx(a) - cx(b)) + Math.abs(cy(a) - cy(b)) > 14) break;
      used.delete(b);
    }
    if (a >= 0 && b >= 0) portals.push([a, b]);
  }
  return { grid: g, start, portals };
}

// ---------- the quest ----------

const T = (floor: string, wall: string, skin: [string, string], decor: string, decorKind: Theme['decorKind'] = 'pebble'): Theme => ({
  floor, wall, skin, decor, decorKind,
});

export const QUEST: LevelDef[] = [
  {
    name: 'THE MEADOW', scale: SCALES.pentatonic, root: 0, features: NONE,
    theme: T('#0e3814', '#6a9a3a', ['#f8b800', '#a85800'], '#f878b8', 'flower'), build: meadow,
  },
  {
    name: 'THE COLONNADE', scale: SCALES.ionian, root: 7, features: NONE,
    theme: T('#2c2418', '#c8b890', ['#3ee8a0', '#108858'], '#4a3e2c'), build: colonnade,
  },
  {
    name: 'THE CROSSING', scale: SCALES.mixolydian, root: 2, features: NONE,
    theme: T('#181830', '#7070c0', ['#f87858', '#a82810'], '#2a2a50'), build: crossing,
  },
  {
    name: 'THE CLOISTER', scale: SCALES.dorian, root: 9, features: NONE,
    theme: T('#261e1a', '#b06848', ['#58d8f8', '#0070a8'], '#3c2e26'), build: cloister,
  },
  {
    name: 'THE RINGS', scale: SCALES.aeolian, root: 4, features: NONE,
    theme: T('#0e1a26', '#4890a8', ['#f8f858', '#a8a800'], '#1a2c3c'), build: rings,
  },
  {
    name: 'THE HEDGE MAZE', scale: SCALES.phrygian, root: 11, features: NONE,
    theme: T('#1a2410', '#2e7a2a', ['#f898d8', '#a83878'], '#f8f8f8', 'flower'),
    build: (r) => maze(r, { width: 3, loops: 0.3, gates: 0, portals: 0 }),
  },
  {
    name: 'THE WARRENS', scale: SCALES.lydian, root: 5, features: { ...NONE, portals: 2 },
    theme: T('#24180e', '#8a5a30', ['#b8f858', '#58a800'], '#3a2818'),
    build: (r) => maze(r, { width: 2, loops: 0.3, gates: 0, portals: 2 }),
  },
  {
    name: 'THE SHIFTING HALLS', scale: SCALES.blues, root: 10, features: { ...NONE, gates: 10 },
    theme: T('#18181e', '#8888a8', ['#f8a838', '#b85800'], '#26263a'),
    build: (r) => maze(r, { width: 2, loops: 0.2, gates: 10, portals: 0 }),
  },
  {
    name: 'THE CATACOMBS', scale: SCALES.harmonic, root: 3, features: { ...NONE, dark: 6, thread: true },
    theme: T('#14100c', '#6a6050', ['#d8d8f8', '#7878b8'], '#b8b098', 'bone'),
    build: (r) => maze(r, { width: 2, loops: 0.4, gates: 0, portals: 0 }),
  },
  {
    name: "THE MINOTAUR'S LAIR", scale: SCALES.hungarian, root: 8, features: { ...NONE, minotaur: true },
    theme: T('#200c0c', '#8a3020', ['#58f8b8', '#00a868'], '#3a1810'),
    build: (r) => maze(r, { width: 2, loops: 0.35, gates: 0, portals: 0 }),
  },
  {
    name: 'THE DEEP', scale: SCALES.wholetone, root: 1, features: { ...NONE, gates: 14, portals: 2 },
    theme: T('#080c20', '#2848a8', ['#f8d878', '#c88818'], '#101c40'),
    build: (r) => maze(r, { width: 1, loops: 0.25, gates: 14, portals: 2 }),
  },
  {
    name: 'THE LABYRINTH', scale: SCALES.locrian, root: 6, features: { ...NONE, dark: 5, minotaur: true, thread: true },
    theme: T('#101010', '#646464', ['#f83858', '#a80020'], '#282828'),
    build: (r) => maze(r, { width: 1, loops: 0.3, gates: 0, portals: 0 }),
  },
  {
    name: 'THE HEART', scale: SCALES.chromatic, root: 0,
    features: { dark: 5, minotaur: true, gates: 10, portals: 1, thread: true },
    theme: T('#1c0818', '#a02878', ['#fcfcfc', '#f8b800'], '#401030'),
    build: (r) => maze(r, { width: 1, loops: 0.3, gates: 10, portals: 1 }),
  },
];

// ---------- endless descent ----------

const ADJ = ['SUNKEN', 'SILENT', 'BURIED', 'HOLLOW', 'WINDING', 'FORGOTTEN', 'CRIMSON', 'GILDED', 'DROWNED', 'ENDLESS', 'WHISPERING', 'BROKEN'];
const NOUN = ['HALLS', 'VAULTS', 'CRYPTS', 'GALLERIES', 'TUNNELS', 'CELLARS', 'CISTERNS', 'STAIRS', 'ARCADES', 'BURROWS', 'CLOISTERS', 'DEPTHS'];
const ENDLESS_SCALES = [
  SCALES.pentatonic, SCALES.ionian, SCALES.dorian, SCALES.mixolydian, SCALES.aeolian, SCALES.lydian,
  SCALES.phrygian, SCALES.blues, SCALES.harmonic, SCALES.hungarian, SCALES.wholetone, SCALES.locrian,
];

/** Procedural level `depth` (1-based) of the endless descent. */
export function endlessLevel(depth: number, rng: Rng): LevelDef {
  const pick = <T,>(a: T[]) => a[Math.floor(rng() * a.length)];
  const width = depth <= 2 ? 3 : depth <= 5 ? 2 : 1;
  const loops = Math.max(0.12, 0.4 - depth * 0.025);
  const f: Features = {
    portals: depth >= 3 && rng() < 0.5 ? 1 + Math.floor(rng() * 2) : 0,
    gates: depth >= 4 && rng() < 0.55 ? 6 + Math.min(10, depth) : 0,
    dark: depth >= 5 && rng() < 0.5 ? Math.max(4, 7 - Math.floor(depth / 6)) : 0,
    minotaur: depth >= 6 && rng() < 0.55,
    thread: false,
  };
  f.thread = f.dark > 0 || f.minotaur;
  // Stranger scales (and longer ones) turn up the deeper you go.
  const pool = ENDLESS_SCALES.slice(0, Math.min(ENDLESS_SCALES.length, depth + 3)).slice(-6);
  const scale = depth >= 12 && rng() < 0.3 ? SCALES.chromatic : pick(pool);
  const quest = QUEST[(depth - 1) % QUEST.length];
  return {
    name: `${pick(ADJ)} ${pick(NOUN)}`,
    scale,
    root: Math.floor(rng() * 12),
    theme: quest.theme,
    features: f,
    build: (r) => maze(r, { width, loops, gates: f.gates, portals: f.portals }),
  };
}

// Classic climbs this ladder of scales, one key further round the circle of fifths each time.
const CLASSIC_LADDER = [
  SCALES.pentatonic, SCALES.ionian, SCALES.mixolydian, SCALES.dorian, SCALES.aeolian, SCALES.blues, SCALES.lydian,
  SCALES.phrygian, SCALES.harmonic, SCALES.hungarian, SCALES.wholetone, SCALES.locrian, SCALES.chromatic,
];

/** Key and scale of classic round `round` (0-based); past the ladder they're picked at random. */
export function classicKey(round: number, rng: Rng): { root: number; scale: Scale } {
  const root = (round * 7) % 12;
  if (round < CLASSIC_LADDER.length) return { root, scale: CLASSIC_LADDER[round] };
  return { root, scale: ENDLESS_SCALES[Math.floor(rng() * ENDLESS_SCALES.length)] };
}

/** The classic game: one walled field, scale after scale. */
export const CLASSIC: LevelDef = {
  name: 'CLASSIC', scale: SCALES.pentatonic, root: 0, features: NONE,
  theme: T('#0e2a14', '#5a8a4a', ['#f8f8f8', '#a8a8a8'], '#16361c'),
  build: () => ({ grid: blank(), start: cellAt(8, 12), portals: [] }),
};
