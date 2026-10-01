// One level in play: the snake, its notes, and everything in the labyrinth with it.
import { Rng } from './rng';
import { COLS, ROWS, FLOOR, WALL, GATE_A, GATE_B, LevelDef, Scale, NOTE_NAMES, cellAt, cx, cy, classicKey } from './levels';
import { sfx } from './audio';

export type Dir = 0 | 1 | 2 | 3;
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];

export type ItemKind = 'thread' | 'labrys';
export interface Item {
  kind: ItemKind;
  cell: number;
  life: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  life: number;
  color: string;
  size: number;
}

export interface Popup {
  text: string;
  x: number;
  y: number;
  life: number;
  color: string;
}

export interface Minotaur {
  cell: number;
  lair: number;
  /** Frames until it wakes (or returns, after being eaten). */
  sleep: number;
  timer: number;
  scared: number;
  alive: boolean;
  /** Last step taken, to avoid dithering back and forth while wandering. */
  dir: number;
  /** Path distance to the snake's head, or -1. */
  dist: number;
}

export interface WorldOptions {
  rng: Rng;
  /** Level number shown and used for scoring. */
  number: number;
  /** Frames per step at normal speed. */
  interval: number;
  /** Segments gained per note. */
  grow: number;
  /** Classic: no exit; each finished scale modulates to the next key and speeds up. */
  endless: boolean;
  /** Score multiplier from the speed setting. */
  points: number;
  /** Length the snake arrives with (what it kept from the last level). */
  carry?: number;
}

export type WorldState = 'ready' | 'play' | 'dying' | 'exiting' | 'done' | 'dead';

export const GATE_PERIOD = 300;
export const GATE_WARN = 60;
const THREAD_TIME = 540;
const SCARED_TIME = 420;
const ITEM_LIFE = 720;

export class World {
  grid: Uint8Array;
  start: number;
  portals: [number, number][];
  portalOf = new Map<number, number>();
  gateOpen: Uint8Array;
  gatePhase = 0;
  gateTimer = 0;

  snake: number[] = [];
  dir: Dir | -1 = -1;
  /** Direction the head faces for drawing. */
  facing: Dir = 1;
  queue: Dir[] = [];
  grow = 0;
  moveTimer = 0;
  boosting = false;

  /** The scale being played; classic mode moves on to a new one after each. */
  scale: Scale;
  root: number;
  /** Classic: scales finished so far. */
  round = 0;
  notesNeeded: number;
  notesGot = 0;
  /** Notes eaten across all scales. */
  notesTotal = 0;
  note = -1;
  items: Item[] = [];
  exit = -1;
  minotaur: Minotaur | null = null;
  threadTimer = 0;
  path: number[] = [];

  state: WorldState = 'ready';
  frames = 0;
  stateTimer = 0;
  /** Points scored since the game last collected them. */
  gained = 0;
  /** Longest the snake has been this level. */
  maxLength = 0;
  /** What killed the snake, shown when it dies. */
  cause = '';
  shake = 0;
  particles: Particle[] = [];
  popups: Popup[] = [];
  /** Length (including growth still due) when the snake reached the door. */
  exitLength = 0;
  /** Scale degrees eaten so far, in order (the sequencer plays these). */
  melody: number[] = [];
  private stepCount = 0;
  private heartbeat = 0;

  constructor(public def: LevelDef, public opt: WorldOptions) {
    const layout = def.build(opt.rng);
    this.grid = layout.grid;
    this.start = layout.start;
    this.portals = layout.portals;
    for (const [a, b] of this.portals) {
      this.portalOf.set(a, b);
      this.portalOf.set(b, a);
    }
    this.gateOpen = new Uint8Array(this.grid.length);
    for (let c = 0; c < this.grid.length; c++) this.gateOpen[c] = this.grid[c] === GATE_A ? 1 : 0;
    this.scale = def.scale;
    this.root = def.root;
    this.notesNeeded = def.scale.steps.length + 1;
    if (def.features.minotaur) {
      const dist = this.distances(this.start, (c) => !this.solid(c));
      let lair = this.start;
      for (let c = 0; c < dist.length; c++) if (dist[c] > dist[lair] && this.grid[c] === FLOOR && !this.portalOf.has(c)) lair = c;
      this.minotaur = { cell: lair, lair, sleep: 0, timer: 0, scared: 0, alive: true, dir: -1, dist: -1 };
    }
    this.respawn(Math.max(4, opt.carry ?? 4));
    this.placeNote();
  }

