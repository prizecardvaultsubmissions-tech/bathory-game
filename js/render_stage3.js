import * as THREE from "./vendor/three.module.min.js";
import { traceBeam } from "./stage3.js";

// v0.7 — Stage III "The Climb": tower props, stairs, the Hall of Mirrors and the Clock Library.
// Everything here is called from Renderer3D with a small context of shared helpers.

const TILE = 2;
const tc = (tx, ty) => new THREE.Vector3((tx + 0.5) * TILE, 0, (ty + 0.5) * TILE);

function portraitTexture(seed = 1) {
  const c = document.createElement("canvas");
  c.width = 32; c.height = 40;
  const g = c.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, 40);
  grd.addColorStop(0, "#2a1418"); grd.addColorStop(1, "#0a0406");
  g.fillStyle = grd; g.fillRect(0, 0, 32, 40);
  g.fillStyle = "#14080c"; g.beginPath(); g.ellipse(16, 15, 9, 11, 0, 0, Math.PI * 2); g.fill();      // hair
  g.fillStyle = "#e6d6d2"; g.beginPath(); g.ellipse(16, 17, 6, 8, 0, 0, Math.PI * 2); g.fill();      // face
  g.fillStyle = "#e8e0d0"; g.fillRect(6, 26, 20, 3);                                                 // ruff
  g.fillStyle = "#6a0614"; g.fillRect(8, 29, 16, 11);                                                // gown
  g.fillStyle = "#c9a24d"; g.fillRect(10, 6, 12, 2);                                                 // crown band
  g.fillStyle = seed > 1 ? "#ff2448" : "#1a0608"; g.fillRect(12, 16, 2, 1); g.fillRect(18, 16, 2, 1); // eyes
  g.fillStyle = "#a00820"; g.fillRect(14, 21, 4, 1);                                                 // lips
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function dialTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#1a120a"; g.beginPath(); g.arc(64, 64, 63, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#e8dcb8"; g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "#6a4a1a"; g.lineWidth = 3; g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
  g.fillStyle = "#2a1808"; g.textAlign = "center"; g.textBaseline = "middle";
  const nums = ["XII", "I", "II", "III", "IIII", "V", "VI", "VII", "VIII", "IX", "X", "XI"];
  nums.forEach((n, i) => {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const big = i % 3 === 0;
    g.font = `bold ${big ? 17 : 11}px serif`;
    g.fillStyle = big ? "#8b0018" : "#2a1808";
    g.fillText(n, 64 + Math.cos(a) * 41, 65 + Math.sin(a) * 41);
  });
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ static props (batched)
export function buildStage3Props(r, level, B, M, flames) {
  const { woodMat, ironMat, goldMat, stoneMat, waxMat, redCloth } = M;
  const T = r.T;
  const caskWood = r._mat("s3-cask", { map: T.wood, color: 0x9a6a44 });
  const rackWood = r._mat("s3-rack", { map: T.wineRack || T.wood });
  const straw = r._mat("s3-straw", { color: 0x8a7848 });
  const blanket = r._mat("s3-blanket", { color: 0x4a4a5a });
  const books = r._mat("s3-books", { map: T.books || T.wood });
  const paper = r._mat("s3-paper", { color: 0xe8dcc0, emissive: 0x2a2418 });
  const velvet = r._mat("s3-velvet", { color: 0x6a0618, emissive: 0x0a0002 });
  const linen = r._mat("s3-linen", { color: 0xd8d0c4 });
  const bronze = r._mat("s3-bronze", { color: 0xb07a3a, emissive: 0x1a0c04 });
  const glass = r._mat("s3-vanity-glass", { color: 0xb8c8d8, emissive: 0x303844 });
  const stepMat = r._mat("s3-step", { map: T.flag || T.floor, color: 0xa09aa0 });
  const voidMat = r._mat("s3-void", { color: 0x020203 });
  let bedDone = false;
  const tiles = new Set(level.props.map((p) => `${p.type}:${p.tx},${p.ty}`));
  for (const p of level.props) {
    const c = tc(p.tx, p.ty);
    switch (p.type) {
      case "winerack": {
        // A wall rack of wine casks lying on their sides (axis toward the room)
        const west = p.tx <= 2;
        const fx = west ? -0.55 : 0.55;
        B.box(rackWood, 0.9, 2.3, 1.95, c.x + fx, 1.15, c.z);
        for (let row = 0; row < 2; row++) for (let k = -1; k <= 1; k += 2) {
          B.add(new THREE.CylinderGeometry(0.38, 0.38, 0.9, 8), caskWood, c.x + fx * 0.2, 0.5 + row * 0.85, c.z + k * 0.45, 0, 0, Math.PI / 2);
          B.add(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 8), ironMat, c.x + fx * 0.2 + (west ? 0.36 : -0.36), 0.5 + row * 0.85, c.z + k * 0.45, 0, 0, Math.PI / 2);
        }
        break;
      }
      case "cot":
        B.box(woodMat, 1.0, 0.35, 1.8, c.x, 0.18, c.z);
        B.box(straw, 0.9, 0.16, 1.7, c.x, 0.43, c.z);
        B.box(blanket, 0.94, 0.1, 1.0, c.x, 0.54, c.z + 0.3);
        B.box(linen, 0.6, 0.14, 0.32, c.x, 0.55, c.z - 0.62);
        break;
      case "shelf": {
        // freestanding library stack: books on both faces
        const left = !tiles.has(`shelf:${p.tx - 1},${p.ty}`), right = !tiles.has(`shelf:${p.tx + 1},${p.ty}`);
        B.box(woodMat, TILE, 2.6, 0.8, c.x, 1.3, c.z);
        B.box(books, TILE - 0.1, 2.3, 0.04, c.x, 1.25, c.z + 0.42);
        B.box(books, TILE - 0.1, 2.3, 0.04, c.x, 1.25, c.z - 0.42, Math.PI);
        if (left) B.box(woodMat, 0.12, 2.8, 0.9, c.x - 0.98, 1.4, c.z);
        if (right) B.box(woodMat, 0.12, 2.8, 0.9, c.x + 0.98, 1.4, c.z);
        B.box(woodMat, TILE + 0.1, 0.12, 0.92, c.x, 2.66, c.z);
        break;
      }
      case "desk":
        B.box(woodMat, 2.0, 0.12, 1.1, c.x, 0.85, c.z);
        B.box(woodMat, 0.12, 0.85, 1.0, c.x - 0.9, 0.42, c.z);
        B.box(woodMat, 0.12, 0.85, 1.0, c.x + 0.9, 0.42, c.z);
        B.box(paper, 0.5, 0.02, 0.36, c.x - 0.2, 0.92, c.z + 0.1, 0.3);
        B.box(paper, 0.4, 0.02, 0.3, c.x + 0.3, 0.92, c.z - 0.1, -0.2);
        B.add(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6), waxMat, c.x + 0.7, 1.06, c.z - 0.3);
        flames.small.push(c.x + 0.7, 1.28, c.z - 0.3);
        flames.add(c.x + 0.7, 1.4, c.z - 0.3, 3.5, 4.5, 0xffb060);
        break;
      case "bed": {
        if (bedDone) break;
        bedDone = true;
        const bt = level.props.filter((q) => q.type === "bed");
        const x0 = Math.min(...bt.map((q) => q.tx)), x1 = Math.max(...bt.map((q) => q.tx));
        const y0 = Math.min(...bt.map((q) => q.ty)), y1 = Math.max(...bt.map((q) => q.ty));
        const cx = ((x0 + x1 + 1) / 2) * TILE, cz = ((y0 + y1 + 1) / 2) * TILE;
        const w = (x1 - x0 + 1) * TILE - 0.4, d = (y1 - y0 + 1) * TILE - 0.4;
        B.box(woodMat, w, 0.6, d, cx, 0.3, cz);
        B.box(linen, w - 0.2, 0.28, d - 0.2, cx, 0.74, cz);
        B.box(velvet, w - 0.1, 0.12, d * 0.62, cx, 0.92, cz + d * 0.18);
        for (const sx of [-0.7, 0.7]) B.box(linen, 0.9, 0.22, 0.5, cx + sx, 0.98, cz - d / 2 + 0.5);
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          B.box(woodMat, 0.18, 3.0, 0.18, cx + sx * (w / 2 - 0.1), 1.5, cz + sz * (d / 2 - 0.1));
          B.add(new THREE.ConeGeometry(0.12, 0.3, 4), goldMat, cx + sx * (w / 2 - 0.1), 3.15, cz + sz * (d / 2 - 0.1));
        }
        B.box(velvet, w + 0.1, 0.25, d + 0.1, cx, 2.95, cz);
        B.box(velvet, w, 2.0, 0.06, cx, 1.95, cz - d / 2 - 0.02); // headboard drape
        B.box(goldMat, w + 0.14, 0.06, d + 0.14, cx, 2.82, cz);
        break;
      }
      case "vanity":
        B.box(woodMat, 1.6, 0.9, 0.7, c.x, 0.45, c.z - 0.4);
        B.box(goldMat, 1.0, 1.4, 0.1, c.x, 1.6, c.z - 0.7);
        B.box(glass, 0.82, 1.2, 0.04, c.x, 1.6, c.z - 0.64);
        for (const sx of [-0.6, 0.6]) {
          B.add(new THREE.CylinderGeometry(0.04, 0.04, 0.24, 6), waxMat, c.x + sx, 1.02, c.z - 0.3);
          flames.small.push(c.x + sx, 1.2, c.z - 0.3);
        }
        flames.add(c.x, 1.4, c.z, 3.2, 4.5, 0xffb070);
        break;
      case "bell":
        for (const sx of [-0.9, 0.9]) B.box(woodMat, 0.2, 3.2, 0.2, c.x + sx, 1.6, c.z);
        B.box(woodMat, 2.2, 0.24, 0.3, c.x, 3.2, c.z);
        B.add(new THREE.CylinderGeometry(0.3, 0.85, 1.2, 10, 1, true), bronze, c.x, 2.4, c.z);
        B.add(new THREE.SphereGeometry(0.3, 8, 5), bronze, c.x, 3.0, c.z);
        B.add(new THREE.TorusGeometry(0.85, 0.06, 4, 12), bronze, c.x, 1.8, c.z, Math.PI / 2);
        break;
      case "clockface":
        B.box(woodMat, 1.6, 0.4, 1.0, c.x, 0.2, c.z);
        break;
      case "stairUp": case "stairDown": {
        // Steps rising into (or dropping out of) the wall, framed by a stone arch
        const up = p.type === "stairUp";
        // the stair faces the nearest open neighbour
        const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        const open = dirs.find(([dx, dy]) => level.grid[p.ty + dy] && level.grid[p.ty + dy][p.tx + dx] === 0) || [0, 1];
        const ry = Math.atan2(open[0], open[1]); // rotate local +Z toward the open side
        const P = (geo, mat, lx, y, lz, rx = 0, rz = 0) => {
          const ca = Math.cos(ry), sa = Math.sin(ry);
          B.add(geo, mat, c.x + lx * ca + lz * sa, y, c.z - lx * sa + lz * ca, rx, ry, rz);
        };
        for (let k = 0; k < 5; k++) {
          const h = up ? 0.22 * (k + 1) : -0.18 * k;
          if (up) P(new THREE.BoxGeometry(1.7, h, 0.4), stepMat, 0, h / 2, 0.8 - k * 0.4);
          else P(new THREE.BoxGeometry(1.7, 0.1, 0.4), stepMat, 0, h, 0.8 - k * 0.4);
        }
        if (!up) P(new THREE.BoxGeometry(1.7, 0.04, 2.0), voidMat, 0, -0.95, 0);
        P(new THREE.BoxGeometry(0.3, 3.0, 0.3), stoneMat, -1.0, 1.5, 0.9);
        P(new THREE.BoxGeometry(0.3, 3.0, 0.3), stoneMat, 1.0, 1.5, 0.9);
        P(new THREE.BoxGeometry(2.3, 0.36, 0.36), stoneMat, 0, 3.0, 0.9);
        P(new THREE.BoxGeometry(0.22, 0.4, 0.3), ironMat, -1.05, 2.1, 1.1);
        flames.big.push(c.x + Math.sin(ry) * 1.25 - Math.cos(ry) * 1.05, 2.45, c.z + Math.cos(ry) * 1.25 + Math.sin(ry) * 1.05);
        flames.add(c.x + Math.sin(ry) * 1.6, 2.4, c.z + Math.cos(ry) * 1.6, 9, 7.5, up ? 0xffa050 : 0xff8a3a);
        r.stairPlacements = r.stairPlacements || [];
        r.stairPlacements.push({ tx: p.tx, ty: p.ty, up, ry });
        break;
      }
    }
  }
}

