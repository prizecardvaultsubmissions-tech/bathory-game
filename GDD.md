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

## 3. Core Gameplay Loop (v0.6 "The Pedlar & The Graveyards")

1. **Choose Your Arms:** Every run starts at the *Armory of Csejte*. Pick one of four original weapons (table below). Your pick is remembered, and RETRY keeps it.
2. **Explore Six Wings:** The castle is now one large connected map, about 5x the v0.2 footprint (58x46 = 2,668 tiles vs. 26x20 = 520; 1,584 walkable vs. 359). It covers the Outer Ward, the Chapel of St. Ladislaus, the Kitchens & Cellars, the Great Hall, the Torture Gallery and the North Gate Court. Each wing has its own floor, dressing and fixed cinematic camera angle, plus an area title card as you enter.
3. **Fight Her Servants:** Monsters rise from the mist at spawn points far from you and out of sight, quickly and more as the night goes on. Cut them down with your weapon — they may drop a prize.
4. **Never Fight Her:** The Countess cannot be harmed. A hit only makes her recoil for a split second. If she catches you in the open, you die, unless you carry a mirror.
5. **Collect Mirrors:** Only a handful of mirrors lie in the castle. Most come from slain servants. A mirror freezes her in glass, and better mirrors hold her longer.
6. **Manage Light, Sanity, Oil and Health:** Lantern vs. darkness works as before. Braziers slowly mend Health. Sanity vials dropped by servants restore a burst of Sanity.
7. **Recover the 5 Ledger Pages** spread across the wings, then escape through the **North Gate**. Dying leaves a **Death Echo** (your dropped lantern).

### Weapons (pick one per run)
| Weapon | Damage | Speed | Reach | Special |
| :--- | :--- | :--- | :--- | :--- |
| **Silver Dagger** | 14 | 0.30s | short | Fastest attacks |
| **Blessed Iron Mace** | 34 | 0.95s | medium, wide arc | Huge knockback; longest stagger on the Countess |
| **Silver Crossbow** | 24 / bolt | 0.75s | ranged (~11 tiles) | 14 bolts (max 24). Bolt bundles in the castle give +6. Out of bolts, it bashes for 6. |
| **Torch Staff** | 15 | 0.55s | long | Sets servants burning (5 dmg/s for 4s) |

Attacks auto-aim at the nearest servant in reach. Hold **ATTACK** to keep swinging. Every hit gives a white flash, sparks, blood particles, knockback, a hit sound and a light screen shake.

### Monsters (the Countess's risen servants)
| Monster | HP | Speed | Damage | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Servant Ghoul** | 46 | slow | 12 | Tough shambler; the only type for the first ~20s. Slightly better drop odds. |
| **Blood Maiden** | 28 | very fast | 9 | Fragile but closes distance quickly |
| **Bat Swarm** | 20 | fast, erratic | 5 | Each bite also drains 6% Lamp Oil |

- **AI:** RISE (0.9s from mist) → WANDER → CHASE (they spot you more easily while your lantern is lit) → WINDUP telegraph → strike → cooldown. Hiding in an alcove makes you invisible to them too.
- **Spawner:** The first rise happens about 4s in. After that, one rises every ~6–15s, tightening toward 6s as time passes (`6 + rand(0 … max(0, 9 − 0.04·t))`), at spawn points more than 11 tiles away and out of line of sight. At most `min(10, 4 + ⌊t/40⌋)` are active at once. Maidens and bats join after ~20s, and after ~80s they sometimes come in pairs.
- **Death & drops:** a dissolve into mist. The corpse may leave a pickup that pops out with a bounce and glow, is collected by walking over it, and despawns after 20s (blinks in the last 4s):

| Result | Typical chance | Ghoul chance | Effect |
| :--- | :--- | :--- | :--- |
| Nothing | 40% | 30% | — |
| Sanity vial | 25% | 26% | +24 Sanity |
| Coin pouch | 23% | 26% | +6–13 coins (ghouls +12–20). Banked on the HUD. Toss 5 into the well for a random boon, curse, or Well Dweller. A later shop may still use them. |
| Mirror | 12% | 18% | Weighted by tier: Cracked ~70% (60% from ghouls), Silver ~22% (26%), Gilded ~7% (11%), Obsidian ~1% (3%). |

