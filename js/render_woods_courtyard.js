import * as THREE from "./vendor/three.module.min.js";
import { TILE_SIZE } from "./map.js";

const S = 1 / 22;
const TILE = TILE_SIZE * S;
const WALL_H = 3.2;
const tileCenter = (tx, ty) => ({ x: (tx + 0.5) * TILE, z: (ty + 0.5) * TILE });

export function buildWoodsCourtyardProps(renderer, level, B, mats, smallFlames) {
  const { woodMat, stoneMat, goldMat, ironMat, waxMat, earthMat, barkMat, boneMat, darkStone } = mats;
  const T = renderer.T;
  const rnd = renderer._rng;
  const kind = level.kind;
  const isOpen = (tx, ty) => ty >= 0 && ty < level.rows && tx >= 0 && tx < level.cols && (level.grid[ty][tx] === 0 || level.grid[ty][tx] === 3);

  const mossMat = renderer._mat("wc-moss", { color: 0x3b5834 });
  const waterMat = renderer._mat("wc-water", { color: 0x16242a, emissive: 0x040b0e });
  const strawMat = renderer._mat("wc-straw", { color: 0xb09044 });
  const timberMat = renderer._mat("wc-timber", { map: T.timberWall || T.wood });
  const ashMat = renderer._mat("wc-ash", { color: 0x1e1816 });

  for (const p of level.props) {
    const c = tileCenter(p.tx, p.ty);
    switch (p.type) {
      case "stump": {
        B.cyl(barkMat, 0.48, 0.62, 0.72, 7, c.x, 0.36, c.z);
        B.cyl(woodMat, 0.45, 0.45, 0.04, 7, c.x, 0.73, c.z);
        B.box(mossMat, 0.3, 0.25, 0.24, c.x - 0.32, 0.14, c.z + 0.24);
        break;
      }
      case "cairn": {
        B.cyl(stoneMat, 0.56, 0.72, 0.32, 7, c.x, 0.16, c.z);
        B.cyl(darkStone, 0.38, 0.5, 0.34, 6, c.x, 0.48, c.z);
        B.cyl(stoneMat, 0.22, 0.32, 0.28, 6, c.x, 0.78, c.z);
        B.box(mossMat, 0.42, 0.1, 0.42, c.x, 0.33, c.z);
        break;
      }
      case "shrine": {
        B.box(stoneMat, 1.4, 0.4, 1.4, c.x, 0.2, c.z);
        B.box(stoneMat, 0.85, 0.75, 0.85, c.x, 0.75, c.z);
        B.box(darkStone, 0.26, 1.55, 0.26, c.x, 1.85, c.z);
        B.box(darkStone, 0.95, 0.24, 0.22, c.x, 2.15, c.z);
        B.add(new THREE.CylinderGeometry(0.05, 0.06, 0.28, 6), waxMat, c.x + 0.22, 1.25, c.z + 0.24);
        smallFlames.push(c.x + 0.22, 1.44, c.z + 0.24);
        break;
      }
      case "trough": {
        B.box(woodMat, 1.65, 0.55, 0.85, c.x, 0.28, c.z);
        B.box(waterMat, 1.45, 0.08, 0.65, c.x, 0.54, c.z);
        B.box(ironMat, 1.7, 0.06, 0.88, c.x, 0.18, c.z);
        break;
      }
      case "cart": {
        B.box(woodMat, 1.7, 0.45, 1.15, c.x, 0.72, c.z);
        B.box(woodMat, 1.75, 0.36, 0.1, c.x, 1.08, c.z - 0.52);
        B.box(woodMat, 1.75, 0.36, 0.1, c.x, 1.08, c.z + 0.52);
        for (const [wx, wz] of [[-0.6, -0.64], [0.6, -0.64], [-0.6, 0.64], [0.6, 0.64]]) {
          B.add(new THREE.CylinderGeometry(0.36, 0.36, 0.09, 8), darkStone, c.x + wx, 0.36, c.z + wz, Math.PI / 2);
        }
        B.box(strawMat, 1.1, 0.35, 0.8, c.x, 1.05, c.z);
        break;
      }
      case "dummy": {
        B.cyl(woodMat, 0.11, 0.13, 1.7, 6, c.x, 0.85, c.z);
        B.box(strawMat, 0.52, 0.68, 0.42, c.x, 1.32, c.z);
        B.box(woodMat, 1.35, 0.1, 0.1, c.x, 1.44, c.z);
        B.add(new THREE.SphereGeometry(0.18, 6, 5), strawMat, c.x, 1.82, c.z);
        B.box(ironMat, 0.38, 0.46, 0.08, c.x - 0.42, 1.38, c.z + 0.12);
        break;
      }
    }
  }

  // Woods: dense outer pine-tree canopy border on solid ground
  if (kind === "woods") {
    const pineMat = renderer._mat("wc-pine", { color: 0x1a3022 }, true);
    for (let ty = 0; ty < level.rows; ty += 2) {
      for (let tx = 0; tx < level.cols; tx += 2) {
        if (level.grid[ty][tx] !== 1 || isOpen(tx, ty) || renderer.secretSet.has(`${tx},${ty}`)) continue;
        let near = false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isOpen(tx + dx, ty + dy)) near = true;
        if (near) continue;
        const r = rnd();
        if (r > 0.46) continue;
        const c = tileCenter(tx, ty);
        const h = 3.0 + rnd() * 2.0;
        const ox = (rnd() - 0.5) * 0.8, oz = (rnd() - 0.5) * 0.8;
        B.add(new THREE.CylinderGeometry(0.14, 0.28, h, 5), barkMat, c.x + ox, h / 2, c.z + oz);
        if (r < 0.3) {
          B.add(new THREE.ConeGeometry(1.15, 2.2, 6), pineMat, c.x + ox, h * 0.72, c.z + oz);
          B.add(new THREE.ConeGeometry(0.82, 1.6, 6), pineMat, c.x + ox, h * 0.98, c.z + oz);
        }
      }
    }
    // Woodcutter's Hut cabin gable overhang markers
    for (const tx of [41, 44, 47, 50, 53]) {
      const c = tileCenter(tx, 21);
      B.box(timberMat, TILE, 0.3, 0.4, c.x, 2.55, c.z + 0.9);
    }
    // Campfire ring decals beneath Woods braziers
    for (const b of level.braziers) {
      const c = tileCenter(b.tx, b.ty);
      B.cyl(ashMat, 0.78, 0.86, 0.08, 8, c.x, 0.04, c.z);
    }
  }

  // Courtyard: crenelated stone merlons along north & outer curtain wall
  if (kind === "courtyard") {
    for (let tx = 2; tx < level.cols - 2; tx += 2) {
      for (const ty of [2, 19, 35]) {
        if (level.grid[ty][tx] === 1 && isOpen(tx, ty + 1)) {
          const c = tileCenter(tx, ty);
          B.box(stoneMat, 0.95, 0.65, 0.55, c.x, WALL_H + 0.32, c.z + 0.65);
        }
      }
    }
  }
}

