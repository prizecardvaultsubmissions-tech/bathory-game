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

  return T;
}
