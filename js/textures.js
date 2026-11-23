import * as THREE from "./vendor/three.module.min.js";

// Small procedural pixel-art textures (PS1-style, nearest-neighbor). All original.

function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }

export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvasTex(w, h, painter, { repeat = [1, 1], smooth = false } = {}) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  const img = g.createImageData(w, h);
  const set = (x, y, r, gg, b, a = 255) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    img.data[i] = clamp(r);
    img.data[i + 1] = clamp(gg);
    img.data[i + 2] = clamp(b);
    img.data[i + 3] = clamp(a);
  };
  painter(set, w, h);
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = smooth ? THREE.LinearFilter : THREE.NearestFilter;
  t.minFilter = smooth ? THREE.LinearFilter : THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  return t;
}

export function makeTextures() {
  const T = {};

  // Castle stone bricks with mortar, grime and the odd blood streak.
  T.stone = makeCanvasTex(32, 32, (set, w, h) => {
    const r = seeded(11);
    const brickTone = {};
    for (let y = 0; y < h; y++) {
      const row = Math.floor(y / 8);
      const off = row % 2 ? 8 : 0;
      for (let x = 0; x < w; x++) {
        const bx = Math.floor((x + off) / 16);
        const key = row * 10 + bx;
        if (brickTone[key] === undefined) brickTone[key] = (r() - 0.5) * 26;
        const mortar = y % 8 === 7 || (x + off) % 16 === 15;
        if (mortar) {
          set(x, y, 26, 20, 28);
        } else {
          const n = (r() - 0.5) * 12 + brickTone[key];
          const edge = y % 8 === 0 ? 10 : 0;
          set(x, y, 70 + n + edge, 60 + n + edge, 74 + n + edge);
        }
      }
    }
    // blood drips
    for (const sx of [5, 22]) {
      let len = 6 + Math.floor(r() * 10);
      for (let y = 9; y < 9 + len; y++) set(sx, y, 110, 8, 22);
    }
  });

  T.stoneTop = makeCanvasTex(16, 16, (set, w, h) => {
    const r = seeded(4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = (r() - 0.5) * 10;
      const rim = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      if (rim) set(x, y, 120, 92, 40); // tarnished gold coping
      else set(x, y, 30 + n, 24 + n, 34 + n);
    }
  });

  // Flagstone floor.
  T.floor = makeCanvasTex(32, 32, (set, w, h) => {
    const r = seeded(7);
    const tones = [(r() - 0.5) * 18, (r() - 0.5) * 18, (r() - 0.5) * 18, (r() - 0.5) * 18];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const qx = x < 16 ? 0 : 1;
      const qy = y < 16 ? 0 : 1;
      const tone = tones[qy * 2 + qx];
      const lx = x % 16;
      const ly = y % 16;
      const grout = lx === 15 || ly === 15;
      if (grout) { set(x, y, 18, 14, 20); continue; }
      const n = (r() - 0.5) * 12;
      const bevel = lx === 0 || ly === 0 ? 10 : 0;
      set(x, y, 58 + n + tone + bevel, 50 + n + tone + bevel, 56 + n + tone + bevel);
    }
    // cracks
    let cx = 4, cy = 20;
    for (let i = 0; i < 9; i++) { set(cx, cy, 22, 18, 24); cx += 1; cy += r() > 0.5 ? 1 : 0; }
  });

  // Crimson tapestry with gold border and a three-tooth crest (Báthory dragon-teeth motif).
  T.tapestry = makeCanvasTex(16, 32, (set, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const fold = x % 4 === 0 ? -18 : x % 4 === 2 ? 10 : 0;
      let c = [128 + fold, 10, 30 + fold * 0.3];
      if (x === 0 || x === w - 1 || y === 1 || y === h - 4) c = [214, 170, 70];
      if (y === 0) c = [60, 40, 20];
      if (y >= h - 3) c = (x % 2 === 0) ? [214, 170, 70] : [0, 0, 0, 0];
      set(x, y, c[0], c[1], c[2], c[3] ?? 255);
    }
    // crest: diamond + three teeth
    const cx = 8, cy = 13;
    for (let dy = -5; dy <= 5; dy++) {
      const span = 5 - Math.abs(dy);
      for (let dx = -span; dx <= span; dx++) {
        const edge = Math.abs(dx) === span;
        set(cx + dx - (dx >= 0 ? 0 : 0), cy + dy, edge ? 231 : 70, edge ? 200 : 6, edge ? 115 : 18);
      }
    }
    for (const tx of [5, 8, 11]) for (let k = 0; k < 3; k++) set(tx, cy - 1 + k, 240, 236, 220);
    for (let x = 3; x <= 12; x++) set(x, 24, 214, 170, 70);
  });

  T.rug = makeCanvasTex(32, 16, (set, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let c = [104, 8, 26];
      if (y === 1 || y === h - 2 || x === 1 || x === w - 2) c = [201, 162, 77];
      if ((x + y) % 6 === 0 && y > 3 && y < h - 4) c = [150, 20, 40];
      if (y === 0 || y === h - 1) c = [60, 4, 14];
      set(x, y, c[0], c[1], c[2]);
    }
  }, { repeat: [1, 1] });

  T.iron = makeCanvasTex(16, 16, (set, w, h) => {
    const r = seeded(21);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = (r() - 0.5) * 12;
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 ? -14 : 0;
      set(x, y, 52 + n + edge, 50 + n + edge, 60 + n + edge);
      if (r() < 0.04) set(x, y, 96, 44, 24);
    }
    for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) set(x, y, 130, 124, 134);
  });

  T.parchment = makeCanvasTex(16, 20, (set, w, h) => {
    const r = seeded(33);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = (r() - 0.5) * 14;
      set(x, y, 232 + n, 220 + n, 192 + n);
    }
    for (let y = 3; y < 15; y += 2) for (let x = 2; x < 14; x++) if (r() > 0.25) set(x, y, 92, 60, 40);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 5) set(8 + dx, 16 + dy, 180, 16, 40);
  });

  T.coat = makeCanvasTex(16, 16, (set, w, h) => {
    const r = seeded(5);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = (r() - 0.5) * 10;
      let c = [92 + n, 72 + n, 50 + n];
      if (x === 7 || x === 8) c = [64, 50, 36];
      if (y === 11) c = [40, 28, 22];
      set(x, y, c[0], c[1], c[2]);
    }
    for (const y of [3, 7]) set(9, y, 210, 170, 80);
    set(9, 11, 210, 170, 80);
  });

  T.gown = makeCanvasTex(16, 16, (set, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const fold = x % 4 === 0 ? -10 : x % 4 === 2 ? 8 : 0;
      let c = [58 + fold, 6, 20 + fold * 0.3];
      if ((x + y) % 8 === 0 || (x - y + 16) % 8 === 0) c = [140, 100, 40];
      set(x, y, c[0], c[1], c[2]);
    }
  });

  T.ruff = makeCanvasTex(32, 4, (set, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = x % 2 === 0 ? 238 : 196;
      set(x, y, v, v - 6, v - 12);
    }
  });

  T.playerFace = makeCanvasTex(8, 8, (set) => {
    const skin = [214, 168, 128], hair = [58, 40, 28];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, ...skin);
    for (let x = 0; x < 8; x++) { set(x, 0, ...hair); set(x, 1, ...hair); }
    set(0, 2, ...hair); set(7, 2, ...hair);
    set(2, 3, ...hair); set(5, 3, ...hair);
    set(2, 4, 24, 20, 30); set(5, 4, 24, 20, 30);
    set(3, 5, 180, 130, 100); set(4, 5, 180, 130, 100);
    set(3, 6, 140, 80, 70); set(4, 6, 140, 80, 70);
  });

  T.countessFace = makeCanvasTex(8, 8, (set) => {
    const skin = [234, 218, 214], hair = [18, 10, 14];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, ...skin);
    for (let x = 0; x < 8; x++) { set(x, 0, ...hair); set(x, 1, ...hair); }
    for (let y = 2; y < 6; y++) { set(0, y, ...hair); set(7, y, ...hair); }
    set(2, 3, 60, 30, 40); set(5, 3, 60, 30, 40);
    set(2, 4, 255, 40, 70); set(5, 4, 255, 40, 70);
    set(3, 6, 150, 10, 30); set(4, 6, 150, 10, 30);
  });

  // Soft-ish additive glow and a pixel flame.
  T.glow = makeCanvasTex(16, 16, (set, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5) / 7.5;
      const a = Math.max(0, 1 - d);
      set(x, y, 255, 255, 255, a * a * 255);
    }
  }, { smooth: true });

  T.flame = makeCanvasTex(16, 16, (set, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const nx = (x - 7.5) / 7.5;
      const ny = (y - 2) / 13; // 0 top .. 1 bottom
      const width = Math.max(0, ny) * 0.9 * (1.15 - ny * 0.4);
      if (ny < 0 || Math.abs(nx) > width) continue;
      const core = Math.abs(nx) < width * 0.45 && ny > 0.45;
      const mid = Math.abs(nx) < width * 0.75;
      if (core) set(x, y, 255, 244, 180);
      else if (mid) set(x, y, 255, 160, 50);
      else set(x, y, 200, 40, 20);
    }
  });

  // Moonlit cobbles for the outer ward / gate court.
  T.cobble = makeCanvasTex(32, 32, (set, w, h) => {
    const r = seeded(91);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(x, y, 22, 22, 30);
    for (let cy = 0; cy < 32; cy += 8) for (let cx = (cy / 8) % 2 ? 4 : 0; cx < 36; cx += 8) {
      const tone = (r() - 0.5) * 22;
      for (let y = 1; y < 7; y++) for (let x = 1; x < 7; x++) {
        if ((x === 1 || x === 6) && (y === 1 || y === 6)) continue;
        const n = (r() - 0.5) * 10 + (y < 3 ? 8 : 0);
        set((cx + x) % 32, cy + y, 66 + tone + n, 64 + tone + n, 76 + tone + n);
      }
    }
    for (let i = 0; i < 18; i++) set(Math.floor(r() * 32), Math.floor(r() * 32), 40, 58, 34); // moss
  });

  T.kitchen = makeCanvasTex(16, 16, (set, w, h) => {
    const r = seeded(17);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const checker = ((x >> 3) + (y >> 3)) % 2;
      const n = (r() - 0.5) * 10;
      const grout = x % 8 === 7 || y % 8 === 7;
      if (grout) set(x, y, 24, 16, 14);
      else if (checker) set(x, y, 104 + n, 52 + n, 34 + n);
      else set(x, y, 70 + n, 58 + n, 50 + n);
    }
  });

  T.blood = makeCanvasTex(32, 32, (set, w, h) => {
    const r = seeded(66);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const lx = x % 16, ly = y % 16;
      const grout = lx === 15 || ly === 15;
      const n = (r() - 0.5) * 12;
      if (grout) set(x, y, 30, 8, 12);
      else set(x, y, 50 + n, 40 + n, 46 + n);
    }
    // pooled stains
    for (const [cx, cy, rad] of [[9, 10, 5], [24, 22, 6], [20, 5, 3]]) {
      for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) {
        if (x * x + y * y <= rad * rad * (0.6 + r() * 0.5)) set(cx + x, cy + y, 92 + r() * 20, 6, 16);
      }
    }
  });

  T.wood = makeCanvasTex(16, 16, (set, w, h) => {
    const r = seeded(29);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const plank = y % 4 === 3;
      const n = (r() - 0.5) * 12 + Math.sin(x * 0.9 + y) * 4;
      if (plank) set(x, y, 34, 20, 14);
      else set(x, y, 92 + n, 58 + n, 34 + n);
    }
  });

  T.rags = makeCanvasTex(16, 16, (set, w, h) => {
    const r = seeded(41);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = (r() - 0.5) * 16;
      let c = [74 + n, 62 + n, 44 + n];
      if (r() < 0.06) c = [100, 14, 20];
      if (y > 12 && r() < 0.4) c = [0, 0, 0, 0];
      set(x, y, c[0], c[1], c[2], c[3] ?? 255);
    }
  });

  T.ghoulSkin = makeCanvasTex(8, 8, (set) => {
    const r = seeded(3);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const n = (r() - 0.5) * 14; set(x, y, 104 + n, 118 + n, 92 + n); }
    set(2, 3, 255, 236, 120); set(5, 3, 255, 236, 120); // eyes
    for (let x = 2; x < 6; x++) set(x, 5, 40, 20, 20);
    set(2, 6, 210, 200, 170); set(4, 6, 210, 200, 170);
  });

  T.shift = makeCanvasTex(16, 16, (set, w, h) => {
    const r = seeded(8);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = (r() - 0.5) * 10;
      const stain = y > 7 && r() < (y - 7) / 10;
      if (stain) set(x, y, 140 + n, 10, 24);
      else set(x, y, 214 + n, 206 + n, 196 + n);
    }
  });

  T.maidenFace = makeCanvasTex(8, 8, (set) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, 16, 10, 14); // hair curtain
    for (let y = 3; y < 7; y++) for (let x = 3; x < 5; x++) set(x, y, 220, 210, 204);
    set(3, 4, 255, 30, 60); set(4, 4, 255, 30, 60);
    set(3, 6, 140, 0, 20); set(4, 6, 140, 0, 20);
  });

  T.stained = makeCanvasTex(8, 16, (set, w, h) => {
    const cols = [[170, 20, 40], [220, 170, 60], [40, 70, 160], [120, 20, 120]];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const lead = x === 0 || x === w - 1 || y === 0 || y % 4 === 0 || x === 4;
      if (lead) { set(x, y, 20, 16, 20); continue; }
      const c = cols[(Math.floor(y / 4) + (x > 4 ? 1 : 0)) % 4];
      set(x, y, c[0], c[1], c[2]);
    }
    for (let x = 1; x < 7; x++) if (Math.abs(x - 3.5) < 2.5) set(x, 1, 230, 200, 120);
  });

  // ---------- Stage II: graveyard surfaces ----------
  T.grass = makeCanvasTex(32, 32, (set, w, h) => {
    const r = seeded(201);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = (r() - 0.5) * 18;
      const blade = r() < 0.18;
      if (blade) set(x, y, 66 + n, 92 + n, 54 + n);
      else set(x, y, 46 + n, 60 + n, 42 + n);
    }
    for (let i = 0; i < 26; i++) set(Math.floor(r() * 32), Math.floor(r() * 32), 70, 62, 48); // dead patches
  });
  T.dirt = makeCanvasTex(32, 32, (set, w, h) => {
    const r = seeded(202);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = (r() - 0.5) * 16;
      set(x, y, 68 + n, 56 + n, 48 + n);
    }
    for (let i = 0; i < 30; i++) { const x = Math.floor(r() * 32), y = Math.floor(r() * 32); set(x, y, 84, 80, 76); set(x + 1, y, 64, 60, 58); } // pebbles
    for (let i = 0; i < 14; i++) set(Math.floor(r() * 32), Math.floor(r() * 32), 40, 58, 34);
  });
  T.boneFloor = makeCanvasTex(32, 32, (set, w, h) => {
    const r = seeded(203);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const n = (r() - 0.5) * 14; set(x, y, 46 + n, 38 + n, 34 + n); }
    for (let i = 0; i < 16; i++) {
      const x0 = Math.floor(r() * 30), y0 = Math.floor(r() * 30), horiz = r() < 0.5, len = 3 + Math.floor(r() * 5);
      for (let k = 0; k < len; k++) { const x = horiz ? x0 + k : x0, y = horiz ? y0 : y0 + k; set(x, y, 214, 204, 176); }
      set(x0 - 1, y0, 230, 222, 196); set(horiz ? x0 + len : x0, horiz ? y0 : y0 + len, 230, 222, 196);
    }
    for (let i = 0; i < 4; i++) { const x = Math.floor(r() * 28) + 2, y = Math.floor(r() * 28) + 2; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) set(x + dx, y + dy, 222, 214, 190); set(x - 1, y, 20, 16, 16); set(x + 1, y, 20, 16, 16); }
  });
  T.flag = makeCanvasTex(32, 32, (set, w, h) => {
    const r = seeded(204);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const grout = x % 16 === 15 || y % 16 === 15 || (y % 16 === 7 && x % 16 < 9);
      const n = (r() - 0.5) * 14;
      if (grout) set(x, y, 30 + n * 0.4, 40 + n * 0.4, 30);
      else set(x, y, 74 + n, 76 + n, 80 + n);
    }
    for (let i = 0; i < 24; i++) set(Math.floor(r() * 32), Math.floor(r() * 32), 44, 66, 40);
  });
  T.moss = makeCanvasTex(32, 32, (set, w, h) => {
    const r = seeded(205);
    for (let y = 0; y < h; y++) {
      const row = Math.floor(y / 8), off = row % 2 ? 8 : 0;
      for (let x = 0; x < w; x++) {
        const mortar = y % 8 === 7 || (x + off) % 16 === 15;
        const n = (r() - 0.5) * 16;
        if (mortar) set(x, y, 28, 32, 30);
        else if (r() < (y < 10 ? 0.35 : 0.12)) set(x, y, 46 + n, 70 + n, 40 + n);
        else set(x, y, 86 + n, 88 + n, 94 + n);
      }
    }
  });
  T.mossTop = makeCanvasTex(16, 16, (set, w, h) => {
    const r = seeded(206);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const n = (r() - 0.5) * 18; set(x, y, 50 + n, 70 + n, 44 + n); }
  });
  // Wrought-iron fence panel (alpha cut-out): spear-topped bars and two rails.
  T.fence = makeCanvasTex(32, 32, (set, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(x, y, 0, 0, 0, 0);
    for (let bx = 2; bx < 32; bx += 6) {
      for (let y = 5; y < 32; y++) { set(bx, y, 34, 32, 38); set(bx + 1, y, 18, 16, 22); }
      set(bx, 4, 40, 36, 44); set(bx + 1, 4, 40, 36, 44); set(bx, 3, 30, 28, 34); set(bx + 1, 2, 30, 28, 34); set(bx - 1, 5, 30, 28, 34); set(bx + 2, 5, 30, 28, 34);
    }
    for (const ry of [9, 26]) for (let x = 0; x < 32; x++) { set(x, ry, 30, 28, 34); set(x, ry + 1, 16, 14, 18); }
  });

  return T;
}