  get head() {
    return this.snake[0];
  }

  /** Back to the start after losing a life (and at the beginning). The snake uncoils from the start cell. */
  respawn(length = 4) {
    this.snake = [this.start];
    this.grow = length - 1;
    this.dir = -1;
    this.queue = [];
    this.moveTimer = 0;
    this.state = 'ready';
    this.stateTimer = 0;
    this.threadTimer = 0;
    this.path = [];
    const m = this.minotaur;
    if (m) {
      m.cell = m.lair;
      m.alive = true;
      m.scared = 0;
      m.sleep = 150;
      m.dir = -1;
    }
    // A note on the start cell would be eaten at once; move it.
    if (this.note === this.start) this.placeNote();
  }

  // ---------- map queries ----------

  solid(c: number) {
    const v = this.grid[c];
    return v === WALL || ((v === GATE_A || v === GATE_B) && !this.gateOpen[c]);
  }

  isGate(c: number) {
    return this.grid[c] === GATE_A || this.grid[c] === GATE_B;
  }

  /** Neighbour of c in direction d, wrapping around the edges. */
  step(c: number, d: number) {
    return cellAt((cx(c) + DX[d] + COLS) % COLS, (cy(c) + DY[d] + ROWS) % ROWS);
  }

  /** Breadth-first distances from `from` over cells where `ok` holds. */
  distances(from: number, ok: (c: number) => boolean, prev?: Int16Array) {
    const dist = new Int16Array(this.grid.length).fill(-1);
    const q = [from];
    dist[from] = 0;
    for (let i = 0; i < q.length; i++) {
      const c = q[i];
      for (let d = 0; d < 4; d++) {
        const n = this.step(c, d);
        if (dist[n] >= 0 || !ok(n)) continue;
        dist[n] = dist[c] + 1;
        if (prev) prev[n] = c;
        q.push(n);
      }
    }
    return dist;
  }

  private occupied(c: number) {
    return (
      this.snake.includes(c) ||
      c === this.note ||
      c === this.exit ||
      this.portalOf.has(c) ||
      this.items.some((it) => it.cell === c) ||
      (!!this.minotaur?.alive && this.minotaur.cell === c)
    );
  }

  /** A free floor cell reachable from the head, preferably at least `minDist` away. */
  private freeCell(minDist: number, far = false) {
    const dist = this.distances(this.head, (c) => this.grid[c] !== WALL && !this.portalOf.has(c));
    const cands: number[] = [];
    for (let c = 0; c < this.grid.length; c++)
      if (dist[c] > 0 && this.grid[c] === FLOOR && !this.occupied(c)) cands.push(c);
    if (!cands.length) return -1;
    if (far) {
      cands.sort((a, b) => dist[b] - dist[a]);
      return cands[Math.floor(this.opt.rng() * Math.max(1, Math.floor(cands.length * 0.25)))];
    }
    const good = cands.filter((c) => dist[c] >= minDist);
    const pool = good.length ? good : cands;
    return pool[Math.floor(this.opt.rng() * pool.length)];
  }

  private placeNote() {
    this.note = this.freeCell(8);
  }

  // ---------- stepping ----------

  interval() {
    let base = this.opt.interval;
    if (this.opt.endless) base = Math.max(3, base - this.round);
    return this.boosting ? Math.max(2, base >> 1) : base;
  }

