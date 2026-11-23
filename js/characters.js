import * as THREE from "./vendor/three.module.min.js";

// v0.7 — richer low-poly, FF7-era characters built in code (all original designs).
// Every part carries a baked vertex-colour gradient (darker toward its base) for a Gouraud/AO look,
// and the rigs expose extra pivots (heads, knees, elbows, jaws, coat tails, capes) for idle/walk/attack animation.

const matCache = new Map();
export function lambert(key, opts, psx) {
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, ...opts });
  psx(m);
  matCache.set(key, m);
  return m;
}

// Bake a soft top-to-bottom gradient (+ tiny per-face jitter) into a geometry's vertex colours.
let jitterSeed = 1;
function shade(geo, lo = 0.74, hi = 1.06) {
  if (geo.attributes.color) return geo;
  const pos = geo.attributes.position;
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const h = Math.max(1e-4, bb.max.y - bb.min.y);
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - bb.min.y) / h;
    jitterSeed = (jitterSeed * 16807) % 2147483647;
    const j = ((jitterSeed / 2147483647) - 0.5) * 0.05;
    const k = lo + (hi - lo) * Math.pow(t, 0.8) + j;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return geo;
}

function add(parent, geo, mat, x, y, z, shadow = true) {
  const usesVC = Array.isArray(mat) ? mat.some((m) => m.vertexColors) : mat.vertexColors;
  if (usesVC) shade(geo);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = false;
  parent.add(m);
  return m;
}

function pivot(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 8, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);
const cone = (r, h, s = 6) => new THREE.ConeGeometry(r, h, s);
const ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);

// ---------------------------------------------------------------- the investigator (player)
export function buildInvestigator(T, psx) {
  const root = new THREE.Group();
  const body = pivot(root, 0, 0, 0);

  const trousers = lambert("trousers", { color: 0x2c2e3e, flatShading: true }, psx);
  const boots = lambert("boots", { color: 0x2a1c14, flatShading: true }, psx);
  const coat = lambert("coat", { map: T.coat, flatShading: true }, psx);
  const coatDark = lambert("coatDark", { map: T.coat, color: 0x8a7a6a, flatShading: true }, psx);
  const scarf = lambert("scarf", { color: 0xa00e2a, flatShading: true }, psx);
  const skin = lambert("skin", { color: 0xd8aa82, flatShading: true }, psx);
  const hair = lambert("hair", { color: 0x3a281c, flatShading: true }, psx);
  const hat = lambert("hat", { color: 0x2e2620, flatShading: true }, psx);
  const leather = lambert("leather", { color: 0x4e3020, flatShading: true }, psx);
  const brass = lambert("brass", { color: 0xc9a24d, emissive: 0x2a1a04, flatShading: true }, psx);
  const face = lambert("pface", { map: T.playerFace, flatShading: true }, psx);
  const iron = lambert("lanternIron", { color: 0x2c2822, flatShading: true }, psx);

  // Legs with knees
  const legs = [], knees = [];
  for (const sx of [-0.13, 0.13]) {
    const hip = pivot(body, sx, 0.78, 0);
    add(hip, box(0.2, 0.4, 0.22), trousers, 0, -0.2, 0);
    const knee = pivot(hip, 0, -0.38, 0);
    add(knee, box(0.18, 0.34, 0.2), trousers, 0, -0.16, 0);
    add(knee, box(0.21, 0.16, 0.24), boots, 0, -0.32, 0.01);   // boot shaft
    add(knee, box(0.2, 0.1, 0.32), boots, 0, -0.38, 0.05);     // foot
    add(knee, box(0.22, 0.03, 0.34), leather, 0, -0.44, 0.05); // sole
    legs.push(hip); knees.push(knee);
  }

  // Torso: coat, lapels, belt & buckle, satchel
  const torso = pivot(body, 0, 0.8, 0);
  add(torso, box(0.58, 0.64, 0.34), coat, 0, 0.3, 0);
  add(torso, box(0.6, 0.12, 0.36), leather, 0, -0.02, 0);
  add(torso, box(0.12, 0.1, 0.04), brass, 0, -0.02, 0.19);
  add(torso, box(0.12, 0.42, 0.04), coatDark, -0.13, 0.42, 0.18).rotation.z = -0.25;
  add(torso, box(0.12, 0.42, 0.04), coatDark, 0.13, 0.42, 0.18).rotation.z = 0.25;
  add(torso, box(0.54, 0.12, 0.38), scarf, 0, 0.62, 0);
  add(torso, box(0.15, 0.32, 0.06), scarf, 0.15, 0.44, 0.2);
  const strap = add(torso, box(0.06, 0.78, 0.04), leather, 0, 0.3, 0.19); strap.rotation.z = 0.62;
  add(torso, box(0.2, 0.2, 0.12), leather, -0.3, -0.06, 0.12);
  add(torso, box(0.21, 0.07, 0.13), coatDark, -0.3, 0.03, 0.12);
  // Coat skirt: two tail panels that swing
  const coatTails = [];
  for (const sx of [-0.15, 0.15]) {
    const tp = pivot(torso, sx, -0.06, -0.02);
    add(tp, box(0.3, 0.5, 0.06), coat, 0, -0.25, -0.12);
    add(tp, box(0.28, 0.46, 0.06), coat, sx * 0.4, -0.23, 0.12).rotation.y = sx * 0.6;
    coatTails.push(tp);
  }

  // Head: face, hair, wide-brimmed hat
  const head = pivot(torso, 0, 0.86, 0);
  add(head, box(0.14, 0.1, 0.14), skin, 0, -0.08, 0);
  add(head, box(0.4, 0.42, 0.38), [skin, skin, hair, skin, face, hair], 0, 0.16, 0);
  add(head, box(0.42, 0.18, 0.12), hair, 0, 0.26, -0.15);
  add(head, box(0.08, 0.1, 0.1), skin, 0.21, 0.14, 0);
  add(head, box(0.08, 0.1, 0.1), skin, -0.21, 0.14, 0);
  add(head, cyl(0.33, 0.35, 0.04, 12), hat, 0, 0.4, -0.02);
  add(head, cyl(0.21, 0.24, 0.26, 10), hat, 0, 0.53, 0.0);
  add(head, cyl(0.245, 0.245, 0.06, 10), scarf, 0, 0.44, 0.0);

  // Arms with elbows, cuffs and hands
  const arms = [], elbows = [];
  for (const sx of [-0.37, 0.37]) {
    const sh = pivot(torso, sx, 0.56, 0);
    add(sh, box(0.2, 0.16, 0.22), coat, 0, -0.02, 0);
    add(sh, box(0.17, 0.32, 0.19), coat, 0, -0.18, 0);
    const el = pivot(sh, 0, -0.34, 0);
    el.rotation.x = -0.2;
    add(el, box(0.16, 0.28, 0.18), coat, 0, -0.13, 0);
    add(el, box(0.18, 0.06, 0.2), coatDark, 0, -0.27, 0);
    add(el, box(0.13, 0.13, 0.14), skin, 0, -0.35, 0);
    arms.push(sh); elbows.push(el);
  }

  // Lantern in the right hand: iron cage, glass, cap and ring
  const lanternHolder = pivot(elbows[1], 0, -0.42, 0);
  const lantern = pivot(lanternHolder, 0, -0.12, 0);
  add(lantern, box(0.22, 0.04, 0.22), iron, 0, 0.15, 0);
  add(lantern, box(0.22, 0.05, 0.22), iron, 0, -0.15, 0);
  for (const [x, z] of [[-0.09, -0.09], [0.09, -0.09], [-0.09, 0.09], [0.09, 0.09]]) add(lantern, box(0.025, 0.28, 0.025), brass, x, 0, z);
  add(lantern, cone(0.13, 0.12, 4), iron, 0, 0.23, 0).rotation.y = Math.PI / 4;
  add(lantern, new THREE.TorusGeometry(0.05, 0.012, 4, 8), brass, 0, 0.32, 0);
  const glassMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
  psx(glassMat);
  add(lantern, box(0.15, 0.24, 0.15), glassMat, 0, 0, 0, false);

  return { root, body, torso, head, legs, knees, arms, elbows, coatTails, lantern, glassMat };
}