// ------------------------------------------------------------------ dynamic rigs: stair gates, puzzles
export function buildStage3Rigs(r, level, M) {
  const { ironMat, goldMat, woodMat, stoneMat } = M;
  const scene = r.scene;
  r.stairRigs = [];
  for (const s of level.stairs || []) {
    const pl = (r.stairPlacements || []).find((q) => q.tx === s.tx && q.ty === s.ty);
    const ry = pl ? pl.ry : 0;
    const c = tc(s.tx, s.ty);
    const g = new THREE.Group();
    g.position.set(c.x + Math.sin(ry) * 0.9, 0, c.z + Math.cos(ry) * 0.9);
    g.rotation.y = ry;
    const gate = new THREE.Group();
    if (s.dir === "up") {
      for (let k = 0; k < 6; k++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 2.7, 0.07), ironMat);
        bar.position.set(-0.75 + k * 0.3, 1.35, 0);
        gate.add(bar);
      }
      for (const y of [0.4, 1.5, 2.6]) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.08), ironMat); b.position.y = y; gate.add(b); }
      const seal = new THREE.Mesh(new THREE.CircleGeometry(0.22, 8), r._mat("s3-gate-seal", { color: 0x8b0018, emissive: 0x3a0008 }));
      seal.position.set(0, 1.3, 0.06);
      gate.add(seal);
    }
    g.add(gate);
    const glow = new THREE.Sprite(r.glowMat(s.dir === "up" ? 0xffd86a : 0x8ab0ff, 0.0));
    glow.position.set(0, 1.4, -0.6);
    glow.scale.set(2.2, 2.6, 1);
    g.add(glow);
    scene.add(g);
    r.stairRigs.push({ id: s.id, dir: s.dir, gate, glow, open: 0 });
  }

  // ---- Hall of Mirrors
  r.mirrorRigs = [];
  r.beamSegs = [];
  r.mirrorRoom = null;
  r.clockRig = null;
  r.bookRigs = [];
  for (const lr of level.lockedRooms || []) {
    if (lr.kind === "mirrors") {
      r.mirrorRoom = lr;
      const frame = goldMat;
      const paneMat = new THREE.MeshBasicMaterial({ color: 0xd8e6f4 });
      for (const it of lr.items) {
        const c = tc(it.tx, it.ty);
        const g = new THREE.Group();
        g.position.set(c.x, 0, c.z);
        if (it.sym === "shutter") {
          // brass lever that opens the lamp's shutter
          const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.6), stoneMat); base.position.y = 0.25;
          const pivotG = new THREE.Group(); pivotG.position.y = 0.55;
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), goldMat); arm.position.y = 0.45;
          const knob = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), r._mat("s3-knob", { color: 0x8b0018, emissive: 0x2a0004 })); knob.position.y = 0.92;
          pivotG.add(arm, knob);
          const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: r.glyph("sun", "#ffd86a"), transparent: true }));
          lbl.rotation.x = -Math.PI / 2; lbl.position.set(0, 0.03, 0.85);
          g.add(base, pivotG, lbl);
          r.shutterRig = { g, lever: pivotG };
        } else {
          const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.4, 8), stoneMat); ped.position.y = 0.2;
          const spin = new THREE.Group(); spin.position.y = 0.4;
          const fr = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.9, 0.12), frame); fr.position.y = 1.0;
          const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.7), paneMat); pane.position.set(0, 1.0, 0.07);
          const back = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.7), r._mat("s3-mirror-back", { color: 0x3a2410 })); back.position.set(0, 1.0, -0.07); back.rotation.y = Math.PI;
          const crest = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.3, 4), frame); crest.position.y = 2.1;
          spin.add(fr, pane, back, crest);
          const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), new THREE.MeshBasicMaterial({ map: r.glyph(it.sym, "#cfe6ff", "#141820"), transparent: true }));
          lbl.rotation.x = -Math.PI / 2; lbl.position.set(0, 0.03, 0.9);
          const halo = new THREE.Sprite(r.glowMat(0xcfe6ff, 0.0)); halo.position.y = 1.4; halo.scale.set(2, 2.4, 1);
          g.add(ped, spin, lbl, halo);
          r.mirrorRigs.push({ sym: it.sym, spin, halo, rot: it.rot === "/" ? Math.PI / 4 : -Math.PI / 4 });
        }
        scene.add(g);
      }
      // the lamp on the west wall
      const lc = tc(...lr.lamp);
      const lamp = new THREE.Group();
      lamp.position.set(lc.x + TILE / 2 + 0.05, 1.4, lc.z);
      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), ironMat);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.2, 8), new THREE.MeshBasicMaterial({ color: 0xffe0a0 }));
      lens.rotation.y = Math.PI / 2; lens.position.x = 0.26;
      const lglow = new THREE.Sprite(r.glowMat(0xffd080, 0.7)); lglow.scale.set(1.6, 1.6, 1); lglow.position.x = 0.3;
      lamp.add(housing, lens, lglow);
      scene.add(lamp);
      r.lampGlow = lglow;
      // real light: the lamp, and two candelabra so the glasses read in the dark
      if (r._addFlameSrc) {
        r._addFlameSrc(lamp.position.x + 0.6, 1.5, lamp.position.z, 10, 9, 0xffd08a);
        const rc = tc((lr.room.x0 + lr.room.x1) / 2, (lr.room.y0 + lr.room.y1) / 2);
        r._addFlameSrc(rc.x, 2.4, rc.z, 8, 11, 0xd8c0ff);
      }
      // the sun seal on the east wall
      const sc = tc(...lr.sun);
      const sun = new THREE.Mesh(new THREE.CircleGeometry(0.75, 16), new THREE.MeshBasicMaterial({ map: r.glyph("sun", "#ffd86a", "#2a1a08"), transparent: true }));
      sun.position.set(sc.x - TILE / 2 - 0.03, 1.4, sc.z);
      sun.rotation.y = -Math.PI / 2;
      const sunGlow = new THREE.Sprite(r.glowMat(0xffd86a, 0.12)); sunGlow.position.copy(sun.position).add(new THREE.Vector3(-0.3, 0, 0)); sunGlow.scale.set(2.4, 2.4, 1);
      scene.add(sun, sunGlow);
      r.sunGlow = sunGlow;
      // her portraits — the false targets
      r.portraitRigs = [];
      lr.portraits.forEach(([px, py], i) => {
        const pc = tc(px, py);
        const g = new THREE.Group();
        const northWall = py < lr.room.y0;
        if (northWall) { g.position.set(pc.x, 1.5, pc.z + TILE / 2 + 0.04); }
        else { g.position.set(pc.x + TILE / 2 + 0.04, 1.5, pc.z); g.rotation.y = Math.PI / 2; }
        const fr = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.25, 0.08), goldMat);
        const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.02), new THREE.MeshBasicMaterial({ map: portraitTexture(i + 1) }));
        pic.position.z = 0.05;
        const eye = new THREE.Sprite(r.glowMat(0xff2448, 0.0)); eye.position.set(0, 0.1, 0.12); eye.scale.set(0.6, 0.3, 1);
        g.add(fr, pic, eye);
        scene.add(g);
        r.portraitRigs.push({ g, eye });
      });
      // light beam segments (pool)
      const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
      for (let i = 0; i < 8; i++) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(1, 0.09, 0.09), beamMat);
        const halo = new THREE.Mesh(new THREE.BoxGeometry(1, 0.32, 0.32), new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
        seg.add(halo);
        seg.visible = false;
        scene.add(seg);
        r.beamSegs.push(seg);
      }
      r.beamMat = beamMat;
    } else if (lr.kind === "clock") {
      const room = lr.room;
      const cc = tc(47, 51);
      const g = new THREE.Group();
      g.position.set(cc.x, 0, cc.z);
      const caseM = new THREE.Mesh(new THREE.BoxGeometry(1.4, 3.4, 0.8), woodMat); caseM.position.y = 1.9;
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.6, 4), woodMat); top.position.y = 3.9; top.rotation.y = Math.PI / 4;
      const dial = new THREE.Mesh(new THREE.CircleGeometry(0.62, 20), new THREE.MeshBasicMaterial({ map: dialTexture() }));
      dial.position.set(0, 2.9, -0.42); dial.rotation.y = Math.PI; // faces north, toward the door
      const hands = new THREE.Group(); hands.position.set(0, 2.9, -0.45); hands.rotation.y = Math.PI;
      const handMat = new THREE.MeshBasicMaterial({ color: 0x1a0e06 });
      const hourHand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.02), handMat); hourHand.geometry.translate(0, 0.16, 0);
      const minHand = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.02), handMat); minHand.geometry.translate(0, 0.25, 0);
      hands.add(hourHand, minHand);
      const pend = new THREE.Group(); pend.position.set(0, 2.3, -0.42);
      const rod = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.2, 0.02), goldMat); rod.position.y = -0.6;
      const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.04, 10), goldMat); bob.rotation.x = Math.PI / 2; bob.position.y = -1.2;
      pend.add(rod, bob);
      const window_ = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.4), new THREE.MeshBasicMaterial({ color: 0x0a0604 })); window_.position.set(0, 1.6, -0.41); window_.rotation.y = Math.PI;
      const glow = new THREE.Sprite(r.glowMat(0xffd080, 0.25)); glow.position.set(0, 2.9, -0.8); glow.scale.set(2.2, 2.2, 1);
      g.add(caseM, top, window_, dial, hands, pend, glow);
      scene.add(g);
      r.clockRig = { g, hourHand, minHand, pend, glow };
      if (r._addFlameSrc) {
        r._addFlameSrc(cc.x, 3.2, cc.z - 1.6, 10, 10, 0xffc070);
        r._addFlameSrc(cc.x - 5, 2.0, cc.z + 2, 6, 8, 0xffa050);
        r._addFlameSrc(cc.x + 5, 2.0, cc.z + 2, 6, 8, 0xffa050);
      }
      // a book stand for each hour: lectern + the pull-book with its numeral
      for (const it of lr.items) {
        const c = tc(it.tx, it.ty);
        const bg = new THREE.Group();
        bg.position.set(c.x, 0, c.z);
        const stand = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.2, 0.6), woodMat); stand.position.set(0, 1.1, 0);
        const spines = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.9), r._mat("s3-books-stand", { map: r.T.books || r.T.wood }));
        spines.position.set(0, 1.15, 0.31);
        const back2 = spines.clone(); back2.rotation.y = Math.PI; back2.position.z = -0.31;
        const book = new THREE.Group();
        const bm = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.6, 0.5), r._mat(`s3-book-${it.sym}`, { color: it.sym === "XIII" ? 0x2a2a30 : 0x8b0018, emissive: 0x1a0004 }));
        const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: r.glyph(it.sym, "#ffd86a", "#1a0a08"), transparent: true }));
        lab.position.set(0, 0, 0.26);
        book.add(bm, lab);
        book.position.set(0, 1.25, 0.3);
        const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), new THREE.MeshBasicMaterial({ map: r.glyph(it.sym, "#ffd86a", "#1a0e08"), transparent: true }));
        lbl.rotation.x = -Math.PI / 2; lbl.position.set(0, 0.03, 0.95);
        const halo = new THREE.Sprite(r.glowMat(0xffd86a, 0.0)); halo.position.set(0, 1.3, 0.7); halo.scale.set(1.4, 1.4, 1);
        // face the clock in the middle of the room
        bg.rotation.y = Math.atan2(cc.x - c.x, cc.z - c.z);
        bg.add(stand, spines, back2, book, lbl, halo);
        scene.add(bg);
        r.bookRigs.push({ sym: it.sym, book, halo });
      }
      r.clockGlow = new THREE.Sprite(r.glowMat(0xff3040, 0)); r.clockGlow.position.set(((room.x0 + room.x1 + 1) / 2) * TILE, 2, ((room.y0 + room.y1 + 1) / 2) * TILE); r.clockGlow.scale.set(12, 12, 1);
      scene.add(r.clockGlow);
    }
  }
}

