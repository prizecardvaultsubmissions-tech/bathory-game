import { SoundEngine } from "./audio.js";
import { CURSE_ALERTS, TITLE_WHISPERS } from "./lore.js";
import {
  createLevel, hasLineOfSight, resolveCircleWallCollision, TILE_SIZE, Pathing, roomAt,
  MIRROR_TIERS, MIRROR_ORDER, openSecret, isPassableTile
} from "./map.js";
import { Renderer3D } from "./render3d.js";
import { AI_STATE, CountessAI } from "./enemy.js";
import { Monster, MONSTER_TYPES } from "./monsters.js";
import { WEAPONS, WEAPON_ORDER } from "./weapons.js";

const canvas = document.getElementById("game-canvas");
const renderer3d = new Renderer3D(canvas);
const sound = new SoundEngine();
const $ = (id) => document.getElementById(id);

// DOM
const hudEl = $("hud");
const hudPages = $("hud-pages");
const hudStatus = $("hud-status");
const hudHealthBar = $("hud-health-bar");
const hudHealthVal = $("hud-health-val");
const hudSanityBar = $("hud-sanity-bar");
const hudSanityVal = $("hud-sanity-val");
const hudOilBar = $("hud-oil-bar");
const hudOilVal = $("hud-oil-val");
const hudWeaponName = $("hud-weapon-name");
const hudAmmo = $("hud-ammo");
const hudMirrors = $("hud-mirrors");
const hudCoinVal = $("hud-coin-val");
const hudCoinsEl = $("hud-coins");
const promptBanner = $("prompt-banner");
const dangerVignette = $("danger-vignette");
const sanityGlitch = $("sanity-glitch");
const freezeBanner = $("freeze-banner");
const freezeTitle = $("freeze-title");
const freezeTime = $("freeze-time");
const freezeFill = $("freeze-fill");
const toastEl = $("toast");
const areaTitleEl = $("area-title");
const boonBanner = $("boon-banner");
const boonTitle = $("boon-title");
const boonSub = $("boon-sub");
const minimap = $("minimap");
const mm = minimap.getContext("2d");

const touchControls = $("touch-controls");
const joystickZone = $("joystick-zone");
const joystickKnob = $("joystick-knob");
const btnInteract = $("btn-interact");
const interactLabel = $("interact-label");
const btnDouse = $("btn-douse");
const douseState = $("douse-state");
const btnFlare = $("btn-flare");
const flareCdEl = $("flare-cd");
const btnAttack = $("btn-attack");
const btnMirror = $("btn-mirror");
const mirrorSub = $("mirror-sub");

const screenTitle = $("screen-title");
const screenWeapon = $("screen-weapon");
const screenHelp = $("screen-help");
const screenLore = $("screen-lore");
const screenDeath = $("screen-death");
const screenWin = $("screen-win");

const chkSound = $("chk-sound");
const chkCurse = $("chk-curse");
const btnMute = $("btn-mute");
const btnPause = $("btn-pause");
const btnHelpQuit = $("btn-help-quit");

const loreNum = $("lore-page-num");
const loreTitle = $("lore-title");
const loreBody = $("lore-body");
const lorePostscript = $("lore-postscript");

// State
let mode = "TITLE"; // TITLE, SELECT, PLAYING, PAUSED, LORE, DEAD, WIN
let level = null;
let pathing = null;
let countess = null;
let player = null;
let monsters = [];
let projectiles = [];
let drops = [];
let nextDropId = 1;
let fx = [];
let shake = 0;
let hurtFx = 0;
let elapsed = 0;
let flareFlash = 0;
let nearbyContext = null;
let deathEcho = loadDeathEcho();
let curseTimerId = null;
let selectedWeapon = loadWeapon();
let spawnTimer = 4;
let wellTimer = 32;
let boonTimer = 0;
let kills = 0;
let mirrorsUsed = 0;
let lastRoomKey = null;
let toastTimer = 0;
let mmTimer = 0;
let attackHeld = false;
let warnedCountessImmune = false;
let freezeTier = null;
let burnFxTimer = 0;
let mmBase = null;

const hourNow = new Date().getHours();
const isWitchingHour = hourNow >= 0 && hourNow < 3;

const keys = {};
const joy = { active: false, pointerId: null, originX: 0, originY: 0, dx: 0, dy: 0 };

