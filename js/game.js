import { SoundEngine } from "./audio.js";
import { CURSE_ALERTS, TITLE_WHISPERS } from "./lore.js";
import { createLevel, hasLineOfSight, resolveCircleWallCollision, TILE_SIZE } from "./map.js";
import { Renderer3D } from "./render3d.js";
import { AI_STATE, CountessAI } from "./enemy.js";

const canvas = document.getElementById("game-canvas");
const renderer3d = new Renderer3D(canvas);

const sound = new SoundEngine();

// DOM elements
const hudEl = document.getElementById("hud");
const hudPages = document.getElementById("hud-pages");
const hudStatus = document.getElementById("hud-status");
const hudSanityBar = document.getElementById("hud-sanity-bar");
const hudSanityVal = document.getElementById("hud-sanity-val");
const hudOilBar = document.getElementById("hud-oil-bar");
const hudOilVal = document.getElementById("hud-oil-val");
const promptBanner = document.getElementById("prompt-banner");
const dangerVignette = document.getElementById("danger-vignette");
const sanityGlitch = document.getElementById("sanity-glitch");

const touchControls = document.getElementById("touch-controls");
const joystickZone = document.getElementById("joystick-zone");
const joystickKnob = document.getElementById("joystick-knob");
const btnInteract = document.getElementById("btn-interact");
const interactLabel = document.getElementById("interact-label");
const btnDouse = document.getElementById("btn-douse");
const douseState = document.getElementById("douse-state");
const btnFlare = document.getElementById("btn-flare");
const flareCdEl = document.getElementById("flare-cd");

const screenTitle = document.getElementById("screen-title");
const screenHelp = document.getElementById("screen-help");
const screenLore = document.getElementById("screen-lore");
const screenDeath = document.getElementById("screen-death");
const screenWin = document.getElementById("screen-win");

const chkSound = document.getElementById("chk-sound");
const chkCurse = document.getElementById("chk-curse");
const btnMute = document.getElementById("btn-mute");
const btnPause = document.getElementById("btn-pause");
const btnHelpQuit = document.getElementById("btn-help-quit");

const loreNum = document.getElementById("lore-page-num");
const loreTitle = document.getElementById("lore-title");
const loreBody = document.getElementById("lore-body");
const lorePostscript = document.getElementById("lore-postscript");

// Game state
let mode = "TITLE"; // TITLE, PLAYING, PAUSED, LORE, DEAD, WIN
let level = null;
let countess = null;
let player = null;
let elapsed = 0;
let flareFlash = 0;
let cam = { x: 0, y: 0 };
let dustMotes = [];
let nearbyContext = null; // { type: 'page'|'alcove'|'exit', obj }
let deathEcho = loadDeathEcho();
let curseTimerId = null;

const hourNow = new Date().getHours();
const isWitchingHour = hourNow >= 0 && hourNow < 3;

// Input state
const keys = {};
const joy = { active: false, pointerId: null, originX: 0, originY: 0, dx: 0, dy: 0 };

