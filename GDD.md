# Game Design Document — *Csejte: Blood Ledger* (Working Title)

**Brand / Studio Alignment:** Prize Card Vault / *House of Horrors* Collection  
**Platform Target:** Mobile-first PWA (iOS Safari & Android Chrome) → App Store & Google Play via Capacitor  
**Genre:** Top-Down Gothic Stealth Survival Horror  

---

## 1. Proposed Original Titles (3 Options)

1. ***Csejte: Blood Ledger*** *(Recommended)* — Grounded in the Hungarian name for Čachtice Castle and Elizabeth Báthory's rumored private ledger of victims. Immediately communicates mystery, artifact collection, and dread.
2. ***Countess of Iron & Wax*** — Evokes the iron-maiden legend and wax-sealed confession pages; strong gothic literary feel and memorable on an App Store badge.
3. ***Midnight at Čachtice*** — Direct, geographic, and eerie; pairs naturally with time-of-day meta events and late-night mobile play.

### IP & Originality Guardrails
- **Public Domain Foundation:** Elizabeth Báthory (1560–1614), Csejte/Čachtice Castle (Slovakia), Palatine György Thurzó's 1610 arrest, her walled-in tower imprisonment (1611–1614), and 17th-century blood-bath/iron-virgin folklore are public domain history and legend.
- **Original Framing:** No elements from the 2006 film *Stay Alive* (title, characters, plot, dialogue, visuals, or verbatim prayer) are used. The "cursed game bleeding into reality" premise is handled originally as an unearthed, unfinished 1998 gothic devkit build (*`CSEJTE_DEV_09`*) whose seal-breaking ledger leaks harmlessly onto the player's phone clock and notifications.

---

## 2. Premise & High-Concept Pitch

You install an unarchived horror build recovered from an estate drive—a top-down stealth game set inside Csejte Castle on the night before Palatine Thurzó's raid. To break the wax seals on the Outer Gate and escape, you must locate **five torn pages of Elizabeth Báthory's hidden ledger** while evading the **Blood Countess** in the dark. Your lantern cuts through the stone corridors, but light draws her eyes—and dousing your flame leaves your sanity exposed to the castle's whispers. Every death leaves your fallen lantern behind on the next attempt, and if you opt in, the build tracks your phone's real clock after midnight.

---

## 3. Core Gameplay Loop

1. **Explore & Illuminate:** Sweep a real-time raycast lantern cone across darkened castle wings to spot ledger pages, alcoves, cracked-glass noise traps, and patrols.
2. **Manage Light vs. Sanity:**
   - Keep the **Lantern Lit** to maintain Sanity and see clearly, at the cost of Lamp Oil and high visibility to the Countess.
   - **Douse the Lantern** to shrink your detection profile by ~75% and slip past patrols—while Darkness slowly drains Sanity.
   - Rest at **Wall Braziers** to recover Lamp Oil and steady your Sanity.
3. **Evade & Hide:** Slip into **Iron Alcoves / Wardrobes** before entering the Countess's sightline, or trigger an emergency **Lamp Flare** (20% oil, brief 360° stun) if cornered.
4. **Recover the 5 Ledger Pages:** Each page pauses enemies briefly while you read an original piece of Báthory lore and breaks one of the five blood seals on the exit.
5. **Unseal & Escape:** Reach the **North Courtyard Gate** once all five seals break. Dying leaves a **Death Echo** (your dropped lantern) on the map for your next run.

---

## 4. Mobile Touchscreen Controls

Designed for one-handed or two-thumb portrait/landscape phone play (`touch-action: none`, multi-touch pointer tracking):

| Input | Zone | Action |
| :--- | :--- | :--- |
| **Virtual Analog Stick** | Left lower screen (floating on touch) | Smooth 360° movement; slight drag moves silently, full tilt moves at normal pace. |
| **HIDE / READ / EXIT** | Bottom-right (Primary gold ring) | Context-sensitive: enters/exits nearby Iron Alcove, reads Ledger Page, or opens unsealed Gate. |
| **DOUSE / LIGHT** | Right-mid (Amber/obsidian button) | Toggles lantern flame ON/OFF for stealth. |
| **FLARE** | Right-upper (Crimson button, 8s CD) | Consumes 20% oil for a blinding flash that staggers the Countess for 1.5s if close. |
| **HUD Top Bar** | Top edge (safe-area aware) | Pages (`0/5`), Sanity bar, Lamp Oil bar, Stealth state (`UNSEEN` / `HIDDEN` / `HUNTED`), Audio/Pause. |

*(Desktop keyboard fallback: `WASD`/Arrows to move, `E`/`Space` to Hide/Interact, `F` to Douse, `Q` to Flare.)*

---

## 5. Five-Level Campaign — Csejte (Čachtice) Castle

