import { LEDGER_PAGES } from "./lore.js";

export const TILE_SIZE = 44;
export const COLS = 58;
export const ROWS = 58;

// Csejte Castle: six connected wings. Rects are inclusive tile ranges.
export const ROOMS = [
  { key: "ward", name: "Outer Ward", x0: 3, y0: 36, x1: 54, y1: 43, floor: "cobble" },
  { key: "chapel", name: "Chapel of St. Ladislaus", x0: 3, y0: 21, x1: 16, y1: 32, floor: "floor" },
  { key: "kitchens", name: "Kitchens & Cellars", x0: 41, y0: 21, x1: 54, y1: 32, floor: "kitchen" },
  { key: "hall", name: "Great Hall", x0: 20, y0: 18, x1: 37, y1: 32, floor: "floor" },
  { key: "torture", name: "Torture Gallery", x0: 3, y0: 3, x1: 19, y1: 15, floor: "blood" },
  { key: "north", name: "North Gate Court", x0: 24, y0: 3, x1: 53, y1: 13, floor: "cobble" },
  // Sealed puzzle chambers south of the Outer Ward (v0.5)
  { key: "candles", name: "Chamber of Candles", x0: 9, y0: 47, x1: 17, y1: 55, floor: "floor", sealed: true },
  { key: "crush", name: "Crushing Hall", x0: 40, y0: 47, x1: 44, y1: 55, floor: "blood", sealed: true }
];

const CORRIDORS = [
  [27, 33, 30, 35], [8, 33, 10, 35], [46, 33, 48, 35], // ward -> hall / chapel / kitchens
  [17, 25, 19, 27], [38, 25, 40, 27], // chapel <-> hall <-> kitchens
  [27, 14, 30, 17], // hall -> north court
  [20, 7, 23, 9], // torture <-> north court
  [8, 16, 10, 20], // torture <-> chapel
  [47, 14, 49, 20], // north court <-> kitchens (cellar stair)
  [38, 1, 40, 2], // gate passage
  [13, 44, 13, 45], [42, 44, 42, 45] // ward -> locked chamber doors
];

const PILLARS = [[23, 21], [33, 21], [23, 29], [33, 29], [12, 38], [21, 38], [36, 38], [45, 38], [30, 6], [44, 6]];
const PARTITIONS = [[11, 3, 11, 10], [41, 26, 47, 26]];

// Low solid props (block movement, not sight). type -> tiles
const PROP_DEFS = {
  pew: [[5, 25], [6, 25], [7, 25], [12, 25], [13, 25], [14, 25], [5, 27], [6, 27], [7, 27], [12, 27], [13, 27], [14, 27], [5, 29], [6, 29], [7, 29], [12, 29], [13, 29], [14, 29]],
  altar: [[8, 21], [9, 21], [10, 21]],
  table: [[43, 28], [44, 28], [45, 28], [46, 28], [25, 27], [26, 27], [27, 27], [30, 27], [31, 27], [32, 27]],
  cauldron: [[53, 25]],
  throne: [[28, 18]],
  cage: [[13, 8], [17, 8], [7, 7]],
  rack: [[5, 11], [6, 11]],
  statue: [[32, 4], [46, 4], [26, 9]],
  well: [[16, 41]]
};

// Breakable crates & barrels (smash with your weapon; each rolls a prize).
export const BREAKABLE_DEFS = [
  // Kitchens & cellars
  ["barrel", 41, 21], ["barrel", 42, 21], ["barrel", 46, 21], ["barrel", 47, 24], ["barrel", 54, 32], ["barrel", 53, 32], ["crate", 54, 22],
  // Outer Ward
  ["crate", 26, 37], ["crate", 31, 37], ["crate", 50, 40], ["crate", 4, 37], ["barrel", 54, 43], ["barrel", 3, 43], ["crate", 19, 43],
  // Chapel
  ["crate", 15, 31], ["barrel", 3, 32],
  // Great Hall
  ["crate", 21, 19], ["barrel", 37, 32], ["crate", 36, 23],
  // Torture Gallery
  ["barrel", 4, 4], ["crate", 18, 13],
  // North Gate Court
  ["crate", 25, 4], ["barrel", 53, 4], ["crate", 35, 12]
];

