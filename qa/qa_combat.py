"""Playwright QA for the v0.3 combat build at a 390x844 phone viewport.
Usage: /workspace/.venv-pw/bin/python qa/qa_combat.py [base_url] [--noshots]
"""
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright

ROOT = "/workspace/bathory-game"
args = [a for a in sys.argv[1:] if not a.startswith("--")]
SHOTS = "--noshots" not in sys.argv
base = args[0] if args else None
srv = None
if not base:
    srv = subprocess.Popen(["python3", "-m", "http.server", "8766", "--bind", "127.0.0.1"], cwd=ROOT,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    base = "http://127.0.0.1:8766/"

errors, results = [], {}
fps, stats, stats2 = 0, {}, {}
def shot(page, name):
    if SHOTS:
        page.screenshot(path=f"{ROOT}/screens/{name}")

def check(name, cond, info=None):
    results[name] = {"ok": bool(cond), "info": info}

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
        shot(page, "01-title.png")
        q = lambda js: page.evaluate(js)

        # --- weapon select
        page.locator("#btn-start").tap()
        page.wait_for_timeout(700)
        check("select_mode", q("window.__qa.mode") == "SELECT")
        page.locator('.weapon-option[data-weapon="crossbow"]').tap()
        page.wait_for_timeout(250)
        page.locator('.weapon-option[data-weapon="mace"]').tap()
        page.wait_for_timeout(500)
        shot(page, "05-weapon-select.png")
        sel = q("document.querySelector('.weapon-option.selected').dataset.weapon")
        check("weapon_selected", sel == "mace", sel)
        page.locator("#btn-begin").tap()
        page.wait_for_timeout(700)
        check("playing_with_weapon", q("[window.__qa.mode, window.__qa.player.weapon]") == ["PLAYING", "mace"])
        q("() => { window.__qa.spawnTimer = 999; }")  # keep the scripted fights deterministic

        # --- exploration
        jb = page.locator("#joystick-base").bounding_box()
        cx, cy = jb["x"] + jb["width"] / 2, jb["y"] + jb["height"] / 2
        page.mouse.move(cx, cy); page.mouse.down(); page.mouse.move(cx - 12, cy - 38, steps=5)
        page.wait_for_timeout(1300)
        page.mouse.up()
        page.wait_for_timeout(400)
        shot(page, "02-exploration.png")
        fps = q("""() => new Promise(r => { let n=0; const s=performance.now(); function f(){ n++; if (performance.now()-s<2000) requestAnimationFrame(f); else r(n/((performance.now()-s)/1000)); } requestAnimationFrame(f); })""")
        stats = q("window.__qa.stats()")

        # --- combat: Countess far off in the north court, two servants rise ahead of the player
        q("""() => { const Q = window.__qa; Q.place(Q.countess, 50, 5); Q.countess.state = 'PATROL';
                     Q.place(Q.player, 30, 40); Q.player.angle = -Math.PI/2; Q.player.lanternOn = true;
                     Q.spawn('ghoul', 30, 38); Q.spawn('maiden', 32, 38); }""")
        page.wait_for_timeout(1400)
        ab = page.locator("#btn-attack").bounding_box()
        ax, ay = ab["x"] + ab["width"] / 2, ab["y"] + ab["height"] / 2
        hp0 = q("window.__qa.monsters.map(m => m.hp)")
        # Hold ATTACK (touch-held pointer); grab a mid-swing frame
        page.mouse.move(ax, ay); page.mouse.down()
        took = False
        for i in range(30):
            page.wait_for_timeout(130)
            if not took and q("window.__qa.monsters.some(m => m.hp < m.maxHp && !m.dead)"):
                shot(page, "06-combat.png"); took = True
            if q("window.__qa.kills") >= 2:
                break
        page.mouse.up()
        if not took: shot(page, "06-combat.png")
        page.wait_for_timeout(300)
        kills = q("window.__qa.kills")
        check("monster_killed", kills >= 1, {"kills": kills, "hp_before": hp0, "player_health": q("window.__qa.player.health")})
        page.wait_for_timeout(1300)
        check("dead_removed", q("window.__qa.monsters.filter(m => m.remove).length") == 0)

        # --- spawning over time (natural spawner, no scripted spawns)
        q("""() => { const Q = window.__qa; Q.monsters.forEach(m => { m.dead = true; m.remove = true; });
                     Q.player.health = 100; Q.spawnTimer = 3; }""")
        t0 = q("window.__qa.elapsed")
        seen = []
        for i in range(24):
            page.wait_for_timeout(500)
            seen.append(q("window.__qa.monsters.filter(m => !m.dead).length"))
            if max(seen) >= 1 and i > 8: break
        st = q("window.__qa.spawnTimer")
        far = q("""() => { const Q = window.__qa; return Q.monsters.filter(m=>!m.dead).map(m => Math.round(Math.hypot(m.x-Q.player.x, m.y-Q.player.y)/44)); }""")
        check("natural_spawn", max(seen) >= 1 and st > 10, {"counts": seen, "next_timer": round(st, 1), "tiles_from_player": far, "game_secs": round(q('window.__qa.elapsed') - t0, 1)})

        # --- mirror pickup: walk onto the gilded mirror in the great hall
        q("() => { const Q = window.__qa; Q.monsters.forEach(m => { m.dead = true; m.remove = true; }); Q.spawnTimer = 999; Q.place(Q.player, 36, 27); Q.player.angle = -Math.PI/2; }")
        page.wait_for_timeout(500)
        page.mouse.move(cx, cy); page.mouse.down(); page.mouse.move(cx, cy - 40, steps=4)
        for i in range(20):
            page.wait_for_timeout(150)
            if q("window.__qa.player.mirrors.gilded") >= 1: break
        page.mouse.up()
        page.wait_for_timeout(300)
        mir = q("window.__qa.player.mirrors")
        hudm = q("document.getElementById('hud-mirrors').textContent")
        check("mirror_pickup", mir["gilded"] >= 1, {"mirrors": mir, "hud": hudm, "btn": q("document.getElementById('mirror-sub').textContent")})

        # --- mirror freeze: Countess closes in hunting; tap MIRROR
        q("""() => { const Q = window.__qa; Q.place(Q.player, 35, 29); Q.player.angle = -Math.PI/2; Q.player.lanternOn = true;
                     Q.place(Q.countess, 35, 25); Q.countess.state = 'HUNT'; Q.countess.angle = Math.PI/2; }""")
        page.wait_for_timeout(250)
        shot(page, "03-countess-encounter.png")
        page.locator("#btn-mirror").tap()
        page.wait_for_timeout(120)
        fz = q("[window.__qa.countess.state, +window.__qa.countess.freezeTimer.toFixed(2), window.__qa.player.mirrors.gilded]")
        pos0 = q("[window.__qa.countess.x, window.__qa.countess.y]")
        page.wait_for_timeout(700)
        shot(page, "07-mirror-freeze.png")
        page.wait_for_timeout(500)
        pos1 = q("[window.__qa.countess.x, window.__qa.countess.y]")
        banner = q("!document.getElementById('freeze-banner').classList.contains('hidden') && document.getElementById('freeze-time').textContent")
        check("mirror_freeze", fz[0] == "FROZEN" and fz[1] > 9 and pos0 == pos1, {"state": fz, "banner": banner, "moved": pos0 != pos1})

        # --- weapons don't hurt her: hit while thawed -> stagger only
        q("() => { const Q = window.__qa; Q.countess.freezeTimer = 0.01; }")
        page.wait_for_timeout(200)
        q("() => { const Q = window.__qa; Q.countess.x = Q.player.x; Q.countess.y = Q.player.y - 40; Q.countess.state = 'SEARCH'; }")
        q("window.__qa.attack()")
        page.wait_for_timeout(60)
        check("countess_stagger_only", q("window.__qa.countess.state") == "STUNNED" and q("window.__qa.mode") == "PLAYING", q("window.__qa.countess.state"))

        # --- auto last-ditch mirror on catch
        q("() => { const Q = window.__qa; Q.giveMirror('cracked', 1); Q.countess.state = 'HUNT'; Q.countess.x = Q.player.x - 6; Q.countess.y = Q.player.y; }")
        page.wait_for_timeout(500)
        auto = q("[window.__qa.mode, window.__qa.countess.state, window.__qa.player.mirrors.cracked]")
        check("auto_mirror_on_catch", auto == ["PLAYING", "FROZEN", 0], auto)

        # --- obsidian repels monsters
        q("""() => { const Q = window.__qa; Q.place(Q.player, 9, 6); Q.place(Q.countess, 9, 12); Q.countess.freezeTimer = 0.01; }""")
        page.wait_for_timeout(250)
        q("""() => { const Q = window.__qa; Q.place(Q.player, 9, 6); Q.place(Q.countess, 9, 12); Q.countess.stun(30);
                     Q.giveMirror('obsidian', 1); Q.spawn('ghoul', 11, 6); Q.spawn('bats', 7, 7); }""")
        page.wait_for_timeout(2600)
        d0 = q("() => { const Q=window.__qa; return Q.monsters.filter(m=>!m.dead).map(m=>Math.hypot(m.x-Q.player.x,m.y-Q.player.y)); }")
        q("window.__qa.useMirror()")
        page.wait_for_timeout(350)
        shot(page, "09-obsidian-repel.png")
        d1 = q("() => { const Q=window.__qa; return Q.monsters.filter(m=>!m.dead).map(m=>Math.hypot(m.x-Q.player.x,m.y-Q.player.y)); }")
        check("obsidian_repel", q("window.__qa.countess.state") == "FROZEN" and (sum(d1) > sum(d0) or len(d1) < len(d0)), {"before": [round(x) for x in d0], "after": [round(x) for x in d1]})

        # --- larger map: torture gallery & north gate court views
        q("""() => { const Q = window.__qa; Q.monsters.forEach(m => { m.dead = true; m.remove = true; }); Q.place(Q.countess, 50, 40); Q.countess.state='PATROL'; Q.countess.freezeTimer=0;
                     Q.place(Q.player, 9, 9); Q.player.angle = -Math.PI/2; Q.player.lanternOn = true; Q.spawn('maiden', 10, 7); Q.spawn('ghoul', 7, 7); }""")
        page.wait_for_timeout(1800)
        shot(page, "08-torture-gallery.png")
        q("""() => { const Q = window.__qa; Q.monsters.forEach(m => { m.dead = true; m.remove = true; }); Q.place(Q.player, 38, 6); Q.player.angle = -Math.PI/2; }""")
        page.wait_for_timeout(1200)
        shot(page, "10-north-gate.png")
        stats2 = q("window.__qa.stats()")

        results["mode_before_hiding"] = {"ok": q("window.__qa.mode") == "PLAYING", "info": q("[window.__qa.mode, document.getElementById('death-reason').textContent, window.__qa.player.health]")}
        # --- hiding still works (alcove at 12,14)
        q("() => { const Q = window.__qa; Q.place(Q.player, 12, 14); Q.place(Q.countess, 30, 40); }")
        page.wait_for_timeout(300)
        page.locator("#btn-interact").tap()
        page.wait_for_timeout(200)
        check("hiding", q("window.__qa.player.hidden") is True)
        q("() => { const Q = window.__qa; Q.place(Q.countess, 13, 12); Q.countess.state = 'SEARCH'; Q.countess.stun(3); Q.countess.angle = Math.PI/2; }")
        page.wait_for_timeout(600)
        shot(page, "04-hiding.png")
        check("hidden_survives", q("[window.__qa.mode, window.__qa.player.hidden]") == ["PLAYING", True])
        q("() => { const Q = window.__qa; Q.place(Q.countess, 30, 40); Q.countess.state = 'PATROL'; }")
        page.locator("#btn-interact").tap()

        # --- death when caught with no mirrors
        q("() => { const Q = window.__qa; Q.player.hidden=false; for (const k in Q.player.mirrors) Q.player.mirrors[k]=0; Q.countess.state='HUNT'; Q.countess.x = Q.player.x - 6; Q.countess.y = Q.player.y; }")
        page.wait_for_timeout(500)
        check("death_without_mirror", q("window.__qa.mode") == "DEAD", q("document.getElementById('death-reason').textContent"))
        page.wait_for_timeout(400)
        shot(page, "11-death.png")
        # retry keeps weapon
        page.locator("#btn-retry").tap()
        page.wait_for_timeout(500)
        check("retry_keeps_weapon", q("[window.__qa.mode, window.__qa.player.weapon]") == ["PLAYING", "mace"])
        browser.close()
except Exception as ex:
    errors.append(f"SCRIPT: {str(ex)[:300]}")
    try: errors.append("mode=" + str(q("[window.__qa.mode, document.getElementById('death-reason').textContent]")))
    except Exception: pass
finally:
    if srv: srv.terminate()

print(json.dumps({"fps": round(fps, 1), "stats": stats, "stats_north": stats2}, indent=1))
for k, v in results.items():
    print(("PASS " if v["ok"] else "FAIL ") + k, json.dumps(v["info"]) if v["info"] is not None else "")
print("ERRORS:", len(errors))
for e in errors[:30]: print(" ", e)
