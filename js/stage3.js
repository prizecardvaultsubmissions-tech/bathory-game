import { TOWER_SEALS } from "./lore.js";

// Stage III — The Climb. Six floors of the Countess's tower, from the wine vaults to the battlements.
// Each floor is its own walled block on the 58x58 grid; stairs carry you between them.
// Bottom row (y25..44): F1 Cellar -> F2 Torture -> F3 Servants. Top row (y2..21): F4 Library -> F5 Bedchamber -> F6 Tower Top.
// Rects are inclusive tile ranges.

export const FLOORS = [
  { n: 1, key: "cellar", numeral: "I", name: "The Cellar & Wine Vaults", short: "CELLAR", x0: 2, y0: 25, x1: 17, y1: 44,
    hemi: [0x6a5038, 0x140c08, 1.5], grade: [[1.1, 0.96, 0.84], [0.014, 0.004, 0.0], 1.0], fog: 0x0c0806, aggro: 1.0 },
  { n: 2, key: "torture", numeral: "II", name: "The Torture Chambers", short: "TORTURE", x0: 21, y0: 25, x1: 36, y1: 56,
    hemi: [0x6a2a30, 0x180608, 1.6], grade: [[1.12, 0.9, 0.88], [0.02, 0.0, 0.004], 1.05], fog: 0x120406, aggro: 1.08 },
  { n: 3, key: "servants", numeral: "III", name: "The Servants' Floor", short: "SERVANTS", x0: 40, y0: 25, x1: 55, y1: 56,
    hemi: [0x6a6250, 0x14120c, 1.7], grade: [[1.04, 1.0, 0.92], [0.008, 0.006, 0.004], 0.92], fog: 0x0c0a08, aggro: 1.16 },
  { n: 4, key: "library", numeral: "IV", name: "The Library & Study", short: "LIBRARY", x0: 40, y0: 2, x1: 55, y1: 21,
    hemi: [0x4a6a50, 0x0c140e, 1.6], grade: [[0.98, 1.06, 0.94], [0.0, 0.012, 0.006], 0.95], fog: 0x060c08, aggro: 1.24 },
  { n: 5, key: "bedchamber", numeral: "V", name: "The Countess's Bedchamber", short: "BEDCHAMBER", x0: 21, y0: 2, x1: 36, y1: 21,
    hemi: [0x7a3050, 0x180610, 1.7], grade: [[1.1, 0.92, 1.0], [0.02, 0.0, 0.016], 1.12], fog: 0x12040c, aggro: 1.34 },
  { n: 6, key: "battlements", numeral: "VI", name: "The Tower Top", short: "TOWER TOP", x0: 2, y0: 0, x1: 17, y1: 21,
    hemi: [0x7a88b8, 0x1a1c2a, 2.4], grade: [[0.96, 1.0, 1.1], [0.006, 0.01, 0.03], 0.94], fog: 0x1a2032, aggro: 1.45, open: true }
];

const ROOMS = [
  { key: "cellar", name: "The Wine Cellar", x0: 2, y0: 25, x1: 17, y1: 33, floor: "cellarFloor", wall: "cellarBrick" },
  { key: "vaults", name: "The Wine Vaults", x0: 2, y0: 34, x1: 17, y1: 44, floor: "cellarFloor", wall: "cellarBrick" },
  { key: "torture3", name: "The Torture Chambers", x0: 21, y0: 25, x1: 36, y1: 44, floor: "tortureFloor", wall: "tortureWall" },
  { key: "servants", name: "The Servants' Floor", x0: 40, y0: 25, x1: 55, y1: 44, floor: "servantFloor", wall: "plaster" },
  { key: "library", name: "The Library & Study", x0: 40, y0: 2, x1: 55, y1: 21, floor: "parquet", wall: "studyWall" },
  { key: "bedchamber", name: "The Countess's Bedchamber", x0: 21, y0: 2, x1: 36, y1: 21, floor: "carpet", wall: "wallpaper" },
  { key: "battlements", name: "The Tower Top", x0: 2, y0: 2, x1: 17, y1: 21, floor: "slate", wall: "towerWall" },
  // Sealed riddle rooms (keys at 15 / 30 kills)
  { key: "mirrors", name: "The Hall of Mirrors", x0: 24, y0: 47, x1: 32, y1: 55, floor: "parquet", wall: "studyWall", sealed: true },
  { key: "clock", name: "The Clock Library", x0: 43, y0: 47, x1: 51, y1: 55, floor: "parquet", wall: "books", sealed: true }
];

const CORRIDORS = [
  [28, 45, 28, 45], // torture chambers -> Hall of Mirrors door
  [47, 45, 47, 45], // servants' floor -> Clock Library door
  [8, 1, 10, 1]     // battlements -> the dawn stair (exit)
];