// Locked puzzle chambers — keys drop at 15 and 30 kills.
export const LOCKED_ROOMS = [
  {
    key: "candles", keyNo: 1, numeral: "I", name: "Chamber of Candles",
    door: [13, 46],
    riddleTitle: "The Hours of Csejte",
    riddle: [
      "The bright one wakes upon the tower;",
      "the bronze one tolls the noonday hour;",
      "the red one, thorned, is cut for her bower;",
      "at dusk the iron tooth bites the door;",
      "the pale one climbs above the moor;",
      "and last, the grinning one beneath the floor.",
      "",
      "Light them as the day is spent."
    ],
    // Six candles in a ring around (13,51); the signs are scrambled around the circle.
    candles: [["moon", 13, 49], ["sun", 15, 50], ["skull", 15, 52], ["rose", 13, 53], ["key", 11, 52], ["bell", 11, 50]],
    order: ["sun", "bell", "rose", "key", "moon", "skull"]
  },
  {
    key: "crush", keyNo: 2, numeral: "II", name: "Crushing Hall",
    door: [42, 46],
    riddleTitle: "The Walls Remember",
    riddle: [
      "Every breath begins the end —",
      "so first, the one you cannot hold.",
      "What burns must come before what drowns it.",
      "The ground you'll die on, press it last.",
      "",
      "Four plates. One order.",
      "The stone is patient. You are not."
    ],
    plates: [["earth", 42, 48], ["water", 42, 50], ["air", 42, 52], ["fire", 42, 54]],
    order: ["air", "fire", "water", "earth"],
    closeSecs: 40
  }
];

export const PUZZLE_GLYPHS = {
  sun: "SUN", bell: "BELL", rose: "ROSE", key: "KEY", moon: "MOON", skull: "SKULL",
  air: "AIR", fire: "FIRE", water: "WATER", earth: "EARTH"
};

const FEATURES = {
  player: [28, 41],
  countess: [28, 24],
  exit: [39, 0],
  pages: [[5, 5], [9, 23], [44, 23], [28, 19], [51, 5]],
  alcoves: [[15, 37], [41, 42], [4, 31], [53, 30], [21, 31], [36, 19], [18, 4], [12, 14], [25, 12], [52, 12]],
  braziers: [[24, 40], [33, 40], [6, 42], [51, 37], [14, 23], [43, 31], [26, 24], [31, 24], [6, 14], [15, 5], [34, 10], [46, 7]],
  glass: [[18, 42], [40, 39], [29, 31], [13, 12], [40, 8], [11, 28], [50, 24]],
  mirrors: [
    // Sparse world finds: most mirrors now drop from slain servants.
    ["cracked", 22, 41],  // Outer Ward, near the start
    ["cracked", 4, 23],   // Chapel
    ["cracked", 50, 10],  // North Gate Court, east
    ["silver", 16, 13],   // Torture / north corridor
    ["obsidian", 9, 4]    // Torture Gallery — the only placed Obsidian
  ],
  bolts: [[31, 42], [12, 36], [15, 29], [42, 29], [24, 31], [17, 10], [33, 4], [48, 11]],
  spawns: [[7, 31], [15, 22], [52, 27], [42, 22], [4, 14], [17, 12], [7, 4], [27, 4], [50, 10], [42, 12], [36, 31], [21, 25], [5, 38], [52, 42]],
  waypoints: [[28, 24], [22, 20], [35, 31], [10, 40], [45, 40], [28, 38], [10, 26], [47, 29], [6, 9], [16, 5], [31, 10], [48, 9], [39, 5], [20, 41], [37, 42]]
};

export const MIRROR_TIERS = {
  cracked: { key: "cracked", name: "Cracked Hand Mirror", secs: 3, color: 0x9aa3ad, css: "#aab3bd", glyph: "◐" },
  silver: { key: "silver", name: "Silver Vanity Mirror", secs: 6, color: 0xd8e4f0, css: "#e4eef8", glyph: "◯" },
  gilded: { key: "gilded", name: "Gilded Venetian Mirror", secs: 10, color: 0xe7c873, css: "#e7c873", glyph: "✦" },
  obsidian: { key: "obsidian", name: "Obsidian Scrying Mirror", secs: 15, color: 0x9a4dff, css: "#b27bff", glyph: "◆", repel: true }
};

