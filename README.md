# Csejte: Blood Ledger

A mobile-first gothic stealth horror prototype for Prize Card Vault / *House of Horrors*, rendered in PS1-era low-poly 3D (Three.js, bundled locally).

Play the public test build: **https://prizecardvaultsubmissions-tech.github.io/bathory-game/**

You pick a weapon, then explore six wings of Csejte (Čachtice) Castle hunting for five ledger pages. Her risen servants (ghouls, blood maidens and bat swarms) crawl out of the mist quickly, and killing them may drop a sanity vial, a mirror, a coin pouch, or nothing. Only a few mirrors lie in the castle; most are earned. Elizabeth Báthory herself can't be harmed: hide, douse your lantern, flare, or shatter a mirror to freeze her (3s to 15s by mirror tier). Coins bank on the HUD; toss five into the Outer Ward well for a speed boost, a darkness curse, or a Well Dweller. Three rooms hide secret doors behind a candelabra, a skull, and a crooked portrait. Smash crates and barrels for a weapon-change token, armor, a speed tonic, or a slime. Every 15 kills drops a key (15 and 30) to the two locked puzzle chambers off the Outer Ward: the Chamber of Candles and the Crushing Hall, each sealed with a riddle. Dying leaves your fallen lantern behind on the next attempt.

**v0.6** adds the **Hooded Pedlar** power-up shop (in both stages and between stages; items plus permanent upgrades saved on the device; coins persist in a purse, and on death you keep half of what you gained) and **Stage II: The Graveyards**, reached through the North Gate. It has six moonlit areas, five grave rubbings, coffins and urns, a cursed fountain, Grave-Risen skeletons, Gravedigger Brutes, Wailing Banshees, grave-hand traps, and two new riddle chambers: the Crypt of Names and the Drowned Bells. The title screen has Continue and stage select.

**v0.7** overhauls the graphics across every stage (articulated low-poly characters with idle/walk/attack animations, 64px/32px procedural textures, flickering pooled torch/candle lights, soft lantern falloff, gore/embers/mist/blood decals, per-stage color grading, bloom-lite, grain, ornate UI frames, and a **LOW / MEDIUM / HIGH / AUTO** graphics quality toggle) and adds **Stage III: The Climb** — six connected tower floors from the Cellar & Wine Vaults up through the Torture Chambers, Servants' Floor (with the Hooded Pedlar), Library & Study, Countess's Bedchamber, and the Tower Top battlements. Each floor's Tower Seal unlocks the stairs up while the Countess follows with rising aggression; casks and bookshelves break, new enemies (Chained Prisoner, Iron Maiden Walker, Portrait Wraith) and the **Tower Gargoyle** boss guard the ascent, and keys at 15/30 kills open the **Hall of Mirrors** light-beam puzzle and the timed **Clock Library**.

This is an original game inspired by public-domain Báthory history and legend. It is not affiliated with the 2006 film *Stay Alive*.

## Local play

```bash
python3 -m http.server 8765 --bind 127.0.0.1
# then open http://127.0.0.1:8765/
```

Touch controls work on a phone browser. Keyboard fallback: WASD to move, Space/J to attack, E to act/hide, R for a mirror, F to douse the lantern, Q to flare.

See `GDD.md` for the full design document, title options, and the path to App Store / Google Play via Capacitor.

## QA

`qa/qa_combat.py` runs Playwright at a 390x844 phone viewport. It covers weapon select, killing monsters, natural spawning, mirror pickup, mirror freeze, auto-mirror on catch, obsidian repel, hiding, death and retry. It captures `screens/` and reports console errors. `qa/qa_chambers.py` covers v0.5: crates and every drop type, slime split, armor soak, the weapon token picker, keys at 15/30 kills, unlocking both doors, and solving and failing both puzzles. `qa/qa_stage2.py` covers v0.6: the shop at both locations and between stages, buy and not-enough-coins, upgrades persisting across reloads, the stage transition, the Stage II loop, the new monsters and hazard, and both new puzzles solved and failed. `qa/qa_stage3.py` covers v0.7: Stage II → Stage III transition with carry-over, all six floor transitions and Countess aggression, Pedlar mid-climb, new monsters and boss fight, breakable casks/bookshelves, Hall of Mirrors & Clock Library (solved and failed), the final ending, and the graphics quality toggle. `node qa/validate_map.mjs` checks all three maps (including Stage III stairs and mirror raytrace) for reachability. Add `?qa` to the URL to expose the test hook, `?qa&stage=2` for Stage II, or `?qa&stage=3` for Stage III.
