import { SoundEngine } from "./audio.js";
import { CURSE_ALERTS, TITLE_WHISPERS } from "./lore.js";
import {
  createLevel, hasLineOfSight, resolveCircleWallCollision, TILE_SIZE, Pathing, roomAt,
  MIRROR_TIERS, MIRROR_ORDER, openSecret, isPassableTile, setDoor, PUZZLE_GLYPHS
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
const hudKillVal = $("hud-kill-val");
const hudKeySlots = { 1: $("key-slot-1"), 2: $("key-slot-2") };
const hudArmorBar = $("hud-armor-bar");
const hudArmorVal = $("hud-armor-val");
const puzzleHud = $("puzzle-hud");
const puzzleTitle = $("puzzle-title");
const puzzleInfo = $("puzzle-info");
const puzzleFill = $("puzzle-fill");
const btnRiddle = $("btn-riddle");
const screenToken = $("screen-token");
const tokenGrid = $("token-grid");
const loreCloseBtn = $("btn-lore-close");
const loreSeal = document.querySelector("#screen-lore .lore-seal");
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
let inPuzzle = null;      // the locked chamber you are sealed inside
let keysAwarded = 0;      // 1 at 15 kills, 2 at 30 kills
let grindTimer = 0;
let warnedWail = false;
let warnedHands = false;
const KEY_KILLS = [15, 30];

// ---------------------------------------------------------------- persistence (v0.6)
// Coins live in a purse saved between runs; upgrades and the Stage II unlock are permanent.
const LS_PURSE = "csejte_purse", LS_UP = "csejte_upgrades", LS_S2 = "csejte_stage2";
function lsGet(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
let upgrades = Object.assign({ heart: 0, edge: 0, wick: 0, glass: 0 }, lsGet(LS_UP, {}));
let stage2Unlocked = !!lsGet(LS_S2, false);
let currentStage = 1;     // stage of the run in progress
let pendingStage = 1;     // stage the armory's BEGIN button will start
let runStartCoins = 0;    // coins carried into this run (for the death rule)
let shopCtx = null;       // "field" (the pedlar's stall) or "between" (after a stage)
let shopPrevMode = null;
let tokenReturn = null;   // where the weapon picker returns to (shop vs. play)
let carryOver = null;     // player state carried from Stage I into Stage II
function loadPurse() { return Math.max(0, lsGet(LS_PURSE, 0) | 0); }
function savePurse(n) { lsSet(LS_PURSE, Math.max(0, Math.floor(n))); }
// Death keeps what you carried in (minus anything you spent) plus half of what you picked up this run.
function purseAfterDeath() {
  if (!player) return loadPurse();
  const c = Math.floor(player.coins);
  return c >= runStartCoins ? runStartCoins + Math.floor((c - runStartCoins) / 2) : c;
}
const maxHealthFor = () => 100 + 15 * upgrades.heart;
const dmgMul = () => 1 + 0.12 * upgrades.edge;
const lanternMul = () => 1 + 0.12 * upgrades.wick;
const freezeBonus = () => upgrades.glass;

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
function startNewRun(stage = pendingStage, carry = null) {
  if (typeof stage !== "number") stage = pendingStage;
  sound.init();
  setSoundEnabled(chkSound.checked);
  currentStage = stage;
  level = createLevel(stage);
  pathing = new Pathing(level);
  renderer3d.setLevel(level);
  renderer3d.setWeapon(selectedWeapon);
  const w = WEAPONS[selectedWeapon];
  player = {
    x: level.playerSpawn.x, y: level.playerSpawn.y, radius: 11, angle: -Math.PI / 2, speed: 122,
    lanternOn: true, oil: 100, sanity: 100, health: maxHealthFor(), maxHealth: maxHealthFor(), hidden: false, hideSpot: null,
    pagesFound: 0, flareCooldown: 0, inBrazier: false,
    weapon: selectedWeapon, ammo: w.kind === "ranged" ? w.ammo : Infinity,
    attackCd: 0, attackAnim: 0, hurtAnim: 0, invuln: 0,
    mirrors: { cracked: 0, silver: 0, gilded: 0, obsidian: 0 },
    coins: 0, speedBoost: 0, darkCurse: 0,
    armor: 0, keys: { 1: null, 2: null }, hasTaper: false, slowT: 0, lanternMul: lanternMul()
  };
  if (carry) {
    // Escaped Stage I: weapon, bolts, mirrors, armor, coins and any tonic come with you.
    player.weapon = carry.weapon;
    player.ammo = carry.ammo;
    player.mirrors = { ...carry.mirrors };
    player.armor = carry.armor;
    player.coins = carry.coins;
    player.speedBoost = carry.speedBoost || 0;
    renderer3d.setWeapon(player.weapon);
  } else {
    player.coins = loadPurse();
  }
  runStartCoins = player.coins;
  countess = new CountessAI(level.countessSpawn, level.waypoints, isWitchingHour, pathing);
  monsters = [];
  projectiles = [];
  drops = [];
  fx = [];
  shake = 0; hurtFx = 0; elapsed = 0; flareFlash = 0; kills = 0; mirrorsUsed = 0;
  spawnTimer = 4; wellTimer = 32; boonTimer = 0; nearbyContext = null; lastRoomKey = null; freezeTier = null;
  warnedCountessImmune = false;
  inPuzzle = null; keysAwarded = 0; grindTimer = 0; warnedWail = false; warnedHands = false;
  if (puzzleHud) puzzleHud.classList.add("hidden");
  buildMinimapBase();

  hideAllScreens();
  hudEl.classList.remove("hidden");
  touchControls.classList.remove("hidden");
  mode = "PLAYING";
  renderMirrorHud(true);
  updateHud();
  scheduleOptInCurseWhisper();
  showStageCard(stage);
}

function showStageCard(stage) {
  const el = $("stage-card");
  if (!el) return;
  $("stage-card-num").textContent = stage === 2 ? "STAGE II" : "STAGE I";
  $("stage-card-title").textContent = stage === 2 ? "THE GRAVEYARDS" : "CSEJTE CASTLE";
  $("stage-card-sub").textContent = stage === 2
    ? "Take five grave rubbings · escape by the Gatehouse road"
    : "Recover five ledger pages · escape by the North Gate";
  el.classList.remove("hidden");
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = "";
  clearTimeout(showStageCard._t);
  showStageCard._t = setTimeout(() => el.classList.add("hidden"), 4200);
}

function hideAllScreens() {
  for (const s of [screenTitle, screenWeapon, screenHelp, screenLore, screenDeath, screenWin, screenToken, $("screen-shop"), $("screen-stage")]) if (s) s.classList.add("hidden");
  freezeBanner.classList.add("hidden");
  toastEl.classList.add("hidden");
  if (boonBanner) boonBanner.classList.add("hidden");
  const sc = $("stage-card"); if (sc) sc.classList.add("hidden");
}

function showTitle() {
  // Quitting mid-run settles the purse by the same rule as dying.
  if (player && (mode === "PAUSED" || mode === "PLAYING")) savePurse(purseAfterDeath());
  mode = "TITLE";
  refreshTitleStages();
  hideAllScreens();
  hudEl.classList.add("hidden");
  touchControls.classList.add("hidden");
  promptBanner.classList.add("hidden");
  dangerVignette.style.opacity = "0";
  sanityGlitch.style.opacity = "0";
  screenTitle.classList.remove("hidden");
}

function refreshTitleStages() {
  const row = $("title-stages");
  if (!row) return;
  row.classList.toggle("hidden", !stage2Unlocked);
  const purse = $("title-purse");
  if (purse) purse.textContent = `◉ ${loadPurse()} coins in your purse`;
}
$("btn-start").addEventListener("click", () => { pendingStage = 1; showWeaponSelect(); });
if ($("btn-stage-1")) $("btn-stage-1").addEventListener("click", () => { pendingStage = 1; showWeaponSelect(); });
if ($("btn-stage-2")) $("btn-stage-2").addEventListener("click", () => { if (!stage2Unlocked) return; pendingStage = 2; showWeaponSelect(); });
if ($("btn-continue")) $("btn-continue").addEventListener("click", () => { if (!stage2Unlocked) return; pendingStage = 2; showWeaponSelect(); });
btnBegin.addEventListener("click", () => startNewRun(pendingStage));
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
$("btn-retry").addEventListener("click", () => startNewRun(currentStage));
$("btn-death-weapon").addEventListener("click", () => { pendingStage = currentStage; showWeaponSelect(); });
$("btn-death-title").addEventListener("click", showTitle);
$("btn-play-again").addEventListener("click", () => { pendingStage = 1; showWeaponSelect(); });
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
    loreBody.classList.remove("riddle");
    const S2 = level.stage === 2;
    if (loreSeal) loreSeal.textContent = S2 ? "CHARCOAL RUBBING TAKEN" : "WAX SEAL BROKEN";
    loreCloseBtn.textContent = S2 ? "POCKET RUBBING (+12% SANITY)" : "POCKET PAGE (+12% SANITY)";
    loreTitle.textContent = p.lore.title;
    loreBody.textContent = p.lore.body;
    if (p.lore.witchingPostscript && isWitchingHour) {
      lorePostscript.textContent = p.lore.witchingPostscript;
      lorePostscript.classList.remove("hidden");
    } else lorePostscript.classList.add("hidden");
    mode = "LORE";
    screenLore.classList.remove("hidden");
    if (player.pagesFound >= 5) toast(S2 ? "All five rubbings taken — the Gatehouse road is open!" : "All five seals broken — the North Gate is open!", 4);
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
  } else if (nearbyContext.type === "door") {
    tryUnlock(nearbyContext.obj);
  } else if (nearbyContext.type === "candle") {
    lightCandle(nearbyContext.obj);
  } else if (nearbyContext.type === "plate") {
    pressPlate(nearbyContext.obj);
  } else if (nearbyContext.type === "coffin") {
    restCoffin(nearbyContext.obj);
  } else if (nearbyContext.type === "bell") {
    ringBell(nearbyContext.obj);
  } else if (nearbyContext.type === "merchant") {
    openShop("field");
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
  } else {
    const b = nearestBreakable(ranged ? Math.min(w.range, 260) : (w.reach || 52) + 30);
    if (b) player.angle = Math.atan2(b.y - player.y, b.x - player.x);
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
  const dmg = (w.kind === "ranged" ? w.bashDmg : w.dmg) * dmgMul();
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
  // Crates & barrels splinter under your blows
  for (const b of level.breakables) {
    if (b.broken) continue;
    const d = Math.hypot(b.x - player.x, b.y - player.y);
    if (d > reach + 22) continue;
    const a = Math.atan2(b.y - player.y, b.x - player.x);
    if (Math.abs(angDiff(a, player.angle)) > arc / 2 + 0.25 && d > 36) continue;
    hitBreakable(b, player.weapon === "mace" ? 2 : 1);
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
  checkKeyDrops(m);
  if (m.kind === "slime") {
    // Splits once into two minis
    for (const s of [-1, 1]) {
      const a = Math.random() * Math.PI;
      const mini = new Monster("slimelet", m.x + Math.cos(a) * 14 * s, m.y + Math.sin(a) * 14 * s);
      mini.timer = 0.3;
      resolveCircleWallCollision(level, mini, mini.radius, false);
      monsters.push(mini);
    }
    fx.push({ type: "slime", x: m.x, y: m.y });
    sound.playSlime();
  }
  sound.playMonsterDie();
  fx.push({ type: "dissolve", x: m.x, y: m.y, color: m.kind === "maiden" ? 0xd8b0c0 : m.kind === "bats" ? 0x5a3a5a : (m.kind === "slime" || m.kind === "slimelet") ? 0xb0101e : m.kind === "skeleton" ? 0xe0d4b0 : m.kind === "banshee" ? 0xa8c8f0 : 0x9fb28a });
  const kind = forcedKind || rollDropKind(m);
  if (kind && kind !== "nothing") {
    const extra = { ...opts };
    if (kind === "mirror" && !extra.tier) extra.tier = rollMirrorTier(m.kind === "ghoul" || m.kind === "dweller" || m.kind === "brute");
    if (kind === "coins" && !extra.amount) extra.amount = (m.kind === "dweller" || m.kind === "brute") ? 16 + Math.floor(Math.random() * 10) : (m.kind === "ghoul" || m.kind === "skeleton") ? 12 + Math.floor(Math.random() * 9) : 6 + Math.floor(Math.random() * 8);
    if (kind === "sanity" && !extra.amount) extra.amount = 24;
    spawnDrop(kind, m.x, m.y, extra);
  }
}

const DROP_TABLE = {
  default: { nothing: 0.40, sanity: 0.25, coins: 0.23, mirror: 0.12 },
  ghoul:   { nothing: 0.30, sanity: 0.26, coins: 0.26, mirror: 0.18 },
  dweller: { nothing: 0.20, sanity: 0.25, coins: 0.30, mirror: 0.25 },
  slimelet: { nothing: 0.70, sanity: 0.12, coins: 0.15, mirror: 0.03 },
  brute:   { nothing: 0.15, sanity: 0.22, coins: 0.40, mirror: 0.23 },
  banshee: { nothing: 0.30, sanity: 0.38, coins: 0.20, mirror: 0.12 }
};

// What a smashed crate or barrel holds (v0.5)
const CRATE_TABLE = { token: 0.20, armor: 0.32, haste: 0.22, slime: 0.26 };
function rollCrateKind() {
  const r = Math.random();
  let acc = 0;
  for (const [k, p] of Object.entries(CRATE_TABLE)) { acc += p; if (r < acc) return k; }
  return "armor";
}

function nearestBreakable(range) {
  let best = null, bd = range;
  for (const b of level.breakables) {
    if (b.broken) continue;
    const d = Math.hypot(b.x - player.x, b.y - player.y);
    if (d < bd && hasLineOfSight(level, player.x, player.y, b.x, b.y)) { bd = d; best = b; }
  }
  return best;
}

function hitBreakable(b, dmg = 1, forcedKind = null) {
  if (!b || b.broken) return null;
  b.hp -= dmg;
  b.hitT = 0.3;
  fx.push({ type: "splinter", x: b.x, y: b.y, n: 10 });
  if (b.hp > 0) { sound.playCrateHit(); shake = Math.max(shake, 0.2); return null; }
  return breakBreakable(b, forcedKind);
}

function breakBreakable(b, forcedKind = null) {
  if (b.broken) return null;
  b.broken = true;
  b.hp = 0;
  level.grid[b.ty][b.tx] = 0;
  pathing.invalidate();
  sound.playCrateBreak();
  shake = Math.max(shake, 0.45);
  fx.push({ type: "splinter", x: b.x, y: b.y, n: 34, big: true });
  const kind = forcedKind || rollCrateKind();
  if (kind === "slime") {
    const m = new Monster("slime", b.x, b.y);
    m.timer = 0.45;
    monsters.push(m);
    fx.push({ type: "slime", x: b.x, y: b.y });
    sound.playSlime();
    toast(`A slime oozes out of the ${b.type}!`, 2.4);
  } else {
    spawnDrop(kind, b.x, b.y);
  }
  return kind;
}

function checkKeyDrops(m) {
  while (keysAwarded < KEY_KILLS.length && kills >= KEY_KILLS[keysAwarded]) {
    keysAwarded += 1;
    const n = keysAwarded;
    spawnDrop("key", m.x, m.y, { keyNo: n });
    sound.playKey();
    shake = Math.max(shake, 0.5);
    const lr = level.lockedRooms.find((r) => r.keyNo === n);
    showBoon("key", n === 1 ? "THE FIRST KEY FALLS…" : "THE SECOND KEY FALLS…", `Iron Key ${n === 1 ? "I" : "II"} — it opens the ${lr ? lr.name : "sealed door"}.`, 4);
  }
}

function swapWeapon(id) {
  if (!WEAPONS[id] || !player) return;
  const w = WEAPONS[id];
  player.weapon = id;
  player.ammo = w.kind === "ranged" ? w.ammo : Infinity;
  player.attackCd = 0;
  renderer3d.setWeapon(id);
  fx.push({ type: "pickup", x: player.x, y: player.y, color: 0xb27bff });
  toast(`You take up the ${w.name}.`, 2.4);
  updateHud();
}

function openTokenPicker() {
  if (!screenToken) return;
  mode = "PICK";
  attackHeld = false;
  tokenGrid.innerHTML = WEAPON_ORDER.map((id) => {
    const w = WEAPONS[id];
    const cur = id === player.weapon;
    return `<button class="weapon-option token-option${cur ? " current" : ""}" type="button" data-weapon="${id}" ${cur ? "disabled" : ""}>
      <div class="weapon-top">${WEAPON_ICONS[id]}<div><div class="weapon-name">${w.name}</div><div class="weapon-special">${cur ? "IN HAND" : w.special}</div></div></div>
    </button>`;
  }).join("");
  tokenGrid.querySelectorAll(".token-option:not([disabled])").forEach((el) => {
    el.addEventListener("click", () => { closeTokenPicker(); swapWeapon(el.dataset.weapon); finishTokenPick(); });
  });
  screenToken.classList.remove("hidden");
}
function closeTokenPicker() {
  screenToken.classList.add("hidden");
  if (mode === "PICK") mode = "PLAYING";
}
function finishTokenPick() {
  if (!tokenReturn) return;
  const f = tokenReturn;
  tokenReturn = null;
  if (carryOver) { carryOver.weapon = player.weapon; carryOver.ammo = player.ammo; }
  f();
}
$("btn-token-keep").addEventListener("click", () => {
  closeTokenPicker();
  if (tokenReturn) { player.coins += 20; if (carryOver) carryOver.coins = player.coins; savePursePostBuy(); } // pedlar refunds an unused swap
  toast("You keep your weapon.", 1.6);
  finishTokenPick();
});

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
    amount: opts.amount || (kind === "coins" ? 8 : kind === "sanity" ? 24 : kind === "armor" ? 35 : 0),
    keyNo: opts.keyNo || 0,
    x, y,
    vx: Math.cos(ang) * spd,
    vy: Math.sin(ang) * spd,
    h: 0.95,
    vh: 4.4 + Math.random() * 1.1,
    life: kind === "key" ? Infinity : 20,
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
  } else if (d.kind === "key") {
    player.keys[d.keyNo] = "held";
    sound.playKey();
    fx.push({ type: "pickup", x: d.x, y: d.y, color: 0xffd86a });
    const lr = level.lockedRooms.find((r) => r.keyNo === d.keyNo);
    const above = lr ? roomAt(level, lr.door[0], lr.door[1] - 2) : null;
    toast(`Iron Key ${d.keyNo === 1 ? "I" : "II"} — opens the ${lr ? lr.name : "sealed door"}${above ? ` off the ${above.name}` : ""}.`, 3.4);
    const slot = hudKeySlots[d.keyNo];
    if (slot) { slot.classList.remove("bump"); void slot.offsetWidth; slot.classList.add("bump"); }
  } else if (d.kind === "armor") {
    player.armor = Math.min(100, player.armor + d.amount);
    sound.playArmor();
    fx.push({ type: "pickup", x: d.x, y: d.y, color: 0x9fc4e8 });
    toast(`Armor plate — +${d.amount} armor`, 2.2);
  } else if (d.kind === "haste") {
    player.speedBoost = 15;
    player.darkCurse = 0;
    sound.playBoon();
    fx.push({ type: "pickup", x: d.x, y: d.y, color: 0xffe08a });
    showBoon("boost", "SPEED BOOST", "A crate-cached tonic — your steps lighten for 15s.");
  } else if (d.kind === "token") {
    sound.playArmor();
    fx.push({ type: "pickup", x: d.x, y: d.y, color: 0xb27bff });
    openTokenPicker();
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
  const secs = T.secs + freezeBonus();
  countess.freeze(secs);
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
    toast(`${T.name}: frozen for ${secs}s`, 2.2);
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
  const kept = purseAfterDeath();
  savePurse(kept);
  const deathCoins = $("death-coins"); if (deathCoins) deathCoins.textContent = `${kept}`;
  const dp = $("death-pages-label"); if (dp) dp.textContent = level.stage === 2 ? "RUBBINGS" : "PAGES";
  screenDeath.classList.remove("hidden");
}

function handleWin() {
  if (mode !== "PLAYING") return;
  if (currentStage === 1) { handleStageClear(); return; }
  mode = "WIN";
  savePurse(player.coins);
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

// ---------------------------------------------------------------- stage transition (v0.6)
function handleStageClear() {
  mode = "STAGECLEAR";
  sound.playWin();
  clearDeathEcho();
  endRunUi();
  stage2Unlocked = true;
  lsSet(LS_S2, true);
  savePurse(player.coins);
  carryOver = {
    weapon: player.weapon, ammo: player.ammo, mirrors: { ...player.mirrors },
    armor: player.armor, coins: player.coins, speedBoost: 0
  };
  $("stage-time").textContent = formatTime(elapsed);
  $("stage-kills").textContent = String(kills);
  $("stage-coins").textContent = String(player.coins);
  screenStageShow();
}
function screenStageShow() {
  const el = $("screen-stage");
  $("stage-coins").textContent = String(carryOver ? carryOver.coins : 0);
  el.classList.remove("hidden");
  el.classList.remove("enter");
  void el.offsetWidth;
  el.classList.add("enter");
}
function enterStage2() {
  sound.playStage();
  const carry = carryOver;
  carryOver = null;
  startNewRun(2, carry);
}
if ($("btn-stage-enter")) $("btn-stage-enter").addEventListener("click", enterStage2);
if ($("btn-stage-shop")) $("btn-stage-shop").addEventListener("click", () => { $("screen-stage").classList.add("hidden"); openShop("between"); });
if ($("btn-stage-title")) $("btn-stage-title").addEventListener("click", () => { carryOver = null; showTitle(); });

// ---------------------------------------------------------------- the Hooded Pedlar's shop (v0.6)
// "field" items only make sense mid-run (healing is refilled at every stage start anyway).
const SHOP_ITEMS = [
  { id: "potion", name: "Health Draught", icon: "✚", price: 12, field: true, desc: "+50 health" },
  { id: "salts", name: "Sanity Salts", icon: "✺", price: 10, field: true, desc: "+40 sanity" },
  { id: "oil", name: "Lamp Oil", icon: "♨", price: 8, field: true, desc: "Refill your lantern" },
  { id: "plate", name: "Armor Plate", icon: "⛨", price: 15, desc: "+35 armor" },
  { id: "m-cracked", name: "Cracked Mirror", icon: "◐", price: 15, desc: "Freezes her 3s", tier: "cracked" },
  { id: "m-silver", name: "Silver Mirror", icon: "◯", price: 32, desc: "Freezes her 6s", tier: "silver" },
  { id: "m-gilded", name: "Gilded Mirror", icon: "✦", price: 60, desc: "Freezes her 10s", tier: "gilded" },
  { id: "bolts", name: "Silver Bolts ×8", icon: "➶", price: 10, desc: "Crossbow ammunition" },
  { id: "tonic", name: "Speed Tonic", icon: "⚡", price: 12, desc: "Run 1.5× for 15s" },
  { id: "swap", name: "Weapon Swap", icon: "⚔", price: 20, desc: "Trade for any weapon" }
];
const UPGRADES = [
  { id: "heart", name: "Iron Heart", icon: "♥", prices: [50, 80, 120], desc: "+15 max health per level" },
  { id: "edge", name: "Whetstone", icon: "⚒", prices: [50, 80, 120], desc: "+12% weapon damage per level" },
  { id: "wick", name: "Wider Wick", icon: "☼", prices: [40, 70, 100], desc: "+12% lantern reach per level" },
  { id: "glass", name: "Silvered Glass", icon: "❖", prices: [60, 90, 130], desc: "+1s mirror freeze per level" }
];
let shopSel = null;
function shopCoins() { return player ? Math.floor(player.coins) : 0; }
function shopBlock(it) {
  // Returns a reason string if the item can't be bought right now (besides price).
  const w = WEAPONS[player.weapon];
  if (it.id === "potion" && player.health >= player.maxHealth) return "Health full";
  if (it.id === "salts" && player.sanity >= 100) return "Sanity full";
  if (it.id === "oil" && player.oil >= 100) return "Lamp full";
  if (it.id === "plate" && player.armor >= 100) return "Armor full";
  if (it.id === "bolts" && w.kind !== "ranged") return "Crossbow only";
  if (it.id === "bolts" && player.ammo >= w.maxAmmo) return "Quiver full";
  return null;
}
function upgradePrice(u) { const lv = upgrades[u.id] || 0; return lv >= u.prices.length ? null : u.prices[lv]; }
function openShop(ctx) {
  if (!player) return;
  shopCtx = ctx;
  shopPrevMode = mode;
  mode = "SHOP";
  attackHeld = false;
  shopSel = null;
  $("shop-sub").textContent = ctx === "between"
    ? "“The road to the graveyards is long. Spend wisely, little lamb.”"
    : "“Coins for comfort. She cannot see you while we trade.”";
  renderShop();
  $("screen-shop").classList.remove("hidden");
  sound.playShopOpen();
}
function closeShop() {
  $("screen-shop").classList.add("hidden");
  if (shopCtx === "between") {
    if (carryOver) carryOver.coins = player.coins;
    mode = "STAGECLEAR";
    screenStageShow();
  } else {
    mode = "PLAYING";
    updateHud();
  }
  shopSel = null;
}
function renderShop() {
  $("shop-coins").textContent = String(shopCoins());
  const items = SHOP_ITEMS.filter((it) => shopCtx === "field" || !it.field);
  const card = (key, icon, name, desc, price, extra = "", blocked = null) => {
    const poor = price !== null && shopCoins() < price;
    const cls = ["shop-item", blocked ? "blocked" : "", poor ? "poor" : "", shopSel === key ? "selected" : ""].join(" ");
    return `<button class="${cls}" type="button" data-key="${key}">
      <span class="shop-icon">${icon}</span>
      <span class="shop-text"><span class="shop-name">${name}</span><span class="shop-desc">${blocked || desc}</span>${extra}</span>
      <span class="shop-price">${price === null ? "MAX" : `◉${price}`}</span>
    </button>`;
  };
  $("shop-items").innerHTML = items.map((it) => card(it.id, it.icon, it.name, it.desc, it.price, "", shopBlock(it))).join("");
  $("shop-upgrades").innerHTML = UPGRADES.map((u) => {
    const lv = upgrades[u.id] || 0;
    const pips = `<span class="shop-pips">${[0, 1, 2].map((i) => `<i class="${i < lv ? "on" : ""}"></i>`).join("")}</span>`;
    return card("up-" + u.id, u.icon, u.name, u.desc, upgradePrice(u), pips, lv >= u.prices.length ? "Mastered" : null);
  }).join("");
  document.querySelectorAll("#screen-shop .shop-item").forEach((el) => el.addEventListener("click", () => selectShopItem(el.dataset.key, el)));
  updateShopConfirm();
}
function shopLookup(key) {
  if (key.startsWith("up-")) {
    const u = UPGRADES.find((q) => "up-" + q.id === key);
    return u ? { name: `${u.name} ${["I", "II", "III"][upgrades[u.id] || 0] || ""}`.trim(), price: upgradePrice(u), blocked: upgradePrice(u) === null ? "Mastered" : null, up: u } : null;
  }
  const it = SHOP_ITEMS.find((q) => q.id === key);
  return it ? { name: it.name, price: it.price, blocked: shopBlock(it), it } : null;
}
function shopDeny(el, msg) {
  sound.playDeny();
  const fb = $("shop-feedback");
  fb.textContent = msg;
  fb.className = "shop-feedback deny";
  if (el) { el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake"); }
}
function selectShopItem(key, el) {
  const L = shopLookup(key);
  if (!L) return;
  if (L.blocked) { shopSel = null; renderShop(); shopDeny(document.querySelector(`#screen-shop [data-key="${key}"]`), `${L.name}: ${L.blocked.toLowerCase()}.`); return; }
  if (shopCoins() < L.price) {
    shopSel = null;
    renderShop();
    shopDeny(document.querySelector(`#screen-shop [data-key="${key}"]`), `Not enough coins — ${L.name} costs ◉${L.price}, you have ◉${shopCoins()}.`);
    return;
  }
  shopSel = key;
  sound.playUiTick();
  renderShop();
}
function updateShopConfirm() {
  const bar = $("shop-confirm");
  const fb = $("shop-feedback");
  if (!shopSel) { bar.classList.add("hidden"); return; }
  const L = shopLookup(shopSel);
  bar.classList.remove("hidden");
  $("shop-confirm-text").textContent = `Buy ${L.name} for ◉${L.price}?`;
  fb.textContent = "";
  fb.className = "shop-feedback";
}
function buyShopItem(key) {
  const L = shopLookup(key);
  if (!L || L.blocked || L.price === null) return false;
  if (shopCoins() < L.price) { shopDeny(null, `Not enough coins — need ◉${L.price - shopCoins()} more.`); return false; }
  player.coins -= L.price;
  let msg = `Bought ${L.name}.`;
  if (L.up) {
    upgrades[L.up.id] = (upgrades[L.up.id] || 0) + 1;
    lsSet(LS_UP, upgrades);
    applyUpgrades(L.up.id);
    msg = `${L.up.name} is now level ${upgrades[L.up.id]} — permanent.`;
  } else {
    const it = L.it;
    if (it.id === "potion") player.health = Math.min(player.maxHealth, player.health + 50);
    else if (it.id === "salts") player.sanity = Math.min(100, player.sanity + 40);
    else if (it.id === "oil") player.oil = 100;
    else if (it.id === "plate") player.armor = Math.min(100, player.armor + 35);
    else if (it.tier) { player.mirrors[it.tier] += 1; renderMirrorHud(false, it.tier); }
    else if (it.id === "bolts") { const w = WEAPONS[player.weapon]; player.ammo = Math.min(w.maxAmmo, player.ammo + 8); }
    else if (it.id === "tonic") { player.speedBoost = 15; player.darkCurse = 0; if (carryOver && shopCtx === "between") carryOver.speedBoost = 15; }
    else if (it.id === "swap") {
      sound.playShopBuy();
      if (shopCtx === "between" && carryOver) carryOver.coins = player.coins;
      savePursePostBuy();
      $("screen-shop").classList.add("hidden");
      tokenReturn = () => { mode = "SHOP"; renderShop(); $("screen-shop").classList.remove("hidden"); };
      openTokenPicker();
      return true;
    }
  }
  if (shopCtx === "between" && carryOver) {
    carryOver.coins = player.coins;
    carryOver.armor = player.armor; carryOver.ammo = player.ammo; carryOver.mirrors = { ...player.mirrors };
  }
  savePursePostBuy();
  sound.playShopBuy();
  shopSel = null;
  renderShop();
  const fb = $("shop-feedback");
  fb.textContent = msg;
  fb.className = "shop-feedback ok";
  if (hudCoinVal) hudCoinVal.textContent = String(player.coins | 0);
  return true;
}
function savePursePostBuy() {
  // Between stages the purse is the source of truth; mid-run it settles at death/escape.
  if (shopCtx === "between") savePurse(player.coins);
}
function applyUpgrades(changed = null) {
  if (!player) return;
  const mh = maxHealthFor();
  if (changed === "heart") player.health = Math.min(mh, player.health + 15);
  player.maxHealth = mh;
  player.lanternMul = lanternMul();
}
if ($("btn-shop-buy")) $("btn-shop-buy").addEventListener("click", () => { if (shopSel) buyShopItem(shopSel); });
if ($("btn-shop-cancel")) $("btn-shop-cancel").addEventListener("click", () => { shopSel = null; renderShop(); });
if ($("btn-shop-close")) $("btn-shop-close").addEventListener("click", closeShop);

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
  const pl = $("hud-pages-label");
  if (pl && pl.textContent !== (level.collectShort || "LEDGER")) pl.textContent = level.collectShort || "LEDGER";
  if (hudCoinVal) hudCoinVal.textContent = String(player.coins | 0);
  if (hudKillVal) {
    const next = KEY_KILLS.find((k) => kills < k);
    hudKillVal.textContent = next ? `${kills}/${next}` : String(kills);
  }
  for (const n of [1, 2]) {
    const el = hudKeySlots[n];
    if (!el) continue;
    const st = player.keys[n];
    el.classList.toggle("held", st === "held");
    el.classList.toggle("used", st === "used");
  }
  if (hudArmorBar) {
    const ar = Math.max(0, Math.min(100, player.armor));
    hudArmorBar.style.width = `${ar}%`;
    hudArmorVal.textContent = `${Math.ceil(ar)}`;
  }
  updatePuzzleHud();
  const mh = player.maxHealth || 100;
  const hp = Math.max(0, Math.min(mh, player.health));
  const sanityPct = Math.max(0, Math.min(100, player.sanity));
  const oilPct = Math.max(0, Math.min(100, player.oil));
  hudHealthBar.style.width = `${(hp / mh) * 100}%`;
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
    if (nearbyContext.type === "page") interactLabel.textContent = level.stage === 2 ? "RUB" : "READ";
    else if (nearbyContext.type === "merchant") interactLabel.textContent = "SHOP";
    else if (nearbyContext.type === "coffin") interactLabel.textContent = "REST";
    else if (nearbyContext.type === "bell") interactLabel.textContent = "RING";
    else if (nearbyContext.type === "alcove") interactLabel.textContent = "HIDE";
    else if (nearbyContext.type === "well") interactLabel.textContent = "TOSS";
    else if (nearbyContext.type === "secret") interactLabel.textContent = "SEARCH";
    else if (nearbyContext.type === "door") interactLabel.textContent = player.keys[nearbyContext.obj.keyNo] === "held" ? "UNLOCK" : "LOCKED";
    else if (nearbyContext.type === "candle") interactLabel.textContent = "LIGHT";
    else if (nearbyContext.type === "plate") interactLabel.textContent = "PRESS";
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
const ROOM_COLORS = { ward: "#3b3540", chapel: "#38324a", kitchens: "#4a3a2a", hall: "#4a2a30", torture: "#4a1a20", north: "#3a3a44", candles: "#4a3a18", crush: "#4a1e2a",
  gatehouse: "#3a3e48", mausoleum: "#34383a", cryptyard: "#3a3a40", orchard: "#2e3a2a", bonepit: "#4a4234", chapelyard: "#2c3a30", crypt: "#4a3a18", flood: "#1e3a44" };
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
  // locked chambers: door marker + padlock state
  for (const lr of level.lockedRooms) {
    const [dx, dy] = lr.door;
    const held = player.keys[lr.keyNo] === "held";
    mm.fillStyle = lr.solved ? "#7dff9a" : lr.unlocked ? "#e7c873" : held ? (Math.sin(t * 6) > 0 ? "#ffd86a" : "#8a6a20") : "#c41230";
    mm.fillRect(dx - 1, dy, 3, 1);
    if (!lr.unlocked) {
      mm.globalAlpha = 0.35;
      mm.fillStyle = "#000";
      mm.fillRect(lr.room.x0, lr.room.y0, lr.room.x1 - lr.room.x0 + 1, lr.room.y1 - lr.room.y0 + 1);
      mm.globalAlpha = 1;
    }
  }
  // well / fountain
  if (level.well) {
    mm.fillStyle = level.well.fountain ? "#4aa080" : "#6a88aa";
    mm.fillRect(level.well.tx, level.well.ty, 1, 1);
  }
  // open graves (Stage II hazard)
  if (level.graves) {
    mm.fillStyle = "#6a4a2a";
    for (const g of level.graves) mm.fillRect(g.tx, g.ty, 1, 1);
  }
  // the Hooded Pedlar
  if (level.merchant) {
    mm.fillStyle = Math.sin(t * 3) > 0 ? "#ffb050" : "#a86a20";
    mm.fillRect(level.merchant.tx - 0.5, level.merchant.ty - 0.5, 2, 2);
  }
  // player
  mm.fillStyle = "#ffffff";
  mm.fillRect(Math.floor(player.x / TILE_SIZE) - 0.5, Math.floor(player.y / TILE_SIZE) - 0.5, 2, 2);
}

// ---------------------------------------------------------------- spawning
function pickMonsterType() {
  const r = Math.random();
  if (level && level.stage === 2) {
    if (elapsed < 20) return "skeleton";
    if (elapsed < 60) return r < 0.6 ? "skeleton" : r < 0.85 ? "banshee" : "brute";
    return r < 0.45 ? "skeleton" : r < 0.75 ? "banshee" : "brute";
  }
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
  if (!quiet && d < TILE_SIZE * 22) toast(`${MONSTER_TYPES[type].name} ${type === "skeleton" ? "claws up out of the earth" : "rises"}${room ? ` in the ${room.name}` : ""}…`, 2.2);
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
  if (!quiet) toast(level.well.fountain ? "A Well Dweller drags herself out of the fountain…" : "A Well Dweller crawls from the black water…", 3);
  shake = Math.max(shake, 0.4);
  return m;
}

function showBoon(kind, title, sub, secs = 3.4) {
  if (!boonBanner) return;
  boonBanner.className = "boon-banner " + kind + (inPuzzle ? " low" : "");
  boonTitle.textContent = title;
  boonSub.textContent = sub;
  boonBanner.classList.remove("hidden");
  boonTimer = secs;
}

function tossWell(forced = null) {
  if (mode !== "PLAYING" || !player) return false;
  sound.init();
  if (player.coins < 5) {
    toast(level.well.fountain ? "The black fountain wants an offering of 5 coins." : "The well wants an offering of 5 coins.");
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
    showBoon("curse", "DARKNESS CURSE", `The ${level.well.fountain ? "fountain" : "well"} drinks the light. Your lantern shrinks for 15s.`);
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

// ---------------------------------------------------------------- locked chambers (v0.5)
const PUZZLE_REWARDS = {
  candles: { tier: "gilded", coins: 30, text: "Gilded mirror · 30 coins · Sanity restored" },
  crush: { tier: "obsidian", coins: 40, text: "Obsidian mirror · 40 coins · Full armor" },
  crypt: { tier: "gilded", coins: 35, text: "Gilded mirror · 35 coins · Sanity restored" },
  flood: { tier: "obsidian", coins: 45, text: "Obsidian mirror · 45 coins · Full armor" }
};
const kindOf = (lr) => lr.kind || lr.key;
const isOrderPuzzle = (lr) => kindOf(lr) === "candles" || kindOf(lr) === "crypt";

function inRoomRect(r, x, y) {
  const tx = Math.floor(x / TILE_SIZE), ty = Math.floor(y / TILE_SIZE);
  return tx >= r.x0 && tx <= r.x1 && ty >= r.y0 && ty <= r.y1;
}

function tryUnlock(lr) {
  if (!lr || lr.unlocked) return;
  const roman = lr.numeral;
  if (player.keys[lr.keyNo] !== "held") {
    const need = KEY_KILLS[lr.keyNo - 1];
    toast(`Locked. Requires Key ${roman} — it falls after ${need} kills (${Math.min(kills, need)}/${need}).`, 3);
    return;
  }
  player.keys[lr.keyNo] = "used";
  lr.unlocked = true;
  setDoor(level, lr, true);
  pathing.invalidate();
  sound.playUnlock();
  shake = Math.max(shake, 0.6);
  fx.push({ type: "spark", x: lr.doorX, y: lr.doorY, n: 18, color: 0xffd86a });
  toast(`Key ${roman} turns… the ${lr.name} grinds open.`, 3);
}

function showRiddle(lr) {
  loreNum.textContent = `RIDDLE · KEY ${lr.numeral}`;
  if (loreSeal) loreSeal.textContent = "THE DOOR IS SEALED";
  loreTitle.textContent = lr.riddleTitle;
  loreBody.textContent = lr.riddle.join("\n");
  loreBody.classList.add("riddle");
  lorePostscript.textContent = {
    candles: "Each candle has a carved sign on the floor before it. Light all six in the right order with your taper. A wrong flame snuffs them all.",
    crush: "Press the four glyph plates in the right order before the walls meet. A wrong plate resets them — and the walls lurch closer.",
    crypt: "Five coffins, each with a brass plaque. Tap REST at each to close its lid in the right order. A wrong lid wakes its sleeper — and every lid slides open again.",
    flood: "Four bells hang in the water: silver, bronze, iron and bone. Ring them in the right order before the water closes over your head. A wrong bell makes the water surge."
  }[kindOf(lr)];
  lorePostscript.classList.remove("hidden");
  loreCloseBtn.textContent = lr.active ? "I UNDERSTAND" : "CLOSE";
  mode = "LORE";
  screenLore.classList.remove("hidden");
}
if (btnRiddle) btnRiddle.addEventListener("click", () => { if (mode === "PLAYING" && inPuzzle) showRiddle(inPuzzle); });

function startPuzzle(lr) {
  inPuzzle = lr;
  lr.active = true;
  lr.progress = 0;
  lr.wallInset = 0;
  for (const it of lr.items) { it.lit = false; it.pressed = false; it.ringT = 0; it.shake = 0; }
  setDoor(level, lr, false);
  resolveCircleWallCollision(level, player, player.radius, player.pagesFound >= 5);
  pathing.invalidate();
  sound.playDoorSlam();
  shake = Math.max(shake, 0.9);
  // Banish anything that followed you in — this is about the puzzle.
  for (const m of monsters) {
    if (!m.dead && inRoomRect(lr.room, m.x, m.y)) { m.remove = true; fx.push({ type: "mist", x: m.x, y: m.y }); }
  }
  monsters = monsters.filter((m) => !m.remove);
  projectiles = [];
  const k = kindOf(lr);
  if (k === "candles") {
    player.hasTaper = true;
    toast("The door slams shut. A lit taper waits in your hand.", 3);
  } else if (k === "crypt") {
    toast("The crypt door grinds shut. Five lids lie open…", 3);
  } else if (k === "flood") {
    grindTimer = 0;
    toast("The door seals — black water starts pouring in!", 3);
  } else {
    grindTimer = 0;
    toast("The door slams shut — the walls begin to move!", 3);
  }
  showRiddle(lr);
}

function failPuzzleStep(lr) {
  lr.failCount += 1;
  lr.progress = 0;
  shake = Math.max(shake, 0.8);
  const k = kindOf(lr);
  if (k === "crypt") {
    for (const it of lr.items) { it.lit = false; it.shake = 0.6; }
    sound.playSnuff();
    sound.playCoffin(false);
    toast("Wrong sleeper! Every lid slides open — and one of them climbs out…", 3);
    const c = { x: (lr.room.x0 + lr.room.x1 + 1) / 2 * TILE_SIZE, y: (lr.room.y0 + lr.room.y1 + 1) / 2 * TILE_SIZE + TILE_SIZE };
    const m = new Monster("skeleton", c.x, c.y);
    m.timer = 0.8;
    m.hp = m.maxHp = 22; // a frail one
    monsters.push(m);
    fx.push({ type: "mist", x: c.x, y: c.y });
  } else if (k === "flood") {
    for (const it of lr.items) it.pressed = false;
    lr.wallInset = Math.min(1, lr.wallInset + 0.12);
    sound.playSnuff();
    sound.playSurge();
    toast("Wrong bell! The bells fall silent — and the water surges!", 3);
  } else if (k === "candles") {
    for (const it of lr.items) it.lit = false;
    sound.playSnuff();
    toast("Wrong hour — every flame gutters out. Something stirs in the smoke…", 3);
    const c = { x: (13 + 0.5) * TILE_SIZE, y: (51 + 0.5) * TILE_SIZE };
    const m = new Monster("slimelet", c.x, c.y);
    m.timer = 0.6;
    monsters.push(m);
    fx.push({ type: "slime", x: c.x, y: c.y });
  } else {
    for (const it of lr.items) it.pressed = false;
    lr.wallInset = Math.min(crushMaxInset(lr), lr.wallInset + 14);
    sound.playSnuff();
    sound.playGrind();
    toast("Wrong plate! The plates reset — and the walls lurch closer!", 3);
  }
}

function lightCandle(it) {
  const lr = inPuzzle;
  if (!lr || lr.key !== "candles" || it.lit) return;
  if (!player.hasTaper) return;
  const want = lr.order[lr.progress];
  if (it.sym !== want) { fx.push({ type: "spark", x: it.x, y: it.y, n: 8, color: 0x6a7a8a }); failPuzzleStep(lr); return; }
  it.lit = true;
  lr.progress += 1;
  sound.playCandle(true);
  fx.push({ type: "spark", x: it.x, y: it.y, h: 1.0, n: 12, color: 0xffb060 });
  if (lr.progress >= lr.order.length) solvePuzzle(lr);
  else toast(`The ${PUZZLE_GLYPHS[it.sym]} candle catches. (${lr.progress}/${lr.order.length})`, 1.8);
}

function pressPlate(it) {
  const lr = inPuzzle;
  if (!lr || lr.key !== "crush" || it.pressed) return;
  const want = lr.order[lr.progress];
  if (it.sym !== want) { fx.push({ type: "spark", x: it.x, y: it.y, n: 10, color: 0xc41230 }); failPuzzleStep(lr); return; }
  it.pressed = true;
  lr.progress += 1;
  sound.playPlate();
  fx.push({ type: "spark", x: it.x, y: it.y, h: 0.8, n: 12, color: 0x7ec8e8 });
  if (lr.progress >= lr.order.length) solvePuzzle(lr);
  else toast(`The ${PUZZLE_GLYPHS[it.sym]} plate sinks into the floor. (${lr.progress}/${lr.order.length})`, 1.8);
}

function restCoffin(it) {
  const lr = inPuzzle;
  if (!lr || kindOf(lr) !== "crypt" || it.lit) return;
  const want = lr.order[lr.progress];
  if (it.sym !== want) { fx.push({ type: "spark", x: it.x, y: it.y, n: 8, color: 0x8a9aa8 }); failPuzzleStep(lr); return; }
  it.lit = true;
  lr.progress += 1;
  sound.playCoffin(true);
  fx.push({ type: "spark", x: it.x, y: it.y, h: 1.0, n: 12, color: 0xffc060 });
  if (lr.progress >= lr.order.length) solvePuzzle(lr);
  else toast(`The lid marked ${PUZZLE_GLYPHS[it.sym]} slides shut. (${lr.progress}/${lr.order.length})`, 1.8);
}

function ringBell(it) {
  const lr = inPuzzle;
  if (!lr || kindOf(lr) !== "flood" || it.pressed) return;
  it.ringT = 1.2;
  const want = lr.order[lr.progress];
  sound.playBell(it.sym);
  if (it.sym !== want) { fx.push({ type: "spark", x: it.x, y: it.y, h: 1.8, n: 10, color: 0x4aa0b0 }); failPuzzleStep(lr); return; }
  it.pressed = true;
  lr.progress += 1;
  fx.push({ type: "spark", x: it.x, y: it.y, h: 1.8, n: 12, color: 0xd8e0ea });
  if (lr.progress >= lr.order.length) solvePuzzle(lr);
  else toast(`The ${PUZZLE_GLYPHS[it.sym]} bell tolls. (${lr.progress}/${lr.order.length})`, 1.8);
}

function solvePuzzle(lr) {
  lr.solved = true;
  lr.active = false;
  inPuzzle = null;
  player.hasTaper = false;
  setDoor(level, lr, true);
  pathing.invalidate();
  sound.playSolve();
  shake = Math.max(shake, 0.7);
  const R = PUZZLE_REWARDS[lr.key];
  player.mirrors[R.tier] += 1;
  player.coins += R.coins;
  if (isOrderPuzzle(lr)) player.sanity = 100;
  else player.armor = 100;
  renderMirrorHud(false, R.tier);
  fx.push({ type: "pickup", x: player.x, y: player.y, color: 0xffd86a });
  showBoon("key", `${lr.name.toUpperCase()} SOLVED`, `The door opens. Reward: ${R.text}.`, 4.5);
  buildMinimapBase();
}

function crushMaxInset(lr) {
  const w = (lr.room.x1 - lr.room.x0 + 1) * TILE_SIZE;
  return w / 2;
}

function updatePuzzles(dt) {
  for (const lr of level.lockedRooms) {
    // Walk fully inside an unlocked, unsolved chamber and it seals behind you.
    if (!inPuzzle && lr.unlocked && !lr.solved && !lr.active && !player.hidden) {
      const ty = Math.floor(player.y / TILE_SIZE);
      if (inRoomRect(lr.room, player.x, player.y) && ty >= lr.room.y0 && player.y > lr.room.y0 * TILE_SIZE + player.radius + 2) startPuzzle(lr);
    }
    if (lr.key === "crush" && lr.solved && lr.wallInset > 0) lr.wallInset = Math.max(0, lr.wallInset - 130 * dt);
    if (kindOf(lr) === "flood" && lr.solved && lr.wallInset > 0) lr.wallInset = Math.max(0, lr.wallInset - 0.5 * dt);
  }
  const lr = inPuzzle;
  if (lr && kindOf(lr) === "flood") {
    // Water rises to drowning depth over closeSecs.
    lr.wallInset = Math.min(1, lr.wallInset + dt / lr.closeSecs);
    grindTimer -= dt;
    if (grindTimer <= 0) { grindTimer = 1.6; sound.playWater(); }
    if (lr.wallInset >= 0.94) {
      shake = 1.0;
      handleDeath("The Drowned Mausoleum filled to the roof. The bells rang for you.");
    }
    return;
  }
  if (!lr || lr.key !== "crush") return;
  const maxIn = crushMaxInset(lr);
  lr.wallInset = Math.min(maxIn, lr.wallInset + (maxIn / lr.closeSecs) * dt);
  grindTimer -= dt;
  if (grindTimer <= 0) { grindTimer = 1.1; sound.playGrind(); shake = Math.max(shake, 0.28); }
  const L = lr.room.x0 * TILE_SIZE + lr.wallInset;
  const R = (lr.room.x1 + 1) * TILE_SIZE - lr.wallInset;
  if (player.x < L + player.radius) player.x = L + player.radius;
  if (player.x > R - player.radius) player.x = R - player.radius;
  for (const m of monsters) { if (!m.dead && inRoomRect(lr.room, m.x, m.y)) m.x = Math.max(L + m.radius, Math.min(R - m.radius, m.x)); }
  if (R - L < player.radius * 2 + 4) {
    shake = 1.2;
    handleDeath("The Crushing Hall closed its stone hands around you.");
  }
}

function floodSecondsLeft(lr) { return Math.max(0, (0.94 - lr.wallInset) * lr.closeSecs); }
function crushSecondsLeft(lr) {
  const maxIn = crushMaxInset(lr) - player.radius - 2;
  return Math.max(0, (maxIn - lr.wallInset) / (crushMaxInset(lr) / lr.closeSecs));
}

function updatePuzzleHud() {
  if (!puzzleHud) return;
  const lr = inPuzzle;
  if (!lr || mode === "DEAD") { puzzleHud.classList.add("hidden"); return; }
  puzzleHud.classList.remove("hidden");
  puzzleHud.className = `puzzle-hud ${lr.key}`;
  puzzleTitle.textContent = lr.name.toUpperCase();
  if (kindOf(lr) === "crypt") {
    puzzleInfo.textContent = `Coffins at rest ${lr.progress} / ${lr.order.length}`;
    puzzleFill.style.width = `${(lr.progress / lr.order.length) * 100}%`;
    puzzleHud.classList.remove("urgent");
  } else if (kindOf(lr) === "flood") {
    const secs = floodSecondsLeft(lr);
    puzzleInfo.textContent = `Bells ${lr.progress} / ${lr.order.length} · water at ${Math.round(lr.wallInset * 100)}% · ${Math.ceil(secs)}s`;
    puzzleFill.style.width = `${Math.max(0, 1 - lr.wallInset / 0.94) * 100}%`;
    puzzleHud.classList.toggle("urgent", secs < 10);
  } else if (lr.key === "candles") {
    puzzleInfo.textContent = `Candles lit ${lr.progress} / ${lr.order.length}`;
    puzzleFill.style.width = `${(lr.progress / lr.order.length) * 100}%`;
  } else {
    const secs = crushSecondsLeft(lr);
    puzzleInfo.textContent = `Plates ${lr.progress} / ${lr.order.length} · walls meet in ${Math.ceil(secs)}s`;
    puzzleFill.style.width = `${Math.max(0, 1 - lr.wallInset / crushMaxInset(lr)) * 100}%`;
    puzzleHud.classList.toggle("urgent", secs < 10);
  }
}

// ---------------------------------------------------------------- damage
function damagePlayer(amount, fromX, fromY, reason) {
  if (player.hidden || player.invuln > 0 || mode !== "PLAYING") return;
  if (player.armor > 0) {
    const soak = Math.min(player.armor, amount);
    player.armor -= soak;
    amount -= soak;
    fx.push({ type: "spark", x: player.x, y: player.y, n: 10, color: 0x9fc4e8 });
    sound.playClang();
    if (player.armor <= 0) toast("Your armor is shattered!", 2);
  }
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
  dweller: "The Well Dweller dragged you into the black water.",
  skeleton: "The grave-risen pulled you down to lie among them.",
  brute: "The Gravedigger's spade came down — and he began to dig.",
  banshee: "The banshee's wail was the last thing you heard.",
  slime: "The slime swallowed your lantern, then you.",
  slimelet: "The slimes swarmed you in the dark."
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
  if (player.slowT > 0) player.slowT = Math.max(0, player.slowT - dt);
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
    const slow = (player.sanity < 25 ? 0.88 : 1) * (player.attackAnim > 0.5 && player.weapon === "mace" ? 0.6 : 1) * (player.speedBoost > 0 ? 1.5 : 1)
      * (player.slowT > 0 ? 0.55 : 1) * (inPuzzle && kindOf(inPuzzle) === "flood" ? 1 - 0.45 * inPuzzle.wallInset : 1);
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
    player.health = Math.min(player.maxHealth, player.health + 4 * dt);
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

  // Grave hands (Stage II): open graves grab at anyone who walks too close.
  if (level.graves && level.graves.length) {
    for (const g of level.graves) {
      if (g.cd > 0) g.cd -= dt;
      const d = Math.hypot(g.x - player.x, g.y - player.y);
      if (g.grab > 0) g.grab = Math.max(0, g.grab - dt * 0.7);
      if (player.hidden || inPuzzle) continue;
      if (d < 88 && g.grab < 0.22) g.grab = 0.22; // fingers peek over the edge — a warning
      if (d < 50 && g.cd <= 0) {
        g.grab = 1;
        g.cd = 4;
        sound.playHands();
        fx.push({ type: "spark", x: g.x, y: g.y, h: 0.6, n: 12, color: 0x6a5a40 });
        player.slowT = Math.max(player.slowT, 1.3);
        damagePlayer(6, g.x, g.y, "Hands from an open grave dragged you down into the dirt.");
        if (!warnedHands) { warnedHands = true; toast("HANDS FROM THE GRAVE! Give open graves a wide berth.", 3); }
        if (mode !== "PLAYING") return;
      }
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
  if (inPuzzle) {
    let best = null, bd = inPuzzle.key === "candles" ? 50 : kindOf(inPuzzle) === "crypt" ? 52 : kindOf(inPuzzle) === "flood" ? 58 : 54;
    for (const it of inPuzzle.items) {
      if (it.lit || it.pressed) continue;
      const d = Math.hypot(it.x - player.x, it.y - player.y);
      if (d < bd) { bd = d; best = it; }
    }
    if (best) {
      const name = PUZZLE_GLYPHS[best.sym];
      if (kindOf(inPuzzle) === "crypt") {
        nearbyContext = { type: "coffin", obj: best };
        promptText = `Tap REST — the coffin marked ${best.sym} (${inPuzzle.progress}/${inPuzzle.order.length})`;
      } else if (kindOf(inPuzzle) === "flood") {
        nearbyContext = { type: "bell", obj: best };
        promptText = `Tap RING — the ${name} bell (${inPuzzle.progress}/${inPuzzle.order.length})`;
      } else if (inPuzzle.key === "candles") {
        nearbyContext = { type: "candle", obj: best };
        promptText = `Tap LIGHT — candle marked ${name} (${inPuzzle.progress}/${inPuzzle.order.length} lit)`;
      } else {
        nearbyContext = { type: "plate", obj: best };
        promptText = `Tap PRESS — the ${name} plate (${inPuzzle.progress}/${inPuzzle.order.length})`;
      }
    }
  }
  if (!nearbyContext && !player.hidden) {
    for (const lr of level.lockedRooms) {
      if (lr.unlocked) continue;
      if (player.y < lr.doorY && Math.hypot(lr.doorX - player.x, lr.doorY - player.y) < 92) {
        nearbyContext = { type: "door", obj: lr };
        const need = KEY_KILLS[lr.keyNo - 1];
        promptText = player.keys[lr.keyNo] === "held"
          ? `Tap UNLOCK — Key ${lr.numeral} · ${lr.name}`
          : `${lr.name} — Requires Key ${lr.numeral} (${Math.min(kills, need)}/${need} kills)`;
        break;
      }
    }
  }
  for (const p of level.pages) {
    if (!p.collected && Math.hypot(p.x - player.x, p.y - player.y) < 34) {
      nearbyContext = { type: "page", obj: p };
      promptText = level.stage === 2 ? `Tap RUB — ${p.lore.num}` : `Tap READ — ${p.lore.num}`;
      break;
    }
  }
  if (!nearbyContext && !player.hidden) {
    for (const a of level.alcoves) {
      if (Math.hypot(a.x - player.x, a.y - player.y) < 32) {
        nearbyContext = { type: "alcove", obj: a };
        promptText = level.stage === 2 ? "Tap HIDE — Crypt Niche" : "Tap HIDE — Iron Alcove";
        break;
      }
    }
  }
  if (!nearbyContext && !player.hidden && level.well && Math.hypot(level.well.x - player.x, level.well.y - player.y) < 52) {
    nearbyContext = { type: "well", obj: level.well };
    const wn = level.well.fountain ? "black fountain" : "well";
    promptText = player.coins >= 5 ? `Tap TOSS — Offer 5 coins to the ${wn}` : `The ${wn} wants an offering (5 coins)`;
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
    promptText = player.pagesFound >= 5
      ? (level.stage === 2 ? "Gatehouse Open — Tap ESCAPE!" : "Portcullis Unsealed — Tap ESCAPE!")
      : (level.stage === 2 ? `Gatehouse Sealed (${player.pagesFound}/5 Grave Rubbings)` : `North Gate Sealed (${player.pagesFound}/5 Ledger Pages)`);
  }
  if (!nearbyContext && !player.hidden && level.merchant && Math.hypot(level.merchant.x - player.x, level.merchant.y - player.y) < 62) {
    nearbyContext = { type: "merchant", obj: level.merchant };
    promptText = `Tap SHOP — The Hooded Pedlar (◉${player.coins | 0})`;
  }
  if (player.hidden) promptText = level.stage === 2 ? "Hidden in a Crypt Niche — Tap EXIT to step out" : "Hidden in Iron Alcove — Tap EXIT to step out";
  else if (!promptText && player.inBrazier) promptText = "Warm Brazier — Mending Oil, Sanity & Wounds";
  if (promptText) { promptBanner.textContent = promptText; promptBanner.classList.remove("hidden"); }
  else promptBanner.classList.add("hidden");

  if (player.pagesFound >= 5 && player.y < TILE_SIZE * 0.95 && Math.abs(player.x - level.exitTile.x) < TILE_SIZE * 0.7) {
    handleWin();
    return;
  }

  // Countess
  updatePuzzles(dt);
  if (mode !== "PLAYING") return;
  const seenPlayer = inPuzzle ? { ...player, hidden: true } : player;
  countess.update(dt, level, seenPlayer, {
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
    onKilled: (m) => onMonsterKilled(m),
    onWail: (m) => {
      // Banshee: sanity drain + a slowing chill. Hiding muffles it.
      const d = Math.hypot(m.x - player.x, m.y - player.y);
      sound.playWail();
      fx.push({ type: "spark", x: m.x, y: m.y, h: 1.8, n: 16, color: 0xa8c8f0 });
      if (player.hidden) return;
      const k = Math.max(0.4, 1 - d / 190);
      player.sanity = Math.max(0, player.sanity - 12 * k);
      player.slowT = Math.max(player.slowT, 1.6);
      shake = Math.max(shake, 0.5);
      if (!warnedWail) { warnedWail = true; toast("A BANSHEE'S WAIL — it chills your blood and slows your legs. Kill her fast!", 3.2); }
    }
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
      if (cell === 3) {
        const b = level.breakables.find((q) => !q.broken && q.tx === tx && q.ty === ty);
        if (b) { p.dead = true; hitBreakable(b, 1); break; }
      }
      if (cell === 1 || cell === 2 || cell === undefined) {
        p.dead = true;
        fx.push({ type: "spark", x: p.x - p.vx * 0.01, y: p.y - p.vy * 0.01, n: 6 });
        sound.playClang();
        break;
      }
      for (const m of monsters) {
        if (m.dead || m.state === "RISE") continue;
        if (Math.hypot(m.x - p.x, m.y - p.y) < m.radius + 6) {
          if (m.hit(w.dmg * dmgMul(), p.x - p.vx * 0.05, p.y - p.vy * 0.05, w.knock)) {
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
  if (!inPuzzle) {
    updateSpawner(dt);
    updateWell(dt);
  }

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
  danger = Math.max(danger, monsterDanger, (1 - player.health / player.maxHealth) * 0.4);
  if (player.sanity <= 0) { handleDeath(level.stage === 2 ? "Your mind came apart in the graveyard fog." : "Your mind fractured inside the dark stones of Csejte."); return; }

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
    darkCurse: player ? player.darkCurse : 0,
    puzzle: inPuzzle
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
refreshTitleStages();

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
    set kills(v) { kills = v; },
    get keysAwarded() { return keysAwarded; },
    get breakables() { return level.breakables; },
    get lockedRooms() { return level.lockedRooms; },
    get puzzle() { return inPuzzle; },
    hitCrate(i, dmg = 1, kind = null) { return hitBreakable(level.breakables[i], dmg, kind); },
    breakCrate(i, kind = null) { return breakBreakable(level.breakables[i], kind); },
    giveKey(n) { player.keys[n] = "held"; },
    unlock(n) { const lr = level.lockedRooms.find((r) => r.keyNo === n); tryUnlock(lr); return !!(lr && lr.unlocked); },
    interact: () => triggerInteract(),
    lightCandle(sym) { const it = inPuzzle && inPuzzle.items.find((q) => q.sym === sym); if (it) lightCandle(it); return inPuzzle ? inPuzzle.progress : -1; },
    pressPlate(sym) { const it = inPuzzle && inPuzzle.items.find((q) => q.sym === sym); if (it) pressPlate(it); return inPuzzle ? inPuzzle.progress : -1; },
    closeLore() { screenLore.classList.add("hidden"); if (mode === "LORE") mode = "PLAYING"; },
    pickWeapon(id) { closeTokenPicker(); swapWeapon(id); },
    hurt(n) { player.invuln = 0; damagePlayer(n, player.x, player.y + 10, "QA"); return [player.health, player.armor]; },
    newRun: () => startNewRun(1),
    // ---- v0.6
    startStage(n = 2, carryCoins = null) {
      if (n === 2) { stage2Unlocked = true; lsSet(LS_S2, true); }
      startNewRun(n);
      if (carryCoins !== null) { player.coins = carryCoins; runStartCoins = carryCoins; }
      return level.stage;
    },
    get stage() { return currentStage; },
    renderer: renderer3d,
    get upgrades() { return { ...upgrades }; },
    get purse() { return loadPurse(); },
    set purse(v) { savePurse(v); },
    get stage2Unlocked() { return stage2Unlocked; },
    resetProgress() { upgrades = { heart: 0, edge: 0, wick: 0, glass: 0 }; lsSet(LS_UP, upgrades); savePurse(0); stage2Unlocked = false; lsSet(LS_S2, false); refreshTitleStages(); },
    setCoins(n) { player.coins = n; if (hudCoinVal) hudCoinVal.textContent = String(n); },
    openShop: (ctx = "field") => openShop(ctx),
    closeShop: () => closeShop(),
    shopSelect(key) { const el = document.querySelector(`#screen-shop [data-key="${key}"]`); if (el) el.click(); return shopSel; },
    shopConfirm() { $("btn-shop-buy").click(); return $("shop-feedback").textContent; },
    get shopFeedback() { return $("shop-feedback").textContent; },
    clearStage() { if (mode !== "PLAYING") mode = "PLAYING"; player.pagesFound = 5; handleWin(); return mode; },
    enterStage2: () => enterStage2(),
    get graves() { return level.graves; },
    get maxHealth() { return player.maxHealth; },
    puzzleAct(sym) {
      const it = inPuzzle && inPuzzle.items.find((q) => q.sym === sym);
      if (!it) return -1;
      const k = kindOf(inPuzzle);
      if (k === "crypt") restCoffin(it); else if (k === "flood") ringBell(it); else if (k === "candles") lightCandle(it); else pressPlate(it);
      return inPuzzle ? inPuzzle.progress : 99;
    },
    set waterLevel(v) { if (inPuzzle) inPuzzle.wallInset = v; },
    get boon() { return boonBanner.classList.contains("hidden") ? null : boonTitle.textContent; },
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

// ?qa&stage=2 — jump straight into the Graveyards (QA only).
{
  const qs = new URLSearchParams(location.search);
  if (qs.has("qa") && qs.get("stage") === "2") {
    stage2Unlocked = true;
    lsSet(LS_S2, true);
    setTimeout(() => { pendingStage = 2; startNewRun(2); }, 50);
  }
}