function loadDeathEcho() {
  try { const raw = localStorage.getItem("csejte_death_echo"); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function saveDeathEcho(x, y) {
  try { const echo = { x, y }; localStorage.setItem("csejte_death_echo", JSON.stringify(echo)); deathEcho = echo; } catch {}
}
function clearDeathEcho() {
  try { localStorage.removeItem("csejte_death_echo"); } catch {}
  deathEcho = null;
}
function loadWeapon() {
  try { const w = localStorage.getItem("csejte_weapon"); return WEAPONS[w] ? w : "dagger"; } catch { return "dagger"; }
}

window.addEventListener("resize", () => renderer3d.resize());

(function initTitleFlavor() {
  $("title-whisper").textContent = TITLE_WHISPERS[Math.floor(Math.random() * TITLE_WHISPERS.length)];
  if (isWitchingHour) $("witching-badge").classList.remove("hidden");
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
})();

function scheduleOptInCurseWhisper() {
  if (curseTimerId) clearTimeout(curseTimerId);
  if (!chkCurse.checked) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  curseTimerId = setTimeout(() => {
    const msg = CURSE_ALERTS[Math.floor(Math.random() * CURSE_ALERTS.length)];
    try { new Notification("Csejte: Blood Ledger", { body: msg, icon: "./icons/icon-192.png", silent: true }); } catch {}
  }, 45000);
}

chkCurse.addEventListener("change", async () => {
  if (!chkCurse.checked) { if (curseTimerId) clearTimeout(curseTimerId); return; }
  if (!("Notification" in window)) { chkCurse.checked = false; return; }
  if (Notification.permission === "default") {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { chkCurse.checked = false; return; }
  } else if (Notification.permission === "denied") { chkCurse.checked = false; return; }
  scheduleOptInCurseWhisper();
});

function setSoundEnabled(val) {
  sound.setEnabled(val);
  chkSound.checked = val;
  btnMute.textContent = val ? "🔊" : "🔇";
}
chkSound.addEventListener("change", () => setSoundEnabled(chkSound.checked));
btnMute.addEventListener("click", () => { sound.init(); setSoundEnabled(!sound.enabled); });

// ---------------------------------------------------------------- weapon select
const WEAPON_ICONS = {
  dagger: `<svg viewBox="0 0 16 16" class="weapon-icon"><rect x="7" y="1" width="2" height="9" fill="#e4eef8"/><rect x="8" y="1" width="1" height="9" fill="#9aa7b4"/><rect x="4" y="10" width="8" height="1.6" fill="#e7c873"/><rect x="7" y="11.5" width="2" height="3" fill="#6a3b1f"/><rect x="6.5" y="14.4" width="3" height="1.2" fill="#e7c873"/></svg>`,
  mace: `<svg viewBox="0 0 16 16" class="weapon-icon"><rect x="7.2" y="6" width="1.6" height="9" fill="#6a3b1f"/><circle cx="8" cy="4.5" r="3.2" fill="#8a8f99"/><circle cx="7" cy="3.6" r="1.1" fill="#c9ced6"/><path d="M8 0.2 L9 2 L7 2Z M8 8.8 L9 7 L7 7Z M3.7 4.5 L5.5 3.5 L5.5 5.5Z M12.3 4.5 L10.5 3.5 L10.5 5.5Z" fill="#c9ced6"/><rect x="6.6" y="8.2" width="2.8" height="1" fill="#e7c873"/></svg>`,
  crossbow: `<svg viewBox="0 0 16 16" class="weapon-icon"><path d="M1.5 5 Q8 1 14.5 5" stroke="#8a5a2b" stroke-width="1.6" fill="none"/><line x1="1.8" y1="5.2" x2="8" y2="9.5" stroke="#d9d2c0" stroke-width="0.6"/><line x1="14.2" y1="5.2" x2="8" y2="9.5" stroke="#d9d2c0" stroke-width="0.6"/><rect x="7.2" y="3" width="1.6" height="12" fill="#6a3b1f"/><rect x="7.6" y="0.6" width="0.8" height="7" fill="#e4eef8"/><path d="M8 0 L9 1.6 L7 1.6Z" fill="#e4eef8"/></svg>`,
  staff: `<svg viewBox="0 0 16 16" class="weapon-icon"><rect x="7.3" y="5" width="1.4" height="11" fill="#6a3b1f"/><rect x="6.8" y="5" width="2.4" height="1.4" fill="#3a2a1a"/><path d="M8 0.3 Q11 3 9.6 5 L6.4 5 Q5 3 8 0.3Z" fill="#ff8a1f"/><path d="M8 2 Q9.4 3.6 8.8 5 L7.2 5 Q6.6 3.6 8 2Z" fill="#ffe08a"/></svg>`
};

const weaponGrid = $("weapon-grid");
const weaponBlurb = $("weapon-blurb");
const btnBegin = $("btn-begin");

function pips(n) {
  let s = "";
  for (let i = 0; i < 5; i++) s += `<span class="pip${i < n ? " on" : ""}"></span>`;
  return `<span class="pips">${s}</span>`;
}

function buildWeaponGrid() {
  weaponGrid.innerHTML = WEAPON_ORDER.map((id) => {
    const w = WEAPONS[id];
    return `<button class="weapon-option" type="button" data-weapon="${id}" aria-label="${w.name}">
      <div class="weapon-top">${WEAPON_ICONS[id]}<div><div class="weapon-name">${w.name}</div><div class="weapon-special">${w.special}</div></div></div>
      <div class="stat-row"><span>POWER</span>${pips(w.bars.power)}</div>
      <div class="stat-row"><span>SPEED</span>${pips(w.bars.speed)}</div>
      <div class="stat-row"><span>REACH</span>${pips(w.bars.reach)}</div>
      <div class="stat-row"><span>CONTROL</span>${pips(w.bars.control)}</div>
    </button>`;
  }).join("");
  weaponGrid.querySelectorAll(".weapon-option").forEach((el) => {
    el.addEventListener("click", () => { sound.init(); selectWeapon(el.dataset.weapon); sound.playSwing(WEAPONS[el.dataset.weapon].kind === "ranged" ? "crossbow" : el.dataset.weapon); });
  });
  selectWeapon(selectedWeapon);
}

function selectWeapon(id) {
  selectedWeapon = id;
  try { localStorage.setItem("csejte_weapon", id); } catch {}
  weaponGrid.querySelectorAll(".weapon-option").forEach((el) => el.classList.toggle("selected", el.dataset.weapon === id));
  weaponBlurb.textContent = WEAPONS[id].blurb;
  btnBegin.textContent = `ENTER WITH THE ${WEAPONS[id].name.toUpperCase()}`;
  renderer3d.setWeapon(id);
}

function showWeaponSelect() {
  sound.init();
  mode = "SELECT";
  hideAllScreens();
  hudEl.classList.add("hidden");
  touchControls.classList.add("hidden");
  screenWeapon.classList.remove("hidden");
}

// ---------------------------------------------------------------- run setup
function startNewRun() {
  sound.init();
  setSoundEnabled(chkSound.checked);
  level = createLevel();
  pathing = new Pathing(level);
  renderer3d.setLevel(level);
  renderer3d.setWeapon(selectedWeapon);
  const w = WEAPONS[selectedWeapon];
  player = {
    x: level.playerSpawn.x, y: level.playerSpawn.y, radius: 11, angle: -Math.PI / 2, speed: 122,
    lanternOn: true, oil: 100, sanity: 100, health: 100, hidden: false, hideSpot: null,
    pagesFound: 0, flareCooldown: 0, inBrazier: false,
    weapon: selectedWeapon, ammo: w.kind === "ranged" ? w.ammo : Infinity,
    attackCd: 0, attackAnim: 0, hurtAnim: 0, invuln: 0,
    mirrors: { cracked: 0, silver: 0, gilded: 0, obsidian: 0 },
    coins: 0, speedBoost: 0, darkCurse: 0
  };
  countess = new CountessAI(level.countessSpawn, level.waypoints, isWitchingHour, pathing);
  monsters = [];
  projectiles = [];
  drops = [];
  fx = [];
  shake = 0; hurtFx = 0; elapsed = 0; flareFlash = 0; kills = 0; mirrorsUsed = 0;
  spawnTimer = 4; wellTimer = 32; boonTimer = 0; nearbyContext = null; lastRoomKey = null; freezeTier = null;
  warnedCountessImmune = false;
  buildMinimapBase();

  hideAllScreens();
  hudEl.classList.remove("hidden");
  touchControls.classList.remove("hidden");
  mode = "PLAYING";
  renderMirrorHud(true);
  updateHud();
  scheduleOptInCurseWhisper();
}

function hideAllScreens() {
  for (const s of [screenTitle, screenWeapon, screenHelp, screenLore, screenDeath, screenWin]) s.classList.add("hidden");
  freezeBanner.classList.add("hidden");
  toastEl.classList.add("hidden");
  if (boonBanner) boonBanner.classList.add("hidden");
}

function showTitle() {
  mode = "TITLE";
  hideAllScreens();
  hudEl.classList.add("hidden");
  touchControls.classList.add("hidden");
  promptBanner.classList.add("hidden");
  dangerVignette.style.opacity = "0";
  sanityGlitch.style.opacity = "0";
  screenTitle.classList.remove("hidden");
}

$("btn-start").addEventListener("click", showWeaponSelect);
btnBegin.addEventListener("click", startNewRun);
$("btn-weapon-back").addEventListener("click", showTitle);
$("btn-how").addEventListener("click", () => {
  sound.init();
  btnHelpQuit.classList.add("hidden");
  screenHelp.classList.remove("hidden");
});
btnPause.addEventListener("click", () => {
  if (mode !== "PLAYING") return;
  mode = "PAUSED";
  btnHelpQuit.classList.remove("hidden");
  screenHelp.classList.remove("hidden");
});
$("btn-help-close").addEventListener("click", () => {
  screenHelp.classList.add("hidden");
  if (mode === "PAUSED") mode = "PLAYING";
});
btnHelpQuit.addEventListener("click", showTitle);
$("btn-lore-close").addEventListener("click", () => { screenLore.classList.add("hidden"); mode = "PLAYING"; });
$("btn-retry").addEventListener("click", startNewRun);
$("btn-death-weapon").addEventListener("click", showWeaponSelect);
$("btn-death-title").addEventListener("click", showTitle);
$("btn-play-again").addEventListener("click", showWeaponSelect);
$("btn-win-title").addEventListener("click", showTitle);

// ---------------------------------------------------------------- toasts
function toast(msg, secs = 2.4) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  toastTimer = secs;
}
function showAreaTitle(name) {
  areaTitleEl.textContent = name.toUpperCase();
  areaTitleEl.classList.remove("hidden");
  areaTitleEl.style.animation = "none";
  void areaTitleEl.offsetWidth;
  areaTitleEl.style.animation = "";
}

// ---------------------------------------------------------------- actions
function toggleDouse() {
  if (mode !== "PLAYING" || !player) return;
  sound.init();
  if (!player.lanternOn && player.oil <= 1) return;
  player.lanternOn = !player.lanternOn;
  sound.playDouse(player.lanternOn);
  updateHud();
}

function triggerFlare() {
  if (mode !== "PLAYING" || !player) return;
  sound.init();
  if (player.flareCooldown > 0 || player.oil < 20 || player.hidden) return;
  player.oil = Math.max(0, player.oil - 20);
  player.flareCooldown = 8;
  flareFlash = 1.0;
  sound.playFlare();
  const d = Math.hypot(countess.x - player.x, countess.y - player.y);
  if (!countess.frozen) {
    if (d < 175 && hasLineOfSight(level, player.x, player.y, countess.x, countess.y)) countess.stun(1.7);
    else if (d < 340) countess.alertAt(player.x, player.y);
  }
  // Flares scorch nearby servants too
  for (const m of monsters) {
    if (m.dead) continue;
    if (Math.hypot(m.x - player.x, m.y - player.y) < 150) { m.hit(8, player.x, player.y, 90, 1.5); fx.push({ type: "burn", x: m.x, y: m.y }); }
  }
  updateHud();
}

function triggerInteract() {
  if (mode !== "PLAYING" || !player) return;
  sound.init();
  if (player.hidden) {
    player.hidden = false;
    player.hideSpot = null;
    sound.playDouse(false);
    updateHud();
    return;
  }
  if (!nearbyContext) return;
  if (nearbyContext.type === "page") {
    const p = nearbyContext.obj;
    p.collected = true;
    player.pagesFound += 1;
    player.sanity = Math.min(100, player.sanity + 12);
    sound.playPage();
    fx.push({ type: "pickup", x: p.x, y: p.y, color: 0xe7c873 });
    loreNum.textContent = p.lore.num;
    loreTitle.textContent = p.lore.title;
    loreBody.textContent = p.lore.body;
    if (p.lore.witchingPostscript && isWitchingHour) {
      lorePostscript.textContent = p.lore.witchingPostscript;
      lorePostscript.classList.remove("hidden");
    } else lorePostscript.classList.add("hidden");
    mode = "LORE";
    screenLore.classList.remove("hidden");
    if (player.pagesFound >= 5) toast("All five seals broken — the North Gate is open!", 4);
    updateHud();
  } else if (nearbyContext.type === "alcove") {
    player.hidden = true;
    player.hideSpot = nearbyContext.obj;
    player.x = nearbyContext.obj.x;
    player.y = nearbyContext.obj.y;
    player.lanternOn = false;
    sound.playDouse(false);
    updateHud();
  } else if (nearbyContext.type === "exit") {
    if (player.pagesFound >= 5) handleWin();
  } else if (nearbyContext.type === "well") {
    tossWell();
  } else if (nearbyContext.type === "secret") {
    triggerSecret(nearbyContext.obj);
  }
}

const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

function nearestMonster(range, needLos = true) {
  let best = null, bd = range;
  for (const m of monsters) {
    if (m.dead || m.state === "RISE") continue;
    const d = Math.hypot(m.x - player.x, m.y - player.y);
    if (d < bd && (!needLos || hasLineOfSight(level, player.x, player.y, m.x, m.y))) { bd = d; best = m; }
  }
  return best;
}

function tryAttack() {
  if (mode !== "PLAYING" || !player || player.hidden) return;
  if (player.attackCd > 0) return;
  sound.init();
  const w = WEAPONS[player.weapon];
  const ranged = w.kind === "ranged" && player.ammo > 0;

  // Auto-aim at the nearest servant (or face the Countess if she's the only threat in reach).
  const aimRange = ranged ? w.range : (w.reach + 46);
  const target = nearestMonster(aimRange);
  const dC = Math.hypot(countess.x - player.x, countess.y - player.y);
  if (target) player.angle = Math.atan2(target.y - player.y, target.x - player.x);
  else if (dC < (ranged ? w.range : w.reach + 30) && hasLineOfSight(level, player.x, player.y, countess.x, countess.y)) {
    player.angle = Math.atan2(countess.y - player.y, countess.x - player.x);
  }

  player.attackAnim = 1;
  if (ranged) {
    player.ammo -= 1;
    player.attackCd = w.cooldown;
    const vx = Math.cos(player.angle) * w.boltSpeed, vy = Math.sin(player.angle) * w.boltSpeed;
    projectiles.push({ x: player.x + Math.cos(player.angle) * 16, y: player.y + Math.sin(player.angle) * 16, vx, vy, life: w.range / w.boltSpeed });
    sound.playSwing("crossbow");
    shake = Math.max(shake, 0.15);
    return;
  }

  // Melee (or crossbow bash when out of bolts)
  const reach = w.kind === "ranged" ? w.bashReach : w.reach;
  const arc = w.kind === "ranged" ? 1.8 : w.arc;
  const dmg = w.kind === "ranged" ? w.bashDmg : w.dmg;
  const knock = w.kind === "ranged" ? 50 : w.knock;
  player.attackCd = w.kind === "ranged" ? 0.6 : w.cooldown;
  sound.playSwing(player.weapon);
  fx.push({ type: "slash", x: player.x, y: player.y, angle: player.angle, reach, arc, color: player.weapon === "staff" ? 0xffa040 : 0xe4eef8 });

  let hitAny = false;
  for (const m of monsters) {
    if (m.dead || m.state === "RISE") continue;
    const d = Math.hypot(m.x - player.x, m.y - player.y);
    if (d > reach + m.radius) continue;
    const a = Math.atan2(m.y - player.y, m.x - player.x);
    if (Math.abs(angDiff(a, player.angle)) > arc / 2 && d > m.radius + player.radius + 4) continue;
    if (m.hit(dmg, player.x, player.y, knock, w.burn || 0)) {
      hitAny = true;
      fx.push({ type: "spark", x: m.x, y: m.y, n: 10, color: w.burn ? 0xffa040 : 0xfff0c0 });
      fx.push({ type: "blood", x: m.x, y: m.y });
      if (w.burn) fx.push({ type: "burn", x: m.x, y: m.y });
      if (m.dead) onMonsterKilled(m);
    }
  }
  if (hitAny) {
    sound.playHit(player.weapon === "mace");
    shake = Math.max(shake, player.weapon === "mace" ? 0.7 : 0.35);
  }

  // The Countess cannot be wounded — only made to recoil.
  if (!countess.frozen && dC < reach + 18) {
    const a = Math.atan2(countess.y - player.y, countess.x - player.x);
    if (Math.abs(angDiff(a, player.angle)) < arc / 2 + 0.3) {
      countess.stagger(w.stagger);
      sound.playClang();
      fx.push({ type: "spark", x: countess.x, y: countess.y, h: 1.6, n: 14, color: 0xe7c873 });
      shake = Math.max(shake, 0.45);
      if (!warnedCountessImmune) { warnedCountessImmune = true; toast("Your blow glances off her — she can't be harmed. RUN or use a MIRROR!", 3.2); }
    }
  }
}

function onMonsterKilled(m, forcedKind = null, opts = {}) {
  kills += 1;
  sound.playMonsterDie();
  fx.push({ type: "dissolve", x: m.x, y: m.y, color: m.kind === "maiden" ? 0xd8b0c0 : m.kind === "bats" ? 0x5a3a5a : 0x9fb28a });
  const kind = forcedKind || rollDropKind(m);
  if (kind && kind !== "nothing") {
    const extra = { ...opts };
    if (kind === "mirror" && !extra.tier) extra.tier = rollMirrorTier(m.kind === "ghoul" || m.kind === "dweller");
    if (kind === "coins" && !extra.amount) extra.amount = m.kind === "dweller" ? 16 + Math.floor(Math.random() * 10) : m.kind === "ghoul" ? 12 + Math.floor(Math.random() * 9) : 6 + Math.floor(Math.random() * 8);
    if (kind === "sanity" && !extra.amount) extra.amount = 24;
    spawnDrop(kind, m.x, m.y, extra);
  }
}

const DROP_TABLE = {
  default: { nothing: 0.40, sanity: 0.25, coins: 0.23, mirror: 0.12 },
  ghoul:   { nothing: 0.30, sanity: 0.26, coins: 0.26, mirror: 0.18 },
  dweller: { nothing: 0.20, sanity: 0.25, coins: 0.30, mirror: 0.25 }
};

function rollDropKind(m) {
  const table = (m && DROP_TABLE[m.kind]) ? DROP_TABLE[m.kind] : DROP_TABLE.default;
  const r = Math.random();
  let acc = 0;
  for (const k of ["nothing", "sanity", "coins", "mirror"]) {
    acc += table[k];
    if (r < acc) return k;
  }
  return "nothing";
}

function rollMirrorTier(lucky = false) {
  const r = Math.random();
  if (lucky) {
    if (r < 0.60) return "cracked";
    if (r < 0.86) return "silver";
    if (r < 0.97) return "gilded";
    return "obsidian";
  }
  if (r < 0.70) return "cracked";
  if (r < 0.92) return "silver";
  if (r < 0.99) return "gilded";
  return "obsidian";
}

function spawnDrop(kind, x, y, opts = {}) {
  if (!kind || kind === "nothing") return null;
  const ang = Math.random() * Math.PI * 2;
  const spd = 55 + Math.random() * 45;
  const d = {
    id: nextDropId++,
    kind,
    tier: opts.tier || (kind === "mirror" ? "cracked" : null),
    amount: opts.amount || (kind === "coins" ? 8 : kind === "sanity" ? 24 : 0),
    x, y,
    vx: Math.cos(ang) * spd,
    vy: Math.sin(ang) * spd,
    h: 0.95,
    vh: 4.4 + Math.random() * 1.1,
    life: 20,
    collected: false,
    remove: false
  };
  drops.push(d);
  return d;
}

function collectDrop(d) {
  if (!d || d.collected || d.remove) return;
  d.collected = true;
  d.remove = true;
  sound.playPickup();
  if (d.kind === "sanity") {
    player.sanity = Math.min(100, player.sanity + d.amount);
    fx.push({ type: "heal", x: player.x, y: player.y });
    toast(`Sanity vial — +${d.amount} sanity`, 2.2);
  } else if (d.kind === "coins") {
    player.coins += d.amount;
    fx.push({ type: "pickup", x: d.x, y: d.y, color: 0xe7c873 });
    toast(`Coin pouch — +${d.amount} coins`, 2.2);
    if (hudCoinsEl) { hudCoinsEl.classList.remove("bump"); void hudCoinsEl.offsetWidth; hudCoinsEl.classList.add("bump"); }
  } else if (d.kind === "mirror") {
    const tier = d.tier || "cracked";
    player.mirrors[tier] += 1;
    const T = MIRROR_TIERS[tier];
    fx.push({ type: "pickup", x: d.x, y: d.y, color: T.color });
    toast(`${T.name} dropped (${T.secs}s freeze)`, 2.6);
    renderMirrorHud(false, tier);
  }
}

function updateDrops(dt) {
  for (const d of drops) {
    if (d.collected || d.remove) continue;
    d.life -= dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    const damp = Math.exp(-dt * 3.2);
    d.vx *= damp;
    d.vy *= damp;
    resolveCircleWallCollision(level, d, 8, false);
    d.vh -= 16 * dt;
    d.h += d.vh * dt;
    if (d.h < 0.16) {
      d.h = 0.16;
      if (d.vh < 0) d.vh *= -0.48;
      if (Math.abs(d.vh) < 0.7) d.vh = 0;
    }
    if (d.life <= 0) { d.remove = true; continue; }
    if (!player.hidden && Math.hypot(d.x - player.x, d.y - player.y) < 30) collectDrop(d);
  }
  drops = drops.filter((d) => !d.remove);
}

function bestMirror() {
  for (const k of MIRROR_ORDER) if (player.mirrors[k] > 0) return k;
  return null;
}

function useMirror(auto = false) {
  if (mode !== "PLAYING" || !player) return false;
  sound.init();
  if (countess.frozen) { if (!auto) toast("She is already held in the glass."); return false; }
  const tier = bestMirror();
  if (!tier) { if (!auto) toast("You carry no mirrors. Search the castle for them."); return false; }
  const d = Math.hypot(countess.x - player.x, countess.y - player.y);
  const sees = hasLineOfSight(level, player.x, player.y, countess.x, countess.y);
  if (!auto && !(d < TILE_SIZE * 7 || (sees && d < TILE_SIZE * 11))) {
    toast("Nothing to reflect — she's too far away.");
    return false;
  }
  const T = MIRROR_TIERS[tier];
  player.mirrors[tier] -= 1;
  mirrorsUsed += 1;
  freezeTier = tier;
  countess.freeze(T.secs);
  sound.playMirror(tier);
  fx.push({ type: "shatter", x: countess.x, y: countess.y, color: T.color });
  fx.push({ type: "spark", x: player.x, y: player.y, h: 1.2, n: 12, color: T.color });
  shake = Math.max(shake, 0.6);
  if (T.repel) {
    for (const m of monsters) {
      if (!m.dead && Math.hypot(m.x - player.x, m.y - player.y) < 260) {
        m.repel(player.x, player.y, 3);
        fx.push({ type: "spark", x: m.x, y: m.y, n: 8, color: T.color });
        if (m.dead) onMonsterKilled(m);
      }
    }
  }
  if (auto) {
    // Shove yourself free of her grasp
    const a = Math.atan2(player.y - countess.y, player.x - countess.x);
    player.x += Math.cos(a) * 18;
    player.y += Math.sin(a) * 18;
    resolveCircleWallCollision(level, player, player.radius, player.pagesFound >= 5);
    toast(`Her hand closed — your ${T.name} shattered! RUN!`, 3);
  } else {
    toast(`${T.name}: frozen for ${T.secs}s`, 2.2);
  }
  renderMirrorHud(false, tier);
  return true;
}

btnDouse.addEventListener("click", toggleDouse);
btnFlare.addEventListener("click", triggerFlare);
btnInteract.addEventListener("click", triggerInteract);
btnMirror.addEventListener("click", () => useMirror(false));

// Hold-to-attack
btnAttack.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  attackHeld = true;
  btnAttack.classList.add("pressed");
  tryAttack();
});
const releaseAttack = () => { attackHeld = false; btnAttack.classList.remove("pressed"); };
btnAttack.addEventListener("pointerup", releaseAttack);
btnAttack.addEventListener("pointercancel", releaseAttack);
btnAttack.addEventListener("pointerleave", releaseAttack);
btnAttack.addEventListener("contextmenu", (e) => e.preventDefault());

