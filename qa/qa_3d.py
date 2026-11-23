"""Playwright QA for the 3D build at a 390x844 phone viewport.
Usage: /workspace/.venv-pw/bin/python qa/qa_3d.py [base_url]
"""
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright

ROOT = "/workspace/bathory-game"
base = sys.argv[1] if len(sys.argv) > 1 else None
srv = None
if not base:
    srv = subprocess.Popen(["python3", "-m", "http.server", "8766", "--bind", "127.0.0.1"], cwd=ROOT,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    base = "http://127.0.0.1:8766/"

errors = []
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path="/usr/bin/google-chrome",
                                    args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))
        page.on("console", lambda m: errors.append(f"CONSOLE {m.type}: {m.text}") if m.type in ("error", "warning") else None)
        page.goto(base + "?qa", wait_until="networkidle")
        page.wait_for_timeout(2500)
        page.screenshot(path=f"{ROOT}/screens/01-title.png")

        page.locator("#btn-start").tap()
        page.wait_for_timeout(600)
        jb = page.locator("#joystick-base").bounding_box()
        cx, cy = jb["x"] + jb["width"] / 2, jb["y"] + jb["height"] / 2
        page.mouse.move(cx, cy); page.mouse.down(); page.mouse.move(cx - 10, cy - 38, steps=5)
        page.wait_for_timeout(1300)
        page.mouse.up()
        page.wait_for_timeout(500)
        page.screenshot(path=f"{ROOT}/screens/02-exploration.png")
        fps = page.evaluate("""() => new Promise(r => { let n=0; const s=performance.now(); function f(){ n++; if (performance.now()-s<2000) requestAnimationFrame(f); else r(n/((performance.now()-s)/1000)); } requestAnimationFrame(f); })""")
        stats = page.evaluate("window.__qa.stats()")

        # Countess encounter in the great hall: player faces north, Countess 3 tiles ahead.
        page.evaluate("""() => { const q = window.__qa; q.place(q.player, 13, 10); q.player.angle = -Math.PI/2; q.player.lanternOn = true;
                                 q.place(q.countess, 13, 7); q.countess.angle = Math.PI/2; }""")
        page.wait_for_timeout(450)
        page.screenshot(path=f"{ROOT}/screens/03-countess-encounter.png")
        state_enc = page.evaluate("[window.__qa.countess.state, window.__qa.mode]")
        page.evaluate("() => { const q = window.__qa; q.place(q.countess, 4, 2); q.countess.state = 'PATROL'; }")

        # Hiding: fresh run, step into the iron alcove at (12,14), Countess prowls nearby.
        page.evaluate("""() => { const q = window.__qa; if (q.mode !== 'PLAYING') document.getElementById(q.mode==='DEAD'?'btn-retry':'btn-start').click(); }""")
        page.wait_for_timeout(400)
        page.evaluate("""() => { const q = window.__qa; q.place(q.player, 12, 14); q.place(q.countess, 4, 2); }""")
        page.wait_for_timeout(300)
        label = page.locator("#interact-label").inner_text()
        page.locator("#btn-interact").tap()
        page.wait_for_timeout(200)
        page.evaluate("""() => { const q = window.__qa; q.place(q.countess, 13, 12); q.countess.angle = Math.PI/2; }""")
        page.wait_for_timeout(500)
        page.screenshot(path=f"{ROOT}/screens/04-hiding.png")
        hid = page.evaluate("[window.__qa.player.hidden, window.__qa.mode, document.getElementById('hud-status').textContent]")

        # Pages / lore still work
        page.locator("#btn-interact").tap()
        page.evaluate("() => { const q = window.__qa; q.place(q.countess, 22, 3); q.place(q.player, 12, 11); }")
        page.wait_for_timeout(300)
        page_label = page.locator("#interact-label").inner_text()
        page.locator("#btn-interact").tap()
        page.wait_for_timeout(300)
        lore_visible = page.locator("#screen-lore").is_visible()
        page.screenshot(path=f"{ROOT}/screens/05-ledger-page.png")
        page.locator("#btn-lore-close").tap()

        print(json.dumps({"fps_swiftshader": round(fps, 1), "stats": stats, "encounter": state_enc,
                          "alcove_label": label, "hidden": hid, "page_label": page_label,
                          "lore_visible": lore_visible, "errors": errors}, indent=1))
        browser.close()
finally:
    if srv:
        srv.terminate(); srv.wait()