### Coins & the Purse (v0.6)
Pouches add to the **◉ COINS** counter. Coins buy coin tosses at the well/fountain, items and upgrades from the Hooded Pedlar, and the puzzle chambers pay out coins.

**Persistence rule:** your coins are kept in a **purse** saved on the device (`localStorage`).
- A new run starts with the whole purse.
- **Clearing Stage I** carries everything into Stage II: coins, weapon, bolts, mirrors, armor and any active speed boost. The purse is saved at that moment.
- **On death (or quitting to the title):** if you finished with at least as many coins as you started with, you keep your starting coins plus **half of what you gained** (rounded down). If you spent below your starting amount, you keep what you have left. The death screen shows **PURSE KEPT**.
- Permanent upgrades are never lost.

### The Hooded Pedlar — Power-Up Shop (v0.6)
A hooded merchant with glowing eyes, a lamp and a stall of bottles stands in each stage: Stage I in the Outer Ward's south-east corner by the brazier, and Stage II by the Chapel Graveyard's south gate near the start. Walk up and tap **SHOP**. The game pauses. The shop also opens **between stages** from the Stage I clear screen ("Visit the Hooded Pedlar"). Tap an item to select it, then confirm with **BUY**. If you can't afford it, the tile shakes, a deny sound plays, and the shop shows "Not enough coins — X costs ◉N, you have ◉M."

| Item | Price | Effect |
| :--- | ---: | :--- |
| ✚ Health Draught | 12 | +50 health (in-stage only) |
| ✺ Sanity Salts | 10 | +40 sanity (in-stage only) |
| ♨ Lamp Oil | 8 | Refill the lantern (in-stage only) |
| ⛨ Armor Plate | 15 | +35 armor (max 100) |
| ◐ Cracked Mirror | 15 | 3s freeze |
| ◯ Silver Mirror | 32 | 6s freeze |
| ✦ Gilded Mirror | 60 | 10s freeze |
| ➶ Silver Bolts ×8 | 10 | Crossbow only |
| ⚡ Speed Tonic | 12 | ×1.5 speed for 15s |
| ⚔ Weapon Swap | 20 | Opens the weapon picker. Refunded if you keep your weapon |

**Permanent upgrades** (3 levels each, saved on the device, apply to every future run):

| Upgrade | Lv1 / Lv2 / Lv3 | Effect per level |
| :--- | :--- | :--- |
| ♥ Iron Heart | 50 / 80 / 120 | +15 max health |
| ⚒ Whetstone | 50 / 80 / 120 | +12% weapon damage |
| ☼ Wider Wick | 40 / 70 / 100 | +12% lantern reach |
| ❖ Silvered Glass | 60 / 90 / 130 | +1s on every mirror freeze |

### Mirrors (freeze the Countess)
| Tier | Freeze | Placed in castle | Extra |
| :--- | :--- | :--- | :--- |
| ◐ Cracked Hand Mirror | 3s | 3 (Ward, Chapel, North Court) | Common servant drop |
| ◯ Silver Vanity Mirror | 6s | 1 (Torture / north corridor) | Uncommon drop |
| ✦ Gilded Venetian Mirror | 10s | 0 — drop only | Rare drop |
| ◆ Obsidian Scrying Mirror | 15s | 1 (Torture Gallery) | Very rare drop. Also blasts away nearby servants (repel + 18 dmg) |

- Most mirrors are earned by killing servants, not found on the floor.
- **Manual:** Tap **MIRROR** while she is within ~7 tiles, or within ~11 tiles if you can see her. It always uses the best mirror you hold.
- **Automatic last-ditch save:** If she catches you while you're not hidden and you hold any mirror, the best one shatters, she freezes, and you're shoved free.
- **Freeze effects:** an ice-glass shell and gold frame around her, a pale glow, a blue-shifted screen and a countdown banner that turns red in the last 1.5s. When she thaws, she searches where she stood.


