"""Playwright QA for v0.7: Stage III "The Climb" — Stage II -> III transition with carry-over, the Pedlar mid-climb,
every floor transition (up and down), Countess following + aggression, new monsters, breakable casks/bookshelves,
the Tower Gargoyle, both riddle rooms (solved + failed), the ending, and the graphics quality toggle.
Usage: /workspace/.venv-pw/bin/python qa/qa_stage3.py [base_url] [--noshots]
"""
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright

ROOT = "/workspace/bathory-game"
args = [a for a in sys.argv[1:] if not a.startswith("--")]
SHOTS = "--noshots" not in sys.argv
base = args[0] if args else None
srv = None
if not base:
    srv = subprocess.Popen(["python3", "-m", "http.server", "8772", "--bind", "127.0.0.1"], cwd=ROOT,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    base = "http://127.0.0.1:8772/"

errors, results = [], {}
def shot(page, name):
    if SHOTS:
        page.screenshot(path=f"{ROOT}/screens/{name}")
def check(name, cond, info=None):
    results[name] = {"ok": bool(cond), "info": info}

HIDE_UI = "() => { for (const id of ['toast','area-title','stage-card','boon-banner']) document.getElementById(id).classList.add('hidden'); }"
CALM = """() => { const Q = window.__qa; Q.spawnTimer = 999; Q.wellTimer = 999; Q.countessAway = 999;
                  for (const m of Q.monsters) if (m.kind !== 'gargoyle') m.remove = true; }"""

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

        def collect_seal(n):
            pg = q(f"[window.__qa.level.pages[{n}].tx, window.__qa.level.pages[{n}].ty]")
            q(f"() => {{ const Q = window.__qa; Q.place(Q.player, {pg[0]}, {pg[1]}); }}")
            W(350)
            q("window.__qa.interact()"); W(150)
            q("window.__qa.closeLore()")

        q("window.__qa.resetProgress()")
        check("stage3_chip_hidden_initially", q("document.getElementById('btn-stage-5').classList.contains('hidden')"))

        # ---------------- quality toggle (title chip cycles AUTO -> LOW -> MEDIUM -> HIGH)
        q("window.__qa.setQuality('auto')")
        labels = []
        for _ in range(4):
            page.locator("#btn-quality").tap(); W(150)
            labels.append(q("document.querySelector('#btn-quality .q-label').textContent"))
        check("quality_chip_cycles", labels[:3] == ["LOW", "MEDIUM", "HIGH"] and labels[3].startswith("AUTO"), labels)
        res = {}
        for lv in ["low", "med", "high"]:
            q(f"window.__qa.setQuality('{lv}')"); W(100)
            res[lv] = q("[window.__qa.renderer.res, window.__qa.renderer.renderer.shadowMap.enabled]")
        check("quality_presets_apply", res["low"][0] < res["med"][0] < res["high"][0] and res["low"][1] is False and res["high"][1] is True, res)
        q("window.__qa.setQuality('high')")

        # ---------------- Stage II clear -> Stage III with carry-over
        q("window.__qa.startStage(4, 0)"); W(500)
        q("() => { const Q = window.__qa; Q.spawnTimer = 999; Q.wellTimer = 999; Q.countess.state = 'PATROL'; for (const m of Q.monsters) m.remove = true; }")
        q("window.__qa.setCoins(150)"); q("window.__qa.giveMirror('silver', 2)")
        m = q("window.__qa.clearStage()"); W(700)
        st = q("[document.getElementById('stage-title').textContent, document.getElementById('btn-stage-enter').textContent, document.getElementById('screen-stage').classList.contains('climb')]")
        check("stage2_clears_to_climb_screen", m == "STAGECLEAR" and st[0] == "THE CLIMB" and "CELLAR" in st[1] and st[2], [m, st])
        shot(page, "50-stage3-transition.png")
        page.locator("#btn-stage-enter").tap(); W(1200)
        s3 = q("[window.__qa.mode, window.__qa.stage, window.__qa.floor, window.__qa.player.coins, window.__qa.player.mirrors.silver, window.__qa.countessAway > 0]")
        check("enter_stage3_carry", s3[:3] == ["PLAYING", 5, 1] and s3[3] == 150 and s3[4] >= 2 and s3[5], s3)
        card = q("[document.getElementById('stage-card-num').textContent, document.getElementById('stage-card-title').textContent]")
        check("stage3_card", card == ["STAGE V", "THE CLIMB"], card)
        W(400); q(HIDE_UI)
        shot(page, "51-s3-floor1-cellar.png")
        check("hud_label_seals", q("document.getElementById('hud-pages-label').textContent") == "SEALS")
        check("countess_away_at_start", q("window.__qa.countess.x") < 0)
        q(CALM)

        # ---------------- the floors: barred stair, seal, climb; per-floor look and aggression
        floor_info = {}
        q("() => { const Q = window.__qa; const s = Q.stairs.find((x) => x.floor === 1 && x.dir === 'up'); Q.player.x = s.ax; Q.player.y = s.ay; Q.player.angle = -Math.PI / 2; Q.renderer.snapCam = true; }")
        W(600); q(HIDE_UI)
        pr = q("[document.getElementById('interact-label').textContent, document.getElementById('prompt-banner').textContent]")
        check("stair_barred_prompt", pr[0] == "BARRED" and "Tower Seal" in pr[1], pr)
        shot(page, "52-s3-stair-barred.png")
        check("stair_barred_blocks", q("window.__qa.takeStair(1, 'up')") == -1 and q("window.__qa.floor") == 1)
        for n in range(1, 6):
            collect_seal(n - 1)
            open_ = q(f"window.__qa.stairs.filter((s) => s.floor === {n} && s.dir === 'up').every((s) => s.open)")
            q(f"() => {{ const Q = window.__qa; const s = Q.stairs.find((x) => x.floor === {n} && x.dir === 'up'); Q.player.x = s.ax; Q.player.y = s.ay; }}")
            W(400)
            lab = q("document.getElementById('interact-label').textContent")
            if n == 1:
                W(600); q(HIDE_UI); shot(page, "53-s3-stair-open.png")
            fl = q(f"window.__qa.takeStair({n}, 'up')")
            W(300)
            info = q("[window.__qa.floor, window.__qa.countess.aggro, window.__qa.countessAway, window.__qa.floorOf(window.__qa.player.x, window.__qa.player.y), window.__qa.renderer.floorDef.n, document.getElementById('stage-card-num').textContent]")
            floor_info[n + 1] = info
            check(f"climb_{n}_to_{n+1}", open_ and lab == "CLIMB" and fl == n + 1 and info[0] == n + 1 and info[3] == n + 1 and info[4] == n + 1, [open_, lab, fl, info])
            q(CALM)
        check("seals_all_five", q("window.__qa.player.pagesFound") == 5)
        aggro = [floor_info[k][1] for k in sorted(floor_info)]
        check("countess_aggro_rises", all(aggro[i] < aggro[i + 1] for i in range(len(aggro) - 1)), aggro)
        check("floor_cards", floor_info[6][5] == "FLOOR VI", floor_info[6])
        # descend and come back
        dn = q("window.__qa.takeStair(6, 'down')")
        back = q("window.__qa.takeStair(5, 'up')")
        check("descend_and_return", dn == 5 and back == 6, [dn, back])
        for n in range(2, 6):
            r = q(f"window.__qa.takeStair({n}, 'down')")
            check(f"descend_{n}_to_{n-1}", r == n - 1, r)
            q(f"window.__qa.goFloor({n})")
        q(CALM)

        # ---------------- the Countess follows you up
        q("window.__qa.goFloor(4)"); q("window.__qa.countessAway = 0.1"); W(600)
        cf = q("[window.__qa.floorOf(window.__qa.countess.x, window.__qa.countess.y), window.__qa.countess.waypoints.every((w) => window.__qa.floorOf(w.x, w.y) === 4)]")
        check("countess_follows_to_floor", cf == [4, True], cf)
        q("window.__qa.countessAway = 999")

        # ---------------- monsters: per-floor mix, spawns on your floor, new behaviours
        mixes = {}
        for n in range(1, 7):
            q(f"window.__qa.goFloor({n})"); q(CALM)
            mixes[n] = sorted(set(q("Array.from({length: 80}, () => window.__qa.pickType())")))
        check("floor_mixes", "prisoner" in mixes[1] and "ironmaiden" in mixes[2] and "wraith" in mixes[4] and "ironmaiden" in mixes[5] and mixes[6] == ["bats"], mixes)
        q("window.__qa.goFloor(2)"); q(CALM)
        q("() => { const Q = window.__qa; Q.place(Q.player, 28, 42); }")
        ids = q("[window.__qa.spawnHere(), window.__qa.spawnHere()]")
        fl = q(f"window.__qa.monsters.filter((m) => {json.dumps(ids)}.includes(m.id)).map((m) => window.__qa.floorOf(m.x, m.y))")
        check("spawn_on_current_floor", len(fl) == 2 and all(f == 2 for f in fl), fl)
        q(CALM); W(100)
        # iron maiden: armored except mid-strike
        q("() => { const Q = window.__qa; Q.place(Q.player, 28, 40); }")
        mid = q("window.__qa.spawn('ironmaiden', 30, 40)"); W(1400)
        dm = q(f"""(() => {{ const m = window.__qa.monsters.find((x) => x.id === {mid}); m.state = 'WANDER'; const h0 = m.hp; m.hit(10, m.x - 20, m.y, 0); const d1 = h0 - m.hp;
                  m.state = 'WINDUP'; const h1 = m.hp; m.hit(10, m.x - 20, m.y, 0); return [d1, h1 - m.hp]; }})()""")
        check("ironmaiden_armor", abs(dm[0] - 6) < 0.01 and abs(dm[1] - 15) < 0.01, dm)
        pid = q("window.__qa.spawn('prisoner', 26, 40)")
        W(1600); q(HIDE_UI)
        shot(page, "54-s3-prisoner-maiden.png")
        rigs = q("window.__qa.renderer.monsterRigs.size")
        check("new_monster_rigs", rigs >= 2, rigs)
        q(CALM)
        # wraith blinks toward you
        q("window.__qa.goFloor(4)"); q(CALM)
        q("() => { const Q = window.__qa; Q.place(Q.player, 45, 10); Q.player.angle = Math.PI / 2; Q.player.lanternOn = true; Q.renderer.snapCam = true; }")
        wid = q("window.__qa.spawn('wraith', 45, 18)"); W(400)
        d0 = q(f"(() => {{ const m = window.__qa.monsters.find((x) => x.id === {wid}); m.state = 'WANDER'; m.timer = 0; m.blinkCd = 0; return Math.hypot(m.x - window.__qa.player.x, m.y - window.__qa.player.y); }})()")
        W(500)
        d1 = q(f"(() => {{ const m = window.__qa.monsters.find((x) => x.id === {wid}); return m ? [Math.hypot(m.x - window.__qa.player.x, m.y - window.__qa.player.y), m.blinkFx > 0 || m.blinkCd > 2] : null; }})()")
        check("wraith_blinks", d1 and d1[0] < d0 - 100 and d1[1], [d0, d1])
        q(HIDE_UI); shot(page, "55-s3-wraith-library.png")
        q(CALM)
        bid = q("window.__qa.spawn('bats', 44, 10)")
        check("bats_spawn_s3", bid is not None)
        q(CALM)

        # ---------------- breakables: wine casks and bookshelves
        bk = q("window.__qa.breakables.map((b, i) => [i, b.type]).filter(([i, t]) => t === 'cask' || t === 'bookshelf')")
        ci = next(i for i, t in bk if t == "cask"); si = next(i for i, t in bk if t == "bookshelf")
        r1 = q(f"[window.__qa.hitCrate({ci}, 1, 'armor'), window.__qa.hitCrate({ci}, 1, 'armor'), window.__qa.breakables[{ci}].broken]")
        r2 = q(f"[window.__qa.hitCrate({si}, 3, 'token'), window.__qa.breakables[{si}].broken]")
        check("cask_breaks_two_hits", r1 == [None, "armor", True], r1)
        check("bookshelf_breaks", r2 == ["token", True], r2)
        q("window.__qa.closeTokenPicker && window.__qa.closeTokenPicker()")
        q("() => { if (window.__qa.mode === 'PICK') window.__qa.pickWeapon(window.__qa.player.weapon); }")

        # ---------------- the Pedlar mid-climb (Servants' Floor)
        q("window.__qa.goFloor(3)"); q(CALM)
        mer = q("[window.__qa.level.merchant.tx, window.__qa.level.merchant.ty, window.__qa.floorOf(window.__qa.level.merchant.x, window.__qa.level.merchant.y)]")
        check("pedlar_on_floor3", mer[2] == 3, mer)
        q(f"() => {{ const Q = window.__qa; Q.place(Q.player, {mer[0] - 1}, {mer[1]}); Q.setCoins(200); }}")
        W(1500); q(HIDE_UI)
        pr = q("[document.getElementById('interact-label').textContent, document.getElementById('prompt-banner').textContent]")
        check("s3_pedlar_prompt", pr[0] == "SHOP" and "Pedlar" in pr[1], pr)
        shot(page, "56-s3-pedlar.png")
        q("window.__qa.interact()"); W(400)
        check("s3_shop_opens", q("window.__qa.mode") == "SHOP")
        q("window.__qa.shopSelect('m-silver')"); fb = q("window.__qa.shopConfirm()")
        check("s3_shop_buy", "Bought" in fb and q("window.__qa.player.coins") == 168, [fb, q("window.__qa.player.coins")])
        q("window.__qa.closeShop()"); W(200)
        check("s3_shop_closes", q("window.__qa.mode") == "PLAYING")

        # ---------------- Hall of Mirrors (Key I): failed, dead-end, solved
        q("window.__qa.goFloor(2)"); q(CALM)
        q("window.__qa.giveKey(1)"); q("() => { const Q = window.__qa; Q.place(Q.player, 28, 44); }")
        check("mirrors_unlock", q("window.__qa.unlock(1)"))
        q("() => { const Q = window.__qa; Q.place(Q.player, 28, 48); }"); W(800)
        rid = q("[window.__qa.mode, document.getElementById('lore-title').textContent, document.getElementById('lore-postscript').textContent]")
        check("mirrors_riddle", rid[0] == "LORE" and rid[1] == "The Hall of Mirrors" and "TURN" in rid[2], rid)
        shot(page, "57-s3-mirrors-riddle.png")
        q("window.__qa.closeLore()"); W(1200); q(HIDE_UI)
        shot(page, "58-s3-mirrors-room.png")
        nm = q("window.__qa.monsters.length")
        s0 = q("window.__qa.player.sanity")
        end = q("window.__qa.openShutter()")
        W(300)
        fail = q("[window.__qa.puzzle.failCount, window.__qa.monsters.filter((m) => m.kind === 'wraith').length, window.__qa.player.sanity, window.__qa.puzzle.items.map((i) => i.rot).join('')]")
        check("mirrors_fail_portrait", end == "portrait" and fail[0] == 1 and fail[1] >= 1 and fail[2] < s0 and fail[3].startswith("//"), [end, fail])
        q(HIDE_UI); shot(page, "59-s3-mirrors-fail.png")
        q("() => { for (const m of window.__qa.monsters) m.remove = true; }")
        # A and B turned only: the light runs out through the south wall
        q("window.__qa.turnMirror('A')"); q("window.__qa.turnMirror('B')")
        end2 = q("window.__qa.openShutter()")
        check("mirrors_dead_end", end2 == "wall" and q("window.__qa.puzzle.failCount") == 1, end2)
        q("window.__qa.turnMirror('C')"); q("window.__qa.turnMirror('D')")
        # a quick look at the turned glasses before the lamp opens
        p_hud = q("document.getElementById('puzzle-info').textContent")
        before = q("[window.__qa.player.mirrors.gilded, window.__qa.player.coins]")
        end3 = q("window.__qa.openShutter()")
        after = q("[window.__qa.player.mirrors.gilded, window.__qa.player.coins, window.__qa.player.sanity, window.__qa.lockedRooms[0].solved, window.__qa.puzzle]")
        check("mirrors_solved_reward", end3 == "sun" and after[0] == before[0] + 1 and after[1] == before[1] + 40 and after[2] == 100 and after[3] and after[4] is None, [end3, before, after])
        check("mirrors_hud", "glasses" in p_hud, p_hud)
        W(900); q(HIDE_UI); shot(page, "60-s3-mirrors-solved.png")

        # ---------------- Clock Library (Key II): wrong hour, solved, and the timed failure
        q("window.__qa.goFloor(3)"); q(CALM)
        q("window.__qa.giveKey(2)"); q("() => { const Q = window.__qa; Q.place(Q.player, 47, 44); }")
        check("clock_unlock", q("window.__qa.unlock(2)"))
        q("() => { const Q = window.__qa; Q.place(Q.player, 47, 48); }"); W(800)
        rid = q("[window.__qa.mode, document.getElementById('lore-title').textContent]")
        check("clock_riddle", rid == ["LORE", "The Lady's Hours"], rid)
        q("window.__qa.closeLore()"); W(2000)
        c0 = q("window.__qa.puzzle.wallInset")
        check("clock_runs", c0 > 0.02, c0)
        q("window.__qa.pullBook('IX')")
        bad = q("window.__qa.pullBook('XIII')")
        c1 = q("[window.__qa.puzzle.wallInset, window.__qa.puzzle.failCount, window.__qa.puzzle.items.filter((i) => i.pressed).length]")
        check("clock_wrong_hour", bad == 0 and c1[0] >= c0 + 8 / 50 - 0.01 and c1[1] == 1 and c1[2] == 0, [bad, c0, c1])
        q("window.__qa.pullBook('IX')"); q("window.__qa.pullBook('XII')")
        W(600); q(HIDE_UI)
        hud = q("document.getElementById('puzzle-info').textContent")
        check("clock_hud", "Hours 2 / 4" in hud and "thirteen" in hud, hud)
        shot(page, "61-s3-clock-room.png")
        before = q("[window.__qa.player.mirrors.obsidian, window.__qa.player.coins]")
        q("window.__qa.pullBook('III')"); q("window.__qa.pullBook('VI')")
        after = q("[window.__qa.player.mirrors.obsidian, window.__qa.player.coins, window.__qa.player.armor, window.__qa.lockedRooms[1].solved]")
        check("clock_solved_reward", after[0] == before[0] + 1 and after[1] == before[1] + 50 and after[2] == 100 and after[3], [before, after])

        # ---------------- Mirrors left to the portrait too long? no — timed failure is the clock:
        q("window.__qa.startStage(5, 30)"); W(600); q(CALM)
        q("window.__qa.goFloor(3)"); q(CALM)
        q("window.__qa.giveKey(2)"); q("() => { const Q = window.__qa; Q.place(Q.player, 47, 44); }"); q("window.__qa.unlock(2)")
        q("() => { const Q = window.__qa; Q.place(Q.player, 47, 48); }"); W(800); q("window.__qa.closeLore()")
        q("window.__qa.clockLevel = 0.995"); W(1200)
        dr = q("[window.__qa.mode, document.getElementById('death-reason').textContent, document.getElementById('death-pages-label').textContent, document.getElementById('death-stage').textContent]")
        check("clock_strikes_thirteen", dr[0] == "DEAD" and "struck thirteen" in dr[1] and dr[2] == "SEALS" and "FLOOR III" in dr[3], dr)
        shot(page, "62-s3-death-clock.png")

        # ---------------- Tower top: the Gargoyle, then the ending
        page.locator("#btn-retry").tap(); W(800); q(CALM)
        check("retry_stays_stage3", q("[window.__qa.stage, window.__qa.floor]") == [5, 1])
        for n in range(1, 6):
            collect_seal(n - 1)
            q(f"window.__qa.takeStair({n}, 'up')"); q(CALM)
        W(300)
        bs = q("[window.__qa.floor, !!window.__qa.boss, window.__qa.boss && window.__qa.boss.kind, !document.getElementById('boss-bar').classList.contains('hidden')]")
        check("boss_spawns_on_roof", bs[0] == 6 and bs[1] and bs[2] == "gargoyle", bs)
        q("() => { const Q = window.__qa; Q.place(Q.player, 9, 14); Q.player.angle = -Math.PI / 2; Q.player.lanternOn = true; Q.player.health = 999; Q.player.maxHealth = 999; Q.boss.x = 9 * 44 + 22; Q.boss.y = 11 * 44 + 22; Q.renderer.snapCam = true; }")
        page.wait_for_function("() => window.__qa.boss && window.__qa.boss.state !== 'RISE'")
        W(500)
        bb = q("!document.getElementById('boss-bar').classList.contains('hidden')")
        check("boss_bar_visible", bb)
        q(HIDE_UI); shot(page, "63-s3-gargoyle.png")
        sw = q("(() => { const b = window.__qa.boss; const r = [b.state, b.swoopCd, b.swooping || 0]; b.swoopCd = 0; return r; })()")
        W(700)
        sw2 = q("(() => { const b = window.__qa.boss; return b ? [b.state, b.swoopCd, b.swooping || 0, b.swoopDir ? 1 : 0] : null; })()")
        check("boss_swoops", sw2 and sw2[3] == 1, [sw, sw2])
        # sealed while the gargoyle lives
        q("() => { const Q = window.__qa; Q.place(Q.player, 9, 1); Q.boss.x = 9 * 44 + 22; Q.boss.y = 16 * 44 + 22; Q.boss.swoopCd = 99; }"); W(500)
        sealed = q("[window.__qa.gateOpen(), document.getElementById('prompt-banner').textContent, window.__qa.player.x / 44, window.__qa.player.y / 44]")
        check("exit_sealed_until_boss_dead", sealed[0] is False and "Gargoyle" in sealed[1], sealed)
        killed = q("window.__qa.kill(window.__qa.boss.id)")
        W(300)
        check("boss_killed_opens_gate", killed and q("window.__qa.bossDead") and q("window.__qa.gateOpen()"))
        W(500); q("window.__qa.interact()"); W(800)
        win = q("[window.__qa.mode, document.querySelector('#screen-win h2').textContent, document.querySelector('.relic-sub').textContent]")
        check("ending_screen", win[0] == "WIN" and "DAWN" in win[1] and "v0.8" in win[2], win)
        shot(page, "64-s3-ending.png")
        page.locator("#btn-win-title").tap(); W(500)
        t = q("[document.getElementById('btn-continue').textContent, document.getElementById('btn-stage-5').classList.contains('hidden')]")
        check("title_continue_stage3", "STAGE V" in t[0] and t[1] is False, t)
        shot(page, "65-title-stage3.png")
        page.locator("#btn-stage-5").tap(); W(400)
        page.locator("#btn-begin").tap(); W(900)
        check("stage3_chip_starts", q("[window.__qa.mode, window.__qa.stage, window.__qa.floor]") == ["PLAYING", 5, 1])
        # pause screen quality button
        page.locator("#btn-pause").tap(); W(300)
        l0 = q("document.querySelector('#btn-quality-pause .q-label').textContent")
        page.locator("#btn-quality-pause").tap(); W(150)
        l1 = q("document.querySelector('#btn-quality-pause .q-label').textContent")
        check("pause_quality_toggle", l0 != l1, [l0, l1])
        page.locator("#btn-help-close").tap(); W(200)
        q("window.__qa.setQuality('auto')")
        check("render_stats", True, q("window.__qa.stats()"))
        browser.close()
except Exception as e:
    errors.append(f"EXCEPTION: {str(e)[:300]}")
finally:
    if srv: srv.terminate()

errs = [e for e in errors if "AudioContext was not allowed" not in e]
fails = {k: v for k, v in results.items() if not v["ok"]}
print(json.dumps(results, indent=1, default=str))
print("ERRORS:", errs)
print(f"PASS {len(results) - len(fails)}/{len(results)}")
sys.exit(1 if fails or errs else 0)
