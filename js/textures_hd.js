import * as THREE from "./vendor/three.module.min.js";
import { seeded } from "./textures.js";

// v0.7 "richer PS1" world textures: 64px tiles with bevels, cracks, moss, grime and blood.
// Still nearest-filtered pixel art (no smoothing) so the PS1 look survives. All procedural & original.

const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));

function tex(w, h, painter) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  const img = g.createImageData(w, h);
  const buf = new Float32Array(w * h * 4);
  const set = (x, y, r, gg, b, a = 255) => {
    x = ((x % w) + w) % w; y = ((y % h) + h) % h;
    const i = (y * w + x) * 4;
    buf[i] = r; buf[i + 1] = gg; buf[i + 2] = b; buf[i + 3] = a;
  };
  const get = (x, y) => {
    x = ((x % w) + w) % w; y = ((y % h) + h) % h;
    const i = (y * w + x) * 4;
    return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]];
  };
  const mul = (x, y, k, add = 0) => { const p = get(x, y); set(x, y, p[0] * k + add, p[1] * k + add, p[2] * k + add, p[3]); };
  const tint = (x, y, r, gg, b, amt) => { const p = get(x, y); set(x, y, p[0] + (r - p[0]) * amt, p[1] + (gg - p[1]) * amt, p[2] + (b - p[2]) * amt, p[3]); };
  painter({ set, get, mul, tint, w, h });
  for (let i = 0; i < buf.length; i++) img.data[i] = cl(buf[i]);
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Tileable value noise + fbm.
function noiseFn(seed, period) {
  const r = seeded(seed);
  const grid = new Float32Array(period * period);
  for (let i = 0; i < grid.length; i++) grid[i] = r();
  const at = (x, y) => grid[(((y % period) + period) % period) * period + (((x % period) + period) % period)];
  return (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
  };
}
function fbm(seed, w, oct = 4, base = 4) {
  const ns = [];
  for (let o = 0; o < oct; o++) ns.push(noiseFn(seed + o * 31, base << o));
  return (x, y) => {
    let v = 0, amp = 0.5, tot = 0;
    for (let o = 0; o < oct; o++) {
      const f = (base << o) / w;
      v += ns[o](x * f, y * f) * amp;
      tot += amp; amp *= 0.5;
    }
    return v / tot;
  };
}

// Cracks: short jagged random walks, darkening pixels (with a 1px light lip).
function cracks(P, r, n, len, dark = 0.55) {
  for (let k = 0; k < n; k++) {
    let x = Math.floor(r() * P.w), y = Math.floor(r() * P.h);
    let dx = r() < 0.5 ? 1 : -1, dy = r() < 0.5 ? 1 : 0;
    const L = len * (0.5 + r());
    for (let i = 0; i < L; i++) {
      P.mul(x, y, dark);
      P.mul(x + 1, y + 1, 1.12);
      if (r() < 0.35) dy = r() < 0.5 ? 1 : -1; else if (r() < 0.3) dy = 0;
      if (r() < 0.15) dx = -dx;
      x += dx; y += dy;
    }
  }
}
function bloodSplat(P, r, cx, cy, rad, k = 1) {
  for (let y = -rad - 3; y <= rad + 3; y++) for (let x = -rad - 3; x <= rad + 3; x++) {
    const d = Math.hypot(x, y) + (r() - 0.5) * 2.2;
    if (d < rad) P.tint(cx + x, cy + y, 92, 6, 14, Math.min(0.85, (0.55 + (1 - d / rad) * 0.35) * k));
    else if (d < rad + 3 && r() < 0.18) P.tint(cx + x, cy + y, 110, 8, 18, 0.7 * k);
  }
}
function drip(P, r, x, y0, len, k = 1) {
  for (let y = y0; y < y0 + len; y++) {
    const f = 1 - (y - y0) / len;
    P.tint(x, y, 104, 6, 18, (0.45 + f * 0.4) * k);
    if (f > 0.6) P.tint(x + 1, y, 104, 6, 18, 0.35 * k);
  }
  P.tint(x, y0 + len, 120, 10, 22, 0.8 * k);
}

