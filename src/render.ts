import { Game, MENU, MUSIC_NAMES, NAME_LEN, INTRO_FRAMES } from './game';
import { World, GATE_PERIOD, GATE_WARN } from './world';
import { COLS, ROWS, WALL, NOTE_NAMES, QUEST, cellAt, cx, cy } from './levels';
import { MODES, SPEED_NAMES, SPEED_POINTS } from './modes';
import { MAX_SCORES } from './scores';
import { HELP_PAGES, wrapText } from './help';
import { drawText, drawTextCentered, textWidth } from './font';
import { Ctx, W, H, WHITE, RED, GREY, LIGHT, DARK, YELLOW, GOLD, mix, drawBox, drawSprite, pad, hash } from './draw';

export { W, H };

/** Board origin on screen: the HUD takes the top 24 pixels. */
const BY = 24;

// ---------- sprites ----------

const NOTE = ['...##...', '...#.#..', '...#..#.', '...#....', '...#....', '.###....', '####....', '.##.....'];
const MINOTAUR = ['h......h', '.h....h.', '.hbbbbh.', 'bbebbebb', '.bbbbbb.', '..bddb..', '..dnnd..', '...dd...'];
const LABRYS = ['...s....', 'aa.s.aa.', 'aaasaaa.', 'aAasaAa.', 'aa.s.aa.', '...s....', '...s....', '...s....'];
const THREAD = ['........', '..yyyy..', '.yYyyYy.', '.yyYYyy.', '.yYyyYy.', '..yyyy.t', '......t.', '.....t..'];
const LIFE = ['.gggg.', 'gkggkg', 'gggggg', '.gggg.', '..r...', '..r...'];

// ---------- the static level picture ----------

const bgCache = new WeakMap<World, HTMLCanvasElement>();

function levelBackground(w: World) {
  let c = bgCache.get(w);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = COLS * 8;
  c.height = ROWS * 8;
  const g = c.getContext('2d')!;
  const t = w.def.theme;
  const isWall = (x: number, y: number) => x < 0 || y < 0 || x >= COLS || y >= ROWS || w.grid[cellAt(x, y)] === WALL;
  const hi = mix(t.wall, '#ffffff', 0.35);
  const lo = mix(t.wall, '#000000', 0.45);
  const mortar = mix(t.wall, '#000000', 0.22);
  const floorDark = mix(t.floor, '#000000', 0.45);
  const floorLight = mix(t.floor, '#ffffff', 0.06);

  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const px = x * 8, py = y * 8;
      const h = hash(cellAt(x, y));
      if (isWall(x, y)) {
        g.fillStyle = t.wall;
        g.fillRect(px, py, 8, 8);
        // Brick courses line up across neighbouring wall tiles.
        g.fillStyle = mortar;
        g.fillRect(px, py + 3, 8, 1);
        g.fillRect(px, py + 7, 8, 1);
        g.fillRect(px + (y % 2 ? 2 : 6), py, 1, 3);
        g.fillRect(px + (y % 2 ? 6 : 2), py + 4, 1, 3);
        g.fillStyle = hi;
        if (!isWall(x, y - 1)) g.fillRect(px, py, 8, 1);
        if (!isWall(x - 1, y)) g.fillRect(px, py, 1, 8);
        g.fillStyle = lo;
        if (!isWall(x, y + 1)) g.fillRect(px, py + 7, 8, 1);
        if (!isWall(x + 1, y)) g.fillRect(px + 7, py, 1, 8);
        continue;
      }
      g.fillStyle = (x + y) % 2 ? t.floor : floorLight;
      g.fillRect(px, py, 8, 8);
      if (h % 53 === 0) drawDecor(g, t, px + 1 + (h >> 8) % 3, py + 1 + (h >> 12) % 3, h);
      else if (h % 7 === 0) {
        g.fillStyle = mix(t.floor, t.decor, 0.18);
        g.fillRect(px + (h >> 4) % 7, py + (h >> 9) % 7, 1, 1);
      }
      // Walls cast a short shadow down and to the right.
      g.fillStyle = floorDark;
      if (isWall(x, y - 1)) g.fillRect(px, py, 8, 2);
      if (isWall(x - 1, y)) g.fillRect(px, py, 1, 8);
    }
  bgCache.set(w, c);
  return c;
}

