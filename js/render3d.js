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
  north: [2.2, 8.2, 6.8]
};

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
        uHurt: { value: 0 }
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uGlitch; uniform float uTime; uniform float uRedShift; uniform float uIce; uniform float uHurt;
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
    const wallTiles = [];
    for (let ty = 0; ty < level.rows; ty++) {
      for (let tx = 0; tx < level.cols; tx++) {
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
      if (m.state === "RISE") { scale = Math.max(0.05, 1 - m.timer / 0.9); sink = -(m.timer / 0.9) * 1.2; }
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
      for (const e of rig.eyes) e.material.opacity = m.dead ? opacity * 0.5 : 0.95;

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
    const { player, countess, mode, flareFlash = 0, deathEcho, witching, monsters = [], projectiles = [], fx = [], shake = 0, hurt = 0, weapon } = state;
    const level = this.level;
    if (weapon !== undefined) this.setWeapon(weapon);

    this._consumeFx(fx);
    this._updateFx(dt);

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
      this.spot.intensity = 60 * lowOilFlicker;
      this.spot.position.set(px + dirX * 0.45, 1.25, pz + dirZ * 0.45);
      this.spot.target.position.set(px + dirX * 6, 0, pz + dirZ * 6);
      this.aura.position.set(px + dirX * 0.4, 1.3, pz + dirZ * 0.4);
      const staffGlow = weapon === "staff" && !player.hidden ? 4 : 0;
      this.aura.intensity = (lit ? 9 : 2.2) + staffGlow + flareFlash * 160;
      this.aura.distance = 5 + flareFlash * 10;
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
      const room = roomAt(level, Math.floor(focus.x / TILE), Math.floor(focus.z / TILE));
      if (room) this.lastRoomKey = room.key;
      const o = CAM_OFFSETS[this.lastRoomKey];
      const off = player.hidden ? new THREE.Vector3(2.0, 4.8, 3.8) : new THREE.Vector3(o[0], o[1], o[2]);
      if (this.camera.aspect < 0.8) off.multiplyScalar(1.28);
      this.camOffset.lerp(off, Math.min(1, dt * 2.2));
      const desired = focus.clone().add(this.camOffset);
      const look = focus.clone().add(new THREE.Vector3(0, 1.0, -0.6));
      if (this.snapCam) {
        this.camOffset.copy(off);
        this.camPos.copy(focus).add(off);
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
    this.postMat.uniforms.uTime.value = t;

    this.renderer.info.reset();
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCam);
  }

  stats() {
    return { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, internal: [this.lw, this.lh], monsters: this.monsterRigs.size };
  }
}