window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (keys[k]) return; // ignore auto-repeat for actions
  keys[k] = true;
  if (k === "f") toggleDouse();
  if (k === "q") triggerFlare();
  if (k === "r") useMirror(false);
  if (k === "e") triggerInteract();
  if (k === " " || k === "j") {
    if (mode === "PLAYING") e.preventDefault();
    attackHeld = true;
    tryAttack();
  }
  if (k === "escape" && mode === "PLAYING") btnPause.click();
});
window.addEventListener("keyup", (e) => {
  const k = e.key.toLowerCase();
  keys[k] = false;
  if (k === " " || k === "j") attackHeld = false;
});

// Joystick
function updateJoystickFromPoint(clientX, clientY) {
  const maxR = 42;
  let vx = clientX - joy.originX, vy = clientY - joy.originY;
  const dist = Math.hypot(vx, vy);
  if (dist > maxR) { vx = (vx / dist) * maxR; vy = (vy / dist) * maxR; }
  joy.dx = vx / maxR;
  joy.dy = vy / maxR;
  joystickKnob.style.transform = `translate(${vx}px, ${vy}px)`;
}
joystickZone.addEventListener("pointerdown", (e) => {
  sound.init();
  e.preventDefault();
  const rect = $("joystick-base").getBoundingClientRect();
  joy.active = true;
  joy.pointerId = e.pointerId;
  joy.originX = rect.left + rect.width / 2;
  joy.originY = rect.top + rect.height / 2;
  joystickZone.setPointerCapture(e.pointerId);
  updateJoystickFromPoint(e.clientX, e.clientY);
});
joystickZone.addEventListener("pointermove", (e) => {
  if (!joy.active || e.pointerId !== joy.pointerId) return;
  updateJoystickFromPoint(e.clientX, e.clientY);
});
function releaseJoystick(e) {
  if (!joy.active || e.pointerId !== joy.pointerId) return;
  joy.active = false; joy.pointerId = null; joy.dx = 0; joy.dy = 0;
  joystickKnob.style.transform = "translate(0px, 0px)";
}
joystickZone.addEventListener("pointerup", releaseJoystick);
joystickZone.addEventListener("pointercancel", releaseJoystick);