/** A small floor ornament at (x, y), about 5x5. */
function drawDecor(g: Ctx, t: World['def']['theme'], x: number, y: number, h: number) {
  const dot = (dx: number, dy: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(x + dx, y + dy, 1, 1);
  };
  if (t.decorKind === 'flower') {
    const stem = mix(t.floor, '#58d858', 0.6);
    dot(1, 3, stem);
    dot(1, 4, stem);
    dot(2, 4, stem);
    for (const [dx, dy] of [[1, 0], [0, 1], [2, 1], [1, 2]]) dot(dx, dy, t.decor);
    dot(1, 1, (h >> 16) % 2 ? YELLOW : GOLD);
  } else if (t.decorKind === 'bone') {
    const shade = mix(t.decor, '#000000', 0.35);
    for (let k = 1; k < 4; k++) dot(k, 2, t.decor);
    dot(0, 1, t.decor);
    dot(0, 3, t.decor);
    dot(4, 1, t.decor);
    dot(4, 3, t.decor);
    dot(2, 3, shade);
  } else {
    // A pebble with a highlight and a shadow.
    const c = mix(t.floor, t.decor, 0.8);
    g.fillStyle = c;
    g.fillRect(x, y + 1, 3, 1);
    g.fillRect(x + 1, y, 1, 1);
    dot(0, 1, mix(c, '#ffffff', 0.25));
    g.fillStyle = mix(t.floor, '#000000', 0.35);
    g.fillRect(x, y + 2, 3, 1);
  }
}

// ---------- the board ----------

function tileXY(c: number, ox: number, oy: number): [number, number] {
  return [ox + cx(c) * 8, oy + cy(c) * 8];
}

/** Direction from cell a to adjacent cell b (wrapping counts), or -1. */
function dirTo(a: number, b: number) {
  const dx = cx(b) - cx(a), dy = cy(b) - cy(a);
  if (dy === 0 && (dx === 1 || dx === -(COLS - 1))) return 1;
  if (dy === 0 && (dx === -1 || dx === COLS - 1)) return 3;
  if (dx === 0 && (dy === 1 || dy === -(ROWS - 1))) return 2;
  if (dx === 0 && (dy === -1 || dy === ROWS - 1)) return 0;
  return -1;
}

function drawGates(ctx: Ctx, w: World, ox: number, oy: number, frame: number) {
  if (!w.def.features.gates) return;
  const warn = GATE_PERIOD - w.gateTimer <= GATE_WARN;
  const bar = mix(w.def.theme.wall, '#ffffff', 0.4);
  for (let c = 0; c < w.grid.length; c++) {
    if (!w.isGate(c)) continue;
    const [x, y] = tileXY(c, ox, oy);
    if (w.gateOpen[c]) {
      // Open: just rivets at the corners, flashing when about to close.
      ctx.fillStyle = warn && (frame >> 2) % 2 ? RED : mix(w.def.theme.floor, bar, 0.5);
      for (const [dx, dy] of [[0, 0], [7, 0], [0, 7], [7, 7]]) ctx.fillRect(x + dx, y + dy, 1, 1);
      continue;
    }
    ctx.fillStyle = '#080808';
    ctx.fillRect(x, y, 8, 8);
    ctx.fillStyle = warn && (frame >> 2) % 2 ? GREY : bar;
    for (let k = 1; k < 8; k += 2) ctx.fillRect(x + k, y, 1, 8);
    ctx.fillRect(x, y + 2, 8, 1);
    ctx.fillRect(x, y + 5, 8, 1);
  }
}

function drawPortals(ctx: Ctx, w: World, ox: number, oy: number, frame: number) {
  const colors = ['#3ee8f0', '#f878f8'];
  w.portals.forEach((pair, k) => {
    const col = colors[k % 2];
    for (const c of pair) {
      const [x, y] = tileXY(c, ox, oy);
      ctx.fillStyle = '#000';
      ctx.fillRect(x + 1, y + 1, 6, 6);
      ctx.fillStyle = mix(col, '#000000', 0.5);
      ctx.fillRect(x + 2, y + 2, 4, 4);
      // A swirl of light running round the rim.
      const ring = [[2, 0], [5, 0], [7, 2], [7, 5], [5, 7], [2, 7], [0, 5], [0, 2]];
      for (let i = 0; i < ring.length; i++) {
        ctx.fillStyle = (i + (frame >> 2)) % 4 === 0 ? WHITE : col;
        ctx.fillRect(x + ring[i][0], y + ring[i][1], 1, 1);
      }
      ctx.fillStyle = (frame >> 3) % 2 ? col : WHITE;
      ctx.fillRect(x + 3, y + 3, 2, 2);
    }
  });
}