// Brick wall: bevelled blocks, mortar, grain, cracks; options for moss / blood / palette.
function brickWall(seed, { pal = [74, 64, 78], mortar = [24, 19, 26], bw = 32, bh = 16, moss = 0, blood = 0, soot = 0, var_ = 26 } = {}) {
  return tex(64, 64, (P) => {
    const r = seeded(seed);
    const n = fbm(seed + 3, 64, 4, 4);
    const tone = {};
    for (let y = 0; y < 64; y++) {
      const row = Math.floor(y / bh), off = row % 2 ? bw / 2 : 0;
      for (let x = 0; x < 64; x++) {
        const lx = (x + off) % bw, ly = y % bh;
        const key = row * 16 + Math.floor((x + off) / bw);
        if (tone[key] === undefined) tone[key] = [(r() - 0.5) * var_, (r() - 0.5) * 8];
        const t = tone[key];
        if (lx < 2 || ly < 2) { const m = (n(x, y) - 0.5) * 14; P.set(x, y, mortar[0] + m, mortar[1] + m, mortar[2] + m); continue; }
        const g = (n(x * 1.7, y * 1.7) - 0.5) * 34 + (r() - 0.5) * 8 + t[0];
        let e = 0;
        if (lx === 2 || ly === 2) e = 16;           // lit top/left bevel
        else if (lx === bw - 1 || ly === bh - 1) e = -18; // shadowed bottom/right bevel
        P.set(x, y, pal[0] + g + e + t[1], pal[1] + g + e, pal[2] + g + e - t[1] * 0.5);
      }
    }
    cracks(P, r, 5, 9);
    // chipped corners
    for (let i = 0; i < 10; i++) { const x = Math.floor(r() * 64), y = Math.floor(r() * 64); P.mul(x, y, 0.6); P.mul(x + 1, y, 0.7); }
    if (soot) for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const s = n(x * 0.7 + 9, y * 0.5) * (1 - y / 64) * soot; P.mul(x, y, 1 - s * 0.7); }
    if (moss) {
      const mn = fbm(seed + 77, 64, 3, 4);
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        const v = mn(x, y) + (y / 64) * 0.35 * moss - 0.55;
        if (v > 0.06 && r() < 0.9) P.tint(x, y, 52 + r() * 20, 82 + r() * 26, 40 + r() * 10, Math.min(0.85, v * 4 * moss));
      }
    }
    if (blood) {
      for (let i = 0; i < blood; i++) drip(P, r, 4 + Math.floor(r() * 56), 6 + Math.floor(r() * 22), 10 + Math.floor(r() * 22), 0.9);
      if (blood > 1) bloodSplat(P, r, Math.floor(r() * 64), 44 + Math.floor(r() * 16), 3 + Math.floor(r() * 3), 0.8);
    }
  });
}

// Flagstones: 2x2 bevelled slabs per tile with grout, cracks, stains.
function flagstones(seed, { pal = [58, 50, 60], grout = [16, 12, 18], stains = 3, blood = 0, slab = 32, var_ = 22, moss = 0 } = {}) {
  return tex(64, 64, (P) => {
    const r = seeded(seed);
    const n = fbm(seed + 5, 64, 4, 4);
    const tones = {};
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const lx = x % slab, ly = y % slab;
      const key = Math.floor(y / slab) * 8 + Math.floor(x / slab);
      if (tones[key] === undefined) tones[key] = (r() - 0.5) * var_;
      if (lx < 2 || ly < 2) { P.set(x, y, grout[0], grout[1], grout[2]); continue; }
      const g = (n(x * 1.4, y * 1.4) - 0.5) * 30 + (r() - 0.5) * 7 + tones[key];
      let e = 0;
      if (lx === 2 || ly === 2) e = 14; else if (lx === slab - 1 || ly === slab - 1) e = -16;
      // gentle dish toward slab centre (worn)
      const cd = Math.hypot(lx - slab / 2, ly - slab / 2) / slab;
      P.set(x, y, pal[0] + g + e - cd * 10, pal[1] + g + e - cd * 10, pal[2] + g + e - cd * 8);
    }
    cracks(P, r, 4, 10);
    const sn = fbm(seed + 9, 64, 3, 2);
    for (let i = 0; i < stains; i++) {
      const cx = r() * 64, cy = r() * 64, rad = 6 + r() * 10;
      for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) {
        const d = Math.hypot(x, y) / rad;
        if (d < 1) P.mul(Math.floor(cx + x), Math.floor(cy + y), 1 - (1 - d) * 0.28 * sn(cx + x, cy + y) * 2);
      }
    }
    if (moss) for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if ((x % slab < 4 || y % slab < 4) && r() < 0.35 * moss) P.tint(x, y, 50, 78, 40, 0.6);
    for (let i = 0; i < blood; i++) bloodSplat(P, r, Math.floor(r() * 64), Math.floor(r() * 64), 3 + Math.floor(r() * 6));
  });
}

