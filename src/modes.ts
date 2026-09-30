export type ModeId = 'quest' | 'classic' | 'endless';

export interface Mode {
  id: ModeId;
  name: string;
  /** Lives at the start. */
  lives: number;
  /** Has a start level to choose. */
  usesStart: boolean;
  /** Mazes can use the daily seed. */
  usesSeed: boolean;
}

export const MODES: Mode[] = [
  { id: 'quest', name: 'QUEST', lives: 3, usesStart: true, usesSeed: true },
  { id: 'endless', name: 'DESCENT', lives: 1, usesStart: false, usesSeed: true },
  { id: 'classic', name: 'CLASSIC', lives: 1, usesStart: false, usesSeed: false },
];

/** Frames per step for SPEED 1-5. */
export const SPEEDS = [17, 12, 9, 7, 5];
/** Score multiplier for each speed: faster is riskier, so it pays more. */
export const SPEED_POINTS = [0.5, 0.75, 1, 1.5, 2];
export const SPEED_NAMES = ['CALM', 'EASY', 'NORMAL', 'FAST', 'FRANTIC'];
