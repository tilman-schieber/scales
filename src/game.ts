import { MODES, Mode, SPEEDS, SPEED_POINTS } from './modes';
import { loadTables, saveTables, rankFor, ScoreEntry, Tables, MAX_SCORES, load, save } from './scores';
import { sfx, music, intensityFor, TUNE } from './audio';
import { hashString, makeRng, randomSeed, today } from './rng';
import { QUEST, CLASSIC, endlessLevel, LevelDef } from './levels';
import { World, Dir, Particle } from './world';
import { HELP_PAGES } from './help';

export type Action = 'up' | 'down' | 'left' | 'right' | 'boost' | 'start' | 'back' | 'quit' | 'mute' | 'scores';

export interface Input {
  held: Set<Action>;
  pressed: Set<Action>;
  /** Direction presses this frame, in order (turns queue up). */
  dirs: Dir[];
  /** Raw A-Z / 0-9 / Backspace / Enter, for name entry. */
  typed: string[];
}

export type Phase = 'title' | 'intro' | 'play' | 'curtain' | 'over' | 'entry' | 'scores' | 'help' | 'ending';

export interface Settings {
  mode: number;
  /** Quest level to start on (0-based). */
  start: number;
  /** 0-4, shown as 1-5. */
  speed: number;
  daily: boolean;
  /** Index into MUSIC_NAMES. */
  music: number;
  /** M mutes without changing the selection. */
  muted: boolean;
}

/** The single tunes (same order as TUNES), then ALL (a fitting tune for each part) and OFF. */
export const MUSIC_NAMES = ['BOLERO', 'CHARMER', 'CRAB', 'SEQUENCER', 'ALL', 'OFF'];
const MUSIC_SEQUENCER = 3;
const MUSIC_ALL = 4;
const MUSIC_OFF = 5;

export const MENU = ['MODE', 'START', 'SPEED', 'SEED', 'MUSIC', 'HELP'] as const;
export const NAME_LEN = 6;
const NAME_CHARS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const DEFAULT_SETTINGS: Settings = { mode: 0, start: 0, speed: 2, daily: false, music: MUSIC_SEQUENCER, muted: false };
/**
 * The title's sequencer demo: each quest level's scale in turn, with a little melody
 * wandering up and down it, as if a snake had eaten its way through.
 */
const DEMO_PATTERNS = QUEST.map((q, k) => {
  const rng = makeRng(k + 1);
  const top = q.scale.steps.length + 2;
  let d = 0;
  const degrees = [0];
  for (let n = 1; n < 10; n++) {
    d = Math.max(0, Math.min(top, d + [-2, -1, 1, 1, 2][Math.floor(rng() * 5)]));
    degrees.push(d);
  }
  return { root: q.root, steps: q.scale.steps, degrees };
});

/** Frames the level card shows before play. */
export const INTRO_FRAMES = 150;