function drawSnake(ctx: Ctx, w: World, ox: number, oy: number, frame: number) {
  const s = w.snake;
  if (!s.length) return;
  const [c1, c2] = w.def.theme.skin;
  const flash = w.state === 'dying' && (frame >> 1) % 2 === 0;
  const hidden = w.state === 'exiting' || w.state === 'done';
  for (let i = s.length - 1; i >= 0; i--) {
    const c = s[i];
    if (hidden && i === 0) continue;
    const [x, y] = tileXY(c, ox, oy);
    const inset = i === s.length - 1 && i > 0 ? 2 : 1;
    const size = 8 - 2 * inset;
    const conns: number[] = [];
    if (i > 0) conns.push(dirTo(c, s[i - 1]));
    if (i < s.length - 1) conns.push(dirTo(c, s[i + 1]));
    ctx.fillStyle = flash ? WHITE : c1;
    ctx.fillRect(x + inset, y + inset, size, size);
    for (const d of conns) {
      if (d === 0) ctx.fillRect(x + inset, y, size, inset);
      if (d === 2) ctx.fillRect(x + inset, y + 8 - inset, size, inset);
      if (d === 3) ctx.fillRect(x, y + inset, inset, size);
      if (d === 1) ctx.fillRect(x + 8 - inset, y + inset, inset, size);
    }
    if (flash) continue;
    // Staggered scales.
    ctx.fillStyle = c2;
    for (let py = inset; py < 8 - inset; py++)
      for (let px = inset; px < 8 - inset; px++) if ((px + (py % 2) * 2 + i) % 4 === 0) ctx.fillRect(x + px, y + py, 1, 1);
    if (i === 0) drawHead(ctx, w, x, y, frame, c1);
  }
}

function drawHead(ctx: Ctx, w: World, x: number, y: number, frame: number, skin: string) {
  const f = w.facing;
  ctx.fillStyle = skin;
  // Rounded snout.
  if (f === 0) ctx.fillRect(x + 2, y, 4, 1);
  if (f === 2) ctx.fillRect(x + 2, y + 7, 4, 1);
  if (f === 3) ctx.fillRect(x, y + 2, 1, 4);
  if (f === 1) ctx.fillRect(x + 7, y + 2, 1, 4);
  ctx.fillRect(x + 2, y + 2, 4, 4);
  const eyes: Record<number, [number, number][]> = {
    0: [[2, 2], [5, 2]],
    1: [[5, 2], [5, 5]],
    2: [[2, 5], [5, 5]],
    3: [[2, 2], [2, 5]],
  };
  for (const [ex, ey] of eyes[f]) {
    ctx.fillStyle = '#000';
    ctx.fillRect(x + ex, y + ey, 1, 1);
  }
  // The tongue flicks now and then.
  if (w.state === 'play' && frame % 50 < 7) {
    ctx.fillStyle = RED;
    const fork = (frame >> 1) % 2;
    if (f % 2 === 0) {
      const ty = f === 0 ? y - 2 : y + 8;
      const fy = f === 0 ? ty - 1 : ty + 2;
      ctx.fillRect(x + 3, ty, 2, 2);
      ctx.fillRect(x + 2 + fork, fy, 1, 1);
      ctx.fillRect(x + 5 - fork, fy, 1, 1);
    } else {
      const tx = f === 3 ? x - 2 : x + 8;
      const fx = f === 3 ? tx - 1 : tx + 2;
      ctx.fillRect(tx, y + 3, 2, 2);
      ctx.fillRect(fx, y + 2 + fork, 1, 1);
      ctx.fillRect(fx, y + 5 - fork, 1, 1);
    }
  }
}

function minotaurColors(w: World, frame: number): Record<string, string> {
  const m = w.minotaur!;
  const asleep = m.sleep > 0;
  if (m.scared) {
    const blink = m.scared < 90 && (frame >> 3) % 2;
    return { h: WHITE, b: blink ? WHITE : '#2038e8', d: blink ? LIGHT : '#1020a0', e: WHITE, n: '#8898f8' };
  }
  return { h: '#e8e0c8', b: '#8a4a20', d: '#5a2a10', e: asleep ? '#5a2a10' : RED, n: '#d8a878' };
}

/** Light levels per cell for dark levels: <= 0 black, 0-1 dim, >= 1 lit. */
function lighting(w: World, frame: number) {
  const light = new Float32Array(w.grid.length).fill(-1);
  const add = (c: number, r: number) => {
    const x0 = cx(c), y0 = cy(c);
    const R = Math.ceil(r);
    for (let y = y0 - R; y <= y0 + R; y++)
      for (let x = x0 - R; x <= x0 + R; x++) {
        if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
        const v = r - Math.hypot(x - x0, y - y0);
        const i = cellAt(x, y);
        if (v > light[i]) light[i] = v;
      }
  };
  const r = w.def.features.dark;
  if (w.snake.length) add(w.snake[0], r + (frame % 40 < 2 ? 0 : 0.3));
  else add(w.start, r);
  for (let i = 1; i < w.snake.length; i++) add(w.snake[i], 1);
  if (w.exit >= 0) add(w.exit, 2.5);
  for (const [a, b] of w.portals) {
    add(a, 1.4);
    add(b, 1.4);
  }
  // Notes glimmer through the dark every couple of seconds.
  const glimmer = frame % 120;
  if (w.note >= 0 && glimmer < 30) add(w.note, 1 + Math.sin((glimmer / 30) * Math.PI) * 1.2);
  for (const it of w.items) add(it.cell, 1.2);
  return light;
}

