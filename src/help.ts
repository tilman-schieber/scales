// In-game help pages. Text uses only characters the pixel font has.

export interface HelpPage {
  title: string;
  /** Paragraphs, word-wrapped when drawn; '' adds a blank line. */
  text: string[];
}

export const HELP_PAGES: HelpPage[] = [
  {
    title: 'SCALES',
    text: [
      'YOU ARE A SNAKE. EACH NOTE YOU EAT PLAYS THE NEXT STEP OF THE LEVEL SCALE AND MAKES YOU LONGER.',
      '',
      'COMPLETE THE SCALE - ALL ITS NOTES AND THE OCTAVE - AND A DOOR OPENS. SLIDE INTO IT TO SHED YOUR SKIN AND GO DEEPER.',
      '',
      'YOU KEEP HALF YOUR LENGTH FROM LEVEL TO LEVEL. LOSING A LIFE SHRINKS YOU BACK TO A HATCHLING.',
      '',
      'DO NOT BITE YOURSELF OR THE WALLS. A SNAKE CANNOT TURN BACK.',
    ],
  },
  {
    title: 'MODES',
    text: [
      'QUEST: 13 LEVELS FROM AN OPEN MEADOW TO THE HEART OF THE LABYRINTH. 3 LIVES, AND ONE MORE EVERY 3 LEVELS. REACHED LEVELS CAN BE PICKED AS START.',
      '',
      'DESCENT: ENDLESS RANDOM MAZES, EACH DEEPER AND STRANGER. ONE LIFE.',
      '',
      'CLASSIC: ONE FIELD, NOTES FOREVER, FASTER EVERY 5 NOTES.',
    ],
  },
  {
    title: 'THE LABYRINTH',
    text: [
      'PORTALS: GO IN ONE, COME OUT THE OTHER.',
      '',
      'SHIFTING WALLS: BARRED GATES OPEN AND CLOSE EVERY FEW SECONDS. THEY BLINK AND TICK BEFORE THEY MOVE.',
      '',
      'DARKNESS: YOU ONLY SEE WHAT IS NEAR. NOTES GLIMMER NOW AND THEN.',
      '',
      "ARIADNE'S THREAD: A GOLDEN BALL OF YARN. IT SHOWS THE WAY TO THE NEXT NOTE OR DOOR.",
    ],
  },
  {
    title: 'THE MINOTAUR',
    text: [
      'IT HUNTS YOU THROUGH THE MAZE. LISTEN FOR YOUR HEARTBEAT - IT QUICKENS AS THE BEAST COMES CLOSER. IN THE DARK YOU SEE ONLY ITS EYES.',
      '',
      'IT CANNOT PASS YOUR BODY: BLOCK IT WITH YOUR TAIL.',
      '',
      'EAT THE LABRYS, THE DOUBLE AXE, AND THE MINOTAUR FLEES. CATCH IT WHILE IT IS BLUE FOR BIG POINTS.',
    ],
  },
  {
    title: 'SCORING',
    text: [
      'NOTE: 10 X LEVEL',
      'SCALE COMPLETE: 100 X LEVEL',
      'EACH SEGMENT INTO THE DOOR: 5 X LEVEL',
      'MINOTAUR: 200 X LEVEL',
      'THREAD OR LABRYS: 50',
      '',
      'FASTER SPEEDS PAY MORE: CALM X0.5, EASY X0.75, NORMAL X1, FAST X1.5, FRANTIC X2.',
      '',
      'HOLD SPACE TO SLITHER TWICE AS FAST FOR DOUBLE POINTS.',
    ],
  },
  {
    title: 'MUSIC',
    text: [
      'THE MUSIC SWELLS AS YOU GROW.',
      '',
      'BOLERO: RAVEL.',
      'CHARMER: THE STREETS OF CAIRO, THE SNAKE CHARMER SONG.',
      'CRAB: BACH, THE CRAB CANON - ONE VOICE PLAYS THE TUNE FORWARDS, THE OTHER BACKWARDS.',
      'SEQUENCER: THE NOTES YOU EAT BECOME THE SONG.',
      'ALL: A FITTING TUNE FOR EACH PART OF THE GAME.',
    ],
  },
  {
    title: 'CONTROLS',
    text: [
      'ARROWS OR W A S D: TURN',
      'SPACE, SHIFT OR X: HOLD TO BOOST',
      'ENTER OR ESC: PAUSE',
      'BACKSPACE: QUIT WHEN PAUSED',
      'M: MUSIC ON OR OFF',
      'H: HIGH SCORES - TITLE SCREEN',
      '',
      'TURNS QUEUE UP, SO YOU CAN TAP TWO IN QUICK SUCCESSION.',
      '',
      'ON PHONES SWIPE THE SCREEN OR USE THE BUTTONS.',
    ],
  },
];

/** Splits paragraphs into lines of at most `width` characters. */
export function wrapText(paragraphs: string[], width: number) {
  const lines: string[] = [];
  for (const para of paragraphs) {
    if (!para) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of para.split(' ')) {
      if (line && line.length + 1 + word.length > width) {
        lines.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    lines.push(line);
  }
  return lines;
}