function loadDeathEcho() {
  try {
    const raw = localStorage.getItem("csejte_death_echo");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveDeathEcho(x, y) {
  try {
    const echo = { x, y };
    localStorage.setItem("csejte_death_echo", JSON.stringify(echo));
    deathEcho = echo;
  } catch {}
}

function clearDeathEcho() {
  try {
    localStorage.removeItem("csejte_death_echo");
  } catch {}
  deathEcho = null;
}

window.addEventListener("resize", () => renderer3d.resize());

// Title screen flavor
(function initTitleFlavor() {
  const whisperEl = document.getElementById("title-whisper");
  whisperEl.textContent = TITLE_WHISPERS[Math.floor(Math.random() * TITLE_WHISPERS.length)];
  if (isWitchingHour) {
    document.getElementById("witching-badge").classList.remove("hidden");
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
})();

function scheduleOptInCurseWhisper() {
  if (curseTimerId) clearTimeout(curseTimerId);
  if (!chkCurse.checked) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  curseTimerId = setTimeout(() => {
    const msg = CURSE_ALERTS[Math.floor(Math.random() * CURSE_ALERTS.length)];
    try {
      new Notification("Csejte: Blood Ledger", {
        body: msg,
        icon: "./icons/icon-192.png",
        silent: true
      });
    } catch {}
  }, 45000);
}

chkCurse.addEventListener("change", async () => {
  if (!chkCurse.checked) {
    if (curseTimerId) clearTimeout(curseTimerId);
    return;
  }
  if (!("Notification" in window)) {
    chkCurse.checked = false;
    return;
  }
  if (Notification.permission === "default") {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      chkCurse.checked = false;
      return;
    }
  } else if (Notification.permission === "denied") {
    chkCurse.checked = false;
    return;
  }
  scheduleOptInCurseWhisper();
});

function setSoundEnabled(val) {
  sound.setEnabled(val);
  chkSound.checked = val;
  btnMute.textContent = val ? "🔊" : "🔇";
}

chkSound.addEventListener("change", () => setSoundEnabled(chkSound.checked));
btnMute.addEventListener("click", () => {
  sound.init();
  setSoundEnabled(!sound.enabled);
});

// Start / Reset game
function startNewRun() {
  sound.init();
  setSoundEnabled(chkSound.checked);
  level = createLevel();
  renderer3d.setLevel(level);
  player = {
    x: level.playerSpawn.x,
    y: level.playerSpawn.y,
    radius: 11,
    angle: -Math.PI / 2,
    speed: 122,
    lanternOn: true,
    oil: 100,
    sanity: 100,
    hidden: false,
    hideSpot: null,
    pagesFound: 0,
    flareCooldown: 0,
    inBrazier: false
  };
  countess = new CountessAI(level.countessSpawn, level.waypoints, isWitchingHour);
  elapsed = 0;
  flareFlash = 0;
  nearbyContext = null;

  dustMotes = Array.from({ length: 42 }, () => ({
    x: Math.random() * level.width,
    y: Math.random() * level.height,
    vx: (Math.random() - 0.5) * 8,
    vy: (Math.random() - 0.5) * 8,
    r: 0.8 + Math.random() * 1.6,
    alpha: 0.2 + Math.random() * 0.45
  }));

  cam.x = player.x;
  cam.y = player.y;

  hideAllScreens();
  hudEl.classList.remove("hidden");
  touchControls.classList.remove("hidden");
  mode = "PLAYING";
  updateHud();
  scheduleOptInCurseWhisper();
}

function hideAllScreens() {
  screenTitle.classList.add("hidden");
  screenHelp.classList.add("hidden");
  screenLore.classList.add("hidden");
  screenDeath.classList.add("hidden");
  screenWin.classList.add("hidden");
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

// UI Buttons
document.getElementById("btn-start").addEventListener("click", startNewRun);
document.getElementById("btn-how").addEventListener("click", () => {
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
document.getElementById("btn-help-close").addEventListener("click", () => {
  screenHelp.classList.add("hidden");
  if (mode === "PAUSED") mode = "PLAYING";
});
btnHelpQuit.addEventListener("click", showTitle);

document.getElementById("btn-lore-close").addEventListener("click", () => {
  screenLore.classList.add("hidden");
  mode = "PLAYING";
});

document.getElementById("btn-retry").addEventListener("click", startNewRun);
document.getElementById("btn-death-title").addEventListener("click", showTitle);
document.getElementById("btn-play-again").addEventListener("click", startNewRun);
document.getElementById("btn-win-title").addEventListener("click", showTitle);

// Gameplay actions
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
  if (d < 175 && hasLineOfSight(level, player.x, player.y, countess.x, countess.y)) {
    countess.stun(1.7);
  } else if (d < 340) {
    countess.alertAt(player.x, player.y);
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

    loreNum.textContent = p.lore.num;
    loreTitle.textContent = p.lore.title;
    loreBody.textContent = p.lore.body;
    if (p.lore.witchingPostscript && isWitchingHour) {
      lorePostscript.textContent = p.lore.witchingPostscript;
      lorePostscript.classList.remove("hidden");
    } else {
      lorePostscript.classList.add("hidden");
    }
    mode = "LORE";
    screenLore.classList.remove("hidden");
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
    if (player.pagesFound >= 5) {
      handleWin();
    }
  }
}

btnDouse.addEventListener("click", toggleDouse);
btnFlare.addEventListener("click", triggerFlare);
btnInteract.addEventListener("click", triggerInteract);

// Keyboard support
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (k === "f") toggleDouse();
  if (k === "q") triggerFlare();
  if (k === "e" || k === " ") {
    if (mode === "PLAYING") e.preventDefault();
    triggerInteract();
  }
  if (k === "escape" && mode === "PLAYING") {
    btnPause.click();
  }
});
window.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});