### The Well & Coin Toss
A stone well stands in the Outer Ward. Killing servants is the main way to earn coins; standing at the well and tapping **TOSS** spends 5 coins and rolls one of three outcomes (equal chance):
- **Speed Boost (15s):** movement ×1.5, a gold particle trail, SWIFT status.
- **Darkness Curse (15s):** lantern cone and radius shrink, the screen dims, CURSED status.
- **Well Dweller:** immediately summons a Well Dweller from the water (capped at 2 living).

A result banner is shown. If you have fewer than 5 coins, the well refuses the toss.

### The Well Dweller
An original crawling wraith — long wet black hair hiding the face, a grey-white funerary shroud with a stone-stained hem, jerky start-stop movement. It is not a likeness of any film character and has no other name.
- **80 HP**, slow (chase 38), 16 damage, heavy knock resist.
- Spawns from the well on its own timer (~32s first, then ~48–70s if none are alive) and can also be called by a coin toss.
- A 200px aura drains Sanity (stronger inside 80px; halved while hidden).
- Better drop table than common servants (25% mirrors, 30% coins).

### Secret Doors
Only three rooms hide a passage into an adjacent wing, each opened by searching a curious item:
- **Chapel of St. Ladislaus:** an iron candelabra bolted slightly off-true opens a short cut into the Great Hall.
- **Torture Gallery:** a yellowed skull in a loose stone opens a "bone stair" down toward the Chapel.
- **Great Hall:** a faded portrait hanging a finger's width from the wall slides aside a passage into the North Gate Court.

A thin masonry crack and a faint glow hint at the item. When triggered, the wall grinds and sinks with a scrape, the camera shakes, and the open tiles appear on the minimap in pale green.

### Breakable Crates & Barrels (v0.5)
24 crates and barrels stand across all six wings. Hit them with your weapon (barrels take 2 hits, crates 3; the mace deals 2 per swing; a crossbow bolt counts as 1). Each hit wobbles the prop and throws wood splinters; the last one bursts it with a crack, a gold shock ring and a screen shake, clears the tile for walking, and rolls:

| Contents | Chance | Effect |
| :--- | :--- | :--- |
| Weapon change token | 20% | A violet medallion. Pick it up to open a 4-weapon picker (game paused); choose a new weapon or keep yours. Crossbow swaps refill to 14 bolts. |
| Armor plate | 32% | +35 **ARMOR** (max 100), shown as a steel bar under Lamp Oil. Armor soaks monster damage first, point for point. (The Countess still kills on touch.) |
| Speed tonic | 22% | The same 15s speed boost as the well (×1.5, gold trail, SWIFT banner). |
| Crate slime | 26% | An original low-poly blood-red slime with a green core oozes out (25 HP, hops). On death it splits once into two Mini Slimes (9 HP each). |

When nothing else is in reach, ATTACK auto-turns toward the nearest crate.

### Kill Counter & Keys (v0.5)
A ☠ HUD pill counts kills toward the next key (0/15, then 15/30, then the total). At **15 kills Key I** falls from the last victim, and at **30 kills Key II** does. Each is an ornate glowing iron key with a banner ("The first key falls…" / "The second key falls…"). Keys never despawn. Held keys glow gold in the HUD; used keys turn green.

### Locked Chambers (v0.5) — in the spirit of a temple-run game show, all-original content
Two sealed doors open off the south wall of the Outer Ward. Each door is ornate wood and iron with a roman numeral and a padlock; walking up shows "Requires Key I/II (kills x/15)". With the right key, tap **UNLOCK**. Step inside and the door slams shut behind you, the riddle appears on parchment (re-read any time with the **RIDDLE** button), and the chamber uses a fixed, framed camera. While you're sealed in, no new servants spawn, the well sleeps, and the Countess cannot see or reach you. Anything that followed you in is banished. The puzzle pauses while you read the riddle.