  /** Queue a turn; reversing into yourself is ignored. */
  turn(d: Dir) {
    const last = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
    if (d === last) return;
    if (last >= 0 && (d + 2) % 4 === last && this.snake.length > 1) return;
    if (this.queue.length < 3) this.queue.push(d);
  }

  update(dirs: Dir[], boost: boolean) {
    this.frames++;
    this.stateTimer++;
    if (this.shake > 0) this.shake--;
    this.stepEffects();
    for (const d of dirs) this.turn(d);
    this.boosting = boost;

    switch (this.state) {
      case 'ready':
        if (this.queue.length) this.state = 'play';
        else return;
        break;
      case 'dying':
        return this.stepDying();
      case 'exiting':
        return this.stepExiting();
      case 'done':
      case 'dead':
        return;
    }

    this.stepGates();
    this.stepItems();
    this.stepMinotaur();
    if (this.state !== 'play') return;
    if (++this.moveTimer >= this.interval()) {
      this.moveTimer = 0;
      this.advance();
    }
  }

  private advance() {
    if (this.queue.length) this.dir = this.queue.shift()!;
    if (this.dir < 0) return;
    let d = this.dir as Dir;
    let next = this.step(this.head, d);

    const dest = this.portalOf.get(next);
    if (dest !== undefined) {
      next = dest;
      sfx.portal();
      this.burst(next, '#b8f8f8', 8);
      // Leave the far portal in a direction that isn't a wall.
      for (const nd of [d, (d + 1) % 4, (d + 3) % 4, (d + 2) % 4] as Dir[]) {
        if (!this.solid(this.step(next, nd))) {
          d = nd;
          break;
        }
      }
      this.dir = d;
      this.queue = [];
    }
    this.facing = d;

    if (this.solid(next)) return this.die(this.isGate(next) ? 'CRUSHED BY A GATE' : 'HIT THE WALL');
    const body = this.grow > 0 ? this.snake : this.snake.slice(0, -1);
    if (body.includes(next)) return this.die('BIT YOUR OWN TAIL');
    const m = this.minotaur;
    if (m?.alive && m.cell === next) {
      if (m.scared) this.eatMinotaur();
      else return this.die('GORED BY THE MINOTAUR');
    }

    this.snake.unshift(next);
    if (this.grow > 0) this.grow--;
    else this.snake.pop();
    this.maxLength = Math.max(this.maxLength, this.snake.length);
    this.stepCount++;

    if (next === this.note) this.eatNote();
    const item = this.items.find((it) => it.cell === next);
    if (item) this.pickUp(item);
    if (next === this.exit) {
      this.exitLength = this.snake.length + this.grow;
      this.state = 'exiting';
      this.stateTimer = 0;
      this.popup('SHED YOUR SKIN!', next, '#fcfcfc');
    }
    if (this.threadTimer > 0) this.tracePath();
  }

  private score(n: number) {
    const pts = Math.round(n * this.opt.points * (this.boosting ? 2 : 1));
    this.gained += pts;
    return pts;
  }

  private eatNote() {
    const { scale, root } = this;
    // A new scale starts its own phrase for the sequencer.
    if (this.notesGot === 0) this.melody = [];
    const degree = this.notesGot++;
    this.notesTotal++;
    this.melody.push(degree);
    sfx.note(root, scale.steps, degree);
    this.grow += this.opt.grow;
    const tier = this.opt.endless ? this.round + 1 : this.opt.number;
    const pts = this.score(10 * tier);
    this.popup(`+${pts}`, this.note, this.def.theme.skin[0]);
    this.burst(this.note, '#fcfcfc', 12);

    if (this.notesGot < this.notesNeeded) this.placeNote();
    else if (this.opt.endless) {
      sfx.scale(root, scale.steps);
      this.score(100 * tier);
      this.round++;
      const next = classicKey(this.round, this.opt.rng);
      this.scale = next.scale;
      this.root = next.root;
      this.notesGot = 0;
      this.notesNeeded = next.scale.steps.length + 1;
      this.popup(`${NOTE_NAMES[next.root]} ${next.scale.name}`, this.head, '#f8d838');
      this.placeNote();
    } else {
      this.note = -1;
      this.exit = this.freeCell(0, true);
      sfx.scale(root, scale.steps);
      this.score(100 * this.opt.number);
      this.popup('SCALE COMPLETE', this.head, '#f8d838');
      if (this.def.features.thread) this.threadTimer = Math.max(this.threadTimer, 180);
    }

    const f = this.def.features;
    if (f.thread && this.notesGot % 3 === 0 && !this.items.some((it) => it.kind === 'thread')) this.spawnItem('thread');
    if (f.minotaur && this.notesGot % 2 === 1 && !this.items.some((it) => it.kind === 'labrys') && !this.minotaur?.scared)
      this.spawnItem('labrys');
  }