function formatTime(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function endRunUi() {
  hudEl.classList.add("hidden");
  touchControls.classList.add("hidden");
  promptBanner.classList.add("hidden");
  freezeBanner.classList.add("hidden");
  toastEl.classList.add("hidden");
  attackHeld = false;
}

function handleDeath(reason) {
  if (mode !== "PLAYING") return;
  mode = "DEAD";
  sound.playDeath();
  saveDeathEcho(player.x, player.y);
  endRunUi();
  $("death-reason").textContent = reason;
  $("death-pages").textContent = `${player.pagesFound} / 5`;
  $("death-time").textContent = formatTime(elapsed);
  $("death-kills").textContent = String(kills);
  $("death-mirrors").textContent = String(mirrorsUsed);
  const deathCoins = $("death-coins"); if (deathCoins) deathCoins.textContent = String(player.coins);
  screenDeath.classList.remove("hidden");
}

function handleWin() {
  if (mode !== "PLAYING") return;
  mode = "WIN";
  sound.playWin();
  clearDeathEcho();
  endRunUi();
  $("win-time").textContent = formatTime(elapsed);
  $("win-sanity").textContent = `${Math.max(1, Math.round(player.sanity))}%`;
  $("win-kills").textContent = String(kills);
  $("win-weapon").textContent = WEAPONS[player.weapon].name;
  const winCoins = $("win-coins"); if (winCoins) winCoins.textContent = String(player.coins);
  screenWin.classList.remove("hidden");
}

// ---------------------------------------------------------------- HUD
const mirrorChipEls = {};
function renderMirrorHud(rebuild = false, bumpTier = null) {
  if (rebuild || !hudMirrors.children.length) {
    hudMirrors.innerHTML = "";
    for (const k of MIRROR_ORDER.slice().reverse()) {
      const T = MIRROR_TIERS[k];
      const el = document.createElement("span");
      el.className = "mirror-chip";
      el.style.color = T.css;
      el.style.borderColor = T.css + "66";
      el.title = `${T.name} — freezes ${T.secs}s`;
      hudMirrors.appendChild(el);
      mirrorChipEls[k] = el;
    }
  }
  if (!player) return;
  for (const k of MIRROR_ORDER) {
    const el = mirrorChipEls[k];
    const n = player.mirrors[k];
    el.textContent = `${MIRROR_TIERS[k].glyph}${n}`;
    el.classList.toggle("empty", n === 0);
    if (bumpTier === k) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
  }
  const best = bestMirror();
  if (best) {
    const T = MIRROR_TIERS[best];
    mirrorSub.textContent = `${T.secs}S`;
    mirrorSub.style.color = T.css;
    btnMirror.classList.add("has");
    btnMirror.classList.remove("empty");
  } else {
    mirrorSub.textContent = "NONE";
    mirrorSub.style.color = "";
    btnMirror.classList.remove("has");
    btnMirror.classList.add("empty");
  }
}

function updateHud() {
  if (!player || !countess) return;
  hudPages.textContent = `${player.pagesFound} / 5`;
  if (hudCoinVal) hudCoinVal.textContent = String(player.coins | 0);
  const hp = Math.max(0, Math.min(100, player.health));
  const sanityPct = Math.max(0, Math.min(100, player.sanity));
  const oilPct = Math.max(0, Math.min(100, player.oil));
  hudHealthBar.style.width = `${hp}%`;
  hudHealthVal.textContent = `${Math.ceil(hp)}`;
  hudSanityBar.style.width = `${sanityPct}%`;
  hudSanityVal.textContent = `${Math.round(sanityPct)}%`;
  hudOilBar.style.width = `${oilPct}%`;
  hudOilVal.textContent = `${Math.round(oilPct)}%`;

  const w = WEAPONS[player.weapon];
  hudWeaponName.textContent = w.name.split(" ").slice(-1)[0].toUpperCase();
  hudAmmo.textContent = w.kind === "ranged" ? `${player.ammo}` : "";

  hudStatus.className = "hud-pill status-pill";
  if (player.hidden) { hudStatus.textContent = "HIDDEN"; hudStatus.classList.add("hidden-state"); }
  else if (player.darkCurse > 0) { hudStatus.textContent = "CURSED"; hudStatus.classList.add("hunted"); }
  else if (player.speedBoost > 0) { hudStatus.textContent = "SWIFT"; hudStatus.classList.add("unseen"); }
  else if (countess.frozen) { hudStatus.textContent = "FROZEN"; hudStatus.classList.add("unseen"); }
  else if (countess.state === AI_STATE.HUNT) { hudStatus.textContent = "HUNTED"; hudStatus.classList.add("hunted"); }
  else if (countess.state === AI_STATE.INVESTIGATE || countess.state === AI_STATE.SEARCH) { hudStatus.textContent = "SEEKING"; hudStatus.classList.add("investigate"); }
  else { hudStatus.textContent = "UNSEEN"; hudStatus.classList.add("unseen"); }

  douseState.textContent = player.lanternOn ? "LIT" : "DARK";
  if (player.flareCooldown > 0) { flareCdEl.textContent = `${Math.ceil(player.flareCooldown)}S`; btnFlare.classList.add("disabled"); }
  else if (player.oil < 20 || player.hidden) { flareCdEl.textContent = "LOW OIL"; btnFlare.classList.add("disabled"); }
  else { flareCdEl.textContent = "READY"; btnFlare.classList.remove("disabled"); }

  btnAttack.classList.toggle("cooldown", player.attackCd > 0.05 || player.hidden);

  if (player.hidden) { interactLabel.textContent = "EXIT"; btnInteract.classList.add("ready-glow"); }
  else if (nearbyContext) {
    btnInteract.classList.add("ready-glow");
    if (nearbyContext.type === "page") interactLabel.textContent = "READ";
    else if (nearbyContext.type === "alcove") interactLabel.textContent = "HIDE";
    else if (nearbyContext.type === "well") interactLabel.textContent = "TOSS";
    else if (nearbyContext.type === "secret") interactLabel.textContent = "SEARCH";
    else if (nearbyContext.type === "exit") interactLabel.textContent = player.pagesFound >= 5 ? "ESCAPE" : "SEALED";
  } else { interactLabel.textContent = "SEARCH"; btnInteract.classList.remove("ready-glow"); }

  // Freeze countdown
  if (countess.frozen) {
    const T = MIRROR_TIERS[freezeTier] || MIRROR_TIERS.silver;
    freezeBanner.classList.remove("hidden");
    freezeTitle.textContent = `FROZEN · ${T.name.toUpperCase()}`;
    freezeTitle.style.color = T.css;
    freezeTime.textContent = countess.freezeTimer.toFixed(1);
    freezeFill.style.width = `${(countess.freezeTimer / countess.freezeTotal) * 100}%`;
    freezeBanner.style.borderColor = countess.freezeTimer < 1.5 ? "" : T.css;
    freezeBanner.classList.toggle("ending", countess.freezeTimer < 1.5);
  } else {
    freezeBanner.classList.add("hidden");
  }
}

// ---------------------------------------------------------------- minimap
const ROOM_COLORS = { ward: "#3b3540", chapel: "#38324a", kitchens: "#4a3a2a", hall: "#4a2a30", torture: "#4a1a20", north: "#3a3a44" };
function buildMinimapBase() {
  const c = document.createElement("canvas");
  c.width = level.cols; c.height = level.rows;
  const g = c.getContext("2d");
  g.fillStyle = "#08050a";
  g.fillRect(0, 0, c.width, c.height);
  for (let y = 0; y < level.rows; y++) {
    for (let x = 0; x < level.cols; x++) {
      const v = level.grid[y][x];
      if (v === 1) continue;
      const r = roomAt(level, x, y);
      g.fillStyle = v === 2 ? "#8b0018" : v === 3 ? "#2a2228" : r ? ROOM_COLORS[r.key] : "#2e2a30";
      g.fillRect(x, y, 1, 1);
    }
  }
  mmBase = c;
}

function drawMinimap() {
  if (!mmBase) return;
  mm.imageSmoothingEnabled = false;
  mm.drawImage(mmBase, 0, 0);
  const t = performance.now() / 1000;
  // mirrors (faint)
  for (const m of level.mirrors) {
    if (m.collected) continue;
    mm.fillStyle = MIRROR_TIERS[m.tier].css;
    mm.globalAlpha = 0.55;
    mm.fillRect(m.tx, m.ty, 1, 1);
  }
  mm.globalAlpha = 1;
  // pages
  mm.fillStyle = Math.sin(t * 5) > 0 ? "#ffd86a" : "#c9a24d";
  for (const p of level.pages) if (!p.collected) mm.fillRect(p.tx - 0.5, p.ty - 0.5, 2, 2);
  // gate
  mm.fillStyle = player.pagesFound >= 5 ? "#7dff9a" : "#d41c3b";
  mm.fillRect(level.exitTile.tx - 1, level.exitTile.ty, 3, 1);
  // Countess only when she's hunting you or frozen
  if (countess.state === AI_STATE.HUNT || countess.frozen) {
    mm.fillStyle = countess.frozen ? "#bfe0ff" : "#ff2040";
    mm.fillRect(Math.floor(countess.x / TILE_SIZE) - 0.5, Math.floor(countess.y / TILE_SIZE) - 0.5, 2, 2);
  }
  // opened secret passages
  mm.fillStyle = "#c9e4a0";
  for (const d of level.secrets) {
    if (!d.opened) continue;
    for (const [tx, ty] of d.tiles) mm.fillRect(tx, ty, 1, 1);
  }
  // well
  if (level.well) {
    mm.fillStyle = "#6a88aa";
    mm.fillRect(level.well.tx, level.well.ty, 1, 1);
  }
  // player
  mm.fillStyle = "#ffffff";
  mm.fillRect(Math.floor(player.x / TILE_SIZE) - 0.5, Math.floor(player.y / TILE_SIZE) - 0.5, 2, 2);
}

// ---------------------------------------------------------------- spawning
function pickMonsterType() {
  const r = Math.random();
  if (elapsed < 20) return "ghoul";
  if (elapsed < 70) return r < 0.55 ? "ghoul" : r < 0.85 ? "maiden" : "bats";
  return r < 0.4 ? "ghoul" : r < 0.72 ? "maiden" : "bats";
}

function spawnMonster(type = pickMonsterType(), at = null, quiet = false) {
  let sp = at;
  if (!sp) {
    const far = level.spawns.filter((s) => {
      const d = Math.hypot(s.x - player.x, s.y - player.y);
      return d > TILE_SIZE * 11 && d < TILE_SIZE * 32 && !hasLineOfSight(level, s.x, s.y, player.x, player.y);
    });
    const pool = far.length ? far : level.spawns.filter((s) => Math.hypot(s.x - player.x, s.y - player.y) > TILE_SIZE * 8);
    if (!pool.length) return null;
    sp = pool[Math.floor(Math.random() * pool.length)];
  }
  const m = new Monster(type, sp.x, sp.y);
  monsters.push(m);
  fx.push({ type: "mist", x: sp.x, y: sp.y });
  const d = Math.hypot(sp.x - player.x, sp.y - player.y);
  if (d < TILE_SIZE * 20) sound.playSpawn();
  const room = roomAt(level, Math.floor(sp.x / TILE_SIZE), Math.floor(sp.y / TILE_SIZE));
  if (!quiet && d < TILE_SIZE * 22) toast(`${MONSTER_TYPES[type].name} rises${room ? ` in the ${room.name}` : ""}…`, 2.2);
  return m;
}


function wellExitPoint() {
  const w = level.well;
  for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const tx = w.tx + dx, ty = w.ty + dy;
    if (isPassableTile(level, tx, ty, player && player.pagesFound >= 5)) {
      return { x: (tx + 0.5) * TILE_SIZE, y: (ty + 0.5) * TILE_SIZE };
    }
  }
  return { x: w.x, y: w.y + TILE_SIZE };
}