function planks(seed, { pal = [96, 62, 38], pw = 16, horizontal = false, dark = 0 } = {}) {
  return tex(64, 64, (P) => {
    const r = seeded(seed);
    const n = fbm(seed + 2, 64, 3, 4);
    const tones = [];
    for (let i = 0; i < 8; i++) tones.push((r() - 0.5) * 26);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const u = horizontal ? y : x, v = horizontal ? x : y;
      const pi = Math.floor(u / pw), lu = u % pw;
      const seamV = (v + pi * 23) % 64;
      if (lu === 0 || seamV === 0) { P.set(x, y, 22 - dark, 14 - dark, 10 - dark); continue; }
      const grain = Math.sin((lu * 0.9 + n(u * 0.8, v * 0.25) * 9) * 1.6) * 10;
      const g = grain + (n(u * 2, v * 0.6) - 0.5) * 22 + tones[pi % 8];
      const e = lu === 1 ? 10 : lu === pw - 1 ? -12 : 0;
      P.set(x, y, pal[0] + g + e - dark, pal[1] + g * 0.7 + e - dark, pal[2] + g * 0.45 + e - dark * 0.6);
    }
    // knots + nails
    for (let k = 0; k < 4; k++) {
      const cx = Math.floor(r() * 64), cy = Math.floor(r() * 64);
      for (let y = -3; y <= 3; y++) for (let x = -2; x <= 2; x++) {
        const d = Math.hypot(x * 1.4, y);
        if (d < 3.2) P.mul(horizontal ? cx + y : cx + x, horizontal ? cy + x : cy + y, d < 1.4 ? 0.5 : 0.78);
      }
    }
    for (let pi = 0; pi < 64 / pw; pi++) for (const v of [3, 60]) {
      const u = pi * pw + Math.floor(pw / 2);
      const x = horizontal ? v : u, y = horizontal ? u : v;
      P.set(x, y, 150, 140, 120); P.set(x + 1, y + 1, 30, 24, 20);
    }
  });
}

function voronoiStones(seed, { pal = [78, 72, 80], grout = [20, 18, 22], cells = 18, var_ = 30, moss = 0, tintC = null } = {}) {
  return tex(64, 64, (P) => {
    const r = seeded(seed);
    const pts = [];
    for (let i = 0; i < cells; i++) pts.push([r() * 64, r() * 64, (r() - 0.5) * var_, (r() - 0.5) * 10]);
    const n = fbm(seed + 1, 64, 3, 4);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      let d1 = 1e9, d2 = 1e9, best = null;
      for (const p of pts) for (const ox of [-64, 0, 64]) for (const oy of [-64, 0, 64]) {
        const d = Math.hypot(x - p[0] - ox, y - p[1] - oy);
        if (d < d1) { d2 = d1; d1 = d; best = p; } else if (d < d2) d2 = d;
      }
      const edge = d2 - d1;
      if (edge < 1.6) { P.set(x, y, grout[0], grout[1], grout[2]); continue; }
      const dome = Math.min(1, edge / 6);
      const g = (n(x * 1.5, y * 1.5) - 0.5) * 26 + best[2] + dome * 18 - 10;
      const c = tintC || pal;
      P.set(x, y, c[0] + g + best[3], c[1] + g, c[2] + g - best[3] * 0.5);
    }
    if (moss) for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const p = P.get(x, y);
      if (p[0] < grout[0] + 4 && r() < 0.6 * moss) P.set(x, y, 40, 64, 34);
    }
  });
}