  private spawnItem(kind: ItemKind) {
    const cell = this.freeCell(6);
    if (cell >= 0) this.items.push({ kind, cell, life: ITEM_LIFE });
  }

  private pickUp(item: Item) {
    this.items = this.items.filter((it) => it !== item);
    this.score(50);
    if (item.kind === 'thread') {
      sfx.thread();
      this.threadTimer = THREAD_TIME;
      this.popup("ARIADNE'S THREAD", item.cell, '#f8d838');
      this.tracePath();
    } else {
      sfx.labrys();
      this.popup('LABRYS!', item.cell, '#f8d838');
      if (this.minotaur?.alive) this.minotaur.scared = SCARED_TIME;
    }
  }

  private eatMinotaur() {
    const m = this.minotaur!;
    m.alive = false;
    m.scared = 0;
    m.sleep = 600;
    sfx.eatMinotaur();
    const pts = this.score(200 * this.opt.number);
    this.popup(`+${pts}`, m.cell, '#f8d838');
    this.burst(m.cell, '#8a4a20', 24);
    this.shake = 8;
  }

  /** Follow the thread: shortest path from the head to the note or exit. */
  private tracePath() {
    const target = this.exit >= 0 ? this.exit : this.note;
    this.path = [];
    if (target < 0) return;
    const prev = new Int16Array(this.grid.length).fill(-1);
    const dist = this.distances(this.head, (c) => !this.solid(c) && !this.portalOf.has(c), prev);
    if (dist[target] < 0) return;
    for (let c = target; c !== this.head && c >= 0; c = prev[c]) this.path.push(c);
  }

  private stepItems() {
    for (const it of this.items) it.life--;
    this.items = this.items.filter((it) => it.life > 0);
    if (this.threadTimer > 0 && --this.threadTimer === 0) this.path = [];
  }

  private stepGates() {
    if (!this.def.features.gates) return;
    this.gateTimer++;
    const left = GATE_PERIOD - this.gateTimer;
    if (left > 0 && left <= GATE_WARN && left % 15 === 0) sfx.gateWarn();
    if (this.gateTimer >= GATE_PERIOD) {
      this.gateTimer = 0;
      this.gatePhase ^= 1;
      sfx.gate();
      this.shake = 3;
    }
    // Gates swing to match the phase, but won't close on anything standing in them.
    for (let c = 0; c < this.grid.length; c++) {
      const v = this.grid[c];
      if (v !== GATE_A && v !== GATE_B) continue;
      const want = (v === GATE_A) === (this.gatePhase === 0) ? 1 : 0;
      if (want === this.gateOpen[c]) continue;
      if (want) this.gateOpen[c] = 1;
      else if (!this.snake.includes(c) && !(this.minotaur?.alive && this.minotaur.cell === c)) this.gateOpen[c] = 0;
    }
  }