**Chamber I — The Chamber of Candles.** You receive a lit taper. Six candles stand in a ring, each with a carved sign on the floor (Sun, Bell, Rose, Key, Moon, Skull), scrambled around the circle. Light them in the order the riddle describes. A wrong candle snuffs every flame and a Mini Slime crawls out of the smoke.

> *The Hours of Csejte* — The bright one wakes upon the tower; / the bronze one tolls the noonday hour; / the red one, thorned, is cut for her bower; / at dusk the iron tooth bites the door; / the pale one climbs above the moor; / and last, the grinning one beneath the floor. / Light them as the day is spent.
>
> **Answer:** SUN → BELL → ROSE → KEY → MOON → SKULL.

Reward: Gilded mirror, 30 coins, Sanity restored to 100. The door reopens.

**Chamber II — The Crushing Hall.** A narrow hall with four glyph plates down the middle (the alchemical signs for Air, Fire, Water and Earth). On entry the spiked side walls begin closing in with grinding, camera shake and a "walls meet in Ns" timer (≈40s). Press the plates in the riddle's order. A wrong plate resets them and the walls lurch closer. If the walls meet, you're crushed (normal death and Death Echo).

> *The Walls Remember* — Every breath begins the end — / so first, the one you cannot hold. / What burns must come before what drowns it. / The ground you'll die on, press it last. / Four plates. One order. The stone is patient. You are not.
>
> **Answer:** AIR → FIRE → WATER → EARTH.

Reward: Obsidian mirror, 40 coins, armor to 100. The walls retract and the door reopens.

The minimap shows both chambers (darkened until unlocked) and colors each door red (locked), blinking gold (you hold its key), gold (unlocked) or green (solved).

### Health
100 HP (+15 per Iron Heart level). Monster strikes deal damage, with a short invulnerability window and knockback. Braziers mend +4 HP/s. Reaching 0 HP ends the run with a monster-specific death line.

---

## 4. Mobile Touchscreen Controls

Designed for two-thumb portrait phone play (`touch-action: none`, multi-touch pointer tracking):

| Input | Zone | Action |
| :--- | :--- | :--- |
| **Virtual Analog Stick** | Bottom-left | 360° movement; a slight drag moves quietly. |
| **ATTACK** (big crimson) | Bottom-right corner | Swing or fire; hold to repeat; auto-aims at the nearest servant. |
| **SEARCH / HIDE / READ / EXIT / ESCAPE** | Left of ATTACK | Context action. |
| **MIRROR** | Above ATTACK | Freezes the Countess with the best mirror held. The subtitle shows that mirror's seconds. |
| **FLARE** | Diagonal | 20% oil; stuns her if close, scorches nearby servants. |
| **DOUSE** | Top of cluster | Lantern on/off. |
| **HUD** | Top | Ledger pages, stealth state, weapon (+ bolts), **Coins**, Health/Sanity/Oil bars, mirror inventory chips, minimap (pages gold, gate, you; she appears only when hunting you or frozen), sound/pause. |

*(Keyboard: `WASD`/Arrows move, `Space`/`J` attack, `E` act, `R` mirror, `F` douse, `Q` flare, `Esc` pause.)*

---

## 5. Campaign: Csejte (Čachtice) Castle

**v0.5 playable map: "The Castle Wings"**, one continuous level made of six wings plus two sealed puzzle chambers:
- **Outer Ward:** the start. Cobbled courtyard, crates, a well, braziers.
- **Chapel of St. Ladislaus:** pews, altar, stained glass.
- **Kitchens & Cellars:** tables, barrels, a cauldron; a cellar stair leads up to the North Court.
- **Great Hall:** the throne, banquet tables, pillars. The Countess starts here.
- **Torture Gallery:** cages and racks; holds the only Obsidian mirror.
- **North Gate Court:** statues and the sealed North Gate exit.
- **Chamber of Candles** (Key I) and **Crushing Hall** (Key II): locked puzzle rooms below the Outer Ward.

