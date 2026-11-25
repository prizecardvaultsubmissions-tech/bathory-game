import { COURTYARD_ORDERS } from "./lore.js";

// Stage II — The Courtyard. Outer bailey, stables, kennels, watchtower, and castle gates.
const ROOMS = [
  { key: "postern", name: "South Postern Yard", x0: 10, y0: 36, x1: 47, y1: 43, floor: "cobbleYard" },
  { key: "stables", name: "The Stables", x0: 3, y0: 20, x1: 16, y1: 33, floor: "stableStraw" },
  { key: "kennels", name: "The Kennels", x0: 41, y0: 20, x1: 54, y1: 33, floor: "kennelFlag" },
  { key: "drillyard", name: "The Drill Yard", x0: 20, y0: 17, x1: 37, y1: 32, floor: "cobbleYard" },
  { key: "barracks", name: "Watchtower Barracks", x0: 3, y0: 3, x1: 17, y1: 16, floor: "kennelFlag" },
  { key: "gatehouse", name: "Castle Gatehouse", x0: 22, y0: 3, x1: 53, y1: 13, floor: "cobbleYard" },
  // Sealed puzzle rooms south of the Postern Yard
  { key: "heraldry", name: "Heraldry Armory", x0: 9, y0: 47, x1: 17, y1: 55, floor: "cobbleYard", sealed: true },
  { key: "winch", name: "Portcullis Winch", x0: 39, y0: 47, x1: 45, y1: 55, floor: "kennelFlag", sealed: true }
];

const CORRIDORS = [
  [27, 33, 30, 35], // postern <-> drillyard
  [12, 34, 14, 35], // postern <-> stables
  [43, 34, 45, 35], // postern <-> kennels
  [17, 25, 19, 27], // stables <-> drillyard
  [38, 25, 40, 27], // drillyard <-> kennels
  [27, 14, 30, 16], // drillyard <-> gatehouse
  [8, 17, 10, 19],  // barracks <-> stables
  [18, 7, 21, 9],   // barracks <-> gatehouse
  [46, 14, 48, 19], // kennels <-> gatehouse
  [38, 1, 40, 2],   // great oak doors into Csejte Castle
  [13, 44, 13, 45], [42, 44, 42, 45] // stairs down to sealed rooms
];

const PILLARS = [[23, 21], [33, 21], [28, 6], [46, 6]];
const PARTITIONS = [[10, 9, 14, 9], [46, 26, 51, 26]];

const PROP_DEFS = {
  trough: [[6, 24], [6, 29], [44, 24], [44, 29]],
  cart: [[14, 39], [36, 39]],
  dummy: [[25, 24], [32, 24], [25, 28], [32, 28]],
  rack: [[4, 5], [14, 5]],
  table: [[5, 13], [6, 13], [13, 13]],
  cage: [[49, 22], [52, 22], [49, 31], [52, 31]],
  statue: [[25, 4], [43, 4]],
  well: [[20, 40]]
};

export const COURTYARD_BREAKABLES = [
  ["barrel", 11, 37], ["crate", 24, 42], ["barrel", 34, 42], ["crate", 46, 37],
  ["barrel", 4, 21], ["crate", 15, 22], ["barrel", 4, 32], ["crate", 15, 31],
  ["crate", 42, 21], ["barrel", 53, 21], ["barrel", 42, 32], ["crate", 53, 30],
  ["crate", 21, 18], ["barrel", 36, 31], ["crate", 21, 31],
  ["barrel", 4, 4], ["crate", 16, 4], ["barrel", 4, 15],
  ["crate", 23, 4], ["barrel", 52, 4], ["crate", 52, 12]
];