  private stepMinotaur() {
    const m = this.minotaur;
    if (!m) return;
    if (!m.alive) {
      if (--m.sleep <= 0 && !this.snake.includes(m.lair)) {
        m.alive = true;
        m.cell = m.lair;
        m.sleep = 60;
        sfx.roar();
      }
      return;
    }
    if (m.scared > 0) m.scared--;
    const passable = (c: number) => !this.solid(c) && !this.portalOf.has(c) && !this.snake.includes(c, 1);
    const dist = this.distances(this.head, passable);
    m.dist = dist[m.cell];
    this.stepHeartbeat(m);
    if (m.sleep > 0) {
      if (--m.sleep === 0) sfx.roar();
      return;
    }
    const every = Math.round(this.opt.interval * (m.scared ? 2 : 1.45));
    if (++m.timer < every) return;
    m.timer = 0;

    const options: number[] = [];
    for (let d = 0; d < 4; d++) {
      const n = this.step(m.cell, d);
      if (n === this.head || passable(n)) options.push(d);
    }
    if (!options.length) return;
    let d: number;
    const score = (d: number) => {
      const n = this.step(m.cell, d);
      return n === this.head ? 0 : dist[n] < 0 ? 999 : dist[n];
    };
    // It follows your scent only when close; farther off it roams.
    const wander = m.dist < 0 || m.dist > 14 || this.opt.rng() < 0.12;
    if (m.scared) d = options.reduce((a, b) => (score(b) % 999 > score(a) % 999 ? b : a));
    else if (wander) {
      const fwd = options.filter((o) => o !== (m.dir + 2) % 4);
      const pool = fwd.length ? fwd : options;
      d = pool[Math.floor(this.opt.rng() * pool.length)];
    } else d = options.reduce((a, b) => (score(b) < score(a) ? b : a));

    const next = this.step(m.cell, d);
    m.dir = d;
    if (next === this.head) {
      if (m.scared) {
        m.cell = next;
        return this.eatMinotaur();
      }
      m.cell = next;
      return this.die('GORED BY THE MINOTAUR');
    }
    m.cell = next;
  }

  /** A heartbeat quickens as the Minotaur closes in. */
  private stepHeartbeat(m: Minotaur) {
    if (m.scared || m.dist < 0 || m.dist > 14 || this.state !== 'play') return;
    if (++this.heartbeat >= 14 + m.dist * 5) {
      this.heartbeat = 0;
      sfx.heartbeat(0.5 - m.dist * 0.025);
    }
  }

  private die(cause: string) {
    this.cause = cause;
    this.popup(cause, this.head, '#f83800');
    this.state = 'dying';
    this.stateTimer = 0;
    this.shake = 14;
    sfx.die();
  }

  private stepDying() {
    // The skin comes apart scale by scale, from the head back.
    if (this.stateTimer % 2 === 0 && this.snake.length) {
      const c = this.snake.shift()!;
      this.burst(c, this.def.theme.skin[this.snake.length % 2], 5);
    }
    if (!this.snake.length && this.stateTimer > 60) this.state = 'dead';
  }

  private stepExiting() {
    // The snake slides into the doorway, one segment every few frames.
    if (this.stateTimer % 3 !== 0) return;
    if (this.snake.length > 1) {
      this.snake.pop();
      this.score(5 * this.opt.number);
      sfx.exitStep(this.stepCount++);
      this.burst(this.exit, '#f8d838', 2);
    } else if (this.stateTimer > 30) {
      this.snake = [];
      this.state = 'done';
    }
  }

  // ---------- effects ----------

  popup(text: string, cell: number, color: string) {
    this.popups.push({ text, x: cx(cell) * 8 + 4, y: cy(cell) * 8, life: 60, color });
  }

  burst(cell: number, color: string, n: number) {
    for (let k = 0; k < n; k++) {
      this.particles.push({
        x: cx(cell) * 8 + 4,
        y: cy(cell) * 8 + 4,
        vx: (Math.random() - 0.5) * 3,
        vy: -Math.random() * 2.5 - 0.3,
        gravity: 0.12,
        life: 25 + Math.random() * 20,
        color,
        size: 2,
      });
    }
  }

  private stepEffects() {
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.life--;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const p of this.popups) {
      p.life--;
      if (p.life > 30) p.y -= 0.4;
    }
    this.popups = this.popups.filter((p) => p.life > 0);
  }
}