The map holds 5 pages, 10 alcoves, 12 braziers, 7 cracked-glass traps, 5 placed mirrors (3 Cracked, 1 Silver, 1 Obsidian), 8 bolt bundles, 14 monster spawn points, one well in the Outer Ward, 3 secret doors, 24 breakable crates and barrels, and 2 locked puzzle chambers.

Future chapters (design targets): the Silver Cisterns & Bathhouse (steam halves lantern range), the Iron Undercroft (pressure plates) and the Brick-Walled Tower finale.

---

## 5b. Stage II — The Graveyards (v0.6)
Clearing Stage I (five ledger pages, then the North Gate) unlocks Stage II. A moonlit transition screen shows your time, kills and purse, with buttons to enter, visit the Pedlar, or return to the title. Entering shows a "STAGE II · THE GRAVEYARDS" title card. The title screen then offers **CONTINUE · STAGE II** and a stage select.

**Look:** open-air PS1 graveyard. A large moon is drawn in the sky, with blue-grey fog, drifting mist motes, circling crows, low mossy walls and iron fences, crooked tombstones, crosses, mausoleums, dead trees, open graves, bone piles and a weeping angel. Coffins and urns replace crates and barrels; urns break in 2 hits and coffins in 3, with the same loot table. The cursed **black fountain** in the Chapel Graveyard works like the well: 5 coins for a boon, curse or Well Dweller.

**Six areas:** The Gatehouse (north exit), Mausoleum Row, Crypt Entrance (where the Countess rises), The Dead Orchard, The Bone Pit, and the Chapel Graveyard (start, fountain, Pedlar).

**Goal:** collect **5 grave rubbings** (original epitaph texts), then reach the Gatehouse road in the north to finish.

**Secrets:** the *Weeping Angel Passage* (search the angel by the Chapel Graveyard's west wall to open a path into Mausoleum Row) and the *Ossuary Crawl* (a skull in the Bone Pit's west wall).

**New monsters:**
| Monster | HP | Speed (wander/chase) | Damage | Notes |
| :--- | ---: | :--- | ---: | :--- |
| Grave-Risen (skeleton) | 36 | 46 / 84 | 10 | Claws up out of the ground (1.4s rise) |
| Gravedigger Brute | 95 | 28 / 54 | 22 | Slow, heavy spade swing, long reach. Better drops |
| Wailing Banshee | 30 | floats | 7 | When it can see you within ~4 tiles, it wails every 5.5–8s: −12 sanity, slowed 1.6s, screen ripple |

Spawn mix: in the first minute, 60% skeleton, 25% banshee and 15% brute; after that, 45% / 30% / 25%. Keys still drop at 15 and 30 kills. The Countess and all mirror rules still apply.

**New hazard — Grave Hands:** 10 open graves. Within ~2 tiles, fingers peek out as a warning. Step closer and hands grab you for 6 damage, slowing you for 1.3s (4s cooldown per grave).

### Stage II Puzzle Chambers
**Chamber I — The Crypt of Names (Key I, Mausoleum Row south door).** Five sarcophagi with brass plaques bearing Roman-numeral years. Tap **REST** at each coffin to close its lid. A key to the numerals is printed under the riddle. A wrong coffin throws every lid open again, and a frail Grave-Risen climbs out.
> Here the household of the Lady sleeps, / each lid cut with the year it fell. / Lay them to rest as the ground received them: / the first to fall is the first to sleep, / and the last to fall shuts the crypt.
>
> **Answer (oldest to newest):** MDLXXV (1575) → MDXC (1590) → MDCIV (1604) → MDCX (1610) → MDCXIV (1614).

Reward: Gilded mirror, 35 coins, sanity restored to 100.