function spawnWellDweller(quiet = false) {
  const w = level.well;
  const exit = wellExitPoint();
  const m = new Monster("dweller", exit.x, exit.y);
  m.state = "RISE";
  m.timer = 1.8;
  m.fromWell = true;
  m.emergeFrom = { x: w.x, y: w.y };
  monsters.push(m);
  fx.push({ type: "mist", x: w.x, y: w.y });
  fx.push({ type: "mist", x: exit.x, y: exit.y });
  sound.playWellSpawn();
  if (!quiet) toast("A Well Dweller crawls from the black water…", 3);
  shake = Math.max(shake, 0.4);
  return m;
}

function showBoon(kind, title, sub, secs = 3.4) {
  if (!boonBanner) return;
  boonBanner.className = "boon-banner " + kind;
  boonTitle.textContent = title;
  boonSub.textContent = sub;
  boonBanner.classList.remove("hidden");
  boonTimer = secs;
}

function tossWell(forced = null) {
  if (mode !== "PLAYING" || !player) return false;
  sound.init();
  if (player.coins < 5) {
    toast("The well wants an offering of 5 coins.");
    return false;
  }
  player.coins -= 5;
  if (hudCoinVal) hudCoinVal.textContent = String(player.coins);
  sound.playWellToss();
  fx.push({ type: "pickup", x: level.well.x, y: level.well.y, color: 0xe7c873 });
  fx.push({ type: "mist", x: level.well.x, y: level.well.y });
  let roll = forced || ["speed", "dark", "dweller"][Math.floor(Math.random() * 3)];
  const dwellers = monsters.filter((m) => !m.dead && m.kind === "dweller").length;
  if (roll === "dweller" && dwellers >= 2) roll = Math.random() < 0.5 ? "speed" : "dark";
  if (roll === "speed") {
    player.speedBoost = 15;
    player.darkCurse = 0;
    sound.playBoon();
    showBoon("boost", "SPEED BOOST", "The offering is accepted — your steps lighten for 15s.");
  } else if (roll === "dark") {
    player.darkCurse = 15;
    player.speedBoost = 0;
    sound.playCurse();
    showBoon("curse", "DARKNESS CURSE", "The well drinks the light. Your lantern shrinks for 15s.");
  } else {
    spawnWellDweller();
    showBoon("dweller", "WELL DWELLER", "Something answers the splash and crawls out.");
  }
  return roll;
}