export const SECRET_DOORS = [
  {
    key: "chapel-hall",
    name: "Chapel Passage",
    item: "candelabra",
    itemName: "iron candelabra",
    hint: "The candelabra is bolted slightly off-true.",
    openText: "The wall behind the candelabra grinds aside!",
    itemTx: 16, itemTy: 22,
    tiles: [[17, 22], [18, 22], [19, 22]]
  },
  {
    key: "torture-chapel",
    name: "Bone Stair",
    item: "skull",
    itemName: "yellowed skull",
    hint: "A skull is set into a loose stone.",
    openText: "The skull sinks — a hidden way yawns open!",
    itemTx: 16, itemTy: 15,
    tiles: [[16, 16], [16, 17], [16, 18], [16, 19], [16, 20]]
  },
  {
    key: "hall-north",
    name: "Portrait Passage",
    item: "portrait",
    itemName: "faded portrait",
    hint: "The portrait hangs a finger's width from the stone.",
    openText: "The portrait swings — stone slides into the dark!",
    itemTx: 33, itemTy: 18,
    tiles: [[33, 17], [33, 16], [33, 15], [33, 14]]
  }
];

export const MIRROR_ORDER = ["obsidian", "gilded", "silver", "cracked"];

function rawGrid() {
  const g = [];
  for (let y = 0; y < ROWS; y++) g.push(new Array(COLS).fill(1));
  const carve = (x0, y0, x1, y1, v = 0) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = v;
  };
  for (const r of ROOMS) carve(r.x0, r.y0, r.x1, r.y1);
  for (const c of CORRIDORS) carve(...c);
  for (const [x, y] of PILLARS) carve(x, y, x + 1, y + 1, 1);
  for (const p of PARTITIONS) carve(...p, 1);
  return g;
}

export function createLevel() {
  const grid = rawGrid();
  const center = (tx, ty) => ({ x: (tx + 0.5) * TILE_SIZE, y: (ty + 0.5) * TILE_SIZE });

  const props = [];
  for (const [type, tiles] of Object.entries(PROP_DEFS)) {
    for (const [tx, ty] of tiles) {
      grid[ty][tx] = 3;
      props.push({ type, tx, ty });
    }
  }
  const center0 = (tx, ty) => ({ x: (tx + 0.5) * TILE_SIZE, y: (ty + 0.5) * TILE_SIZE });
  const breakables = BREAKABLE_DEFS.map(([type, tx, ty], i) => {
    grid[ty][tx] = 3;
    return { id: i, type, tx, ty, ...center0(tx, ty), hp: type === "barrel" ? 2 : 3, maxHp: type === "barrel" ? 2 : 3, broken: false, hitT: 0 };
  });
  const lockedRooms = LOCKED_ROOMS.map((d) => {
    const room = ROOMS.find((r) => r.key === d.key);
    const [dx, dy] = d.door;
    grid[dy][dx] = 1;
    const items = (d.candles || d.plates).map(([sym, tx, ty], i) => {
      grid[ty][tx] = 3;
      return { i, sym, tx, ty, ...center0(tx, ty), lit: false, pressed: false };
    });
    return {
      ...d, room, items, doorX: center0(dx, dy).x, doorY: center0(dx, dy).y,
      unlocked: false, doorOpen: false, active: false, solved: false, progress: 0,
      wallInset: 0, failCount: 0
    };
  });
  const [ex, ey] = FEATURES.exit;
  grid[ey][ex] = 2;

  const roomGrid = new Int8Array(COLS * ROWS).fill(-1);
  ROOMS.forEach((r, i) => {
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) roomGrid[y * COLS + x] = i;
  });

  const pages = FEATURES.pages.map(([tx, ty], i) => ({ id: i, tx, ty, ...center(tx, ty), collected: false, lore: LEDGER_PAGES[i] }));
  const alcoves = FEATURES.alcoves.map(([tx, ty]) => ({ tx, ty, ...center(tx, ty) }));
  const braziers = FEATURES.braziers.map(([tx, ty]) => ({ tx, ty, ...center(tx, ty) }));
  const glass = FEATURES.glass.map(([tx, ty]) => ({ tx, ty, ...center(tx, ty), cooldown: 0 }));
  const mirrors = FEATURES.mirrors.map(([tier, tx, ty], i) => ({ id: i, tier, tx, ty, ...center(tx, ty), collected: false }));
  const bolts = FEATURES.bolts.map(([tx, ty], i) => ({ id: i, tx, ty, ...center(tx, ty), collected: false }));
  const spawns = FEATURES.spawns.map(([tx, ty]) => ({ tx, ty, ...center(tx, ty) }));
  const wellTile = PROP_DEFS.well[0];
  const well = { tx: wellTile[0], ty: wellTile[1], ...center(...wellTile) };
  const secrets = SECRET_DOORS.map((d) => ({
    ...d,
    itemX: center(d.itemTx, d.itemTy).x,
    itemY: center(d.itemTx, d.itemTy).y,
    opened: false,
    opening: 0
  }));

  return {
    rows: ROWS,
    cols: COLS,
    width: COLS * TILE_SIZE,
    height: ROWS * TILE_SIZE,
    grid,
    roomGrid,
    rooms: ROOMS,
    props,
    pages,
    alcoves,
    braziers,
    glass,
    mirrors,
    bolts,
    spawns,
    playerSpawn: center(...FEATURES.player),
    countessSpawn: center(...FEATURES.countess),
    exitTile: { tx: ex, ty: ey, ...center(ex, ey) },
    waypoints: FEATURES.waypoints.map(([tx, ty]) => center(tx, ty)),
    well,
    secrets,
    breakables,
    lockedRooms
  };
}