export function upgradeTextures(T) {
  // --- Stage I: castle ---
  T.stone = brickWall(11, { pal: [76, 66, 80], blood: 2, moss: 0.25 });
  T.floor = flagstones(7, { pal: [60, 52, 62], stains: 4 });
  T.blood = flagstones(13, { pal: [62, 46, 50], stains: 3, blood: 5 });
  T.cobble = voronoiStones(21, { pal: [74, 70, 78], cells: 22 });
  T.kitchen = tex(64, 64, (P) => {
    const r = seeded(31); const n = fbm(33, 64, 3, 4);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const lx = x % 16, ly = y % 16;
      if (lx === 0 || ly === 0) { P.set(x, y, 30, 22, 18); continue; }
      const chk = ((Math.floor(x / 16) + Math.floor(y / 16)) % 2) ? 1 : 0;
      const g = (n(x * 2, y * 2) - 0.5) * 22 + (r() - 0.5) * 8;
      const e = lx === 1 || ly === 1 ? 10 : lx === 15 || ly === 15 ? -12 : 0;
      if (chk) P.set(x, y, 120 + g + e, 62 + g * 0.6 + e, 40 + g * 0.4 + e);
      else P.set(x, y, 70 + g + e, 54 + g + e, 46 + g + e);
    }
    cracks(P, r, 3, 8);
    for (let i = 0; i < 2; i++) bloodSplat(P, r, Math.floor(r() * 64), Math.floor(r() * 64), 3);
  });
  T.wood = planks(41, {});
  // --- Stage II: graveyards ---
  T.moss = brickWall(205, { pal: [88, 90, 96], mortar: [28, 32, 30], moss: 1.0, var_: 20 });
  T.flag = voronoiStones(305, { pal: [86, 88, 94], grout: [26, 34, 26], cells: 10, var_: 22, moss: 0.6 });
  T.grass = tex(64, 64, (P) => {
    const r = seeded(401); const n = fbm(402, 64, 4, 4);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const v = n(x, y);
      const g = (v - 0.5) * 50 + (r() - 0.5) * 16;
      P.set(x, y, 48 + g * 0.6, 78 + g, 46 + g * 0.5);
      if (v < 0.36) P.tint(x, y, 78, 66, 48, 0.6); // bare earth patches
    }
    for (let i = 0; i < 160; i++) { // blades
      const x = Math.floor(r() * 64), y = Math.floor(r() * 64), L = 2 + Math.floor(r() * 3);
      for (let k = 0; k < L; k++) P.set(x + (k > 1 && r() < 0.4 ? 1 : 0), y - k, 70 + r() * 30, 108 + r() * 30, 58);
      P.set(x, y + 1, 26, 40, 24);
    }
  });
  T.dirt = tex(64, 64, (P) => {
    const r = seeded(411); const n = fbm(412, 64, 4, 4);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const g = (n(x, y) - 0.5) * 46 + (r() - 0.5) * 14;
      P.set(x, y, 96 + g, 80 + g * 0.9, 64 + g * 0.8);
    }
    for (let i = 0; i < 40; i++) { const x = Math.floor(r() * 64), y = Math.floor(r() * 64); P.set(x, y, 140, 134, 126); P.set(x + 1, y, 110, 104, 98); P.set(x, y + 1, 50, 42, 36); }
  });

  // --- Stage III: the tower ---
  T.cellarBrick = brickWall(501, { pal: [86, 54, 46], mortar: [26, 20, 18], bw: 16, bh: 8, moss: 0.55, var_: 30 });
  T.cellarFloor = voronoiStones(503, { pal: [62, 56, 52], grout: [18, 16, 14], cells: 26, moss: 0.3 });
  T.tortureWall = brickWall(511, { pal: [66, 58, 64], blood: 4, soot: 0.8 });
  T.tortureFloor = flagstones(513, { pal: [58, 48, 50], blood: 7, stains: 5 });
  T.plaster = tex(64, 64, (P) => {
    const r = seeded(521); const n = fbm(522, 64, 4, 4);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const g = (n(x, y) - 0.5) * 26 + (r() - 0.5) * 6;
      if (y > 40) { // dark wainscot panelling below
        const lx = x % 16;
        const e = y === 41 || lx === 1 ? 14 : (lx === 0 || y === 63) ? -26 : 0;
        P.set(x, y, 70 + g + e, 44 + g * 0.7 + e, 28 + g * 0.5 + e);
      } else if (y > 37) P.set(x, y, 104 + g, 80 + g, 40 + g); // rail
      else P.set(x, y, 168 + g, 152 + g, 124 + g * 0.8);
    }
    // water stains + a hairline crack
    for (let i = 0; i < 3; i++) { const cx = r() * 64, cy = r() * 30; for (let y = 0; y < 18; y++) for (let x = -5; x <= 5; x++) if (Math.abs(x) < 5 - y * 0.2) P.mul(Math.floor(cx + x), Math.floor(cy + y), 0.9); }
    cracks(P, r, 2, 12, 0.7);
  });
  T.servantFloor = planks(531, { pal: [104, 76, 50], pw: 8, horizontal: true });
  T.parquet = tex(64, 64, (P) => {
    const r = seeded(541); const n = fbm(542, 64, 3, 4);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const bx = Math.floor(x / 16), by = Math.floor(y / 16);
      const vert = (bx + by) % 2 === 0;
      const u = vert ? x % 16 : y % 16, v = vert ? y : x;
      const strip = Math.floor(u / 4);
      if (u % 4 === 0 || (vert ? y % 16 === 0 : x % 16 === 0)) { P.set(x, y, 30, 18, 12); continue; }
      const g = Math.sin(v * 0.6 + n(x, y) * 8 + strip) * 8 + (n(x * 2, y * 2) - 0.5) * 18;
      P.set(x, y, 112 + g + strip * 4, 70 + g * 0.7, 40 + g * 0.4);
    }
  });
  T.wallpaper = tex(64, 64, (P) => {
    const r = seeded(551); const n = fbm(552, 64, 3, 4);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const g = (n(x, y) - 0.5) * 12;
      // damask lozenge pattern
      const ux = (x % 32) - 16, uy = (y % 32) - 16;
      const lz = Math.abs(ux) * 0.9 + Math.abs(uy) * 0.6;
      const motif = lz < 9 && lz > 6 ? 1 : (Math.hypot(ux, uy) < 3 ? 1 : 0);
      const stripe = x % 32 === 0 ? 1 : 0;
      if (motif) P.set(x, y, 150 + g, 96 + g, 52 + g);
      else if (stripe) P.set(x, y, 120, 80, 40);
      else P.set(x, y, 88 + g, 14 + g * 0.4, 30 + g * 0.5);
    }
    for (let i = 0; i < 2; i++) drip(P, r, 8 + Math.floor(r() * 48), 20 + Math.floor(r() * 10), 14, 0.7);
  });
  T.carpet = tex(64, 64, (P) => {
    const r = seeded(561);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const n2 = (r() - 0.5) * 12;
      const border = x < 6 || x > 57;
      const trim = x === 6 || x === 57 || x === 2;
      const ux = (x - 32), uy = (y % 32) - 16;
      const med = Math.abs(ux) + Math.abs(uy) < 12 && Math.abs(ux) + Math.abs(uy) > 8;
      if (trim) P.set(x, y, 200 + n2, 160 + n2, 70);
      else if (border) P.set(x, y, 40 + n2, 18, 30 + n2);
      else if (med) P.set(x, y, 190 + n2, 140 + n2, 60);
      else P.set(x, y, 118 + n2, 12 + n2 * 0.3, 26 + n2 * 0.4);
    }
  });
  T.books = tex(64, 64, (P) => {
    const r = seeded(571);
    const cols = [[110, 20, 26], [40, 54, 90], [36, 70, 44], [98, 70, 30], [70, 30, 70], [120, 100, 70], [30, 30, 34]];
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) P.set(x, y, 30, 20, 14);
    for (const shelfY of [0, 32]) {
      let x = 1;
      while (x < 63) {
        const bw = 2 + Math.floor(r() * 4), bh = 20 + Math.floor(r() * 9), c = cols[Math.floor(r() * cols.length)];
        const lean = r() < 0.08;
        for (let i = 0; i < bw && x + i < 63; i++) for (let j = 0; j < bh; j++) {
          const yy = shelfY + 30 - j - (lean ? Math.floor(i * 0.6) : 0);
          const e = i === 0 ? 18 : i === bw - 1 ? -16 : 0;
          const band = j === 4 || j === bh - 5 ? 50 : 0;
          P.set(x + i, yy, c[0] + e + band, c[1] + e + band * 0.8, c[2] + e + band * 0.3);
        }
        x += bw + (r() < 0.15 ? 2 : 0);
      }
      for (let x2 = 0; x2 < 64; x2++) { P.set(x2, shelfY + 31, 70, 44, 26); P.set(x2, shelfY, 50, 32, 20); }
    }
  });
  T.slate = flagstones(581, { pal: [70, 72, 80], grout: [22, 24, 28], slab: 16, var_: 30, moss: 0.4, stains: 2 });
  T.towerWall = brickWall(591, { pal: [92, 90, 98], mortar: [32, 32, 36], bw: 32, bh: 16, moss: 0.6, var_: 22 });
  T.studyWall = planks(601, { pal: [70, 44, 28], pw: 16, dark: 6 });
  T.wineRack = tex(64, 64, (P) => {
    const r = seeded(611);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) P.set(x, y, 26, 16, 12);
    for (let cy = 4; cy < 64; cy += 10) for (let cx = 5; cx < 64; cx += 10) {
      for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
        const d = Math.hypot(x, y);
        if (d < 3.6) P.set(cx + x, cy + y, d < 1.4 ? 60 + r() * 30 : 24, d < 1.4 ? 70 : 40 + r() * 10, d < 1.4 ? 40 : 26);
        else if (d < 4.6) P.set(cx + x, cy + y, 90, 60, 36);
      }
    }
  });

  // --- Stage I & II: The Woods & The Courtyard ---
  T.forestFloor = tex(64, 64, (P) => {
    const r = seeded(621); const n = fbm(622, 64, 4, 4);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const v = n(x, y);
      const g = (v - 0.5) * 44 + (r() - 0.5) * 14;
      if (v < 0.42) P.set(x, y, 56 + g, 42 + g * 0.8, 30 + g * 0.6); // damp loam
      else P.set(x, y, 36 + g * 0.7, 62 + g, 34 + g * 0.6);          // deep forest moss
    }
    for (let i = 0; i < 140; i++) { // fallen pine needles & twigs
      const x = Math.floor(r() * 64), y = Math.floor(r() * 64);
      const dx = r() < 0.5 ? 1 : -1;
      for (let k = 0; k < 3; k++) P.set((x + k * dx + 64) & 63, (y + k) & 63, 72 + r() * 26, 52 + r() * 18, 30);
    }
  });
  T.mossTrail = tex(64, 64, (P) => {
    const r = seeded(631); const n = fbm(632, 64, 4, 4);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const v = n(x, y);
      const rut = Math.abs(Math.sin(x * 0.2)) < 0.35 ? -10 : 0;
      const g = (v - 0.5) * 40 + (r() - 0.5) * 12 + rut;
      P.set(x, y, 88 + g, 72 + g * 0.9, 52 + g * 0.7);
      if (x < 8 || x > 55) P.tint(x, y, 42, 74, 38, 0.55); // mossy path shoulder
    }
    for (let i = 0; i < 45; i++) { const x = Math.floor(r() * 64), y = Math.floor(r() * 64); P.set(x, y, 126, 118, 106); P.set((x + 1) & 63, y, 58, 48, 38); }
  });
  T.barkWall = tex(64, 64, (P) => {
    const r = seeded(641); const n = fbm(642, 64, 4, 4);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const ridge = Math.sin(x * 0.65 + n(x, y) * 5) * 18;
      const crack = Math.abs(Math.sin(x * 0.45 + n(x * 2, y) * 3)) < 0.14 ? -22 : 0;
      const g = (n(x, y) - 0.5) * 24 + (r() - 0.5) * 8 + ridge + crack;
      P.set(x, y, 56 + g, 42 + g * 0.85, 32 + g * 0.7);
      if (n(x + 19, y + 7) > 0.68) P.tint(x, y, 48, 78, 42, 0.5); // lichen & moss
    }
  });
  T.timberWall = planks(651, { pal: [92, 64, 42], pw: 10, horizontal: true, dark: 8 });
  T.bogWater = tex(64, 64, (P) => {
    const r = seeded(661); const n = fbm(662, 64, 4, 4);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const v = n(x, y);
      const rip = Math.sin(x * 0.35 + y * 0.25 + v * 6) * 8;
      P.set(x, y, 24 + v * 20 + rip, 44 + v * 32 + rip, 36 + v * 24 + rip);
      if (v > 0.7) P.tint(x, y, 66, 98, 56, 0.45); // duckweed scum
    }
  });
  T.cobbleYard = voronoiStones(671, { pal: [88, 86, 92], grout: [24, 28, 24], cells: 24, var_: 24, moss: 0.45 });
  T.baileyWall = brickWall(681, { pal: [84, 80, 88], mortar: [28, 28, 32], bw: 24, bh: 12, moss: 0.45, soot: 0.5, var_: 24 });
  T.stableStraw = tex(64, 64, (P) => {
    const r = seeded(691); const n = fbm(692, 64, 4, 4);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const g = (n(x, y) - 0.5) * 34 + (r() - 0.5) * 10;
      P.set(x, y, 78 + g, 64 + g * 0.85, 44 + g * 0.6);
    }
    for (let i = 0; i < 180; i++) {
      const x = Math.floor(r() * 64), y = Math.floor(r() * 64), L = 3 + Math.floor(r() * 4);
      const dx = r() < 0.5 ? 1 : -1;
      for (let k = 0; k < L; k++) P.set((x + k * dx + 64) & 63, (y + (k >> 1)) & 63, 152 + r() * 40, 126 + r() * 30, 62 + r() * 18);
    }
  });
  T.kennelFlag = flagstones(701, { pal: [64, 66, 72], grout: [20, 20, 24], slab: 16, var_: 22, blood: 2, stains: 4 });
  T.oakDoor = planks(711, { pal: [72, 48, 32], pw: 12, dark: 10 });
  return T;
}

