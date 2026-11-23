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

  const mats = [gown, gold, ruff, pale, hairM, face];
  return { root, body, skirt, arms, eyeMat, mats };
}

// ---------------- Weapons (held in the left hand, extending along -Y of the arm) ----------------
export function buildWeapon(id, T, psx) {
  const g = new THREE.Group();
  const silver = lambert("w-silver", { color: 0xd8dde6, emissive: 0x30343c, flatShading: true }, psx);
  const goldW = lambert("w-gold", { color: 0xc9a24d, emissive: 0x2a1804, flatShading: true }, psx);
  const leather = lambert("w-leather", { color: 0x4a2c1c, flatShading: true }, psx);
  const ironW = lambert("w-iron", { map: T.iron, flatShading: true }, psx);
  const wood = lambert("w-wood", { map: T.wood, flatShading: true }, psx);
  if (id === "dagger") {
    add(g, box(0.06, 0.16, 0.06), leather, 0, 0.02, 0);
    add(g, box(0.22, 0.04, 0.06), goldW, 0, -0.07, 0);
    add(g, box(0.07, 0.42, 0.025), silver, 0, -0.3, 0);
    add(g, new THREE.ConeGeometry(0.04, 0.12, 4), silver, 0, -0.57, 0).rotation.x = Math.PI;
  } else if (id === "mace") {
    add(g, box(0.07, 0.75, 0.07), wood, 0, -0.25, 0);
    add(g, box(0.1, 0.06, 0.1), goldW, 0, 0.1, 0);
    add(g, box(0.24, 0.26, 0.24), ironW, 0, -0.68, 0);
    for (const [x, z] of [[0.14, 0], [-0.14, 0], [0, 0.14], [0, -0.14]]) {
      const sp = add(g, new THREE.ConeGeometry(0.05, 0.14, 4), ironW, x, -0.68, z);
      sp.rotation.z = x > 0 ? -Math.PI / 2 : x < 0 ? Math.PI / 2 : 0;
      sp.rotation.x = z > 0 ? Math.PI / 2 : z < 0 ? -Math.PI / 2 : 0;
    }
    add(g, box(0.27, 0.05, 0.27), goldW, 0, -0.55, 0);
  } else if (id === "crossbow") {
    // stock points forward (-Y), bow limbs across X
    add(g, box(0.1, 0.62, 0.1), wood, 0, -0.18, 0.04);
    add(g, box(0.7, 0.05, 0.06), ironW, 0, -0.42, 0.04);
    add(g, box(0.7, 0.015, 0.015), silver, 0, -0.34, 0.06);
    add(g, box(0.03, 0.4, 0.03), silver, 0, -0.42, 0.11); // loaded bolt
    add(g, box(0.06, 0.08, 0.06), goldW, 0, 0.1, 0.04);
  } else if (id === "staff") {
    add(g, box(0.07, 1.3, 0.07), wood, 0, -0.35, 0);
    add(g, box(0.12, 0.2, 0.12), ironW, 0, -1.02, 0);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040 });
    psx(flameMat);
    const f = add(g, new THREE.ConeGeometry(0.11, 0.32, 5), flameMat, 0, -1.25, 0, false);
    f.rotation.x = Math.PI;
    g.userData.flame = f;
  }
  return g;
}

// ---------------- Monsters (per-instance materials so they can flash & dissolve) ----------------
function mm(opts, psx) {
  const m = new THREE.MeshLambertMaterial({ flatShading: true, transparent: false, ...opts });
  psx(m);
  return m;
}

export function buildMonster(kind, T, psx) {
  const root = new THREE.Group();
  const body = pivot(root, 0, 0, 0);
  const mats = [];
  const M = (o) => { const m = mm(o, psx); mats.push(m); return m; };
  const rig = { root, body, mats, legs: null, arms: [], limbs: [], bats: [] };

  if (kind === "ghoul") {
    const skin = M({ color: 0x90a07a });
    const rags = M({ map: T.rags, alphaTest: 0.5 });
    const face = M({ map: T.ghoulSkin });
    const torso = pivot(body, 0, 0.75, 0);
    torso.rotation.x = 0.45; // hunched
    add(torso, box(0.52, 0.62, 0.34), rags, 0, 0.3, 0);
    add(torso, box(0.34, 0.34, 0.32), [skin, skin, skin, skin, face, skin], 0, 0.78, 0.08);
    rig.legs = [];
    for (const sx of [-0.13, 0.13]) {
      const hip = pivot(body, sx, 0.75, 0);
      add(hip, box(0.16, 0.72, 0.18), rags, 0, -0.36, 0);
      rig.legs.push(hip);
    }
    for (const sx of [-0.34, 0.34]) {
      const sh = pivot(torso, sx, 0.55, 0);
      add(sh, box(0.13, 0.78, 0.14), skin, 0, -0.39, 0);
      add(sh, box(0.16, 0.14, 0.16), skin, 0, -0.82, 0.02);
      rig.arms.push(sh);
    }
    rig.torso = torso;
    rig.eyeY = 1.48; rig.eyeZ = 0.45; rig.eyeColor = 0xffe27a; rig.barY = 1.95;
  } else if (kind === "maiden") {
    const dress = M({ map: T.shift });
    const pale = M({ color: 0xe6dcd6 });
    const hair = M({ color: 0x120a0e });
    const face = M({ map: T.maidenFace });
    add(body, box(0.42, 0.26, 0.86), dress, 0, 0.5, 0);
    add(body, box(0.32, 0.32, 0.3), [hair, hair, hair, pale, face, hair], 0, 0.62, 0.55);
    add(body, box(0.36, 0.5, 0.08), hair, 0, 0.42, 0.72); // hair curtain hanging
    for (const [sx, sz] of [[-0.24, 0.32], [0.24, 0.32], [-0.24, -0.3], [0.24, -0.3]]) {
      const hip = pivot(body, sx, 0.55, sz);
      const upper = add(hip, box(0.08, 0.5, 0.08), pale, sx > 0 ? 0.12 : -0.12, -0.18, 0);
      upper.rotation.z = sx > 0 ? 0.7 : -0.7;
      rig.limbs.push(hip);
    }
    rig.eyeY = 0.64; rig.eyeZ = 0.72; rig.eyeColor = 0xff2448; rig.barY = 1.15;
  } else {
    const fur = M({ color: 0x2a1c24 });
    const wing = M({ color: 0x4a2030, side: THREE.DoubleSide });
    for (let i = 0; i < 7; i++) {
      const b = pivot(body, 0, 0, 0);
      add(b, box(0.14, 0.12, 0.2), fur, 0, 0, 0);
      const wl = pivot(b, -0.07, 0, 0);
      add(wl, box(0.32, 0.02, 0.16), wing, -0.16, 0, 0);
      const wr = pivot(b, 0.07, 0, 0);
      add(wr, box(0.32, 0.02, 0.16), wing, 0.16, 0, 0);
      rig.bats.push({ b, wl, wr, phase: i * 0.9, r: 0.25 + (i % 3) * 0.2, h: 1.0 + (i % 4) * 0.22 });
    }
    rig.eyeY = 1.3; rig.eyeZ = 0.1; rig.eyeColor = 0xff3030; rig.barY = 2.0;
  }
  return rig;
}
