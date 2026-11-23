import * as THREE from "./vendor/three.module.min.js";
import { TILE_SIZE } from "./map.js";
import { AI_STATE } from "./enemy.js";
import { makeTextures, seeded } from "./textures.js";
import { buildInvestigator, buildCountess } from "./characters.js";

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

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 90);

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
        uRedShift: { value: 0 }
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uGlitch; uniform float uTime; uniform float uRedShift;
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
          if (uGlitch > 0.0) {
            c.r = mix(c.r, texture2D(tDiffuse, uv + vec2(uGlitch * 0.006, 0.0)).r, 0.8);
          }
          c = pow(max(c, 0.0), vec3(1.0 / 2.2));
          c.r += uRedShift * 0.06;
          // 15-bit colour with ordered dither, like the PS1 GPU
          float b = bayer4(gl_FragCoord.xy) - 0.5;
          c = floor(c * 31.0 + b + 0.5) / 31.0;
          // gentle vignette
          vec2 q = vUv - 0.5;
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
    this.snapCam = true;
    this.prevPlayer = new THREE.Vector2();
    this.prevCountess = new THREE.Vector2();
    this.playerWalk = 0;
    this.countessWalk = 0;
    this.playerYaw = Math.PI;
    this.countessYaw = 0;

    this.resize();
  }

  resize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    // PS1-ish internal resolution: short side ~240px, upscaled with nearest-neighbour by CSS.
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
    this.snapCam = true;
  }

  _mat(key, opts, cut = false) {
    this._mats = this._mats || new Map();
    if (this._mats.has(key)) return this._mats.get(key);
    const m = psx(new THREE.MeshLambertMaterial(opts), { cutaway: cut });
    this._mats.set(key, m);
    return m;
  }

  _build(level) {
    const T = this.T;
    const scene = this.scene;
    const rnd = seeded(1610);

    // ---------- Lights ----------
    this.hemi = new THREE.HemisphereLight(0x5a4070, 0x1a0c14, 1.6);
    scene.add(this.hemi);
    const moon = new THREE.DirectionalLight(0x6c7fb0, 0.55);
    moon.position.set(-10, 20, 6);
    scene.add(moon);

    // ---------- Floor ----------
    const fw = level.cols * TILE;
    const fh = level.rows * TILE;
    const floorTex = T.floor.clone();
    floorTex.needsUpdate = true;
    floorTex.repeat.set(level.cols, level.rows);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), this._mat("floor", { map: floorTex }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(fw / 2, 0, fh / 2);
    floor.receiveShadow = true;
    scene.add(floor);

    // ---------- Walls (one instanced mesh) ----------
    const wallTiles = [];
    const isFloor = (tx, ty) => ty >= 0 && ty < level.rows && tx >= 0 && tx < level.cols && level.grid[ty][tx] === 0;
    for (let ty = 0; ty < level.rows; ty++) {
      for (let tx = 0; tx < level.cols; tx++) {
        if (level.grid[ty][tx] !== 1) continue;
        // skip walls not touching any floor (never visible)
        let touches = false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isFloor(tx + dx, ty + dy)) touches = true;
        if (touches) wallTiles.push([tx, ty]);
      }
    }
    const wallSide = this._mat("wallSide", { map: T.stone }, true);
    const wallTop = this._mat("wallTop", { map: T.stoneTop }, true);
    const wallGeo = new THREE.BoxGeometry(TILE, WALL_H, TILE);
    const walls = new THREE.InstancedMesh(wallGeo, [wallSide, wallSide, wallTop, wallTop, wallSide, wallSide], wallTiles.length);
    const m4 = new THREE.Matrix4();
    wallTiles.forEach(([tx, ty], i) => {
      const c = tileCenter(tx, ty);
      m4.makeTranslation(c.x, WALL_H / 2, c.z);
      walls.setMatrixAt(i, m4);
    });
    walls.castShadow = true;
    walls.receiveShadow = true;
    scene.add(walls);

    // Gold-trimmed skirting on visible south faces + tapestries + wall sconces
    const special = new Set();
    const mark = (o) => special.add(`${o.tx},${o.ty}`);
    level.alcoves.forEach(mark);
    level.braziers.forEach(mark);
    level.glass.forEach(mark);
    level.pages.forEach((p) => special.add(`${Math.floor(p.x / TILE_SIZE)},${Math.floor(p.y / TILE_SIZE)}`));

    const tapestryPos = [];
    const sconcePos = [];
    const trimPos = [];
    for (const [tx, ty] of wallTiles) {
      if (!isFloor(tx, ty + 1)) continue;
      trimPos.push([tx, ty]);
      const h = rnd();
      if (h < 0.2) tapestryPos.push([tx, ty]);
      else if (h < 0.36) sconcePos.push([tx, ty]);
    }

    const trim = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE, 0.12, 0.08), this._mat("trim", { color: 0xb08a3c, emissive: 0x1a1004 }), trimPos.length * 2);
    trimPos.forEach(([tx, ty], i) => {
      const c = tileCenter(tx, ty);
      m4.makeTranslation(c.x, 0.2, (ty + 1) * TILE + 0.04);
      trim.setMatrixAt(i * 2, m4);
      m4.makeTranslation(c.x, WALL_H - 0.25, (ty + 1) * TILE + 0.04);
      trim.setMatrixAt(i * 2 + 1, m4);
    });
    scene.add(trim);

    const tapMat = this._mat("tap", { map: T.tapestry, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
    const taps = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.15, 2.1), tapMat, Math.max(1, tapestryPos.length));
    tapestryPos.forEach(([tx, ty], i) => {
      const c = tileCenter(tx, ty);
      m4.makeTranslation(c.x, 1.55, (ty + 1) * TILE + 0.03);
      taps.setMatrixAt(i, m4);
    });
    taps.count = tapestryPos.length;
    scene.add(taps);

    // Flame points (candles, sconces, braziers)
    const smallFlames = [];
    const bigFlames = [];
    const bracket = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.4, 0.3), this._mat("ironDark", { map: T.iron }), Math.max(1, sconcePos.length));
    sconcePos.forEach(([tx, ty], i) => {
      const c = tileCenter(tx, ty);
      m4.makeTranslation(c.x, 1.85, (ty + 1) * TILE + 0.15);
      bracket.setMatrixAt(i, m4);
      bigFlames.push(c.x, 2.22, (ty + 1) * TILE + 0.22);
    });
    bracket.count = sconcePos.length;
    scene.add(bracket);

    // Candle clusters along north walls of rooms
    const candlePos = [];
    for (let ty = 1; ty < level.rows - 1; ty++) {
      for (let tx = 1; tx < level.cols - 1; tx++) {
        if (!isFloor(tx, ty) || special.has(`${tx},${ty}`)) continue;
        if (level.grid[ty - 1][tx] !== 1) continue;
        if (rnd() < 0.3) {
          const c = tileCenter(tx, ty);
          const n = 2 + Math.floor(rnd() * 3);
          for (let k = 0; k < n; k++) {
            const x = c.x + (rnd() - 0.5) * 1.4;
            const z = ty * TILE + 0.25 + rnd() * 0.35;
            const hgt = 0.18 + rnd() * 0.3;
            candlePos.push([x, z, hgt]);
            smallFlames.push(x, hgt + 0.08, z);
          }
        }
      }
    }
    const candles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.055, 0.065, 1, 6), this._mat("wax", { color: 0xe8dcc0, emissive: 0x3a2a10 }), Math.max(1, candlePos.length));
    candlePos.forEach(([x, z, hgt], i) => {
      m4.makeScale(1, hgt, 1);
      m4.setPosition(x, hgt / 2, z);
      candles.setMatrixAt(i, m4);
    });
    candles.count = candlePos.length;
    scene.add(candles);

    // Rugs
    const rugMat = this._mat("rug", { map: T.rug });
    const rugs = [
      [12.5, 7.5, 7, 3],
      [12.5, 18.5, 14, 1.2],
      [12.5, 3.2, 5, 1.6]
    ];
    for (const [cx, cy, w, h] of rugs) {
      const r = new THREE.Mesh(new THREE.PlaneGeometry(w * TILE * 0.5, h * TILE * 0.5), rugMat);
      r.rotation.x = -Math.PI / 2;
      r.position.set(cx * TILE, 0.015, cy * TILE);
      r.receiveShadow = true;
      scene.add(r);
    }

    // ---------- Iron alcoves ----------
    const ironMat = this._mat("iron", { map: T.iron });
    const goldMat = this._mat("goldTrim", { color: 0xc9a24d, emissive: 0x2a1804 });
    const innerMat = this._mat("inner", { color: 0x120a0e });
    const spikeMat = this._mat("spike", { color: 0x8a8690 });
    this.alcoveMeshes = [];
    for (const a of level.alcoves) {
      const g = new THREE.Group();
      const c = tileCenter(a.tx, a.ty);
      g.position.copy(c);
      // open toward the south (camera) unless blocked
      if (!isFloor(a.tx, a.ty + 1)) g.rotation.y = Math.PI;
      const part = (geo, mat, x, y, z) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        m.castShadow = true;
        m.receiveShadow = true;
        g.add(m);
        return m;
      };
      part(new THREE.BoxGeometry(1.4, 2.5, 0.14), ironMat, 0, 1.25, -0.62);
      part(new THREE.BoxGeometry(1.24, 2.38, 0.04), innerMat, 0, 1.22, -0.53);
      part(new THREE.BoxGeometry(0.14, 2.5, 1.2), ironMat, -0.68, 1.25, -0.06);
      part(new THREE.BoxGeometry(0.14, 2.5, 1.2), ironMat, 0.68, 1.25, -0.06);
      part(new THREE.BoxGeometry(1.5, 0.18, 1.3), ironMat, 0, 2.58, -0.06);
      part(new THREE.ConeGeometry(0.55, 0.7, 4), ironMat, 0, 3.02, -0.06).rotation.y = Math.PI / 4;
      part(new THREE.BoxGeometry(0.07, 2.5, 0.07), goldMat, -0.72, 1.25, 0.55);
      part(new THREE.BoxGeometry(0.07, 2.5, 0.07), goldMat, 0.72, 1.25, 0.55);
      part(new THREE.BoxGeometry(1.5, 0.07, 0.07), goldMat, 0, 2.5, 0.55);
      part(new THREE.ConeGeometry(0.06, 0.4, 4), goldMat, 0, 3.45, -0.06);
      for (let k = 0; k < 6; k++) {
        const sp = part(new THREE.ConeGeometry(0.05, 0.22, 4), spikeMat, -0.42 + (k % 3) * 0.42, 0.9 + Math.floor(k / 3) * 0.8, -0.48);
        sp.rotation.x = Math.PI / 2;
      }
      scene.add(g);
      this.alcoveMeshes.push(g);
    }

    // ---------- Braziers ----------
    const pedMat = this._mat("ped", { map: T.stone });
    const coalMat = new THREE.MeshBasicMaterial({ color: 0xff7a22 });
    psx(coalMat);
    this.brazierLights = [];
    for (const b of level.braziers) {
      const c = tileCenter(b.tx, b.ty);
      const g = new THREE.Group();
      g.position.copy(c);
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.38, 0.75, 6), pedMat);
      ped.position.y = 0.375;
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.24, 0.34, 8), ironMat);
      bowl.position.y = 0.92;
      const coals = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.06, 8), coalMat);
      coals.position.y = 1.07;
      for (const m of [ped, bowl]) { m.castShadow = true; m.receiveShadow = true; }
      g.add(ped, bowl, coals);
      for (let k = 0; k < 4; k++) {
        const legGeo = new THREE.BoxGeometry(0.06, 0.4, 0.06);
        const leg = new THREE.Mesh(legGeo, goldMat);
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        leg.position.set(Math.cos(a) * 0.42, 0.95, Math.sin(a) * 0.42);
        g.add(leg);
      }
      scene.add(g);
      bigFlames.push(c.x, 1.35, c.z, c.x - 0.18, 1.2, c.z + 0.1, c.x + 0.16, 1.22, c.z - 0.08);
      const light = new THREE.PointLight(0xff8a3a, 22, 11, 1.3);
      light.position.set(c.x, 1.8, c.z);
      scene.add(light);
      this.brazierLights.push({ light, base: 22, seed: rnd() * 10 });
    }

    // flames as two Points clouds (one draw call each)
    const mkPoints = (arr, size) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
      const mat = new THREE.PointsMaterial({
        map: this.T.flame,
        size,
        sizeAttenuation: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        color: 0xffffff,
        alphaTest: 0.01
      });
      const pts = new THREE.Points(geo, mat);
      scene.add(pts);
      return pts;
    };
    this.smallFlames = mkPoints(smallFlames.length ? smallFlames : [0, -10, 0], 0.32);
    this.bigFlames = mkPoints(bigFlames.length ? bigFlames : [0, -10, 0], 0.8);

    // Halos around flames
    const glowMat = (color, opacity) => new THREE.SpriteMaterial({ map: T.glow, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < bigFlames.length; i += 3) {
      const s = new THREE.Sprite(glowMat(0xff7a2a, 0.55));
      s.position.set(bigFlames[i], bigFlames[i + 1], bigFlames[i + 2]);
      s.scale.set(1.6, 1.6, 1);
      scene.add(s);
    }

    // ---------- Cracked glass ----------
    const shardPos = [];
    for (const gl of level.glass) {
      const c = tileCenter(gl.tx, gl.ty);
      for (let k = 0; k < 9; k++) shardPos.push([c.x + (rnd() - 0.5) * 1.2, c.z + (rnd() - 0.5) * 1.2, rnd() * Math.PI]);
    }
    const shardMat = this._mat("shard", { color: 0xa8d8ff, emissive: 0x24425a, side: THREE.DoubleSide });
    const shards = new THREE.InstancedMesh(new THREE.CircleGeometry(0.16, 3), shardMat, Math.max(1, shardPos.length));
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    shardPos.forEach(([x, z, r], i) => {
      e.set(-Math.PI / 2, 0, r);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x, 0.03, z), q, new THREE.Vector3(1, 1, 1));
      shards.setMatrixAt(i, m4);
    });
    shards.count = shardPos.length;
    scene.add(shards);

    // ---------- Ledger pages ----------
    const pageMat = this._mat("page", { map: T.parchment, side: THREE.DoubleSide, emissive: 0x3a2a10 });
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xe7c873, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.pageMeshes = level.pages.map((p) => {
      const g = new THREE.Group();
      g.position.set(p.x * S, 0, p.y * S);
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.64), pageMat);
      sheet.position.y = 1.0;
      sheet.castShadow = true;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.45, 3.4, 6, 1, true), beamMat);
      beam.position.y = 1.7;
      const halo = new THREE.Sprite(glowMat(0xe7c873, 0.7));
      halo.position.y = 1.0;
      halo.scale.set(1.3, 1.3, 1);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.48, 8), new THREE.MeshBasicMaterial({ color: 0xc41230, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      g.add(sheet, beam, halo, ring);
      scene.add(g);
      return { g, sheet };
    });

    // ---------- North portcullis + 5 wax seals ----------
    const ex = level.exitTile;
    const gc = tileCenter(ex.tx, ex.ty);
    this.gate = new THREE.Group();
    this.gate.position.copy(gc);
    const frameMat = this._mat("gateFrame", { map: T.stone });
    const archL = new THREE.Mesh(new THREE.BoxGeometry(0.4, WALL_H + 0.6, 0.9), frameMat);
    archL.position.set(-1.05, (WALL_H + 0.6) / 2, 0.6);
    const archR = archL.clone();
    archR.position.x = 1.05;
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.5, 0.9), goldMat);
    lintel.position.set(0, WALL_H + 0.35, 0.6);
    this.gate.add(archL, archR, lintel);
    this.bars = new THREE.Group();
    const barMat = this._mat("bars", { map: T.iron });
    for (let k = 0; k < 6; k++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, WALL_H, 0.1), barMat);
      b.position.set(-0.8 + k * 0.32, WALL_H / 2, 0.9);
      b.castShadow = true;
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
    scene.add(this.gateLight);
    scene.add(this.gate);

    // ---------- Death Echo (fallen lantern) ----------
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

    // ---------- Dust / ash motes ----------
    const dust = [];
    for (let i = 0; i < 220; i++) dust.push(rnd() * fw, rnd() * 3.2, rnd() * fh);
    const dg = new THREE.BufferGeometry();
    dg.setAttribute("position", new THREE.Float32BufferAttribute(dust, 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xd8c8b0, size: 0.06, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(this.dust);
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

  render(state) {
    if (!this.built) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastNow) / 1000);
    this.lastNow = now;
    this.time += dt;
    const t = this.time;
    const { player, countess, mode, flareFlash = 0, deathEcho, witching } = state;
    const level = this.level;

    // Flicker
    for (const b of this.brazierLights) {
      b.light.intensity = b.base * (0.85 + 0.15 * Math.sin(t * 11 + b.seed) + 0.08 * Math.sin(t * 23 + b.seed * 3));
    }
    this.bigFlames.material.size = 0.8 + Math.sin(t * 17) * 0.06;
    this.smallFlames.material.size = 0.32 + Math.sin(t * 21 + 1) * 0.04;

    // Dust drift
    const dp = this.dust.geometry.attributes.position;
    for (let i = 0; i < dp.count; i++) {
      let y = dp.getY(i) + dt * 0.08;
      if (y > 3.4) y = 0;
      dp.setY(i, y);
    }
    dp.needsUpdate = true;

    // Pages
    if (level) {
      this.pageMeshes.forEach((pm, i) => {
        const p = level.pages[i];
        pm.g.visible = !!p && !p.collected;
        pm.sheet.position.y = 1.0 + Math.sin(t * 2.4 + i) * 0.1;
        pm.sheet.rotation.y = t * 1.3 + i;
      });
    }

    // Gate & seals
    const pagesFound = player ? player.pagesFound : 0;
    const open = pagesFound >= 5;
    this.seals.forEach((m, i) => m.color.setHex(i < pagesFound ? 0x3a2a10 : 0xc41230));
    const targetY = open ? WALL_H - 0.4 : 0;
    this.bars.position.y += (targetY - this.bars.position.y) * Math.min(1, dt * 2);
    this.gateLight.color.setHex(open ? 0xe7c873 : 0xc41230);
    this.gateLight.intensity = open ? 26 + Math.sin(t * 4) * 4 : 8;

    // Death echo
    if (deathEcho && mode !== "TITLE") {
      this.echo.visible = true;
      this.echo.position.set(deathEcho.x * S, 0, deathEcho.y * S);
      this.echoHalo.material.opacity = 0.5 + 0.35 * Math.sin(t * 5);
    } else {
      this.echo.visible = false;
    }

    // ---------- Player ----------
    const inv = this.inv;
    let focus;
    if (player && mode !== "TITLE") {
      inv.root.visible = true;
      const px = player.x * S;
      const pz = player.y * S;
      const moved = Math.hypot(px - this.prevPlayer.x, pz - this.prevPlayer.y);
      this.prevPlayer.set(px, pz);
      const speed = dt > 0 ? moved / dt : 0;
      inv.root.position.set(px, 0, pz);
      let yaw = Math.atan2(Math.cos(player.angle), Math.sin(player.angle));
      if (player.hidden) yaw = 0;
      let dy = Math.atan2(Math.sin(yaw - this.playerYaw), Math.cos(yaw - this.playerYaw));
      this.playerYaw += dy * Math.min(1, dt * 12);
      inv.root.rotation.y = this.playerYaw;
      if (speed > 0.3 && speed < 20) this.playerWalk += dt * speed * 3.2;
      this._animateWalk(inv, this.playerWalk, Math.min(1, speed / 2.5));
      inv.arms[0].rotation.x = -Math.sin(this.playerWalk) * 0.6 * Math.min(1, speed / 2.5);
      inv.arms[1].rotation.x = player.hidden ? -0.3 : -1.05;
      inv.root.scale.setScalar(player.hidden ? 0.92 : 1);
      inv.body.position.y += player.hidden ? -0.08 : 0;

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
      this.aura.intensity = (lit ? 9 : 2.2) + flareFlash * 160;
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
      const yaw = Math.atan2(Math.cos(countess.angle), Math.sin(countess.angle));
      const dy = Math.atan2(Math.sin(yaw - this.countessYaw), Math.cos(yaw - this.countessYaw));
      this.countessYaw += dy * Math.min(1, dt * 8);
      cnt.root.rotation.y = this.countessYaw;
      if (speed > 0.2 && speed < 20) this.countessWalk += dt * speed * 2.4;
      const amt = Math.min(1, speed / 2.5);
      this._animateWalk(cnt, this.countessWalk, amt, { countess: true });
      cnt.body.position.y += 0.04 * Math.sin(t * 1.8); // eerie hover/breath
      const hunting = countess.state === AI_STATE.HUNT;
      const stunned = countess.state === AI_STATE.STUNNED;
      const reach = hunting ? -1.25 : -0.15 - Math.sin(this.countessWalk) * 0.35 * amt;
      cnt.arms[0].rotation.x = hunting ? reach : -0.15 + Math.sin(this.countessWalk) * 0.35 * amt;
      cnt.arms[1].rotation.x = reach;
      cnt.arms[0].rotation.z = stunned ? -0.9 : -0.08;
      cnt.arms[1].rotation.z = stunned ? 0.9 : 0.08;
      cnt.body.rotation.x = stunned ? -0.25 : hunting ? 0.12 : 0;
      const eyeCol = stunned ? 0xe7c873 : 0xff2448;
      cnt.eyeMat.color.setHex(eyeCol);
      for (const g of this.eyeGlow) {
        g.material.color.setHex(eyeCol);
        const sc = hunting ? 0.26 + 0.05 * Math.sin(t * 20) : 0.17;
        g.scale.set(sc, sc, 1);
      }
      this.cntLight.intensity = hunting ? 8 + Math.sin(t * 12) * 2 : 4;
    }

    // ---------- Camera ----------
    const dangerRed = countess && countess.state === AI_STATE.HUNT ? 1 : 0;
    if (mode === "TITLE" || !focus) {
      const f = countess ? new THREE.Vector3(countess.x * S, 0, countess.y * S) : new THREE.Vector3(25, 0, 15);
      // Slow cinematic dolly; framed so she sits in the upper half above the title card.
      const a = Math.sin(t * 0.15) * 0.28;
      this.camera.position.set(f.x + Math.sin(a) * 5.4, 2.0, f.z + Math.cos(a) * 5.4);
      this.camera.lookAt(f.x, 0.35, f.z);
      U_PLAYER.value.copy(f);
      U_CAM.value.copy(this.camera.position);
      this.snapCam = true;
    } else {
      const ty = focus.z / TILE;
      // Cinematic, semi-fixed angles per area of the castle (FF7-style), same yaw so controls stay intuitive.
      let off;
      if (player.hidden) off = new THREE.Vector3(2.0, 4.8, 3.8);
      else if (ty < 6) off = new THREE.Vector3(2.2, 8.2, 6.8);
      else if (ty < 12.5) off = new THREE.Vector3(-2.2, 9.0, 6.2);
      else off = new THREE.Vector3(0.0, 7.6, 7.4);
      if (this.camera.aspect < 0.8) off.multiplyScalar(1.12);
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
      const shake = lowSan * 0.06 + flareFlash * 0.05;
      this.camera.position.copy(this.camPos).add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0));
      this.camera.lookAt(this.camLook);
      U_PLAYER.value.copy(focus);
      U_CAM.value.copy(this.camera.position);
      // sanity warps the PS1 wobble
      const warp = 1 - lowSan * 0.55;
      SNAP.value.set(this.baseSnap.x * warp, this.baseSnap.y * warp);
      this.postMat.uniforms.uGlitch.value = lowSan > 0 ? lowSan * (0.5 + 0.5 * Math.sin(t * 9)) : 0;
    }
    if (mode === "TITLE") {
      SNAP.value.copy(this.baseSnap);
      this.postMat.uniforms.uGlitch.value = 0;
    }

    // Fog tint
    const fogTarget = witching ? 0x1c0408 : 0x0a0610;
    this.fogColor.setHex(fogTarget);
    this.postMat.uniforms.uRedShift.value = dangerRed * 0.45;
    this.postMat.uniforms.uTime.value = t;

    this.renderer.info.reset();
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCam);
  }

  stats() {
    return { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, internal: [this.lw, this.lh] };
  }
}
