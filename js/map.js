import { LEDGER_PAGES } from "./lore.js";

export const TILE_SIZE = 44;

const RAW_MAP = [
  "############E#############",
  "#.....#............#.....#",
  "#.P...#...H....B...#...P.#",
  "#..##.#............#.##..#",
  "#........G......G........#",
  "###.###..###..###..###.###",
  "#.....#............#.....#",
  "#.H...#.....C......#...H.#",
  "#.....G............G.....#",
  "#..#.....###..###.....#..#",
  "#..#..B..#......#..P..#..#",
  "#........#..P...#........#",
  "###.###..###..###..###.###",
  "#.....#............#.....#",
  "#.P...#.....H......#.....#",
  "#..#..G............G..#..#",
  "#..#........B.........#..#",
  "#.....###........###.....#",
  "#...........S............#",
  "##########################"
];

export const PATROL_WAYPOINTS = [
  { tx: 12, ty: 7 },
  { tx: 8, ty: 4 },
  { tx: 4, ty: 4 },
  { tx: 3, ty: 8 },
  { tx: 8, ty: 10 },
  { tx: 8, ty: 15 },
  { tx: 17, ty: 15 },
  { tx: 21, ty: 11 },
  { tx: 21, ty: 4 },
  { tx: 17, ty: 4 },
  { tx: 13, ty: 3 }
];

export function createLevel() {
  const rows = RAW_MAP.length;
  const cols = RAW_MAP[0].length;
  const grid = [];
  const pages = [];
  const alcoves = [];
  const braziers = [];
  const glass = [];

  let playerSpawn = { x: 12.5 * TILE_SIZE, y: 18.5 * TILE_SIZE };
  let countessSpawn = { x: 12.5 * TILE_SIZE, y: 7.5 * TILE_SIZE };
  let exitTile = { tx: 12, ty: 0, x: 12.5 * TILE_SIZE, y: 0.5 * TILE_SIZE };

  let pageIndex = 0;

  for (let y = 0; y < rows; y++) {
    const row = [];
    for (let x = 0; x < cols; x++) {
      const ch = RAW_MAP[y][x];
      const cx = (x + 0.5) * TILE_SIZE;
      const cy = (y + 0.5) * TILE_SIZE;

      if (ch === "#") {
        row.push(1);
      } else if (ch === "E") {
        row.push(2); // sealed gate until 5 pages found
        exitTile = { tx: x, ty: y, x: cx, y: cy };
      } else {
        row.push(0);
        if (ch === "S") playerSpawn = { x: cx, y: cy };
        if (ch === "C") countessSpawn = { x: cx, y: cy };
        if (ch === "P" && pageIndex < LEDGER_PAGES.length) {
          pages.push({
            id: pageIndex,
            x: cx,
            y: cy,
            collected: false,
            lore: LEDGER_PAGES[pageIndex]
          });
          pageIndex++;
        }
        if (ch === "H") {
          alcoves.push({ x: cx, y: cy, tx: x, ty: y });
        }
        if (ch === "B") {
          braziers.push({ x: cx, y: cy, tx: x, ty: y });
        }
        if (ch === "G") {
          glass.push({ x: cx, y: cy, tx: x, ty: y, cooldown: 0 });
        }
      }
    }
    grid.push(row);
  }

  return {
    rows,
    cols,
    width: cols * TILE_SIZE,
    height: rows * TILE_SIZE,
    grid,
    pages,
    alcoves,
    braziers,
    glass,
    playerSpawn,
    countessSpawn,
    exitTile,
    waypoints: PATROL_WAYPOINTS.map((w) => ({
      x: (w.tx + 0.5) * TILE_SIZE,
      y: (w.ty + 0.5) * TILE_SIZE
    }))
  };
}

export function isWallAtWorld(level, wx, wy, gateOpen = false) {
  const tx = Math.floor(wx / TILE_SIZE);
  const ty = Math.floor(wy / TILE_SIZE);
  if (ty < 0 || ty >= level.rows || tx < 0 || tx >= level.cols) return true;
  const cell = level.grid[ty][tx];
  if (cell === 1) return true;
  if (cell === 2 && !gateOpen) return true;
  return false;
}

export function resolveCircleWallCollision(level, entity, radius, gateOpen = false) {
  const minTx = Math.max(0, Math.floor((entity.x - radius) / TILE_SIZE) - 1);
  const maxTx = Math.min(level.cols - 1, Math.floor((entity.x + radius) / TILE_SIZE) + 1);
  const minTy = Math.max(0, Math.floor((entity.y - radius) / TILE_SIZE) - 1);
  const maxTy = Math.min(level.rows - 1, Math.floor((entity.y + radius) / TILE_SIZE) + 1);

  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      const cell = level.grid[ty][tx];
      const solid = cell === 1 || (cell === 2 && !gateOpen);
      if (!solid) continue;

      const rx = tx * TILE_SIZE;
      const ry = ty * TILE_SIZE;
      const closestX = Math.max(rx, Math.min(entity.x, rx + TILE_SIZE));
      const closestY = Math.max(ry, Math.min(entity.y, ry + TILE_SIZE));
      const dx = entity.x - closestX;
      const dy = entity.y - closestY;
      const distSq = dx * dx + dy * dy;

      if (distSq < radius * radius && distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        const overlap = radius - dist;
        entity.x += (dx / dist) * overlap;
        entity.y += (dy / dist) * overlap;
      }
    }
  }
}

export function hasLineOfSight(level, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  const steps = Math.ceil(dist / 10);
  if (steps <= 1) return true;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (isWallAtWorld(level, x1 + dx * t, y1 + dy * t, true)) {
      return false;
    }
  }
  return true;
}