1. **Level 1 — The Outer Ward & Watchtower *(Playable in Prototype)***  
   Rain-slicked battlements, guardhouse ruins, 3 wall braziers, 4 hiding alcoves, cracked-glass sound traps, and 5 Ledger Pages guarding the North Portcullis. Introduces the Blood Countess patrol and stealth basics.
2. **Level 2 — The Crimson Gallery & Banquet Hall**  
   Long mirrored corridors and flickering candelabra zones. Introduces *creaking oak floorboards* (force slow-walk) and *Silver Mirrors* that reveal hidden wall switches only inside your lantern cone.
3. **Level 3 — The Silver Cisterns & Bathhouse**  
   Heavy steam reduces lantern range by 35%; ankle-deep water emits ripples that pull nearby patrols. Introduces *Dorko's Wraith*, an accomplice spirit whose shriek alerts the Countess across rooms.
4. **Level 4 — The Torture Undercroft & Iron Cellar**  
   Claustrophobic dungeon maze with pressure-plate iron grates, decoy *Iron Virgin* silhouettes, and accelerated Sanity drain requiring brazier-hopping routes.
5. **Level 5 — The Brick-Walled Tower (1611–1614)**  
   Vertical multi-ring chamber representing Báthory's final sealed room. Players must ignite four corner masonry seals while the Countess enters permanent *Blood Moon Hunt* phases as each seal locks.

---

## 6. Enemies & Countess AI