const PILLARS = [
  [5, 28], [12, 28], [5, 39], [12, 39],            // cellar vault piers
  [25, 30], [31, 30], [25, 38], [31, 38],          // torture chamber columns
  [3, 5], [14, 5], [3, 16], [14, 16]               // battlement merlons
];
const PARTITIONS = [
  [2, 34, 7, 34], [11, 34, 17, 34],               // cellar / vaults arch
  [21, 34, 23, 34], [34, 34, 36, 34],             // torture: cell block walls
  [46, 25, 46, 30], [50, 38, 50, 41],             // servants: dormitory screens
  [21, 14, 26, 14], [31, 14, 36, 14]              // bedchamber / dressing room
];

const PROP_DEFS = {
  winerack: [[2, 36], [2, 37], [2, 38], [2, 41], [2, 42], [17, 36], [17, 37], [17, 38]],
  barrel: [[16, 30], [16, 31]],
  well: [[15, 42]],                               // the cellar cistern
  rack: [[27, 27], [28, 27]],
  cage: [[34, 30], [34, 40]],
  table: [[29, 41], [52, 33], [53, 33]],
  cot: [[42, 28], [44, 28], [42, 31], [44, 31]],
  shelf: [[43, 7], [44, 7], [45, 7], [46, 7], [49, 7], [50, 7], [51, 7], [52, 7], [43, 12], [44, 12], [45, 12], [46, 12], [49, 12], [50, 12], [51, 12], [52, 12]],
  desk: [[47, 17], [48, 17]],
  bed: [[27, 8], [28, 8], [29, 8], [27, 9], [28, 9], [29, 9]],
  vanity: [[33, 10]],
  bell: [[9, 4]],
  clockface: [[47, 51]],
  stairUp: [[16, 26], [35, 26], [54, 26], [41, 3], [22, 20]],
  stairDown: [[22, 43], [41, 43], [54, 20], [35, 3], [16, 20]]
};

export const STAGE3_BREAKABLES = [
  // Cellar & vaults: wine casks
  ["cask", 3, 31], ["cask", 4, 32], ["cask", 14, 32], ["cask", 8, 25], ["cask", 3, 43], ["cask", 16, 36], ["crate", 11, 25],
  // Torture chambers
  ["crate", 21, 31], ["cask", 36, 36], ["crate", 33, 25], ["cask", 21, 38],
  // Servants' floor
  ["crate", 55, 30], ["cask", 40, 36], ["crate", 55, 37], ["cask", 45, 43],
  // Library: bookshelves
  ["bookshelf", 40, 10], ["bookshelf", 55, 10], ["bookshelf", 40, 15], ["bookshelf", 55, 15], ["bookshelf", 44, 17],
  // Bedchamber
  ["bookshelf", 21, 8], ["bookshelf", 36, 16], ["crate", 36, 12], ["bookshelf", 25, 21]
];

// Stairs: floor, direction, tile, where you stand on arrival, and the floor it leads to.
export const STAIRS = [
  { floor: 1, dir: "up", tx: 16, ty: 26, arrive: [16, 27], to: 2 },
  { floor: 2, dir: "down", tx: 22, ty: 43, arrive: [23, 43], to: 1 },
  { floor: 2, dir: "up", tx: 35, ty: 26, arrive: [35, 27], to: 3 },
  { floor: 3, dir: "down", tx: 41, ty: 43, arrive: [42, 43], to: 2 },
  { floor: 3, dir: "up", tx: 54, ty: 26, arrive: [54, 27], to: 4 },
  { floor: 4, dir: "down", tx: 54, ty: 20, arrive: [53, 20], to: 3 },
  { floor: 4, dir: "up", tx: 41, ty: 3, arrive: [42, 3], to: 5 },
  { floor: 5, dir: "down", tx: 35, ty: 3, arrive: [34, 3], to: 4 },
  { floor: 5, dir: "up", tx: 22, ty: 20, arrive: [23, 20], to: 6 },
  { floor: 6, dir: "down", tx: 16, ty: 20, arrive: [15, 20], to: 5 }
];

const FEATURES = {
  player: [9, 43],
  countess: [9, 27],
  exit: [9, 0],
  pages: [[3, 26], [22, 26], [41, 26], [54, 3], [22, 4]],
  alcoves: [[17, 40], [2, 30], [36, 32], [21, 36], [55, 34], [40, 40], [40, 6], [55, 6], [21, 17], [36, 6], [2, 19], [17, 12]],
  braziers: [[9, 30], [9, 38], [24, 27], [33, 42], [48, 34], [52, 27], [47, 10], [47, 15], [24, 6], [33, 18], [5, 10], [13, 10]],
  glass: [[9, 36], [28, 29], [30, 40], [47, 36], [48, 4], [28, 12]],
  mirrors: [["cracked", 15, 27], ["silver", 35, 43], ["cracked", 44, 40], ["gilded", 41, 20], ["silver", 31, 4]],
  bolts: [[4, 43], [13, 26], [22, 30], [35, 38], [53, 40], [42, 35], [44, 9], [52, 14], [33, 7], [23, 16]],
  spawns: [
    [4, 26], [14, 35], [4, 42], [15, 29],          // F1
    [24, 26], [35, 30], [23, 40], [34, 42],        // F2
    [43, 26], [53, 30], [41, 38], [51, 36],        // F3
    [42, 5], [53, 9], [42, 14], [52, 18],          // F4
    [24, 10], [34, 13], [30, 19], [22, 6],         // F5
    [4, 4], [15, 4], [4, 18], [9, 14]              // F6
  ],
  waypoints: [
    [9, 27], [9, 41], [4, 36], [15, 37], [9, 32],
    [28, 26], [28, 42], [23, 36], [34, 36], [28, 34],
    [48, 27], [48, 42], [42, 34], [53, 35], [48, 34],
    [47, 4], [47, 19], [42, 10], [53, 12], [47, 9],
    [28, 5], [28, 18], [23, 11], [34, 11], [28, 12],
    [9, 7], [9, 18], [5, 12], [13, 12]
  ]
};