function triggerSecret(secret) {
  if (!secret || secret.opened) return;
  if (openSecret(level, secret)) {
    pathing.invalidate();
    sound.playSecretOpen();
    shake = Math.max(shake, 0.85);
    toast(secret.openText, 3.2);
    fx.push({ type: "spark", x: secret.itemX, y: secret.itemY, n: 14, color: 0xc9a24d });
    buildMinimapBase();
  }
}

function updateWell(dt) {
  wellTimer -= dt;
  if (wellTimer > 0) return;
  const living = monsters.filter((m) => !m.dead && m.kind === "dweller").length;
  if (living < 1) {
    spawnWellDweller();
    wellTimer = 48 + Math.random() * 22;
  } else {
    wellTimer = 10;
  }
}

function updateSpawner(dt) {
  spawnTimer -= dt;
  if (spawnTimer > 0) return;
  const alive = monsters.filter((m) => !m.dead && m.kind !== "dweller").length;
  const cap = Math.min(10, 4 + Math.floor(elapsed / 40));
  if (alive < cap) {
    spawnMonster();
    if (elapsed > 80 && Math.random() < 0.30 && alive + 1 < cap) spawnMonster();
  }
  // ~6–15s early, tightening toward 6s as the night goes on.
  const span = Math.max(0, 9 - elapsed * 0.04);
  spawnTimer = 6 + Math.random() * span;
}

// ---------------------------------------------------------------- damage
function damagePlayer(amount, fromX, fromY, reason) {
  if (player.hidden || player.invuln > 0 || mode !== "PLAYING") return;
  player.health -= amount;
  player.invuln = 0.4;
  player.hurtAnim = 1;
  hurtFx = 1;
  shake = Math.max(shake, 0.55);
  sound.playHurt();
  fx.push({ type: "blood", x: player.x, y: player.y });
  const a = Math.atan2(player.y - fromY, player.x - fromX);
  player.x += Math.cos(a) * 10;
  player.y += Math.sin(a) * 10;
  resolveCircleWallCollision(level, player, player.radius, player.pagesFound >= 5);
  if (player.health <= 0) { player.health = 0; handleDeath(reason); }
}

const DEATH_BY = {
  ghoul: "The castle's ghouls dragged you down into the straw.",
  maiden: "A Blood Maiden's nails found your throat.",
  bats: "The bat swarm tore at you until the lantern fell.",
  dweller: "The Well Dweller dragged you into the black water."
};

