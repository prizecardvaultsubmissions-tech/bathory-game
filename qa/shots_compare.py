"""Fixed scenes for before/after graphics comparison.
Usage: python qa/shots_compare.py <prefix> [base_url]   -> screens/compare/<prefix>-NN-name.png
"""
import subprocess, sys, time
from playwright.sync_api import sync_playwright

ROOT = "/workspace/bathory-game"
prefix = sys.argv[1] if len(sys.argv) > 1 else "shot"
base = sys.argv[2] if len(sys.argv) > 2 else None
srv = None
if not base:
    srv = subprocess.Popen(["python3", "-m", "http.server", "8771", "--bind", "127.0.0.1"], cwd=ROOT,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    base = "http://127.0.0.1:8771/"

HIDE = "() => { for (const id of ['toast','area-title','stage-card','prompt-banner','boon-banner']) { const e = document.getElementById(id); if (e) e.classList.add('hidden'); } }"
CALM = """() => { const Q = window.__qa; Q.spawnTimer = 999; Q.wellTimer = 999; for (const m of Q.monsters) m.remove = true; }"""
HOLD = """() => { const Q = window.__qa; Q.spawnTimer = 999; Q.wellTimer = 999; for (const m of Q.monsters) { m.state = 'WANDER'; m.timer = 0; m.angle = Math.atan2(Q.player.y - m.y, Q.player.x - m.x); m.update = function(){}; } Q.countess.update = function(){}; }"""

SCENES = {
  1: [
    ("outer-ward", (28, 40), -1.5708, (40, 20), [("ghoul", 30, 38), ("maiden", 26, 38)]),
    ("great-hall", (28, 27), -1.5708, (28, 22), [("bats", 25, 25)]),
    ("torture", (9, 10), -1.5708, (40, 20), [("ghoul", 7, 7), ("ghoul", 12, 8)]),
    ("faces", (28, 39), 1.5708, (29, 37), [("ghoul", 26, 38), ("maiden", 30, 39)]),
  ],
  2: [
    ("chapelyard", (28, 37), -1.5708, (47, 7), [("skeleton", 26, 34), ("banshee", 30, 33)]),
    ("mausoleum", (9, 12), -1.5708, (47, 7), [("brute", 10, 9)]),
    ("bonepit", (47, 33), -1.5708, (47, 29), [("skeleton", 45, 31)]),
  ],
}

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path="/usr/bin/google-chrome",
                                args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.goto(base + "?qa", wait_until="networkidle")
    page.wait_for_timeout(2000)
    q = lambda js: page.evaluate(js)
    q("() => { try { localStorage.setItem('csejte_quality', JSON.stringify(%s)); } catch(e){} }" % ('"high"'))
    n = 0
    for stage, scenes in SCENES.items():
        q(f"window.__qa.startStage({stage})")
        page.wait_for_timeout(1200)
        if q("!!(window.__qa.setQuality)"): q("window.__qa.setQuality('high')")
        for (name, (px, py), ang, (cx, cy), mons) in scenes:
            n += 1
            q(CALM)
            q(f"() => {{ const Q = window.__qa; Q.player.health = Q.player.maxHealth; Q.player.sanity = 100; Q.player.oil = 100; Q.player.lanternOn = true; Q.place(Q.player, {px}, {py}); Q.player.angle = {ang}; Q.countess.state = 'PATROL'; Q.place(Q.countess, {cx}, {cy}); Q.countess.update = function(){{}}; }}")
            for (t, mx, my) in mons:
                q(f"window.__qa.spawn('{t}', {mx}, {my})")
            page.wait_for_timeout(1500)
            q(HOLD)
            print(name, q("window.__qa.monsters.map(m => [m.kind, Math.round(m.x/44), Math.round(m.y/44), m.state])"))
            page.wait_for_timeout(900)
            q(HIDE)
            page.wait_for_timeout(150)
            page.screenshot(path=f"{ROOT}/screens/compare/{prefix}-{n:02d}-s{stage}-{name}.png")
            q("() => { const Q = window.__qa; for (const m of Q.monsters) { delete m.update; m.remove = true; } delete Q.countess.update; }")
            page.wait_for_timeout(100)
    browser.close()
if srv: srv.terminate()
print("done")