let ditherTile: HTMLCanvasElement | null = null;
function dither() {
  if (ditherTile) return ditherTile;
  ditherTile = document.createElement('canvas');
  ditherTile.width = ditherTile.height = 8;
  const g = ditherTile.getContext('2d')!;
  g.fillStyle = '#000';
  for (let y = 0; y < 8; y++) for (let x = (y % 2); x < 8; x += 2) g.fillRect(x, y, 1, 1);
  return ditherTile;
}

export function drawBoard(ctx: Ctx, w: World, frame: number, ox = 0, oy = BY) {
  ctx.drawImage(levelBackground(w), ox, oy);
  drawGates(ctx, w, ox, oy, frame);
  drawPortals(ctx, w, ox, oy, frame);

  if (w.exit >= 0) {
    const [x, y] = tileXY(w.exit, ox, oy);
    const glow = [WHITE, YELLOW, GOLD, YELLOW][(frame >> 3) % 4];
    ctx.fillStyle = glow;
    ctx.fillRect(x + 1, y + 1, 6, 7);
    ctx.fillStyle = '#000';
    ctx.fillRect(x + 2, y + 2, 4, 6);
    ctx.fillStyle = mix(glow, '#000000', 0.3);
    ctx.fillRect(x + 3, y + 3 + ((frame >> 3) % 3), 2, 1);
    ctx.fillStyle = w.def.theme.wall;
    ctx.fillRect(x, y + 2, 1, 6);
    ctx.fillRect(x + 7, y + 2, 1, 6);
    ctx.fillRect(x + 2, y, 4, 1);
    ctx.fillRect(x + 1, y + 1, 1, 1);
    ctx.fillRect(x + 6, y + 1, 1, 1);
  }
  if (w.note >= 0) {
    const [x, y] = tileXY(w.note, ox, oy);
    const col = ['#fcfcfc', '#f8d838', '#58f8f8', '#f878f8'][(frame >> 4) % 4];
    drawSprite(ctx, NOTE, x, y - ((frame >> 4) % 2), { '#': col });
  }
  for (const it of w.items) {
    if (it.life < 120 && (frame >> 2) % 2) continue;
    const [x, y] = tileXY(it.cell, ox, oy);
    if (it.kind === 'labrys') drawSprite(ctx, LABRYS, x, y, { a: '#f8d838', A: WHITE, s: '#a86820' });
    else drawSprite(ctx, THREAD, x, y, { y: GOLD, Y: '#fcf0a0', t: GOLD });
  }

  drawSnake(ctx, w, ox, oy, frame);

  const m = w.minotaur;
  if (m?.alive) {
    const [x, y] = tileXY(m.cell, ox, oy);
    drawSprite(ctx, MINOTAUR, x, y, minotaurColors(w, frame));
  }

  if (w.def.features.dark) {
    const light = lighting(w, frame);
    const dim = dither();
    ctx.fillStyle = '#000';
    for (let c = 0; c < light.length; c++) {
      const [x, y] = tileXY(c, ox, oy);
      if (light[c] <= 0) ctx.fillRect(x, y, 8, 8);
      else if (light[c] < 1) ctx.drawImage(dim, x, y);
    }
    // Eyes in the dark.
    if (m?.alive && light[m.cell] <= 0 && !m.scared && m.sleep <= 0 && (frame >> 4) % 6 !== 0) {
      const [x, y] = tileXY(m.cell, ox, oy);
      ctx.fillStyle = RED;
      ctx.fillRect(x + 2, y + 3, 1, 1);
      ctx.fillRect(x + 5, y + 3, 1, 1);
    }
  }

  // Ariadne's thread shines through the darkness.
  if (w.path.length) {
    const fade = w.threadTimer < 90 && (frame >> 2) % 2;
    if (!fade) {
      ctx.fillStyle = GOLD;
      w.path.forEach((c, i) => {
        if ((i + (frame >> 2)) % 3 === 0) return;
        const [x, y] = tileXY(c, ox, oy);
        ctx.fillRect(x + 3, y + 3, 2, 2);
      });
    }
  }

  for (const p of w.particles) {
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(ox + p.x), Math.round(oy + p.y), p.size, p.size);
  }
  for (const p of w.popups) {
    if (p.life < 15 && (frame >> 1) % 2) continue;
    const tw = textWidth(p.text);
    const x = Math.max(ox + 2, Math.min(ox + COLS * 8 - tw - 2, Math.round(ox + p.x - tw / 2)));
    const y = Math.max(oy + 2, Math.round(oy + p.y - 10));
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 1, y - 1, tw + 2, 9);
    drawText(ctx, p.text, x, y, p.color);
  }
}

// ---------- in play ----------