export function openSecret(level, secret) {
  if (secret.opened) return false;
  secret.opened = true;
  secret.opening = 1;
  for (const [tx, ty] of secret.tiles) {
    if (level.grid[ty] && level.grid[ty][tx] === 1) level.grid[ty][tx] = 0;
  }
  return true;
}

export function setDoor(level, lr, open) {
  const [dx, dy] = lr.door;
  level.grid[dy][dx] = open ? 0 : 1;
  lr.doorOpen = open;
}

export function roomAt(level, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= level.cols || ty >= level.rows) return null;
  const i = level.roomGrid[ty * level.cols + tx];
  return i >= 0 ? level.rooms[i] : null;
}

// Sight test: walls (1) and a sealed gate block; low props (3) do not.
export function isWallAtWorld(level, wx, wy, gateOpen = false) {
  const tx = Math.floor(wx / TILE_SIZE);
  const ty = Math.floor(wy / TILE_SIZE);
  if (ty < 0 || ty >= level.rows || tx < 0 || tx >= level.cols) return true;
  const cell = level.grid[ty][tx];
  return cell === 1 || (cell === 2 && !gateOpen);
}

export function isPassableTile(level, tx, ty, gateOpen = false) {
  if (ty < 0 || ty >= level.rows || tx < 0 || tx >= level.cols) return false;
  const c = level.grid[ty][tx];
  return c === 0 || (c === 2 && gateOpen);
}

