import * as THREE from "./vendor/three.module.min.js";
import { TILE_SIZE, roomAt, MIRROR_TIERS } from "./map.js";
import { mergeGeometries } from "./vendor/BufferGeometryUtils.js";
import { AI_STATE } from "./enemy.js";
import { makeTextures, seeded } from "./textures.js";
import { buildInvestigator, buildCountess, buildWeapon, buildMonster } from "./characters.js";

// 2D game-logic pixels -> 3D world units. One tile = 2 units.
const S = 2 / TILE_SIZE;
const TILE = 2;
const WALL_H = 3.0;

// Shared uniforms for the PS1 look.
const SNAP = { value: new THREE.Vector2(160, 280) };
const U_PLAYER = { value: new THREE.Vector3() };
const U_CAM = { value: new THREE.Vector3() };

const BAYER = `
float bayer4(vec2 p){
  int i = int(mod(p.x,4.0)) + int(mod(p.y,4.0))*4;
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (m[i] + 0.5) / 16.0;
}`;

// Vertex snapping (PS1 wobble). Optional dithered "screen-door" cutaway for walls between camera and player.
export function psx(mat, { cutaway = false } = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSnap = SNAP;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>\nuniform vec2 uSnap;\n${cutaway ? "varying vec3 vWorldP;" : ""}`)
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        {
          vec4 sp = gl_Position;
          sp.xy /= sp.w;
          sp.xy = floor(sp.xy * uSnap + 0.5) / uSnap;
          sp.xy *= sp.w;
          gl_Position = sp;
        }
        ${cutaway ? `{
          vec4 wp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wp = instanceMatrix * wp;
          #endif
          vWorldP = (modelMatrix * wp).xyz;
        }` : ""}`
      );
    if (cutaway) {
      sh.uniforms.uPlayer = U_PLAYER;
      sh.uniforms.uCam = U_CAM;
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>\nuniform vec3 uPlayer;\nuniform vec3 uCam;\nvarying vec3 vWorldP;\n${BAYER}`)
        .replace(
          "#include <clipping_planes_fragment>",
          `#include <clipping_planes_fragment>
          {
            vec3 target = uPlayer + vec3(0.0, 1.0, 0.0);
            vec3 seg = target - uCam;
            float segLen = length(seg);
            vec3 dir = seg / segLen;
            float t = dot(vWorldP - uCam, dir);
            if (t > 0.0 && t < segLen - 0.9) {
              float d = length(vWorldP - (uCam + dir * t));
              float fade = (1.0 - smoothstep(1.3, 2.6, d)) * 0.88;
              if (fade > bayer4(gl_FragCoord.xy)) discard;
            }
          }`
        );
    }
  };
  mat.customProgramCacheKey = () => (cutaway ? "psx-cut" : "psx");
  return mat;
}

function tileCenter(tx, ty) {
  return new THREE.Vector3((tx + 0.5) * TILE, 0, (ty + 0.5) * TILE);
}

// Merges static meshes per material: hundreds of props become a handful of draw calls.
class Batcher {
  constructor() {
    this.lists = new Map();
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
  }
  add(geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const g = geo.index ? geo.clone() : geo.clone();
    this.e.set(rx, ry, rz);
    this.q.setFromEuler(this.e);
    this.m.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(sx, sy, sz));
    g.applyMatrix4(this.m);
    g.clearGroups();
    for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
    if (!this.lists.has(mat)) this.lists.set(mat, []);
    this.lists.get(mat).push(g);
  }
  box(mat, w, h, d, x, y, z, ry = 0) { this.add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, 0, ry, 0); }
  cyl(mat, rt, rb, h, seg, x, y, z) { this.add(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z); }
  build(scene, shadows = true) {
    for (const [mat, list] of this.lists) {
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
    this.lists.clear();
  }
}

const CAM_OFFSETS = {
  ward: [0.0, 7.6, 7.4],
  chapel: [-2.2, 8.4, 6.6],
  kitchens: [2.2, 8.4, 6.6],
  hall: [-2.2, 9.0, 6.2],
  torture: [1.8, 8.0, 6.8],
  north: [2.2, 8.2, 6.8],
  candles: [0.0, 12.0, 8.4], // fixed, framed on the chamber centre
  crush: [0.0, 12.0, 7.6],
  doorway: [0.0, 7.4, -5.6] // looking south at the sealed chamber doors
};

// Procedural glyphs carved on candle bases and pressure plates (no fonts needed).
function glyphTexture(sym, color = "#ffd86a", bg = "#2a2018") {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = bg;
  g.beginPath(); g.arc(32, 32, 31, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "rgba(255,216,106,0.55)"; g.lineWidth = 2;
  g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 4; g.lineCap = "round"; g.lineJoin = "round";
  const tri = (up, bar) => {
    g.beginPath();
    if (up) { g.moveTo(32, 12); g.lineTo(52, 48); g.lineTo(12, 48); } else { g.moveTo(32, 52); g.lineTo(52, 16); g.lineTo(12, 16); }
    g.closePath(); g.stroke();
    if (bar) { g.beginPath(); g.moveTo(16, 32 + (up ? 4 : -4)); g.lineTo(48, 32 + (up ? 4 : -4)); g.stroke(); }
  };
  switch (sym) {
    case "sun":
      g.beginPath(); g.arc(32, 32, 9, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.beginPath(); g.moveTo(32 + Math.cos(a) * 14, 32 + Math.sin(a) * 14); g.lineTo(32 + Math.cos(a) * 22, 32 + Math.sin(a) * 22); g.stroke(); }
      break;
    case "moon":
      g.beginPath(); g.arc(32, 32, 18, 0, Math.PI * 2); g.fill();
      g.fillStyle = bg; g.beginPath(); g.arc(41, 27, 16, 0, Math.PI * 2); g.fill();
      break;
    case "bell":
      g.beginPath(); g.moveTo(18, 44); g.quadraticCurveTo(20, 16, 32, 15); g.quadraticCurveTo(44, 16, 46, 44); g.closePath(); g.fill();
      g.fillRect(14, 43, 36, 4); g.beginPath(); g.arc(32, 50, 4, 0, Math.PI * 2); g.fill();
      break;
    case "rose":
      for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5 - Math.PI / 2; g.beginPath(); g.arc(32 + Math.cos(a) * 9, 28 + Math.sin(a) * 9, 7, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = bg; g.beginPath(); g.arc(32, 28, 4, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(32, 38); g.lineTo(32, 54); g.stroke();
      break;
    case "key":
      g.beginPath(); g.arc(20, 32, 8, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(28, 32); g.lineTo(52, 32); g.moveTo(46, 32); g.lineTo(46, 41); g.moveTo(52, 32); g.lineTo(52, 40); g.stroke();
      break;
    case "crow":
      g.beginPath(); g.moveTo(10, 26); g.quadraticCurveTo(22, 22, 32, 36); g.quadraticCurveTo(42, 22, 54, 26); g.quadraticCurveTo(44, 30, 32, 46); g.quadraticCurveTo(20, 30, 10, 26); g.fill();
      break;
    case "skull":
      g.beginPath(); g.arc(32, 28, 15, 0, Math.PI * 2); g.fill(); g.fillRect(24, 36, 16, 12);
      g.fillStyle = bg; g.beginPath(); g.arc(26, 28, 4, 0, Math.PI * 2); g.arc(38, 28, 4, 0, Math.PI * 2); g.fill();
      g.fillRect(29, 41, 2, 7); g.fillRect(34, 41, 2, 7);
      break;
    case "fire": tri(true, false); break;
    case "water": tri(false, false); break;
    case "air": tri(true, true); break;
    case "earth": tri(false, true); break;
    case "I": case "II":
      g.font = "bold 30px serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(sym, 32, 34);
      break;
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  return t;
}

const PARTICLES = 320;

export class Renderer3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(1);
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;

    this.scene = new THREE.Scene();
    this.fogColor = new THREE.Color(0x0a0610);
    this.scene.background = this.fogColor;
    this.scene.fog = new THREE.Fog(this.fogColor, 10, 30);
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 40);

    this.rt = new THREE.WebGLRenderTarget(4, 4, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      colorSpace: THREE.SRGBColorSpace
    });
    this.postMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.rt.texture },
        uRes: { value: new THREE.Vector2(4, 4) },
        uGlitch: { value: 0 },
        uTime: { value: 0 },
        uRedShift: { value: 0 },
        uIce: { value: 0 },
        uHurt: { value: 0 },
        uDark: { value: 0 }
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uGlitch; uniform float uTime; uniform float uRedShift; uniform float uIce; uniform float uHurt; uniform float uDark;
        varying vec2 vUv;
        ${BAYER}
        void main(){
          vec2 uv = vUv;
          if (uGlitch > 0.0) {
            float row = floor(uv.y * uRes.y / 3.0);
            float j = step(0.9, fract(sin(row * 12.9898 + floor(uTime * 14.0) * 78.233) * 43758.5453));
            uv.x += j * uGlitch * 0.035;
          }
          vec3 c = texture2D(tDiffuse, uv).rgb;
          if (uGlitch > 0.0) c.r = mix(c.r, texture2D(tDiffuse, uv + vec2(uGlitch * 0.006, 0.0)).r, 0.8);
          c = pow(max(c, 0.0), vec3(1.0 / 2.2));
          c.r += uRedShift * 0.06;
          float lum = dot(c, vec3(0.3, 0.59, 0.11));
          c = mix(c, vec3(lum * 0.85, lum * 0.95, lum * 1.15) + vec3(0.0, 0.02, 0.06), uIce * 0.35);
          vec2 q = vUv - 0.5;
          c = mix(c, vec3(0.6, 0.0, 0.05), uHurt * smoothstep(0.1, 0.5, length(q)));
          if (uDark > 0.0) {
            c *= 1.0 - uDark * 0.62;
            c = mix(c, vec3(0.02, 0.03, 0.06), uDark * 0.45 * smoothstep(0.05, 0.55, length(q)));
          }
          float b = bayer4(gl_FragCoord.xy) - 0.5;
          c = floor(c * 31.0 + b + 0.5) / 31.0;
          c *= 1.0 - dot(q, q) * 0.9;
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthTest: false,
      depthWrite: false
    });
    this.postScene = new THREE.Scene();
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat));

    this.T = makeTextures();
    this.time = 0;
    this.lastNow = performance.now();
    this.built = false;
    this.level = null;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.camOffset = new THREE.Vector3(0, 10, 8);
    this.lastRoomKey = "ward";
    this.snapCam = true;
    this.prevPlayer = new THREE.Vector2();
    this.prevCountess = new THREE.Vector2();
    this.playerWalk = 0;
    this.countessWalk = 0;
    this.playerYaw = Math.PI;
    this.countessYaw = 0;
    this.monsterRigs = new Map();
    this.dropRigs = new Map();
    this.weaponId = null;
    this.lightPoolTimer = 0;
    this.resize();
  }

  resize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const k = 240 / Math.min(w, h);
    const lw = Math.max(160, Math.round(w * k));
    const lh = Math.max(160, Math.round(h * k));
    this.lw = lw;
    this.lh = lh;
    this.renderer.setSize(lw, lh, false);
    this.rt.setSize(lw, lh);
    this.postMat.uniforms.uRes.value.set(lw, lh);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.8 ? 62 : 50;
    this.camera.updateProjectionMatrix();
    this.baseSnap = new THREE.Vector2(lw * 0.5, lh * 0.5);
    SNAP.value.copy(this.baseSnap);
  }

  setLevel(level) {
    this.level = level;
    if (!this.built) {
      this._build(level);
      this.built = true;
    }
    for (const rig of this.monsterRigs.values()) this.scene.remove(rig.root);
    this.monsterRigs.clear();
    for (const rig of this.dropRigs.values()) this.scene.remove(rig.root);
    this.dropRigs.clear();
    if (this.secretRigs) for (const r of this.secretRigs) { r.wall.position.y = 0; r.open = 0; }
    if (this.doorRigs) for (const r of this.doorRigs) { r.open = 0; r.group.position.y = 0; }
    this.snapCam = true;
  }

  setWeapon(id) {
    if (this.weaponId === id) return;
    if (this.weaponMesh) this.weaponMesh.parent.remove(this.weaponMesh);
    this.weaponId = id;
    if (!id) { this.weaponMesh = null; return; }
    this.weaponMesh = buildWeapon(id, this.T, psx);
    const hand = new THREE.Group();
    hand.position.set(0, -0.66, 0.02);
    hand.add(this.weaponMesh);
    this.inv.arms[0].add(hand);
    this.weaponMesh = hand;
    this.weaponModel = hand.children[0];
  }

  _mat(key, opts, cut = false) {
    this._mats = this._mats || new Map();
    if (this._mats.has(key)) return this._mats.get(key);
    const m = psx(new THREE.MeshLambertMaterial(opts), { cutaway: cut });
    this._mats.set(key, m);
    return m;
  }

  _texRepeat(tex, rx, ry) {
    const t = tex.clone();
    t.needsUpdate = true;
    t.repeat.set(rx, ry);
    return t;
  }

  _build(level) {
    const T = this.T;
    const scene = this.scene;
    const rnd = seeded(1610);
    const B = new Batcher();
    const isFloor = (tx, ty) => ty >= 0 && ty < level.rows && tx >= 0 && tx < level.cols && level.grid[ty][tx] === 0;
    const isOpen = (tx, ty) => ty >= 0 && ty < level.rows && tx >= 0 && tx < level.cols && (level.grid[ty][tx] === 0 || level.grid[ty][tx] === 3);

    // ---------- Lights ----------
    scene.add(new THREE.HemisphereLight(0x5a4070, 0x1a0c14, 1.6));
    const moon = new THREE.DirectionalLight(0x6c7fb0, 0.55);
    moon.position.set(-10, 20, 6);
    scene.add(moon);

    // ---------- Floors: base flagstone + per-wing surfaces ----------
    const fw = level.cols * TILE;
    const fh = level.rows * TILE;
    const base = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), this._mat("floor", { map: this._texRepeat(T.floor, level.cols, level.rows) }));
    base.rotation.x = -Math.PI / 2;
    base.position.set(fw / 2, 0, fh / 2);
    base.receiveShadow = true;
    scene.add(base);
    for (const r of level.rooms) {
      if (r.floor === "floor") continue;
      const w = r.x1 - r.x0 + 1;
      const h = r.y1 - r.y0 + 1;
      const tex = { cobble: T.cobble, kitchen: T.kitchen, blood: T.blood }[r.floor];
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w * TILE, h * TILE), this._mat(`floor-${r.key}`, { map: this._texRepeat(tex, w, h) }));
      p.rotation.x = -Math.PI / 2;
      p.position.set((r.x0 + w / 2) * TILE, 0.005, (r.y0 + h / 2) * TILE);
      p.receiveShadow = true;
      scene.add(p);
    }

    // ---------- Walls (instanced) ----------
    const secretSet = new Set();
    if (level.secrets) for (const d of level.secrets) for (const [tx, ty] of d.tiles) secretSet.add(`${tx},${ty}`);
    this.secretSet = secretSet;
    const doorSet = new Set();
    for (const lr of (level.lockedRooms || [])) doorSet.add(`${lr.door[0]},${lr.door[1]}`);

    const wallTiles = [];
    for (let ty = 0; ty < level.rows; ty++) {
      for (let tx = 0; tx < level.cols; tx++) {
        if (secretSet.has(`${tx},${ty}`) || doorSet.has(`${tx},${ty}`)) continue;
        if (level.grid[ty][tx] !== 1) continue;
        let touches = false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isOpen(tx + dx, ty + dy)) touches = true;
        if (touches) wallTiles.push([tx, ty]);
      }
    }
    const wallSide = this._mat("wallSide", { map: T.stone }, true);
    const wallTop = this._mat("wallTop", { map: T.stoneTop }, true);
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE, WALL_H, TILE), [wallSide, wallSide, wallTop, wallTop, wallSide, wallSide], wallTiles.length);
    const m4 = new THREE.Matrix4();
    wallTiles.forEach(([tx, ty], i) => {
      const c = tileCenter(tx, ty);
      m4.makeTranslation(c.x, WALL_H / 2, c.z);
      walls.setMatrixAt(i, m4);
    });
    walls.castShadow = true;
    walls.receiveShadow = true;
    scene.add(walls);

    const special = new Set();
    for (const k of ["alcoves", "braziers", "glass", "pages", "mirrors", "bolts", "spawns"]) level[k].forEach((o) => special.add(`${o.tx},${o.ty}`));

    // South-facing wall dressing: gold trim, tapestries, sconces; chapel gets stained glass.
    const trimMat = this._mat("trim", { color: 0xb08a3c, emissive: 0x1a1004 });
    const tapMat = this._mat("tap", { map: T.tapestry, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
    const glassWin = new THREE.MeshBasicMaterial({ map: T.stained });
    psx(glassWin);
    const ironMat = this._mat("iron", { map: T.iron });
    const bigFlames = [];
    const smallFlames = [];
    for (const [tx, ty] of wallTiles) {
      if (!isOpen(tx, ty + 1)) continue;
      const c = tileCenter(tx, ty);
      const z = (ty + 1) * TILE;
      B.box(trimMat, TILE, 0.12, 0.08, c.x, 0.2, z + 0.04);
      B.box(trimMat, TILE, 0.12, 0.08, c.x, WALL_H - 0.25, z + 0.04);
      const room = roomAt(level, tx, ty + 1);
      const h = rnd();
      if (room && room.key === "chapel" && ty === room.y0 - 1 && tx % 3 === 1) {
        B.add(new THREE.PlaneGeometry(0.9, 1.8), glassWin, c.x, 1.7, z + 0.03);
      } else if (h < 0.18) {
        B.add(new THREE.PlaneGeometry(1.15, 2.1), tapMat, c.x, 1.55, z + 0.03);
      } else if (h < 0.3) {
        B.box(ironMat, 0.18, 0.4, 0.3, c.x, 1.85, z + 0.15);
        bigFlames.push(c.x, 2.22, z + 0.22);
      }
    }

    // Candle clusters along north walls
    const waxMat = this._mat("wax", { color: 0xe8dcc0, emissive: 0x3a2a10 });
    for (let ty = 1; ty < level.rows - 1; ty++) {
      for (let tx = 1; tx < level.cols - 1; tx++) {
        if (!isFloor(tx, ty) || special.has(`${tx},${ty}`)) continue;
        if (level.grid[ty - 1][tx] !== 1) continue;
        const rr = roomAt(level, tx, ty);
        if (rr && rr.sealed) continue;
        if (rnd() < 0.22) {
          const c = tileCenter(tx, ty);
          const n = 2 + Math.floor(rnd() * 3);
          for (let k = 0; k < n; k++) {
            const x = c.x + (rnd() - 0.5) * 1.4;
            const z = ty * TILE + 0.25 + rnd() * 0.35;
            const hgt = 0.18 + rnd() * 0.3;
            B.add(new THREE.CylinderGeometry(0.055, 0.065, hgt, 6), waxMat, x, hgt / 2, z);
            smallFlames.push(x, hgt + 0.08, z);
          }
        }
      }
    }

    // Rugs
    const rugMat = this._mat("rug", { map: T.rug });
    for (const [x0, y0, w, h] of [[27, 19, 4, 13], [9, 22, 3, 11], [27, 37, 4, 6], [37, 3, 5, 9]]) {
      B.add(new THREE.PlaneGeometry(w * TILE * 0.9, h * TILE * 0.96), rugMat, (x0 + w / 2) * TILE, 0.015, (y0 + h / 2) * TILE, -Math.PI / 2);
    }

    // ---------- Props ----------
    const woodMat = this._mat("wood", { map: T.wood });
    const stoneMat = this._mat("ped", { map: T.stone });
    const goldMat = this._mat("goldTrim", { color: 0xc9a24d, emissive: 0x2a1804 });
    const redCloth = this._mat("redCloth", { color: 0x8b0018 });
    const statueMat = this._mat("statue", { color: 0x8a8490 });
    const greenGlow = new THREE.MeshBasicMaterial({ color: 0x5aff6a });
    psx(greenGlow);
    for (const p of level.props) {
      const c = tileCenter(p.tx, p.ty);
      switch (p.type) {
        case "pew":
          B.box(woodMat, 2.0, 0.12, 0.7, c.x, 0.5, c.z - 0.1);
          B.box(woodMat, 2.0, 0.7, 0.1, c.x, 0.85, c.z + 0.28);
          B.box(woodMat, 0.1, 0.5, 0.6, c.x - 0.9, 0.25, c.z - 0.1);
          break;
        case "altar":
          B.box(stoneMat, 2.0, 1.0, 1.2, c.x, 0.5, c.z);
          B.box(redCloth, 2.02, 0.04, 1.0, c.x, 1.02, c.z);
          B.box(goldMat, 0.2, 0.3, 0.2, c.x, 1.18, c.z);
          for (const ox of [-0.6, 0.6]) {
            B.add(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6), waxMat, c.x + ox, 1.22, c.z);
            smallFlames.push(c.x + ox, 1.5, c.z);
          }
          break;
        case "table":
          B.box(woodMat, 2.0, 0.12, 1.4, c.x, 0.8, c.z);
          B.box(woodMat, 0.12, 0.8, 0.12, c.x - 0.8, 0.4, c.z - 0.55);
          B.box(woodMat, 0.12, 0.8, 0.12, c.x + 0.8, 0.4, c.z + 0.55);
          B.box(redCloth, 2.02, 0.02, 0.5, c.x, 0.87, c.z);
          if (rnd() < 0.6) {
            B.add(new THREE.CylinderGeometry(0.06, 0.04, 0.2, 6), goldMat, c.x + (rnd() - 0.5), 0.97, c.z + (rnd() - 0.5) * 0.6);
            B.add(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6), waxMat, c.x - 0.4, 1.0, c.z);
            smallFlames.push(c.x - 0.4, 1.22, c.z);
          }
          break;
        case "barrel":
          B.cyl(woodMat, 0.48, 0.48, 1.1, 8, c.x, 0.55, c.z);
          B.cyl(ironMat, 0.5, 0.5, 0.08, 8, c.x, 0.25, c.z);
          B.cyl(ironMat, 0.5, 0.5, 0.08, 8, c.x, 0.85, c.z);
          break;
        case "cauldron":
          B.cyl(ironMat, 0.75, 0.5, 0.8, 8, c.x, 0.5, c.z);
          B.add(new THREE.CylinderGeometry(0.66, 0.66, 0.04, 8), greenGlow, c.x, 0.88, c.z);
          for (let k = 0; k < 3; k++) B.box(ironMat, 0.1, 0.3, 0.1, c.x + Math.cos(k * 2.1) * 0.5, 0.1, c.z + Math.sin(k * 2.1) * 0.5);
          break;
        case "throne":
          B.box(stoneMat, 2.0, 0.3, 2.0, c.x, 0.15, c.z);
          B.box(woodMat, 1.0, 0.5, 0.9, c.x, 0.55, c.z);
          B.box(redCloth, 0.9, 0.1, 0.8, c.x, 0.85, c.z);
          B.box(woodMat, 1.1, 2.0, 0.2, c.x, 1.3, c.z - 0.4);
          B.box(goldMat, 1.2, 0.2, 0.25, c.x, 2.35, c.z - 0.4);
          B.add(new THREE.ConeGeometry(0.15, 0.4, 4), goldMat, c.x, 2.65, c.z - 0.4);
          break;
        case "cage":
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            B.box(ironMat, 0.06, 2.0, 0.06, c.x + Math.cos(a) * 0.6, 1.0, c.z + Math.sin(a) * 0.6);
          }
          B.cyl(ironMat, 0.66, 0.66, 0.1, 8, c.x, 2.0, c.z);
          B.add(new THREE.ConeGeometry(0.66, 0.4, 8), ironMat, c.x, 2.25, c.z);
          B.cyl(ironMat, 0.66, 0.66, 0.08, 8, c.x, 0.05, c.z);
          break;
        case "rack":
          B.box(woodMat, 1.8, 0.2, 1.0, c.x, 0.8, c.z);
          B.box(woodMat, 0.15, 0.8, 0.15, c.x - 0.8, 0.4, c.z - 0.4);
          B.box(woodMat, 0.15, 0.8, 0.15, c.x + 0.8, 0.4, c.z + 0.4);
          B.add(new THREE.CylinderGeometry(0.12, 0.12, 1.1, 6), ironMat, c.x - 0.8, 1.0, c.z, Math.PI / 2);
          break;
        case "statue":
          B.box(stoneMat, 1.2, 0.8, 1.2, c.x, 0.4, c.z);
          B.add(new THREE.CylinderGeometry(0.25, 0.55, 1.8, 6), statueMat, c.x, 1.7, c.z);
          B.box(statueMat, 0.36, 0.4, 0.36, c.x, 2.8, c.z);
          B.add(new THREE.ConeGeometry(0.3, 0.5, 4), statueMat, c.x, 3.2, c.z);
          break;
        case "crate":
          B.box(woodMat, 1.2, 1.0, 1.2, c.x, 0.5, c.z, rnd());
          B.box(woodMat, 0.8, 0.7, 0.8, c.x + 0.3, 1.35, c.z - 0.1, rnd());
          break;
        case "well":
          B.add(new THREE.CylinderGeometry(0.9, 0.9, 0.9, 10, 1, true), stoneMat, c.x, 0.45, c.z);
          B.cyl(this._mat("wellWater", { color: 0x050810 }), 0.85, 0.85, 0.05, 10, c.x, 0.5, c.z);
          B.box(woodMat, 0.12, 2.0, 0.12, c.x - 0.8, 1.0, c.z);
          B.box(woodMat, 0.12, 2.0, 0.12, c.x + 0.8, 1.0, c.z);
          B.add(new THREE.ConeGeometry(1.3, 0.6, 4), woodMat, c.x, 2.3, c.z, 0, Math.PI / 4);
          break;
      }
    }



    const glowMatEarly = (color, opacity) => new THREE.SpriteMaterial({ map: T.glow, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
    this.glowMat = glowMatEarly;

    // ---------- Secret doors & trigger items ----------
    this.secretRigs = [];
    const seamMat = this._mat("secret-seam", { color: 0x1a1410, emissive: 0x080604 });
    for (const d of (level.secrets || [])) {
      const wall = new THREE.Group();
      let cx = 0, cz = 0;
      for (const [tx, ty] of d.tiles) {
        const c = tileCenter(tx, ty);
        cx += c.x; cz += c.z;
        const block = new THREE.Mesh(new THREE.BoxGeometry(TILE, WALL_H, TILE), wallSide);
        block.position.set(c.x, WALL_H / 2, c.z);
        wall.add(block);
        const top = new THREE.Mesh(new THREE.BoxGeometry(TILE, 0.08, TILE), wallTop);
        top.position.set(c.x, WALL_H + 0.04, c.z);
        wall.add(top);
        // hairline crack on the faces — a hint that the masonry isn't true
        const crack = new THREE.Mesh(new THREE.BoxGeometry(0.06, WALL_H * 0.7, 0.06), seamMat);
        crack.position.set(c.x, WALL_H * 0.45, c.z);
        wall.add(crack);
      }
      scene.add(wall);
      const item = new THREE.Group();
      const ix = (d.itemTx + 0.5) * TILE, iz = (d.itemTy + 0.5) * TILE;
      item.position.set(ix, 0, iz);
      if (d.item === "candelabra") {
        const iron = this._mat("candelabra", { color: 0x2a2620, emissive: 0x100c08 });
        const wax = this._mat("cand-wax", { color: 0xe8dcc0, emissive: 0x3a2a10 });
        item.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 1.1, 6)));
        item.children[0].material = iron;
        item.children[0].position.y = 0.55;
        for (const [sx, sy] of [[-0.22, 0.95], [0, 1.2], [0.22, 0.95]]) {
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.22), iron);
          arm.position.set(sx * 0.5, 0.9, 0);
          item.add(arm);
          const cndl = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.28, 6), wax);
          cndl.position.set(sx, sy, 0);
          item.add(cndl);
          const fl = new THREE.Sprite(this.glowMat(0xffb060, 0.85));
          fl.position.set(sx, sy + 0.2, 0);
          fl.scale.set(0.35, 0.45, 1);
          item.add(fl);
        }
      } else if (d.item === "skull") {
        const bone = this._mat("skull", { color: 0xe8dcb8, emissive: 0x2a2410 });
        const socket = this._mat("socket", { color: 0x120e0c });
        const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), bone);
        cranium.scale.set(1, 0.9, 1.1);
        cranium.position.y = 0.42;
        const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.16), bone);
        jaw.position.set(0, 0.26, 0.06);
        const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.2, 6), this._mat("plinth", { color: 0x4a4038 }));
        plinth.position.y = 0.1;
        item.add(plinth, cranium, jaw);
        for (const sx of [-0.07, 0.07]) {
          const e = new THREE.Mesh(new THREE.CircleGeometry(0.05, 6), socket);
          e.position.set(sx, 0.46, 0.2);
          item.add(e);
        }
        const halo = new THREE.Sprite(this.glowMat(0xc4a070, 0.4));
        halo.position.y = 0.5;
        halo.scale.set(0.9, 0.9, 1);
        item.add(halo);
      } else if (d.item === "portrait") {
        // Hang it on the north wall of the hall (south face of the first secret tile).
        const frame = this._mat("pframe", { color: 0x5a3a14, emissive: 0x1a0e04 });
        const canvas = this._mat("portrait", { color: 0x2a1814, emissive: 0x120804 });
        const group = new THREE.Group();
        const fr = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.15, 0.06), frame);
        const cv = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.95), canvas);
        cv.position.z = 0.04;
        group.add(fr, cv);
        group.position.set(0, 1.55, -0.85);
        group.rotation.z = 0.09; // slightly crooked — the hint
        item.add(group);
        const halo = new THREE.Sprite(this.glowMat(0x6a4010, 0.35));
        halo.position.set(0, 1.55, -0.7);
        halo.scale.set(1.2, 1.4, 1);
        item.add(halo);
      }
      scene.add(item);
      this.secretRigs.push({ key: d.key, wall, item, open: 0 });
    }

    // Well mist / offering glow (the stone well itself is batched)
    this.wellGroup = new THREE.Group();
    if (level.well) {
      const wc = tileCenter(level.well.tx, level.well.ty);
      this.wellGroup.position.set(wc.x, 0, wc.z);
      const mist = new THREE.Sprite(this.glowMat(0x6a88aa, 0.35));
      mist.position.y = 0.7;
      mist.scale.set(2.2, 1.4, 1);
      this.wellMist = mist;
      this.wellGroup.add(mist);
      scene.add(this.wellGroup);
    }

    this._buildBreakables(level, woodMat, ironMat);
    this._buildChambers(level, wallSide, wallTop, woodMat, ironMat, goldMat, stoneMat);

    // ---------- Iron alcoves ----------
    const innerMat = this._mat("inner", { color: 0x120a0e });
    const spikeMat = this._mat("spike", { color: 0x8a8690 });
    for (const a of level.alcoves) {
      const c = tileCenter(a.tx, a.ty);
      const flip = !isFloor(a.tx, a.ty + 1);
      const s = flip ? -1 : 1;
      const P = (geo, mat, x, y, z, rx = 0, ry = 0) => B.add(geo, mat, c.x + x * s, y, c.z + z * s, rx * s, ry);
      P(new THREE.BoxGeometry(1.4, 2.5, 0.14), ironMat, 0, 1.25, -0.62);
      P(new THREE.BoxGeometry(1.24, 2.38, 0.04), innerMat, 0, 1.22, -0.53);
      P(new THREE.BoxGeometry(0.14, 2.5, 1.2), ironMat, -0.68, 1.25, -0.06);
      P(new THREE.BoxGeometry(0.14, 2.5, 1.2), ironMat, 0.68, 1.25, -0.06);
      P(new THREE.BoxGeometry(1.5, 0.18, 1.3), ironMat, 0, 2.58, -0.06);
      P(new THREE.ConeGeometry(0.55, 0.7, 4), ironMat, 0, 3.02, -0.06, 0, Math.PI / 4);
      P(new THREE.BoxGeometry(0.07, 2.5, 0.07), goldMat, -0.72, 1.25, 0.55);
      P(new THREE.BoxGeometry(0.07, 2.5, 0.07), goldMat, 0.72, 1.25, 0.55);
      P(new THREE.BoxGeometry(1.5, 0.07, 0.07), goldMat, 0, 2.5, 0.55);
      P(new THREE.ConeGeometry(0.06, 0.4, 4), goldMat, 0, 3.45, -0.06);
      for (let k = 0; k < 6; k++) P(new THREE.ConeGeometry(0.05, 0.22, 4), spikeMat, -0.42 + (k % 3) * 0.42, 0.9 + Math.floor(k / 3) * 0.8, -0.48, Math.PI / 2);
    }

    // ---------- Braziers (static) + pooled lights ----------
    const coalMat = new THREE.MeshBasicMaterial({ color: 0xff7a22 });
    psx(coalMat);
    for (const b of level.braziers) {
      const c = tileCenter(b.tx, b.ty);
      B.cyl(stoneMat, 0.26, 0.38, 0.75, 6, c.x, 0.375, c.z);
      B.cyl(ironMat, 0.55, 0.24, 0.34, 8, c.x, 0.92, c.z);
      B.cyl(coalMat, 0.46, 0.46, 0.06, 8, c.x, 1.07, c.z);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        B.box(goldMat, 0.06, 0.4, 0.06, c.x + Math.cos(a) * 0.42, 0.95, c.z + Math.sin(a) * 0.42);
      }
      bigFlames.push(c.x, 1.35, c.z, c.x - 0.18, 1.2, c.z + 0.1, c.x + 0.16, 1.22, c.z - 0.08);
    }
    this.brazierPos = level.braziers.map((b) => tileCenter(b.tx, b.ty));
    this.brazierLights = [];
    for (let i = 0; i < 4; i++) {
      const light = new THREE.PointLight(0xff8a3a, 22, 11, 1.3);
      light.position.set(-100, -100, -100);
      scene.add(light);
      this.brazierLights.push({ light, base: 22, seed: i * 2.7 });
    }

    // ---------- Cracked glass ----------
    const shardMat = this._mat("shard", { color: 0xa8d8ff, emissive: 0x24425a, side: THREE.DoubleSide });
    for (const gl of level.glass) {
      const c = tileCenter(gl.tx, gl.ty);
      for (let k = 0; k < 9; k++) B.add(new THREE.CircleGeometry(0.16, 3), shardMat, c.x + (rnd() - 0.5) * 1.2, 0.03, c.z + (rnd() - 0.5) * 1.2, -Math.PI / 2, 0, rnd() * Math.PI);
    }

    // ---------- Gate frame (static) ----------
    const ex = level.exitTile;
    const gc = tileCenter(ex.tx, ex.ty);
    B.box(stoneMat, 0.4, WALL_H + 0.6, 0.9, gc.x - 1.05, (WALL_H + 0.6) / 2, gc.z + 0.6);
    B.box(stoneMat, 0.4, WALL_H + 0.6, 0.9, gc.x + 1.05, (WALL_H + 0.6) / 2, gc.z + 0.6);
    B.box(goldMat, 2.5, 0.5, 0.9, gc.x, WALL_H + 0.35, gc.z + 0.6);

    B.build(scene, true);

    // ---------- Flames & halos (one draw call each) ----------
    const mkPoints = (arr, size, map, color = 0xffffff, opacity = 1) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(arr.length ? arr : [0, -10, 0], 3));
      const mat = new THREE.PointsMaterial({ map, size, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color, opacity, alphaTest: 0.01 });
      const pts = new THREE.Points(geo, mat);
      scene.add(pts);
      return pts;
    };
    this.smallFlames = mkPoints(smallFlames, 0.32, T.flame);
    this.bigFlames = mkPoints(bigFlames, 0.8, T.flame);
    this.halos = mkPoints(bigFlames, 1.7, T.glow, 0xff7a2a, 0.5);

    const glowMat = (color, opacity) => new THREE.SpriteMaterial({ map: T.glow, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
    this.glowMat = glowMat;

    // ---------- Ledger pages ----------
    const pageMat = this._mat("page", { map: T.parchment, side: THREE.DoubleSide, emissive: 0x3a2a10 });
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xe7c873, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.pageMeshes = level.pages.map((p) => {
      const g = new THREE.Group();
      g.position.set(p.x * S, 0, p.y * S);
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.64), pageMat);
      sheet.position.y = 1.0;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.45, 3.4, 6, 1, true), beamMat);
      beam.position.y = 1.7;
      const halo = new THREE.Sprite(glowMat(0xe7c873, 0.7));
      halo.position.y = 1.0;
      halo.scale.set(1.3, 1.3, 1);
      g.add(sheet, beam, halo);
      scene.add(g);
      return { g, sheet };
    });

    // ---------- Mirror pickups ----------
    const paneMat = new THREE.MeshBasicMaterial({ color: 0xcfe6ff, side: THREE.DoubleSide });
    psx(paneMat);
    this.mirrorMeshes = level.mirrors.map((m) => {
      const tier = MIRROR_TIERS[m.tier];
      const g = new THREE.Group();
      g.position.set(m.x * S, 0, m.y * S);
      const spin = new THREE.Group();
      spin.position.y = 0.95;
      const frameMat = this._mat(`mframe-${m.tier}`, { color: tier.color, emissive: m.tier === "obsidian" ? 0x3a1060 : 0x1a1408, side: THREE.DoubleSide });
      const frame = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 4, 10), frameMat);
      frame.scale.set(1, 1.3, 1);
      const pane = new THREE.Mesh(new THREE.CircleGeometry(0.27, 10), m.tier === "obsidian" ? new THREE.MeshBasicMaterial({ color: 0x1a0a2a, side: THREE.DoubleSide }) : paneMat);
      pane.scale.set(1, 1.3, 1);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 0.07), frameMat);
      handle.position.y = -0.52;
      spin.add(frame, pane, handle);
      const halo = new THREE.Sprite(glowMat(tier.color, m.tier === "cracked" ? 0.45 : 0.75));
      halo.position.y = 0.95;
      const hs = { cracked: 1.1, silver: 1.4, gilded: 1.8, obsidian: 2.2 }[m.tier];
      halo.scale.set(hs, hs, 1);
      g.add(spin, halo);
      if (m.tier === "gilded" || m.tier === "obsidian") {
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 3.0, 6, 1, true), new THREE.MeshBasicMaterial({ color: tier.color, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        beam.position.y = 1.5;
        g.add(beam);
      }
      scene.add(g);
      return { g, spin };
    });

    // ---------- Bolt bundles (crossbow ammo) ----------
    const boltMat = this._mat("bolt", { color: 0xd8dde6, emissive: 0x30343c });
    const boltWood = this._mat("w-wood2", { map: T.wood });
    this.boltMeshes = level.bolts.map((b) => {
      const g = new THREE.Group();
      g.position.set(b.x * S, 0, b.y * S);
      for (let k = 0; k < 3; k++) {
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.7), boltWood);
        shaft.position.set(-0.1 + k * 0.1, 0.12 + (k % 2) * 0.06, 0);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 4), boltMat);
        tip.rotation.x = Math.PI / 2;
        tip.position.set(-0.1 + k * 0.1, 0.12 + (k % 2) * 0.06, 0.4);
        g.add(shaft, tip);
      }
      const halo = new THREE.Sprite(glowMat(0xbcd4ff, 0.5));
      halo.position.y = 0.3;
      halo.scale.set(0.9, 0.9, 1);
      g.add(halo);
      g.rotation.y = rnd() * Math.PI;
      scene.add(g);
      return { g };
    });

    // ---------- Portcullis + seals ----------
    this.gate = new THREE.Group();
    this.gate.position.copy(gc);
    this.bars = new THREE.Group();
    const barMat = this._mat("bars", { map: T.iron });
    for (let k = 0; k < 6; k++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, WALL_H, 0.1), barMat);
      b.position.set(-0.8 + k * 0.32, WALL_H / 2, 0.9);
      this.bars.add(b);
    }
    for (const y of [0.8, 1.9]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.1), barMat);
      h.position.set(0, y, 0.92);
      this.bars.add(h);
    }
    this.gate.add(this.bars);
    this.seals = [];
    for (let k = 0; k < 5; k++) {
      const m = new THREE.MeshBasicMaterial({ color: 0xc41230 });
      const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 8), m);
      seal.rotation.x = Math.PI / 2;
      seal.position.set(-0.64 + k * 0.32, 1.35, 0.98);
      this.bars.add(seal);
      this.seals.push(m);
    }
    this.gateLight = new THREE.PointLight(0xc41230, 10, 8, 1.2);
    this.gateLight.position.set(gc.x, 2.2, gc.z + 1.8);
    scene.add(this.gateLight, this.gate);

    // ---------- Death Echo ----------
    this.echo = new THREE.Group();
    const echoLantern = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.2), ironMat);
    echoLantern.rotation.z = Math.PI / 2.4;
    echoLantern.position.y = 0.12;
    const echoGlass = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.14), new THREE.MeshBasicMaterial({ color: 0xffc860 }));
    echoGlass.rotation.z = Math.PI / 2.4;
    echoGlass.position.y = 0.12;
    this.echoHalo = new THREE.Sprite(glowMat(0xffb040, 0.8));
    this.echoHalo.position.y = 0.25;
    this.echoHalo.scale.set(1.4, 1.4, 1);
    const echoRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.58, 10), new THREE.MeshBasicMaterial({ color: 0xc41230, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    echoRing.rotation.x = -Math.PI / 2;
    echoRing.position.y = 0.02;
    this.echo.add(echoLantern, echoGlass, this.echoHalo, echoRing);
    this.echo.visible = false;
    scene.add(this.echo);

    // ---------- Characters ----------
    this.inv = buildInvestigator(T, psx);
    scene.add(this.inv.root);
    this.spot = new THREE.SpotLight(0xffd08a, 60, 16, 0.62, 0.45, 1.1);
    this.spot.castShadow = true;
    this.spot.shadow.mapSize.set(512, 512);
    this.spot.shadow.camera.near = 0.3;
    this.spot.shadow.camera.far = 16;
    this.spot.shadow.bias = -0.002;
    scene.add(this.spot, this.spot.target);
    this.aura = new THREE.PointLight(0xffc27a, 4, 5, 1.2);
    scene.add(this.aura);

    this.cnt = buildCountess(T, psx);
    scene.add(this.cnt.root);
    this.cntLight = new THREE.PointLight(0xff1a3c, 5, 6, 1.2);
    this.cnt.root.add(this.cntLight);
    this.cntLight.position.set(0, 0.9, 0.9);
    this.eyeGlow = [];
    for (const sx of [-0.08, 0.08]) {
      const s = new THREE.Sprite(glowMat(0xff2448, 0.95));
      s.position.set(sx, 2.5, 0.22);
      s.scale.set(0.16, 0.16, 1);
      this.cnt.body.add(s);
      this.eyeGlow.push(s);
    }
    // Frozen-in-the-mirror shell
    this.iceShell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.95, 3.2, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    this.iceShell.position.y = 1.55;
    this.iceShell.visible = false;
    this.cnt.root.add(this.iceShell);
    this.iceFrame = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.07, 4, 16), new THREE.MeshBasicMaterial({ color: 0xe7c873 }));
    this.iceFrame.scale.set(0.85, 1.35, 1);
    this.iceFrame.position.set(0, 1.6, 0);
    this.iceFrame.visible = false;
    this.cnt.root.add(this.iceFrame);

    // ---------- Combat FX ----------
    const pGeo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(PARTICLES * 3).fill(-50);
    this.pCol = new Float32Array(PARTICLES * 3);
    pGeo.setAttribute("position", new THREE.BufferAttribute(this.pPos, 3));
    pGeo.setAttribute("color", new THREE.BufferAttribute(this.pCol, 3));
    this.particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.particles.frustumCulled = false;
    scene.add(this.particles);
    this.pVel = new Float32Array(PARTICLES * 3);
    this.pLife = new Float32Array(PARTICLES);
    this.pGrav = new Float32Array(PARTICLES);
    this.pNext = 0;

    this.slashes = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 1.6, 12, 1, -0.9, 1.8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      g.add(ring);
      g.visible = false;
      scene.add(g);
      this.slashes.push({ g, ring, life: 0 });
    }
    this.boltPool = [];
    for (let i = 0; i < 10; i++) {
      const b = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.6), boltWood);
      const tip = new THREE.Sprite(glowMat(0xd8e8ff, 0.9));
      tip.scale.set(0.35, 0.35, 1);
      tip.position.z = 0.3;
      b.add(shaft, tip);
      b.visible = false;
      scene.add(b);
      this.boltPool.push(b);
    }
    this.shockRing = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.0, 20), new THREE.MeshBasicMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.shockRing.rotation.x = -Math.PI / 2;
    this.shockRing.visible = false;
    scene.add(this.shockRing);
    this.shockLife = 0;

    // ---------- Dust ----------
    const dust = [];
    for (let i = 0; i < 400; i++) dust.push(rnd() * fw, rnd() * 3.2, rnd() * fh);
    const dg = new THREE.BufferGeometry();
    dg.setAttribute("position", new THREE.Float32BufferAttribute(dust, 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xd8c8b0, size: 0.06, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(this.dust);
  }

  // ---------------- FX helpers ----------------
  _emit(x, y, z, n, color, speed = 3, up = 2, grav = 6, life = 0.6) {
    const c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const i = this.pNext;
      this.pNext = (this.pNext + 1) % PARTICLES;
      this.pPos[i * 3] = x; this.pPos[i * 3 + 1] = y; this.pPos[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.3 + Math.random() * 0.7);
      this.pVel[i * 3] = Math.cos(a) * sp;
      this.pVel[i * 3 + 1] = up * (0.4 + Math.random());
      this.pVel[i * 3 + 2] = Math.sin(a) * sp;
      this.pLife[i] = life * (0.6 + Math.random() * 0.6);
      this.pGrav[i] = grav;
      this.pCol[i * 3] = c.r; this.pCol[i * 3 + 1] = c.g; this.pCol[i * 3 + 2] = c.b;
    }
  }

  _consumeFx(list) {
    for (const f of list) {
      const x = f.x * S, z = f.y * S;
      if (f.type === "spark") this._emit(x, f.h ?? 1.1, z, f.n ?? 14, f.color ?? 0xffd27a, 4, 2.5, 8, 0.45);
      else if (f.type === "blood") this._emit(x, 0.9, z, f.n ?? 16, 0x9a0a1c, 2.5, 2, 9, 0.7);
      else if (f.type === "mist") this._emit(x, 0.3, z, 26, 0x6a1030, 1.4, 1.4, -0.5, 1.2);
      else if (f.type === "dissolve") this._emit(x, 0.8, z, 34, f.color ?? 0x8a0a2a, 1.8, 1.6, -1.5, 1.3);
      else if (f.type === "burn") this._emit(x, 1.0, z, 2, 0xff8a2a, 0.6, 1.8, -2, 0.4);
      else if (f.type === "pickup") this._emit(x, 1.0, z, 18, f.color ?? 0xe7c873, 1.6, 2.4, 2, 0.8);
      else if (f.type === "heal") this._emit(x, 0.5, z, 2, 0xff6a6a, 0.4, 1.6, -1, 0.6);
      else if (f.type === "splinter") {
        this._emit(x, 0.8, z, f.n ?? 12, 0xb07a40, f.big ? 5.5 : 3.0, f.big ? 4.0 : 2.6, 9, f.big ? 1.1 : 0.55);
        if (f.big) {
          this._emit(x, 0.6, z, 30, 0x6a4420, 3.6, 3.2, 8, 1.0);
          this._emit(x, 0.9, z, 16, 0xffd27a, 2.4, 2.5, 8, 0.6);
          this.shockRing.position.set(x, 0.05, z);
          this.shockRing.material.color.setHex(0xc9a24d);
          this.shockRing.visible = true;
          this.shockLife = 0.7;
        }
      }
      else if (f.type === "slime") {
        this._emit(x, 0.4, z, 26, 0xb0101e, 2.6, 2.6, 9, 0.7);
        this._emit(x, 0.4, z, 10, 0x6aff5a, 1.6, 2.0, 7, 0.6);
      }
      else if (f.type === "shatter") {
        this._emit(x, 1.8, z, 60, f.color ?? 0xdff0ff, 6, 3.5, 7, 1.0);
        this._emit(x, 1.6, z, 30, 0xffffff, 3, 1.5, 3, 0.6);
        this.shockRing.position.set(x, 0.05, z);
        this.shockRing.material.color.setHex(f.color ?? 0xcfe6ff);
        this.shockRing.visible = true;
        this.shockLife = 1;
      } else if (f.type === "slash") {
        const s = this.slashes.find((q) => q.life <= 0) || this.slashes[0];
        s.life = 1;
        s.g.visible = true;
        s.g.position.set(x, f.h ?? 1.05, z);
        s.g.rotation.y = -f.angle;
        const outer = (f.reach * S) + 0.4;
        s.ring.geometry.dispose();
        s.ring.geometry = new THREE.RingGeometry(Math.max(0.3, outer - 0.42), outer, 12, 1, -f.arc / 2, f.arc);
        s.ring.material.color.setHex(f.color ?? 0xffffff);
      }
    }
    list.length = 0;
  }

  _updateFx(dt) {
    for (let i = 0; i < PARTICLES; i++) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt;
      if (this.pLife[i] <= 0) { this.pPos[i * 3 + 1] = -50; continue; }
      this.pVel[i * 3 + 1] -= this.pGrav[i] * dt;
      this.pPos[i * 3] += this.pVel[i * 3] * dt;
      this.pPos[i * 3 + 1] = Math.max(0.03, this.pPos[i * 3 + 1] + this.pVel[i * 3 + 1] * dt);
      this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
    this.particles.geometry.attributes.color.needsUpdate = true;
    for (const s of this.slashes) {
      if (s.life <= 0) { s.g.visible = false; continue; }
      s.life -= dt * 5;
      s.ring.material.opacity = Math.max(0, s.life) * 0.5;
    }
    if (this.shockLife > 0) {
      this.shockLife -= dt * 1.4;
      const sc = 1 + (1 - this.shockLife) * 6;
      this.shockRing.scale.set(sc, sc, 1);
      this.shockRing.material.opacity = Math.max(0, this.shockLife) * 0.8;
      if (this.shockLife <= 0) this.shockRing.visible = false;
    }
  }

  _animateWalk(rig, phase, amount, { countess = false } = {}) {
    const swing = Math.sin(phase) * 0.7 * amount;
    if (rig.legs) {
      rig.legs[0].rotation.x = swing;
      rig.legs[1].rotation.x = -swing;
    }
    if (countess) {
      rig.skirt.rotation.z = Math.sin(phase) * 0.05 * amount;
      rig.skirt.rotation.x = Math.sin(phase * 0.5) * 0.03;
    }
    rig.body.position.y = Math.abs(Math.sin(phase)) * 0.05 * amount;
  }

  _updateMonsters(monsters, dt, t) {
    const seen = new Set();
    for (const m of monsters) {
      seen.add(m.id);
      let rig = this.monsterRigs.get(m.id);
      if (!rig) {
        rig = buildMonster(m.kind, this.T, psx);
        rig.walk = Math.random() * 6;
        rig.prev = new THREE.Vector2(m.x * S, m.y * S);
        rig.eyes = [];
        for (const sx of [-0.07, 0.07]) {
          const e = new THREE.Sprite(this.glowMat(rig.eyeColor, 0.95));
          e.position.set(sx, rig.eyeY, rig.eyeZ);
          e.scale.set(0.16, 0.16, 1);
          rig.body.add(e);
          rig.eyes.push(e);
        }
        const bar = new THREE.Group();
        const bg = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.09), new THREE.MeshBasicMaterial({ color: 0x1a0a0e, depthTest: false, transparent: true }));
        const fill = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.06), new THREE.MeshBasicMaterial({ color: 0xc41230, depthTest: false, transparent: true }));
        fill.position.z = 0.001;
        bg.renderOrder = 10;
        fill.renderOrder = 11;
        bar.add(bg, fill);
        bar.position.y = rig.barY;
        rig.root.add(bar);
        rig.bar = bar;
        rig.fill = fill;
        this.scene.add(rig.root);
        this.monsterRigs.set(m.id, rig);
      }
      const x = m.x * S, z = m.y * S;
      const moved = Math.hypot(x - rig.prev.x, z - rig.prev.y);
      rig.prev.set(x, z);
      const speed = dt > 0 ? moved / dt : 0;
      rig.root.position.set(x, 0, z);
      rig.root.rotation.y = Math.atan2(Math.cos(m.angle), Math.sin(m.angle));
      rig.walk += dt * Math.min(speed, 8) * 3;

      // rise from mist / dissolve
      let scale = 1;
      let sink = 0;
      if (m.state === "RISE") {
        const riseT = m.fromWell ? 1.8 : 0.9;
        const k = Math.max(0, Math.min(1, m.timer / riseT));
        scale = Math.max(0.05, 1 - k);
        sink = m.fromWell ? -k * 2.4 : -k * 1.2;
        if (m.fromWell && m.emergeFrom) {
          const a = 1 - k;
          rig.root.position.set((m.emergeFrom.x * (1 - a) + m.x * a) * S, sink, (m.emergeFrom.y * (1 - a) + m.y * a) * S);
        }
      }
      let opacity = 1;
      if (m.dead) { opacity = Math.max(0, 1 - m.deadTime / 1.1); sink = -m.deadTime * 0.9; scale = 1 + m.deadTime * 0.2; }
      rig.root.scale.set(scale, m.dead ? Math.max(0.05, 1 - m.deadTime * 0.8) : scale, scale);
      rig.root.position.y = sink;
      const flash = m.flash > 0;
      for (const mat of rig.mats) {
        mat.transparent = m.dead;
        mat.opacity = opacity;
        if (flash) mat.emissive.setHex(0xffffff);
        else if (m.burn > 0) mat.emissive.setHex(Math.sin(t * 30) > 0 ? 0x803010 : 0x401004);
        else if (m.dead) mat.emissive.setHex(0x400010);
        else mat.emissive.setHex(0x000000);
      }
      for (const e of rig.eyes) { e.visible = !rig.hideEyes; e.material.opacity = m.dead ? opacity * 0.5 : (rig.hideEyes ? 0 : 0.95); }

      // health bar (faces camera)
      rig.bar.visible = !m.dead && m.hp < m.maxHp;
      if (rig.bar.visible) {
        rig.bar.quaternion.copy(rig.root.quaternion).invert().multiply(this.camera.quaternion);
        const f = Math.max(0, m.hp / m.maxHp);
        rig.fill.scale.x = Math.max(0.001, f);
        rig.fill.position.x = -0.38 * (1 - f);
      }

      // per-type animation
      const windup = m.state === "WINDUP";
      const hurt = m.hurt > 0;
      if (m.kind === "ghoul") {
        this._animateWalk(rig, rig.walk, Math.min(1, speed / 1.5));
        const reach = windup ? -2.2 : hurt ? 0.6 : -0.9 + Math.sin(rig.walk) * 0.3;
        rig.arms[0].rotation.x = reach;
        rig.arms[1].rotation.x = windup ? -2.2 : -0.9 - Math.sin(rig.walk) * 0.3;
        rig.torso.rotation.x = hurt ? 0.05 : windup ? 0.7 : 0.45 + Math.sin(t * 2 + m.id) * 0.05;
      } else if (m.kind === "maiden") {
        rig.limbs.forEach((l, i) => { l.rotation.x = Math.sin(rig.walk * 1.6 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6; });
        rig.body.position.y = windup ? 0.25 : Math.abs(Math.sin(rig.walk * 1.6)) * 0.06;
        rig.body.rotation.x = windup ? -0.5 : hurt ? 0.3 : 0;
      } else if (m.kind === "dweller") {
        const jerk = 1 - (m.lurchPause > 0 ? 1 : 0);
        if (rig.arms) {
          rig.arms[0].rotation.x = Math.sin(rig.walk * 1.1) * 0.55 * jerk + (windup ? -0.8 : 0);
          rig.arms[1].rotation.x = Math.sin(rig.walk * 1.1 + Math.PI) * 0.55 * jerk + (windup ? -0.8 : 0);
        }
        if (rig.legs) {
          rig.legs[0].rotation.x = Math.sin(rig.walk * 0.9 + 0.4) * 0.25;
          rig.legs[1].rotation.x = Math.sin(rig.walk * 0.9 + Math.PI) * 0.25;
        }
        rig.body.rotation.x = (hurt ? 0.5 : windup ? 0.45 : 0.72) + Math.sin(t * 9 + m.id) * 0.03;
        rig.body.position.y = (m.lurchPause > 0 ? 0.02 : 0) + (windup ? 0.12 : 0);
      } else if (rig.blob) {
        const hop = m.hop || 0;
        const air = hop < 0.55 && !m.dead && m.state !== "RISE" ? Math.sin((hop / 0.55) * Math.PI) : 0;
        const squash = windup ? 0.7 : 1 - Math.max(0, Math.sin(((hop - 0.55) / 0.45) * Math.PI)) * 0.25 * (hop >= 0.55 ? 1 : 0);
        rig.blob.position.y = air * 0.45 * rig.slimeK;
        rig.blob.scale.set(1 + (1 - squash) * 0.8 + Math.sin(t * 7 + m.id) * 0.04, squash + air * 0.15, 1 + (1 - squash) * 0.8);
      } else {
        rig.bats.forEach((b) => {
          const a = t * 3 + b.phase + m.id;
          b.b.position.set(Math.cos(a) * b.r, b.h + Math.sin(t * 5 + b.phase) * 0.15 - (windup ? 0.4 : 0), Math.sin(a) * b.r);
          b.b.rotation.y = -a;
          const flap = Math.sin(t * 28 + b.phase) * 0.9;
          b.wl.rotation.z = flap;
          b.wr.rotation.z = -flap;
        });
      }
    }
    for (const [id, rig] of this.monsterRigs) {
      if (!seen.has(id)) {
        this.scene.remove(rig.root);
        rig.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
        rig.mats.forEach((m) => m.dispose());
        this.monsterRigs.delete(id);
      }
    }
  }

  render(state) {
    if (!this.built) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastNow) / 1000);
    this.lastNow = now;
    this.time += dt;
    const t = this.time;
    const { player, countess, mode, flareFlash = 0, deathEcho, witching, monsters = [], projectiles = [], drops = [], fx = [], shake = 0, hurt = 0, weapon, speedBoost = 0, darkCurse = 0 } = state;
    const level = this.level;
    if (weapon !== undefined) this.setWeapon(weapon);

    this._consumeFx(fx);
    this._updateFx(dt);
    this._syncDrops(drops, t);
    this._updateSecrets(level, dt);
    this._updateWell(level, t, fx);
    this._syncBreakables(level, dt);
    this._updateChambers(level, dt, t);
    if (player && speedBoost > 0 && mode === "PLAYING") this._speedTrail(player, dt, t);

    this.bigFlames.material.size = 0.8 + Math.sin(t * 17) * 0.06;
    this.smallFlames.material.size = 0.32 + Math.sin(t * 21 + 1) * 0.04;
    this.halos.material.opacity = 0.45 + Math.sin(t * 9) * 0.06;

    const dp = this.dust.geometry.attributes.position;
    for (let i = 0; i < dp.count; i++) {
      let y = dp.getY(i) + dt * 0.08;
      if (y > 3.4) y = 0;
      dp.setY(i, y);
    }
    dp.needsUpdate = true;

    if (level) {
      this.pageMeshes.forEach((pm, i) => {
        const p = level.pages[i];
        pm.g.visible = !!p && !p.collected;
        pm.sheet.position.y = 1.0 + Math.sin(t * 2.4 + i) * 0.1;
        pm.sheet.rotation.y = t * 1.3 + i;
      });
      this.mirrorMeshes.forEach((mm, i) => {
        const m = level.mirrors[i];
        mm.g.visible = !!m && !m.collected;
        mm.spin.rotation.y = t * 1.6 + i;
        mm.spin.position.y = 0.95 + Math.sin(t * 2 + i) * 0.08;
      });
      const showBolts = weapon === "crossbow";
      this.boltMeshes.forEach((bm, i) => { bm.g.visible = showBolts && !level.bolts[i].collected; });
    }

    const pagesFound = player ? player.pagesFound : 0;
    const open = pagesFound >= 5;
    this.seals.forEach((m, i) => m.color.setHex(i < pagesFound ? 0x3a2a10 : 0xc41230));
    this.bars.position.y += ((open ? WALL_H - 0.4 : 0) - this.bars.position.y) * Math.min(1, dt * 2);
    this.gateLight.color.setHex(open ? 0xe7c873 : 0xc41230);
    this.gateLight.intensity = open ? 26 + Math.sin(t * 4) * 4 : 8;

    if (deathEcho && mode !== "TITLE" && mode !== "SELECT") {
      this.echo.visible = true;
      this.echo.position.set(deathEcho.x * S, 0, deathEcho.y * S);
      this.echoHalo.material.opacity = 0.5 + 0.35 * Math.sin(t * 5);
    } else {
      this.echo.visible = false;
    }

    // ---------- Player ----------
    const inv = this.inv;
    let focus = null;
    const inMenu = mode === "TITLE" || mode === "SELECT";
    if (player && !inMenu) {
      inv.root.visible = true;
      const px = player.x * S;
      const pz = player.y * S;
      const moved = Math.hypot(px - this.prevPlayer.x, pz - this.prevPlayer.y);
      this.prevPlayer.set(px, pz);
      const speed = dt > 0 ? moved / dt : 0;
      inv.root.position.set(px, 0, pz);
      let yaw = Math.atan2(Math.cos(player.angle), Math.sin(player.angle));
      if (player.hidden) yaw = 0;
      const dy = Math.atan2(Math.sin(yaw - this.playerYaw), Math.cos(yaw - this.playerYaw));
      this.playerYaw += dy * Math.min(1, dt * 14);
      inv.root.rotation.y = this.playerYaw;
      if (speed > 0.3 && speed < 20) this.playerWalk += dt * speed * 3.2;
      const amt = Math.min(1, speed / 2.5);
      this._animateWalk(inv, this.playerWalk, amt);
      inv.arms[1].rotation.x = player.hidden ? -0.3 : -1.05;

      // weapon arm (left): idle carry + per-weapon swing
      const a = player.attackAnim || 0; // 1 -> 0
      const p = 1 - a;
      const arm = inv.arms[0];
      arm.rotation.set(0, 0, 0);
      if (weapon === "crossbow") {
        arm.rotation.x = -1.45 + (a > 0 ? Math.sin(p * Math.PI) * 0.35 : 0);
      } else if (a > 0) {
        if (weapon === "dagger") arm.rotation.x = -0.4 - Math.sin(p * Math.PI) * 1.25;
        else if (weapon === "mace") arm.rotation.x = p < 0.35 ? -0.6 - (p / 0.35) * 2.3 : -2.9 + ((p - 0.35) / 0.65) * 2.4;
        else { arm.rotation.x = -1.35; arm.rotation.z = 1.3 - p * 2.6; }
      } else {
        arm.rotation.x = weapon === "staff" ? -0.5 : -0.35 - Math.sin(this.playerWalk) * 0.4 * amt;
      }
      if (this.weaponModel && this.weaponModel.userData.flame) {
        const f = this.weaponModel.userData.flame;
        f.scale.set(1 + Math.sin(t * 30) * 0.15, 1 + Math.sin(t * 23) * 0.2, 1);
      }
      inv.root.scale.setScalar(player.hidden ? 0.92 : 1);
      inv.body.position.y += player.hidden ? -0.08 : 0;
      // hurt flinch
      inv.body.rotation.x = player.hurtAnim > 0 ? -0.25 * player.hurtAnim : 0;

      const lit = player.lanternOn && !player.hidden;
      inv.glassMat.color.setHex(lit ? 0xffd27a : 0x2a2a30);
      const dirX = Math.cos(player.angle);
      const dirZ = Math.sin(player.angle);
      this.spot.visible = lit;
      const lowOilFlicker = player.oil < 15 ? 0.6 + 0.4 * Math.abs(Math.sin(t * 26)) : 1;
      const cursed = darkCurse > 0;
      this.spot.intensity = 60 * lowOilFlicker * (cursed ? 0.28 : 1);
      this.spot.distance = cursed ? 6.5 : 16;
      this.spot.angle = cursed ? 0.34 : 0.62;
      this.spot.position.set(px + dirX * 0.45, 1.25, pz + dirZ * 0.45);
      this.spot.target.position.set(px + dirX * (cursed ? 3 : 6), 0, pz + dirZ * (cursed ? 3 : 6));
      this.aura.position.set(px + dirX * 0.4, 1.3, pz + dirZ * 0.4);
      const staffGlow = weapon === "staff" && !player.hidden ? 4 : 0;
      this.aura.intensity = ((lit ? 9 : 2.2) + staffGlow + flareFlash * 160) * (cursed ? 0.35 : 1);
      this.aura.distance = (5 + flareFlash * 10) * (cursed ? 0.4 : 1);
      this.aura.color.setHex(flareFlash > 0.05 ? 0xfff0d0 : 0xffc27a);
      focus = new THREE.Vector3(px, 0, pz);
    } else {
      inv.root.visible = false;
      this.spot.visible = false;
      this.aura.intensity = 0;
    }

    // ---------- Countess ----------
    const cnt = this.cnt;
    if (countess) {
      const cx = countess.x * S;
      const cz = countess.y * S;
      const moved = Math.hypot(cx - this.prevCountess.x, cz - this.prevCountess.y);
      this.prevCountess.set(cx, cz);
      const speed = dt > 0 ? moved / dt : 0;
      cnt.root.position.set(cx, 0, cz);
      const frozen = countess.state === AI_STATE.FROZEN;
      const yaw = Math.atan2(Math.cos(countess.angle), Math.sin(countess.angle));
      const dy = Math.atan2(Math.sin(yaw - this.countessYaw), Math.cos(yaw - this.countessYaw));
      if (!frozen) this.countessYaw += dy * Math.min(1, dt * 8);
      cnt.root.rotation.y = this.countessYaw;
      const hunting = countess.state === AI_STATE.HUNT;
      const stunned = countess.state === AI_STATE.STUNNED;
      if (!frozen) {
        if (speed > 0.2 && speed < 20) this.countessWalk += dt * speed * 2.4;
        const amt = Math.min(1, speed / 2.5);
        this._animateWalk(cnt, this.countessWalk, amt, { countess: true });
        cnt.body.position.y += 0.04 * Math.sin(t * 1.8);
        const reach = hunting ? -1.25 : -0.15 - Math.sin(this.countessWalk) * 0.35 * amt;
        cnt.arms[0].rotation.x = hunting ? reach : -0.15 + Math.sin(this.countessWalk) * 0.35 * amt;
        cnt.arms[1].rotation.x = reach;
        cnt.arms[0].rotation.z = stunned ? -0.9 : -0.08;
        cnt.arms[1].rotation.z = stunned ? 0.9 : 0.08;
        cnt.body.rotation.x = stunned ? -0.25 : hunting ? 0.12 : 0;
      }
      const eyeCol = frozen ? 0xcfe6ff : stunned ? 0xe7c873 : 0xff2448;
      cnt.eyeMat.color.setHex(eyeCol);
      for (const g of this.eyeGlow) {
        g.material.color.setHex(eyeCol);
        const sc = hunting ? 0.26 + 0.05 * Math.sin(t * 20) : 0.17;
        g.scale.set(sc, sc, 1);
      }
      for (const m of cnt.mats) m.emissive.setHex(frozen ? 0x506a88 : 0x000000);
      this.iceShell.visible = frozen;
      this.iceFrame.visible = frozen;
      if (frozen) {
        const left = countess.freezeTimer / Math.max(0.01, countess.freezeTotal);
        this.iceShell.material.opacity = 0.16 + 0.08 * Math.sin(t * 6) + (left < 0.25 ? 0.12 * Math.sin(t * 30) : 0);
        this.iceFrame.rotation.y = -this.countessYaw + Math.PI / 2 * 0;
        this.iceFrame.material.color.setHex(left < 0.25 && Math.sin(t * 20) > 0 ? 0xffffff : 0xe7c873);
        this.cntLight.color.setHex(0xbfe0ff);
        this.cntLight.intensity = 10;
      } else {
        this.cntLight.color.setHex(0xff1a3c);
        this.cntLight.intensity = hunting ? 8 + Math.sin(t * 12) * 2 : 4;
      }
    }

    this._updateMonsters(monsters, dt, t);

    // projectiles
    this.boltPool.forEach((b, i) => {
      const p = projectiles[i];
      b.visible = !!p;
      if (p) {
        b.position.set(p.x * S, 1.15, p.y * S);
        b.rotation.y = Math.atan2(p.vx, p.vy);
      }
    });

    // ---------- Brazier light pool: the 4 nearest braziers get real lights ----------
    this.lightPoolTimer -= dt;
    const ref = focus || (countess ? new THREE.Vector3(countess.x * S, 0, countess.y * S) : new THREE.Vector3());
    if (this.lightPoolTimer <= 0) {
      this.lightPoolTimer = 0.3;
      const order = this.brazierPos.map((p, i) => [p.distanceToSquared(ref), i]).sort((a, b) => a[0] - b[0]).slice(0, this.brazierLights.length);
      order.forEach(([, i], k) => { const p = this.brazierPos[i]; this.brazierLights[k].light.position.set(p.x, 1.8, p.z); });
    }
    for (const b of this.brazierLights) b.light.intensity = b.base * (0.85 + 0.15 * Math.sin(t * 11 + b.seed) + 0.08 * Math.sin(t * 23 + b.seed * 3));

    // ---------- Camera ----------
    const dangerRed = countess && countess.state === AI_STATE.HUNT ? 1 : 0;
    if (inMenu || !focus) {
      const f = countess ? new THREE.Vector3(countess.x * S, 0, countess.y * S) : new THREE.Vector3(25, 0, 15);
      const a = Math.sin(t * 0.15) * 0.28;
      this.camera.position.set(f.x + Math.sin(a) * 5.4, 2.0, f.z + Math.cos(a) * 5.4);
      this.camera.lookAt(f.x, 0.35, f.z);
      U_PLAYER.value.copy(f);
      U_CAM.value.copy(this.camera.position);
      this.snapCam = true;
      SNAP.value.copy(this.baseSnap);
      this.postMat.uniforms.uGlitch.value = 0;
    } else {
      const ftx = Math.floor(focus.x / TILE), fty = Math.floor(focus.z / TILE);
      const room = roomAt(level, ftx, fty);
      if (room) this.lastRoomKey = room.key;
      const nearDoor = (level.lockedRooms || []).some((lr) => Math.abs(ftx - lr.door[0]) <= 1 && fty >= lr.door[1] - 3 && fty <= lr.door[1] - 1);
      if (nearDoor) this.lastRoomKey = "doorway";
      else if (!room && this.lastRoomKey === "doorway") this.lastRoomKey = fty >= 46 ? this.lastRoomKey : "ward";
      const o = CAM_OFFSETS[this.lastRoomKey];
      const off = player.hidden ? new THREE.Vector3(2.0, 4.8, 3.8) : new THREE.Vector3(o[0], o[1], o[2]);
      if (this.camera.aspect < 0.8) off.multiplyScalar(1.28);
      this.camOffset.lerp(off, Math.min(1, dt * 2.2));
      // Sealed puzzle chambers use a fixed camera framed on the room centre.
      const camF = room && room.sealed
        ? new THREE.Vector3(((room.x0 + room.x1 + 1) / 2) * TILE, 0, ((room.y0 + room.y1 + 1) / 2) * TILE)
        : focus;
      const desired = camF.clone().add(this.camOffset);
      const look = camF.clone().add(new THREE.Vector3(0, 1.0, this.lastRoomKey === "doorway" ? 0.9 : -0.6));
      if (this.snapCam) {
        this.camOffset.copy(off);
        this.camPos.copy(camF).add(off);
        this.camLook.copy(look);
        this.snapCam = false;
      } else {
        this.camPos.lerp(desired, Math.min(1, dt * 4));
        this.camLook.lerp(look, Math.min(1, dt * 6));
      }
      const lowSan = Math.max(0, (38 - player.sanity) / 38);
      const sh = lowSan * 0.06 + flareFlash * 0.05 + shake * 0.35;
      this.camera.position.copy(this.camPos).add(new THREE.Vector3((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh * 0.5));
      this.camera.lookAt(this.camLook);
      U_PLAYER.value.copy(focus);
      U_CAM.value.copy(this.camera.position);
      const warp = 1 - lowSan * 0.55;
      SNAP.value.set(this.baseSnap.x * warp, this.baseSnap.y * warp);
      this.postMat.uniforms.uGlitch.value = lowSan > 0 ? lowSan * (0.5 + 0.5 * Math.sin(t * 9)) : 0;
    }

    this.fogColor.setHex(witching ? 0x1c0408 : 0x0a0610);
    this.postMat.uniforms.uRedShift.value = dangerRed * 0.45;
    this.postMat.uniforms.uIce.value = countess && countess.state === AI_STATE.FROZEN && !inMenu ? 1 : 0;
    this.postMat.uniforms.uHurt.value = hurt;
    this.postMat.uniforms.uDark.value = darkCurse > 0 ? Math.min(1, 0.55 + 0.25 * Math.sin(t * 2.2)) : 0;
    this.postMat.uniforms.uTime.value = t;

    this.renderer.info.reset();
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCam);
  }



  _buildBreakables(level, woodMat, ironMat) {
    const list = level.breakables || [];
    const crates = list.filter((b) => b.type === "crate");
    const barrels = list.filter((b) => b.type === "barrel");
    const plank = this._mat("crate-plank", { map: this.T.wood, emissive: 0x120a04 });
    this.crateBig = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 1.0, 1.2), plank, Math.max(1, crates.length));
    this.crateTop = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 0.7, 0.8), plank, Math.max(1, crates.length));
    this.crateBand = new THREE.InstancedMesh(new THREE.BoxGeometry(1.26, 0.1, 1.26), ironMat, Math.max(1, crates.length));
    this.barrelBody = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.48, 0.48, 1.1, 8), woodMat, Math.max(1, barrels.length));
    this.barrelBand = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 8), ironMat, Math.max(1, barrels.length * 2));
    for (const im of [this.crateBig, this.crateTop, this.crateBand, this.barrelBody, this.barrelBand]) {
      im.castShadow = true;
      im.receiveShadow = true;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(im);
    }
    const rnd = seeded(77);
    this.brkMeta = list.map((b) => ({ rot: rnd() * Math.PI, top: rnd() * Math.PI, idx: (b.type === "crate" ? crates : barrels).indexOf(b) }));
    this._brkObj = new THREE.Object3D();
    this._syncBreakables(level, 0);
  }

  _syncBreakables(level, dt) {
    if (!this.crateBig || !level || !level.breakables) return;
    const o = this._brkObj;
    const put = (im, i, x, y, z, ry, sc, tilt = 0) => {
      o.position.set(x, y, z);
      o.rotation.set(tilt, ry, tilt * 0.6);
      o.scale.setScalar(sc);
      o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
    };
    level.breakables.forEach((b, k) => {
      const meta = this.brkMeta[k];
      if (!meta) return;
      if (b.hitT > 0) b.hitT = Math.max(0, b.hitT - dt);
      const c = tileCenter(b.tx, b.ty);
      const sc = b.broken ? 0.0001 : 1;
      const wob = b.hitT > 0 ? Math.sin(b.hitT * 60) * 0.12 * (b.hitT / 0.3) : 0;
      const dmgTilt = b.broken ? 0 : (1 - b.hp / b.maxHp) * 0.12;
      const i = meta.idx;
      if (b.type === "crate") {
        put(this.crateBig, i, c.x, 0.5 * sc, c.z, meta.rot + wob, sc, dmgTilt);
        put(this.crateTop, i, c.x + 0.3 * sc, 1.35 * sc, c.z - 0.1 * sc, meta.top - wob, sc, -dmgTilt * 2);
        put(this.crateBand, i, c.x, 0.5 * sc, c.z, meta.rot + wob, sc, dmgTilt);
      } else {
        put(this.barrelBody, i, c.x, 0.55 * sc, c.z, meta.rot + wob, sc, dmgTilt + wob * 0.5);
        put(this.barrelBand, i * 2, c.x, 0.25 * sc, c.z, meta.rot + wob, sc, dmgTilt + wob * 0.5);
        put(this.barrelBand, i * 2 + 1, c.x, 0.85 * sc, c.z, meta.rot + wob, sc, dmgTilt + wob * 0.5);
      }
    });
    for (const im of [this.crateBig, this.crateTop, this.crateBand, this.barrelBody, this.barrelBand]) im.instanceMatrix.needsUpdate = true;
  }

  _buildChambers(level, wallSide, wallTop, woodMat, ironMat, goldMat, stoneMat) {
    this.doorRigs = [];
    this.candleRigs = [];
    this.plateRigs = [];
    this.crushSlabs = null;
    for (const lr of (level.lockedRooms || [])) {
      // Ornate locked door (its own block so it can sink away)
      const [dx, dy] = lr.door;
      const c = tileCenter(dx, dy);
      const group = new THREE.Group();
      const block = new THREE.Mesh(new THREE.BoxGeometry(TILE, WALL_H, TILE), [wallSide, wallSide, wallTop, wallTop, wallSide, wallSide]);
      block.position.set(c.x, WALL_H / 2, c.z);
      group.add(block);
      const nz = c.z - TILE / 2 - 0.02; // north face, toward the Outer Ward
      const plank = this._mat("door-wood", { map: this.T.wood, color: 0x8a5a3a, emissive: 0x140804 });
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.5, 0.12), plank);
      door.position.set(c.x, 1.25, nz);
      group.add(door);
      for (const y of [0.5, 1.25, 2.0]) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.1, 0.06), ironMat);
        band.position.set(c.x, y, nz - 0.07);
        group.add(band);
      }
      const arch = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.24, 0.2), goldMat);
      arch.position.set(c.x, 2.62, nz - 0.04);
      group.add(arch);
      const tint = lr.keyNo === 2 ? 0xff3050 : 0xffd86a;
      const plateTex = glyphTexture(lr.numeral, lr.keyNo === 2 ? "#ff6981" : "#ffd86a", "#1a0e08");
      const numPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: plateTex, transparent: true }));
      numPlate.position.set(c.x, 2.15, nz - 0.1);
      numPlate.rotation.y = Math.PI;
      group.add(numPlate);
      const lock = new THREE.Group();
      const lockMat = this._mat(`padlock-${lr.keyNo}`, { color: 0xc9a24d, emissive: 0x4a3008 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.32, 0.14), lockMat);
      const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 4, 8, Math.PI), ironMat);
      shackle.position.y = 0.16;
      lock.add(body, shackle);
      lock.position.set(c.x, 1.15, nz - 0.2);
      group.add(lock);
      const glow = new THREE.Sprite(this.glowMat(tint, 0.55));
      glow.position.set(c.x, 1.3, nz - 0.5);
      glow.scale.set(1.8, 2.2, 1);
      group.add(glow);
      this.scene.add(group);
      this.doorRigs.push({ key: lr.key, group, lock, glow, open: 0 });

      if (lr.key === "candles") {
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x8b0018, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
        const rc = tileCenter(13, 51);
        for (const [r0, r1] of [[4.6, 4.8], [1.5, 1.62]]) {
          const ring = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 28), ringMat);
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(rc.x, 0.02, rc.z);
          this.scene.add(ring);
        }
        const wax = this._mat("puz-wax", { color: 0xf0e4c8, emissive: 0x3a2a10 });
        for (const it of lr.items) {
          const g = new THREE.Group();
          const ic = tileCenter(it.tx, it.ty);
          g.position.set(ic.x, 0, ic.z);
          const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 0.9, 6), ironMat);
          stand.position.y = 0.45;
          const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.2, 0.08, 8), goldMat);
          dish.position.y = 0.92;
          const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.55, 8), wax);
          candle.position.y = 1.23;
          const glyph = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), new THREE.MeshBasicMaterial({ map: glyphTexture(it.sym), transparent: true }));
          glyph.rotation.x = -Math.PI / 2;
          glyph.position.set(0, 0.03, 0.95);
          const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.T.flame, color: 0xffd08a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
          flame.position.y = 1.66;
          flame.scale.set(0.42, 0.62, 1);
          const halo = new THREE.Sprite(this.glowMat(0xff9a40, 0.7));
          halo.position.y = 1.6;
          halo.scale.set(1.8, 1.8, 1);
          g.add(stand, dish, candle, glyph, flame, halo);
          this.scene.add(g);
          this.candleRigs.push({ idx: it.i, flame, halo });
        }
        // No extra real lights (they'd cost every material); a big additive glow instead.
        this.candleGlow = new THREE.Sprite(this.glowMat(0xff8a30, 0));
        this.candleGlow.position.set(rc.x, 1.2, rc.z);
        this.candleGlow.scale.set(12, 12, 1);
        this.scene.add(this.candleGlow);
      } else if (lr.key === "crush") {
        // Two spiked stone slabs that slide in from the east and west.
        const r = lr.room;
        const depth = (r.y1 - r.y0 + 1) * TILE;
        const width = 4 * TILE;
        const spikeMat = this._mat("crush-spike", { color: 0x8a8690, emissive: 0x1a0a0a });
        const mk = (side) => {
          const g = new THREE.Group();
          const slab = new THREE.Mesh(new THREE.BoxGeometry(width, WALL_H, depth), [wallSide, wallSide, wallTop, wallTop, wallSide, wallSide]);
          slab.position.set(-side * width / 2, WALL_H / 2, 0);
          slab.castShadow = true;
          g.add(slab);
          const stain = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, depth * 0.9), this._mat("crush-stain", { color: 0x4a0010 }));
          stain.position.set(side * 0.02, 0.6, 0);
          g.add(stain);
          const geos = [];
          const m4 = new THREE.Matrix4();
          for (let row = 0; row < 3; row++) {
            for (let k = 0; k < 7; k++) {
              const geo = new THREE.ConeGeometry(0.13, 0.55, 4);
              m4.makeRotationZ(side * -Math.PI / 2).setPosition(side * 0.26, 0.6 + row * 0.85, -depth / 2 + 1.3 + k * (depth - 2.6) / 6);
              geo.applyMatrix4(m4);
              geos.push(geo);
            }
          }
          g.add(new THREE.Mesh(mergeGeometries(geos), spikeMat));
          this.scene.add(g);
          return g;
        };
        const zc = (r.y0 + (r.y1 - r.y0 + 1) / 2) * TILE;
        const left = mk(1), right = mk(-1);
        this.crushSlabs = { left, right, x0: r.x0 * TILE, x1: (r.x1 + 1) * TILE, zc };
        left.position.set(this.crushSlabs.x0, 0, zc);
        right.position.set(this.crushSlabs.x1, 0, zc);
        for (const it of lr.items) {
          const g = new THREE.Group();
          const ic = tileCenter(it.tx, it.ty);
          g.position.set(ic.x, 0, ic.z);
          const ped = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 1.1), stoneMat);
          ped.position.y = 0.25;
          const top = new THREE.Group();
          const face = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), new THREE.MeshBasicMaterial({ map: glyphTexture(it.sym, "#7ec8e8", "#1a1418"), transparent: true }));
          face.rotation.x = -Math.PI / 2;
          face.position.y = 0.52;
          top.add(face);
          const halo = new THREE.Sprite(this.glowMat(0x7ec8e8, 0.0));
          halo.position.y = 0.9;
          halo.scale.set(1.6, 1.6, 1);
          g.add(ped, top, halo);
          this.scene.add(g);
          this.plateRigs.push({ idx: it.i, top, halo });
        }
        this.crushGlow = new THREE.Sprite(this.glowMat(0xff2040, 0));
        this.crushGlow.position.set((r.x0 + r.x1 + 1) / 2 * TILE, 2.0, zc);
        this.crushGlow.scale.set(10, 10, 1);
        this.scene.add(this.crushGlow);
      }
    }
  }

  _updateChambers(level, dt, t) {
    if (!level || !level.lockedRooms || !this.doorRigs) return;
    for (const lr of level.lockedRooms) {
      const rig = this.doorRigs.find((r) => r.key === lr.key);
      if (rig) {
        const target = lr.doorOpen ? 1 : 0;
        rig.open += (target - rig.open) * Math.min(1, dt * 2.4);
        rig.group.position.y = -WALL_H * rig.open;
        rig.group.visible = rig.open < 0.985;
        rig.lock.visible = !lr.unlocked;
        rig.glow.material.opacity = lr.unlocked ? 0.15 : 0.4 + 0.2 * Math.sin(t * 3 + lr.keyNo);
      }
      if (lr.key === "candles") {
        let lit = 0;
        for (const c of this.candleRigs) {
          const it = lr.items[c.idx];
          const on = !!(it && it.lit);
          c.flame.visible = on;
          c.halo.visible = on;
          if (on) {
            lit++;
            c.flame.scale.set(0.5 + Math.sin(t * 19 + c.idx) * 0.06, 0.75 + Math.sin(t * 23 + c.idx) * 0.1, 1);
            c.halo.material.opacity = 0.6 + Math.sin(t * 11 + c.idx) * 0.12;
          }
        }
        if (this.candleGlow) this.candleGlow.material.opacity = lit * 0.035;
      } else if (lr.key === "crush" && this.crushSlabs) {
        const inset = lr.wallInset * S;
        const jitter = lr.active ? Math.sin(t * 40) * 0.015 : 0;
        this.crushSlabs.left.position.x = this.crushSlabs.x0 + inset + jitter;
        this.crushSlabs.right.position.x = this.crushSlabs.x1 - inset - jitter;
        for (const p of this.plateRigs) {
          const it = lr.items[p.idx];
          const down = !!(it && it.pressed);
          p.top.position.y = down ? -0.18 : 0;
          p.halo.material.opacity = down ? 0.8 : 0.18 + 0.1 * Math.sin(t * 3 + p.idx);
        }
        if (this.crushGlow) this.crushGlow.material.opacity = lr.active ? 0.12 + Math.sin(t * 6) * 0.05 : 0;
      }
    }
  }

  _updateSecrets(level, dt) {
    if (!this.secretRigs || !level || !level.secrets) return;
    for (const d of level.secrets) {
      const rig = this.secretRigs.find((r) => r.key === d.key);
      if (!rig) continue;
      const target = d.opened ? 1 : 0;
      rig.open += (target - rig.open) * Math.min(1, dt * 1.6);
      if (d.opened && rig.open < 0.98) rig.open = Math.min(1, rig.open + dt * 0.85);
      rig.wall.position.y = -WALL_H * rig.open;
      rig.wall.visible = rig.open < 0.98;
      if (rig.item) rig.item.rotation.y = d.opened ? 0.4 : Math.sin(this.time * 0.6) * 0.04;
    }
  }

  _updateWell(level, t, fx) {
    if (!this.wellMist || !level || !level.well) return;
    const pulse = 0.3 + 0.15 * Math.sin(t * 2.2);
    this.wellMist.material.opacity = pulse;
    this.wellMist.scale.set(2.0 + Math.sin(t * 1.6) * 0.2, 1.3 + Math.sin(t * 2.1) * 0.15, 1);
  }

  _speedTrail(player, dt, t) {
    if (!this._trailAcc) this._trailAcc = 0;
    this._trailAcc += dt;
    if (this._trailAcc < 0.05) return;
    this._trailAcc = 0;
    const x = player.x * S, z = player.y * S;
    this._emit(x, 0.7, z, 3, 0xffe08a, 0.5, 0.8, 0.4, 0.25);
  }

  _makeDropRig(d) {
    const g = new THREE.Group();
    const spin = new THREE.Group();
    let haloColor = 0xe7c873;
    if (d.kind === "sanity") {
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.32, 8), this._mat("vial-glass", { color: 0x8fd4f0, emissive: 0x143050, transparent: true, opacity: 0.72 }));
      glass.position.y = 0.22;
      const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.18, 8), this._mat("vial-liq", { color: 0x5ca4d6, emissive: 0x1a4a80 }));
      liquid.position.y = 0.16;
      const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 6), this._mat("vial-cork", { color: 0x6a3b1f }));
      cork.position.y = 0.40;
      spin.add(glass, liquid, cork);
      haloColor = 0x7ec8e8;
    } else if (d.kind === "coins") {
      const bag = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), this._mat("pouch", { color: 0x6a4420, emissive: 0x1a1004 }));
      bag.scale.set(1.15, 0.95, 1.15);
      bag.position.y = 0.22;
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.12, 6), this._mat("pouch-neck", { color: 0x3a2410 }));
      neck.position.y = 0.42;
      const tie = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.04), this._mat("pouch-tie", { color: 0xc9a24d, emissive: 0x3a2a08 }));
      tie.position.y = 0.38;
      const gold = this._mat("coin-gold", { color: 0xffe08a, emissive: 0x6a5010 });
      for (let i = 0; i < 3; i++) {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.035, 8), gold);
        c.rotation.x = Math.PI / 2 + (i - 1) * 0.25;
        c.rotation.z = i * 0.7;
        c.position.set((i - 1) * 0.09, 0.36 + i * 0.04, 0.14);
        spin.add(c);
      }
      spin.add(bag, neck, tie);
      haloColor = 0xffe08a;
    } else if (d.kind === "key") {
      const iron = this._mat("key-iron", { color: 0x8a8070, emissive: 0x3a2a08 });
      const gold = this._mat("key-gold", { color: 0xffd86a, emissive: 0x6a4a08 });
      const bow = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 4, 8), gold);
      bow.position.y = 0.62;
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 0.07), iron);
      shaft.position.y = 0.2;
      const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.07, 0.06), iron);
      t1.position.set(0.1, -0.04, 0);
      const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.06, 0.06), iron);
      t2.position.set(0.08, 0.08, 0);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), this._mat(`key-gem-${d.keyNo}`, { color: d.keyNo === 2 ? 0xff3050 : 0x7ec8e8, emissive: d.keyNo === 2 ? 0x600010 : 0x103050 }));
      gem.position.y = 0.62;
      spin.add(bow, shaft, t1, t2, gem);
      spin.scale.setScalar(1.4);
      haloColor = 0xffd86a;
    } else if (d.kind === "armor") {
      const steel = this._mat("armor-steel", { color: 0xb8c4d0, emissive: 0x1a2430 });
      const trim = this._mat("armor-trim", { color: 0xc9a24d, emissive: 0x2a1804 });
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.46, 0.14), steel);
      plate.position.y = 0.3;
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.46, 0.06), trim);
      ridge.position.set(0, 0.3, 0.08);
      const sh1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.2), steel);
      sh1.position.set(-0.24, 0.5, 0);
      const sh2 = sh1.clone();
      sh2.position.x = 0.24;
      spin.add(plate, ridge, sh1, sh2);
      haloColor = 0x9fc4e8;
    } else if (d.kind === "haste") {
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.34, 8), this._mat("haste-glass", { color: 0xe8ffb0, emissive: 0x3a5010, transparent: true, opacity: 0.8 }));
      glass.position.y = 0.24;
      const wingMat = this._mat("haste-wing", { color: 0xffe08a, emissive: 0x5a4008, side: THREE.DoubleSide });
      for (const s of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.16), wingMat);
        wing.position.set(0.2 * s, 0.34, 0);
        wing.rotation.z = 0.5 * s;
        spin.add(wing);
      }
      spin.add(glass);
      haloColor = 0xd8ff8a;
    } else if (d.kind === "token") {
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 10), this._mat("token-coin", { color: 0x9a6ad8, emissive: 0x30104a }));
      coin.rotation.x = Math.PI / 2;
      coin.position.y = 0.32;
      const bladeMat = this._mat("token-blade", { color: 0xeef2f8, emissive: 0x404858 });
      for (const r of [-0.7, 0.7]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.04), bladeMat);
        b.position.set(0, 0.32, 0.05);
        b.rotation.z = r;
        spin.add(b);
      }
      spin.add(coin);
      haloColor = 0xb27bff;
    } else {
      const tier = MIRROR_TIERS[d.tier] || MIRROR_TIERS.cracked;
      const frameMat = this._mat(`mframe-${d.tier || "cracked"}`, { color: tier.color, emissive: d.tier === "obsidian" ? 0x3a1060 : 0x1a1408, side: THREE.DoubleSide });
      const frame = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 4, 10), frameMat);
      frame.scale.set(1, 1.3, 1);
      const pane = new THREE.Mesh(new THREE.CircleGeometry(0.2, 10), d.tier === "obsidian" ? new THREE.MeshBasicMaterial({ color: 0x1a0a2a, side: THREE.DoubleSide }) : this._mat("pane", { color: 0xcfe0f0, emissive: 0x223344, side: THREE.DoubleSide }));
      pane.scale.set(1, 1.3, 1);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.06), frameMat);
      handle.position.y = -0.40;
      spin.add(frame, pane, handle);
      haloColor = tier.color;
    }
    const halo = new THREE.Sprite(this.glowMat(haloColor, 0.7));
    halo.position.y = 0.32;
    halo.scale.set(1.85, 1.85, 1);
    spin.scale.setScalar(1.15);
    g.add(spin, halo);
    return { root: g, spin, halo };
  }

  _syncDrops(list, t) {
    const seen = new Set();
    for (const d of list) {
      if (d.collected || d.remove) continue;
      seen.add(d.id);
      let rig = this.dropRigs.get(d.id);
      if (!rig) {
        rig = this._makeDropRig(d);
        this.dropRigs.set(d.id, rig);
        this.scene.add(rig.root);
      }
      const blinkOff = d.life < 4 && Math.sin(d.life * 18) > 0.2;
      rig.root.visible = !blinkOff;
      rig.root.position.set(d.x * S, d.h, d.y * S);
      rig.spin.rotation.y = t * 2.2 + d.id;
      if (rig.halo) rig.halo.material.opacity = 0.45 + 0.3 * Math.sin(t * 6 + d.id);
    }
    for (const [id, rig] of this.dropRigs) {
      if (!seen.has(id)) {
        this.scene.remove(rig.root);
        this.dropRigs.delete(id);
      }
    }
  }

  stats() {
    return { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, internal: [this.lw, this.lh], monsters: this.monsterRigs.size };
  }
}