export function render(ctx: Ctx, game: Game, frame: number) {
  ctx.save();
  const shake = game.world?.shake ?? 0;
  if (shake > 0 && game.phase === 'play') ctx.translate(frame % 2 ? 1 : -1, Math.min(2, shake >> 2) * (frame % 4 < 2 ? 1 : -1));
  switch (game.phase) {
    case 'title':
      renderTitle(ctx, game, frame);
      break;
    case 'entry':
    case 'scores':
      renderScores(ctx, game, frame);
      break;
    case 'help':
      renderHelp(ctx, game, frame);
      break;
    case 'ending':
      renderEnding(ctx, game, frame);
      break;
    default:
      renderPlay(ctx, game, frame);
  }
  ctx.restore();
}

function renderPlay(ctx: Ctx, game: Game, frame: number) {
  const w = game.world!;
  ctx.fillStyle = '#000';
  ctx.fillRect(-2, -2, W + 4, H + 4);
  drawBoard(ctx, w, frame);
  drawHud(ctx, game, w, frame);

  if (game.phase === 'intro') drawIntro(ctx, game, w);
  else if (game.phase === 'play' && game.paused) drawPause(ctx, game, w);
  else if (game.phase === 'play' && w.state === 'ready' && (frame >> 4) % 2 === 0) {
    const text = 'CHOOSE A DIRECTION';
    const y = BY + ROWS * 8 - 20;
    ctx.fillStyle = '#000';
    ctx.fillRect(128 - textWidth(text) / 2 - 4, y - 3, textWidth(text) + 8, 13);
    drawTextCentered(ctx, text, 128, y, YELLOW);
  }
  if (game.phase === 'curtain' || game.phase === 'over') drawCurtain(ctx, game, w, frame);
}

function drawStaff(ctx: Ctx, w: World, x0: number, frame: number) {
  const { steps } = w.def.scale;
  const n = w.notesNeeded;
  const width = 76;
  ctx.fillStyle = DARK;
  for (let k = 0; k < 5; k++) ctx.fillRect(x0 - 2, 5 + k * 3, width + 4, 1);
  const gap = Math.min(7, Math.floor(width / n));
  const x1 = x0 + Math.floor((width - gap * (n - 1) - 3) / 2);
  for (let i = 0; i < n; i++) {
    const semis = steps[i % steps.length] + 12 * Math.floor(i / steps.length);
    const x = x1 + i * gap;
    const y = 18 - semis;
    const got = i < w.notesGot;
    const next = i === w.notesGot;
    ctx.fillStyle = got ? w.def.theme.skin[0] : next ? ((frame >> 3) % 2 ? WHITE : GREY) : GREY;
    if (got || next) ctx.fillRect(x, y, 3, 2);
    else {
      ctx.fillRect(x, y, 3, 1);
      ctx.fillRect(x, y + 1, 1, 1);
      ctx.fillRect(x + 2, y + 1, 1, 1);
    }
    if (got) ctx.fillRect(x + 2, y - 5, 1, 5);
  }
}

function drawHud(ctx: Ctx, game: Game, w: World, frame: number) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, BY);
  ctx.fillStyle = mix(w.def.theme.wall, '#000000', 0.3);
  ctx.fillRect(0, BY - 1, W, 1);
  drawText(ctx, 'SC', 4, 3, GREY);
  drawText(ctx, pad(game.score, 7), 18, 3);
  drawText(ctx, `${NOTE_NAMES[w.def.root]} ${w.def.scale.name}`, 4, 13, YELLOW);

  if (w.opt.endless) {
    drawTextCentered(ctx, `NOTES ${pad(w.notesGot, 3)}`, 132, 3);
    drawTextCentered(ctx, `LEN ${pad(w.snake.length, 3)}`, 132, 13, GREY);
  } else drawStaff(ctx, w, 94, frame);

  const mode = game.mode.id;
  const label = mode === 'endless' ? 'DEPTH' : mode === 'classic' ? 'SPEED' : 'LV';
  const value = mode === 'classic' ? String(1 + Math.floor(w.notesGot / 5)) : pad(w.opt.number, 2);
  drawText(ctx, label, 252 - textWidth(`${label} ${value}`), 3, GREY);
  drawText(ctx, value, 252 - textWidth(value), 3);
  const lives = Math.max(0, game.lives - (w.state === 'dead' ? 1 : 0));
  if (lives > 4) {
    drawSprite(ctx, LIFE, 222, 13, { g: w.def.theme.skin[0], k: '#000', r: RED });
    drawText(ctx, `X${lives}`, 230, 13);
  } else
    for (let i = 0; i < lives; i++) drawSprite(ctx, LIFE, 246 - i * 8, 13, { g: w.def.theme.skin[0], k: '#000', r: RED });
  if (w.boosting && w.state === 'play' && (frame >> 2) % 2) drawText(ctx, 'X2', 190, 13, RED);
}