export function updateStage3(r, level, dt, t) {
  if (!level || level.kind !== "climb") return;
  for (const sr of r.stairRigs || []) {
    const st = level.stairs[sr.id] || {};
    const target = sr.dir === "down" || st.open ? 1 : 0;
    sr.open += (target - sr.open) * Math.min(1, dt * 3);
    sr.gate.position.y = -2.9 * sr.open;
    sr.gate.visible = sr.open < 0.98;
    sr.glow.material.opacity = sr.dir === "up" ? (st.open ? 0.35 + Math.sin(t * 3) * 0.08 : 0.08) : 0.18;
  }
  const lr = r.mirrorRoom && level.lockedRooms.find((q) => q.kind === "mirrors");
  if (lr) {
    for (const m of r.mirrorRigs) {
      m.it = lr.items.find((q) => q.sym === m.sym);
      const want = m.it.rot === "/" ? Math.PI / 4 : -Math.PI / 4;
      // turn the short way (mirrors are two-sided)
      let d = want - m.rot;
      while (d > Math.PI / 2) d -= Math.PI;
      while (d < -Math.PI / 2) d += Math.PI;
      m.rot += d * Math.min(1, dt * 8);
      m.spin.rotation.y = m.rot;
      m.halo.material.opacity = (m.it.flash || 0) > 0 ? 0.6 : lr.solved ? 0.25 : 0.0;
      if (m.it.flash > 0) m.it.flash -= dt;
    }
    if (r.shutterRig) r.shutterRig.lever.rotation.x = (lr.beamT || 0) > 0 || lr.solved ? -0.9 : 0.5;
    const show = (lr.beamT || 0) > 0 || lr.solved;
    if (lr.beamT > 0) lr.beamT -= dt;
    const segs = r.beamSegs;
    segs.forEach((s) => { s.visible = false; });
    if (show) {
      const tr = traceBeam(lr);
      // turn the cell path into straight runs
      const pts = [tr.cells[0]];
      for (let i = 1; i < tr.cells.length - 1; i++) {
        const [ax, ay] = tr.cells[i - 1], [bx, by] = tr.cells[i], [cx, cy] = tr.cells[i + 1];
        if (bx - ax !== cx - bx || by - ay !== cy - by) pts.push(tr.cells[i]);
      }
      pts.push(tr.cells[tr.cells.length - 1]);
      const toW = ([x, y], end) => {
        const v = tc(x, y);
        if (end) { // stop at the wall face
          const prev = pts[pts.length - 2];
          v.x -= Math.sign(x - prev[0]) * TILE / 2; v.z -= Math.sign(y - prev[1]) * TILE / 2;
        }
        return v;
      };
      for (let i = 0; i < pts.length - 1 && i < segs.length; i++) {
        const a = i === 0 ? toW(pts[0], false).add(new THREE.Vector3(TILE / 2, 0, 0)) : toW(pts[i], false);
        const b = toW(pts[i + 1], i + 1 === pts.length - 1);
        const s = segs[i];
        const len = a.distanceTo(b);
        s.visible = true;
        s.position.set((a.x + b.x) / 2, 1.4, (a.z + b.z) / 2);
        s.scale.set(len, 1, 1);
        s.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      }
      const flick = 0.75 + Math.sin(t * 40) * 0.1;
      r.beamMat.opacity = flick;
      r.beamMat.color.setHex(tr.end === "sun" ? 0xfff0b0 : tr.end === "portrait" ? 0xff6080 : 0xffd090);
    }
    if (r.sunGlow) r.sunGlow.material.opacity = lr.solved ? 0.75 + Math.sin(t * 4) * 0.1 : 0.12;
    if (r.lampGlow) r.lampGlow.material.opacity = 0.55 + Math.sin(t * 9) * 0.08;
    for (const p of r.portraitRigs || []) p.eye.material.opacity = (lr.glareT || 0) > 0 ? 0.9 : lr.active ? 0.12 + Math.sin(t * 2) * 0.06 : 0;
    if (lr.glareT > 0) lr.glareT -= dt;
  }
  const clk = level.lockedRooms.find((q) => q.kind === "clock");
  if (clk && r.clockRig) {
    const c = r.clockRig;
    const left = clk.active ? Math.max(0, clk.closeSecs * (1 - clk.wallInset)) : clk.solved ? 0 : clk.closeSecs;
    // the minute hand runs toward the thirteenth hour as time runs out
    const frac = clk.active ? clk.wallInset : clk.solved ? 0 : 0;
    c.minHand.rotation.z = -frac * Math.PI * 2 * 3 - (clk.active ? t * 0.2 : 0);
    c.hourHand.rotation.z = -Math.PI * 2 * (11 / 12 + frac / 12) ;
    c.pend.rotation.z = Math.sin(t * (clk.active ? 6 : 2.5)) * 0.3;
    c.glow.material.opacity = clk.solved ? 0.5 : 0.22 + (clk.active && left < 12 ? Math.abs(Math.sin(t * 6)) * 0.3 : 0);
    if (r.clockGlow) r.clockGlow.material.opacity = clk.active ? Math.max(0, clk.wallInset - 0.5) * 0.18 * (0.6 + Math.sin(t * 8) * 0.4) : 0;
    for (const b of r.bookRigs) {
      b.it = clk.items.find((q) => q.sym === b.sym);
      const out = b.it.pressed ? 0.35 : 0;
      b.book.position.z += ((0.3 + out) - b.book.position.z) * Math.min(1, dt * 8);
      b.book.rotation.x = b.it.pressed ? -0.35 : 0;
      b.halo.material.opacity = b.it.pressed ? 0.55 + Math.sin(t * 5) * 0.1 : (b.it.flash || 0) > 0 ? 0.8 : 0.0;
      if (b.it.flash > 0) b.it.flash -= dt;
    }
  }
}
