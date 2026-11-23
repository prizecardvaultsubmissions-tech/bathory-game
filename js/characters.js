import * as THREE from "./vendor/three.module.min.js";

// Low-poly, blocky, FF7-era proportioned characters built in code (original designs).

const matCache = new Map();
export function lambert(key, opts, psx) {
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshLambertMaterial(opts);
  psx(m);
  matCache.set(key, m);
  return m;
}

function add(parent, geo, mat, x, y, z, shadow = true) {
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

export function buildInvestigator(T, psx) {
  const root = new THREE.Group();
  const body = pivot(root, 0, 0, 0);

  const trousers = lambert("trousers", { color: 0x2a2c3a, flatShading: true }, psx);
  const boots = lambert("boots", { color: 0x1c1410, flatShading: true }, psx);
  const coat = lambert("coat", { map: T.coat, flatShading: true }, psx);
  const scarf = lambert("scarf", { color: 0x9a0c26, flatShading: true }, psx);
  const skin = lambert("skin", { color: 0xd6a880, flatShading: true }, psx);
  const hair = lambert("hair", { color: 0x3a281c, flatShading: true }, psx);
  const cap = lambert("cap", { color: 0x3b3226, flatShading: true }, psx);
  const face = lambert("pface", { map: T.playerFace, flatShading: true }, psx);
  const iron = lambert("lanternIron", { color: 0x2a2620, flatShading: true }, psx);

  const legs = [];
  for (const sx of [-0.13, 0.13]) {
    const hip = pivot(body, sx, 0.74, 0);
    add(hip, box(0.19, 0.66, 0.21), trousers, 0, -0.33, 0);
    add(hip, box(0.21, 0.14, 0.3), boots, 0, -0.67, 0.04);
    legs.push(hip);
  }

  // Trench coat torso + flared skirt
  add(body, box(0.58, 0.62, 0.34), coat, 0, 1.08, 0);
  add(body, new THREE.CylinderGeometry(0.3, 0.4, 0.46, 6), coat, 0, 0.62, 0);
  add(body, box(0.52, 0.1, 0.38), scarf, 0, 1.4, 0);
  add(body, box(0.16, 0.3, 0.06), scarf, 0.14, 1.24, 0.19);

  // Head (big, blocky)
  const headMats = [skin, skin, hair, skin, face, hair];
  add(body, box(0.42, 0.42, 0.4), headMats, 0, 1.66, 0);
  add(body, box(0.47, 0.08, 0.52), cap, 0, 1.9, 0.05);
  add(body, box(0.4, 0.12, 0.4), cap, 0, 1.98, 0);

  const arms = [];
  for (const sx of [-0.37, 0.37]) {
    const sh = pivot(body, sx, 1.34, 0);
    add(sh, box(0.17, 0.56, 0.19), coat, 0, -0.28, 0);
    add(sh, box(0.15, 0.15, 0.15), skin, 0, -0.62, 0);
    arms.push(sh);
  }

  // Lantern held in right hand (arm raised forward)
  const lanternHolder = pivot(arms[1], 0, -0.7, 0);
  const lantern = pivot(lanternHolder, 0, -0.08, 0);
  add(lantern, box(0.2, 0.04, 0.2), iron, 0, 0.14, 0);
  add(lantern, box(0.2, 0.04, 0.2), iron, 0, -0.14, 0);
  const glassMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
  psx(glassMat);
  add(lantern, box(0.15, 0.24, 0.15), glassMat, 0, 0, 0, false);
  add(lantern, box(0.04, 0.12, 0.04), iron, 0, 0.22, 0);

  return { root, body, legs, arms, lantern, glassMat };
}

export function buildCountess(T, psx) {
  const root = new THREE.Group();
  const body = pivot(root, 0, 0, 0);

  const gown = lambert("gown", { map: T.gown, flatShading: true }, psx);
  const gold = lambert("gold", { color: 0xc9a24d, emissive: 0x2a1a04, flatShading: true }, psx);
  const ruff = lambert("ruff", { map: T.ruff, flatShading: true }, psx);
  const pale = lambert("pale", { color: 0xe6d6d2, flatShading: true }, psx);
  const hairM = lambert("chair", { color: 0x140a0e, flatShading: true }, psx);
  const face = lambert("cface", { map: T.countessFace, flatShading: true }, psx);

  const skirt = pivot(body, 0, 0, 0);
  add(skirt, new THREE.CylinderGeometry(0.3, 0.78, 1.55, 8), gown, 0, 0.78, 0);
  add(skirt, new THREE.CylinderGeometry(0.8, 0.8, 0.07, 8), gold, 0, 0.04, 0);
  add(body, new THREE.CylinderGeometry(0.25, 0.3, 0.62, 6), gown, 0, 1.84, 0);
  add(body, box(0.12, 0.5, 0.04), gold, 0, 1.8, 0.26);
  add(body, new THREE.CylinderGeometry(0.5, 0.46, 0.14, 12), ruff, 0, 2.18, 0);
  add(body, new THREE.CylinderGeometry(0.08, 0.08, 0.12, 6), pale, 0, 2.28, 0);

  const headMats = [pale, pale, hairM, pale, face, hairM];
  add(body, box(0.34, 0.42, 0.34), headMats, 0, 2.48, 0);
  add(body, box(0.4, 0.22, 0.38), hairM, 0, 2.7, -0.03);
  add(body, box(0.24, 0.24, 0.2), hairM, 0, 2.78, -0.16); // bun
  // gold coif / headdress band with pearls
  add(body, box(0.46, 0.1, 0.12), gold, 0, 2.76, 0.1);
  add(body, new THREE.ConeGeometry(0.06, 0.16, 4), gold, 0, 2.88, 0.1);

  // Glowing eyes
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2448 });
  psx(eyeMat);
  add(body, box(0.07, 0.04, 0.02), eyeMat, -0.08, 2.5, 0.175, false);
  add(body, box(0.07, 0.04, 0.02), eyeMat, 0.08, 2.5, 0.175, false);

  const arms = [];
  for (const sx of [-0.34, 0.34]) {
    const sh = pivot(body, sx, 2.02, 0);
    add(sh, new THREE.CylinderGeometry(0.09, 0.17, 0.82, 6), gown, 0, -0.41, 0);
    add(sh, box(0.09, 0.2, 0.09), pale, 0, -0.9, 0);
    // long nails
    add(sh, box(0.08, 0.1, 0.04), pale, 0, -1.04, 0.02);
    arms.push(sh);
  }

  return { root, body, skirt, arms, eyeMat };
}