### Primary Stalker: Elizabeth Báthory (The Blood Countess)
Four-state finite state machine (`PATROL` → `INVESTIGATE` → `HUNT` → `SEARCH`):
- **`PATROL`:** Walks castle patrol loops at measured speed; emits a soft crimson lantern glow and distance-scaled heartbeat audio.
- **`INVESTIGATE`:** Triggered when the player steps on cracked glass, triggers a Flare out of stun range, or lingers near a noisy gate. Moves to the sound coordinate and scans.
- **`HUNT`:** Triggered when the player enters her line-of-sight cone (extended range if player's lantern is lit; very short range if doused). Accelerates, widens crimson screen vignette, and pursues directly.
- **`SEARCH`:** When line of sight is broken or the player hides out of sight in an alcove, she sweeps around the player's last seen position for several seconds before returning to `PATROL`.
- **`STUNNED`:** Triggered for 1.5s by a close-range **Lamp Flare**, giving a narrow window to break line of sight and hide.

### Supporting Threats (Levels 2–5)
- **Dorko's Wraith (Accomplice):** Floats slowly; drains Lamp Oil if within 2 tiles and shrieks to pull the Countess into `INVESTIGATE`.
- **Ficzko the Mute (Gatekeeper):** Blind; ignores lantern light completely, reacts strictly to footsteps and door/glass noise.
- **Mirror Double:** Appears in Level 2/5 mirrors; freezes when illuminated directly, stalks when your beam turns away.

---

## 7. Sanity & Light Mechanics

- **Lamp Oil (0–100%):** Burns slowly (~1.4%/sec) when lit; 0%/sec when doused. Refills up to +45%/sec near Wall Braziers. At `0%` oil, the lantern flickers out automatically until refueled.
- **Sanity (0–100%):** Stable while lit (`+0.5%/sec` near braziers). Drains in pitch darkness (`-2.8%/sec` while doused) and under terror (`-6.5%/sec` during `HUNT`). Finding a Ledger Page restores `+12%` Sanity via historical clarity.
- **Low-Sanity Hallucinations (<35%):**
  - Subtle camera micro-tremor and crimson/violet edge bleed.
  - Phantom footsteps / reversed heartbeat pan via WebAudio.
  - Visual glitch flickers reminiscent of a decaying 1998 devkit build.

---

## 8. Meta "Curse" Layer (All Opt-In & Harmless)

1. **Opt-In Curse Whispers (Local Notifications):** Disabled by default. Players can toggle *"Enable Curse Whispers"* in the title screen. Uses standard Web Notifications (or Capacitor Local Notifications in native builds) to send harmless, atmospheric flavor nudges (e.g., *"Csejte: The fourth candle went out."*). Zero tracking, zero contacts/data access.
2. **Witching Hour Clock Hook (12:00 AM – 3:00 AM Local Time):** Detects only `new Date().getHours()`. During midnight–3 AM, the title screen reveals a *"WITCHING HOUR ACTIVE"* seal, shifts ambient fog toward blood-moon crimson, and appends an extra hidden postscript to Ledger Page V.
3. **Persistent Death Echo:** Losing a run records your `(x, y)` death tile in `localStorage` and places a faint flickering **Fallen Lantern** marker in the next run—paying off the "cursed previous player" trope without copying any movie script.

---

## 9. Art Direction (*House of Horrors* Alignment) — v0.2 "PS1-Era 3D"

After Dante's first playtest, the mechanics stayed and the visuals moved from flat 2D to **real-time 3D in the style of late-'90s PlayStation RPGs** (the Final Fantasy VII era). Every asset is original: no models, textures, names, or music from any existing game.

- **Engine:** Three.js r170, bundled locally at `js/vendor/three.module.min.js` with no CDN at runtime.
- **PS1 render pipeline:**
  - The scene renders at a low internal resolution (short side about 240 px) and is upscaled nearest-neighbor.
  - Vertex snapping gives the classic PS1 "wobble", and it gets stronger as Sanity drops.
  - A post pass quantizes to 15-bit color with a 4×4 ordered dither, adds a light vignette, and adds a scanline-tear glitch at low Sanity.
- **Textures:** All are procedural pixel art (8–32 px) with nearest-neighbor filtering. That covers castle brick with blood drips, flagstones, crimson tapestries with a gold three-tooth crest, rugs, riveted iron, parchment, the trench coat, the brocade gown, the pleated ruff, and 8×8 faces.
- **Characters:** Low-poly and blocky, with FF7-style big heads and chunky hands. Each is a few hundred triangles.
  - *Investigator:* flat cap, trench coat, crimson scarf, and a hand lantern that is the real light source.
  - *Blood Countess:* a tall flared brocade gown, white ruff collar, gold coif, pale 8×8 face, and glowing red eyes. Her animation is procedural: walk sway, a hover/breath bob, arms reaching out while hunting, and a recoil when stunned.
- **Camera:** A semi-fixed cinematic camera with a different angle per castle wing (north ward, great hall, south hall), which echoes FF7's pre-rendered rooms. The yaw stays fixed, so the joystick always maps to the same screen direction. It moves into a tighter close-up while you hide. Walls between the camera and the player dissolve with a dithered "screen-door" cutaway.
- **Lighting:**
  - The lantern is a real spotlight with shadow mapping.
  - Braziers are flickering point lights.
  - The Countess carries a red under-glow.
  - The North Portcullis glows red while sealed and gold once all five wax seals break.
  - The scene also has purple-black fog, candle clusters, wall sconces, drifting ash, and light pillars over ledger pages.
- **Palette:** Obsidian `#0A080C`, arterial crimson `#8B0018` / `#C41230`, antique gold `#C9A24D` / `#E7C873`, parchment `#E8DEC8`, and cold moonlight `#4B6478`.
- **Performance budget:**
  - The renderer caps the pixel ratio at 1 and uses the low-resolution target.
  - Walls, trim, tapestries, candles, sconces, and glass are instanced, and flames are batched as point sprites.
  - QA measured about 130 draw calls (shadow pass included) and about 8k triangles.
  - It ran about 23–25 fps in *software* (SwiftShader, CPU-only), so a mid-range phone GPU should comfortably clear 30+ fps.
- **Audio:** Unchanged. Everything is procedural WebAudio (drone, heartbeat, steps, glass, stings), with no samples.

## 10. Monetization & Brand Tie-In

1. **Free Level 1 + Single Full Unlock ($3.99–$4.99):** Level 1 (*The Outer Ward*) serves as a complete, ad-free playable hook; one-time IAP unlocks Levels 2–5, Endless Crypt mode, and Relic skins. No stamina timers or pay-to-win revives.
2. **Prize Card Vault / *House of Horrors* Physical-Digital Crossover:** Include a QR/NFC link on physical *House of Horrors* Báthory promo cards that unlocks an exclusive **Gold-Foil Reliquary Lantern** skin and a collector's Codex entry inside the game—turning the app into an interactive funnel back to `shop.prizecardvault.com`.
3. **Optional Aesthetic Packs ($0.99–$1.99):** *"1998 Devkit CRT"* filter pack, *"Thurzó's Silver Lamp"* skin, and digital soundtrack/lore artbook.

---

## 11. Path to App Store & Google Play

The prototype is plain ES modules + locally bundled Three.js (WebGL) + WebAudio + a PWA manifest, so it drops directly into **Capacitor** without rewriting game code:

1. **Wrap with Capacitor:**
   ```bash
   npm init -y
   npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
   npm install @capacitor/haptics @capacitor/local-notifications
   npx cap init "Csejte: Blood Ledger" "com.prizecardvault.csejte" --web-dir .
   npx cap add ios
   npx cap add android
   ```
2. **Native Enhancements:** Swap browser `Notification` for `@capacitor/local-notifications`, wire `@capacitor/haptics` to the Countess heartbeat, and lock orientation / safe-area insets.
3. **Developer Accounts & Required Costs:**
   - **Apple Developer Program:** **$99/year** (required for TestFlight & App Store; final `.ipa` archiving requires macOS + Xcode or a cloud Mac CI such as Xcode Cloud / Codemagic).
   - **Google Play Console:** **$25 one-time** (required for `.aab` internal testing & Play Store; new personal Play accounts require 12–20 closed testers opted in for 14 consecutive days before production review).
   - **Total Platform Registration Cost:** **$124** upfront ($99/yr Apple + $25 one-time Google).