const FEATURES = {
  player: [28, 41],
  countess: [28, 21],
  exit: [39, 0],
  pages: [[26, 38], [8, 27], [48, 28], [8, 11], [34, 9]],
  alcoves: [[12, 37], [41, 37], [3, 27], [54, 27], [20, 24], [37, 24], [3, 11], [17, 12], [23, 12], [51, 8]],
  braziers: [[25, 40], [31, 40], [17, 41], [39, 41], [11, 27], [47, 24], [25, 22], [32, 22], [11, 7], [32, 7], [44, 9]],
  glass: [[29, 36], [13, 35], [44, 35], [22, 26], [10, 16], [35, 8]],
  mirrors: [["cracked", 22, 38], ["cracked", 7, 22], ["cracked", 51, 25], ["silver", 12, 6], ["obsidian", 49, 5]],
  bolts: [[33, 41], [16, 41], [12, 30], [45, 22], [23, 29], [12, 14], [26, 10], [49, 10]],
  spawns: [[13, 41], [40, 40], [5, 29], [14, 24], [43, 30], [51, 28], [22, 29], [35, 19], [6, 7], [15, 7], [15, 14], [25, 10], [37, 5], [50, 6]],
  waypoints: [[28, 39], [18, 40], [40, 40], [10, 27], [47, 29], [28, 25], [22, 19], [35, 28], [9, 12], [11, 5], [31, 8], [44, 8], [39, 4], [14, 32]]
};

const LOCKED = [
  {
    key: "heraldry", kind: "heraldry", keyNo: 1, numeral: "I", name: "Heraldry Armory",
    door: [13, 46],
    riddleTitle: "The Bailey Oath",
    riddle: [
      "First swear by the steel that keeps the wall;",
      "then by the iron tooth that locks the hall;",
      "third by the thorny crest the Lady wears;",
      "and last the golden circlet no servant dares.",
      "",
      "Touch the four shields in order of the oath."
    ],
    items: [["sword", 11, 49], ["crown", 15, 49], ["rose", 11, 53], ["key", 15, 53]],
    order: ["sword", "key", "rose", "crown"]
  },
  {
    key: "winch", kind: "winch", keyNo: 2, numeral: "II", name: "Portcullis Winch",
    door: [42, 46],
    riddleTitle: "The Gatekeeper's Chain",
    riddle: [
      "Draw the dullest metal first, forged for the moat;",
      "then the warm yellow alloy of the smith's coat;",
      "then the pale mirror-ore that freezes the night;",
      "and last the royal metal, heavy and bright.",
      "",
      "Turn the four chain wheels before the grate falls."
    ],
    items: [["brass", 41, 49], ["gold", 43, 49], ["iron", 41, 53], ["silver", 43, 53]],
    order: ["iron", "brass", "silver", "gold"],
    closeSecs: 42
  }
];

const SECRETS = [
  {
    key: "stable-post",
    name: "Stable Tack Passage",
    item: "trough",
    itemName: "split oak trough",
    hint: "A loose post behind the tack stall hides an old sally port.",
    openText: "The stall timbers pivot — a secret passage opens into the Drill Yard!",
    itemTx: 16, itemTy: 21,
    tiles: [[17, 21], [18, 21], [19, 21]]
  },
  {
    key: "kennel-grate",
    name: "Kennel Sluiceway",
    item: "cage",
    itemName: "rusted kennel gate",
    hint: "Scrapes along the stone wall mark a hidden kennel sluice.",
    openText: "The iron gate swings free — a drain way opens to the Drill Yard!",
    itemTx: 41, itemTy: 21,
    tiles: [[40, 21], [39, 21], [38, 21]]
  }
];

export const STAGE_COURTYARD = {
  stage: 2,
  kind: "courtyard",
  title: "The Courtyard",
  collect: "Garrison Orders",
  collectShort: "ORDERS",
  rooms: ROOMS,
  corridors: CORRIDORS,
  pillars: PILLARS,
  partitions: PARTITIONS,
  props: PROP_DEFS,
  features: FEATURES,
  breakables: COURTYARD_BREAKABLES,
  locked: LOCKED,
  secrets: SECRETS,
  lore: COURTYARD_ORDERS,
  merchant: [45, 42],
  boss: [39, 7],
  bossKind: "warden"
};
