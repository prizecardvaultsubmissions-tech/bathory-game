# Csejte: Blood Ledger

A mobile-first gothic stealth horror prototype for Prize Card Vault / *House of Horrors*, rendered in PS1-era low-poly 3D (Three.js, bundled locally).

Play the public test build: **https://prizecardvaultsubmissions-tech.github.io/bathory-game/**

You pick a weapon, then explore six wings of Csejte (Čachtice) Castle hunting for five ledger pages. Her risen servants (ghouls, blood maidens and bat swarms) crawl out of the mist quickly, and killing them may drop a sanity vial, a mirror, a coin pouch, or nothing. Only a few mirrors lie in the castle; most are earned. Elizabeth Báthory herself can't be harmed: hide, douse your lantern, flare, or shatter a mirror to freeze her (3s to 15s by mirror tier). Coins bank on the HUD; toss five into the Outer Ward well for a speed boost, a darkness curse, or a Well Dweller. Three rooms hide secret doors behind a candelabra, a skull, and a crooked portrait. Smash crates and barrels for a weapon-change token, armor, a speed tonic, or a slime. Every 15 kills drops a key (15 and 30) to the two locked puzzle chambers off the Outer Ward: the Chamber of Candles and the Crushing Hall, each sealed with a riddle. Dying leaves your fallen lantern behind on the next attempt.

This is an original game inspired by public-domain Báthory history and legend. It is not affiliated with the 2006 film *Stay Alive*.

## Local play

```bash
python3 -m http.server 8765 --bind 127.0.0.1
# then open http://127.0.0.1:8765/
```

Touch controls work on a phone browser. Keyboard fallback: WASD to move, Space/J to attack, E to act/hide, R for a mirror, F to douse the lantern, Q to flare.

See `GDD.md` for the full design document, title options, and the path to App Store / Google Play via Capacitor.

## QA

`qa/qa_combat.py` runs Playwright at a 390x844 phone viewport. It covers weapon select, killing monsters, natural spawning, mirror pickup, mirror freeze, auto-mirror on catch, obsidian repel, hiding, death and retry. It captures `screens/` and reports console errors. `qa/qa_chambers.py` covers v0.5: crates and every drop type, slime split, armor soak, the weapon token picker, keys at 15/30 kills, unlocking both doors, and solving and failing both puzzles. Add `?qa` to the URL to expose a small test hook.
