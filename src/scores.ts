import { MODES, ModeId } from './modes';

export interface ScoreEntry {
  name: string;
  score: number;
  /** Level (quest), depth (descent) or notes eaten (classic). */
  level: number;
  /** Longest the snake grew. */
  length: number;
  speed: number;
}

export type Tables = Record<ModeId, ScoreEntry[]>;

export const MAX_SCORES = 10;
const KEY = 'scales.scores';

export function load(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

const isEntry = (e: unknown): e is ScoreEntry =>
  !!e && typeof (e as ScoreEntry).name === 'string' && Number.isFinite((e as ScoreEntry).score);

const normalize = (e: ScoreEntry): ScoreEntry => ({
  name: e.name.slice(0, 6),
  score: e.score,
  level: Number(e.level) || 0,
  length: Number(e.length) || 0,
  speed: Number(e.speed) || 3,
});

export function loadTables(): Tables {
  const tables = Object.fromEntries(MODES.map((m) => [m.id, [] as ScoreEntry[]])) as unknown as Tables;
  try {
    const raw = JSON.parse(load(KEY) ?? '{}');
    for (const m of MODES) {
      const list = Array.isArray(raw[m.id]) ? raw[m.id].filter(isEntry).map(normalize) : [];
      tables[m.id] = list.sort((a: ScoreEntry, b: ScoreEntry) => b.score - a.score).slice(0, MAX_SCORES);
    }
  } catch {}
  return tables;
}

export const saveTables = (t: Tables) => save(KEY, JSON.stringify(t));

/** Index the entry would take in the table, or -1 if it doesn't make it. */
export function rankFor(list: ScoreEntry[], e: ScoreEntry) {
  const i = list.findIndex((x) => e.score > x.score);
  const at = i >= 0 ? i : list.length;
  return at < MAX_SCORES ? at : -1;
}