export function resolveCircleWallCollision(level, entity, radius, gateOpen = false) {
  const minTx = Math.max(0, Math.floor((entity.x - radius) / TILE_SIZE) - 1);
  const maxTx = Math.min(level.cols - 1, Math.floor((entity.x + radius) / TILE_SIZE) + 1);
  const minTy = Math.max(0, Math.floor((entity.y - radius) / TILE_SIZE) - 1);
  const maxTy = Math.min(level.rows - 1, Math.floor((entity.y + radius) / TILE_SIZE) + 1);
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      const cell = level.grid[ty][tx];
      const solid = cell === 1 || cell === 3 || (cell === 2 && !gateOpen);
      if (!solid) continue;
      const rx = tx * TILE_SIZE;
      const ry = ty * TILE_SIZE;
      const closestX = Math.max(rx, Math.min(entity.x, rx + TILE_SIZE));
      const closestY = Math.max(ry, Math.min(entity.y, ry + TILE_SIZE));
      const dx = entity.x - closestX;
      const dy = entity.y - closestY;
      const distSq = dx * dx + dy * dy;
      if (distSq < radius * radius) {
        if (distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const overlap = radius - dist;
          entity.x += (dx / dist) * overlap;
          entity.y += (dy / dist) * overlap;
        } else {
          // centre inside a solid tile: push out toward tile centre's opposite
          const cx = rx + TILE_SIZE / 2;
          const cy = ry + TILE_SIZE / 2;
          const ax = entity.x - cx || 0.01;
          const ay = entity.y - cy;
          if (Math.abs(ax) > Math.abs(ay)) entity.x = ax > 0 ? rx + TILE_SIZE + radius : rx - radius;
          else entity.y = ay > 0 ? ry + TILE_SIZE + radius : ry - radius;
        }
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
    if (isWallAtWorld(level, x1 + dx * t, y1 + dy * t, true)) return false;
  }
  return true;
}

// Breadth-first distance fields for steering around the castle's walls.
export class Pathing {
  constructor(level) {
    this.level = level;
    this.cache = new Map();
  }

  invalidate() {
    this.cache.clear();
  }

  field(tx, ty) {
    const key = ty * this.level.cols + tx;
    let f = this.cache.get(key);
    if (f) {
      this.cache.delete(key);
      this.cache.set(key, f);
      return f;
    }
    const { cols, rows } = this.level;
    f = new Int16Array(cols * rows).fill(-1);
    const q = new Int32Array(cols * rows);
    let head = 0;
    let tail = 0;
    if (tx >= 0 && ty >= 0 && tx < cols && ty < rows) {
      f[key] = 0;
      q[tail++] = key;
    }
    while (head < tail) {
      const i = q[head++];
      const x = i % cols;
      const y = (i - x) / cols;
      const d = f[i] + 1;
      const nb = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
      for (const [nx, ny] of nb) {
        if (!isPassableTile(this.level, nx, ny)) continue;
        const ni = ny * cols + nx;
        if (f[ni] !== -1) continue;
        f[ni] = d;
        q[tail++] = ni;
      }
    }
    this.cache.set(key, f);
    if (this.cache.size > 40) this.cache.delete(this.cache.keys().next().value);
    return f;
  }

  // Unit direction from (x,y) toward (tx,ty) world point, routing around walls.
  steer(x, y, gx, gy) {
    const level = this.level;
    const dxg = gx - x;
    const dyg = gy - y;
    const dist = Math.hypot(dxg, dyg) || 1;
    if (dist < TILE_SIZE * 6 && hasLineOfSight(level, x, y, gx, gy)) {
      return { x: dxg / dist, y: dyg / dist, dist };
    }
    const gtx = Math.floor(gx / TILE_SIZE);
    const gty = Math.floor(gy / TILE_SIZE);
    const f = this.field(gtx, gty);
    const cx = Math.floor(x / TILE_SIZE);
    const cy = Math.floor(y / TILE_SIZE);
    const cols = level.cols;
    const here = f[cy * cols + cx];
    let best = null;
    let bestD = here === -1 ? 1e9 : here;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [ox, oy] of dirs) {
      const nx = cx + ox;
      const ny = cy + oy;
      if (!isPassableTile(level, nx, ny)) continue;
      if (ox && oy && (!isPassableTile(level, cx + ox, cy) || !isPassableTile(level, cx, cy + oy))) continue;
      const d = f[ny * cols + nx];
      if (d === -1) continue;
      const score = d + (ox && oy ? 0.4 : 0);
      if (score < bestD) {
        bestD = score;
        best = [nx, ny];
      }
    }
    if (!best) return { x: dxg / dist, y: dyg / dist, dist };
    const tx = (best[0] + 0.5) * TILE_SIZE - x;
    const ty = (best[1] + 0.5) * TILE_SIZE - y;
    const l = Math.hypot(tx, ty) || 1;
    return { x: tx / l, y: ty / l, dist };
  }
}