// ---------------------------------------------------------------- the Blood Countess
export function buildCountess(T, psx) {
  const root = new THREE.Group();
  const body = pivot(root, 0, 0, 0);

  const gown = lambert("gown", { map: T.gown, flatShading: true }, psx);
  const gownDark = lambert("gownDark", { color: 0x3a0610, flatShading: true }, psx);
  const gold = lambert("gold", { color: 0xc9a24d, emissive: 0x2a1a04, flatShading: true }, psx);
  const ruff = lambert("ruff", { map: T.ruff, flatShading: true }, psx);
  const pale = lambert("pale", { color: 0xe6d6d2, flatShading: true }, psx);
  const hairM = lambert("chair", { color: 0x140a0e, flatShading: true }, psx);
  const face = lambert("cface", { map: T.countessFace, flatShading: true }, psx);
  const pearl = lambert("pearl", { color: 0xf4eee0, emissive: 0x2a2620, flatShading: true }, psx);
  const ruby = lambert("ruby", { color: 0xd0102c, emissive: 0x400008, flatShading: true }, psx);
  const lace = lambert("lace", { color: 0xe8e0d0, flatShading: true, side: THREE.DoubleSide }, psx);

  // Layered skirt with hem band and front panel; a train behind
  const skirt = pivot(body, 0, 0, 0);
  add(skirt, cyl(0.32, 0.82, 1.6, 12), gown, 0, 0.8, 0);
  add(skirt, cyl(0.84, 0.86, 0.08, 12), gold, 0, 0.06, 0);
  add(skirt, cyl(0.6, 0.7, 0.05, 12), gold, 0, 0.5, 0);
  add(skirt, box(0.34, 1.2, 0.04), gownDark, 0, 0.66, 0.6).rotation.x = -0.24;
  for (let i = 0; i < 4; i++) add(skirt, box(0.05, 0.05, 0.03), gold, 0, 0.3 + i * 0.28, 0.66 - i * 0.07);
  const train = add(skirt, box(0.9, 0.04, 1.0), gown, 0, 0.03, -0.9); train.rotation.x = 0.06;
  // Bodice, stomacher, necklace, ruff
  add(body, cyl(0.24, 0.31, 0.64, 8), gown, 0, 1.86, 0);
  add(body, cone(0.15, 0.5, 4), gold, 0, 1.78, 0.24).rotation.set(Math.PI, Math.PI / 4, 0);
  for (let i = 0; i < 9; i++) {
    const a = -1.2 + i * 0.3;
    add(body, ico(0.028), pearl, Math.sin(a) * 0.2, 2.1 - Math.cos(a) * 0.03 - (1 - Math.abs(Math.cos(a))) * 0.02, 0.15 + Math.cos(a) * 0.08);
  }
  add(body, box(0.07, 0.09, 0.03), ruby, 0, 2.04, 0.26);
  add(body, cyl(0.52, 0.46, 0.14, 16), ruff, 0, 2.18, 0);
  add(body, cyl(0.44, 0.52, 0.06, 16), lace, 0, 2.27, -0.04);
  add(body, cyl(0.08, 0.08, 0.12, 6), pale, 0, 2.28, 0);
  // Mantle / cape from the shoulders
  const cape = pivot(body, 0, 2.12, -0.22);
  add(cape, box(0.86, 1.9, 0.04), gownDark, 0, -0.95, 0).rotation.x = 0.1;
  add(cape, box(0.9, 0.08, 0.08), gold, 0, 0, 0.02);

  // Head (kept at the same height so the renderer's eye glows still line up)
  const head = pivot(body, 0, 2.48, 0);
  add(head, box(0.34, 0.42, 0.34), [pale, pale, hairM, pale, face, hairM], 0, 0, 0);
  add(head, box(0.4, 0.24, 0.38), hairM, 0, 0.22, -0.03);
  add(head, box(0.26, 0.28, 0.22), hairM, 0, 0.3, -0.18);
  add(head, box(0.1, 0.36, 0.1), hairM, -0.19, -0.02, -0.1);
  add(head, box(0.1, 0.36, 0.1), hairM, 0.19, -0.02, -0.1);
  // Gold crown-headdress: band, five points, a ruby
  add(head, cyl(0.24, 0.23, 0.08, 10), gold, 0, 0.3, 0.02);
  for (let i = 0; i < 5; i++) {
    const a = -0.9 + i * 0.45;
    add(head, cone(0.04, 0.18 + (i === 2 ? 0.08 : 0), 4), gold, Math.sin(a) * 0.22, 0.42 + (i === 2 ? 0.04 : 0), Math.cos(a) * 0.22);
  }
  add(head, box(0.06, 0.06, 0.03), ruby, 0, 0.32, 0.25);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2448 });
  psx(eyeMat);
  add(head, box(0.07, 0.04, 0.02), eyeMat, -0.08, 0.02, 0.175, false);
  add(head, box(0.07, 0.04, 0.02), eyeMat, 0.08, 0.02, 0.175, false);

  // Sleeves: puff, long sleeve, lace cuff, pale hands with claws
  const arms = [];
  for (const sx of [-0.34, 0.34]) {
    const sh = pivot(body, sx, 2.02, 0);
    const puff = add(sh, ico(0.16, 0), gown, 0, -0.02, 0); puff.scale.set(1, 0.9, 1);
    add(sh, cyl(0.09, 0.16, 0.8, 8), gown, 0, -0.44, 0);
    add(sh, cyl(0.17, 0.1, 0.14, 8, true), lace, 0, -0.86, 0);
    add(sh, box(0.1, 0.18, 0.09), pale, 0, -0.95, 0);
    for (const fx of [-0.03, 0, 0.03]) add(sh, cone(0.014, 0.14, 3), pale, fx, -1.1, 0.02).rotation.x = Math.PI;
    arms.push(sh);
  }

  const mats = [gown, gownDark, gold, ruff, pale, hairM, face, pearl, lace];
  return { root, body, skirt, cape, head, arms, eyeMat, mats };
}

