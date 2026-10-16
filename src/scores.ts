// High scores, one table per mode, in this browser and worldwide (a Val Town val:
// tilmanschieber/scales-scores). The tables themselves are arcade-kit's.
import { createScores } from 'arcade-kit/scores';
import { MODES, ModeId } from './modes';

export { load, save } from 'arcade-kit/storage';

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

export const { MAX_SCORES, loadTables, saveTables, rankFor, fetchGlobal, submitGlobal, flushPending } = createScores<
  ModeId,
  ScoreEntry
>({
  game: 'scales',
  tables: MODES.map((m) => m.id),
  url: 'https://tilmanschieber--60df1d10be2711f1a8511607ee4eb77e.web.val.run',
  normalize: (e) => ({
    name: e.name,
    score: e.score,
    level: Number(e.level) || 0,
    length: Number(e.length) || 0,
    speed: Number(e.speed) || 3,
  }),
});
