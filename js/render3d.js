import * as THREE from "./vendor/three.module.min.js";
import { TILE_SIZE, roomAt, MIRROR_TIERS } from "./map.js";
import { mergeGeometries } from "./vendor/BufferGeometryUtils.js";
import { AI_STATE } from "./enemy.js";
import { makeTextures, seeded } from "./textures.js";
import { upgradeTextures, upgradeCharacterTextures } from "./textures_hd.js";
import { buildStage3Props, buildStage3Rigs, updateStage3 } from "./render_stage3.js";
import { buildWoodsCourtyardProps, buildWoodsCourtyardPuzzles, updateWoodsCourtyard } from "./render_woods_courtyard.js";
import { QUALITY_PRESETS } from "./quality.js";
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
  box(mat, w, h, d, x, y, z, ry = 0, rx = 0, rz = 0) { this.add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, rx, ry, rz); }
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
  // Stage I (The Woods) & Stage II (The Courtyard)
  timberroad: [0.0, 8.2, 7.2],
  wolfhollow: [-1.8, 8.4, 6.8],
  hut: [1.8, 8.2, 6.8],
  crossroads: [0.0, 8.4, 7.0],
  marsh: [-1.8, 8.4, 6.8],
  hillgate: [0.0, 8.6, 7.2],
  stones: [0.0, 11.4, 7.8],
  snare: [0.0, 11.8, 7.6],
  postern: [0.0, 8.2, 7.2],
  stables: [-1.8, 8.4, 6.8],
  kennels: [1.8, 8.4, 6.8],
  drillyard: [0.0, 8.6, 7.0],
  barracks: [-1.6, 8.4, 6.8],
  gatehouse: [0.0, 8.6, 7.2],
  heraldry: [0.0, 11.4, 7.8],
  winch: [0.0, 11.8, 7.6],
  ward: [0.0, 7.6, 7.4],
  chapel: [-2.2, 8.4, 6.6],
  kitchens: [2.2, 8.4, 6.6],
  hall: [-2.2, 9.0, 6.2],
  torture: [1.8, 8.0, 6.8],
  north: [2.2, 8.2, 6.8],
  candles: [0.0, 12.0, 8.4], // fixed, framed on the chamber centre
  crush: [0.0, 12.0, 7.6],
  // Stage II yards (low fences: a slightly higher, more open view)
  gatehouse: [0.0, 8.4, 7.2],
  mausoleum: [-1.6, 8.6, 6.8],
  cryptyard: [1.6, 8.6, 6.8],
  orchard: [-1.6, 8.6, 6.8],
  bonepit: [1.6, 8.6, 6.8],
  chapelyard: [0.0, 8.2, 7.2],
  crypt: [0.0, 11.0, 7.6],
  flood: [0.0, 11.0, 7.2],
  doorway: [0.0, 7.4, -5.6], // looking south at the sealed chamber doors
  // Stage III floors (indoor rooms: a tighter, steeper view; the tower top opens out)
  cellar: [-1.4, 8.4, 6.6],
  vaults: [1.4, 8.4, 6.6],
  torture3: [1.6, 8.6, 6.6],
  servants: [-1.4, 8.4, 6.8],
  library: [0.0, 8.8, 6.4],
  bedchamber: [-1.6, 8.6, 6.6],
  battlements: [0.0, 9.2, 7.4],
  mirrors: [0.0, 19.0, 8.6], // high, near top-down: every glass and the whole beam path on a phone
  clock: [0.0, 17.5, 8.6]
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
    case "owl":
      g.beginPath(); g.arc(32, 34, 14, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(26, 31, 4, 0, Math.PI * 2); g.arc(38, 31, 4, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(20, 22); g.lineTo(26, 26); g.moveTo(44, 22); g.lineTo(38, 26); g.stroke();
      break;
    case "stag":
      g.beginPath(); g.moveTo(22, 46); g.lineTo(32, 32); g.lineTo(42, 46); g.moveTo(32, 32); g.lineTo(32, 22);
      g.moveTo(32, 24); g.lineTo(18, 14); g.moveTo(24, 19); g.lineTo(24, 11);
      g.moveTo(32, 24); g.lineTo(46, 14); g.moveTo(40, 19); g.lineTo(40, 11); g.stroke();
      break;
    case "wolf":
      g.beginPath(); g.moveTo(16, 42); g.lineTo(22, 16); g.lineTo(30, 26); g.lineTo(34, 26); g.lineTo(42, 16); g.lineTo(48, 42); g.lineTo(32, 50); g.closePath(); g.stroke();
      g.fillRect(25, 32, 4, 4); g.fillRect(35, 32, 4, 4);
      break;
    case "north": case "east": case "south": case "west": {
      const ang = { north: -Math.PI / 2, east: 0, south: Math.PI / 2, west: Math.PI }[sym];
      g.save(); g.translate(32, 32); g.rotate(ang);
      g.beginPath(); g.moveTo(-14, 0); g.lineTo(14, 0); g.lineTo(4, -10); g.moveTo(14, 0); g.lineTo(4, 10); g.stroke();
      g.restore();
      break;
    }
    case "sword":
      g.beginPath(); g.moveTo(32, 10); g.lineTo(32, 46); g.moveTo(20, 38); g.lineTo(44, 38); g.stroke();
      g.beginPath(); g.arc(32, 50, 4, 0, Math.PI * 2); g.fill();
      break;
    case "crown":
      g.beginPath(); g.moveTo(14, 42); g.lineTo(14, 24); g.lineTo(24, 32); g.lineTo(32, 18); g.lineTo(40, 32); g.lineTo(50, 24); g.lineTo(50, 42); g.closePath(); g.stroke();
      break;
    case "brass": case "gold": {
      g.fillStyle = sym === "gold" ? "#f4c84a" : "#c8963e";
      g.beginPath(); g.arc(32, 32, 17, 0, Math.PI * 2); g.fill();
      g.fillStyle = bg; g.beginPath(); g.arc(32, 32, 7, 0, Math.PI * 2); g.fill();
      break;
    }
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
    default:
      // any other label (mirror letters, clock numerals): serif text sized to fit the disc
      g.font = `bold ${sym.length <= 2 ? 30 : sym.length === 3 ? 24 : 19}px serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(sym, 32, 34);
      break;
    case "silver": case "bronze": case "iron": case "bone": {
      const col = { silver: "#e8eef6", bronze: "#d08a48", iron: "#8a8a96", bone: "#efe2bc" }[sym];
      g.fillStyle = col;
      g.beginPath(); g.moveTo(18, 44); g.quadraticCurveTo(20, 14, 32, 13); g.quadraticCurveTo(44, 14, 46, 44); g.closePath(); g.fill();
      g.fillRect(14, 43, 36, 4); g.beginPath(); g.arc(32, 50, 4, 0, Math.PI * 2); g.fill();
      break;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  return t;
}

// Brass name-plaque for the Crypt of Names coffins (Roman-numeral death years).
function plaqueTexture(text) {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 48;
  const g = c.getContext("2d");
  g.fillStyle = "#6a5020"; g.fillRect(0, 0, 128, 48);
  g.fillStyle = "#c9a24d"; g.fillRect(3, 3, 122, 42);
  g.fillStyle = "#2a1a08"; g.font = "bold 26px serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, 64, 26);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  return t;
}

const PARTICLES = 320;
const GORE = 160;
const EMBERS = 200;

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
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 48);

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
        uDark: { value: 0 },
        uMoon: { value: 0 },
        uMoonP: { value: new THREE.Vector3(0.7, 0.75, 1.0) },
        uBloom: { value: 1 },
        uGrain: { value: 0.035 },
        uCA: { value: 0 },
        uGain: { value: new THREE.Vector3(1, 1, 1) },
        uLift: { value: new THREE.Vector3(0, 0, 0) },
        uSat: { value: 1 }
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uGlitch; uniform float uTime; uniform float uRedShift; uniform float uIce; uniform float uHurt; uniform float uDark; uniform float uMoon; uniform vec3 uMoonP;
        uniform float uBloom; uniform float uGrain; uniform float uCA; uniform vec3 uGain; uniform vec3 uLift; uniform float uSat;
        varying vec2 vUv;
        float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        ${BAYER}
        void main(){
          vec2 uv = vUv;
          if (uGlitch > 0.0) {
            float row = floor(uv.y * uRes.y / 3.0);
            float j = step(0.9, fract(sin(row * 12.9898 + floor(uTime * 14.0) * 78.233) * 43758.5453));
            uv.x += j * uGlitch * 0.035;
          }
          vec3 c = texture2D(tDiffuse, uv).rgb;
          if (uCA > 0.0) {
            // subtle lens fringe toward the screen edges
            vec2 dq = (uv - 0.5) * dot(uv - 0.5, uv - 0.5) * 0.012 * uCA;
            c.r = texture2D(tDiffuse, uv + dq).r;
            c.b = texture2D(tDiffuse, uv - dq).b;
          }
          if (uBloom > 0.0) {
            // "bloom-lite": two rings of 8 taps, bright-pass only, so flames, eyes and the lantern bleed light
            vec3 acc = vec3(0.0);
            vec2 px = 1.0 / uRes;
            for (int i = 0; i < 8; i++) {
              float a = float(i) * 0.785398 + 0.39;
              vec2 o = vec2(cos(a), sin(a));
              vec3 s1 = texture2D(tDiffuse, uv + o * px * 2.0).rgb;
              vec3 s2 = texture2D(tDiffuse, uv + o * px * 5.0).rgb;
              acc += max(s1 - 0.42, 0.0) * 0.6 + max(s2 - 0.42, 0.0) * 0.4;
            }
            c += acc * (0.16 * uBloom);
          }
          if (uGlitch > 0.0) c.r = mix(c.r, texture2D(tDiffuse, uv + vec2(uGlitch * 0.006, 0.0)).r, 0.8);
          c = pow(max(c, 0.0), vec3(1.0 / 2.2));
          if (uMoon > 0.0) {
            // A huge pale moon hangs "behind" the scene: it only shows through the darkest pixels (fog, void, shadow).
            vec2 mp = uMoonP.xy;
            vec2 d = (vUv - mp) * vec2(uRes.x / uRes.y, 1.0) / uMoonP.z;
            float r = length(d);
            float l0 = dot(c, vec3(0.3, 0.59, 0.11));
            float behind = 1.0 - smoothstep(0.4, 0.56, l0);
            float disc = 1.0 - smoothstep(0.066, 0.071, r);
            float crater = (0.07 * smoothstep(0.03, 0.0, length(d - vec2(-0.02, 0.015))) + 0.05 * smoothstep(0.018, 0.0, length(d - vec2(0.025, -0.02)))) * disc;
            vec3 moonC = mix(vec3(0.96, 0.94, 0.84), vec3(0.78, 0.78, 0.74), smoothstep(0.0, 0.07, length(d - vec2(-0.02, 0.02)))) - crater;
            float halo = (1.0 - smoothstep(0.06, 0.26, r)) * 0.3;
            c = mix(c, moonC, disc * behind);
            c += vec3(0.42, 0.48, 0.62) * halo * behind * (1.0 - disc);
          }
          c.r += uRedShift * 0.06;
          float lum = dot(c, vec3(0.3, 0.59, 0.11));
          c = mix(c, vec3(lum * 0.85, lum * 0.95, lum * 1.15) + vec3(0.0, 0.02, 0.06), uIce * 0.35);
          vec2 q = vUv - 0.5;
          c = mix(c, vec3(0.6, 0.0, 0.05), uHurt * smoothstep(0.1, 0.5, length(q)));
          if (uDark > 0.0) {
            c *= 1.0 - uDark * 0.62;
            c = mix(c, vec3(0.02, 0.03, 0.06), uDark * 0.45 * smoothstep(0.05, 0.55, length(q)));
          }
          // colour grade (per stage / floor): gain, lift, saturation
          c = c * uGain + uLift;
          float lg = dot(c, vec3(0.3, 0.59, 0.11));
          c = mix(vec3(lg), c, uSat);
          if (uGrain > 0.0) c += (hash12(gl_FragCoord.xy + fract(uTime * 7.13) * 317.0) - 0.5) * uGrain;
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

    this.T = upgradeCharacterTextures(upgradeTextures(makeTextures()));
    this.q = QUALITY_PRESETS.med;
    this.res = this.q.res;
    this.decals = null;
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
    const k = (this.res || 240) / Math.min(w, h);
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

  // Quality presets (low / med / high) from quality.js: resolution, shadows, light count, particles, post.
  applyQuality(preset) {
    if (!preset) return;
    const prev = this.q;
    this.q = preset;
    if (this.res !== preset.res) { this.res = preset.res; this.resize(); }
    const u = this.postMat.uniforms;
    u.uBloom.value = preset.bloom;
    u.uGrain.value = preset.grain;
    u.uCA.value = preset.ca;
    if (this.spot) {
      this.spot.castShadow = !!preset.shadows;
      if (this.spot.shadow.mapSize.x !== preset.shadowMap) {
        this.spot.shadow.mapSize.set(preset.shadowMap, preset.shadowMap);
        if (this.spot.shadow.map) { this.spot.shadow.map.dispose(); this.spot.shadow.map = null; }
      }
    }
    this.renderer.shadowMap.enabled = !!preset.shadows;
    if (this.flameLights) this.flameLights.forEach((f, i) => { f.light.visible = i < preset.lights; });
    if (this.dust) this.dust.geometry.setDrawRange(0, Math.floor(this.dustCount * preset.dust));
    if (this.embers) this.embers.geometry.setDrawRange(0, preset.embers);
    if (prev && prev.shadows !== preset.shadows) this.scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
  }

  setLevel(level) {
    this.level = level;
    const stage = level.stage || 1;
    if (this.built && this.builtStage !== stage) {
      // New stage: throw away the whole scene graph and rebuild it for this map.
      const old = this.scene;
      old.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      this.scene = new THREE.Scene();
      this.scene.background = this.fogColor;
      this.scene.fog = new THREE.Fog(this.fogColor, 10, 30);
      this.monsterRigs.clear();
      this.dropRigs.clear();
      this.weaponId = null;
      this.weaponMesh = null;
      this.built = false;
    }
    if (!this.built) {
      this.stage = stage;
      this.stageKind = level.kind || "castle";
      const open = this.stageKind === "woods" || this.stageKind === "courtyard" || this.stageKind === "graveyards";
      this.scene.fog.near = this.stageKind === "woods" ? 8.5 : open ? 9.5 : 10;
      this.scene.fog.far = this.stageKind === "woods" ? 26 : open ? 29 : 30;
      this._build(level);
      this.built = true;
      this.builtStage = stage;
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
    hand.position.set(0, -0.36, 0.02);
    hand.add(this.weaponMesh);
    (this.inv.elbows ? this.inv.elbows[0] : this.inv.arms[0]).add(hand);
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

  // Stage III: every floor gets its own masonry; the tower top has low crenellated parapets open to the sky.
  _buildStage3Walls(level, wallTiles, isOpen, fallback) {
    const T = this.T;
    const groups = new Map();
    for (const [tx, ty] of wallTiles) {
      let room = null;
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        if (!isOpen(tx + dx, ty + dy)) continue;
        room = roomAt(this.level || level, tx + dx, ty + dy) || room;
        if (room) break;
      }
      const key = room ? (room.key === "battlements" ? "parapet" : room.wall || "stone") : "stone";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push([tx, ty]);
    }
    const m4 = new THREE.Matrix4();
    for (const [key, tiles] of groups) {
      const parapet = key === "parapet";
      const tex = parapet ? (T.towerWall || T.stone) : (T[key] || T.stone);
      const side = this._mat(`s3wall-${key}`, { map: tex }, true);
      const top = this._mat(`s3top-${key}`, { map: T.stoneTop, color: parapet ? 0x9a9ab0 : 0x8a8078 }, true);
      const h = parapet ? 1.25 : WALL_H;
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE, h, TILE), [side, side, top, top, side, side], tiles.length);
      tiles.forEach(([tx, ty], i) => { const c = tileCenter(tx, ty); m4.makeTranslation(c.x, h / 2, c.z); im.setMatrixAt(i, m4); });
      im.castShadow = true; im.receiveShadow = true;
      this.scene.add(im);
      if (parapet) {
        // merlons on every other tile
        const mer = tiles.filter(([tx, ty]) => (tx + ty) % 2 === 0);
        const mm = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE * 0.8, 0.9, TILE * 0.8), [side, side, top, top, side, side], Math.max(1, mer.length));
        mer.forEach(([tx, ty], i) => { const c = tileCenter(tx, ty); m4.makeTranslation(c.x, h + 0.45, c.z); mm.setMatrixAt(i, m4); });
        mm.count = mer.length;
        mm.castShadow = true;
        this.scene.add(mm);
      }
    }
    fallback.geometry.dispose();
  }

  _build(level) {
    const T = this.T;
    this.stairPlacements = [];
    const scene = this.scene;
    const rnd = seeded(1610);
    const B = new Batcher();
    const isFloor = (tx, ty) => ty >= 0 && ty < level.rows && tx >= 0 && tx < level.cols && level.grid[ty][tx] === 0;
    const isOpen = (tx, ty) => ty >= 0 && ty < level.rows && tx >= 0 && tx < level.cols && (level.grid[ty][tx] === 0 || level.grid[ty][tx] === 3);

    // ---------- Lights ----------
    const kind = level.kind || "castle";
    const SW = kind === "woods";
    const SC = kind === "courtyard";
    const S2 = kind === "graveyards";
    const S3 = kind === "climb";
    const OUT = SW || SC || S2;
    this.stageKind = kind;
    this.glyph = glyphTexture;
    this.hemi = SW ? new THREE.HemisphereLight(0x68887a, 0x162018, 2.4)
      : SC ? new THREE.HemisphereLight(0x7c90bc, 0x1a1e28, 2.5)
      : S2 ? new THREE.HemisphereLight(0x8098c8, 0x1c2430, 2.7)
      : new THREE.HemisphereLight(0x5a4070, 0x1a0c14, 1.6);
    scene.add(this.hemi);
    const moon = new THREE.DirectionalLight(OUT ? 0xaec4ee : 0x6c7fb0, SW ? 1.25 : (SC || S2) ? 1.45 : 0.55);
    moon.position.set(-10, 20, 6);
    scene.add(moon);
    this.moon = moon;
    // every flame in the world registers here; the nearest few get real point lights
    this.flameSources = [];
    const addFlameSrc = (x, y, z, base, dist, color = 0xff8a3a) => this.flameSources.push({ p: new THREE.Vector3(x, y, z), base, dist, color });
    this._addFlameSrc = addFlameSrc;

    // ---------- Floors: base flagstone + per-wing surfaces ----------
    const fw = level.cols * TILE;
    const fh = level.rows * TILE;
    // Subdivide base & room planes and separate Y so PS1 vertex snapping never causes Z-fighting.
    const base = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh, 16, 16), S3
      ? this._mat("floor3-void", { color: 0x050407 }) // solid tower masonry between the floors reads as black
      : this._mat(`floor-${kind}`, { map: this._texRepeat(SW ? (T.forestFloor || T.grass) : SC ? (T.cobbleYard || T.cobble) : S2 ? T.dirt : T.floor, level.cols, level.rows) }));
    base.rotation.x = -Math.PI / 2;
    base.position.set(fw / 2, S3 ? -0.08 : -0.02, fh / 2);
    base.receiveShadow = true;
    scene.add(base);
    for (const r of level.rooms) {
      if (r.floor === "floor") continue;
      const w = r.x1 - r.x0 + 1;
      const h = r.y1 - r.y0 + 1;
      const tex = { cobble: T.cobble, kitchen: T.kitchen, blood: T.blood, grass: T.grass, dirt: T.dirt, bone: T.boneFloor, flag: T.flag, forestFloor: T.forestFloor || T.grass, mossTrail: T.mossTrail || T.dirt, bogWater: T.bogWater || T.dirt, woodFloor: T.wood, cobbleYard: T.cobbleYard || T.cobble, stableStraw: T.stableStraw || T.dirt, kennelFlag: T.kennelFlag || T.flag }[r.floor] || T[r.floor] || T.floor;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w * TILE, h * TILE, Math.max(1, Math.ceil(w / 2)), Math.max(1, Math.ceil(h / 2))), this._mat(`floor-${level.stage}-${r.key}`, { map: this._texRepeat(tex, w, h) }));
      p.rotation.x = -Math.PI / 2;
      p.position.set((r.x0 + w / 2) * TILE, 0.005, (r.y0 + h / 2) * TILE);
      p.receiveShadow = true;
      scene.add(p);
    }
    if (S3) {
      for (const [k, x0, y0, w, h, tx] of [["t1", 28, 45, 1, 1, T.tortureFloor], ["t2", 47, 45, 1, 1, T.servantFloor], ["ex", 8, 1, 3, 1, T.slate]]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(w * TILE, h * TILE), this._mat(`floor-3-${k}`, { map: this._texRepeat(tx || T.flag, w, h) }));
        p.rotation.x = -Math.PI / 2;
        p.position.set((x0 + w / 2) * TILE, 0.005, (y0 + h / 2) * TILE);
        p.receiveShadow = true;
        scene.add(p);
      }
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
    const WH = S2 ? 1.1 : SW ? 2.5 : WALL_H; // graveyard: low mossy fence; woods: treeline; courtyard/castle: curtain/keep walls
    this.wallH = WH;
    const wallSide = S2 ? this._mat("wallSide2", { map: T.moss }, true)
      : SW ? this._mat("wallSideW", { map: T.barkWall || T.wood }, true)
      : SC ? this._mat("wallSideC", { map: T.baileyWall || T.stone }, true)
      : this._mat("wallSide", { map: T.stone }, true);
    const wallTop = S2 ? this._mat("wallTop2", { map: T.mossTop }, true)
      : SW ? this._mat("wallTopW", { color: 0x1b2e1e }, true)
      : this._mat("wallTop", { map: T.stoneTop }, true);
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE, WH, TILE), [wallSide, wallSide, wallTop, wallTop, wallSide, wallSide], wallTiles.length);
    const m4 = new THREE.Matrix4();
    wallTiles.forEach(([tx, ty], i) => {
      const c = tileCenter(tx, ty);
      m4.makeTranslation(c.x, WH / 2, c.z);
      walls.setMatrixAt(i, m4);
    });
    walls.castShadow = true;
    walls.receiveShadow = true;
    if (S3) this._buildStage3Walls(level, wallTiles, isOpen, walls);
    else scene.add(walls);
    if (S2) {
      // Iron fence panels along every wall run (two crossed alpha-cut planes per tile, instanced).
      const fenceMat = psx(new THREE.MeshLambertMaterial({ map: T.fence, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }), { cutaway: true });
      const fh = 1.5;
      const fx = new THREE.InstancedMesh(new THREE.PlaneGeometry(TILE, fh), fenceMat, wallTiles.length);
      const fz = new THREE.InstancedMesh(new THREE.PlaneGeometry(TILE, fh), fenceMat, wallTiles.length);
      const ry = new THREE.Matrix4().makeRotationY(Math.PI / 2);
      wallTiles.forEach(([tx, ty], i) => {
        const c = tileCenter(tx, ty);
        m4.makeTranslation(c.x, WH + fh / 2, c.z);
        fx.setMatrixAt(i, m4);
        fz.setMatrixAt(i, m4.clone().multiply(ry));
      });
      scene.add(fx, fz);
    }

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
      if (S2 || SW || !isOpen(tx, ty + 1)) continue;
      if (S3) { const rr = roomAt(level, tx, ty + 1); if (!rr || rr.key === "battlements" || rr.sealed) continue; }
      const c = tileCenter(tx, ty);
      const z = (ty + 1) * TILE;
      if (!SC) {
        B.box(trimMat, TILE, 0.12, 0.08, c.x, 0.2, z + 0.04);
        B.box(trimMat, TILE, 0.12, 0.08, c.x, WALL_H - 0.25, z + 0.04);
      }
      const room = roomAt(level, tx, ty + 1);
      const h = rnd();
      if (room && room.key === "chapel" && ty === room.y0 - 1 && tx % 3 === 1) {
        B.add(new THREE.PlaneGeometry(0.9, 1.8), glassWin, c.x, 1.7, z + 0.03);
      } else if (!SC && h < 0.18) {
        B.add(new THREE.PlaneGeometry(1.15, 2.1), tapMat, c.x, 1.55, z + 0.03);
      } else if (h < 0.3) {
        B.box(ironMat, 0.18, 0.4, 0.3, c.x, 1.85, z + 0.15);
        B.box(ironMat, 0.34, 0.06, 0.34, c.x, 2.07, z + 0.24);
        bigFlames.push(c.x, 2.22, z + 0.22);
        addFlameSrc(c.x, 2.3, z + 0.5, 9, 7.5, 0xffa050);
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
        if (rnd() < (OUT ? 0.08 : 0.22)) {
          const c = tileCenter(tx, ty);
          const n = 2 + Math.floor(rnd() * 3);
          addFlameSrc(c.x, 0.7, ty * TILE + 0.8, 3.2, 4.5, 0xffb060);
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
    for (const [x0, y0, w, h] of (OUT ? [] : S3 ? [[44, 5, 8, 3], [24, 13, 4, 6], [45, 31, 3, 8]] : [[27, 19, 4, 13], [9, 22, 3, 11], [27, 37, 4, 6], [37, 3, 5, 9]])) {
      B.add(new THREE.PlaneGeometry(w * TILE * 0.9, h * TILE * 0.96), rugMat, (x0 + w / 2) * TILE, 0.015, (y0 + h / 2) * TILE, -Math.PI / 2);
    }

    // ---------- Props ----------
    const woodMat = this._mat("wood", { map: T.wood });
    const stoneMat = this._mat("ped", { map: T.stone });
    const goldMat = this._mat("goldTrim", { color: 0xc9a24d, emissive: 0x2a1804 });
    const redCloth = this._mat("redCloth", { color: 0x8b0018 });
    const statueMat = this._mat("statue", { color: 0x8a8490 });
    const graveStone = this._mat("graveStone", { map: T.flag, color: 0xb0b4bc }, true);
    const darkStone = this._mat("darkStone", { color: 0x2a2c30 });
    const earthMat = this._mat("earth", { map: T.dirt, color: 0x9a8a80 });
    const barkMat = this._mat("bark", { color: 0x2e2420 }, true);
    const boneMat = this._mat("boneMat", { color: 0xd8ceb0, emissive: 0x1a1608 });
    const voidMat = new THREE.MeshBasicMaterial({ color: 0x030405 });
    psx(voidMat);
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
        case "tomb": {
          const tilt = (rnd() - 0.5) * 0.25;
          B.box(graveStone, 0.95, 1.15, 0.22, c.x, 0.55, c.z - 0.2, 0, 0, tilt);
          B.add(new THREE.CylinderGeometry(0.475, 0.475, 0.22, 8, 1, false, 0, Math.PI), graveStone, c.x, 1.12, c.z - 0.2, Math.PI / 2, 0, Math.PI / 2 + tilt);
          B.box(darkStone, 0.6, 0.06, 0.02, c.x, 0.8, c.z - 0.08);
          B.box(earthMat, 0.9, 0.12, 1.3, c.x, 0.06, c.z + 0.3);
          if (rnd() < 0.4) { B.add(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 6), waxMat, c.x + 0.3, 0.12, c.z + 0.05); smallFlames.push(c.x + 0.3, 0.32, c.z + 0.05); }
          break;
        }
        case "cross":
          B.box(graveStone, 0.2, 1.7, 0.2, c.x, 0.85, c.z - 0.2, 0, 0, (rnd() - 0.5) * 0.2);
          B.box(graveStone, 0.9, 0.2, 0.2, c.x, 1.25, c.z - 0.2);
          B.box(earthMat, 0.9, 0.12, 1.3, c.x, 0.06, c.z + 0.3);
          break;
        case "mausoleum":
          B.box(graveStone, 1.9, 1.9, 1.7, c.x, 0.95, c.z);
          B.box(darkStone, 2.1, 0.2, 1.9, c.x, 1.95, c.z);
          B.add(new THREE.ConeGeometry(1.4, 0.8, 4), graveStone, c.x, 2.45, c.z, 0, Math.PI / 4);
          B.box(voidMat, 0.8, 1.3, 0.05, c.x, 0.65, c.z + 0.86);
          B.box(ironMat, 0.9, 0.08, 0.06, c.x, 1.3, c.z + 0.88);
          B.box(graveStone, 0.22, 1.7, 0.22, c.x - 0.7, 0.85, c.z + 0.9);
          B.box(graveStone, 0.22, 1.7, 0.22, c.x + 0.7, 0.85, c.z + 0.9);
          break;
        case "tree": {
          const h = 2.6 + rnd() * 1.2;
          B.add(new THREE.CylinderGeometry(0.12, 0.3, h, 5), barkMat, c.x, h / 2, c.z, (rnd() - 0.5) * 0.15, 0, (rnd() - 0.5) * 0.15);
          for (let k = 0; k < 5; k++) {
            const a = rnd() * Math.PI * 2, len = 0.9 + rnd() * 0.9, y = h * (0.5 + rnd() * 0.45);
            B.add(new THREE.CylinderGeometry(0.03, 0.08, len, 4), barkMat, c.x + Math.cos(a) * len * 0.4, y + len * 0.3, c.z + Math.sin(a) * len * 0.4, Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
          }
          B.box(earthMat, 1.0, 0.1, 1.0, c.x, 0.05, c.z);
          break;
        }
        case "grave":
          B.box(voidMat, 0.95, 0.02, 1.7, c.x, 0.02, c.z);
          B.box(earthMat, 0.25, 0.3, 1.9, c.x - 0.62, 0.15, c.z);
          B.box(earthMat, 0.25, 0.3, 1.9, c.x + 0.62, 0.15, c.z);
          B.box(earthMat, 1.4, 0.45, 0.4, c.x + 0.2, 0.22, c.z + 0.95, 0.3);
          B.box(graveStone, 0.8, 0.9, 0.18, c.x, 0.45, c.z - 0.95, -0.15);
          B.box(woodMat, 0.08, 1.2, 0.08, c.x + 0.8, 0.6, c.z + 0.7, 0.3, 0, 0.4); // abandoned spade
          break;
        case "bones":
          for (let k = 0; k < 7; k++) B.box(boneMat, 0.5 + rnd() * 0.3, 0.08, 0.08, c.x + (rnd() - 0.5) * 0.9, 0.08 + k * 0.05, c.z + (rnd() - 0.5) * 0.9, rnd() * Math.PI);
          for (let k = 0; k < 3; k++) B.add(new THREE.SphereGeometry(0.16, 6, 5), boneMat, c.x + (rnd() - 0.5) * 0.7, 0.3 + k * 0.08, c.z + (rnd() - 0.5) * 0.7);
          break;
        case "angel":
          B.box(graveStone, 1.0, 0.7, 1.0, c.x, 0.35, c.z);
          B.add(new THREE.CylinderGeometry(0.22, 0.5, 1.6, 6), graveStone, c.x, 1.5, c.z);
          B.add(new THREE.SphereGeometry(0.2, 6, 5), graveStone, c.x, 2.45, c.z + 0.05);
          B.box(graveStone, 0.12, 1.1, 0.6, c.x - 0.35, 1.9, c.z - 0.3, 0.3, 0, 0.5);
          B.box(graveStone, 0.12, 1.1, 0.6, c.x + 0.35, 1.9, c.z - 0.3, 0.3, 0, -0.5);
          break;
        case "fountain":
          B.add(new THREE.CylinderGeometry(1.0, 1.05, 0.6, 10, 1, true), graveStone, c.x, 0.3, c.z);
          B.cyl(this._mat("fountWater", { color: 0x0a1a14, emissive: 0x04120c }), 0.95, 0.95, 0.05, 10, c.x, 0.48, c.z);
          B.add(new THREE.CylinderGeometry(0.16, 0.24, 1.3, 6), graveStone, c.x, 1.1, c.z);
          B.add(new THREE.CylinderGeometry(0.5, 0.2, 0.2, 8), graveStone, c.x, 1.8, c.z);
          B.add(new THREE.SphereGeometry(0.16, 6, 5), boneMat, c.x, 2.0, c.z);
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



    if (SW || SC) buildWoodsCourtyardProps(this, level, B, { woodMat, stoneMat, goldMat, ironMat, waxMat, earthMat, barkMat, boneMat, darkStone }, smallFlames);
    if (S3) {
      const flames = { small: smallFlames, big: bigFlames, add: addFlameSrc };
      buildStage3Props(this, level, B, { woodMat, ironMat, goldMat, stoneMat, waxMat, redCloth }, flames);
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
        const block = new THREE.Mesh(new THREE.BoxGeometry(TILE, WH, TILE), wallSide);
        block.position.set(c.x, WH / 2, c.z);
        wall.add(block);
        const top = new THREE.Mesh(new THREE.BoxGeometry(TILE, 0.08, TILE), wallTop);
        top.position.set(c.x, WH + 0.04, c.z);
        wall.add(top);
        // hairline crack on the faces — a hint that the masonry isn't true
        const crack = new THREE.Mesh(new THREE.BoxGeometry(0.06, WH * 0.7, 0.06), seamMat);
        crack.position.set(c.x, WH * 0.45, c.z);
        wall.add(crack);
        if (S2) {
          // fence on the secret span too, and a crooked gap in it — the tell
          const fp = new THREE.Mesh(new THREE.PlaneGeometry(TILE, 1.5), psx(new THREE.MeshLambertMaterial({ map: T.fence, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide })));
          fp.position.set(c.x, WH + 0.75, c.z);
          fp.rotation.z = 0.08;
          wall.add(fp);
        }
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
      } else if (d.item === "angel") {
        const st = this._mat("graveStone", {});
        const add = (geo, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, st); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); item.add(m); return m; };
        add(new THREE.BoxGeometry(0.9, 0.5, 0.9), 0, 0.25, 0);
        add(new THREE.CylinderGeometry(0.2, 0.42, 1.3, 6), 0, 1.15, 0);
        add(new THREE.SphereGeometry(0.17, 6, 5), 0, 1.95, 0.08, 0.4);
        add(new THREE.BoxGeometry(0.1, 0.9, 0.5), -0.3, 1.5, -0.25, 0.3, 0.5);
        add(new THREE.BoxGeometry(0.1, 0.9, 0.5), 0.3, 1.5, -0.25, 0.3, -0.5);
        add(new THREE.BoxGeometry(0.34, 0.1, 0.22), 0, 1.35, 0.3); // cupped hands
        const halo = new THREE.Sprite(this.glowMat(0x9ab8e0, 0.35));
        halo.position.y = 1.3;
        halo.scale.set(1.3, 1.6, 1);
        item.add(halo);
      } else if (d.item === "cairn" || d.item === "stump" || d.item === "trough" || d.item === "cage") {
        const halo = new THREE.Sprite(this.glowMat(d.item === "cairn" || d.item === "stump" ? 0x70e890 : 0xe0b860, 0.45));
        halo.position.y = 0.85;
        halo.scale.set(1.2, 1.2, 1);
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
      const mist = new THREE.Sprite(this.glowMat(level.well.fountain ? 0x4aa080 : 0x6a88aa, 0.35));
      mist.position.y = 0.7;
      mist.scale.set(2.2, 1.4, 1);
      this.wellMist = mist;
      this.wellGroup.add(mist);
      scene.add(this.wellGroup);
    }

    this._buildBreakables(level, woodMat, ironMat);
    this._buildChambers(level, wallSide, wallTop, woodMat, ironMat, goldMat, stoneMat);
    if (SW || SC) buildWoodsCourtyardPuzzles(this, level, { woodMat, stoneMat, goldMat, ironMat, waxMat }, glyphTexture);
    if (S3) buildStage3Rigs(this, level, { woodMat, ironMat, goldMat, stoneMat });

    // ---------- Iron alcoves ----------
    const innerMat = this._mat("inner", { color: 0x120a0e });
    const spikeMat = this._mat("spike", { color: 0x8a8690 });
    const alcMat = S2 ? this._mat("graveStone", {}) : ironMat;
    for (const a of level.alcoves) {
      const c = tileCenter(a.tx, a.ty);
      const flip = !isFloor(a.tx, a.ty + 1);
      if (S2) {
        // Graveyard hiding spot: an open stone crypt niche.
        const P2 = (geo, mat, x, y, z) => B.add(geo, mat, c.x + x, y, c.z + z * (flip ? -1 : 1));
        P2(new THREE.BoxGeometry(1.6, 2.4, 0.2), alcMat, 0, 1.2, -0.7);
        P2(new THREE.BoxGeometry(0.2, 2.4, 1.3), alcMat, -0.75, 1.2, -0.1);
        P2(new THREE.BoxGeometry(0.2, 2.4, 1.3), alcMat, 0.75, 1.2, -0.1);
        P2(new THREE.BoxGeometry(1.8, 0.25, 1.5), alcMat, 0, 2.5, -0.1);
        P2(new THREE.ConeGeometry(0.9, 0.6, 4), alcMat, 0, 2.95, -0.1);
        P2(new THREE.BoxGeometry(1.3, 2.2, 0.04), innerMat, 0, 1.15, -0.58);
        continue;
      }
      if (SW || SC) {
        const matH = SW ? barkMat : stoneMat;
        const roofH = SW ? this._mat("blindMoss", { color: 0x264224 }) : woodMat;
        const P2 = (geo, mat, x, y, z) => B.add(geo, mat, c.x + x, y, c.z + z * (flip ? -1 : 1));
        P2(new THREE.BoxGeometry(1.5, 2.3, 0.18), matH, 0, 1.15, -0.66);
        P2(new THREE.BoxGeometry(0.18, 2.3, 1.2), matH, -0.7, 1.15, -0.08);
        P2(new THREE.BoxGeometry(0.18, 2.3, 1.2), matH, 0.7, 1.15, -0.08);
        P2(new THREE.BoxGeometry(1.7, 0.2, 1.45), roofH, 0, 2.4, -0.08);
        P2(new THREE.BoxGeometry(1.25, 2.1, 0.04), innerMat, 0, 1.1, -0.56);
        continue;
      }
      const s = flip ? -1 : 1;
      const P = (geo, mat, x, y, z, rx = 0, ry = 0) => B.add(geo, mat, c.x + x * s, y, c.z + z * s, rx * s, ry);
      P(new THREE.BoxGeometry(1.4, 2.5, 0.14), alcMat, 0, 1.25, -0.62);
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
    for (const p of this.brazierPos) addFlameSrc(p.x, 1.8, p.z, 22, 11);
    // 6 pooled point lights; the quality preset decides how many are live
    this.flameLights = [];
    for (let i = 0; i < 6; i++) {
      const light = new THREE.PointLight(0xff8a3a, 0, 11, 1.3);
      light.position.set(-100, -100, -100);
      light.visible = i < this.q.lights;
      scene.add(light);
      this.flameLights.push({ light, base: 0, seed: i * 2.7, src: null });
    }
    this.brazierLights = this.flameLights;

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

    if (S2) {
      // Graveyard beyond the fences: scattered stones and dead trees on solid ground (decor only).
      for (let ty = 0; ty < level.rows; ty++) for (let tx = 0; tx < level.cols; tx++) {
        if (level.grid[ty][tx] !== 1 || isOpen(tx, ty) || this.secretSet.has(`${tx},${ty}`)) continue;
        let near = false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isOpen(tx + dx, ty + dy)) near = true;
        if (near) continue;
        const r = rnd();
        const c = tileCenter(tx, ty);
        if (r < 0.07) {
          B.box(graveStone, 0.8, 1.0, 0.2, c.x + (rnd() - 0.5), 0.45, c.z, (rnd() - 0.5) * 0.4, 0, (rnd() - 0.5) * 0.4);
        } else if (r < 0.1) {
          B.box(graveStone, 0.18, 1.5, 0.18, c.x, 0.7, c.z, 0, 0, (rnd() - 0.5) * 0.5);
          B.box(graveStone, 0.8, 0.18, 0.18, c.x, 1.1, c.z);
        } else if (r < 0.125) {
          const h = 2.4 + rnd() * 1.4;
          B.add(new THREE.CylinderGeometry(0.1, 0.26, h, 5), barkMat, c.x, h / 2, c.z, (rnd() - 0.5) * 0.2, 0, (rnd() - 0.5) * 0.2);
          for (let k = 0; k < 3; k++) {
            const a = rnd() * Math.PI * 2, len = 0.8 + rnd() * 0.8;
            B.add(new THREE.CylinderGeometry(0.03, 0.07, len, 4), barkMat, c.x + Math.cos(a) * len * 0.4, h * 0.75 + len * 0.3, c.z + Math.sin(a) * len * 0.4, Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
          }
        }
      }
    }

    // ---------- The Hooded Pedlar (merchant) ----------
    this.merchantRig = null;
    if (level.merchant) {
      const mc = tileCenter(level.merchant.tx, level.merchant.ty);
      const robe = this._mat("pedlar-robe", { color: 0x2a1e2e, emissive: 0x0a060c });
      const cloth = this._mat("pedlar-cloth", { color: 0x5a1020 });
      B.box(woodMat, 1.7, 0.1, 0.8, mc.x, 0.9, mc.z + 0.45);
      B.box(woodMat, 0.1, 0.9, 0.1, mc.x - 0.75, 0.45, mc.z + 0.8);
      B.box(woodMat, 0.1, 0.9, 0.1, mc.x + 0.75, 0.45, mc.z + 0.8);
      B.box(cloth, 1.72, 0.4, 0.04, mc.x, 0.72, mc.z + 0.86);
      B.box(woodMat, 0.1, 2.6, 0.1, mc.x - 0.8, 1.3, mc.z + 0.1);
      B.box(woodMat, 0.1, 2.6, 0.1, mc.x + 0.8, 1.3, mc.z + 0.1);
      B.box(cloth, 1.9, 0.08, 1.2, mc.x, 2.6, mc.z + 0.3, 0, -0.18);
      const g = new THREE.Group();
      g.position.set(mc.x, 0, mc.z - 0.1);
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.7, 6), robe);
      body.position.y = 0.85;
      const hood = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.6, 6), robe);
      hood.position.y = 1.85;
      const face = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), new THREE.MeshBasicMaterial({ color: 0x050307 }));
      face.position.set(0, 1.7, 0.12);
      g.add(body, hood, face);
      for (const sx of [-0.07, 0.07]) {
        const e = new THREE.Sprite(this.glowMat(0xffd060, 0.95));
        e.position.set(sx, 1.72, 0.3);
        e.scale.set(0.12, 0.08, 1);
        g.add(e);
      }
      const lamp = new THREE.Sprite(this.glowMat(0xffb050, 0.75));
      lamp.position.set(0.55, 1.1, 0.5);
      lamp.scale.set(1.6, 1.6, 1);
      g.add(lamp);
      const bottleCols = [0xc41230, 0x4a8ad8, 0xe7c873, 0x5aff6a];
      bottleCols.forEach((col, k) => {
        const bt = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.26, 6), new THREE.MeshBasicMaterial({ color: col }));
        bt.position.set(-0.55 + k * 0.32, 1.08, 0.55);
        g.add(bt);
      });
      const sign = new THREE.Sprite(this.glowMat(0xffc070, 0.0));
      sign.position.set(0, 2.3, 0.3);
      sign.scale.set(2.2, 2.2, 1);
      g.add(sign);
      scene.add(g);
      this.merchantRig = { g, lamp, sign, hood };
    }

    // ---------- Grave hands (Stage II hazard) ----------
    this.handRigs = [];
    if (level.graves && level.graves.length) {
      const skin = this._mat("grave-hand", { color: 0x9aa890, emissive: 0x101810 });
      for (const gr of level.graves) {
        const c = tileCenter(gr.tx, gr.ty);
        const g = new THREE.Group();
        g.position.set(c.x, -1.4, c.z);
        for (const [hx, hz, rot] of [[-0.22, -0.2, 0.25], [0.2, 0.3, -0.3], [0.05, -0.55, 0.1]]) {
          const arm = new THREE.Group();
          arm.position.set(hx, 0, hz);
          arm.rotation.z = rot;
          const fore = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.1, 0.14), skin);
          fore.position.y = 0.55;
          arm.add(fore);
          const palm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.08), skin);
          palm.position.y = 1.18;
          arm.add(palm);
          for (let f = 0; f < 4; f++) {
            const fing = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.04), skin);
            fing.position.set(-0.08 + f * 0.055, 1.36, 0);
            fing.rotation.x = 0.4;
            arm.add(fing);
          }
          g.add(arm);
        }
        scene.add(g);
        this.handRigs.push({ g, idx: gr.i });
      }
    }

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
    this.spot = new THREE.SpotLight(0xffd08a, 66, 16, 0.62, 0.75, 1.25);
    this.spot.castShadow = !!this.q.shadows;
    this.spot.shadow.mapSize.set(this.q.shadowMap, this.q.shadowMap);
    this.spot.shadow.camera.near = 0.3;
    this.spot.shadow.camera.far = 16;
    this.spot.shadow.bias = -0.002;
    scene.add(this.spot, this.spot.target);
    this.aura = new THREE.PointLight(0xffc27a, 4, 5, 1.2);
    scene.add(this.aura);
    // soft camera-side fill so the player (and whatever is on top of them) never reads as a black blob
    this.fill = new THREE.PointLight(0xa898c8, 3.2, 5.0, 1.6);
    scene.add(this.fill);

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
    this.particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ map: T.glow, size: 0.24, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.particles.frustumCulled = false;
    scene.add(this.particles);
    this.pVel = new Float32Array(PARTICLES * 3);
    this.pLife = new Float32Array(PARTICLES);
    this.pGrav = new Float32Array(PARTICLES);
    this.pNext = 0;
    // Gore: a second, normally-blended pool so blood reads dark red instead of glowing
    const gGeo = new THREE.BufferGeometry();
    this.gPos = new Float32Array(GORE * 3).fill(-50);
    this.gCol = new Float32Array(GORE * 3);
    gGeo.setAttribute("position", new THREE.BufferAttribute(this.gPos, 3));
    gGeo.setAttribute("color", new THREE.BufferAttribute(this.gCol, 3));
    this.gore = new THREE.Points(gGeo, new THREE.PointsMaterial({ size: 0.11, vertexColors: true, transparent: false, depthWrite: true }));
    this.gore.frustumCulled = false;
    scene.add(this.gore);
    this.gVel = new Float32Array(GORE * 3);
    this.gLife = new Float32Array(GORE);
    this.gNext = 0;
    // Blood decals on the floor: one instanced draw, oldest recycled, shrinking away after ~18 s
    const splat = this._splatTexture();
    const decalMat = new THREE.MeshLambertMaterial({ map: splat, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, color: 0xffffff });
    psx(decalMat);
    const dGeo = new THREE.PlaneGeometry(1, 1);
    dGeo.rotateX(-Math.PI / 2);
    this.decals = new THREE.InstancedMesh(dGeo, decalMat, 48);
    this.decals.frustumCulled = false;
    this.decals.count = 0;
    this.decalData = [];
    this.decalNext = 0;
    scene.add(this.decals);
    // Embers rising from the flames near the player
    const eGeo = new THREE.BufferGeometry();
    this.ePos = new Float32Array(EMBERS * 3).fill(-50);
    eGeo.setAttribute("position", new THREE.BufferAttribute(this.ePos, 3));
    this.eVel = new Float32Array(EMBERS * 3);
    this.eLife = new Float32Array(EMBERS);
    this.embers = new THREE.Points(eGeo, new THREE.PointsMaterial({ map: T.glow, color: 0xff9a40, size: 0.16, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.embers.frustumCulled = false;
    this.embers.geometry.setDrawRange(0, this.q.embers);
    scene.add(this.embers);

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

    // ---------- Dust / Fireflies / Mist ----------
    const dust = [];
    const S2d = OUT;
    for (let i = 0; i < (S2d ? 850 : 400); i++) dust.push(rnd() * fw, S2d ? (SW ? 0.4 + rnd() * 2.1 : rnd() * 1.1) : rnd() * 3.2, rnd() * fh);
    this.dustCount = S2d ? 850 : 400;
    const dg = new THREE.BufferGeometry();
    dg.setAttribute("position", new THREE.Float32BufferAttribute(dust, 3));
    this.dust = new THREE.Points(dg, SW
      ? new THREE.PointsMaterial({ map: T.glow, color: 0xa8f878, size: 0.36, transparent: true, opacity: 0.52, depthWrite: false, blending: THREE.AdditiveBlending })
      : S2d
      ? new THREE.PointsMaterial({ map: T.glow, color: 0x8aa0c8, size: 1.6, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending })
      : new THREE.PointsMaterial({ color: 0xd8c8b0, size: 0.06, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.dustMist = S2d;
    scene.add(this.dust);
    this.dust.geometry.setDrawRange(0, Math.floor(this.dustCount * this.q.dust));
    this.floorMist = null;
    if (!S2d || SW) {
      const mist = [];
      for (let i = 0; i < 160; i++) mist.push(rnd() * fw, 0.15 + rnd() * 0.25, rnd() * fh);
      const mg = new THREE.BufferGeometry();
      mg.setAttribute("position", new THREE.Float32BufferAttribute(mist, 3));
      this.floorMist = new THREE.Points(mg, new THREE.PointsMaterial({ map: T.glow, color: SW ? 0x527a68 : 0x8a6a8a, size: 2.4, transparent: true, opacity: SW ? 0.08 : 0.05, depthWrite: false, blending: THREE.AdditiveBlending }));
      scene.add(this.floorMist);
    }

    // ---------- Crows (Courtyard & Graveyards): flapping silhouettes circling overhead ----------
    this.crows = [];
    if (SC || S2) {
      const crowMat = new THREE.MeshBasicMaterial({ color: 0x07060a, side: THREE.DoubleSide });
      for (let i = 0; i < 5; i++) {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.5), crowMat);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.14), crowMat);
        head.position.z = 0.3;
        const beak = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 4), crowMat);
        beak.rotation.x = Math.PI / 2;
        beak.position.z = 0.42;
        const wl = new THREE.Group(), wr = new THREE.Group();
        const wgeo = new THREE.PlaneGeometry(0.7, 0.3);
        wgeo.translate(0.35, 0, 0);
        const ml = new THREE.Mesh(wgeo, crowMat); ml.rotation.x = -Math.PI / 2; wl.add(ml);
        const mr = new THREE.Mesh(wgeo, crowMat); mr.rotation.x = -Math.PI / 2; mr.rotation.z = Math.PI; wr.add(mr);
        g.add(body, head, beak, wl, wr);
        g.scale.setScalar(0.85);
        scene.add(g);
        this.crows.push({ g, wl, wr, r: 4 + rnd() * 6, sp: 0.25 + rnd() * 0.35, ph: rnd() * 6.28, h: 4.2 + rnd() * 1.2, ox: (rnd() - 0.5) * 6, oz: (rnd() - 0.5) * 6 });
      }
    }
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

  // Per-stage (and per-floor) colour grade. Values are post-gamma multipliers / offsets.
  setGrade(gain, lift, sat, snap = false) {
    this.gradeTarget = { gain: new THREE.Vector3(...gain), lift: new THREE.Vector3(...lift), sat };
    if (snap) {
      const u = this.postMat.uniforms;
      u.uGain.value.copy(this.gradeTarget.gain); u.uLift.value.copy(this.gradeTarget.lift); u.uSat.value = sat;
    }
  }

  // Stage III: each floor of the tower has its own ambient colour, fog and grade.
  setFloor(f, snap = false) {
    if (!f) return;
    this.floorDef = f;
    if (this.hemi) {
      this.hemi.color.setHex(f.hemi[0]);
      this.hemi.groundColor.setHex(f.hemi[1]);
      this.hemi.intensity = f.hemi[2];
    }
    if (this.moon) {
      this.moon.color.setHex(f.open ? 0xb0c4f0 : 0x6c7fb0);
      this.moon.intensity = f.open ? 1.4 : 0.3;
    }
    if (this.scene.fog) { this.scene.fog.near = f.open ? 10 : 8.5; this.scene.fog.far = f.open ? 30 : 26; }
    this.setGrade(f.grade[0], f.grade[1], f.grade[2], snap);
    this.gradeStage = this.stage;
  }
  _grade(witching) {
    if (!this.gradeTarget || this.gradeStage !== this.stage) {
      this.gradeStage = this.stage;
      const knd = this.stageKind || "castle";
      if (knd === "woods") this.setGrade([0.92, 1.04, 0.96], [0.0, 0.012, 0.01], 0.94, true);
      else if (knd === "courtyard") this.setGrade([0.98, 1.0, 1.06], [0.004, 0.006, 0.016], 0.96, true);
      else if (knd === "graveyards") this.setGrade([0.95, 1.0, 1.08], [0.0, 0.006, 0.02], 0.9, true);
      else if (knd === "castle") this.setGrade([1.07, 0.98, 0.9], [0.012, 0.0, 0.01], 1.06, true);
      else if (knd === "climb") { const f = this.floorDef || { grade: [[1.1, 0.96, 0.84], [0.014, 0.004, 0], 1.0] }; this.setGrade(f.grade[0], f.grade[1], f.grade[2], true); }
    }
    const g = this.gradeTarget;
    const u = this.postMat.uniforms;
    const k = Math.min(1, (this.lastDt || 0.016) * 2.5);
    u.uGain.value.lerp(witching ? new THREE.Vector3(g.gain.x * 1.08, g.gain.y * 0.9, g.gain.z * 0.9) : g.gain, k);
    u.uLift.value.lerp(g.lift, k);
    u.uSat.value += (g.sat - u.uSat.value) * k;
  }

  _emitGore(x, y, z, n, color = 0x8a0614) {
    const c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const i = this.gNext;
      this.gNext = (this.gNext + 1) % GORE;
      this.gPos[i * 3] = x; this.gPos[i * 3 + 1] = y; this.gPos[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2, sp = 2.6 * (0.3 + Math.random() * 0.7);
      this.gVel[i * 3] = Math.cos(a) * sp; this.gVel[i * 3 + 1] = 2 * (0.4 + Math.random()); this.gVel[i * 3 + 2] = Math.sin(a) * sp;
      this.gLife[i] = 0.5 + Math.random() * 0.5;
      const v = 0.7 + Math.random() * 0.5;
      this.gCol[i * 3] = c.r * v; this.gCol[i * 3 + 1] = c.g * v; this.gCol[i * 3 + 2] = c.b * v;
    }
  }

  _splatTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d");
    const r = seeded(4242);
    g.fillStyle = "rgba(110,4,16,0.9)";
    g.beginPath(); g.arc(16, 16, 7, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2, d = 6 + r() * 9, s = 1 + r() * 2.6;
      g.fillStyle = `rgba(${90 + r() * 40 | 0},4,14,${0.6 + r() * 0.35})`;
      g.beginPath(); g.arc(16 + Math.cos(a) * d, 16 + Math.sin(a) * d, s, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = "rgba(60,0,8,0.6)";
    g.beginPath(); g.arc(15, 17, 4, 0, Math.PI * 2); g.fill();
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  _addDecal(x, z, size) {
    if (!this.decals) return;
    const max = Math.min(48, this.q.decals || 24);
    const i = this.decalNext % max;
    this.decalNext = (i + 1) % max;
    this.decalData[i] = { x, z, size, rot: Math.random() * Math.PI * 2, age: 0, y: 0.02 + (i % 8) * 0.002 };
    this.decals.count = Math.max(this.decals.count, i + 1);
  }

  _updateDecals(dt) {
    if (!this.decals || !this.decals.count) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < this.decals.count; i++) {
      const d = this.decalData[i];
      if (!d) continue;
      d.age += dt;
      const grow = Math.min(1, d.age * 6);
      const fade = d.age > 18 ? Math.max(0.001, 1 - (d.age - 18) / 4) : 1;
      q.setFromAxisAngle(up, d.rot);
      sc.set(d.size * grow * fade, 1, d.size * grow * fade);
      pos.set(d.x, d.y, d.z);
      m.compose(pos, q, sc);
      this.decals.setMatrixAt(i, m);
    }
    this.decals.instanceMatrix.needsUpdate = true;
  }

  _consumeFx(list) {
    for (const f of list) {
      const x = f.x * S, z = f.y * S;
      if (f.type === "spark") this._emit(x, f.h ?? 1.1, z, f.n ?? 14, f.color ?? 0xffd27a, 4, 2.5, 8, 0.45);
      else if (f.type === "blood") { this._emit(x, 0.9, z, Math.ceil((f.n ?? 16) * 0.4), 0xff3040, 2.5, 2, 9, 0.35); this._emitGore(x, 0.9, z, f.n ?? 16); this._addDecal(x, z, 0.7 + Math.random() * 0.6); }
      else if (f.type === "mist") this._emit(x, 0.3, z, 26, 0x6a1030, 1.4, 1.4, -0.5, 1.2);
      else if (f.type === "dissolve") { this._emit(x, 0.8, z, 34, f.color ?? 0x8a0a2a, 1.8, 1.6, -1.5, 1.3); this._addDecal(x, z, 1.4 + Math.random() * 0.5); }
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
        this._emitGore(x, 0.4, z, 26, 0xb0101e);
        this._emit(x, 0.4, z, 10, 0x6aff5a, 1.6, 2.0, 7, 0.6);
        this._addDecal(x, z, 1.2);
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
    for (let i = 0; i < GORE; i++) {
      if (this.gLife[i] <= 0) continue;
      this.gLife[i] -= dt;
      if (this.gLife[i] <= 0) { this.gPos[i * 3 + 1] = -50; continue; }
      this.gVel[i * 3 + 1] -= 10 * dt;
      this.gPos[i * 3] += this.gVel[i * 3] * dt;
      const ny = this.gPos[i * 3 + 1] + this.gVel[i * 3 + 1] * dt;
      if (ny <= 0.03) { this.gVel[i * 3] *= 0.2; this.gVel[i * 3 + 2] *= 0.2; this.gVel[i * 3 + 1] = 0; }
      this.gPos[i * 3 + 1] = Math.max(0.03, ny);
      this.gPos[i * 3 + 2] += this.gVel[i * 3 + 2] * dt;
    }
    this.gore.geometry.attributes.position.needsUpdate = true;
    this.gore.geometry.attributes.color.needsUpdate = true;
    this._updateDecals(dt);
    // embers: rise, drift, die; respawn at one of the lit flames near the player
    const srcs = this.flameLights ? this.flameLights.filter((f) => f.src && f.light.visible) : [];
    const nE = this.q.embers;
    for (let i = 0; i < nE; i++) {
      this.eLife[i] -= dt;
      if (this.eLife[i] <= 0) {
        if (!srcs.length) { this.ePos[i * 3 + 1] = -50; this.eLife[i] = 0.5; continue; }
        const s = srcs[i % srcs.length].src;
        const big = s.base >= 9;
        this.ePos[i * 3] = s.p.x + (Math.random() - 0.5) * (big ? 0.6 : 0.4);
        this.ePos[i * 3 + 1] = s.p.y - (big ? 0.5 : 0.1);
        this.ePos[i * 3 + 2] = s.p.z + (Math.random() - 0.5) * (big ? 0.6 : 0.4);
        this.eVel[i * 3] = (Math.random() - 0.5) * 0.3;
        this.eVel[i * 3 + 1] = 0.5 + Math.random() * 0.9;
        this.eVel[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
        this.eLife[i] = (big ? 1.2 : 0.6) + Math.random() * 1.4;
        continue;
      }
      this.eVel[i * 3] += Math.sin(this.time * 3 + i) * dt * 0.6;
      this.ePos[i * 3] += this.eVel[i * 3] * dt;
      this.ePos[i * 3 + 1] += this.eVel[i * 3 + 1] * dt;
      this.ePos[i * 3 + 2] += this.eVel[i * 3 + 2] * dt;
    }
    this.embers.geometry.attributes.position.needsUpdate = true;
    this.embers.material.size = 0.13 + Math.sin(this.time * 13) * 0.03;
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
    if (rig.knees) {
      // knees bend on the recovering (back-swinging) leg only
      rig.knees[0].rotation.x = Math.max(0, Math.sin(phase + 1.3)) * 0.9 * amount;
      rig.knees[1].rotation.x = Math.max(0, Math.sin(phase + 1.3 + Math.PI)) * 0.9 * amount;
    }
    if (countess) {
      rig.skirt.rotation.z = Math.sin(phase) * 0.05 * amount;
      rig.skirt.rotation.x = Math.sin(phase * 0.5) * 0.03;
      if (rig.cape) rig.cape.rotation.x = 0.08 + amount * 0.22 + Math.sin(phase * 0.9 + this.time * 1.3) * 0.06;
    }
    if (rig.coatTails) {
      const flap = 0.05 + amount * 0.25;
      rig.coatTails[0].rotation.x = flap + Math.sin(phase) * 0.18 * amount;
      rig.coatTails[1].rotation.x = flap - Math.sin(phase) * 0.18 * amount;
    }
    // idle breathing blends out as the walk takes over
    const breath = Math.sin((this.time || 0) * 2.1) * 0.012 * (1 - amount);
    if (rig.torso && rig.torso !== rig.body) rig.torso.scale.set(1 + breath, 1 + breath * 0.6, 1 + breath);
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
        const es = rig.eyeScale || 0.16;
        for (const sx of [-es * 0.45, es * 0.45]) {
          const e = new THREE.Sprite(this.glowMat(rig.eyeColor, 0.95));
          e.position.set(sx, rig.eyeY, rig.eyeZ);
          e.scale.set(es, es, 1);
          (rig.eyeParent || rig.body).add(e);
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
        const riseT = m.fromWell ? 1.8 : (m.type && m.type.rise) || 0.9;
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
      if (m.kind === "ghoul" || m.kind === "prisoner") {
        this._animateWalk(rig, rig.walk, Math.min(1, speed / 1.5));
        const reach = windup ? -2.2 : hurt ? 0.6 : -0.9 + Math.sin(rig.walk) * 0.3;
        rig.arms[0].rotation.x = reach;
        rig.arms[1].rotation.x = windup ? -2.2 : -0.9 - Math.sin(rig.walk) * 0.3;
        if (rig.elbows) { rig.elbows[0].rotation.x = windup ? -0.1 : -0.35 - Math.sin(t * 3 + m.id) * 0.15; rig.elbows[1].rotation.x = windup ? -0.1 : -0.35 + Math.sin(t * 3 + m.id) * 0.15; }
        rig.torso.rotation.x = hurt ? 0.05 : windup ? 0.7 : 0.45 + Math.sin(t * 2 + m.id) * 0.05;
        if (rig.head) rig.head.rotation.z = Math.sin(t * 1.3 + m.id) * 0.2;
        if (rig.jaw) rig.jaw.rotation.x = windup ? 0.6 : Math.max(0, Math.sin(t * 4 + m.id)) * 0.25;
        if (rig.chain) rig.chain.forEach((l, i) => { l.rotation.x = 0.9 + (i ? -0.15 : 0) + Math.sin(rig.walk * 1.2 - i * 0.6) * 0.18; l.rotation.z = Math.sin(rig.walk * 0.6 - i * 0.5) * 0.12; });
      } else if (m.kind === "skeleton") {
        this._animateWalk(rig, rig.walk * 1.2, Math.min(1, speed / 1.2));
        rig.arms[0].rotation.x = windup ? -2.4 : -0.5 + Math.sin(rig.walk * 1.2) * 0.5;
        rig.arms[1].rotation.x = windup ? -2.0 : -0.5 - Math.sin(rig.walk * 1.2) * 0.5;
        rig.torso.rotation.x = hurt ? -0.2 : windup ? 0.5 : 0.18;
        rig.torso.rotation.z = Math.sin(t * 6 + m.id) * 0.04; // bones rattle
        if (rig.jaw) rig.jaw.rotation.x = Math.max(0, Math.sin(t * 9 + m.id)) * (windup ? 0.6 : 0.3); // chattering
        if (rig.head) rig.head.rotation.y = Math.sin(t * 0.9 + m.id) * 0.35;
      } else if (m.kind === "brute") {
        this._animateWalk(rig, rig.walk * 0.7, Math.min(1, speed / 1.0));
        rig.arms[0].rotation.x = windup ? -1.6 : Math.sin(rig.walk * 0.7) * 0.3;
        rig.arms[1].rotation.x = windup ? -3.0 : -0.4 - Math.sin(rig.walk * 0.7) * 0.25;
        rig.torso.rotation.x = hurt ? 0.0 : windup ? -0.2 : 0.3 + Math.sin(t * 1.5 + m.id) * 0.04;
        if (rig.elbows) rig.elbows[1].rotation.x = windup ? -0.9 : -0.2;
        if (rig.head) rig.head.rotation.z = Math.sin(t * 0.8 + m.id) * 0.12;
      } else if (m.kind === "banshee") {
        const wail = m.wailing > 0 ? 1 : 0;
        rig.float.position.y = 0.6 + Math.sin(t * 2.2 + m.id) * 0.12 + wail * 0.35;
        rig.float.rotation.x = windup ? -0.4 : wail ? -0.25 : 0.15;
        rig.tatters.forEach((tp, i) => { tp.rotation.x = Math.sin(t * 5 + i * 1.3) * 0.35 + 0.2; });
        rig.arms[0].rotation.z = wail ? -1.3 : -0.2 + Math.sin(t * 2 + m.id) * 0.1;
        rig.arms[1].rotation.z = wail ? 1.3 : 0.2 - Math.sin(t * 2 + m.id) * 0.1;
        rig.arms[0].rotation.x = windup ? -1.6 : 0;
        rig.arms[1].rotation.x = windup ? -1.6 : 0;
        rig.jaw.scale.y = wail ? 2.6 + Math.sin(t * 30) * 0.4 : 1;
      } else if (m.kind === "wraith") {
        rig.float.position.y = 0.5 + Math.sin(t * 1.8 + m.id) * 0.1;
        rig.float.rotation.x = windup ? -0.35 : 0.1;
        rig.tatters.forEach((tp, i) => { tp.rotation.x = Math.sin(t * 4 + i * 1.1) * 0.3 + 0.25; });
        rig.arms[0].rotation.x = windup ? -1.8 : -0.4 + Math.sin(t * 2 + m.id) * 0.2;
        rig.arms[1].rotation.x = windup ? -1.8 : -0.4 - Math.sin(t * 2 + m.id) * 0.2;
        rig.frame.rotation.z = Math.sin(t * 1.1 + m.id) * 0.06;
        rig.head.rotation.z = Math.sin(t * 0.7 + m.id) * 0.25 + (hurt ? 0.4 : 0);
        // painted figures blink in and out when they teleport
        const fl = m.blinkFx > 0 ? (Math.sin(t * 60) > 0 ? 0.2 : 1) : 1;
        rig.root.scale.multiplyScalar(fl);
      } else if (m.kind === "ironmaiden") {
        const amt = Math.min(1, speed / 0.9);
        rig.legs[0].rotation.x = Math.sin(rig.walk * 1.4) * 0.45 * amt;
        rig.legs[1].rotation.x = -Math.sin(rig.walk * 1.4) * 0.45 * amt;
        rig.shell.rotation.z = Math.sin(rig.walk * 1.4) * 0.09 * amt;   // heavy waddle
        rig.shell.rotation.x = windup ? -0.15 : hurt ? 0.12 : 0.04;
        rig.body.position.y = Math.abs(Math.sin(rig.walk * 1.4)) * 0.06 * amt;
        const open = windup ? 1.25 : m.state === "ATTACK" ? 0.9 : 0.04 + Math.max(0, Math.sin(t * 0.7 + m.id) - 0.92) * 3;
        rig.doorOpen = (rig.doorOpen || 0) + (open - (rig.doorOpen || 0)) * Math.min(1, dt * 8);
        rig.doors[0].rotation.y = -rig.doorOpen;
        rig.doors[1].rotation.y = rig.doorOpen;
      } else if (m.kind === "gargoyle") {
        const amt = Math.min(1, speed / 1.4);
        const swoop = m.swooping > 0;
        this._animateWalk(rig, rig.walk * 0.6, swoop ? 0 : amt);
        rig.wings.forEach((w, i) => {
          const s = i ? -1 : 1;
          const beat = swoop ? Math.sin(t * 14) * 0.7 : windup ? -0.9 : Math.sin(t * 1.6 + m.id) * 0.18 - 0.25;
          w.rotation.z = s * beat; w.rotation.y = s * (swoop ? 0.2 : 0.5);
        });
        rig.torso.rotation.x = swoop ? 0.9 : windup ? -0.25 : 0.35 + Math.sin(t * 1.2) * 0.04;
        rig.arms[0].rotation.x = windup ? -2.4 : swoop ? -1.4 : -0.3 + Math.sin(rig.walk * 0.6) * 0.3;
        rig.arms[1].rotation.x = windup ? -2.4 : swoop ? -1.4 : -0.3 - Math.sin(rig.walk * 0.6) * 0.3;
        rig.jaw.rotation.x = windup || swoop ? 0.55 : Math.max(0, Math.sin(t * 1.4)) * 0.15;
        rig.body.position.y += swoop ? 0.9 : 0;
      } else if (m.kind === "wolf" || m.kind === "hound" || m.kind === "packmaster") {
        const amt = Math.min(1, speed / 1.4);
        const swoop = m.swooping > 0;
        const g = rig.walk * 1.4;
        if (rig.quad) {
          rig.quad[0].rotation.x = Math.sin(g) * 0.65 * amt;
          rig.quad[1].rotation.x = -Math.sin(g) * 0.65 * amt;
          rig.quad[2].rotation.x = -Math.sin(g + 0.4) * 0.65 * amt;
          rig.quad[3].rotation.x = Math.sin(g + 0.4) * 0.65 * amt;
        }
        rig.body.position.y = swoop ? 0.35 : Math.abs(Math.sin(g)) * 0.08 * amt;
        rig.torso.rotation.x = swoop ? -0.18 : windup ? -0.22 : hurt ? 0.2 : 0.04;
        if (rig.head) rig.head.rotation.x = windup ? -0.25 : 0.05;
        if (rig.jaw) rig.jaw.rotation.x = windup || swoop ? 0.55 : Math.max(0, Math.sin(t * 5 + m.id)) * 0.16;
        if (rig.tail) rig.tail.rotation.y = Math.sin(t * 7 + m.id) * 0.35;
        if (rig.chain) rig.chain.forEach((l) => { l.rotation.x = Math.sin(g) * 0.25; });
      } else if (m.kind === "stalker") {
        this._animateWalk(rig, rig.walk * 0.9, Math.min(1, speed / 1.2));
        rig.arms[0].rotation.x = windup ? -2.2 : -0.6 + Math.sin(rig.walk) * 0.45;
        rig.arms[1].rotation.x = windup ? -2.2 : -0.6 - Math.sin(rig.walk) * 0.45;
        if (rig.elbows) { rig.elbows[0].rotation.x = -0.35; rig.elbows[1].rotation.x = -0.35; }
        rig.torso.rotation.x = hurt ? -0.18 : windup ? 0.4 : 0.22;
        if (rig.head) rig.head.rotation.z = Math.sin(t * 1.1 + m.id) * 0.18;
      } else if (m.kind === "wisp") {
        rig.float.position.y = 1.35 + Math.sin(t * 2.6 + m.id) * 0.16;
        rig.float.rotation.y = t * 1.2;
        for (const w of rig.wisps) {
          const a = t * 2.8 + w.phase + m.id;
          w.w.position.set(Math.cos(a) * w.r, w.h + Math.sin(t * 4 + w.phase) * 0.14 - (windup ? 0.25 : 0), Math.sin(a) * w.r);
        }
      } else if (m.kind === "sentry" || m.kind === "warden") {
        const amt = Math.min(1, speed / 1.1);
        const swoop = m.swooping > 0;
        this._animateWalk(rig, rig.walk * 0.8, swoop ? 0 : amt);
        rig.arms[0].rotation.x = windup ? -1.4 : -0.4 + Math.sin(rig.walk * 0.8) * 0.25;
        rig.arms[1].rotation.x = windup ? -2.5 : swoop ? -1.8 : -0.7 - Math.sin(rig.walk * 0.8) * 0.25;
        if (rig.elbows) rig.elbows[1].rotation.x = windup ? -0.3 : -0.45;
        rig.torso.rotation.x = swoop ? 0.4 : windup ? -0.18 : 0.12;
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
    this.lastDt = dt;
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
    updateStage3(this, level, dt, t);
    if (player && speedBoost > 0 && mode === "PLAYING") this._speedTrail(player, dt, t);

    this.bigFlames.material.size = 0.8 + Math.sin(t * 17) * 0.06;
    this.smallFlames.material.size = 0.32 + Math.sin(t * 21 + 1) * 0.04;
    this.halos.material.opacity = 0.45 + Math.sin(t * 9) * 0.06;

    const dp = this.dust.geometry.attributes.position;
    if (this.dustMist) {
      // low ground mist drifts east and wraps
      const fwm = this.level ? this.level.cols * TILE : 116;
      for (let i = 0; i < dp.count; i++) {
        let x = dp.getX(i) + dt * (0.25 + (i % 5) * 0.06);
        if (x > fwm) x = 0;
        dp.setX(i, x);
      }
      this.dust.material.opacity = 0.14 + Math.sin(t * 0.4) * 0.03;
    } else {
      for (let i = 0; i < dp.count; i++) {
        let y = dp.getY(i) + dt * 0.08;
        if (y > 3.4) y = 0;
        dp.setY(i, y);
      }
    }
    dp.needsUpdate = true;
    if (this.floorMist) {
      this.floorMist.material.opacity = 0.045 + Math.sin(t * 0.3) * 0.015;
      this.floorMist.position.x = Math.sin(t * 0.07) * 1.5;
      this.floorMist.position.z = Math.cos(t * 0.05) * 1.2;
    }
    this._updateGraveyard(level, state.player, dt, t, mode, state.puzzle);

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
    const open = pagesFound >= 5 && !(level && level.bossSpawn && !level.bossDead);
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
      if (inv.elbows) inv.elbows[1].rotation.x = player.hidden ? -0.1 : -0.35 + Math.sin(t * 2.1) * 0.03;
      if (inv.head) { inv.head.rotation.y = Math.sin(t * 0.6) * 0.18 * (1 - amt); inv.head.rotation.x = Math.sin(t * 2.1) * 0.02; }
      if (inv.lantern) inv.lantern.rotation.z = Math.sin(this.playerWalk * 2) * 0.18 * amt + Math.sin(t * 1.7) * 0.04;

      // weapon arm (left): idle carry + per-weapon swing
      const a = player.attackAnim || 0; // 1 -> 0
      const p = 1 - a;
      const arm = inv.arms[0];
      arm.rotation.set(0, 0, 0);
      if (inv.elbows) inv.elbows[0].rotation.x = weapon === "crossbow" ? 0 : a > 0 ? -0.1 : -0.35;
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
      const lm = player.lanternMul || 1; // Wider Wick upgrade
      const wick = 0.94 + 0.04 * Math.sin(t * 9.3) + 0.02 * Math.sin(t * 23.7);
      this.spot.intensity = 66 * wick * lowOilFlicker * (cursed ? 0.28 : 1) * (0.6 + 0.4 * lm);
      this.spot.distance = (cursed ? 6.5 : 16) * lm;
      this.spot.angle = Math.min(0.95, (cursed ? 0.34 : 0.62) * (0.5 + 0.5 * lm));
      this.spot.position.set(px + dirX * 0.45, 1.25, pz + dirZ * 0.45);
      this.spot.target.position.set(px + dirX * (cursed ? 3 : 6), 0, pz + dirZ * (cursed ? 3 : 6));
      this.aura.position.set(px + dirX * 0.4, 1.3, pz + dirZ * 0.4);
      const staffGlow = weapon === "staff" && !player.hidden ? 4 : 0;
      this.aura.intensity = ((lit ? 9 : 2.2) + staffGlow + flareFlash * 160) * (cursed ? 0.35 : 1);
      this.aura.distance = (5 * lm + flareFlash * 10) * (cursed ? 0.4 : 1);
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
      const live = this.flameLights.filter((f) => f.light.visible);
      // weight by reach so a far brazier still beats a near candle stub
      const order = this.flameSources.map((s, i) => [s.p.distanceToSquared(ref) / (s.dist * s.dist), i]).sort((a, b) => a[0] - b[0]).slice(0, live.length);
      const want = new Set(order.map(([, i]) => this.flameSources[i]));
      // keep lights that are already on a wanted source (no popping), re-home the rest
      const free = [];
      for (const f of live) { if (f.src && want.has(f.src)) want.delete(f.src); else free.push(f); }
      for (const f of free) {
        const s = want.values().next().value;
        if (!s) { f.src = null; f.light.position.set(-100, -100, -100); f.base = 0; continue; }
        want.delete(s);
        f.src = s; f.base = s.base;
        f.light.position.copy(s.p); f.light.distance = s.dist; f.light.color.setHex(s.color);
      }
    }
    for (const b of this.flameLights) b.light.intensity = b.base * (0.82 + 0.13 * Math.sin(t * 11 + b.seed) + 0.08 * Math.sin(t * 23 + b.seed * 3) + 0.05 * Math.sin(t * 37 + b.seed * 5));

    // ---------- Camera ----------
    const dangerRed = countess && countess.state === AI_STATE.HUNT ? 1 : 0;
    if (inMenu || !focus) {
      const f = countess ? new THREE.Vector3(countess.x * S, 0, countess.y * S) : new THREE.Vector3(25, 0, 15);
      const a = Math.sin(t * 0.15) * 0.28;
      this.camera.position.set(f.x + Math.sin(a) * 5.4, 2.0, f.z + Math.cos(a) * 5.4);
      this.camera.lookAt(f.x, 0.35, f.z);
      U_PLAYER.value.copy(f);
      U_CAM.value.copy(this.camera.position);
      if (this.fill) this.fill.position.set(f.x, -50, f.z);
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
      const o = CAM_OFFSETS[this.lastRoomKey] || CAM_OFFSETS.ward;
      const off = player.hidden ? new THREE.Vector3(2.0, 4.8, 3.8) : new THREE.Vector3(o[0], o[1], o[2]);
      if (this.camera.aspect < 0.8) off.multiplyScalar(1.28);
      this.camOffset.lerp(off, Math.min(1, dt * 2.2));
      // Sealed puzzle chambers use a fixed camera framed on the room centre.
      const camF = room && room.sealed
        ? new THREE.Vector3(((room.x0 + room.x1 + 1) / 2) * TILE, 0, ((room.y0 + room.y1 + 1) / 2) * TILE)
        : focus;
      const desired = camF.clone().add(this.camOffset);
      if (this.stageKind === "climb" && this.floorDef) {
        // the high riddle-room cameras sit beyond the floor fog: push it back while inside
        const far = room && room.sealed;
        this.scene.fog.near = far ? 20 : this.floorDef.open ? 10 : 8.5;
        this.scene.fog.far = far ? 44 : this.floorDef.open ? 30 : 26;
      }
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
      if (this.fill) {
        const toCam = this.camera.position.clone().sub(focus).setY(0).normalize();
        this.fill.position.set(focus.x + toCam.x * 1.5, 2.1, focus.z + toCam.z * 1.5);
        this.fill.visible = true;
      }
      const warp = 1 - lowSan * 0.55;
      SNAP.value.set(this.baseSnap.x * warp, this.baseSnap.y * warp);
      this.postMat.uniforms.uGlitch.value = lowSan > 0 ? lowSan * (0.5 + 0.5 * Math.sin(t * 9)) : 0;
    }

    const sk = this.stageKind || "castle";
    if (sk === "woods") this.fogColor.setHex(witching ? 0x220c14 : 0x101c1a);
    else if (sk === "courtyard") this.fogColor.setHex(witching ? 0x241018 : 0x161c2a);
    else if (sk === "graveyards") this.fogColor.setHex(witching ? 0x241018 : 0x1a2232);
    else if (sk === "climb" && this.floorDef) this.fogColor.setHex(witching ? 0x1c0408 : this.floorDef.fog);
    else this.fogColor.setHex(witching ? 0x1c0408 : 0x0a0610);
    // on the tower top the moon sits small in the corner, clear of the gargoyle's approach
    if (sk === "climb") this.postMat.uniforms.uMoonP.value.set(0.17, 0.7, 0.7); else if (sk === "woods" || sk === "courtyard") this.postMat.uniforms.uMoonP.value.set(0.76, 0.78, 0.72); else this.postMat.uniforms.uMoonP.value.set(0.7, 0.75, 1.0);
    this.postMat.uniforms.uMoon.value = ((sk === "woods" || sk === "courtyard" || sk === "graveyards") || (sk === "climb" && this.floorDef && this.floorDef.open)) && !inMenu ? 1 : 0;
    this._grade(witching);
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
    const crates = list.filter((b) => b.type === "crate" || b.type === "coffin");
    const barrels = list.filter((b) => b.type === "barrel" || b.type === "urn" || b.type === "cask");
    const shelves = list.filter((b) => b.type === "bookshelf");
    const plank = this._mat("crate-plank", { map: this.T.wood, emissive: 0x120a04 });
    if (level.kind === "graveyards") {
      // Coffins (big) and funeral urns (small) share the crate/barrel instancing slots.
      const coffinWood = this._mat("coffin-wood", { map: this.T.wood, color: 0x6a4a3a, emissive: 0x0a0604 });
      const brass = this._mat("coffin-brass", { color: 0xb89a50, emissive: 0x2a1c04 });
      const urnMat = this._mat("urn", { map: this.T.flag, color: 0x9a8a78, emissive: 0x0a0806 });
      this.crateBig = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.62, 0.5, 0.6, 6).scale(1, 1, 1.6), coffinWood, Math.max(1, crates.length));
      this.crateTop = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.66, 0.6, 0.14, 6).scale(1, 1, 1.6), coffinWood, Math.max(1, crates.length));
      this.crateBand = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.04, 0.9), brass, Math.max(1, crates.length));
      this.barrelBody = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.4, 0.95, 8), urnMat, Math.max(1, barrels.length));
      this.barrelBand = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.36, 0.3, 0.1, 8), brass, Math.max(1, barrels.length * 2));
      this.brkStyle = 2;
    } else {
    this.brkStyle = 1;
    this.crateBig = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 1.0, 1.2), plank, Math.max(1, crates.length));
    this.crateTop = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 0.7, 0.8), plank, Math.max(1, crates.length));
    this.crateBand = new THREE.InstancedMesh(new THREE.BoxGeometry(1.26, 0.1, 1.26), ironMat, Math.max(1, crates.length));
    // Stage III wine casks: bellied, darker oak
    const isCask = level.kind === "climb";
    const caskMat = isCask ? this._mat("cask-wood", { map: this.T.wood, color: 0x8a5a3a, emissive: 0x0c0604 }) : woodMat;
    this.barrelBody = new THREE.InstancedMesh(isCask ? new THREE.CylinderGeometry(0.44, 0.44, 1.1, 8).scale(1.08, 1, 1.08) : new THREE.CylinderGeometry(0.48, 0.48, 1.1, 8), caskMat, Math.max(1, barrels.length));
    this.barrelBand = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 8), ironMat, Math.max(1, barrels.length * 2));
    }
    // Stage III bookshelves: a tall case and its spilling row of books
    this.shelfBody = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 2.4, 0.7), woodMat, Math.max(1, shelves.length));
    this.shelfBooks = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 2.1, 0.74), this._mat("shelf-books", { map: this.T.books || this.T.wood }), Math.max(1, shelves.length));
    if (!shelves.length) { this.shelfBody.count = 0; this.shelfBooks.count = 0; }
    for (const im of [this.crateBig, this.crateTop, this.crateBand, this.barrelBody, this.barrelBand, this.shelfBody, this.shelfBooks]) {
      im.castShadow = true;
      im.receiveShadow = true;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(im);
    }
    const rnd = seeded(77);
    this.brkMeta = list.map((b) => ({ rot: rnd() * Math.PI, top: rnd() * Math.PI, idx: (crates.includes(b) ? crates : shelves.includes(b) ? shelves : barrels).indexOf(b), big: crates.includes(b), shelf: shelves.includes(b) }));
    // shelves stand flush against the nearest wall
    this.brkMeta.forEach((m, k) => {
      if (!m.shelf) return;
      const b = list[k];
      const g = level.grid;
      const wallN = g[b.ty - 1] && g[b.ty - 1][b.tx] === 1, wallS = g[b.ty + 1] && g[b.ty + 1][b.tx] === 1;
      const wallW = g[b.ty][b.tx - 1] === 1, wallE = g[b.ty][b.tx + 1] === 1;
      m.rot = wallW || wallE ? Math.PI / 2 : 0;
      m.off = wallW ? [-0.55, 0] : wallE ? [0.55, 0] : wallN ? [0, -0.55] : wallS ? [0, 0.55] : [0, 0];
    });
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
      if (meta.shelf) {
        const [ox, oz] = meta.off || [0, 0];
        put(this.shelfBody, i, c.x + ox, 1.2 * sc, c.z + oz, meta.rot + wob, sc, dmgTilt);
        put(this.shelfBooks, i, c.x + ox, 1.18 * sc, c.z + oz, meta.rot + wob, sc, dmgTilt);
      } else if (this.brkStyle === 2 && meta.big) {
        put(this.crateBig, i, c.x, 0.3 * sc, c.z, meta.rot * 0.3 + wob, sc, dmgTilt);
        put(this.crateTop, i, c.x, 0.67 * sc, c.z, meta.rot * 0.3 - wob * 1.5, sc, -dmgTilt * 2);
        put(this.crateBand, i, c.x, 0.76 * sc, c.z, meta.rot * 0.3 - wob * 1.5, sc, -dmgTilt * 2);
      } else if (this.brkStyle === 2) {
        put(this.barrelBody, i, c.x, 0.47 * sc, c.z, meta.rot + wob, sc, dmgTilt + wob * 0.5);
        put(this.barrelBand, i * 2, c.x, 0.98 * sc, c.z, meta.rot + wob, sc, dmgTilt + wob * 0.5);
        put(this.barrelBand, i * 2 + 1, c.x, 0.06 * sc, c.z, meta.rot + wob, sc * 1.15, dmgTilt + wob * 0.5);
      } else if (b.type === "crate") {
        put(this.crateBig, i, c.x, 0.5 * sc, c.z, meta.rot + wob, sc, dmgTilt);
        put(this.crateTop, i, c.x + 0.3 * sc, 1.35 * sc, c.z - 0.1 * sc, meta.top - wob, sc, -dmgTilt * 2);
        put(this.crateBand, i, c.x, 0.5 * sc, c.z, meta.rot + wob, sc, dmgTilt);
      } else {
        put(this.barrelBody, i, c.x, 0.55 * sc, c.z, meta.rot + wob, sc, dmgTilt + wob * 0.5);
        put(this.barrelBand, i * 2, c.x, 0.25 * sc, c.z, meta.rot + wob, sc, dmgTilt + wob * 0.5);
        put(this.barrelBand, i * 2 + 1, c.x, 0.85 * sc, c.z, meta.rot + wob, sc, dmgTilt + wob * 0.5);
      }
    });
    for (const im of [this.crateBig, this.crateTop, this.crateBand, this.barrelBody, this.barrelBand, this.shelfBody, this.shelfBooks]) im.instanceMatrix.needsUpdate = true;
  }

  _buildChambers(level, wallSide, wallTop, woodMat, ironMat, goldMat, stoneMat) {
    this.doorRigs = [];
    this.candleRigs = [];
    this.plateRigs = [];
    this.crushSlabs = null;
    this.coffinRigs = [];
    this.bellRigs = [];
    this.floodWater = null;
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
      } else if (lr.kind === "crypt") {
        const r = lr.room;
        const sarc = this._mat("sarc", { map: this.T.flag, color: 0xa0a4ac });
        const lidMat = this._mat("sarc-lid", { map: this.T.flag, color: 0x8a8e96 });
        const wax = this._mat("puz-wax", { color: 0xf0e4c8, emissive: 0x3a2a10 });
        const rc = tileCenter(10, 51);
        const ring = new THREE.Mesh(new THREE.RingGeometry(3.0, 3.15, 28), new THREE.MeshBasicMaterial({ color: 0x5a4a20, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(rc.x, 0.02, rc.z);
        this.scene.add(ring);
        for (const it of lr.items) {
          const g = new THREE.Group();
          const ic = tileCenter(it.tx, it.ty);
          g.position.set(ic.x, 0, ic.z);
          const body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.75, 1.75), sarc);
          body.position.y = 0.375;
          const lid = new THREE.Group();
          const slab = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.16, 1.85), lidMat);
          slab.position.y = 0.83;
          const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.4), new THREE.MeshBasicMaterial({ map: plaqueTexture(it.sym) }));
          plaque.rotation.x = -Math.PI / 2;
          plaque.position.set(0, 0.92, 0.45);
          lid.add(slab, plaque);
          const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.3, 6), wax);
          candle.position.set(0, 1.06, -0.45);
          lid.add(candle);
          const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.T.flame, color: 0xffd08a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
          flame.position.set(0, 1.32, -0.45);
          flame.scale.set(0.34, 0.5, 1);
          const halo = new THREE.Sprite(this.glowMat(0xffc060, 0.6));
          halo.position.set(0, 1.25, -0.45);
          halo.scale.set(1.5, 1.5, 1);
          lid.add(flame, halo);
          g.add(body, lid);
          this.scene.add(g);
          this.coffinRigs.push({ idx: it.i, lid, flame, halo });
        }
        this.candleGlow = new THREE.Sprite(this.glowMat(0xffa040, 0));
        this.candleGlow.position.set(((r.x0 + r.x1 + 1) / 2) * TILE, 1.2, ((r.y0 + r.y1 + 1) / 2) * TILE);
        this.candleGlow.scale.set(12, 12, 1);
        this.scene.add(this.candleGlow);
      } else if (lr.kind === "flood") {
        const r = lr.room;
        const metal = { silver: 0xd8e0ea, bronze: 0xb87a3a, iron: 0x5a5a64, bone: 0xe0d4b0 };
        for (const it of lr.items) {
          const g = new THREE.Group();
          const ic = tileCenter(it.tx, it.ty);
          g.position.set(ic.x, 0, ic.z);
          for (const sx of [-0.7, 0.7]) {
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.6, 0.14), woodMat);
            post.position.set(sx, 1.3, 0);
            g.add(post);
          }
          const beam = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.16, 0.18), woodMat);
          beam.position.y = 2.6;
          g.add(beam);
          const swing = new THREE.Group();
          swing.position.y = 2.5;
          const bm = this._mat(`bell-${it.sym}`, { color: metal[it.sym], emissive: (metal[it.sym] & 0xfefefe) >> 3 });
          const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.42, 0.62, 8, 1, true), bm);
          bell.material.side = THREE.DoubleSide;
          bell.position.y = -0.38;
          const crown = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 4), bm);
          crown.position.y = -0.08;
          const lip = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 4, 10), bm);
          lip.rotation.x = Math.PI / 2;
          lip.position.y = -0.69;
          swing.add(bell, crown, lip);
          g.add(swing);
          const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshBasicMaterial({ map: glyphTexture(it.sym, "#ffffff", "#141c22"), transparent: true }));
          sign.position.set(0, 2.6, 0.12);
          g.add(sign);
          const halo = new THREE.Sprite(this.glowMat(metal[it.sym], 0.0));
          halo.position.y = 1.9;
          halo.scale.set(1.8, 1.8, 1);
          g.add(halo);
          this.scene.add(g);
          this.bellRigs.push({ idx: it.i, swing, halo, ring: 0 });
        }
        const w = (r.x1 - r.x0 + 1) * TILE, d = (r.y1 - r.y0 + 1) * TILE;
        const water = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: 0x123a40, transparent: true, opacity: 0.62, depthWrite: false }));
        water.rotation.x = -Math.PI / 2;
        water.position.set((r.x0 + w / TILE / 2) * TILE, -0.1, (r.y0 + d / TILE / 2) * TILE);
        const sheen = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: this.T.glow, color: 0x4aa0b0, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
        sheen.rotation.x = -Math.PI / 2;
        sheen.position.copy(water.position);
        this.scene.add(water, sheen);
        this.floodWater = { water, sheen };
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
    if (level.kind === "woods" || level.kind === "courtyard") updateWoodsCourtyard(this, level, dt, t);
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
      if (lr.kind === "crypt") {
        let lit = 0;
        for (const c of this.coffinRigs) {
          const it = lr.items[c.idx];
          const on = !!(it && it.lit);
          c.flame.visible = on;
          c.halo.visible = on;
          c.lid.position.z += ((on ? 0 : 0.18) - c.lid.position.z) * Math.min(1, dt * 6);
          if (it && it.shake > 0) { it.shake = Math.max(0, it.shake - dt); c.lid.rotation.z = Math.sin(t * 50) * 0.08 * (it.shake / 0.6); } else c.lid.rotation.z = 0;
          if (on) { lit++; c.flame.scale.set(0.36 + Math.sin(t * 19 + c.idx) * 0.05, 0.52 + Math.sin(t * 23 + c.idx) * 0.08, 1); }
        }
        if (this.candleGlow) this.candleGlow.material.opacity = lit * 0.04;
      } else if (lr.kind === "flood") {
        const lvl = lr.wallInset || 0; // 0..1 water level
        if (this.floodWater) {
          const y = 0.04 + lvl * 2.0;
          this.floodWater.water.position.y = y;
          this.floodWater.sheen.position.y = y + 0.01;
          this.floodWater.water.visible = lvl > 0.005;
          this.floodWater.sheen.visible = lvl > 0.005;
          this.floodWater.sheen.material.opacity = 0.18 + Math.sin(t * 2.5) * 0.06;
        }
        for (const b of this.bellRigs) {
          const it = lr.items[b.idx];
          if (it && it.ringT > 0) { it.ringT = Math.max(0, it.ringT - dt); }
          const k = it ? (it.ringT || 0) : 0;
          b.swing.rotation.x = Math.sin(t * 14) * 0.45 * k;
          b.halo.material.opacity = it && it.pressed ? 0.55 + Math.sin(t * 4 + b.idx) * 0.1 : k * 0.6;
        }
      } else if (lr.key === "candles") {
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

  _updateGraveyard(level, player, dt, t, mode, puzzle) {
    if (this.merchantRig) {
      const m = this.merchantRig;
      m.lamp.material.opacity = 0.6 + Math.sin(t * 7) * 0.08 + Math.sin(t * 13) * 0.05;
      m.hood.rotation.z = Math.sin(t * 0.8) * 0.06;
      const near = player && level && level.merchant && Math.hypot(player.x - level.merchant.x, player.y - level.merchant.y) < 120;
      m.sign.material.opacity += ((near ? 0.45 : 0) - m.sign.material.opacity) * Math.min(1, dt * 4);
    }
    if (this.handRigs && level && level.graves) {
      for (const h of this.handRigs) {
        const gr = level.graves[h.idx];
        const k = gr ? gr.grab : 0;
        const y = -1.4 + k * 1.25 + (k > 0 ? Math.sin(t * 22 + h.idx) * 0.05 : 0);
        h.g.position.y += (y - h.g.position.y) * Math.min(1, dt * 14);
        h.g.visible = h.g.position.y > -1.3;
        h.g.rotation.y = Math.sin(t * 3 + h.idx) * 0.3;
      }
    }
    if (this.crows && this.crows.length) {
      const px = player ? player.x * S : 28, pz = player ? player.y * S : 40;
      for (const c of this.crows) {
        c.g.visible = !puzzle; // no crows inside the sealed chambers
        const a = c.ph + t * c.sp;
        const x = px + c.ox + Math.cos(a) * c.r, z = pz + c.oz - 3 + Math.sin(a) * c.r;
        c.g.position.set(x, c.h + Math.sin(t * 1.3 + c.ph) * 0.3, z);
        c.g.rotation.y = -a;
        const f = Math.sin(t * 9 + c.ph) * 0.7;
        c.wl.rotation.z = f;
        c.wr.rotation.z = -f;
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
      rig.wall.position.y = -(this.wallH || WALL_H) * 1.6 * rig.open;
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