function drawIntro(ctx: Ctx, game: Game, w: World) {
  const f = w.def.features;
  const hints: [string, string][] = [];
  if (f.portals) hints.push(['PORTALS', '#3ee8f0']);
  if (f.gates) hints.push(['SHIFTING WALLS', LIGHT]);
  if (f.dark) hints.push(['DARKNESS', GREY]);
  if (f.thread) hints.push(["ARIADNE'S THREAD", GOLD]);
  if (f.minotaur) hints.push(['THE MINOTAUR', RED]);
  const h = 84 + hints.length * 10;
  const y0 = BY + Math.round((ROWS * 8 - h) / 2);
  drawBox(ctx, 36, y0, 184, h);
  const mode = game.mode.id;
  const head = mode === 'endless' ? `DEPTH ${w.opt.number}` : mode === 'classic' ? 'CLASSIC' : `LEVEL ${w.opt.number}`;
  drawTextCentered(ctx, head, 128, y0 + 10, GREY);
  drawTextCentered(ctx, w.def.name, 128, y0 + 22, YELLOW);
  drawTextCentered(ctx, `${NOTE_NAMES[w.def.root]} ${w.def.scale.name}`, 128, y0 + 36);
  const goal = w.opt.endless ? 'EAT ALL THE NOTES YOU CAN' : `EAT ${w.notesNeeded} NOTES`;
  drawTextCentered(ctx, goal, 128, y0 + 48, LIGHT);
  hints.forEach(([t, c], i) => drawTextCentered(ctx, t, 128, y0 + 62 + i * 10, c));
  // A bar that runs down until play starts.
  const left = 1 - Math.min(1, game.timer / INTRO_FRAMES);
  ctx.fillStyle = DARK;
  ctx.fillRect(56, y0 + h - 14, 144, 3);
  ctx.fillStyle = w.def.theme.skin[0];
  ctx.fillRect(56, y0 + h - 14, Math.round(144 * left), 3);
}

function drawPause(ctx: Ctx, game: Game, w: World) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, BY, W, ROWS * 8);
  drawBox(ctx, 52, 72, 152, 80);
  drawTextCentered(ctx, 'PAUSED', 128, 82, YELLOW);
  drawTextCentered(ctx, w.def.name, 128, 96);
  drawTextCentered(ctx, `LIVES ${game.lives}   LEN ${w.snake.length}`, 128, 108, GREY);
  drawTextCentered(ctx, 'ENTER RESUME', 128, 124, LIGHT);
  drawTextCentered(ctx, 'BKSP QUIT', 128, 136, GREY);
}

function drawCurtain(ctx: Ctx, game: Game, w: World, frame: number) {
  const rows = Math.min(ROWS, game.curtainRow);
  const wall = w.def.theme.wall;
  const hi = mix(wall, '#ffffff', 0.3), lo = mix(wall, '#000000', 0.45);
  for (let y = 0; y < rows; y++) {
    const py = BY + y * 8;
    ctx.fillStyle = wall;
    ctx.fillRect(0, py, W, 8);
    ctx.fillStyle = hi;
    for (let x = 0; x < COLS; x++) ctx.fillRect(x * 8 + (y % 2) * 4, py, 7, 1);
    ctx.fillStyle = lo;
    for (let x = 0; x < COLS; x++) ctx.fillRect(x * 8 + 7 + (y % 2) * 4, py, 1, 8);
    ctx.fillRect(0, py + 7, W, 1);
  }
  if (game.phase !== 'over') return;
  drawBox(ctx, 52, 64, 152, 96);
  drawTextCentered(ctx, 'GAME OVER', 128, 74, RED);
  const rows2: [string, string][] = [
    ['SCORE', String(game.score)],
    [game.mode.id === 'classic' ? 'NOTES' : game.mode.id === 'endless' ? 'DEPTH' : 'LEVEL', String(game.mode.id === 'classic' ? w.notesGot : w.opt.number)],
    ['LONGEST', String(game.maxLength)],
  ];
  rows2.forEach(([k, v], i) => {
    drawText(ctx, k, 66, 92 + i * 12, GREY);
    drawText(ctx, v, 190 - textWidth(v), 92 + i * 12);
  });
  if (game.timer > 30 && (frame >> 5) % 2 === 0) drawTextCentered(ctx, 'PRESS ENTER', 128, 144, LIGHT);
}

// ---------- title ----------

const LOGO = [
  ['###', '#..', '###', '..#', '###'],
  ['###', '#..', '#..', '#..', '###'],
  ['###', '#.#', '###', '#.#', '#.#'],
  ['#..', '#..', '#..', '#..', '###'],
  ['###', '#..', '##.', '#..', '###'],
  ['###', '#..', '###', '..#', '###'],
];
const LOGO_X = (W - (LOGO.length * 4 - 1) * 8) / 2;
const SKINS = QUEST.map((q) => q.theme.skin);