// ---------------------------------------------------------------- weapons (left hand, extend along -Y)
export function buildWeapon(id, T, psx) {
  const g = new THREE.Group();
  const silver = lambert("w-silver", { color: 0xd8dde6, emissive: 0x30343c, flatShading: true }, psx);
  const goldW = lambert("w-gold", { color: 0xc9a24d, emissive: 0x2a1804, flatShading: true }, psx);
  const leather = lambert("w-leather", { color: 0x4a2c1c, flatShading: true }, psx);
  const ironW = lambert("w-iron", { map: T.iron, flatShading: true }, psx);
  const wood = lambert("w-wood", { map: T.wood, flatShading: true }, psx);
  const ruby = lambert("w-ruby", { color: 0xc0102a, emissive: 0x400008, flatShading: true }, psx);
  if (id === "dagger") {
    add(g, box(0.06, 0.16, 0.06), leather, 0, 0.02, 0);
    add(g, ico(0.04), goldW, 0, 0.12, 0);
    add(g, box(0.24, 0.04, 0.06), goldW, 0, -0.07, 0);
    add(g, box(0.03, 0.03, 0.07), ruby, 0, -0.07, 0.01);
    add(g, box(0.07, 0.42, 0.025), silver, 0, -0.3, 0);
    add(g, box(0.015, 0.4, 0.03), goldW, 0, -0.29, 0);
    add(g, cone(0.04, 0.12, 4), silver, 0, -0.57, 0).rotation.x = Math.PI;
  } else if (id === "mace") {
    add(g, box(0.07, 0.75, 0.07), wood, 0, -0.25, 0);
    for (const y of [0.0, -0.2, -0.4]) add(g, box(0.085, 0.03, 0.085), leather, 0, y, 0);
    add(g, box(0.1, 0.06, 0.1), goldW, 0, 0.1, 0);
    add(g, ico(0.15, 0), ironW, 0, -0.68, 0);
    for (const [x, z] of [[0.14, 0], [-0.14, 0], [0, 0.14], [0, -0.14]]) {
      const sp = add(g, cone(0.05, 0.14, 4), ironW, x, -0.68, z);
      sp.rotation.z = x > 0 ? -Math.PI / 2 : x < 0 ? Math.PI / 2 : 0;
      sp.rotation.x = z > 0 ? Math.PI / 2 : z < 0 ? -Math.PI / 2 : 0;
    }
    add(g, cone(0.05, 0.14, 4), ironW, 0, -0.86, 0).rotation.x = Math.PI;
    add(g, box(0.27, 0.05, 0.27), goldW, 0, -0.55, 0);
  } else if (id === "crossbow") {
    add(g, box(0.1, 0.62, 0.1), wood, 0, -0.18, 0.04);
    add(g, box(0.7, 0.05, 0.06), ironW, 0, -0.42, 0.04);
    for (const sx of [-0.35, 0.35]) add(g, box(0.06, 0.08, 0.08), goldW, sx, -0.42, 0.04);
    add(g, box(0.7, 0.015, 0.015), silver, 0, -0.34, 0.06);
    add(g, box(0.03, 0.4, 0.03), silver, 0, -0.42, 0.11);
    add(g, cone(0.03, 0.08, 4), silver, 0, -0.64, 0.11).rotation.x = Math.PI;
    add(g, box(0.06, 0.08, 0.06), goldW, 0, 0.1, 0.04);
    add(g, box(0.04, 0.12, 0.08), ironW, 0, 0.0, -0.04);
  } else if (id === "staff") {
    add(g, box(0.07, 1.3, 0.07), wood, 0, -0.35, 0);
    add(g, box(0.09, 0.04, 0.09), goldW, 0, 0.2, 0);
    add(g, box(0.12, 0.2, 0.12), ironW, 0, -1.02, 0);
    for (const sx of [-0.08, 0.08]) add(g, box(0.03, 0.22, 0.03), goldW, sx, -1.08, 0);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040 });
    psx(flameMat);
    const f = add(g, cone(0.11, 0.32, 5), flameMat, 0, -1.25, 0, false);
    f.rotation.x = Math.PI;
    g.userData.flame = f;
  }
  return g;
}

// ---------------------------------------------------------------- monsters (per-instance materials: flash & dissolve)
function mm(opts, psx) {
  const m = new THREE.MeshLambertMaterial({ flatShading: true, transparent: false, vertexColors: true, ...opts });
  psx(m);
  return m;
}