export function buildWoodsCourtyardPuzzles(renderer, level, mats, glyphTexture) {
  const { woodMat, stoneMat, goldMat, ironMat, waxMat } = mats;
  const T = renderer.T;
  const psx = (m, opts) => renderer._psx(m, opts);
  renderer.stoneRigs = [];
  renderer.winchRigs = [];
  renderer.shieldRigs = [];
  renderer.portcullisGrate = null;

  for (const lr of (level.lockedRooms || [])) {
    if (lr.kind === "stones") {
      // Stage 1 Key I: 4 Standing Rune Stones around a mossy circle
      const r = lr.room;
      const rc = tileCenter((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2);
      const ring = new THREE.Mesh(new THREE.RingGeometry(2.8, 3.05, 24), new THREE.MeshBasicMaterial({ color: 0x3b6e4a, transparent: true, opacity: 0.65, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(rc.x, 0.02, rc.z);
      renderer.scene.add(ring);
      const stoneM = renderer._mat("wc-rune-stone", { map: T.flag, color: 0x8a9290 });
      for (const it of lr.items) {
        const g = new THREE.Group();
        const ic = tileCenter(it.tx, it.ty);
        g.position.set(ic.x, 0, ic.z);
        const ob = new THREE.Mesh(new THREE.BoxGeometry(0.85, 2.0, 0.65), stoneM);
        ob.position.y = 1.0;
        ob.castShadow = true;
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.45, 4), stoneM);
        cap.position.y = 2.22;
        cap.rotation.y = Math.PI / 4;
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.68), new THREE.MeshBasicMaterial({ map: glyphTexture(it.sym, "#96ffaa", "#101a14"), transparent: true }));
        sign.position.set(0, 1.32, 0.34);
        const rune = new THREE.Sprite(renderer.glowMat(0x70ff98, 0));
        rune.position.set(0, 1.32, 0.42);
        rune.scale.set(1.7, 1.7, 1);
        g.add(ob, cap, sign, rune);
        renderer.scene.add(g);
        renderer.stoneRigs.push({ idx: it.i, rune, g });
      }
    } else if (lr.kind === "snare") {
      // Stage 1 Key II: Hunter's Trap — 4 directional winches + closing spiked timber jaws!
      const r = lr.room;
      const depth = (r.y1 - r.y0 + 1) * TILE;
      const width = 4 * TILE;
      const timberM = renderer._mat("wc-snare-wall", { map: T.timberWall || T.wood, color: 0x7c583a });
      const spikeM = renderer._mat("wc-snare-spike", { color: 0x9aa0a8, emissive: 0x160a08 });
      const mkJaw = (side) => {
        const g = new THREE.Group();
        const slab = new THREE.Mesh(new THREE.BoxGeometry(width, WALL_H * 0.9, depth), timberM);
        slab.position.set(-side * width / 2, WALL_H * 0.45, 0);
        slab.castShadow = true;
        g.add(slab);
        for (let row = 0; row < 3; row++) {
          for (let k = 0; k < 7; k++) {
            const sp = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.6, 4), spikeM);
            sp.rotation.z = side * -Math.PI / 2;
            sp.position.set(side * 0.26, 0.55 + row * 0.78, -depth / 2 + 1.2 + k * (depth - 2.4) / 6);
            g.add(sp);
          }
        }
        renderer.scene.add(g);
        return g;
      };
      const zc = (r.y0 + (r.y1 - r.y0 + 1) / 2) * TILE;
      const left = mkJaw(1), right = mkJaw(-1);
      renderer.crushSlabs = { left, right, x0: r.x0 * TILE, x1: (r.x1 + 1) * TILE, zc };
      left.position.set(renderer.crushSlabs.x0, 0, zc);
      right.position.set(renderer.crushSlabs.x1, 0, zc);
      for (const it of lr.items) {
        const g = new THREE.Group();
        const ic = tileCenter(it.tx, it.ty);
        g.position.set(ic.x, 0, ic.z);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 1.15, 6), woodMat);
        post.position.y = 0.58;
        const wheel = new THREE.Group();
        wheel.position.y = 1.18;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.05, 5, 10), ironMat);
        ring.rotation.x = Math.PI / 2;
        const bar1 = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.06, 0.06), ironMat);
        const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.84), ironMat);
        wheel.add(ring, bar1, bar2);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ map: glyphTexture(it.sym, "#ffd080", "#1a1410"), transparent: true }));
        sign.position.set(0, 1.65, 0.15);
        const halo = new THREE.Sprite(renderer.glowMat(0xffb850, 0));
        halo.position.y = 1.35;
        halo.scale.set(1.6, 1.6, 1);
        g.add(post, wheel, sign, halo);
        renderer.scene.add(g);
        renderer.winchRigs.push({ idx: it.i, wheel, halo });
      }
      renderer.crushGlow = new THREE.Sprite(renderer.glowMat(0xff3040, 0));
      renderer.crushGlow.position.set(((r.x0 + r.x1 + 1) / 2) * TILE, 2.0, zc);
      renderer.crushGlow.scale.set(10, 10, 1);
      renderer.scene.add(renderer.crushGlow);
    } else if (lr.kind === "heraldry") {
      // Stage 2 Key I: Heraldry Armory — 4 shield pedestals
      const r = lr.room;
      const rc = tileCenter((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2);
      const ring = new THREE.Mesh(new THREE.RingGeometry(2.8, 3.05, 24), new THREE.MeshBasicMaterial({ color: 0x8e6b28, transparent: true, opacity: 0.65, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(rc.x, 0.02, rc.z);
      renderer.scene.add(ring);
      const shieldM = renderer._mat("wc-shield", { color: 0x7a1220, emissive: 0x180408 });
      for (const it of lr.items) {
        const g = new THREE.Group();
        const ic = tileCenter(it.tx, it.ty);
        g.position.set(ic.x, 0, ic.z);
        const ped = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.05, 0.7), stoneMat);
        ped.position.y = 0.525;
        const shield = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.92, 0.12), shieldM);
        shield.position.set(0, 1.38, 0.12);
        const rim = new THREE.Mesh(new THREE.BoxGeometry(0.84, 1.0, 0.08), goldMat);
        rim.position.set(0, 1.38, 0.08);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshBasicMaterial({ map: glyphTexture(it.sym, "#f5d782", "#28080c"), transparent: true }));
        sign.position.set(0, 1.38, 0.2);
        const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.flame, color: 0xffc060, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        flame.position.set(0, 2.08, 0.1);
        flame.scale.set(0.45, 0.65, 1);
        const halo = new THREE.Sprite(renderer.glowMat(0xffb840, 0.55));
        halo.position.set(0, 1.9, 0.1);
        halo.scale.set(1.6, 1.6, 1);
        g.add(ped, rim, shield, sign, flame, halo);
        renderer.scene.add(g);
        renderer.shieldRigs.push({ idx: it.i, flame, halo });
      }
    } else if (lr.kind === "winch") {
      // Stage 2 Key II: Portcullis Winch — 4 chain capstan wheels + overhead iron portcullis grate
      const r = lr.room;
      const w = (r.x1 - r.x0 + 1) * TILE, d = (r.y1 - r.y0 + 1) * TILE;
      const cx = ((r.x0 + r.x1 + 1) / 2) * TILE, cz = ((r.y0 + r.y1 + 1) / 2) * TILE;
      const grate = new THREE.Group();
      for (let x = -w * 0.42; x <= w * 0.42; x += 0.9) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, d * 0.86), ironMat);
        bar.position.set(x, 0, 0);
        grate.add(bar);
      }
      for (let z = -d * 0.42; z <= d * 0.42; z += 0.9) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, 0.12, 0.1), ironMat);
        bar.position.set(0, 0, z);
        grate.add(bar);
      }
      grate.position.set(cx, 3.2, cz);
      renderer.scene.add(grate);
      renderer.portcullisGrate = grate;

      const metal = { iron: 0x5c606a, brass: 0xc29238, silver: 0xd8e2ec, gold: 0xf4c84a };
      for (const it of lr.items) {
        const g = new THREE.Group();
        const ic = tileCenter(it.tx, it.ty);
        g.position.set(ic.x, 0, ic.z);
        const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.34, 1.0, 8), stoneMat);
        ped.position.y = 0.5;
        const wheel = new THREE.Group();
        wheel.position.y = 1.08;
        const wm = renderer._mat(`wc-wheel-${it.sym}`, { color: metal[it.sym] || 0xaaaaaa, emissive: ((metal[it.sym] || 0xaaaaaa) & 0xfefefe) >> 3 });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.06, 6, 12), wm);
        ring.rotation.x = Math.PI / 2;
        const sp1 = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.06, 0.06), wm);
        const sp2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.84), wm);
        wheel.add(ring, sp1, sp2);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ map: glyphTexture(it.sym, "#ffffff", "#141820"), transparent: true }));
        sign.position.set(0, 1.62, 0.14);
        const halo = new THREE.Sprite(renderer.glowMat(metal[it.sym] || 0xffffff, 0));
        halo.position.y = 1.25;
        halo.scale.set(1.6, 1.6, 1);
        g.add(ped, wheel, sign, halo);
        renderer.scene.add(g);
        renderer.winchRigs.push({ idx: it.i, wheel, halo });
      }
      renderer.crushGlow = new THREE.Sprite(renderer.glowMat(0xff2840, 0));
      renderer.crushGlow.position.set(cx, 2.0, cz);
      renderer.crushGlow.scale.set(10, 10, 1);
      renderer.scene.add(renderer.crushGlow);
    }
  }
}