/** A point on the rectangle (x, y, w, h)'s perimeter, `d` pixels clockwise from the top-left. */
function perimeter(x: number, y: number, w: number, h: number, d: number): [number, number] {
  const p = 2 * (w + h);
  d = ((d % p) + p) % p;
  if (d < w) return [x + d, y];
  if (d < w + h) return [x + w, y + d - w];
  if (d < 2 * w + h) return [x + w - (d - w - h), y + h];
  return [x, y + h - (d - 2 * w - h)];
}

function renderTitle(ctx: Ctx, game: Game, frame: number) {
  const s = game.settings;
  const tw = game.titleWorld();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  drawBoard(ctx, tw, frame, 0, BY);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, W, H);

  drawBox(ctx, 24, 6, 208, 56);
  const skin = SKINS[s.mode === 0 ? s.start : 0];
  LOGO.forEach((letter, i) =>
    letter.forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (c !== '#') return;
        const px = LOGO_X + (i * 4 + x) * 8, py = 14 + y * 8;
        // A shimmer runs across the scales.
        const wave = (i * 4 + x + y - (frame >> 3)) % 12 === 0;
        ctx.fillStyle = wave ? WHITE : skin[0];
        ctx.fillRect(px, py, 7, 7);
        ctx.fillStyle = skin[1];
        for (let yy = 0; yy < 7; yy++) for (let xx = 0; xx < 7; xx++) if ((xx + (yy % 2) * 2) % 4 === 0) ctx.fillRect(px + xx, py + yy, 1, 1);
      }),
    ),
  );

  // A little snake patrols the logo frame.
  for (let k = 11; k >= 0; k--) {
    const [x, y] = perimeter(26, 8, 202, 50, frame * 0.8 - k * 5);
    ctx.fillStyle = k === 0 ? skin[0] : k % 2 ? skin[1] : skin[0];
    ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, k === 11 ? 3 : 4, k === 11 ? 3 : 4);
    if (k === 0) {
      ctx.fillStyle = '#000';
      ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 1, 1);
    }
  }

  drawBox(ctx, 16, 68, 224, 88);
  const mode = game.mode;
  const q = QUEST[s.start];
  const values: Record<(typeof MENU)[number], string> = {
    MODE: mode.name,
    START: mode.usesStart ? `${s.start + 1} ${q.name.replace(/^THE /, '')}` : '--',
    SPEED: `${s.speed + 1} ${SPEED_NAMES[s.speed]} X${SPEED_POINTS[s.speed]}`,
    SEED: mode.usesSeed ? (s.daily ? 'DAILY' : 'RANDOM') : '--',
    MUSIC: MUSIC_NAMES[s.music],
    HELP: 'HOW TO PLAY',
  };
  MENU.forEach((row, i) => {
    const y = 77 + i * 12;
    const on = i === game.menuRow;
    const enabled = game.rowEnabled(row);
    if (on) drawText(ctx, '>', 26, y, YELLOW);
    drawText(ctx, row, 36, y, on ? YELLOW : enabled ? WHITE : '#585858');
    const v = values[row];
    drawText(ctx, v, 90, y, !enabled ? '#585858' : on ? WHITE : LIGHT);
    if (on && enabled && row !== 'HELP') {
      drawText(ctx, '<', 82, y, GREY);
      drawText(ctx, '>', 92 + textWidth(v), y, GREY);
    }
  });

  drawBox(ctx, 8, 162, 240, 58);
  const best = game.best();
  drawTextCentered(ctx, best ? `TOP ${pad(best.score, 7)} ${best.name}` : 'NO RECORD YET', 128, 172, RED);
  if ((frame >> 5) % 2 === 0) drawTextCentered(ctx, 'ENTER START   H SCORES   M MUSIC', 128, 188);
  drawTextCentered(ctx, 'ARROWS TURN   SPACE BOOST', 128, 204, GREY);
}

// ---------- high scores ----------