function loadSettings(): Settings {
  try {
    const s = { ...DEFAULT_SETTINGS, ...JSON.parse(load('scales.settings') ?? '{}') };
    s.mode = Math.min(MODES.length - 1, Math.max(0, s.mode | 0));
    s.start = Math.min(QUEST.length - 1, Math.max(0, s.start | 0));
    s.speed = Math.min(SPEEDS.length - 1, Math.max(0, s.speed | 0));
    s.daily = !!s.daily;
    // Music used to be on/off.
    if (typeof s.music === 'boolean') s.music = s.music ? MUSIC_ALL : MUSIC_OFF;
    s.music = Math.min(MUSIC_NAMES.length - 1, Math.max(0, s.music | 0));
    s.muted = !!s.muted;
    return s;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export class Game {
  phase: Phase = 'title';
  settings = loadSettings();
  /** Highest quest level reached (0-based); START can't go past it. */
  reached = Math.min(QUEST.length - 1, Math.max(0, Number(load('scales.reached')) | 0));
  menuRow = 0;
  paused = false;
  timer = 0;
  curtainRow = 0;

  world: World | null = null;
  score = 0;
  lives = 0;
  /** Quest level index, or descent depth - 1. */
  level = 0;
  loop = 0;
  cleared = 0;
  maxLength = 0;
  /** Length taken into the next level: half of what went through the door. */
  carry = 4;
  private seed = 0;
  private melodyLength = 0;

  tables: Tables = loadTables();
  scoresView = 0;
  entryRank = -1;
  entryName: string[] = [];
  entryCursor = 0;
  private entryFresh = false;

  helpPage = 0;
  /** Screen-space particles (the ending). */
  particles: Particle[] = [];
  private preview: { key: string; world: World } | null = null;

  constructor() {
    music.enabled = !this.settings.muted;
  }

  get mode(): Mode {
    return MODES[this.settings.mode];
  }

  best(modeIdx = this.settings.mode): ScoreEntry | undefined {
    return this.tables[MODES[modeIdx].id]?.[0];
  }

  /** Displayed level number: keeps counting on later loops. */
  get levelNumber() {
    return this.level + 1 + this.loop * QUEST.length;
  }

  /** A fixed-seed world of the selected start level, drawn behind the title menu. */
  titleWorld() {
    const m = this.mode.id;
    const key = `${m}:${this.settings.start}`;
    if (this.preview?.key !== key) {
      const def = m === 'quest' ? QUEST[this.settings.start] : m === 'classic' ? CLASSIC : endlessLevel(8, makeRng(7));
      this.preview = { key, world: new World(def, { rng: makeRng(1234), number: 1, interval: 6, grow: 2, endless: false, points: 1 }) };
    }
    return this.preview.world;
  }

  step(input: Input) {
    const { pressed } = input;
    this.stepParticles();
    if (this.phase === 'entry') return this.stepEntry(input);
    if (pressed.has('mute')) this.toggleMusic();

    switch (this.phase) {
      case 'title':
        return this.stepTitle(pressed);
      case 'intro':
        return this.stepIntro(input);
      case 'play':
        return this.stepPlay(input);
      case 'curtain':
        if (++this.timer % 3 === 0) this.curtainRow++;
        if (this.curtainRow > 26) {
          this.phase = 'over';
          this.timer = 0;
        }
        return;
      case 'over':
        if (++this.timer > 30 && pressed.has('start')) {
          if (this.entryRank >= 0) this.phase = 'entry';
          else this.showScores();
          sfx.select();
        }
        return;
      case 'ending':
        return this.stepEnding(pressed);
      case 'scores':
        return this.stepScores(pressed);
      case 'help':
        return this.stepHelp(pressed);
    }
  }

  // ---------- menu ----------

  private saveSettings() {
    save('scales.settings', JSON.stringify(this.settings));
  }

  private toggleMusic() {
    this.settings.muted = !music.toggle();
    this.saveSettings();
  }

  /** The tune for a part of the game under the MUSIC setting, or -1 for none. */
  tuneFor(part: 'title' | 'ending' | LevelDef) {
    const sel = this.settings.music;
    if (sel === MUSIC_OFF) return -1;
    if (sel !== MUSIC_ALL) return sel;
    if (part === 'title') return TUNE.CHARMER;
    if (part === 'ending') return TUNE.CRAB;
    // Charmer in the open gardens, Bach in the dark, Bolero through the mazes.
    if (this.mode.id === 'classic' || (this.mode.id === 'quest' && this.level < 5)) return TUNE.CHARMER;
    if (part.features.dark) return TUNE.CRAB;
    return TUNE.BOLERO;
  }

  private titleMusic() {
    const want = this.tuneFor('title');
    if (want < 0) return music.stop();
    if (music.running && music.tune === want) return;
    music.setKey(0);
    music.setIntensity(2);
    music.setTempo(1);
    music.setDemo(DEMO_PATTERNS);
    music.play(want, music.tune !== want);
  }

  rowEnabled(row: (typeof MENU)[number]) {
    if (row === 'START') return this.mode.usesStart;
    if (row === 'SEED') return this.mode.usesSeed;
    return true;
  }

  private stepTitle(pressed: Set<Action>) {
    const s = this.settings;
    this.titleMusic();
    if (pressed.has('up')) this.menuRow = (this.menuRow + MENU.length - 1) % MENU.length;
    if (pressed.has('down')) this.menuRow = (this.menuRow + 1) % MENU.length;
    if (pressed.has('up') || pressed.has('down')) sfx.move();

    const d = (pressed.has('right') ? 1 : 0) - (pressed.has('left') ? 1 : 0);
    const row = MENU[this.menuRow];
    if (row === 'HELP' && (d || pressed.has('start'))) {
      this.helpPage = 0;
      this.phase = 'help';
      sfx.select();
      return;
    }
    if (d && this.rowEnabled(row)) {
      const wrap = (v: number, n: number) => (v + d + n) % n;
      if (row === 'MODE') s.mode = wrap(s.mode, MODES.length);
      if (row === 'START') s.start = wrap(s.start, this.reached + 1);
      if (row === 'SPEED') s.speed = wrap(s.speed, SPEEDS.length);
      if (row === 'SEED') s.daily = !s.daily;
      if (row === 'MUSIC') s.music = wrap(s.music, MUSIC_NAMES.length);
      sfx.select();
      this.saveSettings();
    }
    if (pressed.has('scores')) {
      this.scoresView = s.mode;
      this.entryRank = -1;
      this.phase = 'scores';
      sfx.select();
    } else if (pressed.has('start')) this.startGame();
  }

  private stepHelp(pressed: Set<Action>) {
    const d = (pressed.has('right') ? 1 : 0) - (pressed.has('left') ? 1 : 0);
    if (d) {
      this.helpPage = (this.helpPage + d + HELP_PAGES.length) % HELP_PAGES.length;
      sfx.move();
    }
    if (pressed.has('start') || pressed.has('back') || pressed.has('quit')) {
      this.phase = 'title';
      sfx.select();
    }
  }

  // ---------- a run ----------

  startGame() {
    const s = this.settings;
    const mode = this.mode;
    this.seed = s.daily && mode.usesSeed ? hashString(`${today()}:${mode.id}`) : randomSeed();
    this.score = 0;
    this.lives = mode.lives;
    this.level = mode.usesStart ? Math.min(s.start, this.reached) : 0;
    this.loop = 0;
    this.cleared = 0;
    this.maxLength = 0;
    this.carry = 4;
    this.entryRank = -1;
    this.paused = false;
    sfx.start();
    this.loadLevel();
  }

  private loadLevel() {
    const m = this.mode.id;
    const rng = makeRng(this.seed ^ hashString(`${this.loop}:${this.level}`));
    const speed = SPEEDS[this.settings.speed];
    let def: LevelDef;
    if (m === 'quest') def = QUEST[this.level];
    else if (m === 'endless') def = endlessLevel(this.level + 1, rng);
    else def = CLASSIC;
    this.world = new World(def, {
      rng,
      number: m === 'endless' ? this.level + 1 : this.levelNumber,
      interval: Math.max(3, speed - this.loop),
      points: SPEED_POINTS[this.settings.speed],
      grow: 3,
      endless: m === 'classic',
      carry: this.carry,
    });
    if (m === 'quest' && this.loop === 0 && this.level > this.reached) {
      this.reached = this.level;
      save('scales.reached', String(this.reached));
    }
    music.stop();
    this.melodyLength = 0;
    this.phase = 'intro';
    this.timer = 0;
  }

  private tempo(round = 0) {
    const classic = this.mode.id === 'classic' ? Math.min(0.45, round * 0.05) : 0;
    return 0.92 + this.settings.speed * 0.04 + this.loop * 0.05 + classic;
  }

  private startMusic() {
    const w = this.world!;
    const tune = this.tuneFor(w.def);
    if (tune < 0) return;
    music.setKey(w.root);
    music.setTempo(this.tempo(w.round));
    music.setIntensity(intensityFor(w.snake.length + w.grow));
    music.setSequence(w.root, w.scale.steps, w.melody);
    music.play(tune, true);
  }

  private stepIntro({ pressed, dirs }: Input) {
    this.timer++;
    const skip = this.timer > 20 && (pressed.has('start') || dirs.length > 0);
    if (this.timer >= INTRO_FRAMES || skip) {
      this.phase = 'play';
      this.startMusic();
    }
  }

  private stepPlay(input: Input) {
    const { pressed } = input;
    const w = this.world!;
    if (pressed.has('start') || pressed.has('back')) {
      this.paused = !this.paused;
      sfx.pause();
      if (this.paused) music.halt();
      else music.resume();
      return;
    }
    if (this.paused) {
      if (pressed.has('quit')) this.toTitle();
      return;
    }
    w.update(input.dirs, input.held.has('boost'));
    this.score += w.gained;
    w.gained = 0;
    this.maxLength = Math.max(this.maxLength, w.snake.length);
    if (w.state === 'play') music.setIntensity(intensityFor(w.snake.length));
    if (w.melody.length !== this.melodyLength) {
      this.melodyLength = w.melody.length;
      music.setKey(w.root);
      music.setSequence(w.root, w.scale.steps, w.melody);
      music.setTempo(this.tempo(w.round));
    }

    if (w.state === 'done') this.levelCleared();
    else if (w.state === 'dead') {
      if (--this.lives > 0) {
        w.respawn();
        music.setIntensity(0);
      } else this.gameOver();
    }
  }

  private levelCleared() {
    this.cleared++;
    // Half the skin is shed at the door.
    this.carry = Math.max(4, Math.floor(this.world!.exitLength / 2));
    if (this.mode.id === 'quest' && this.cleared % 3 === 0) {
      this.lives++;
      sfx.oneUp();
    }
    this.level++;
    if (this.mode.id === 'quest' && this.level >= QUEST.length) {
      this.level = 0;
      this.loop++;
      this.phase = 'ending';
      this.timer = 0;
      music.stop();
      sfx.win();
      const tune = this.tuneFor('ending');
      if (tune >= 0) {
        music.setKey(0);
        music.setIntensity(4);
        music.setTempo(1);
        music.play(tune, true);
      }
      return;
    }
    this.loadLevel();
  }

  private gameOver() {
    this.phase = 'curtain';
    this.timer = 0;
    this.curtainRow = 0;
    music.stop();
    sfx.over();
    this.prepareEntry();
  }

  private toTitle() {
    this.phase = 'title';
    this.world = null;
    this.paused = false;
    this.entryRank = -1;
    this.particles = [];
    music.stop();
    sfx.select();
  }

  // ---------- ending: the ouroboros ----------

  private stepEnding(pressed: Set<Action>) {
    const t = ++this.timer;
    if (t % 6 === 0 && t > 60) {
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        x: 128 + Math.cos(a) * 56,
        y: 104 + Math.sin(a) * 56,
        vx: Math.cos(a) * 0.6,
        vy: Math.sin(a) * 0.6,
        gravity: 0,
        life: 40,
        color: ['#f8d838', '#fcfcfc', '#f8b800'][t % 3],
        size: 1,
      });
    }
    if (t > 120 && pressed.has('start')) {
      sfx.start();
      this.loadLevel();
    }
  }

  private stepParticles() {
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.life--;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  // ---------- high scores ----------

  private prepareEntry() {
    this.entryRank = -1;
    this.scoresView = this.settings.mode;
    if (this.score <= 0) return;
    const w = this.world;
    const entry: ScoreEntry = {
      name: '',
      score: this.score,
      level: this.mode.id === 'classic' ? (w?.notesTotal ?? 0) : this.levelNumber,
      length: this.maxLength,
      speed: this.settings.speed + 1,
    };
    const list = this.tables[this.mode.id];
    const at = rankFor(list, entry);
    if (at < 0) return;
    list.splice(at, 0, entry);
    list.length = Math.min(list.length, MAX_SCORES);
    this.entryRank = at;
    const last = (load('scales.name') ?? '').slice(0, NAME_LEN);
    this.entryName = last.padEnd(NAME_LEN, ' ').split('');
    this.entryCursor = Math.min(NAME_LEN - 1, last.length);
    this.entryFresh = last.length > 0;
  }

  private stepEntry({ pressed, typed }: Input) {
    const name = this.entryName;
    const cycle = (d: number) => {
      const i = NAME_CHARS.indexOf(name[this.entryCursor]);
      name[this.entryCursor] = NAME_CHARS[(i + d + NAME_CHARS.length) % NAME_CHARS.length];
      sfx.move();
    };
    if (pressed.has('up')) cycle(1);
    if (pressed.has('down')) cycle(-1);
    if (pressed.has('left') && this.entryCursor > 0) this.entryCursor--;
    if (pressed.has('right') && this.entryCursor < NAME_LEN - 1) this.entryCursor++;

    for (const key of typed) {
      if (key === 'Enter') return this.commitName();
      if (key === 'Backspace') {
        if (name[this.entryCursor] === ' ' && this.entryCursor > 0) this.entryCursor--;
        name[this.entryCursor] = ' ';
      } else {
        // A suggested name is replaced as soon as you type.
        if (this.entryFresh) {
          name.fill(' ');
          this.entryCursor = 0;
        }
        name[this.entryCursor] = key;
        this.entryCursor = Math.min(NAME_LEN - 1, this.entryCursor + 1);
      }
      this.entryFresh = false;
      sfx.move();
    }
    if (pressed.size) this.entryFresh = false;
  }

  private commitName() {
    const name = this.entryName.join('').trim() || '------';
    this.tables[this.mode.id][this.entryRank].name = name;
    saveTables(this.tables);
    save('scales.name', name);
    this.phase = 'scores';
    this.timer = 0;
    sfx.oneUp();
  }

  private showScores() {
    this.scoresView = this.settings.mode;
    this.phase = 'scores';
    this.timer = 0;
  }

  private stepScores(pressed: Set<Action>) {
    const d = (pressed.has('right') ? 1 : 0) - (pressed.has('left') ? 1 : 0);
    if (d) {
      this.scoresView = (this.scoresView + d + MODES.length) % MODES.length;
      this.entryRank = -1;
      sfx.select();
    }
    if (pressed.has('start') || pressed.has('back') || pressed.has('scores')) this.toTitle();
  }
}