// ---------------------------------------------------------------- update
function update(dt) {
  if (mode !== "PLAYING") {
    sound.updateAmbience(0, false);
    return;
  }
  elapsed += dt;
  if (flareFlash > 0) flareFlash = Math.max(0, flareFlash - dt * 2.1);
  if (player.flareCooldown > 0) player.flareCooldown = Math.max(0, player.flareCooldown - dt);
  if (player.attackCd > 0) player.attackCd = Math.max(0, player.attackCd - dt);
  if (player.attackAnim > 0) player.attackAnim = Math.max(0, player.attackAnim - dt * 3.2);
  if (player.hurtAnim > 0) player.hurtAnim = Math.max(0, player.hurtAnim - dt * 3);
  if (player.invuln > 0) player.invuln -= dt;
  if (player.speedBoost > 0) player.speedBoost = Math.max(0, player.speedBoost - dt);
  if (player.darkCurse > 0) player.darkCurse = Math.max(0, player.darkCurse - dt);
  if (boonTimer > 0) { boonTimer -= dt; if (boonTimer <= 0 && boonBanner) boonBanner.classList.add("hidden"); }
  shake = Math.max(0, shake - dt * 2.4);
  hurtFx = Math.max(0, hurtFx - dt * 2);
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) toastEl.classList.add("hidden"); }

  // Movement
  let mx = joy.dx, my = joy.dy;
  if (keys["w"] || keys["arrowup"]) my -= 1;
  if (keys["s"] || keys["arrowdown"]) my += 1;
  if (keys["a"] || keys["arrowleft"]) mx -= 1;
  if (keys["d"] || keys["arrowright"]) mx += 1;
  const mag = Math.hypot(mx, my);
  if (!player.hidden && mag > 0.14) {
    const clampedMag = Math.min(1, mag);
    const nx = mx / mag, ny = my / mag;
    const slow = (player.sanity < 25 ? 0.88 : 1) * (player.attackAnim > 0.5 && player.weapon === "mace" ? 0.6 : 1) * (player.speedBoost > 0 ? 1.5 : 1);
    player.x += nx * player.speed * clampedMag * slow * dt;
    player.y += ny * player.speed * clampedMag * slow * dt;
    if (player.attackAnim < 0.3) player.angle = Math.atan2(ny, nx);
    resolveCircleWallCollision(level, player, player.radius, player.pagesFound >= 5);
    sound.playFootstep(clampedMag < 0.55);
  }
  if (attackHeld) tryAttack();

  // Area titles as you enter each wing
  const room = roomAt(level, Math.floor(player.x / TILE_SIZE), Math.floor(player.y / TILE_SIZE));
  if (room && room.key !== lastRoomKey) {
    if (lastRoomKey !== null) showAreaTitle(room.name);
    lastRoomKey = room.key;
  }

  // Braziers
  player.inBrazier = false;
  for (const b of level.braziers) {
    if (Math.hypot(b.x - player.x, b.y - player.y) < 50) { player.inBrazier = true; break; }
  }
  if (player.inBrazier) {
    player.oil = Math.min(100, player.oil + 36 * dt);
    player.sanity = Math.min(100, player.sanity + 14 * dt);
    player.health = Math.min(100, player.health + 4 * dt);
  } else if (player.lanternOn) {
    player.oil = Math.max(0, player.oil - 1.35 * dt);
    if (player.oil <= 0) { player.lanternOn = false; sound.playDouse(false); }
  } else {
    player.sanity = Math.max(0, player.sanity - (player.hidden ? 1.5 : 2.9) * dt);
  }

  // Glass
  for (const g of level.glass) {
    if (g.cooldown > 0) g.cooldown -= dt;
    if (!player.hidden && g.cooldown <= 0 && Math.hypot(g.x - player.x, g.y - player.y) < 18) {
      g.cooldown = 5.0;
      sound.playGlassCrunch();
      if (!countess.frozen) countess.alertAt(g.x, g.y);
      toast("CRACKED GLASS! The Countess heard you.");
    }
  }

  // Pickups: mirrors & bolts (walk over them)
  for (const m of level.mirrors) {
    if (m.collected) continue;
    if (Math.hypot(m.x - player.x, m.y - player.y) < 30) {
      m.collected = true;
      player.mirrors[m.tier] += 1;
      const T = MIRROR_TIERS[m.tier];
      sound.playPickup();
      fx.push({ type: "pickup", x: m.x, y: m.y, color: T.color });
      toast(`Picked up: ${T.name} (${T.secs}s freeze)`, 2.6);
      renderMirrorHud(false, m.tier);
    }
  }
  const w = WEAPONS[player.weapon];
  if (w.kind === "ranged") {
    for (const b of level.bolts) {
      if (b.collected || player.ammo >= w.maxAmmo) continue;
      if (Math.hypot(b.x - player.x, b.y - player.y) < 30) {
        b.collected = true;
        player.ammo = Math.min(w.maxAmmo, player.ammo + w.pickup);
        sound.playPickup();
        fx.push({ type: "pickup", x: b.x, y: b.y, color: 0xe4eef8 });
        toast(`+${w.pickup} silver bolts`);
      }
    }
  }

  // Interactables
  nearbyContext = null;
  let promptText = "";
  for (const p of level.pages) {
    if (!p.collected && Math.hypot(p.x - player.x, p.y - player.y) < 34) {
      nearbyContext = { type: "page", obj: p };
      promptText = `Tap READ — ${p.lore.num}`;
      break;
    }
  }
  if (!nearbyContext && !player.hidden) {
    for (const a of level.alcoves) {
      if (Math.hypot(a.x - player.x, a.y - player.y) < 32) {
        nearbyContext = { type: "alcove", obj: a };
        promptText = "Tap HIDE — Iron Alcove";
        break;
      }
    }
  }
  if (!nearbyContext && !player.hidden && level.well && Math.hypot(level.well.x - player.x, level.well.y - player.y) < 52) {
    nearbyContext = { type: "well", obj: level.well };
    promptText = player.coins >= 5 ? "Tap TOSS — Offer 5 coins to the well" : "The well wants an offering (5 coins)";
  }
  if (!nearbyContext && !player.hidden) {
    for (const d of level.secrets) {
      if (d.opened) continue;
      if (Math.hypot(d.itemX - player.x, d.itemY - player.y) < 34) {
        nearbyContext = { type: "secret", obj: d };
        promptText = `Tap SEARCH — ${d.itemName}`;
        break;
      }
    }
  }
  if (!nearbyContext && Math.hypot(level.exitTile.x - player.x, level.exitTile.y - player.y) < 60) {
    nearbyContext = { type: "exit", obj: level.exitTile };
    promptText = player.pagesFound >= 5 ? "Portcullis Unsealed — Tap ESCAPE!" : `North Gate Sealed (${player.pagesFound}/5 Ledger Pages)`;
  }
  if (player.hidden) promptText = "Hidden in Iron Alcove — Tap EXIT to step out";
  else if (!promptText && player.inBrazier) promptText = "Warm Brazier — Mending Oil, Sanity & Wounds";
  if (promptText) { promptBanner.textContent = promptText; promptBanner.classList.remove("hidden"); }
  else promptBanner.classList.add("hidden");

  if (player.pagesFound >= 5 && player.y < TILE_SIZE * 0.95 && Math.abs(player.x - level.exitTile.x) < TILE_SIZE * 0.7) {
    handleWin();
    return;
  }

  // Countess
  countess.update(dt, level, player, {
    onSpotted: () => sound.playAlert(),
    onCaught: () => {
      if (useMirror(true)) return;
      handleDeath(`The Blood Countess caught you in the ${room ? room.name : "dark"}.`);
    },
    onThaw: () => { toast("The glass cracks — she moves again!", 2); sound.playAlert(); },
    onManifest: () => toast("You hear silk dragging over stone… she is closer.", 2.6)
  });
  if (mode !== "PLAYING") return;

  // Monsters
  const cb = {
    onSpot: (m) => sound.playMonsterSpot(m.kind),
    onHitPlayer: (m) => {
      damagePlayer(m.type.dmg, m.x, m.y, DEATH_BY[m.kind]);
      if (m.type.drainsOil) player.oil = Math.max(0, player.oil - 6);
    },
    onKilled: (m) => onMonsterKilled(m)
  };
  for (const m of monsters) m.update(dt, level, player, pathing, cb);
  if (mode !== "PLAYING") return;
  // separation (monsters vs monsters, monsters vs player)
  for (let i = 0; i < monsters.length; i++) {
    const a = monsters[i];
    if (a.dead || a.state === "RISE") continue;
    for (let j = i + 1; j < monsters.length; j++) {
      const b = monsters[j];
      if (b.dead || b.state === "RISE") continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, min = a.radius + b.radius;
      if (d < min) {
        const push = (min - d) / 2;
        a.x -= (dx / d) * push; a.y -= (dy / d) * push;
        b.x += (dx / d) * push; b.y += (dy / d) * push;
      }
    }
    if (!player.hidden) {
      const dx = a.x - player.x, dy = a.y - player.y, d = Math.hypot(dx, dy) || 0.01, min = a.radius + player.radius;
      if (d < min) { a.x += (dx / d) * (min - d); a.y += (dy / d) * (min - d); }
    }
  }
  burnFxTimer -= dt;
  if (burnFxTimer <= 0) {
    burnFxTimer = 0.15;
    for (const m of monsters) if (!m.dead && m.burn > 0) fx.push({ type: "burn", x: m.x, y: m.y });
  }
  monsters = monsters.filter((m) => !m.remove);

  // Projectiles
  for (const p of projectiles) {
    const steps = 3;
    for (let s = 0; s < steps && !p.dead; s++) {
      p.x += (p.vx * dt) / steps;
      p.y += (p.vy * dt) / steps;
      const tx = Math.floor(p.x / TILE_SIZE), ty = Math.floor(p.y / TILE_SIZE);
      const cell = level.grid[ty] && level.grid[ty][tx];
      if (cell === 1 || cell === 2 || cell === undefined) {
        p.dead = true;
        fx.push({ type: "spark", x: p.x - p.vx * 0.01, y: p.y - p.vy * 0.01, n: 6 });
        sound.playClang();
        break;
      }
      for (const m of monsters) {
        if (m.dead || m.state === "RISE") continue;
        if (Math.hypot(m.x - p.x, m.y - p.y) < m.radius + 6) {
          if (m.hit(w.dmg, p.x - p.vx * 0.05, p.y - p.vy * 0.05, w.knock)) {
            fx.push({ type: "spark", x: m.x, y: m.y, n: 10 });
            fx.push({ type: "blood", x: m.x, y: m.y });
            sound.playHit(false);
            if (m.dead) onMonsterKilled(m);
          }
          p.dead = true;
          break;
        }
      }
      if (!p.dead && !countess.frozen && Math.hypot(countess.x - p.x, countess.y - p.y) < 20) {
        p.dead = true;
        countess.stagger(w.stagger);
        sound.playClang();
        fx.push({ type: "spark", x: countess.x, y: countess.y, h: 1.6, n: 12, color: 0xe7c873 });
        if (!warnedCountessImmune) { warnedCountessImmune = true; toast("The bolt glances off her — she can't be harmed. RUN or use a MIRROR!", 3.2); }
      }
    }
    p.life -= dt;
    if (p.life <= 0) p.dead = true;
  }
  projectiles = projectiles.filter((p) => !p.dead);

  updateDrops(dt);
  updateSpawner(dt);
  updateWell(dt);

  // Well Dweller sanity aura
  for (const m of monsters) {
    if (m.dead || m.kind !== "dweller" || m.state === "RISE") continue;
    const d = Math.hypot(m.x - player.x, m.y - player.y);
    if (d < 200) {
      const far = Math.max(0, 1 - d / 200);
      const rate = (d < 80 ? 12 : 7) * far * (player.hidden ? 0.45 : 1);
      player.sanity = Math.max(0, player.sanity - rate * dt);
    }
  }

  // Terror & danger
  const distC = Math.hypot(countess.x - player.x, countess.y - player.y);
  let danger = countess.frozen ? 0 : Math.max(0, Math.min(1, 1 - (distC - 55) / 260));
  if (countess.state === AI_STATE.HUNT) {
    danger = Math.max(danger, 0.72);
    player.sanity = Math.max(0, player.sanity - 5.2 * dt);
  }
  let monsterDanger = 0;
  for (const m of monsters) {
    if (m.dead) continue;
    const d = Math.hypot(m.x - player.x, m.y - player.y);
    if (d < 140) monsterDanger = Math.max(monsterDanger, 0.35 * (1 - d / 140));
  }
  danger = Math.max(danger, monsterDanger, (1 - player.health / 100) * 0.4);
  if (player.sanity <= 0) { handleDeath("Your mind fractured inside the dark stones of Csejte."); return; }

  dangerVignette.style.opacity = (danger * 0.85).toFixed(2);
  const lowSanity = Math.max(0, (38 - player.sanity) / 38);
  sanityGlitch.style.opacity = (lowSanity * (0.35 + 0.35 * Math.sin(elapsed * 14))).toFixed(2);
  sound.updateAmbience(danger, true);

  mmTimer -= dt;
  if (mmTimer <= 0) { mmTimer = 0.2; drawMinimap(); }
  updateHud();
}

