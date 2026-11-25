import { WOODS_TALISMANS } from "./lore.js";

// Stage I — The Woods below Csejte. Dark Carpathian forest, fog, dead pines, wayside shrines.
const ROOMS = [
  { key: "timberroad", name: "Old Timber Road", x0: 11, y0: 38, x1: 46, y1: 43, floor: "mossTrail" },
  { key: "wolfhollow", name: "The Wolf Hollow", x0: 3, y0: 22, x1: 17, y1: 35, floor: "forestFloor" },
  { key: "hut", name: "Woodcutter's Hut", x0: 40, y0: 22, x1: 54, y1: 35, floor: "woodFloor" },
  { key: "crossroads", name: "The Wayside Cross", x0: 20, y0: 16, x1: 37, y1: 31, floor: "mossTrail" },
  { key: "marsh", name: "The Pale Marsh", x0: 3, y0: 3, x1: 17, y1: 19, floor: "bogWater" },
  { key: "hillgate", name: "Hillfoot Postern", x0: 22, y0: 3, x1: 48, y1: 12, floor: "forestFloor" },
  // Sealed puzzle clearings south of the Timber Road
  { key: "stones", name: "Standing Stones", x0: 9, y0: 47, x1: 17, y1: 55, floor: "forestFloor", sealed: true },
  { key: "snare", name: "Hunter's Trap", x0: 39, y0: 47, x1: 45, y1: 55, floor: "woodFloor", sealed: true }
];

const CORRIDORS = [
  [27, 32, 30, 37], // timberroad <-> crossroads
  [13, 36, 15, 37], // timberroad <-> wolfhollow
  [42, 36, 44, 37], // timberroad <-> hut
  [18, 25, 19, 27], // wolfhollow <-> crossroads
  [38, 25, 39, 27], // crossroads <-> hut
  [27, 13, 30, 15], // crossroads <-> hillgate
  [18, 7, 21, 9],   // marsh <-> hillgate
  [9, 20, 11, 21],  // marsh <-> wolfhollow
  [45, 13, 47, 21], // hut <-> hillgate eastern trail
  [33, 1, 35, 2],   // forest gate out to the courtyard
  [13, 44, 13, 45], [42, 44, 42, 45] // paths to sealed clearings
];

const PILLARS = [[24, 21], [33, 21], [27, 7], [40, 7]]; // massive ancient oak trunks & gate piers
const PARTITIONS = [[46, 28, 51, 28]]; // hut timber room divider

const PROP_DEFS = {
  tree: [
    [16, 40], [36, 39], [6, 25], [14, 29], [5, 32], [11, 24],
    [22, 18], [35, 18], [22, 28], [35, 28],
    [5, 6], [14, 7], [6, 13], [14, 15], [9, 10],
    [24, 5], [44, 5], [31, 10], [45, 10]
  ],
  stump: [[19, 39], [39, 42], [8, 28], [15, 33], [42, 24], [52, 23], [8, 17], [38, 5]],
  cairn: [[28, 23], [24, 10], [12, 12], [44, 32]],
  table: [[43, 25], [44, 25], [51, 32], [52, 32]],
  shrine: [[28, 17]],
  well: [[23, 41]]
};

export const WOODS_BREAKABLES = [
  ["crate", 12, 39], ["barrel", 20, 42], ["crate", 33, 42], ["barrel", 45, 39],
  ["barrel", 4, 23], ["crate", 16, 24], ["barrel", 4, 34], ["crate", 10, 34],
  ["crate", 41, 23], ["barrel", 53, 24], ["barrel", 41, 34], ["crate", 53, 33],
  ["crate", 21, 30], ["barrel", 36, 30], ["crate", 21, 17],
  ["barrel", 4, 4], ["crate", 16, 4], ["barrel", 4, 18],
  ["crate", 23, 4], ["barrel", 47, 4], ["crate", 47, 11]
];