// Multi-touch Virtual Joystick
function updateJoystickFromPoint(clientX, clientY) {
  const maxR = 42;
  let vx = clientX - joy.originX;
  let vy = clientY - joy.originY;
  const dist = Math.hypot(vx, vy);
  if (dist > maxR) {
    vx = (vx / dist) * maxR;
    vy = (vy / dist) * maxR;
  }
  joy.dx = vx / maxR;
  joy.dy = vy / maxR;
  joystickKnob.style.transform = `translate(${vx}px, ${vy}px)`;
}

joystickZone.addEventListener("pointerdown", (e) => {
  sound.init();
  e.preventDefault();
  const rect = document.getElementById("joystick-base").getBoundingClientRect();
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
  joy.active = false;
  joy.pointerId = null;
  joy.dx = 0;
  joy.dy = 0;
  joystickKnob.style.transform = "translate(0px, 0px)";
}
joystickZone.addEventListener("pointerup", releaseJoystick);
joystickZone.addEventListener("pointercancel", releaseJoystick);

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function handleDeath(reason) {
  if (mode !== "PLAYING") return;
  mode = "DEAD";
  sound.playDeath();
  saveDeathEcho(player.x, player.y);
  hudEl.classList.add("hidden");
  touchControls.classList.add("hidden");
  promptBanner.classList.add("hidden");
  document.getElementById("death-reason").textContent = reason;
  document.getElementById("death-pages").textContent = `${player.pagesFound} / 5`;
  document.getElementById("death-time").textContent = formatTime(elapsed);
  screenDeath.classList.remove("hidden");
}

function handleWin() {
  if (mode !== "PLAYING") return;
  mode = "WIN";
  sound.playWin();
  clearDeathEcho();
  hudEl.classList.add("hidden");
  touchControls.classList.add("hidden");
  promptBanner.classList.add("hidden");
  document.getElementById("win-time").textContent = formatTime(elapsed);
  document.getElementById("win-sanity").textContent = `${Math.max(1, Math.round(player.sanity))}%`;
  screenWin.classList.remove("hidden");
}

function updateHud() {
  if (!player || !countess) return;
  hudPages.textContent = `${player.pagesFound} / 5`;

  const sanityPct = Math.max(0, Math.min(100, player.sanity));
  const oilPct = Math.max(0, Math.min(100, player.oil));
  hudSanityBar.style.width = `${sanityPct}%`;
  hudSanityVal.textContent = `${Math.round(sanityPct)}%`;
  hudOilBar.style.width = `${oilPct}%`;
  hudOilVal.textContent = `${Math.round(oilPct)}%`;

  // Status pill
  hudStatus.className = "hud-pill status-pill";
  if (player.hidden) {
    hudStatus.textContent = "HIDDEN";
    hudStatus.classList.add("hidden-state");
  } else if (countess.state === AI_STATE.HUNT) {
    hudStatus.textContent = "HUNTED";
    hudStatus.classList.add("hunted");
  } else if (countess.state === AI_STATE.INVESTIGATE || countess.state === AI_STATE.SEARCH) {
    hudStatus.textContent = "SEEKING";
    hudStatus.classList.add("investigate");
  } else {
    hudStatus.textContent = "UNSEEN";
    hudStatus.classList.add("unseen");
  }

  // Action buttons state
  douseState.textContent = player.lanternOn ? "LIT" : "DARK";
  if (player.flareCooldown > 0) {
    flareCdEl.textContent = `${Math.ceil(player.flareCooldown)}S`;
    btnFlare.classList.add("disabled");
  } else if (player.oil < 20 || player.hidden) {
    flareCdEl.textContent = "LOW OIL";
    btnFlare.classList.add("disabled");
  } else {
    flareCdEl.textContent = "READY";
    btnFlare.classList.remove("disabled");
  }

  if (player.hidden) {
    interactLabel.textContent = "EXIT";
    btnInteract.classList.add("ready-glow");
  } else if (nearbyContext) {
    btnInteract.classList.add("ready-glow");
    if (nearbyContext.type === "page") interactLabel.textContent = "READ";
    else if (nearbyContext.type === "alcove") interactLabel.textContent = "HIDE";
    else if (nearbyContext.type === "exit") interactLabel.textContent = player.pagesFound >= 5 ? "ESCAPE" : "SEALED";
  } else {
    interactLabel.textContent = "SEARCH";
    btnInteract.classList.remove("ready-glow");
  }
}

function update(dt) {
  if (mode !== "PLAYING") {
    sound.updateAmbience(0, false);
    return;
  }

  elapsed += dt;
  if (flareFlash > 0) flareFlash = Math.max(0, flareFlash - dt * 2.1);
  if (player.flareCooldown > 0) player.flareCooldown = Math.max(0, player.flareCooldown - dt);

  // Movement vector from joystick or keyboard
  let mx = joy.dx;
  let my = joy.dy;
  if (keys["w"] || keys["arrowup"]) my -= 1;
  if (keys["s"] || keys["arrowdown"]) my += 1;
  if (keys["a"] || keys["arrowleft"]) mx -= 1;
  if (keys["d"] || keys["arrowright"]) mx += 1;

  const mag = Math.hypot(mx, my);
  if (!player.hidden && mag > 0.14) {
    const clampedMag = Math.min(1, mag);
    const nx = mx / mag;
    const ny = my / mag;
    const moveSpeed = player.speed * clampedMag * (player.sanity < 25 ? 0.88 : 1);
    player.x += nx * moveSpeed * dt;
    player.y += ny * moveSpeed * dt;
    player.angle = Math.atan2(ny, nx);
    resolveCircleWallCollision(level, player, player.radius, player.pagesFound >= 5);
    sound.playFootstep(clampedMag < 0.55);
  }

  // Lamp oil & Braziers
  player.inBrazier = false;
  for (const b of level.braziers) {
    if (Math.hypot(b.x - player.x, b.y - player.y) < 50) {
      player.inBrazier = true;
      break;
    }
  }

  if (player.inBrazier) {
    player.oil = Math.min(100, player.oil + 36 * dt);
    player.sanity = Math.min(100, player.sanity + 14 * dt);
  } else if (player.lanternOn) {
    player.oil = Math.max(0, player.oil - 1.35 * dt);
    if (player.oil <= 0) {
      player.lanternOn = false;
      sound.playDouse(false);
    }
  } else {
    // Pitch darkness slowly drains sanity
    player.sanity = Math.max(0, player.sanity - (player.hidden ? 1.5 : 2.9) * dt);
  }

  // Cracked glass hazards
  for (const g of level.glass) {
    if (g.cooldown > 0) g.cooldown -= dt;
    if (!player.hidden && g.cooldown <= 0 && Math.hypot(g.x - player.x, g.y - player.y) < 18) {
      g.cooldown = 5.0;
      sound.playGlassCrunch();
      countess.alertAt(g.x, g.y);
      showTransientPrompt("CRACKED GLASS! The Countess heard you.");
    }
  }

  // Find nearest interactable
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

  if (!nearbyContext && Math.hypot(level.exitTile.x - player.x, level.exitTile.y - player.y) < 48) {
    nearbyContext = { type: "exit", obj: level.exitTile };
    promptText = player.pagesFound >= 5
      ? "Portcullis Unsealed — Tap ESCAPE!"
      : `Outer Gate Sealed (${player.pagesFound}/5 Ledger Pages)`;
  }

  if (player.hidden) {
    promptText = "Hidden in Iron Alcove — Tap EXIT to step out";
  } else if (!promptText && player.inBrazier) {
    promptText = "Warm Brazier — Refilling Lamp Oil & Sanity";
  }

  if (promptText) {
    promptBanner.textContent = promptText;
    promptBanner.classList.remove("hidden");
  } else {
    promptBanner.classList.add("hidden");
  }

  // Auto-win if stepped past open gate tile
  if (player.pagesFound >= 5 && player.y < TILE_SIZE * 0.95 && Math.abs(player.x - level.exitTile.x) < TILE_SIZE * 0.7) {
    handleWin();
    return;
  }

  // Update Countess AI
  countess.update(dt, level, player, {
    onSpotted: () => sound.playAlert(),
    onCaught: () => handleDeath("The Blood Countess caught you in the Outer Ward.")
  });
  if (mode !== "PLAYING") return;

  // Terror sanity drain & danger FX
  const distC = Math.hypot(countess.x - player.x, countess.y - player.y);
  let danger = Math.max(0, Math.min(1, 1 - (distC - 55) / 260));
  if (countess.state === AI_STATE.HUNT) {
    danger = Math.max(danger, 0.72);
    player.sanity = Math.max(0, player.sanity - 5.2 * dt);
  }
  if (player.sanity <= 0) {
    handleDeath("Your mind fractured inside the dark stones of Csejte.");
    return;
  }

  dangerVignette.style.opacity = (danger * 0.85).toFixed(2);
  const lowSanity = Math.max(0, (38 - player.sanity) / 38);
  sanityGlitch.style.opacity = (lowSanity * (0.35 + 0.35 * Math.sin(elapsed * 14))).toFixed(2);

  sound.updateAmbience(danger, true);

  // Smooth camera + subtle low-sanity tremor
  const shake = lowSanity * 2.5;
  cam.x += (player.x - cam.x) * Math.min(1, dt * 8) + (Math.random() - 0.5) * shake;
  cam.y += (player.y - cam.y) * Math.min(1, dt * 8) + (Math.random() - 0.5) * shake;

  // Dust motes
  for (const m of dustMotes) {
    m.x = (m.x + m.vx * dt + level.width) % level.width;
    m.y = (m.y + m.vy * dt + level.height) % level.height;
  }

  updateHud();
}

let transientTimer = 0;
function showTransientPrompt(msg) {
  promptBanner.textContent = msg;
  promptBanner.classList.remove("hidden");
  transientTimer = 2.4;
}

function draw() {
  renderer3d.render({
    player,
    countess,
    mode,
    flareFlash,
    deathEcho,
    witching: isWitchingHour
  });
}

// Title-screen backdrop: the castle is built once and the Countess waits by the hall.
level = createLevel();
renderer3d.setLevel(level);
countess = new CountessAI(level.countessSpawn, level.waypoints, isWitchingHour);

// QA hook (only with ?qa in the URL) so automated tests can stage encounters.
if (new URLSearchParams(location.search).has("qa")) {
  window.__qa = {
    get mode() { return mode; },
    get player() { return player; },
    get countess() { return countess; },
    get level() { return level; },
    stats: () => renderer3d.stats(),
    place(obj, tx, ty) { obj.x = (tx + 0.5) * TILE_SIZE; obj.y = (ty + 0.5) * TILE_SIZE; }
  };
}

let lastFrame = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;

  if (transientTimer > 0) {
    transientTimer -= dt;
    if (transientTimer <= 0 && mode === "PLAYING" && !nearbyContext) {
      promptBanner.classList.add("hidden");
    }
  }

  update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