function draw() {
  renderer3d.render({
    player, countess, mode, flareFlash, deathEcho,
    witching: isWitchingHour,
    monsters, projectiles, drops, fx,
    shake, hurt: hurtFx,
    weapon: player ? player.weapon : selectedWeapon,
    speedBoost: player ? player.speedBoost : 0,
    darkCurse: player ? player.darkCurse : 0
  });
  fx.length = 0;
}

// Title backdrop: castle built once, the Countess waits in the hall.
level = createLevel();
pathing = new Pathing(level);
renderer3d.setLevel(level);
countess = new CountessAI(level.countessSpawn, level.waypoints, isWitchingHour, pathing);
buildWeaponGrid();
renderMirrorHud(true);

// QA hook (only with ?qa in the URL)
if (new URLSearchParams(location.search).has("qa")) {
  window.__qa = {
    get mode() { return mode; },
    get player() { return player; },
    get countess() { return countess; },
    get level() { return level; },
    get monsters() { return monsters; },
    get kills() { return kills; },
    get spawnTimer() { return spawnTimer; },
    set spawnTimer(v) { spawnTimer = v; },
    get elapsed() { return elapsed; },
    set elapsed(v) { elapsed = v; },
    get drops() { return drops; },
    stats: () => renderer3d.stats(),
    place(obj, tx, ty) { obj.x = (tx + 0.5) * TILE_SIZE; obj.y = (ty + 0.5) * TILE_SIZE; },
    spawn(type, tx, ty) {
      const m = spawnMonster(type || undefined, { x: (tx + 0.5) * TILE_SIZE, y: (ty + 0.5) * TILE_SIZE });
      return m && m.id;
    },
    pickType: () => pickMonsterType(),
    giveMirror(tier, n = 1) { player.mirrors[tier] += n; renderMirrorHud(false, tier); },
    useMirror: () => useMirror(false),
    attack: () => { player.attackCd = 0; tryAttack(); },
    forceDrop(kind, tx, ty, opts = {}) {
      return spawnDrop(kind, (tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE, opts);
    },
    killForDrop(type, kind, tx, ty, opts = {}) {
      const m = spawnMonster(type, { x: (tx + 0.5) * TILE_SIZE, y: (ty + 0.5) * TILE_SIZE }, true);
      if (!m) return null;
      m.state = "WANDER";
      m.timer = 0;
      m.hp = 0;
      m._die();
      onMonsterKilled(m, kind, opts);
      return { monsterId: m.id, dropId: drops.length ? drops[drops.length - 1].id : null };
    },
    toast,
    giveCoins(n = 5) { player.coins += n; if (hudCoinVal) hudCoinVal.textContent = String(player.coins); },
    tossWell: (forced) => tossWell(forced),
    spawnDweller: (quiet = true) => { const m = spawnWellDweller(quiet); return m && m.id; },
    openSecret: (key) => { const d = level.secrets.find((s) => s.key === key || s.item === key); if (d) triggerSecret(d); return !!(d && d.opened); },
    get secrets() { return level.secrets; },
    get well() { return level.well; },
    get wellTimer() { return wellTimer; },
    set wellTimer(v) { wellTimer = v; }
  };
}

let lastFrame = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