export function buildMonster(kind, T, psx) {
  const root = new THREE.Group();
  const body = pivot(root, 0, 0, 0);
  const mats = [];
  const M = (o) => { const m = mm(o, psx); mats.push(m); return m; };
  const rig = { root, body, mats, legs: null, arms: [], limbs: [], bats: [] };

  if (kind === "ghoul" || kind === "prisoner") {
    const prisoner = kind === "prisoner";
    const skin = M({ color: prisoner ? 0xa8a090 : 0x90a07a });
    const rags = M({ map: T.rags, alphaTest: 0.5, color: prisoner ? 0x8a7a60 : 0xffffff, side: THREE.DoubleSide });
    const face = M({ map: T.ghoulSkin, color: prisoner ? 0xd0c8b8 : 0xffffff });
    const dark = M({ color: 0x1a1210 });
    const claw = M({ color: 0xd8d0b0 });
    const torso = pivot(body, 0, 0.75, 0);
    torso.rotation.x = 0.45;
    add(torso, box(0.5, 0.62, 0.32), skin, 0, 0.3, 0);
    for (let i = 0; i < 3; i++) add(torso, box(0.42, 0.04, 0.05), dark, 0, 0.42 - i * 0.12, 0.165); // ribs showing
    add(torso, box(0.54, 0.4, 0.36), rags, 0, 0.12, 0);
    for (let i = 0; i < 4; i++) add(torso, box(0.1, 0.36, 0.02), rags, -0.18 + i * 0.12, -0.18, 0.19);
    const head = pivot(torso, 0, 0.74, 0.08);
    add(head, box(0.34, 0.32, 0.32), [skin, skin, skin, skin, face, skin], 0, 0.04, 0);
    add(head, box(0.36, 0.08, 0.34), dark, 0, 0.22, -0.02);
    const jaw = pivot(head, 0, -0.1, 0.06);
    add(jaw, box(0.26, 0.08, 0.22), skin, 0, -0.04, 0.02);
    rig.head = head; rig.jaw = jaw;
    rig.legs = []; rig.knees = [];
    for (const sx of [-0.13, 0.13]) {
      const hip = pivot(body, sx, 0.75, 0);
      add(hip, box(0.16, 0.38, 0.18), rags, 0, -0.18, 0);
      const knee = pivot(hip, 0, -0.36, 0);
      add(knee, box(0.13, 0.36, 0.14), skin, 0, -0.17, 0);
      add(knee, box(0.15, 0.06, 0.24), skin, 0, -0.36, 0.04);
      rig.legs.push(hip); rig.knees.push(knee);
    }
    rig.elbows = [];
    for (const sx of [-0.34, 0.34]) {
      const sh = pivot(torso, sx, 0.55, 0);
      add(sh, box(0.13, 0.42, 0.14), skin, 0, -0.2, 0);
      const el = pivot(sh, 0, -0.4, 0);
      el.rotation.x = -0.35;
      add(el, box(0.12, 0.38, 0.12), skin, 0, -0.18, 0);
      add(el, box(0.16, 0.12, 0.16), skin, 0, -0.42, 0.02);
      for (const fx of [-0.05, 0, 0.05]) add(el, cone(0.02, 0.12, 3), claw, fx, -0.54, 0.04).rotation.x = Math.PI;
      if (prisoner) add(el, cyl(0.1, 0.1, 0.1, 6), M({ color: 0x4a4650 }), 0, -0.3, 0); // manacle
      rig.arms.push(sh); rig.elbows.push(el);
    }
    if (prisoner) {
      // Iron collar and a dragging chain (links swing in the renderer)
      const iron = M({ color: 0x55525c, emissive: 0x08080a });
      add(head, cyl(0.24, 0.24, 0.08, 8), iron, 0, -0.16, 0);
      rig.chain = [];
      let parent = body;
      for (let i = 0; i < 6; i++) {
        const link = pivot(parent, i === 0 ? 0 : 0, i === 0 ? 0.55 : -0.16, i === 0 ? -0.12 : 0);
        add(link, box(0.05, 0.14, 0.09), iron, 0, -0.07, 0).rotation.y = i % 2 ? Math.PI / 2 : 0;
        rig.chain.push(link);
        parent = link;
      }
      add(parent, ico(0.13, 0), iron, 0, -0.22, 0); // the ball
    }
    rig.torso = torso;
    rig.eyeParent = head; rig.eyeY = 0.06; rig.eyeZ = 0.17;
    rig.eyeColor = prisoner ? 0xff7a40 : 0xffe27a; rig.barY = 1.95;
  } else if (kind === "maiden") {
    const dress = M({ map: T.shift });
    const pale = M({ color: 0xe6dcd6 });
    const hair = M({ color: 0x120a0e });
    const face = M({ map: T.maidenFace });
    add(body, box(0.42, 0.26, 0.86), dress, 0, 0.5, 0);
    for (let i = 0; i < 5; i++) add(body, box(0.08, 0.04, 0.24), dress, -0.16 + i * 0.08, 0.38, -0.5 - (i % 2) * 0.06);
    const head = pivot(body, 0, 0.62, 0.55);
    add(head, box(0.32, 0.32, 0.3), [hair, hair, hair, pale, face, hair], 0, 0, 0);
    for (let i = 0; i < 6; i++) add(head, box(0.05, 0.5 + (i % 3) * 0.08, 0.04), hair, -0.14 + i * 0.056, -0.22, 0.17);
    rig.head = head;
    for (const [sx, sz] of [[-0.24, 0.32], [0.24, 0.32], [-0.24, -0.3], [0.24, -0.3]]) {
      const hip = pivot(body, sx, 0.55, sz);
      const upper = add(hip, box(0.08, 0.32, 0.08), pale, sx > 0 ? 0.08 : -0.08, -0.12, 0);
      upper.rotation.z = sx > 0 ? 0.7 : -0.7;
      const lower = add(hip, box(0.07, 0.32, 0.07), pale, sx > 0 ? 0.2 : -0.2, -0.38, 0);
      lower.rotation.z = sx > 0 ? -0.2 : 0.2;
      add(hip, box(0.1, 0.04, 0.14), pale, sx > 0 ? 0.24 : -0.24, -0.54, 0.03);
      rig.limbs.push(hip);
    }
    rig.eyeParent = head; rig.eyeY = 0.02; rig.eyeZ = 0.17; rig.eyeColor = 0xff2448; rig.barY = 1.15;
  } else if (kind === "dweller") {
    const shroud = M({ color: 0xf2eee6 });
    const hem = M({ color: 0x9aa094 });
    const pale = M({ color: 0xe8e6e0 });
    const hair = M({ color: 0x0a0809 });
    const wet = M({ color: 0x161218 });
    body.rotation.x = 0.72;
    add(body, box(0.48, 0.34, 1.25), shroud, 0, 0.34, 0.08);
    add(body, box(0.52, 0.18, 0.8), hem, 0, 0.18, -0.5);
    for (let i = 0; i < 5; i++) add(body, box(0.1, 0.05, 0.3), hem, -0.2 + i * 0.1, 0.12, -0.95 - (i % 2) * 0.08);
    const head = pivot(body, 0, 0.32, 0.62);
    add(head, box(0.28, 0.26, 0.28), pale, 0, 0.02, 0.02);
    add(head, box(0.36, 0.2, 0.36), hair, 0, 0.16, 0.02);
    for (let i = 0; i < 9; i++) {
      const sx = -0.17 + i * 0.042;
      const len = 0.7 + (i % 3) * 0.18;
      add(head, box(0.045, len, 0.04), i % 2 ? hair : wet, sx, -len * 0.38, 0.14);
    }
    for (const sx of [-0.2, 0.2, 0]) add(head, box(0.05, 0.9, 0.04), hair, sx, -0.35, -0.06);
    rig.arms = [];
    for (const sx of [-0.22, 0.22]) {
      const sh = pivot(body, sx, 0.3, 0.35);
      add(sh, box(0.1, 0.12, 0.7), pale, 0, 0, 0.28);
      add(sh, box(0.14, 0.1, 0.16), pale, 0, -0.02, 0.66);
      for (const fx of [-0.04, 0, 0.04]) add(sh, box(0.025, 0.025, 0.14), pale, fx, -0.03, 0.8);
      rig.arms.push(sh);
    }
    rig.legs = [];
    for (const sx of [-0.14, 0.14]) {
      const hip = pivot(body, sx, 0.22, -0.4);
      add(hip, box(0.12, 0.1, 0.7), shroud, 0, 0, -0.28);
      rig.legs.push(hip);
    }
    rig.torso = body;
    rig.hideEyes = true;
    rig.eyeY = 0.55; rig.eyeZ = 0.85; rig.eyeColor = 0xc8e8d8; rig.barY = 0.95;
  } else if (kind === "skeleton") {
    const bone = M({ color: 0xd8ccaa });
    const dark = M({ color: 0x2a2018 });
    const shroud = M({ map: T.rags, alphaTest: 0.5, color: 0x9a9480, side: THREE.DoubleSide });
    const torso = pivot(body, 0, 0.8, 0);
    torso.rotation.x = 0.18;
    add(torso, box(0.06, 0.62, 0.06), bone, 0, 0.3, -0.04);
    for (let i = 0; i < 5; i++) add(torso, box(0.42 - i * 0.04, 0.04, 0.24 - i * 0.01), bone, 0, 0.52 - i * 0.09, 0.02);
    add(torso, box(0.5, 0.04, 0.06), bone, 0, 0.6, 0.06); // clavicles
    add(torso, box(0.3, 0.1, 0.2), bone, 0, -0.02, 0);
    add(torso, box(0.46, 0.44, 0.05), shroud, 0, 0.28, -0.16);
    add(torso, box(0.36, 0.3, 0.05), shroud, 0, -0.12, 0.12);
    const skull = pivot(torso, 0, 0.78, 0.04);
    add(skull, box(0.3, 0.3, 0.32), bone, 0, 0, 0);
    add(skull, box(0.08, 0.08, 0.02), dark, -0.07, 0.02, 0.16);
    add(skull, box(0.08, 0.08, 0.02), dark, 0.07, 0.02, 0.16);
    add(skull, box(0.04, 0.05, 0.02), dark, 0, -0.06, 0.16);
    const jaw = pivot(skull, 0, -0.14, 0.04);
    add(jaw, box(0.22, 0.08, 0.2), bone, 0, -0.04, 0.02);
    for (let i = 0; i < 4; i++) add(jaw, box(0.03, 0.03, 0.02), M({ color: 0xf0e8d0 }), -0.06 + i * 0.04, 0.0, 0.12);
    rig.head = skull; rig.jaw = jaw;
    rig.legs = []; rig.knees = [];
    for (const sx of [-0.11, 0.11]) {
      const hip = pivot(body, sx, 0.78, 0);
      add(hip, box(0.07, 0.4, 0.07), bone, 0, -0.2, 0);
      const knee = pivot(hip, 0, -0.39, 0);
      add(knee, box(0.09, 0.07, 0.09), bone, 0, 0, 0);
      add(knee, box(0.06, 0.36, 0.06), bone, 0, -0.19, 0);
      add(knee, box(0.1, 0.05, 0.18), bone, 0, -0.38, 0.05);
      rig.legs.push(hip); rig.knees.push(knee);
    }
    rig.elbows = [];
    for (const sx of [-0.27, 0.27]) {
      const sh = pivot(torso, sx, 0.55, 0);
      add(sh, box(0.06, 0.4, 0.06), bone, 0, -0.2, 0);
      const el = pivot(sh, 0, -0.4, 0);
      el.rotation.x = -0.25;
      add(el, box(0.05, 0.36, 0.05), bone, 0, -0.17, 0);
      add(el, box(0.1, 0.08, 0.04), bone, 0, -0.38, 0);
      for (const fx of [-0.035, 0, 0.035]) add(el, box(0.015, 0.1, 0.015), bone, fx, -0.47, 0);
      rig.arms.push(sh); rig.elbows.push(el);
    }
    rig.torso = torso;
    rig.eyeParent = skull; rig.eyeY = 0.02; rig.eyeZ = 0.17;
    rig.eyeColor = 0x7ad8ff; rig.barY = 2.0;
  } else if (kind === "brute") {
    const flesh = M({ color: 0x8a7a6a });
    const sack = M({ color: 0x6a5a40 });
    const apron = M({ color: 0x3a2618 });
    const iron = M({ color: 0x5a5a62 });
    const wood = M({ map: T.wood });
    const stitch = M({ color: 0x0a0606 });
    const torso = pivot(body, 0, 1.0, 0);
    torso.rotation.x = 0.3;
    add(torso, box(0.95, 0.85, 0.6), flesh, 0, 0.42, 0);
    add(torso, box(0.8, 0.4, 0.2), flesh, 0, 0.08, 0.3); // belly
    add(torso, box(0.98, 0.9, 0.08), apron, 0, 0.3, 0.42);
    for (const sx of [-0.3, 0.3]) add(torso, box(0.08, 0.6, 0.04), apron, sx, 0.65, 0.3).rotation.x = -0.3;
    add(torso, box(0.12, 0.12, 0.04), iron, 0, 0.0, 0.47); // buckle
    const head = pivot(torso, 0, 1.0, 0.12);
    add(head, box(0.44, 0.48, 0.44), sack, 0, 0.02, 0);
    add(head, box(0.22, 0.04, 0.02), stitch, 0, -0.04, 0.23);
    for (let i = 0; i < 5; i++) add(head, box(0.015, 0.08, 0.025), stitch, -0.08 + i * 0.04, -0.04, 0.23);
    add(head, cone(0.12, 0.2, 4), sack, 0, 0.32, -0.06).rotation.x = -0.4;
    rig.head = head;
    rig.legs = []; rig.knees = [];
    for (const sx of [-0.25, 0.25]) {
      const hip = pivot(body, sx, 1.0, 0);
      add(hip, box(0.32, 0.5, 0.34), apron, 0, -0.25, 0);
      const knee = pivot(hip, 0, -0.5, 0);
      add(knee, box(0.28, 0.4, 0.3), apron, 0, -0.18, 0);
      add(knee, box(0.32, 0.14, 0.42), M({ color: 0x241810 }), 0, -0.43, 0.06);
      rig.legs.push(hip); rig.knees.push(knee);
    }
    rig.elbows = [];
    for (const sx of [-0.62, 0.62]) {
      const sh = pivot(torso, sx, 0.75, 0);
      add(sh, ico(0.2, 0), flesh, 0, 0, 0);
      add(sh, box(0.28, 0.46, 0.28), flesh, 0, -0.24, 0);
      const el = pivot(sh, 0, -0.48, 0);
      el.rotation.x = -0.2;
      add(el, box(0.26, 0.42, 0.26), flesh, 0, -0.2, 0);
      add(el, box(0.32, 0.24, 0.32), flesh, 0, -0.48, 0.02);
      rig.arms.push(sh); rig.elbows.push(el);
    }
    const spade = pivot(rig.elbows[1], 0, -0.5, 0.1);
    add(spade, box(0.07, 1.5, 0.07), wood, 0, 0, 0.3).rotation.x = Math.PI / 2;
    add(spade, box(0.4, 0.04, 0.5), iron, 0, 0, 1.2);
    add(spade, box(0.24, 0.06, 0.06), wood, 0, 0, -0.45);
    rig.torso = torso;
    rig.eyeParent = head; rig.eyeY = 0.08; rig.eyeZ = 0.23; rig.eyeColor = 0xff8a30; rig.barY = 2.7;
  } else if (kind === "banshee") {
    const veil = M({ color: 0xb8c8e0, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    const pale = M({ color: 0xe8f0ff, emissive: 0x203040 });
    const hair = M({ color: 0x1a1c24 });
    const mouth = M({ color: 0x020204 });
    const float = pivot(body, 0, 0.6, 0);
    add(float, cone(0.42, 1.3, 9).translate(0, 0, 0), veil, 0, 0.35, 0).rotation.x = Math.PI;
    add(float, cyl(0.2, 0.32, 0.5, 8, true), veil, 0, 0.9, 0);
    const head = pivot(float, 0, 1.15, 0.02);
    add(head, box(0.3, 0.36, 0.28), pale, 0, 0, 0);
    add(head, box(0.36, 0.5, 0.1), hair, 0, -0.07, -0.17);
    for (let i = 0; i < 6; i++) add(head, box(0.04, 0.7 + (i % 2) * 0.2, 0.04), hair, -0.15 + i * 0.06, -0.35, -0.1);
    const jaw = add(head, box(0.12, 0.16, 0.02), mouth, 0, -0.13, 0.15);
    rig.jaw = jaw; rig.head = head;
    rig.tatters = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const tp = pivot(float, Math.cos(a) * 0.36, -0.25, Math.sin(a) * 0.36);
      add(tp, box(0.12, 0.5 + (i % 3) * 0.12, 0.02), veil, 0, -0.25, 0).rotation.y = -a;
      rig.tatters.push(tp);
    }
    for (const sx of [-0.3, 0.3]) {
      const sh = pivot(float, sx, 0.95, 0.05);
      add(sh, box(0.07, 0.7, 0.07), pale, 0, -0.35, 0);
      add(sh, box(0.2, 0.5, 0.02), veil, sx > 0 ? 0.08 : -0.08, -0.3, -0.03);
      for (const fx of [-0.03, 0, 0.03]) add(sh, box(0.015, 0.16, 0.015), pale, fx, -0.76, 0);
      rig.arms.push(sh);
    }
    rig.float = float;
    rig.eyeParent = head; rig.eyeY = 0.04; rig.eyeZ = 0.15; rig.eyeColor = 0x9ad8ff; rig.barY = 2.3;
  } else if (kind === "slime" || kind === "slimelet") {
    const k = kind === "slime" ? 1 : 0.62;
    const goo = M({ color: 0xa0101e, transparent: true, opacity: 0.86 });
    const core = M({ color: 0x6aff5a, emissive: 0x1f7a14 });
    const blob = pivot(body, 0, 0, 0);
    const shell = add(blob, ico(0.42 * k, 1), goo, 0, 0.36 * k, 0);
    shell.scale.set(1.15, 0.82, 1.15);
    add(blob, ico(0.17 * k, 0), core, 0, 0.36 * k, 0.04);
    for (const [sx, sy, sz] of [[0.12, 0.5, 0.1], [-0.15, 0.3, -0.08], [0.05, 0.22, 0.18]]) add(blob, ico(0.05 * k, 0), core, sx * k, sy * k, sz * k);
    for (const [sx, sz] of [[-0.3, 0.18], [0.28, -0.22], [0.05, -0.34], [0.3, 0.2]]) add(blob, ico(0.1 * k, 0), goo, sx * k, 0.08 * k, sz * k);
    rig.blob = blob;
    rig.slimeK = k;
    rig.eyeY = 0.5 * k; rig.eyeZ = 0.36 * k; rig.eyeColor = 0xd8ff6a; rig.barY = 1.05 * k + 0.2;
  } else if (kind === "ironmaiden") {
    // Original walking torture cabinet: a riveted iron sarcophagus with a stern mask, waddling on stumpy legs.
    // Its doors swing open (spikes inside) when it winds up to bite.
    const iron = M({ map: T.iron, color: 0x9a96a4 });
    const rust = M({ color: 0x6a3a22 });
    const mask = M({ color: 0xb8b2bc, emissive: 0x101014 });
    const spike = M({ color: 0xd0ccd6, emissive: 0x202024 });
    const gore = M({ color: 0x5a0610 });
    const shell = pivot(body, 0, 0.55, 0);
    add(shell, box(0.8, 1.7, 0.46), iron, 0, 0.85, -0.08);
    add(shell, cone(0.46, 0.5, 4), iron, 0, 1.92, -0.08).rotation.y = Math.PI / 4;
    add(shell, box(0.84, 0.08, 0.5), rust, 0, 0.05, -0.08);
    for (let i = 0; i < 4; i++) add(shell, box(0.84, 0.04, 0.5), rust, 0, 0.4 + i * 0.4, -0.08);
    add(shell, box(0.7, 1.5, 0.04), gore, 0, 0.85, 0.15); // the bloody interior
    for (let i = 0; i < 6; i++) add(shell, cone(0.035, 0.18, 4), spike, -0.2 + (i % 3) * 0.2, 0.5 + Math.floor(i / 3) * 0.6, 0.22).rotation.x = Math.PI / 2;
    // Doors (pivot on the outer edges)
    rig.doors = [];
    for (const sx of [-1, 1]) {
      const hinge = pivot(shell, sx * 0.4, 0.85, 0.17);
      add(hinge, box(0.4, 1.66, 0.08), iron, -sx * 0.2, 0, 0.04);
      for (let i = 0; i < 4; i++) add(hinge, cone(0.03, 0.14, 4), spike, -sx * (0.12 + (i % 2) * 0.12), -0.4 + Math.floor(i / 2) * 0.7, -0.06).rotation.x = -Math.PI / 2;
      rig.doors.push(hinge);
    }
    const face = pivot(shell, 0, 1.55, 0.25);
    add(face, box(0.34, 0.4, 0.06), mask, 0, 0, 0);
    add(face, box(0.24, 0.04, 0.03), M({ color: 0x080608 }), 0, -0.1, 0.03);
    add(face, box(0.36, 0.08, 0.08), iron, 0, 0.2, 0);
    rig.head = face;
    rig.legs = [];
    for (const sx of [-0.2, 0.2]) {
      const hip = pivot(body, sx, 0.6, 0);
      add(hip, box(0.16, 0.42, 0.18), M({ color: 0x3a2a24 }), 0, -0.2, 0);
      add(hip, box(0.22, 0.12, 0.3), iron, 0, -0.5, 0.04);
      rig.legs.push(hip);
    }
    rig.shell = shell;
    rig.eyeParent = face; rig.eyeY = 0.04; rig.eyeZ = 0.05; rig.eyeColor = 0xff3a2a; rig.barY = 2.9;
  } else if (kind === "wraith") {
    // Original portrait wraith: a gaunt figure in smeared oil-paint robes that carries its own gilt frame.
    const paint = M({ color: 0x3a2a4a, transparent: true, opacity: 0.88, side: THREE.DoubleSide });
    const paint2 = M({ color: 0x6a3020, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    const gilt = M({ color: 0xc9a24d, emissive: 0x2a1804 });
    const pale = M({ color: 0xd8c8b0, emissive: 0x18100a });
    const black = M({ color: 0x050306 });
    const float = pivot(body, 0, 0.5, 0);
    add(float, cone(0.38, 1.4, 8), paint, 0, 0.5, 0).rotation.x = Math.PI;
    add(float, cyl(0.18, 0.3, 0.6, 8), paint2, 0, 1.1, 0);
    // the frame it is stepping out of
    const frame = pivot(float, 0, 0.95, -0.12);
    for (const [w, h, x, y] of [[1.2, 0.1, 0, 0.8], [1.2, 0.1, 0, -0.8], [0.1, 1.7, 0.6, 0], [0.1, 1.7, -0.6, 0]]) add(frame, box(w, h, 0.08), gilt, x, y, 0);
    for (const [x, y] of [[0.6, 0.8], [-0.6, 0.8], [0.6, -0.8], [-0.6, -0.8]]) add(frame, ico(0.08, 0), gilt, x, y, 0.02);
    const head = pivot(float, 0, 1.55, 0.04);
    add(head, box(0.28, 0.34, 0.26), pale, 0, 0, 0);
    add(head, box(0.08, 0.1, 0.02), black, -0.07, 0.03, 0.14);
    add(head, box(0.08, 0.1, 0.02), black, 0.07, 0.03, 0.14);
    add(head, box(0.14, 0.14, 0.02), black, 0, -0.1, 0.14);
    add(head, box(0.32, 0.12, 0.3), paint, 0, 0.18, -0.02);
    rig.head = head;
    rig.tatters = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const tp = pivot(float, Math.cos(a) * 0.3, -0.18, Math.sin(a) * 0.3);
      add(tp, box(0.1, 0.5, 0.02), i % 2 ? paint : paint2, 0, -0.25, 0).rotation.y = -a;
      rig.tatters.push(tp);
    }
    for (const sx of [-0.28, 0.28]) {
      const sh = pivot(float, sx, 1.3, 0.04);
      add(sh, box(0.08, 0.7, 0.08), pale, 0, -0.35, 0);
      for (const fx of [-0.03, 0, 0.03]) add(sh, box(0.015, 0.2, 0.015), pale, fx, -0.8, 0);
      rig.arms.push(sh);
    }
    rig.float = float; rig.frame = frame;
    rig.eyeParent = head; rig.eyeY = 0.03; rig.eyeZ = 0.15; rig.eyeColor = 0xffd86a; rig.barY = 2.5;
  } else if (kind === "gargoyle") {
    // Original boss: the Belfry Gargoyle — a horned stone beast with bat wings, cracked by centuries of frost.
    const stone = M({ map: T.towerWall || T.stone, color: 0xb8b8c6, emissive: 0x1c1a24 });
    const dark = M({ color: 0x50505c, emissive: 0x0c0a10 });
    const ember = M({ color: 0xff6a20, emissive: 0xff4010 });
    const torso = pivot(body, 0, 1.4, 0);
    torso.rotation.x = 0.35;
    add(torso, box(1.2, 1.1, 0.9), stone, 0, 0.5, 0);
    add(torso, box(1.0, 0.5, 0.7), stone, 0, -0.2, 0.05);
    add(torso, box(0.5, 0.6, 0.2), dark, 0, 0.4, 0.46); // cracked chest plate
    add(torso, box(0.12, 0.5, 0.06), ember, 0.06, 0.42, 0.56); // molten crack
    const head = pivot(torso, 0, 1.25, 0.35);
    add(head, box(0.7, 0.6, 0.7), stone, 0, 0, 0);
    add(head, box(0.6, 0.24, 0.4), stone, 0, -0.22, 0.4); // snout
    for (const sx of [-0.3, 0.3]) {
      const horn = add(head, cone(0.1, 0.6, 5), dark, sx, 0.42, -0.1);
      horn.rotation.set(-0.5, 0, sx > 0 ? -0.5 : 0.5);
    }
    for (let i = 0; i < 4; i++) add(head, cone(0.04, 0.14, 4), M({ color: 0xe8e0d0 }), -0.18 + i * 0.12, -0.36, 0.58).rotation.x = Math.PI;
    const jaw = pivot(head, 0, -0.32, 0.1);
    add(jaw, box(0.5, 0.12, 0.5), stone, 0, -0.04, 0.2);
    rig.head = head; rig.jaw = jaw;
    rig.wings = [];
    for (const sx of [-1, 1]) {
      const w = pivot(torso, sx * 0.55, 0.9, -0.35);
      const bone1 = add(w, box(1.6, 0.12, 0.12), dark, sx * 0.8, 0.3, 0); bone1.rotation.z = sx * 0.4;
      for (let k = 0; k < 3; k++) {
        const memb = add(w, box(0.6, 1.2 - k * 0.2, 0.04), stone, sx * (0.5 + k * 0.5), -0.15 + k * 0.1, 0);
        memb.rotation.z = sx * (0.25 + k * 0.1);
      }
      rig.wings.push(w);
    }
    rig.legs = []; rig.knees = [];
    for (const sx of [-0.4, 0.4]) {
      const hip = pivot(body, sx, 1.3, 0);
      add(hip, box(0.4, 0.7, 0.45), stone, 0, -0.3, 0);
      const knee = pivot(hip, 0, -0.62, 0.1);
      add(knee, box(0.32, 0.6, 0.34), stone, 0, -0.25, -0.05);
      add(knee, box(0.44, 0.14, 0.6), dark, 0, -0.6, 0.08);
      for (const fx of [-0.12, 0, 0.12]) add(knee, cone(0.05, 0.16, 4), M({ color: 0xe8e0d0 }), fx, -0.62, 0.42).rotation.x = Math.PI / 2;
      rig.legs.push(hip); rig.knees.push(knee);
    }
    rig.elbows = [];
    for (const sx of [-0.78, 0.78]) {
      const sh = pivot(torso, sx, 0.8, 0.1);
      add(sh, box(0.36, 0.7, 0.36), stone, 0, -0.32, 0);
      const el = pivot(sh, 0, -0.66, 0);
      el.rotation.x = -0.4;
      add(el, box(0.3, 0.6, 0.3), stone, 0, -0.28, 0);
      for (const fx of [-0.1, 0, 0.1]) add(el, cone(0.05, 0.24, 4), dark, fx, -0.68, 0.06).rotation.x = Math.PI;
      rig.arms.push(sh); rig.elbows.push(el);
    }
    rig.torso = torso;
    rig.eyeParent = head; rig.eyeY = 0.08; rig.eyeZ = 0.36; rig.eyeColor = 0xff6a20; rig.barY = 4.2; rig.eyeScale = 0.3;
  } else {
    // Bat swarm
    const fur = M({ color: 0x2a1c24 });
    const wing = M({ color: 0x4a2030, side: THREE.DoubleSide });
    for (let i = 0; i < 8; i++) {
      const b = pivot(body, 0, 0, 0);
      add(b, box(0.14, 0.12, 0.2), fur, 0, 0, 0);
      add(b, cone(0.025, 0.07, 3), fur, -0.04, 0.09, 0.06);
      add(b, cone(0.025, 0.07, 3), fur, 0.04, 0.09, 0.06);
      const wl = pivot(b, -0.07, 0, 0);
      add(wl, box(0.32, 0.02, 0.16), wing, -0.16, 0, 0);
      add(wl, box(0.14, 0.02, 0.1), wing, -0.36, 0, -0.04);
      const wr = pivot(b, 0.07, 0, 0);
      add(wr, box(0.32, 0.02, 0.16), wing, 0.16, 0, 0);
      add(wr, box(0.14, 0.02, 0.1), wing, 0.36, 0, -0.04);
      rig.bats.push({ b, wl, wr, phase: i * 0.8, r: 0.25 + (i % 3) * 0.2, h: 1.0 + (i % 4) * 0.22 });
    }
    rig.eyeY = 1.3; rig.eyeZ = 0.1; rig.eyeColor = 0xff3030; rig.barY = 2.0;
  }
  return rig;
}
