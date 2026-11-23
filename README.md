# Csejte: Blood Ledger

A mobile-first gothic stealth horror prototype for Prize Card Vault / *House of Horrors*, rendered in PS1-era low-poly 3D (Three.js, bundled locally).

Play the public test build: **https://prizecardvaultsubmissions-tech.github.io/bathory-game/**

You sneak through Csejte (Čachtice) Castle collecting five ledger pages while Elizabeth Báthory hunts you. Your lantern lights the way, but it also draws her in. Douse it to hide, slip into iron alcoves, or flare to stun her. Dying leaves your fallen lantern behind on the next attempt.

This is an original game inspired by public-domain Báthory history and legend. It is not affiliated with the 2006 film *Stay Alive*.

## Local play

```bash
python3 -m http.server 8765 --bind 127.0.0.1
# then open http://127.0.0.1:8765/
```

Touch controls work on a phone browser. Keyboard fallback: WASD to move, E to act/hide, F to douse the lantern, Q to flare.

See `GDD.md` for the full design document, title options, and the path to App Store / Google Play via Capacitor.

## QA

`qa/qa_3d.py` runs Playwright at a 390x844 phone viewport, captures `screens/`, and fails loudly on console errors. Add `?qa` to the URL to expose a small test hook.