function renderScores(ctx: Ctx, game: Game, frame: number) {
  const entering = game.phase === 'entry';
  const mode = MODES[game.scoresView];
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  drawBoard(ctx, game.world ?? game.titleWorld(), frame, 0, BY);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);

  drawBox(ctx, 24, 12, 208, 176);
  drawTextCentered(ctx, entering ? 'NEW RECORD!' : 'HIGH SCORES', 128, 20, entering ? YELLOW : WHITE);
  drawTextCentered(ctx, entering ? mode.name : `< ${mode.name} >`, 128, 32, LIGHT);
  const lvLabel = mode.id === 'classic' ? 'NT' : mode.id === 'endless' ? 'DP' : 'LV';
  const cols: [string, number][] = [['NAME', 50], ['SCORE', 94], [lvLabel, 146], ['LEN', 170], ['S', 200]];
  for (const [label, x] of cols) drawText(ctx, label, x, 44, GREY);
  ctx.fillStyle = '#585858';
  ctx.fillRect(34, 53, 188, 1);

  const list = game.tables[mode.id];
  const blink = (frame >> 4) % 2 === 0;
  for (let i = 0; i < MAX_SCORES; i++) {
    const y = 58 + i * 12;
    const e = list[i];
    const mine = i === game.entryRank && game.scoresView === game.settings.mode;
    const color = mine ? (entering || blink ? YELLOW : WHITE) : i < 3 ? WHITE : LIGHT;
    const n = String(i + 1);
    drawText(ctx, n, 45 - textWidth(n), y, mine ? color : GREY);
    if (!e) {
      drawText(ctx, '------', 50, y, DARK);
      continue;
    }
    if (mine && entering) {
      drawText(ctx, game.entryName.join(''), 50, y, color);
      if (blink) {
        ctx.fillStyle = WHITE;
        ctx.fillRect(50 + game.entryCursor * 6, y + 8, 5, 1);
      }
    } else drawText(ctx, e.name.slice(0, NAME_LEN), 50, y, color);
    drawText(ctx, pad(e.score, 7), 94, y, color);
    drawText(ctx, pad(e.level, 2), 146, y, color);
    drawText(ctx, pad(e.length, 3), 170, y, color);
    drawText(ctx, String(e.speed), 200, y, GREY);
  }

  drawBox(ctx, 24, 194, 208, 24);
  if (entering) drawTextCentered(ctx, 'TYPE NAME  THEN ENTER', 128, 202);
  else drawTextCentered(ctx, '< > MODE    ENTER BACK', 128, 202, blink ? WHITE : LIGHT);
}

// ---------- help ----------

function renderHelp(ctx: Ctx, game: Game, frame: number) {
  const page = HELP_PAGES[game.helpPage];
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  drawBoard(ctx, game.titleWorld(), frame, 0, BY);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);
  drawBox(ctx, 16, 8, 224, 182);
  drawTextCentered(ctx, `< ${page.title} >`, 128, 16, YELLOW);
  ctx.fillStyle = '#585858';
  ctx.fillRect(26, 27, 204, 1);
  wrapText(page.text, 34).forEach((line, i) => drawText(ctx, line, 26, 34 + i * 10));
  drawBox(ctx, 16, 194, 224, 24);
  const blink = (frame >> 4) % 2 === 0;
  drawTextCentered(ctx, `< > PAGE ${game.helpPage + 1}/${HELP_PAGES.length}    ENTER BACK`, 128, 202, blink ? WHITE : LIGHT);
}

// ---------- ending: the ouroboros ----------

const STARS = Array.from({ length: 70 }, (_, i) => [(i * 97 + 13) % W, (i * 53 + 7) % H, i % 5] as const);

function renderEnding(ctx: Ctx, game: Game, frame: number) {
  const t = game.timer;
  ctx.fillStyle = '#06061a';
  ctx.fillRect(0, 0, W, H);
  for (const [x, y, k] of STARS) {
    ctx.fillStyle = (frame + k * 7) % 40 < 4 ? '#585858' : k === 0 ? WHITE : LIGHT;
    ctx.fillRect(x, y, 1, 1);
  }
  // The snake coils into a ring and takes its own tail.
  const n = 44;
  const shown = Math.min(n, Math.floor(t / 3));
  const spin = t * 0.012;
  const R = 52;
  const [c1, c2] = QUEST[QUEST.length - 1].theme.skin;
  for (let i = shown - 1; i >= 0; i--) {
    const a = spin - (i / n) * Math.PI * 2 * 0.97;
    const x = Math.round(128 + Math.cos(a) * R) - 3;
    const y = Math.round(104 + Math.sin(a) * R) - 3;
    ctx.fillStyle = i === 0 ? GOLD : i % 2 ? c2 : c1;
    ctx.fillRect(x, y, i === 0 ? 8 : 6, i === 0 ? 8 : 6);
    if (i === 0) {
      ctx.fillStyle = '#000';
      ctx.fillRect(x + 2, y + 2, 1, 1);
      ctx.fillRect(x + 5, y + 2, 1, 1);
    }
  }
  for (const p of game.particles) {
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size + 1, p.size + 1);
  }
  const c = ['#fcfcfc', YELLOW, '#58f8f8', '#f878f8'][(frame >> 3) % 4];
  drawTextCentered(ctx, 'OUROBOROS', 128, 100, c);
  if (t > 40) {
    drawTextCentered(ctx, 'YOU FOUND THE HEART', 128, 12, WHITE);
    drawTextCentered(ctx, 'OF THE LABYRINTH', 128, 22, WHITE);
  }
  if (t > 80) drawTextCentered(ctx, `SCORE ${pad(game.score, 7)}`, 128, 176, YELLOW);
  if (t > 120 && (frame >> 5) % 2 === 0) {
    drawTextCentered(ctx, 'ENTER: THE LABYRINTH TURNS', 128, 194, LIGHT);
    drawTextCentered(ctx, 'AND GOES ON, FASTER', 128, 204, LIGHT);
  }
}

