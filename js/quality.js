// v0.7 graphics quality: LOW / MEDIUM / HIGH, or AUTO (starts on a device guess, then steps
// down if the frame rate sags and back up once if there is plenty of headroom).
const LS_Q = "csejte_quality";

export const QUALITY_PRESETS = {
  low:  { key: "low",  label: "LOW",    res: 220, shadows: false, shadowMap: 256,  lights: 2, dust: 0.45, embers: 40,  bloom: 0, grain: 0.0, decals: 12, ca: 0 },
  med:  { key: "med",  label: "MEDIUM", res: 290, shadows: true,  shadowMap: 512,  lights: 4, dust: 0.8,  embers: 110, bloom: 1, grain: 0.035, decals: 28, ca: 0 },
  high: { key: "high", label: "HIGH",   res: 360, shadows: true,  shadowMap: 1024, lights: 6, dust: 1.0,  embers: 200, bloom: 1, grain: 0.05, decals: 48, ca: 1 }
};
export const QUALITY_ORDER = ["low", "med", "high"];

function lsGet() { try { const v = localStorage.getItem(LS_Q); return v ? JSON.parse(v) : "auto"; } catch { return "auto"; } }
function lsSet(v) { try { localStorage.setItem(LS_Q, JSON.stringify(v)); } catch {} }

function guessLevel() {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  const small = Math.min(window.innerWidth, window.innerHeight) < 500;
  if (cores <= 4 || mem <= 2) return "low";
  if (small || cores <= 6) return "med";
  return "high";
}

export class QualityManager {
  constructor() {
    const saved = lsGet();
    this.setting = ["auto", "low", "med", "high"].includes(saved) ? saved : "auto";
    this.level = this.setting === "auto" ? guessLevel() : this.setting;
    this.listeners = [];
    this.frames = 0;
    this.acc = 0;
    this.lowStreak = 0;
    this.highStreak = 0;
    this.steppedUp = false;
    this.fps = 60;
  }
  get preset() { return QUALITY_PRESETS[this.level]; }
  onChange(fn) { this.listeners.push(fn); }
  _emit() { for (const fn of this.listeners) fn(this.preset, this); }
  set(setting) {
    if (!["auto", "low", "med", "high"].includes(setting)) return;
    this.setting = setting;
    lsSet(setting);
    const lvl = setting === "auto" ? this.level : setting;
    this.lowStreak = this.highStreak = 0;
    if (lvl !== this.level) { this.level = lvl; this._emit(); } else this._emit();
  }
  cycle() {
    const order = ["auto", "low", "med", "high"];
    this.set(order[(order.indexOf(this.setting) + 1) % order.length]);
    return this.setting;
  }
  label() { return this.setting === "auto" ? `AUTO · ${this.preset.label}` : this.preset.label; }
  // Call once per rendered frame with the real frame time (seconds). Only adapts in AUTO while playing.
  sample(dt, active) {
    if (dt <= 0 || dt > 0.5) return;
    this.frames++;
    this.acc += dt;
    if (this.acc < 2.5) return;
    this.fps = this.frames / this.acc;
    this.frames = 0; this.acc = 0;
    if (this.setting !== "auto" || !active) return;
    const i = QUALITY_ORDER.indexOf(this.level);
    if (this.fps < 38) { this.lowStreak++; this.highStreak = 0; } else if (this.fps > 57) { this.highStreak++; this.lowStreak = 0; } else { this.lowStreak = 0; this.highStreak = 0; }
    if (this.lowStreak >= 2 && i > 0) { this.level = QUALITY_ORDER[i - 1]; this.lowStreak = 0; this._emit(); }
    else if (this.highStreak >= 4 && i < 2 && !this.steppedUp) { this.level = QUALITY_ORDER[i + 1]; this.highStreak = 0; this.steppedUp = true; this._emit(); }
  }
}
