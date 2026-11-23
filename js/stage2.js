import { GRAVE_RUBBINGS } from "./lore.js";

// Stage II — The Graveyards of Csejte. Outdoor, fog-bound, moonlit. Same 58x58 grid as the castle.
// Rects are inclusive tile ranges.
const ROOMS = [
  { key: "gatehouse", name: "The Gatehouse", x0: 20, y0: 3, x1: 37, y1: 11, floor: "flag" },
  { key: "mausoleum", name: "Mausoleum Row", x0: 3, y0: 3, x1: 16, y1: 20, floor: "dirt" },
  { key: "cryptyard", name: "Crypt Entrance", x0: 41, y0: 3, x1: 54, y1: 20, floor: "flag" },
  { key: "orchard", name: "The Dead Orchard", x0: 3, y0: 24, x1: 16, y1: 43, floor: "grass" },
  { key: "bonepit", name: "The Bone Pit", x0: 41, y0: 24, x1: 54, y1: 43, floor: "bone" },
  { key: "chapelyard", name: "Chapel Graveyard", x0: 20, y0: 15, x1: 37, y1: 43, floor: "grass" },
  // Sealed puzzle chambers below the yard
  { key: "crypt", name: "Crypt of Names", x0: 6, y0: 47, x1: 14, y1: 55, floor: "flag", sealed: true },
  { key: "flood", name: "Drowned Mausoleum", x0: 44, y0: 47, x1: 50, y1: 55, floor: "flag", sealed: true }
];

const CORRIDORS = [
  [27, 12, 30, 14], // chapel graveyard -> gatehouse
  [17, 6, 19, 8], [38, 6, 40, 8], // gatehouse <-> mausoleum row / crypt entrance
  [8, 21, 10, 23], [46, 21, 48, 23], // north yards -> orchard / bone pit
  [17, 36, 19, 38], [38, 28, 40, 30], // chapel graveyard <-> orchard / bone pit
  [28, 1, 30, 2], // gatehouse road out
  [10, 44, 10, 45], [47, 44, 47, 45] // stairs down to the sealed chambers
];

const PILLARS = [[23, 6], [33, 6]]; // gatehouse piers
const PARTITIONS = [[45, 10, 50, 10]]; // crypt-entrance retaining wall

// Headstone rows in the chapel graveyard (centre path x27..30 stays clear).
const tombs = [], crosses = [];
for (const y of [18, 21, 24, 34]) {
  for (const x of [22, 24, 26, 31, 33, 35]) ((x + y) % 4 === 0 ? crosses : tombs).push([x, y]);
}
for (const [x, y] of [[5, 15], [8, 15], [11, 15], [14, 15], [5, 18], [11, 18]]) tombs.push([x, y]);
for (const [x, y] of [[44, 14], [47, 14], [50, 14], [53, 14], [44, 17], [53, 17]]) crosses.push([x, y]);

const PROP_DEFS = {
  tomb: tombs,
  cross: crosses,
  mausoleum: [[5, 6], [8, 6], [11, 6], [14, 6], [5, 10], [14, 10]],
  tree: [[5, 26], [8, 27], [13, 26], [15, 30], [5, 31], [9, 32], [13, 35], [4, 37], [7, 39], [15, 41], [12, 30], [36, 17], [21, 41]],
  grave: [[24, 29], [33, 29], [23, 38], [34, 38], [44, 27], [51, 27], [44, 35], [51, 35], [48, 31], [6, 41]],
  bones: [[42, 42], [53, 25], [47, 39], [53, 31]],
  angel: [[24, 5], [33, 9]],
  fountain: [[28, 27]]
};

export const STAGE2_BREAKABLES = [
  // Chapel graveyard
  ["coffin", 22, 43], ["urn", 23, 43], ["urn", 37, 22], ["coffin", 20, 27], ["urn", 37, 31], ["coffin", 20, 33],
  // Mausoleum row
  ["urn", 3, 3], ["coffin", 16, 3], ["urn", 3, 20], ["coffin", 16, 12],
  // Crypt entrance
  ["coffin", 41, 3], ["urn", 54, 3], ["urn", 54, 20], ["coffin", 41, 17],
  // Orchard
  ["urn", 3, 43], ["coffin", 16, 25], ["urn", 3, 28],
  // Bone pit
  ["coffin", 54, 43], ["urn", 41, 24], ["coffin", 54, 37], ["urn", 41, 33],
  // Gatehouse
  ["urn", 20, 3], ["urn", 37, 3]
];