// v0.7 character textures (32px) — faces, coat, gown, rags. Original designs.
export function upgradeCharacterTextures(T) {
  const face = (seed, skin, painter) => tex(32, 32, (P) => {
    const r = seeded(seed);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const n = (r() - 0.5) * 8;
      const shade = (Math.abs(x - 15.5) / 16) * -22 + (y > 26 ? -14 : 0);
      P.set(x, y, skin[0] + n + shade, skin[1] + n + shade, skin[2] + n + shade);
    }
    painter(P, r);
  });
  const rect = (P, x0, y0, w, h, c) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) P.set(x, y, c[0], c[1], c[2]); };
  T.playerFace = face(901, [214, 168, 128], (P, r) => {
    rect(P, 0, 0, 32, 5, [58, 40, 28]);                 // fringe
    rect(P, 7, 11, 7, 2, [58, 40, 28]); rect(P, 18, 11, 7, 2, [58, 40, 28]); // brows
    rect(P, 8, 14, 5, 3, [240, 236, 226]); rect(P, 19, 14, 5, 3, [240, 236, 226]);
    rect(P, 10, 14, 2, 3, [52, 74, 96]); rect(P, 21, 14, 2, 3, [52, 74, 96]);  // eyes
    rect(P, 14, 16, 4, 6, [196, 146, 108]); rect(P, 14, 21, 4, 1, [150, 104, 76]); // nose
    rect(P, 11, 25, 10, 2, [132, 70, 62]);              // mouth
    for (let i = 0; i < 70; i++) { const x = 4 + Math.floor(r() * 24), y = 22 + Math.floor(r() * 9); P.mul(x, y, 0.82); } // stubble
  });
  T.countessFace = face(911, [236, 222, 216], (P, r) => {
    rect(P, 0, 0, 32, 4, [22, 10, 14]);
    rect(P, 6, 10, 8, 1, [30, 14, 18]); rect(P, 18, 10, 8, 1, [30, 14, 18]);  // thin arched brows
    rect(P, 7, 9, 2, 1, [30, 14, 18]); rect(P, 23, 9, 2, 1, [30, 14, 18]);
    rect(P, 7, 13, 7, 3, [20, 6, 10]); rect(P, 18, 13, 7, 3, [20, 6, 10]);    // shadowed sockets
    rect(P, 9, 14, 3, 1, [255, 40, 72]); rect(P, 20, 14, 3, 1, [255, 40, 72]); // glints
    rect(P, 15, 16, 2, 6, [214, 198, 194]);
    rect(P, 11, 24, 10, 3, [150, 8, 30]); rect(P, 12, 24, 8, 1, [196, 20, 48]); // crimson lips
    rect(P, 15, 27, 1, 3, [140, 0, 20]);                // a drop of blood
    for (let y = 16; y < 24; y++) { P.tint(6, y, 220, 150, 160, 0.25); P.tint(25, y, 220, 150, 160, 0.25); }
  });
  T.ghoulSkin = face(921, [138, 156, 112], (P, r) => {
    for (let i = 0; i < 90; i++) P.mul(Math.floor(r() * 32), Math.floor(r() * 32), 0.8);
    rect(P, 6, 11, 8, 6, [20, 18, 12]); rect(P, 18, 11, 8, 6, [20, 18, 12]);
    rect(P, 9, 13, 2, 2, [255, 226, 122]); rect(P, 21, 13, 2, 2, [255, 226, 122]);
    rect(P, 14, 17, 4, 4, [60, 64, 44]);
    rect(P, 8, 23, 16, 6, [24, 10, 10]);
    for (let x = 9; x < 23; x += 2) { P.set(x, 23, 220, 210, 170); P.set(x, 28, 200, 190, 150); }
  });
  T.maidenFace = face(931, [232, 222, 216], (P, r) => {
    rect(P, 0, 0, 32, 32, [16, 10, 14]);
    for (let x = 0; x < 32; x++) if (x % 3 === 0) for (let y = 0; y < 32; y++) P.set(x, y, 30, 20, 26);
    rect(P, 12, 12, 3, 2, [255, 40, 72]); rect(P, 18, 12, 3, 2, [255, 40, 72]);  // eyes through the hair
    rect(P, 13, 20, 6, 3, [100, 0, 16]);
  });
  T.coat = tex(32, 32, (P) => {
    const r = seeded(941); const n = fbm(942, 32, 3, 4);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const g = (n(x * 2, y * 2) - 0.5) * 22 + (r() - 0.5) * 8;
      P.set(x, y, 92 + g, 70 + g * 0.9, 48 + g * 0.7);
    }
    for (let y = 0; y < 32; y++) { P.set(15, y, 52, 38, 26); P.set(16, y, 120, 96, 66); }  // placket
    for (const y of [6, 13, 20]) { P.set(13, y, 200, 170, 90); P.set(18, y, 200, 170, 90); P.set(13, y + 1, 60, 40, 20); }
    for (let x = 0; x < 32; x++) { P.set(x, 23, 38, 26, 18); P.set(x, 24, 36, 24, 16); P.set(x, 25, 70, 52, 34); } // belt line
    P.set(16, 24, 220, 190, 100); P.set(17, 24, 220, 190, 100);
    for (let y = 0; y < 32; y += 4) { P.mul(2, y, 0.7); P.mul(29, y, 0.7); }    // stitching
  });
  T.gown = tex(32, 32, (P) => {
    const r = seeded(951);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const fold = Math.sin(x * 0.8) * 10;
      const n = (r() - 0.5) * 8;
      const ux = (x % 16) - 8, uy = (y % 16) - 8;
      const lz = Math.abs(ux) + Math.abs(uy);
      const motif = lz === 6 || (Math.abs(ux) < 2 && Math.abs(uy) < 2);
      if (motif) P.set(x, y, 176 + n, 128 + n, 54);
      else P.set(x, y, 104 + fold + n, 6 + n * 0.3, 22 + fold * 0.3);
    }
  });
  T.rags = tex(32, 32, (P) => {
    const r = seeded(961); const n = fbm(962, 32, 3, 4);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const g = (n(x * 2, y * 2) - 0.5) * 30;
      const hole = n(x * 3 + 7, y * 3) > 0.74 || (y > 26 && r() < (y - 26) / 7);
      if (hole) P.set(x, y, 0, 0, 0, 0);
      else P.set(x, y, 84 + g, 76 + g, 58 + g, 255);
      if (!hole && (x % 7 === 0)) P.mul(x, y, 0.8);
    }
    for (let i = 0; i < 3; i++) bloodSplat(P, r, Math.floor(r() * 32), Math.floor(r() * 32), 2, 0.8);
  });

  T.wolfFur = tex(32, 32, (P) => {
    const r = seeded(971); const n = fbm(972, 32, 3, 4);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const tuft = (y % 4 === 0 ? -12 : 0) + (n(x * 2, y * 2) - 0.5) * 28 + (r() - 0.5) * 12;
      P.set(x, y, 74 + tuft, 72 + tuft, 78 + tuft);
    }
  });
  T.barkSkin = tex(32, 32, (P) => {
    const r = seeded(981); const n = fbm(982, 32, 3, 4);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const ridge = Math.sin(x * 0.9 + n(x, y) * 4) * 16 + (r() - 0.5) * 10;
      P.set(x, y, 64 + ridge, 50 + ridge * 0.8, 36 + ridge * 0.6);
      if (n(x + 9, y) > 0.66) P.tint(x, y, 52, 86, 44, 0.5);
    }
  });
  T.sentryPlate = tex(32, 32, (P) => {
    const r = seeded(991); const n = fbm(992, 32, 3, 4);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const g = (n(x * 2, y * 2) - 0.5) * 24 + (r() - 0.5) * 8;
      P.set(x, y, 92 + g, 96 + g, 106 + g);
      if (n(x + 11, y + 5) > 0.68) P.tint(x, y, 128, 66, 36, 0.55); // rust patches
    }
    for (let y = 2; y < 32; y += 6) { P.set(4, y, 160, 164, 174); P.set(27, y, 160, 164, 174); }
  });
  return T;
}