**Chamber II — The Drowned Bells (Key II, Crypt Entrance south door).** Four bells: iron, bone, silver and bronze. The water rises from the moment you enter and fills the room in about 45s. A wrong bell resets the sequence and surges the water. If the water reaches the roof, you drown.
> A child is christened under silver; / a bride is wed beneath the bronze; / a soldier marches to the iron; / and bone tolls once, when all is gone. / Ring a life from font to grave. / The water will not wait for you.
>
> **Answer:** SILVER → BRONZE → IRON → BONE.

Reward: Obsidian mirror, 45 coins, armor to 100. The water drains.

---

## 5c. Stage III — The Climb (v0.7)
Clearing Stage II (five grave rubbings, then the Gatehouse road) unlocks **Stage III: The Climb** (`csejte_stage3`). Coins, weapon, bolts, mirrors, armor and any speed tonic carry over, and the Hooded Pedlar also appears between Stage II and Stage III. On the title screen, **CONTINUE** advances to Stage III once unlocked, and a **III · THE CLIMB** stage chip appears.

**Six connected floors** (each a distinct walled region joined by stairs; tap **CLIMB** / **DESCEND** at a stair; climbing up is barred until you break that floor's **Tower Seal**):

| Floor | Name | Look & Lighting | Countess Aggro | Seal |
| :--- | :--- | :--- | :---: | :--- |
| I | **The Cellar & Wine Vaults** | Damp brick, cobbled floor, wine racks, cistern (well), warm amber grade | 1.00× | *The Cellarer's Tally* |
| II | **The Torture Chambers** | Crimson-lit stone, iron racks, cages, blood floor | 1.08× | *The Gaoler's Ring* |
| III | **The Servants' Floor** | Plaster walls, timber floor, straw cots, the Hooded Pedlar's stall | 1.16× | *The Housekeeper's Ledger* |
| IV | **The Library & Study** | Parquet floor, tall bookshelves, desks, flickering candles, emerald-tinted study light | 1.24× | *The Physician's Letter* |
| V | **The Countess's Bedchamber** | Velvet carpet, patterned wallpaper, four-poster bed, vanity | 1.34× | *Her Own Hand* |
| VI | **The Tower Top** | Open-air slate battlements, crenellated parapets, moonlight, warning bell, dawn stair exit | 1.45× | Boss guard |

- **Countess on the Climb:** She starts ~8s behind you on Floor I and follows ~`max(4, 10 − floor)` seconds after you take any stair, reappearing at a far waypoint on your new floor. Her speed, sight range and re-manifest pace scale with the floor's aggression multiplier.
- **Breakables:** Wine casks (2 hits), crates (3 hits) and library bookshelves (3 hits) break for the same crate loot table.
- **Minimap:** Crops and zooms to the current tower floor, marking stairs (red = barred, gold = open, blue = down) and the roof boss.

**New monsters & boss:**
| Monster | HP | Speed (wander/chase) | Damage | Notes |
| :--- | ---: | :--- | ---: | :--- |
| **Chained Prisoner** | 40 | 38 / 72 | 11 | Drags an iron collar, manacles and 6-link chain & ball (Floors I–III) |
| **Iron Maiden Walker** | 110 | 26 / 50 | 24 | Armored (0.6× damage taken), except ×1.5 damage while its spiked doors swing open to strike (Floors II, V) |
| **Portrait Wraith** | 34 | 50 / 80 | 9 | Floats in a shattered gilt frame; blinks toward you when seen from afar (−4 sanity) (Floors IV–V) |
| **The Tower Gargoyle** *(Boss)* | 420 | 40 / 70 | 26 | Guards Floor VI with a boss health bar; swoops across the roof every ~6s. Must be slain (alongside all 5 Tower Seals) to open the Dawn Stair |

### Stage III Puzzle Chambers
Keys drop at **15** and **30** kills as in Stages I–II.

**Chamber I — The Hall of Mirrors (Key I, Torture Chambers south door).** A burning lamp sits in the west wall, a sun seal in the east wall, two of the Countess's portraits on the walls, and four turning standing mirrors (A–D) plus a brass shutter lever. Tap **TURN** at each mirror to swing between `/` and `\`, then tap **OPEN** at the shutter to fire the light beam. If the beam hits a portrait, a Portrait Wraith steps out of the frame, you lose sanity, and the mirrors reset.
> *The Hall of Mirrors* — The lamp was lit in the west at dusk. / First it falls, as all things fall; / then it runs the length of the floor toward morning; / then it climbs, as the Lady climbed; / and last it turns to the east, and wakes the sun.
>
> **Answer:** Turn all four glasses once from their starting angles → **A `\`, B `\`, C `/`, D `/`**, then **OPEN** the shutter.

Reward: Gilded mirror, 40 coins, Sanity restored to 100.

**Chamber II — The Clock Library (Key II, Servants' Floor south door).** A tall grandfather clock ticks toward the thirteenth hour (~50s timer) surrounded by five lectern books marked `IX`, `XII`, `III`, `VI`, and `XIII`. **PULL** the hours of her day in order before time expires; pulling a wrong hour (or `XIII`) slams every book back in and jumps the clock forward by 8s. Reaching thirteen strikes crushes you in the pages.
> *The Lady's Hours* — She rises when the short hand points to where the sun goes down; / she dines when both hands kneel together at the crown; / she writes her ledger at the hour of the dawn she fears; / and she sleeps when the hand hangs down toward the cellar.
>
> **Answer:** **IX → XII → III → VI** (avoid `XIII`).

Reward: Obsidian mirror, 50 coins, Armor to 100.

---

## 5d. Graphics Overhaul & Quality Presets (v0.7)
All three stages keep the PS1 / FF7 low-poly silhouette while upgrading lighting, models, particles and post-processing:
- **Models & Textures (`js/characters.js`, `js/textures_hd.js`):** Articulated limbs (knees, elbows, coat tails, layered gown, jaws, chains, wings), vertex-color baked AO gradients, procedural 64px world textures and 32px character/face textures, plus idle, walk, swing, and enemy-specific animations.
- **Dynamic Lighting & Particles (`js/render3d.js`):** Soft-falloff lantern spotlight + camera-side fill light so the player always reads cleanly; a pool of up to 6 dynamic flickering point lights re-homed to nearby sconces, candles and braziers; floor mist, rising embers, dust motes, sparks, blood gore bursts, and fading floor blood decals.
- **Post-Processing:** Per-stage/floor color grading (gain, lift, saturation), bloom-lite glow bleed, film grain/dither, vignette, and optional chromatic aberration on High.
- **Quality Toggle (`js/quality.js`):** Cycles **AUTO / LOW / MEDIUM / HIGH** from the title screen or pause menu (`csejte_quality`). Presets scale internal resolution (`220` / `290` / `360` px), shadow map (`off` / `512` / `1024`), active flame lights (`2` / `4` / `6`), particle budgets, bloom, grain, decals (`12` / `28` / `48`), and CA. **AUTO** monitors live FPS while playing and steps down if frame rate dips.

## 6. Enemies & Countess AI

### Primary Stalker: Elizabeth Báthory (The Blood Countess)
**Invulnerable.** Her FSM states are `PATROL` → `INVESTIGATE` → `HUNT` → `SEARCH`, plus `STUNNED` and `FROZEN`:
- **`PATROL`:** walks between 15 waypoints and favors the one nearest you half the time. If you are more than 22 tiles away for 22s, she *re-manifests* somewhere nearer, out of sight ("You hear silk dragging over stone…").
- **`INVESTIGATE`:** goes to noises (cracked glass, distant flares).
- **`HUNT`:** you're in her sight cone (long range when your lantern is lit, short when doused). She is fast and uses BFS pathing around walls.
- **`SEARCH`:** sweeps your last known position.
- **`STUNNED`:** 1.7s from a close flare, or a brief stagger from a weapon hit (dagger 0.25s up to mace 0.75s).
- **`FROZEN`:** 3–15s from a mirror. She is fully immobile and cannot catch you.

### Servants
See the monster table in section 3. These are original designs: a hunched ghoul in servant rags, a pale maiden in a shift, and a swarm of bats.

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