const FEATURES = {
  player: [28, 41],
  countess: [47, 7],
  exit: [29, 0],
  pages: [[4, 4], [52, 5], [6, 34], [52, 41], [24, 26]],
  alcoves: [[12, 3], [30, 3], [45, 3], [4, 24], [52, 24], [21, 15], [33, 15], [14, 43], [43, 43]],
  braziers: [[25, 40], [32, 40], [25, 16], [32, 16], [6, 28], [50, 29], [8, 12], [48, 12], [26, 8], [31, 8], [12, 38], [45, 40]],
  glass: [[29, 35], [10, 17], [47, 16], [46, 33], [11, 28], [30, 6]],
  mirrors: [["cracked", 26, 38], ["cracked", 7, 13], ["cracked", 52, 33], ["silver", 44, 8], ["obsidian", 4, 41]],
  bolts: [[33, 42], [14, 24], [43, 24], [22, 10], [52, 18], [6, 36], [30, 19], [50, 42]],
  spawns: [[23, 17], [35, 26], [21, 30], [36, 36], [6, 4], [15, 19], [44, 5], [53, 12], [5, 29], [15, 39], [43, 29], [53, 39], [22, 7], [35, 10]],
  waypoints: [[28, 24], [28, 36], [22, 28], [35, 20], [10, 9], [10, 33], [47, 6], [47, 34], [28, 6], [36, 8], [21, 9], [51, 40], [5, 42], [14, 28]]
};

const LOCKED = [
  {
    key: "crypt", kind: "crypt", keyNo: 1, numeral: "I", name: "Crypt of Names",
    door: [10, 46],
    riddleTitle: "The Crypt of Names",
    riddle: [
      "Here the household of the Lady sleeps,",
      "each lid cut with the year it fell.",
      "Lay them to rest as the ground received them:",
      "the first to fall is the first to sleep,",
      "and the last to fall shuts the crypt.",
      "",
      "M a thousand · D five hundred · C a hundred",
      "L fifty · X ten · V five · I one"
    ],
    items: [["MDCX", 9, 49], ["MDLXXV", 11, 49], ["MDCIV", 10, 51], ["MDXC", 9, 53], ["MDCXIV", 11, 53]],
    order: ["MDLXXV", "MDXC", "MDCIV", "MDCX", "MDCXIV"]
  },
  {
    key: "flood", kind: "flood", keyNo: 2, numeral: "II", name: "Drowned Mausoleum",
    door: [47, 46],
    riddleTitle: "The Drowned Bells",
    riddle: [
      "A child is christened under silver;",
      "a bride is wed beneath the bronze;",
      "a soldier marches to the iron;",
      "and bone tolls once, when all is gone.",
      "",
      "Ring a life from font to grave.",
      "The water will not wait for you."
    ],
    items: [["iron", 46, 49], ["bone", 48, 49], ["silver", 46, 53], ["bronze", 48, 53]],
    order: ["silver", "bronze", "iron", "bone"],
    closeSecs: 45
  }
];

const SECRETS = [
  {
    key: "angel-mausoleum",
    name: "Weeping Angel Passage",
    item: "angel",
    itemName: "weeping stone angel",
    hint: "The angel's hands are cupped, as if waiting for a coin.",
    openText: "The angel bows — the wall behind her sinks into the earth!",
    itemTx: 20, itemTy: 19,
    tiles: [[19, 19], [18, 19], [17, 19]]
  },
  {
    key: "ossuary-stair",
    name: "Ossuary Crawl",
    item: "skull",
    itemName: "skull with a coin in its teeth",
    hint: "One skull in the pile is newer than the rest.",
    openText: "The bones collapse inward — a crawlway opens!",
    itemTx: 41, itemTy: 40,
    tiles: [[40, 40], [39, 40], [38, 40]]
  }
];

export const STAGE2 = {
  stage: 2, title: "The Graveyards", collect: "Grave Rubbings", collectShort: "RUBBINGS",
  rooms: ROOMS, corridors: CORRIDORS, pillars: PILLARS, partitions: PARTITIONS,
  props: PROP_DEFS, features: FEATURES, breakables: STAGE2_BREAKABLES,
  locked: LOCKED, secrets: SECRETS, lore: GRAVE_RUBBINGS,
  merchant: [36, 42]
};
