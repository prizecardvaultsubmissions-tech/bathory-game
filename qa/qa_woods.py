"""Playwright QA for v0.8 Stage I: The Woods — new monsters, Packmaster mini-boss, Standing Stones & Hunter's Trap puzzles,
secrets, shrine well, Pedlar shop, carry-over transition to Stage II (The Courtyard).
Usage: /workspace/.venv-pw/bin/python qa/qa_woods.py [base_url] [--noshots]
"""
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright

ROOT = "/workspace/bathory-game"
args = [a for a in sys.argv[1:] if not a.startswith("--")]
SHOTS = "--noshots" not in sys.argv
base = args[0] if args else None
srv = None
if not base:
    srv = subprocess.Popen(["python3", "-m", "http.server", "8773", "--bind", "127.0.0.1"], cwd=ROOT,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    base = "http://127.0.0.1:8773/"

errors, results = [], {}
def shot(page, name):
    if SHOTS:
        page.screenshot(path=f"{ROOT}/screens/{name}")
def check(name, cond, info=None):
    results[name] = {"ok": bool(cond), "info": info}

HIDE_UI = "() => { for (const id of ['toast','area-title','stage-card','boon-banner']) { const el = document.getElementById(id); if (el) el.classList.add('hidden'); } }"
CALM = """() => { const Q = window.__qa; Q.spawnTimer = 999; Q.wellTimer = 999; Q.place(Q.countess, 10, 8); Q.countess.state = 'PATROL';
                  for (const m of Q.monsters) if (m !== Q.boss) m.remove = true; }"""

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

        # ---------------- Title screen & Stage I launch
        start_txt = q("document.getElementById('btn-start').textContent")
        check("title_start_woods", "WOODS" in start_txt, start_txt)
        page.locator("#btn-start").tap(); W(500)
        page.locator('.weapon-option[data-weapon="crossbow"]').tap(); W(250)
        page.locator("#btn-begin").tap(); W(900)
        q(CALM)
        st = q("[window.__qa.mode, window.__qa.stage, window.__qa.level.kind, document.getElementById('hud-pages-label').textContent]")
        check("stage1_is_woods", st == ["PLAYING", 1, "woods", "TALISMANS"], st)
        card = q("[document.getElementById('stage-card-num').textContent, document.getElementById('stage-card-title').textContent]")
        check("woods_title_card", card == ["STAGE I", "THE WOODS"], card)

        # ---------------- Level content, Pedlar, Shrine, Secrets, Talisman
        lv = q("""(() => { const L = window.__qa.level; return {
            pages: L.pages.length, brk: L.breakables.length,
            types: [...new Set(L.breakables.map(b => b.type))].sort(),
            well: !!L.well, secrets: L.secrets.length,
            locked: L.lockedRooms.map(r => r.kind),
            merchant: !!L.merchant, bossKind: L.bossKind
        }; })()""")
        check("woods_level_content", lv["pages"] == 5 and lv["brk"] >= 20 and lv["types"] == ["barrel", "crate"]
              and lv["well"] and lv["secrets"] == 2 and lv["locked"] == ["stones", "snare"]
              and lv["merchant"] and lv["bossKind"] == "packmaster", lv)

        # Timber Road scenic shot with fireflies, shrine & monsters
        q("() => { const Q = window.__qa; Q.place(Q.player, 28, 41); Q.player.angle = -Math.PI/2; Q.spawn('wolf', 26, 38); Q.spawn('wisp', 30, 38); }")
        W(1400); q(HIDE_UI)
        shot(page, "70-woods-road.png")

        # Talisman pickup
        q(CALM)
        q("() => { const Q = window.__qa; const pg = Q.level.pages[0]; Q.place(Q.player, pg.tx, pg.ty); Q.player.y += 10; }")
        W(500)
        pr = q("[document.getElementById('interact-label').textContent, document.getElementById('prompt-banner').textContent]")
        q("window.__qa.interact()"); W(400)
        seal = q("[document.querySelector('#screen-lore .lore-seal').textContent, window.__qa.player.pagesFound]")
        check("talisman_collect", pr[0] == "TAKE" and seal == ["TRAIL TALISMAN TAKEN", 1], [pr, seal])
        q("window.__qa.closeLore()")

        # Breakables + secrets + shrine well
        si = q("window.__qa.breakables.findIndex(b => b.type === 'barrel')")
        ci = q("window.__qa.breakables.findIndex(b => b.type === 'crate')")
        r1 = q(f"window.__qa.hitCrate({si}, 1, 'armor')"); r2 = q(f"window.__qa.breakCrate({ci}, 'haste')")
        check("woods_breakables", q(f"[window.__qa.breakables[{si}].hp, window.__qa.breakables[{ci}].broken]") == [1, True] and r2 == "haste", [r1, r2])
        q("window.__qa.giveCoins(15)")
        roll = q("window.__qa.tossWell('speed')")
        check("shrine_offering", roll == "speed" and q("window.__qa.player.speedBoost") > 10, roll)
        ok_s = q("window.__qa.openSecret('hollow-oak')")
        check("woods_secret_opens", ok_s and q("window.__qa.level.grid[17][18]") == 0)

        # ---------------- Monsters: wolf, stalker, wisp + oil drain
        q(CALM)
        q("() => { const Q = window.__qa; Q.place(Q.player, 28, 30); Q.player.oil = 80; Q.player.invuln = 0; Q.player.lanternOn = true; }")
        ids = q("[window.__qa.spawn('wolf', 27, 29), window.__qa.spawn('stalker', 30, 29), window.__qa.spawn('wisp', 28, 29)]")
        W(1800)
        kinds = q("window.__qa.monsters.filter(m => !m.dead && m !== window.__qa.boss).map(m => m.kind).sort()")
        lan_after = q("window.__qa.player.oil")
        check("woods_monsters_spawn", kinds == ["stalker", "wisp", "wolf"], kinds)
        check("wisp_drains_oil", lan_after < 80, lan_after)
        k_ok = q(f"window.__qa.kill({ids[0]})")
        check("wolf_killable", k_ok is True)

        # ---------------- Locked Room I: Standing Stones (stones)
        q(CALM)
        q("() => { const Q = window.__qa; Q.giveKey(1); Q.place(Q.player, 13, 45); }")
        W(300)
        check("stones_unlock", q("window.__qa.unlock(1)"))
        q("() => { const Q = window.__qa; Q.place(Q.player, 13, 50); Q.player.angle = Math.PI/2; }"); W(400)
        st_r = q("[window.__qa.puzzle && window.__qa.puzzle.kind, window.__qa.mode, document.getElementById('lore-title').textContent]")
        check("stones_seals_riddle", st_r == ["stones", "LORE", "The Woodsman's Tally"], st_r)
        q("window.__qa.closeLore()"); W(600); q(HIDE_UI)
        shot(page, "71-woods-stones.png")
        # wrong stone wakes a wolf and resets
        n0 = q("window.__qa.monsters.length")
        q("window.__qa.puzzleAct('crow')")  # wrong: owl is first
        W(300)
        fail_st = q("[window.__qa.puzzle.progress, window.__qa.monsters.length - %d]" % n0)
        check("stones_fail_wakes_wolf", fail_st == [0, 1], fail_st)
        q(CALM)
        # solve: owl -> crow -> stag -> wolf
        coins0 = q("window.__qa.player.coins")
        g0 = q("window.__qa.player.mirrors.gilded")
        for sym in ["owl", "crow", "stag", "wolf"]:
            q(f"window.__qa.puzzleAct('{sym}')")
        W(400)
        sol1 = q("[window.__qa.lockedRooms[0].solved, window.__qa.level.grid[46][13], window.__qa.player.mirrors.gilded - %d, window.__qa.player.coins - %d, window.__qa.player.sanity]" % (g0, coins0))
        check("stones_solved_reward", sol1 == [True, 0, 1, 25, 100], sol1)

        # ---------------- Locked Room II: Hunter's Trap (snare)
        q(CALM)
        q("() => { const Q = window.__qa; Q.giveKey(2); Q.place(Q.player, 42, 45); }")
        W(300)
        check("snare_unlock", q("window.__qa.unlock(2)"))
        q("() => { const Q = window.__qa; Q.place(Q.player, 42, 50); }"); W(400)
        sn_r = q("[window.__qa.puzzle && window.__qa.puzzle.kind, document.getElementById('lore-title').textContent]")
        check("snare_seals_riddle", sn_r == ["snare", "The Trapper's Compass"], sn_r)
        q("window.__qa.closeLore()"); W(500)
        ins0 = q("window.__qa.puzzle.wallInset")
        q("window.__qa.puzzleAct('south')")  # wrong: north is first
        ins1 = q("window.__qa.puzzle.wallInset")
        check("snare_fail_lurches", ins1 >= ins0 + 13 and q("window.__qa.puzzle.progress") == 0, [ins0, ins1])
        o0 = q("window.__qa.player.mirrors.obsidian")
        coins1 = q("window.__qa.player.coins")
        for sym in ["north", "east", "west", "south"]:
            q(f"window.__qa.puzzleAct('{sym}')")
        W(400)
        sol2 = q("[window.__qa.lockedRooms[1].solved, window.__qa.level.grid[46][42], window.__qa.player.mirrors.obsidian - %d, window.__qa.player.coins - %d, window.__qa.player.armor]" % (o0, coins1))
        check("snare_solved_reward", sol2 == [True, 0, 1, 35, 100], sol2)

        # ---------------- Mini-Boss: The Old Packmaster & Exit Gate
        q(CALM)
        q("() => { const Q = window.__qa; Q.player.pagesFound = 5; Q.place(Q.player, 34, 10); Q.player.angle = -Math.PI/2; }")
        W(800); q(HIDE_UI)
        binfo = q("[!!window.__qa.boss, window.__qa.boss && window.__qa.boss.kind, !document.getElementById('boss-bar').classList.contains('hidden'), document.getElementById('boss-name').textContent, window.__qa.gateOpen()]")
        check("packmaster_boss_present", binfo == [True, "packmaster", True, "THE OLD PACKMASTER", False], binfo)
        shot(page, "72-woods-packmaster.png")
        # killing Packmaster opens exit gate
        q("() => { const Q = window.__qa; Q.kill(Q.boss.id); }"); W(400)
        check("packmaster_kill_opens_gate", q("[window.__qa.bossDead, window.__qa.gateOpen()]") == [True, True])

        # ---------------- Stage I -> Stage II (The Courtyard) carry-over
        q("() => { const Q = window.__qa; Q.setCoins(140); Q.player.armor = 40; }")
        m = q("window.__qa.clearStage()"); W(700)
        st_clr = q("[m = window.__qa.mode, document.getElementById('stage-title').textContent, document.getElementById('stage-tag').textContent, window.__qa.maxUnlocked]")
        check("woods_clear_to_courtyard", st_clr == ["STAGECLEAR", "THE COURTYARD", "STAGE I CLEARED", 2], st_clr)
        shot(page, "73-stage1-to-courtyard.png")
        page.locator("#btn-stage-enter").tap(); W(1200)
        s2 = q("[window.__qa.mode, window.__qa.stage, window.__qa.level.kind, window.__qa.player.coins, window.__qa.player.armor, window.__qa.player.weapon]")
        check("enter_courtyard_carry", s2 == ["PLAYING", 2, "courtyard", 140, 40, "crossbow"], s2)

        fps = q("""() => new Promise(r => { let n=0; const s=performance.now(); function f(){ n++; if (performance.now()-s<1500) requestAnimationFrame(f); else r(n/((performance.now()-s)/1000)); } requestAnimationFrame(f); })""")
        check("render_stats", True, {"fps": round(fps, 1), **q("window.__qa.stats()")})
        browser.close()
finally:
    if srv: srv.terminate()

errs = [e for e in errors if "AudioContext was not allowed" not in e]
fails = {k: v for k, v in results.items() if not v["ok"]}
print(json.dumps(results, indent=1, default=str))
print("ERRORS:", errs)
print(f"PASS {len(results) - len(fails)}/{len(results)}")
sys.exit(1 if fails or errs else 0)