const FEATURES = {
  player: [28, 41],
  countess: [28, 21],
  exit: [34, 0],
  pages: [[28, 39], [49, 25], [7, 29], [7, 8], [34, 10]],
  alcoves: [[14, 38], [41, 38], [4, 28], [53, 29], [20, 24], [37, 24], [4, 10], [16, 12], [23, 12], [46, 8]],
  braziers: [[26, 40], [31, 40], [17, 42], [38, 41], [10, 29], [47, 31], [25, 24], [32, 24], [10, 14], [29, 7], [42, 8]],
  glass: [[29, 36], [14, 35], [43, 35], [22, 22], [11, 17], [34, 8]],
  mirrors: [["cracked", 22, 39], ["cracked", 6, 23], ["cracked", 51, 30], ["silver", 13, 6], ["obsidian", 43, 4]],
  bolts: [[34, 41], [15, 41], [12, 27], [45, 29], [25, 29], [12, 16], [26, 9], [45, 6]],
  spawns: [[13, 41], [39, 40], [6, 31], [14, 24], [43, 31], [51, 26], [22, 26], [35, 22], [6, 9], [14, 5], [14, 17], [25, 5], [39, 10], [46, 5]],
  waypoints: [[28, 40], [18, 40], [40, 40], [10, 28], [47, 30], [28, 25], [22, 20], [35, 26], [10, 12], [10, 6], [29, 8], [42, 8], [34, 4], [15, 34]]
};

const LOCKED = [
  {
    key: "stones", kind: "stones", keyNo: 1, numeral: "I", name: "Standing Stones",
    door: [13, 46],
    riddleTitle: "The Woodsman's Tally",
    riddle: [
      "High in the pine the silent feather watches first;",
      "then the black scavenger cries across the clearing;",
      "the antlered crown steps softly to the brook;",
      "and last the pack runs low beneath the moon.",
      "",
      "Touch the four stones from canopy to earth."
    ],
    items: [["owl", 11, 49], ["crow", 15, 49], ["stag", 11, 53], ["wolf", 15, 53]],
    order: ["owl", "crow", "stag", "wolf"]
  },
  {
    key: "snare", kind: "snare", keyNo: 2, numeral: "II", name: "Hunter's Trap",
    door: [42, 46],
    riddleTitle: "The Trapper's Compass",
    riddle: [
      "Turn first toward the castle waiting above the hill;",
      "then to the first red ray of dawn;",
      "then to the cold dusk where the sun falls;",
      "and last back down the road from whence you came.",
      "",
      "Four winches hold the spiked jaws apart."
    ],
    items: [["north", 42, 49], ["east", 44, 51], ["south", 42, 53], ["west", 40, 51]],
    order: ["north", "east", "west", "south"],
    closeSecs: 45
  }
];

const SECRETS = [
  {
    key: "hollow-oak",
    name: "Marsh Deer-Track",
    item: "cairn",
    itemName: "mossy boundary cairn",
    hint: "A loose stone in the cairn hides a deer-track through the briars.",
    openText: "The briars part — a hidden path opens between the marsh and the crossroads!",
    itemTx: 17, itemTy: 17,
    tiles: [[18, 17], [19, 17]]
  },
  {
    key: "hut-plank",
    name: "Woodcutter's Shortcut",
    item: "stump",
    itemName: "split pine stump",
    hint: "Fresh sawdust gathers under the western timber wall.",
    openText: "A false log swings aside — a trail links the hut and the crossroads!",
    itemTx: 40, itemTy: 22,
    tiles: [[39, 22], [38, 22]]
  }
];

export const STAGE_WOODS = {
  stage: 1,
  kind: "woods",
  title: "The Woods",
  collect: "Trail Talismans",
  collectShort: "TALISMANS",
  rooms: ROOMS,
  corridors: CORRIDORS,
  pillars: PILLARS,
  partitions: PARTITIONS,
  props: PROP_DEFS,
  features: FEATURES,
  breakables: WOODS_BREAKABLES,
  locked: LOCKED,
  secrets: SECRETS,
  lore: WOODS_TALISMANS,
  merchant: [44, 42],
  boss: [34, 7],
  bossKind: "packmaster"
};