export function updateWoodsCourtyard(renderer, level, dt, t) {
  if (!level || !level.lockedRooms) return;
  for (const lr of level.lockedRooms) {
    if (lr.kind === "stones" && renderer.stoneRigs) {
      for (const s of renderer.stoneRigs) {
        const it = lr.items[s.idx];
        const on = !!(it && it.lit);
        s.rune.visible = on;
        s.rune.material.opacity = on ? 0.65 + Math.sin(t * 5 + s.idx) * 0.18 : 0;
        if (it && it.shake > 0) { it.shake = Math.max(0, it.shake - dt); s.g.rotation.z = Math.sin(t * 46) * 0.06; } else s.g.rotation.z = 0;
      }
    } else if (lr.kind === "snare" && renderer.crushSlabs) {
      const inset = lr.wallInset * S;
      const jitter = lr.active ? Math.sin(t * 36) * 0.014 : 0;
      renderer.crushSlabs.left.position.x = renderer.crushSlabs.x0 + inset + jitter;
      renderer.crushSlabs.right.position.x = renderer.crushSlabs.x1 - inset - jitter;
      for (const w of (renderer.winchRigs || [])) {
        const it = lr.items[w.idx];
        const down = !!(it && it.pressed);
        w.wheel.rotation.y += ((down ? Math.PI : 0) - w.wheel.rotation.y) * Math.min(1, dt * 8);
        w.halo.material.opacity = down ? 0.78 : 0.16 + Math.sin(t * 3 + w.idx) * 0.08;
      }
      if (renderer.crushGlow) renderer.crushGlow.material.opacity = lr.active ? 0.12 + Math.sin(t * 6) * 0.05 : 0;
    } else if (lr.kind === "heraldry" && renderer.shieldRigs) {
      for (const sh of renderer.shieldRigs) {
        const it = lr.items[sh.idx];
        const on = !!(it && it.lit);
        sh.flame.visible = on;
        sh.halo.visible = on;
        if (on) {
          sh.flame.scale.set(0.45 + Math.sin(t * 17 + sh.idx) * 0.06, 0.65 + Math.sin(t * 21 + sh.idx) * 0.1, 1);
          sh.halo.material.opacity = 0.58 + Math.sin(t * 9 + sh.idx) * 0.12;
        }
      }
    } else if (lr.kind === "winch") {
      if (renderer.portcullisGrate) {
        const drop = lr.wallInset || 0; // 0..1
        renderer.portcullisGrate.position.y = 3.2 - drop * 2.75 + (lr.active ? Math.sin(t * 32) * 0.01 : 0);
      }
      for (const w of (renderer.winchRigs || [])) {
        const it = lr.items[w.idx];
        const down = !!(it && it.pressed);
        w.wheel.rotation.y += ((down ? Math.PI : 0) - w.wheel.rotation.y) * Math.min(1, dt * 8);
        w.halo.material.opacity = down ? 0.8 : 0.16 + Math.sin(t * 3 + w.idx) * 0.08;
      }
      if (renderer.crushGlow) renderer.crushGlow.material.opacity = lr.active ? 0.14 + Math.sin(t * 6) * 0.05 : 0;
    }
  }
}
