"""Playwright QA for v0.8 Stage II: The Courtyard — save migration, ?qa&stage=2 hook, new monsters, Gate Warden mini-boss,
Heraldry Armory & Portcullis Winch puzzles, secrets, well, transition to Stage III (Csejte Castle), and 5-stage title chips.
Usage: /workspace/.venv-pw/bin/python qa/qa_courtyard.py [base_url] [--noshots]
"""
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright

ROOT = "/workspace/bathory-game"
args = [a for a in sys.argv[1:] if not a.startswith("--")]
SHOTS = "--noshots" not in sys.argv
base = args[0] if args else None
srv = None
if not base:
    srv = subprocess.Popen(["python3", "-m", "http.server", "8774", "--bind", "127.0.0.1"], cwd=ROOT,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    base = "http://127.0.0.1:8774/"

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
        q = lambda js: page.evaluate(js)
        W = page.wait_for_timeout

        # ---------------- Save migration tests (v0.6 / v0.7 -> v0.8)
        page.goto(base + "?qa", wait_until="networkidle"); W(1200)
        q("""() => {
            localStorage.removeItem('csejte_ver');
            localStorage.removeItem('csejte_unlocked');
            localStorage.setItem('csejte_stage2', 'true');
            localStorage.setItem('csejte_stage3', 'false');
        }""")
        page.reload(wait_until="networkidle"); W(1400)
        mig2 = q("[window.__qa.maxUnlocked, JSON.parse(localStorage.getItem('csejte_ver'))]")
        check("migrate_v6_stage2_to_4", mig2 == [4, 8], mig2)

        q("""() => {
            localStorage.removeItem('csejte_ver');
            localStorage.removeItem('csejte_unlocked');
            localStorage.setItem('csejte_stage2', 'true');
            localStorage.setItem('csejte_stage3', 'true');
        }""")
        page.reload(wait_until="networkidle"); W(1400)
        mig3 = q("[window.__qa.maxUnlocked, document.querySelectorAll('#title-stages .stage-chip:not(.hidden)').length]")
        check("migrate_v7_stage3_to_5", mig3 == [5, 5], mig3)
        shot(page, "78-title-5stages.png")

        # ---------------- ?qa&stage=2 direct boot
        q("window.__qa.resetProgress()")
        page.goto(base + "?qa&stage=2", wait_until="networkidle"); W(1500)
        q(CALM)
        st = q("[window.__qa.mode, window.__qa.stage, window.__qa.level.kind, document.getElementById('hud-pages-label').textContent]")
        check("qa_stage2_url_hook", st == ["PLAYING", 2, "courtyard", "ORDERS"], st)
        card = q("[document.getElementById('stage-card-num').textContent, document.getElementById('stage-card-title').textContent]")
        check("courtyard_title_card", card == ["STAGE II", "THE COURTYARD"], card)

        # ---------------- Level content, Orders, Well, Secrets
        lv = q("""(() => { const L = window.__qa.level; return {
            pages: L.pages.length, brk: L.breakables.length,
            types: [...new Set(L.breakables.map(b => b.type))].sort(),
            secrets: L.secrets.length, locked: L.lockedRooms.map(r => r.kind),
            merchant: !!L.merchant, bossKind: L.bossKind
        }; })()""")
        check("courtyard_level_content", lv["pages"] == 5 and lv["brk"] >= 20 and lv["types"] == ["barrel", "crate"]
              and lv["secrets"] == 2 and lv["locked"] == ["heraldry", "winch"]
              and lv["merchant"] and lv["bossKind"] == "warden", lv)

        # Bailey scenic shot with hounds & sentry
        q("() => { const Q = window.__qa; Q.place(Q.player, 28, 39); Q.player.angle = -Math.PI/2; Q.spawn('sentry', 27, 36); Q.spawn('hound', 30, 36); }")
        W(1400); q(HIDE_UI)
        shot(page, "74-courtyard-bailey.png")

        # Garrison Order pickup
        q(CALM)
        q("() => { const Q = window.__qa; const pg = Q.level.pages[0]; Q.place(Q.player, pg.tx, pg.ty); Q.player.y += 10; }")
        W(500)
        pr = q("[document.getElementById('interact-label').textContent, document.getElementById('prompt-banner').textContent]")
        q("window.__qa.interact()"); W(400)
        seal = q("[document.querySelector('#screen-lore .lore-seal').textContent, window.__qa.player.pagesFound]")
        check("order_collect", pr[0] == "TAKE" and seal == ["GARRISON ORDER SEIZED", 1], [pr, seal])
        q("window.__qa.closeLore()")

        # Well + secret
        q("window.__qa.giveCoins(15)")
        roll = q("window.__qa.tossWell('speed')")
        check("courtyard_well", roll == "speed" and q("window.__qa.player.speedBoost") > 10, roll)
        ok_s = q("window.__qa.openSecret('stable-post')")
        check("courtyard_secret_opens", ok_s and q("window.__qa.level.grid[21][17]") == 0)

        # ---------------- Monsters: hound, sentry, crows + oil drain
        q(CALM)
        q("() => { const Q = window.__qa; Q.place(Q.player, 28, 28); Q.player.oil = 80; Q.player.invuln = 0; Q.player.lanternOn = true; }")
        ids = q("[window.__qa.spawn('hound', 27, 27), window.__qa.spawn('sentry', 30, 27), window.__qa.spawn('crows', 28, 27)]")
        W(1800)
        kinds = q("window.__qa.monsters.filter(m => !m.dead && m !== window.__qa.boss).map(m => m.kind).sort()")
        lan_after = q("window.__qa.player.oil")
        check("courtyard_monsters_spawn", kinds == ["crows", "hound", "sentry"], kinds)
        check("crows_drain_oil", lan_after < 80, lan_after)
        check("sentry_killable", q(f"window.__qa.kill({ids[1]})") is True)

        # ---------------- Locked Room I: Heraldry Armory (heraldry)
        q(CALM)
        q("() => { const Q = window.__qa; Q.giveKey(1); Q.place(Q.player, 13, 45); }"); W(300)
        check("heraldry_unlock", q("window.__qa.unlock(1)"))
        q("() => { const Q = window.__qa; Q.place(Q.player, 13, 50); Q.player.angle = Math.PI/2; }"); W(400)
        hr = q("[window.__qa.puzzle && window.__qa.puzzle.kind, document.getElementById('lore-title').textContent]")
        check("heraldry_seals_riddle", hr == ["heraldry", "The Bailey Oath"], hr)
        q("window.__qa.closeLore()"); W(600); q(HIDE_UI)
        shot(page, "75-courtyard-heraldry.png")
        n0 = q("window.__qa.monsters.length")
        q("window.__qa.puzzleAct('rose')")  # wrong: sword is first
        W(300)
        fail_hr = q("[window.__qa.puzzle.progress, window.__qa.monsters.length - %d]" % n0)
        check("heraldry_fail_wakes_sentry", fail_hr == [0, 1], fail_hr)
        q(CALM)
        coins0 = q("window.__qa.player.coins")
        g0 = q("window.__qa.player.mirrors.gilded")
        for sym in ["sword", "key", "rose", "crown"]:
            q(f"window.__qa.puzzleAct('{sym}')")
        W(400)
        sol1 = q("[window.__qa.lockedRooms[0].solved, window.__qa.level.grid[46][13], window.__qa.player.mirrors.gilded - %d, window.__qa.player.coins - %d, window.__qa.player.sanity]" % (g0, coins0))
        check("heraldry_solved_reward", sol1 == [True, 0, 1, 30, 100], sol1)

        # ---------------- Locked Room II: Portcullis Winch (winch)
        q(CALM)
        q("() => { const Q = window.__qa; Q.giveKey(2); Q.place(Q.player, 42, 45); }"); W(300)
        check("winch_unlock", q("window.__qa.unlock(2)"))
        q("() => { const Q = window.__qa; Q.place(Q.player, 42, 50); Q.player.angle = Math.PI/2; }"); W(400)
        wr = q("[window.__qa.puzzle && window.__qa.puzzle.kind, document.getElementById('lore-title').textContent]")
        check("winch_seals_riddle", wr == ["winch", "The Gatekeeper's Chain"], wr)
        q("window.__qa.closeLore()"); W(600); q(HIDE_UI)
        ins0 = q("window.__qa.puzzle.wallInset")
        q("window.__qa.puzzleAct('gold')")  # wrong: iron is first
        ins1 = q("window.__qa.puzzle.wallInset")
        check("winch_fail_drops", ins1 >= ins0 + 0.13 and q("window.__qa.puzzle.progress") == 0, [ins0, ins1])
        q("window.__qa.puzzleAct('iron')"); q("window.__qa.puzzleAct('brass')")
        W(400); q(HIDE_UI)
        shot(page, "76-courtyard-winch.png")
        o0 = q("window.__qa.player.mirrors.obsidian")
        coins1 = q("window.__qa.player.coins")
        q("window.__qa.puzzleAct('silver')"); q("window.__qa.puzzleAct('gold')")
        W(400)
        sol2 = q("[window.__qa.lockedRooms[1].solved, window.__qa.level.grid[46][42], window.__qa.player.mirrors.obsidian - %d, window.__qa.player.coins - %d, window.__qa.player.armor]" % (o0, coins1))
        check("winch_solved_reward", sol2 == [True, 0, 1, 40, 100], sol2)

        # Winch fail death test
        q("window.__qa.newRun(2)"); W(600); q(CALM)
        q("() => { const Q = window.__qa; Q.giveKey(2); Q.place(Q.player, 42, 45); }"); W(200)
        q("window.__qa.unlock(2)"); W(300)
        q("() => { const Q = window.__qa; Q.place(Q.player, 42, 50); }"); W(300)
        q("window.__qa.closeLore()")
        q("() => { window.__qa.puzzle.wallInset = 0.945; }"); W(600)
        dead = q("[window.__qa.mode, document.getElementById('death-reason').textContent]")
        check("winch_crushes_on_timeout", dead[0] == "DEAD" and "portcullis" in dead[1], dead)
        page.locator("#btn-retry").tap(); W(600)

        # ---------------- Mini-Boss: The Gate Warden & Exit Gate
        q(CALM)
        q("() => { const Q = window.__qa; Q.player.pagesFound = 5; Q.place(Q.player, 39, 11); Q.player.angle = -Math.PI/2; }")
        W(800); q(HIDE_UI)
        binfo = q("[!!window.__qa.boss, window.__qa.boss && window.__qa.boss.kind, !document.getElementById('boss-bar').classList.contains('hidden'), document.getElementById('boss-name').textContent, window.__qa.gateOpen()]")
        check("warden_boss_present", binfo == [True, "warden", True, "THE GATE WARDEN", False], binfo)
        shot(page, "77-courtyard-warden.png")
        q("() => { const Q = window.__qa; Q.kill(Q.boss.id); }"); W(400)
        check("warden_kill_opens_gate", q("[window.__qa.bossDead, window.__qa.gateOpen()]") == [True, True])

        # ---------------- Stage II -> Stage III (Csejte Castle) carry-over
        q("() => { const Q = window.__qa; Q.setCoins(175); Q.player.armor = 60; }")
        m = q("window.__qa.clearStage()"); W(700)
        st_clr = q("[window.__qa.mode, document.getElementById('stage-title').textContent, document.getElementById('stage-tag').textContent, window.__qa.maxUnlocked]")
        check("courtyard_clear_to_castle", st_clr == ["STAGECLEAR", "CSEJTE CASTLE", "STAGE II CLEARED", 3], st_clr)
        page.locator("#btn-stage-enter").tap(); W(1200)
        s3 = q("[window.__qa.mode, window.__qa.stage, window.__qa.level.kind, window.__qa.player.coins, window.__qa.player.armor]")
        check("enter_castle_carry", s3 == ["PLAYING", 3, "castle", 175, 60], s3)

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
