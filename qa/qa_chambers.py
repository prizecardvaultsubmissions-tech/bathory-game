"""Playwright QA for v0.5: breakable crates, slimes, armor, weapon tokens, kill keys, locked puzzle chambers.
Usage: /workspace/.venv-pw/bin/python qa/qa_chambers.py [base_url] [--noshots]
"""
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright

ROOT = "/workspace/bathory-game"
args = [a for a in sys.argv[1:] if not a.startswith("--")]
SHOTS = "--noshots" not in sys.argv
base = args[0] if args else None
srv = None
if not base:
    srv = subprocess.Popen(["python3", "-m", "http.server", "8767", "--bind", "127.0.0.1"], cwd=ROOT,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    base = "http://127.0.0.1:8767/"

errors, results = [], {}
def shot(page, name):
    if SHOTS:
        page.screenshot(path=f"{ROOT}/screens/{name}")
def check(name, cond, info=None):
    results[name] = {"ok": bool(cond), "info": info}

HIDE_UI = "() => { for (const id of ['toast','area-title']) document.getElementById(id).classList.add('hidden'); }"
CALM = """() => { const Q = window.__qa; Q.spawnTimer = 999; Q.wellTimer = 999; Q.place(Q.countess, 50, 5); Q.countess.state = 'PATROL';
                  for (const m of Q.monsters) m.remove = true; }"""

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path="/usr/bin/google-chrome",
                                    args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))
        page.on("console", lambda m: errors.append(f"CONSOLE {m.type}: {m.text}") if m.type in ("error", "warning") else None)
        page.goto(base + "?qa", wait_until="networkidle")
        page.wait_for_timeout(2000)
        q = lambda js: page.evaluate(js)
        W = page.wait_for_timeout

        page.locator("#btn-start").tap(); W(500)
        page.locator('.weapon-option[data-weapon="mace"]').tap(); W(300)
        page.locator("#btn-begin").tap(); W(700)
        q(CALM)
        n_brk = q("window.__qa.breakables.length")
        check("breakables_placed", n_brk >= 20, n_brk)
        hud = q("[document.getElementById('hud-kill-val').textContent, document.getElementById('hud-armor-val').textContent]")
        check("hud_kills_armor_initial", hud == ["0/15", "0"], hud)

        # --- locked door before any key
        q("() => { const Q = window.__qa; Q.place(Q.player, 13, 44); Q.player.angle = Math.PI/2; }")
        W(2600)
        q(HIDE_UI)
        locked = q("[document.getElementById('interact-label').textContent, document.getElementById('prompt-banner').textContent]")
        check("door_locked_prompt", locked[0] == "LOCKED" and "Requires Key I" in locked[1], locked)
        shot(page, "23-locked-door.png")
        q("window.__qa.interact()")
        check("door_stays_locked", q("window.__qa.lockedRooms[0].unlocked") is False and q("window.__qa.level.grid[46][13]") == 1)

        # --- crate breaking with real attacks (mace: 2 dmg per hit vs crate 3 hp)
        idx = q("window.__qa.breakables.findIndex(b => b.tx === 26 && b.ty === 37)")
        q("() => { const Q = window.__qa; Q.place(Q.player, 26, 38); Q.player.angle = -Math.PI/2; }")
        W(1500)
        q("window.__qa.attack()")
        W(1200)
        hp1 = q(f"window.__qa.breakables[{idx}].hp")
        q("window.__qa.attack()")
        W(160)
        q(HIDE_UI)
        shot(page, "18-crate-break.png")
        b = q(f"(() => {{ const b = window.__qa.breakables[{idx}]; return {{broken: b.broken, cell: window.__qa.level.grid[b.ty][b.tx]}}; }})()")
        check("crate_takes_hits", hp1 == 1, hp1)
        check("crate_breaks", b["broken"] is True and b["cell"] == 0, b)
        W(600)
        q(CALM)
        # clear whatever came out so forced tests are deterministic
        q("() => { const Q = window.__qa; Q.drops.length = 0; }")

        def crate_at(tx, ty):
            return q(f"window.__qa.breakables.findIndex(b => b.tx === {tx} && b.ty === {ty})")

        # armor
        i = crate_at(31, 37)
        q(f"() => {{ const Q = window.__qa; Q.place(Q.player, 31, 39); Q.breakCrate({i}, 'armor'); }}")
        W(1800)
        q(f"() => {{ const Q = window.__qa; const d = Q.drops.find(d => d.kind === 'armor'); if (d) {{ Q.player.x = d.x; Q.player.y = d.y; }} }}")
        W(500)
        arm = q("window.__qa.player.armor")
        check("armor_drop", arm == 35, arm)
        hurt = q("window.__qa.hurt(20)")
        W(250)
        check("armor_absorbs", hurt[1] == 15 and hurt[0] == 100, hurt)
        armhud = q("document.getElementById('hud-armor-val').textContent")
        check("armor_hud", armhud == "15", armhud)

        # haste
        i = crate_at(50, 40)
        q(f"() => {{ const Q = window.__qa; Q.place(Q.player, 49, 40); Q.breakCrate({i}, 'haste'); }}")
        W(1800)
        q(f"() => {{ const Q = window.__qa; const d = Q.drops.find(d => d.kind === 'haste'); if (d) {{ Q.player.x = d.x; Q.player.y = d.y; }} }}")
        W(400)
        hs = q("[window.__qa.player.speedBoost, window.__qa.boon]")
        check("haste_drop", hs[0] > 13 and hs[1] == "SPEED BOOST", hs)

        # weapon token -> picker
        i = crate_at(4, 37)
        q(f"() => {{ const Q = window.__qa; Q.place(Q.player, 5, 38); Q.breakCrate({i}, 'token'); }}")
        W(1800)
        q(f"() => {{ const Q = window.__qa; const d = Q.drops.find(d => d.kind === 'token'); if (d) {{ Q.player.x = d.x; Q.player.y = d.y; }} }}")
        W(500)
        tok = q("[window.__qa.mode, !document.getElementById('screen-token').classList.contains('hidden'), document.querySelectorAll('#token-grid .token-option:not([disabled])').length]")
        shot(page, "19-weapon-token.png")
        check("token_picker", tok == ["PICK", True, 3], tok)
        page.locator('#token-grid .token-option[data-weapon="staff"]').tap()
        W(400)
        check("token_swaps_weapon", q("[window.__qa.mode, window.__qa.player.weapon]") == ["PLAYING", "staff"])
        q("window.__qa.pickWeapon('mace')")

        # slime + split
        q(CALM)
        i = crate_at(19, 43)
        q(f"() => {{ const Q = window.__qa; Q.place(Q.player, 19, 41); Q.player.angle = Math.PI/2; Q.breakCrate({i}, 'slime'); }}")
        W(1600)
        q(HIDE_UI); q("document.getElementById('boon-banner').classList.add('hidden')")
        sl = q("window.__qa.monsters.filter(m => m.kind === 'slime' && !m.dead).map(m => [m.hp, m.maxHp])")
        shot(page, "20-slime.png")
        check("slime_from_crate", sl == [[25, 25]], sl)
        q("() => { const Q = window.__qa; const m = Q.monsters.find(m => m.kind === 'slime'); m.state = 'WANDER'; m.hp = 1; Q.player.x = m.x + 30; Q.player.y = m.y; Q.player.angle = Math.PI; }")
        for _ in range(4):
            q("window.__qa.attack()"); W(350)
            if q("window.__qa.monsters.filter(m => m.kind === 'slimelet').length") >= 2:
                break
        minis = q("window.__qa.monsters.filter(m => m.kind === 'slimelet').length")
        check("slime_splits", minis == 2, minis)
        q(CALM)

        # --- kills -> keys
        q("() => { const Q = window.__qa; Q.place(Q.player, 28, 41); Q.drops.length = 0; Q.kills = 14; }")
        W(300)
        q("window.__qa.killForDrop('ghoul', 'nothing', 28, 39)")
        W(1300)
        q("() => { for (const id of ['toast','area-title']) document.getElementById(id).classList.add('hidden'); }")
        k1 = q("[window.__qa.kills, window.__qa.drops.filter(d => d.kind === 'key').map(d => d.keyNo), window.__qa.boon]")
        shot(page, "21-key-drop.png")
        check("key1_at_15", k1[0] == 15 and k1[1] == [1] and k1[2] == "THE FIRST KEY FALLS…", k1)
        q("() => { const Q = window.__qa; const d = Q.drops.find(d => d.kind === 'key'); Q.player.x = d.x; Q.player.y = d.y; }")
        W(400)
        q("() => { const Q = window.__qa; Q.place(Q.player, 24, 41); Q.kills = 29; }")
        q("window.__qa.killForDrop('ghoul', 'nothing', 28, 39)")
        W(1300)
        k2 = q("[window.__qa.kills, window.__qa.drops.filter(d => d.kind === 'key').map(d => d.keyNo), window.__qa.boon]")
        check("key2_at_30", k2[0] == 30 and k2[1] == [2] and k2[2] == "THE SECOND KEY FALLS…", k2)
        q("() => { const Q = window.__qa; const d = Q.drops.find(d => d.kind === 'key'); Q.player.x = d.x; Q.player.y = d.y; }")
        W(500)
        q(HIDE_UI)
        keys = q("[window.__qa.player.keys[1], window.__qa.player.keys[2], document.getElementById('key-slot-1').className, document.getElementById('key-slot-2').className, document.getElementById('hud-kill-val').textContent]")
        shot(page, "22-keys-hud.png")
        check("keys_in_hud", keys[0] == "held" and keys[1] == "held" and "held" in keys[2] and "held" in keys[3] and keys[4] == "30", keys)

        # --- Chamber of Candles
        q(CALM)
        q("() => { const Q = window.__qa; Q.place(Q.player, 13, 45); Q.player.angle = Math.PI/2; }")
        W(500)
        lab = q("document.getElementById('interact-label').textContent")
        q("window.__qa.interact()")
        W(300)
        un = q("[window.__qa.lockedRooms[0].unlocked, window.__qa.level.grid[46][13], window.__qa.player.keys[1]]")
        check("unlock_candles", lab == "UNLOCK" and un == [True, 0, "used"], {"label": lab, "state": un})
        W(900)
        q("() => { const Q = window.__qa; Q.place(Q.player, 13, 49); Q.player.angle = Math.PI/2; }")
        W(500)
        rid = q("[window.__qa.mode, document.getElementById('lore-title').textContent, document.getElementById('lore-body').textContent.split('\\n').length, window.__qa.puzzle && window.__qa.puzzle.key, window.__qa.level.grid[46][13], window.__qa.player.hasTaper]")
        shot(page, "24-riddle.png")
        check("candles_seal_and_riddle", rid[0] == "LORE" and rid[1] == "The Hours of Csejte" and rid[2] >= 7 and rid[3] == "candles" and rid[4] == 1 and rid[5] is True, rid)
        q("window.__qa.closeLore()")
        # spawns paused / Countess kept out
        q("() => { const Q = window.__qa; Q.spawnTimer = 0; Q.wellTimer = 0; }")
        W(800)
        paused = q("[window.__qa.monsters.filter(m => !m.dead).length, window.__qa.spawnTimer <= 0]")
        check("spawns_paused_in_puzzle", paused == [0, True], paused)
        q("() => { const Q = window.__qa; Q.spawnTimer = 999; Q.wellTimer = 999; }")
        # wrong candle first
        p_wrong = q("window.__qa.lightCandle('moon')")
        W(300)
        wrong = q("[window.__qa.puzzle.progress, window.__qa.puzzle.failCount, window.__qa.monsters.filter(m => m.kind === 'slimelet' && !m.dead).length]")
        check("candle_wrong_snuffs", wrong[0] == 0 and wrong[1] == 1 and wrong[2] == 1, wrong)
        q("() => { for (const m of window.__qa.monsters) m.remove = true; }")
        # first correct candle via the real interact button
        q("() => { const Q = window.__qa; const it = Q.puzzle.items.find(i => i.sym === 'sun'); Q.player.x = it.x - 30; Q.player.y = it.y + 10; }")
        W(400)
        lab2 = q("[document.getElementById('interact-label').textContent, document.getElementById('prompt-banner').textContent]")
        page.locator("#btn-interact").tap()
        W(300)
        check("candle_light_button", lab2[0] == "LIGHT" and "SUN" in lab2[1] and q("window.__qa.puzzle.progress") == 1, lab2)
        for sym in ["bell", "rose", "key"]:
            q(f"window.__qa.lightCandle('{sym}')")
        q("() => { const Q = window.__qa; Q.place(Q.player, 13, 51); Q.player.angle = Math.PI/2; document.getElementById('boon-banner').classList.add('hidden'); }")
        W(1600)
        q(HIDE_UI)
        shot(page, "25-candle-room.png")
        before = q("[window.__qa.player.mirrors.gilded, window.__qa.player.coins]")
        for sym in ["moon", "skull"]:
            q(f"window.__qa.lightCandle('{sym}')")
        W(400)
        after = q("[window.__qa.lockedRooms[0].solved, window.__qa.puzzle, window.__qa.level.grid[46][13], window.__qa.player.mirrors.gilded, window.__qa.player.coins, window.__qa.boon]")
        check("candles_solved", after[0] is True and after[1] is None and after[2] == 0 and after[3] == before[0] + 1 and after[4] == before[1] + 30 and "SOLVED" in (after[5] or ""), after)

        # --- Crushing Hall
        q(CALM)
        q("() => { const Q = window.__qa; Q.place(Q.player, 42, 45); Q.player.angle = Math.PI/2; }")
        W(400)
        q("window.__qa.interact()")
        W(700)
        check("unlock_crush", q("[window.__qa.lockedRooms[1].unlocked, window.__qa.level.grid[46][42]]") == [True, 0])
        q("() => { const Q = window.__qa; Q.place(Q.player, 41, 49); }")
        W(500)
        rid2 = q("[window.__qa.mode, document.getElementById('lore-title').textContent, window.__qa.puzzle && window.__qa.puzzle.key]")
        check("crush_seal_and_riddle", rid2 == ["LORE", "The Walls Remember", "crush"], rid2)
        ins0 = q("window.__qa.puzzle.wallInset")
        W(1200)
        check("walls_pause_while_reading", q("window.__qa.puzzle.wallInset") == ins0)
        q("window.__qa.closeLore()")
        W(2500)
        ins1 = q("window.__qa.puzzle.wallInset")
        check("walls_close", ins1 > ins0 + 3, [ins0, ins1])
        q("window.__qa.pressPlate('air')")
        ins2 = q("window.__qa.puzzle.wallInset")
        q("window.__qa.pressPlate('water')")  # wrong: fire should be second
        wr = q("[window.__qa.puzzle.progress, window.__qa.puzzle.wallInset - %f, window.__qa.puzzle.items.filter(i => i.pressed).length]" % ins2)
        check("plate_wrong_resets_lurches", wr[0] == 0 and wr[1] >= 13 and wr[2] == 0, wr)
        q("window.__qa.pressPlate('air')"); q("window.__qa.pressPlate('fire')")
        q("() => { const Q = window.__qa; Q.puzzle.wallInset = Math.max(Q.puzzle.wallInset, 52); Q.place(Q.player, 41, 51); Q.player.angle = -Math.PI/2; document.getElementById('boon-banner').classList.add('hidden'); }")
        W(1600)
        q(HIDE_UI)
        shot(page, "26-crushing-walls.png")
        hudtxt = q("document.getElementById('puzzle-info').textContent")
        check("crush_hud_timer", "Plates 2 / 4" in hudtxt and "walls meet in" in hudtxt, hudtxt)
        q("window.__qa.pressPlate('water')"); q("window.__qa.pressPlate('earth')")
        W(400)
        cs = q("[window.__qa.lockedRooms[1].solved, window.__qa.level.grid[46][42], window.__qa.player.mirrors.obsidian >= 1, window.__qa.player.armor]")
        check("crush_solved", cs == [True, 0, True, 100], cs)
        W(1500)
        check("walls_retract", q("window.__qa.lockedRooms[1].wallInset") < 60, q("window.__qa.lockedRooms[1].wallInset"))

        # --- Crush failure in a fresh run
        q("window.__qa.newRun()")
        W(600)
        q(CALM)
        q("() => { const Q = window.__qa; Q.giveKey(2); Q.place(Q.player, 42, 45); }")
        W(300)
        q("window.__qa.unlock(2)")
        W(600)
        q("() => { const Q = window.__qa; Q.place(Q.player, 41, 50); }")
        W(400)
        q("window.__qa.closeLore()")
        q("() => { const Q = window.__qa; Q.puzzle.wallInset = 104; }")
        W(1500)
        dead = q("[window.__qa.mode, document.getElementById('death-reason').textContent, !!localStorage.getItem('csejte_death_echo')]")
        check("crush_kills", dead[0] == "DEAD" and "Crushing Hall" in dead[1] and dead[2] is True, dead)

        # --- candle failure leaves the puzzle unsolved and door shut
        page.locator("#btn-retry").tap(); W(700)
        q(CALM)
        q("() => { const Q = window.__qa; Q.giveKey(1); Q.place(Q.player, 13, 45); }")
        q("window.__qa.unlock(1)"); W(500)
        q("() => { const Q = window.__qa; Q.place(Q.player, 13, 49); }"); W(400)
        q("window.__qa.closeLore()")
        q("window.__qa.lightCandle('sun')"); q("window.__qa.lightCandle('rose')")
        cf = q("[window.__qa.puzzle.progress, window.__qa.puzzle.solved, window.__qa.level.grid[46][13]]")
        check("candle_fail_keeps_sealed", cf == [0, False, 1], cf)

        fps = q("""() => new Promise(r => { let n=0; const s=performance.now(); function f(){ n++; if (performance.now()-s<2000) requestAnimationFrame(f); else r(n/((performance.now()-s)/1000)); } requestAnimationFrame(f); })""")
        print(json.dumps({"fps": round(fps, 1), "stats": q("window.__qa.stats()")}))
        browser.close()
except Exception as ex:
    errors.append(f"QA SCRIPT EXCEPTION: {ex}"[:400])
finally:
    if srv: srv.terminate()

for k, v in results.items():
    print(("PASS" if v["ok"] else "FAIL"), k, json.dumps(v["info"], ensure_ascii=False) if v["info"] is not None else "")
print("ERRORS:", len(errors))
for e in errors[:20]: print(" ", e)
