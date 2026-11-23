"""Playwright QA for v0.6: Hooded Pedlar shop (both locations), permanent upgrades, purse rule,
stage transition, Stage II Graveyards loop, new monsters, grave hands, both new puzzle rooms (solved + failed).
Usage: /workspace/.venv-pw/bin/python qa/qa_stage2.py [base_url] [--noshots]
"""
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright

ROOT = "/workspace/bathory-game"
args = [a for a in sys.argv[1:] if not a.startswith("--")]
SHOTS = "--noshots" not in sys.argv
base = args[0] if args else None
srv = None
if not base:
    srv = subprocess.Popen(["python3", "-m", "http.server", "8769", "--bind", "127.0.0.1"], cwd=ROOT,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    base = "http://127.0.0.1:8769/"

errors, results = [], {}
def shot(page, name):
    if SHOTS:
        page.screenshot(path=f"{ROOT}/screens/{name}")
def check(name, cond, info=None):
    results[name] = {"ok": bool(cond), "info": info}

HIDE_UI = "() => { for (const id of ['toast','area-title','stage-card']) document.getElementById(id).classList.add('hidden'); }"
CALM = """() => { const Q = window.__qa; Q.spawnTimer = 999; Q.wellTimer = 999; Q.countess.state = 'PATROL';
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

        q("window.__qa.resetProgress()")
        check("title_no_continue_initially", q("document.getElementById('title-stages').classList.contains('hidden')"))

        # ---------------- Stage I: the pedlar's stall in the Outer Ward
        page.locator("#btn-start").tap(); W(500)
        page.locator('.weapon-option[data-weapon="crossbow"]').tap(); W(300)
        page.locator("#btn-begin").tap(); W(700)
        q(CALM); q("() => { const Q = window.__qa; Q.place(Q.countess, 28, 5); }")
        check("stage1_has_merchant", q("!!window.__qa.level.merchant && window.__qa.level.stage === 1"))
        q("() => { const Q = window.__qa; Q.place(Q.player, 53, 39); Q.player.angle = 0; Q.setCoins(200); }")
        W(1800); q(HIDE_UI)
        pr = q("[document.getElementById('interact-label').textContent, document.getElementById('prompt-banner').textContent]")
        check("merchant_prompt", pr[0] == "SHOP" and "Hooded Pedlar" in pr[1], pr)
        shot(page, "27-pedlar-stall.png")
        q("window.__qa.interact()"); W(400)
        check("shop_opens_field", q("window.__qa.mode") == "SHOP" and not q("document.getElementById('screen-shop').classList.contains('hidden')"))
        n_items = q("document.querySelectorAll('#shop-items .shop-item').length")
        check("field_shop_all_items", n_items == 10, n_items)
        # game is paused while shopping
        t0 = q("window.__qa.elapsed"); W(600); t1 = q("window.__qa.elapsed")
        check("shop_pauses_game", abs(t1 - t0) < 0.001, [t0, t1])
        # confirm flow: silver mirror
        sel = q("window.__qa.shopSelect('m-silver')")
        conf = q("[!document.getElementById('shop-confirm').classList.contains('hidden'), document.getElementById('shop-confirm-text').textContent]")
        check("shop_confirm_shown", sel == "m-silver" and conf[0] and "32" in conf[1], conf)
        shot(page, "28-shop-confirm.png")
        fb = q("window.__qa.shopConfirm()")
        st = q("[window.__qa.player.coins, window.__qa.player.mirrors.silver]")
        check("shop_buy_mirror", st == [168, 1] and "Bought" in fb, [st, fb])
        # bolts (crossbow) + potion after damage
        q("() => { const Q = window.__qa; Q.player.ammo = 2; }")
        q("window.__qa.shopSelect('bolts')"); q("window.__qa.shopConfirm()")
        check("shop_buy_bolts", q("window.__qa.player.ammo") == 10, q("window.__qa.player.ammo"))
        blocked = q("(() => { window.__qa.shopSelect('potion'); return window.__qa.shopFeedback; })()")
        check("shop_potion_blocked_when_full", "health full" in blocked, blocked)
        q("() => { const Q = window.__qa; Q.player.health = 40; }")
        q("window.__qa.closeShop()"); q("window.__qa.openShop('field')")
        q("window.__qa.shopSelect('potion')"); q("window.__qa.shopConfirm()")
        check("shop_buy_potion", q("window.__qa.player.health") == 90, q("window.__qa.player.health"))
        # permanent upgrade
        q("window.__qa.shopSelect('up-heart')"); fb = q("window.__qa.shopConfirm()")
        up = q("[window.__qa.upgrades.heart, window.__qa.player.maxHealth, JSON.parse(localStorage.getItem('csejte_upgrades')).heart]")
        check("upgrade_heart_bought", up == [1, 115, 1] and "permanent" in fb, [up, fb])
        q("window.__qa.shopSelect('up-edge')"); q("window.__qa.shopConfirm()")
        # not enough coins
        q("window.__qa.setCoins(5)"); q("window.__qa.closeShop()"); q("window.__qa.openShop('field')")
        sel = q("window.__qa.shopSelect('m-gilded')")
        deny = q("[window.__qa.shopFeedback, document.querySelector('[data-key=\"m-gilded\"]').classList.contains('shake'), document.getElementById('shop-confirm').classList.contains('hidden')]")
        check("shop_not_enough_coins", sel is None and "Not enough coins" in deny[0] and deny[1] and deny[2], deny)
        W(150)
        shot(page, "29-shop-not-enough.png")
        page.locator("#btn-shop-close").tap(); W(300)
        check("shop_closes_to_play", q("window.__qa.mode") == "PLAYING")

        # upgrades persist across reload
        page.reload(wait_until="networkidle"); W(1500)
        check("upgrades_persist_reload", q("[window.__qa.upgrades.heart, window.__qa.upgrades.edge]") == [1, 1], q("window.__qa.upgrades"))
        page.locator("#btn-start").tap(); W(400)
        page.locator("#btn-begin").tap(); W(600)
        q(CALM)
        check("upgrade_applied_new_run", q("[window.__qa.player.maxHealth, window.__qa.player.health]") == [115, 115])

        # ---------------- Stage transition
        q("() => { const Q = window.__qa; Q.setCoins(120); Q.player.armor = 20; Q.giveMirror('gilded', 1); }")
        wpn = q("window.__qa.player.weapon")
        m = q("window.__qa.clearStage()")
        W(1400)
        check("stage_clear_screen", m == "STAGECLEAR" and not q("document.getElementById('screen-stage').classList.contains('hidden')"))
        check("stage2_unlocked_saved", q("[window.__qa.stage2Unlocked, localStorage.getItem('csejte_stage2'), window.__qa.purse]") == [True, "true", 120])
        shot(page, "30-stage-transition.png")
        page.locator("#btn-stage-shop").tap(); W(500)
        n_items = q("document.querySelectorAll('#shop-items .shop-item').length")
        check("between_shop_opens", q("window.__qa.mode") == "SHOP" and n_items == 7, n_items)
        q("window.__qa.shopSelect('plate')"); q("window.__qa.shopConfirm()")
        q("window.__qa.shopSelect('m-cracked')"); q("window.__qa.shopConfirm()")
        check("between_shop_buys", q("[window.__qa.player.armor, window.__qa.player.coins, window.__qa.purse]") == [55, 90, 90])
        shot(page, "31-shop-between-stages.png")
        page.locator("#btn-shop-close").tap(); W(400)
        check("between_shop_back_to_stage", q("window.__qa.mode") == "STAGECLEAR" and not q("document.getElementById('screen-stage').classList.contains('hidden')"))
        page.locator("#btn-stage-enter").tap(); W(1200)
        q("() => { for (const id of ['toast','area-title']) document.getElementById(id).classList.add('hidden'); }")
        s2 = q("[window.__qa.stage, window.__qa.level.stage, window.__qa.player.coins, window.__qa.player.armor, window.__qa.player.mirrors.gilded, window.__qa.player.mirrors.cracked, window.__qa.player.weapon]")
        check("stage2_carry_over", s2 == [2, 2, 90, 55, 1, 1, wpn], [s2, wpn])
        check("stage2_card", q("document.getElementById('stage-card-title').textContent") == "THE GRAVEYARDS" and not q("document.getElementById('stage-card').classList.contains('hidden')"))
        q(CALM); q("() => { const Q = window.__qa; Q.place(Q.countess, 47, 7); }")
        W(600)
        shot(page, "32-stage2-title-card.png")
        hudl = q("document.getElementById('hud-pages-label').textContent")
        check("hud_rubbings_label", hudl == "RUBBINGS", hudl)

        # ---------------- Graveyard exploration
        q(HIDE_UI)
        q("() => { const Q = window.__qa; Q.place(Q.player, 28, 31); Q.player.angle = -Math.PI/2; }")
        W(2600); q(HIDE_UI)
        shot(page, "33-graveyard-explore.png")
        lv = q("""(() => { const L = window.__qa.level; return { pages: L.pages.length, brk: L.breakables.length, types: [...new Set(L.breakables.map(b => b.type))].sort(),
               graves: L.graves.length, fountain: !!L.well.fountain, secrets: L.secrets.length, locked: L.lockedRooms.map(r => r.kind) }; })()""")
        check("stage2_level_content", lv["pages"] == 5 and lv["brk"] >= 20 and lv["types"] == ["coffin", "urn"] and lv["graves"] >= 8 and lv["fountain"] and lv["secrets"] == 2 and lv["locked"] == ["crypt", "flood"], lv)
        # rubbing pickup
        q("() => { const Q = window.__qa; const p = Q.level.pages[4]; Q.place(Q.player, p.tx, p.ty); Q.player.y += 12; }")
        W(900)
        pr = q("[document.getElementById('interact-label').textContent, document.getElementById('prompt-banner').textContent]")
        q("window.__qa.interact()"); W(400)
        seal = q("[document.querySelector('#screen-lore .lore-seal').textContent, document.getElementById('lore-page-num').textContent, window.__qa.player.pagesFound]")
        check("rubbing_collect", pr[0] == "RUB" and seal[0] == "CHARCOAL RUBBING TAKEN" and seal[1] == "GRAVE RUBBING V" and seal[2] == 1, [pr, seal])
        q("window.__qa.closeLore()")
        # coffin + urn breakables
        ci = q("window.__qa.breakables.findIndex(b => b.type === 'coffin')")
        ui = q("window.__qa.breakables.findIndex(b => b.type === 'urn')")
        r1 = q(f"window.__qa.hitCrate({ci}, 1, 'armor')"); r2 = q(f"window.__qa.breakCrate({ui}, 'haste')")
        check("coffin_urn_break", q(f"[window.__qa.breakables[{ci}].hp, window.__qa.breakables[{ui}].broken]") == [2, True] and r2 == "haste", [r1, r2])
        # cursed fountain
        q("window.__qa.giveCoins(10)")
        q("() => { const Q = window.__qa; Q.place(Q.player, Q.well.tx, Q.well.ty + 1); }"); W(500)
        fpr = q("document.getElementById('prompt-banner').textContent")
        roll = q("window.__qa.tossWell('speed')")
        check("fountain_offering", "black fountain" in fpr and roll == "speed" and q("window.__qa.player.speedBoost") > 10, fpr)
        # secret passage
        ok = q("window.__qa.openSecret('angel-mausoleum')")
        check("secret_angel_opens", ok and q("window.__qa.level.grid[19][18]") == 0)

        # ---------------- New monsters
        q(CALM)
        q("() => { const Q = window.__qa; Q.place(Q.player, 28, 22); Q.player.angle = -Math.PI/2; Q.player.speedBoost = 0; }")
        ids = q("[window.__qa.spawn('skeleton', 27, 19), window.__qa.spawn('brute', 30, 20), window.__qa.spawn('banshee', 26, 21)]")
        W(2600); q(HIDE_UI)
        kinds = q("window.__qa.monsters.filter(m => !m.dead).map(m => m.kind).sort()")
        check("new_monsters_spawn", kinds == ["banshee", "brute", "skeleton"], kinds)
        shot(page, "34-new-monsters.png")
        # banshee wail
        q("() => { const Q = window.__qa; Q.player.sanity = 100; Q.player.hidden = false; const b = Q.monsters.find(m => m.kind === 'banshee'); b.wailCd = 0; b.x = Q.player.x - 90; b.y = Q.player.y; b.state = 'CHASE'; }")
        W(700)
        w = q("[window.__qa.player.sanity, window.__qa.player.slowT, window.__qa.monsters.find(m => m.kind === 'banshee').wailing]")
        check("banshee_wail_drains_slows", w[0] < 96 and w[1] > 0, w)
        q(HIDE_UI)
        shot(page, "35-banshee-wail.png")
        # brute hits harder than a skeleton
        check("brute_stats", q("[window.__qa.monsters.find(m=>m.kind==='brute').maxHp, window.__qa.monsters.find(m=>m.kind==='brute').type.dmg]") == [95, 22])
        # kill a skeleton with attacks (Whetstone damage bonus active)
        q("() => { const Q = window.__qa; for (const m of Q.monsters) if (m.kind !== 'skeleton') m.remove = true; const s = Q.monsters.find(m => m.kind === 'skeleton'); s.x = Q.player.x + 24; s.y = Q.player.y; s.state = 'WANDER'; s.timer = 0; }")
        k0 = q("window.__qa.kills")
        for _ in range(8):
            q("window.__qa.attack()"); W(120)
            if q("window.__qa.kills") > k0: break
        check("skeleton_killable", q("window.__qa.kills") > k0, q("window.__qa.kills"))
        # grave hands
        q(CALM)
        q("() => { const Q = window.__qa; const g = Q.graves[0]; g.cd = 0; Q.player.armor = 0; Q.player.invuln = 0; Q.player.health = 100; Q.player.slowT = 0; Q.place(Q.player, g.tx, g.ty + 1); Q.player.angle = -Math.PI/2; }")
        W(500)
        gh = q("[window.__qa.player.health, window.__qa.graves[0].grab, window.__qa.player.slowT, window.__qa.graves[0].cd]")
        check("grave_hands_grab", gh[0] <= 94 and gh[1] > 0.4 and gh[3] > 2, gh)
        q(HIDE_UI)
        shot(page, "36-grave-hands.png")

        # ---------------- Crypt of Names (Key I)
        q(CALM); q("() => { const Q = window.__qa; Q.player.health = 115; Q.place(Q.player, 10, 44); Q.player.angle = Math.PI/2; }")
        W(1200)
        pr = q("document.getElementById('prompt-banner').textContent")
        check("crypt_door_locked", "Crypt of Names" in pr and "Requires Key I" in pr, pr)
        q("window.__qa.giveKey(1)")
        check("crypt_unlock", q("window.__qa.unlock(1)"))
        q("() => { const Q = window.__qa; Q.place(Q.player, 10, 48); }")
        W(900)
        pz = q("[window.__qa.puzzle && window.__qa.puzzle.kind, window.__qa.mode, document.getElementById('lore-title').textContent]")
        check("crypt_seals_riddle", pz == ["crypt", "LORE", "The Crypt of Names"], pz)
        q(HIDE_UI)
        shot(page, "37-crypt-riddle.png")
        q("window.__qa.closeLore()")
        q("() => { const Q = window.__qa; Q.place(Q.player, 10, 50); Q.player.angle = Math.PI/2; }")
        W(1500); q(HIDE_UI)
        shot(page, "38-crypt-room.png")
        p1 = q("window.__qa.puzzleAct('MDLXXV')"); p2 = q("window.__qa.puzzleAct('MDXC')")
        bad = q("window.__qa.puzzleAct('MDCX')")  # wrong: MDCIV (1604) comes before MDCX (1610)
        st = q("[window.__qa.puzzle.progress, window.__qa.puzzle.failCount, window.__qa.puzzle.items.filter(i => i.lit).length, window.__qa.monsters.filter(m => !m.dead && m.kind === 'skeleton').length]")
        check("crypt_fail_resets_and_wakes", [p1, p2, bad] == [1, 2, 0] and st[0] == 0 and st[1] == 1 and st[2] == 0 and st[3] >= 1, [p1, p2, bad, st])
        W(900); q(HIDE_UI)
        shot(page, "39-crypt-fail.png")
        q("() => { for (const m of window.__qa.monsters) m.remove = true; }")
        before = q("[window.__qa.player.mirrors.gilded, window.__qa.player.coins]")
        for sym in ["MDLXXV", "MDXC", "MDCIV", "MDCX"]:
            q(f"window.__qa.puzzleAct('{sym}')")
        W(300)
        q(HIDE_UI); shot(page, "40-crypt-nearly.png")
        q("window.__qa.puzzleAct('MDCXIV')")
        after = q("[window.__qa.player.mirrors.gilded, window.__qa.player.coins, window.__qa.player.sanity]")
        lr = q("[window.__qa.lockedRooms[0].solved, window.__qa.puzzle, window.__qa.level.grid[46][10]]")
        check("crypt_solved_reward", lr == [True, None, 0] and after[0] == before[0] + 1 and after[1] == before[1] + 35 and after[2] == 100, [before, after, lr])

        # ---------------- Drowned Mausoleum (Key II)
        q(CALM); q("() => { const Q = window.__qa; Q.place(Q.player, 47, 44); }"); W(300)
        q("window.__qa.giveKey(2)")
        check("flood_unlock", q("window.__qa.unlock(2)"))
        q("() => { const Q = window.__qa; Q.place(Q.player, 47, 48); }")
        W(900)
        pz = q("[window.__qa.puzzle && window.__qa.puzzle.kind, document.getElementById('lore-title').textContent]")
        check("flood_seals_riddle", pz == ["flood", "The Drowned Bells"], pz)
        q(HIDE_UI); shot(page, "41-flood-riddle.png")
        q("window.__qa.closeLore()")
        q("() => { const Q = window.__qa; Q.place(Q.player, 47, 51); Q.player.angle = Math.PI/2; }")
        W(2500)
        lvl0 = q("window.__qa.puzzle.wallInset")
        check("flood_water_rises", lvl0 > 0.01, lvl0)
        bad = q("window.__qa.puzzleAct('bone')")
        lvl1 = q("window.__qa.puzzle.wallInset")
        check("flood_wrong_bell_surges", bad == 0 and lvl1 >= lvl0 + 0.1 and q("window.__qa.puzzle.failCount") == 1, [lvl0, lvl1])
        q("window.__qa.waterLevel = 0.4")
        q("window.__qa.puzzleAct('silver')"); q("window.__qa.puzzleAct('bronze')")
        W(700); q(HIDE_UI)
        shot(page, "42-flood-room.png")
        hud = q("document.getElementById('puzzle-info').textContent")
        check("flood_hud", "Bells 2 / 4" in hud and "water at" in hud, hud)
        before = q("[window.__qa.player.mirrors.obsidian, window.__qa.player.coins]")
        q("window.__qa.puzzleAct('iron')"); q("window.__qa.puzzleAct('bone')")
        after = q("[window.__qa.player.mirrors.obsidian, window.__qa.player.coins, window.__qa.player.armor]")
        check("flood_solved_reward", q("window.__qa.lockedRooms[1].solved") and after[0] == before[0] + 1 and after[1] == before[1] + 45 and after[2] == 100, [before, after])
        W(1500)
        check("flood_drains", q("window.__qa.lockedRooms[1].wallInset") < 0.4, q("window.__qa.lockedRooms[1].wallInset"))

        # ---------------- Flood failure: drowning + purse rule on death
        q("window.__qa.startStage(2, 40)"); W(500); q(CALM)
        q("window.__qa.setCoins(60)")
        q("window.__qa.giveKey(2)"); q("() => { const Q = window.__qa; Q.place(Q.player, 47, 44); }"); q("window.__qa.unlock(2)")
        q("() => { const Q = window.__qa; Q.place(Q.player, 47, 48); }"); W(800); q("window.__qa.closeLore()")
        q("window.__qa.waterLevel = 0.935"); W(2200)
        dr = q("[window.__qa.mode, document.getElementById('death-reason').textContent, document.getElementById('death-coins').textContent, window.__qa.purse]")
        check("flood_drowns", dr[0] == "DEAD" and "Drowned Mausoleum" in dr[1], dr)
        check("purse_rule_on_death", dr[2] == "50" and dr[3] == 50, dr)  # carried 40, picked up 20 -> keep 40 + 10
        shot(page, "43-drowned.png")

        # ---------------- Stage II win + title continue
        page.locator("#btn-retry").tap(); W(700); q(CALM)
        check("retry_stays_stage2", q("window.__qa.level.stage") == 2)
        m = q("window.__qa.clearStage()"); W(600)
        check("stage2_win", m == "WIN" and "v0.6" in q("document.querySelector('.relic-sub').textContent"))
        page.locator("#btn-win-title").tap(); W(500)
        check("title_continue_visible", not q("document.getElementById('title-stages').classList.contains('hidden')"))
        shot(page, "44-title-continue.png")
        page.locator("#btn-continue").tap(); W(400)
        page.locator("#btn-begin").tap(); W(800)
        check("continue_starts_stage2", q("[window.__qa.mode, window.__qa.level.stage]") == ["PLAYING", 2])
        q("window.__qa.newRun()"); W(500)
        check("stage1_still_works", q("window.__qa.level.stage") == 1 and q("window.__qa.level.breakables[0].type") in ("barrel", "crate"))
        check("render_stats", True, q("window.__qa.stats()"))
        browser.close()
finally:
    if srv: srv.terminate()

errs = [e for e in errors if "AudioContext was not allowed" not in e]
fails = {k: v for k, v in results.items() if not v["ok"]}
print(json.dumps(results, indent=1, default=str))
print("ERRORS:", errs)
print(f"PASS {len(results) - len(fails)}/{len(results)}")
sys.exit(1 if fails or errs else 0)
