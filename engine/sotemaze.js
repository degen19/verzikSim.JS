// Sotetseg's maze: how the path is made and the best route through it - ported from devqhp's Sotetseg maze trainer
// (https://devqhp.github.io/osrs/sotetseg/, rules worked out from shared mazes). Coordinates: x = column 0-13 from the
// west, y = row 0-14 from the top (row 14 = "A", the row players come on at; row 1 = "N"; row 0 = the last).
export const MAZE_W = 14, MAZE_H = 15, MAX_X_CHANGE = 5, PATH_TURNS = 8;

/** A maze seed: 8 columns - the first (1-13: never the far west column), each next within 5 of the one before. */
export function mazeSeed(rng) {
  const s = [rng.randint(1, MAZE_W - 1)];
  for (let i = 1; i < PATH_TURNS; i++) s.push(rng.randint(Math.max(s[i - 1] - MAX_X_CHANGE, 0), Math.min(s[i - 1] + MAX_X_CHANGE, MAZE_W - 1)));
  return s;
}

/** The safe tiles (tiles[x][y]): odd rows run sideways from one seed column to the next, even rows are one tile. */
export function mazeTiles(seed) {
  const m = Array.from({ length: MAZE_W }, () => Array(MAZE_H).fill(false));
  let s = 0, x = seed[0];
  for (let y = MAZE_H - 1; y >= 0; y--) {
    if (y % 2) { const nx = seed[++s]; for (let i = Math.min(x, nx); i <= Math.max(x, nx); i++) m[i][y] = true; x = nx; } else m[x][y] = true;
  }
  return m;
}

/** Each path tile's order along the path (1 = the first tile on row 14). */
function pathOrder(m, seed) {
  const w = Array.from({ length: MAZE_W }, () => Array(MAZE_H).fill(0));
  let c = { x: seed[0], y: MAZE_H - 1 }, prev = { x: -1, y: -1 }, n = 1;
  while (c) {
    w[c.x][c.y] = n++;
    const nb = [[c.x, c.y + 1], [c.x + 1, c.y], [c.x, c.y - 1], [c.x - 1, c.y]]
      .find(([x, y]) => x >= 0 && x < MAZE_W && y >= 0 && y < MAZE_H && m[x][y] && !(x === prev.x && y === prev.y));
    prev = c; c = nb ? { x: nb[0], y: nb[1] } : null;
  }
  return w;
}

/** The tiles walked through on a move of up to 2 (diagonal first, then straight - as in game). */
function passed(a, b) {
  const c = { ...a }, r = [];
  while (r.length < 2 && !(c.x === b.x && c.y === b.y)) {
    const dx = b.x - c.x, dy = b.y - c.y;
    if (Math.abs(dx) === Math.abs(dy)) { c.x += Math.sign(dx); c.y += Math.sign(dy); } else if (Math.abs(dx) > Math.abs(dy)) c.x += Math.sign(dx); else c.y += Math.sign(dy);
    r.push({ ...c });
  }
  return r;
}

/** The best route (the trainer's): each tick, the safe tile furthest along the path that a move of up to 2 tiles
 *  reaches without crossing a wrong tile. Returns the positions tick by tick, from the first tile (index 0). */
export function bestRoute(m, seed) {
  const w = pathOrder(m, seed);
  const ok = (a, b) => b.x >= 0 && b.x < MAZE_W && b.y >= 0 && b.y < MAZE_H && m[b.x][b.y] && passed(a, b).every((p) => m[p.x][p.y]);
  const pos = [{ x: seed[0], y: MAZE_H - 1 }];
  while (pos[pos.length - 1].y > 0) {
    const c = pos[pos.length - 1]; let best = null, bs = -1;
    for (const [dx, dy] of [[-2, -2], [-1, -2], [0, -2], [1, -2], [2, -2], [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1], [-2, 0], [-1, 0], [1, 0], [2, 0]]) {
      const t = { x: c.x + dx, y: c.y + dy };
      if (ok(c, t) && w[t.x][t.y] > bs) { best = t; bs = w[t.x][t.y]; }
    }
    pos.push(best);
  }
  return pos;
}

/** A rolled maze: {seed, start (first tile's column), route (positions by tick), ticks (moves to the last row),
 *  toN (moves until on row 1 "N" or past it)}. */
export function rollMaze(rng) {
  const seed = mazeSeed(rng), route = bestRoute(mazeTiles(seed), seed);
  return { seed, start: seed[0], route, ticks: route.length - 1, toN: route.findIndex((p) => p.y <= 1) };
}

// ---- running the maze (from the proc tick T; everyone's first move on T+5)
/** Under player: teleported to column 6, two south of row A - ticks to the first tile by its column. */
export const underToStart = (col) => (col >= 4 && col <= 8 ? 1 : col <= 3 || col <= 11 ? 2 : 3);
/** Runners (after south of 3A on T+5, south of 5A on T+6): ticks from beside 5A to the first tile by its column. */
export const runnersToStart = (col) => (col >= 3 && col <= 7 ? 1 : (col <= 2 || col <= 9) ? 2 : col <= 11 ? 3 : 4);
