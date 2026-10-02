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

export const isEntry = (e: unknown): e is ScoreEntry =>
  !!e && typeof (e as ScoreEntry).name === 'string' && Number.isFinite((e as ScoreEntry).score);

export const normalize = (e: ScoreEntry): ScoreEntry => ({
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

// ---------- world scores (a Val Town val: tilmanschieber/scales-scores) ----------

const GLOBAL_URL = 'https://tilmanschieber--60df1d10be2711f1a8511607ee4eb77e.web.val.run';

const cleanList = (list: unknown) =>
  Array.isArray(list) ? list.filter(isEntry).map(normalize).slice(0, MAX_SCORES) : [];

/** The world top 10 of every mode, or null when offline. */
export async function fetchGlobal(): Promise<Tables | null> {
  try {
    const res = await fetch(GLOBAL_URL);
    if (!res.ok) return null;
    const raw = await res.json();
    return Object.fromEntries(MODES.map((m) => [m.id, cleanList(raw[m.id])])) as unknown as Tables;
  } catch {
    return null;
  }
}

/** Sends a finished game; returns its world rank (-1 outside the top 10) and the new top 10. */
export async function submitGlobal(mode: ModeId, e: ScoreEntry): Promise<{ rank: number; top: ScoreEntry[] } | null> {
  try {
    const res = await fetch(GLOBAL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, ...e }),
    });
    if (!res.ok) return null;
    const raw = await res.json();
    return { rank: Number.isInteger(raw.rank) ? raw.rank : -1, top: cleanList(raw.top) };
  } catch {
    return null;
  }
}
