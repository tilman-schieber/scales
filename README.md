# SCALES

A NES-style snake game that descends into a labyrinth, built in TypeScript with no runtime dependencies. Runs entirely in the browser.

**Play:** https://gh.tschieber.de/scales/

Every note you eat plays the next step of the level's musical scale. Complete the scale — every note and the octave — and a door opens; slide into it to shed your skin and go deeper. The early levels are open gardens; the later ones are braided mazes that grow narrower, darker and stranger.

## Modes

| Mode | Goal |
| --- | --- |
| QUEST | 13 levels from The Meadow to The Heart. You keep half your length at each door; dying shrinks you back to a hatchling. 3 lives, +1 every 3 levels. Levels you've reached can be picked as the start. Clearing The Heart loops back, faster. |
| DESCENT | Endless procedural mazes, each deeper than the last. One life. |
| CLASSIC | Plain snake on one open field. Every scale you finish modulates to the next key round the circle of fifths and a new mode — pentatonic, major, mixolydian, dorian, minor, blues, … up to chromatic — and the game gets faster. |

**Seed:** *Daily* gives everyone the same labyrinths for the day.

## The labyrinth

| Thing | What it does |
| --- | --- |
| Portals | Go in one, come out the other |
| Shifting walls | Barred gates open and close every 5 seconds; they blink and tick first |
| Darkness | You only see near your head; notes glimmer now and then |
| Ariadne's thread | A golden ball of yarn that lights the way to the next note or door |
| The Minotaur | Hunts you through the maze and can't pass your body. Your heartbeat quickens as it closes in; in the dark you only see its eyes |
| Labrys | The double axe: the Minotaur flees, and you can eat it while it's blue |

## Music

Chiptune arrangements of public-domain music, transposed to each level's key. Every tune swells as the snake grows: instruments join in with its length.

| Option | Music |
| --- | --- |
| BOLERO | Ravel's *Boléro*: both themes over the snare and pizzicato ostinato. One long crescendo that lifts into the finale key change at full length |
| CHARMER | Thornton's *The Streets of Cairo*, the snake charmer song, over a drone and hand drums |
| CRAB | Bach's *Canon a 2 cancrizans* from the *Musical Offering*: one voice plays the line forwards, the other backwards |
| SEQUENCER | No fixed tune: every note you eat joins a looping 16-step pattern, so you build the song as you play |
| ALL | Charmer in the gardens and Classic, Boléro in the mazes, the crab canon in the dark and the ending |
| OFF | Silence (M mutes any option) |

The notes come from MIDI files — the crab canon and *Streets of Cairo* from [flutetunes.com](https://www.flutetunes.com), *Boléro* from David Weatherford's sequence on [BitMidi](https://bitmidi.com/bolero-ravel-mid) — extracted into `src/tunes.ts` by `tools/midi2ts.py`. Only the public-domain compositions' notes are used; the MIDI files aren't part of the repo.

## Controls

| Key | Action |
| --- | --- |
| Arrows / W A S D | Turn (turns queue up) |
| Space / Shift / X | Hold to boost: double speed, double points |
| Enter / Esc | Start / pause |
| Backspace | Quit to menu (while paused) |
| M | Music on/off |
| H | High scores (title screen) |

On phones, swipe the screen or use the buttons below it.

High scores: the top 10 per mode, both worldwide and in your own browser (Up/Down switches between them on the score screen). World scores live in a small [Val Town](https://www.val.town/x/tilmanschieber/scales-scores) val with a SQLite table; your own scores and settings stay in the browser's local storage, so they still work offline.

## Development

```sh
npm install
npm run dev
npm run build
```