const LOCKED = [
  {
    key: "mirrors", kind: "mirrors", keyNo: 1, numeral: "I", name: "Hall of Mirrors",
    door: [28, 46],
    riddleTitle: "The Hall of Mirrors",
    riddle: [
      "The lamp was lit in the west at dusk.",
      "First it falls, as all things fall;",
      "then it runs the length of the floor toward morning;",
      "then it climbs, as the Lady climbed;",
      "and last it turns to the east, and wakes the sun.",
      "",
      "Four glasses. Turn them until the sun is lit.",
      "Show her own face to her, and she will answer."
    ],
    // A B C D are standing mirrors (tap TURN), the shutter opens the lamp (tap OPEN).
    items: [["A", 26, 49], ["B", 26, 53], ["C", 30, 53], ["D", 30, 49], ["shutter", 24, 51]],
    lamp: [23, 49], sun: [33, 49], portraits: [[26, 46], [23, 53]],
    start: { A: "/", B: "/", C: "\\", D: "\\" },
    solution: { A: "\\", B: "\\", C: "/", D: "/" }
  },
  {
    key: "clock", kind: "clock", keyNo: 2, numeral: "II", name: "Clock Library",
    door: [47, 46],
    riddleTitle: "The Lady's Hours",
    riddle: [
      "She rises when the short hand points to where the sun goes down;",
      "she dines when both hands kneel together at the crown;",
      "she writes her ledger at the hour of the dawn she fears;",
      "and she sleeps when the hand hangs down toward the cellar.",
      "",
      "Pull her hours from the shelves in the order of her day.",
      "The clock is already striking. Thirteen strikes for no one living."
    ],
    items: [["IX", 44, 51], ["XII", 47, 49], ["III", 50, 51], ["VI", 47, 53], ["XIII", 50, 54]],
    order: ["IX", "XII", "III", "VI"],
    closeSecs: 50
  }
];

export const STAGE3 = {
  stage: 5, kind: "climb", title: "The Climb", collect: "Tower Seals", collectShort: "SEALS",
  rooms: ROOMS, corridors: CORRIDORS, pillars: PILLARS, partitions: PARTITIONS,
  props: PROP_DEFS, features: FEATURES, breakables: STAGE3_BREAKABLES,
  locked: LOCKED, secrets: [], lore: TOWER_SEALS,
  merchant: [54, 43], floors: FLOORS, stairs: STAIRS, boss: [9, 10], bossKind: "gargoyle"
};

export function floorAt(tx, ty) {
  for (const f of FLOORS) if (tx >= f.x0 && tx <= f.x1 && ty >= f.y0 && ty <= f.y1) return f.n;
  return 0;
}

// Light path through the Hall of Mirrors. Grid-local to the room; "/" and "\" are the two mirror angles.
// Returns { cells:[[tx,ty]...], end: "sun" | "portrait" | "wall", hit:[tx,ty] }.
export function traceBeam(lr) {
  const r = lr.room;
  const byTile = new Map(lr.items.filter((it) => it.sym !== "shutter").map((it) => [`${it.tx},${it.ty}`, it]));
  let [x, y] = lr.lamp;
  let dx = 1, dy = 0;
  const cells = [[x, y]];
  for (let step = 0; step < 80; step++) {
    x += dx; y += dy;
    if (x < r.x0 || x > r.x1 || y < r.y0 || y > r.y1) {
      cells.push([x, y]);
      if (x === lr.sun[0] && y === lr.sun[1]) return { cells, end: "sun", hit: [x, y] };
      if (lr.portraits.some(([px, py]) => px === x && py === y)) return { cells, end: "portrait", hit: [x, y] };
      return { cells, end: "wall", hit: [x, y] };
    }
    cells.push([x, y]);
    const m = byTile.get(`${x},${y}`);
    if (m) {
      if (m.rot === "/") { const t = dx; dx = -dy; dy = -t; }
      else { const t = dx; dx = dy; dy = t; }
    }
  }
  return { cells, end: "wall", hit: [x, y] };
}
