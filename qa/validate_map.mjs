import { createLevel } from "/workspace/bathory-game/js/map.js";
import { FLOORS, STAIRS, traceBeam } from "/workspace/bathory-game/js/stage3.js";
let bad = 0;
for (const st of [1, 2, 3, 4, 5]) {
  const L = createLevel(st);
  const g = L.grid; const issues = [];
  const chk = (n, tx, ty, want = [0]) => { if (!want.includes(g[ty][tx])) issues.push(`${n} @${tx},${ty}=${g[ty][tx]}`); };
  const doorTiles = new Set(L.lockedRooms.map((lr) => lr.door.join(",")));
  // Stage III: stairs link floors (arrival tile -> arrival tile of the matching stair on the other floor)
  const links = new Map();
  for (const s of L.stairs) {
    const back = L.stairs.find((o) => o.floor === s.to && o.to === s.floor);
    if (!back) { issues.push(`stair ${s.floor}${s.dir} has no partner`); continue; }
    const k = s.arrive.join(",");
    links.set(k, (links.get(k) || []).concat([back.arrive]));
  }
  // reachability BFS from player (doors counted open: keys exist in every run)
  const sx = Math.floor(L.playerSpawn.x / 44), sy = Math.floor(L.playerSpawn.y / 44);
  const seen = new Set([sx + "," + sy]); const q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift();
    const nbrs = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1], ...(links.get(x + "," + y) || [])];
    for (const [nx, ny] of nbrs) {
      if (ny < 0 || ny >= 58 || nx < 0 || nx >= 58) continue;
      const k = nx + "," + ny; if (seen.has(k)) continue;
      if (g[ny][nx] === 0 || g[ny][nx] === 2 || doorTiles.has(k)) { seen.add(k); q.push([nx, ny]); }
    }
  }
  const reach = (n, tx, ty) => { const ok = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has((tx + dx) + "," + (ty + dy))); if (!ok) issues.push(`unreachable ${n} @${tx},${ty}`); };
  for (const p of L.pages) { chk("page", p.tx, p.ty); reach("page", p.tx, p.ty); }
  for (const p of L.mirrors) { chk("mirror", p.tx, p.ty); reach("mirror", p.tx, p.ty); }
  for (const p of L.bolts) { chk("bolt", p.tx, p.ty); reach("bolt", p.tx, p.ty); }
  for (const p of L.spawns) { chk("spawn", p.tx, p.ty); reach("spawn", p.tx, p.ty); }
  for (const p of L.braziers) chk("brazier", p.tx, p.ty, [0, 3]);
  for (const p of L.alcoves) { chk("alcove", p.tx, p.ty); reach("alcove", p.tx, p.ty); }
  for (const p of L.glass) chk("glass", p.tx, p.ty);
  for (const p of L.breakables) reach("crate", p.tx, p.ty);
  for (const p of L.props) reach("prop " + p.type, p.tx, p.ty);
  for (const s of L.secrets) { reach("secretItem", s.itemTx, s.itemTy); for (const [x, y] of s.tiles) chk("secretTile", x, y, [1]); }
  if (L.merchant) reach("merchant", L.merchant.tx, L.merchant.ty);
  for (const lr of L.lockedRooms) { const [dx, dy] = lr.door; reach("door", dx, dy); for (const it of lr.items) reach(`${lr.key}:${it.sym}`, it.tx, it.ty); }
  reach("exit", L.exitTile.tx, L.exitTile.ty + 1);
  const wp = L.waypoints.map((w) => [Math.floor(w.x / 44), Math.floor(w.y / 44)]); for (const [x, y] of wp) { chk("wp", x, y); reach("wp", x, y); }
  const cs = [Math.floor(L.countessSpawn.x / 44), Math.floor(L.countessSpawn.y / 44)]; chk("countess", ...cs);
  const occ = {}; for (const p of L.props) { const k = p.tx + "," + p.ty; occ[k] = (occ[k] || []).concat(p.type); } for (const b of L.breakables) { const k = b.tx + "," + b.ty; occ[k] = (occ[k] || []).concat(b.type); }
  for (const lr of L.lockedRooms) for (const it of lr.items) { const k = it.tx + "," + it.ty; occ[k] = (occ[k] || []).concat("item:" + it.sym); }
  for (const [k, v] of Object.entries(occ)) if (v.length > 1) issues.push("overlap " + k + " " + v);
  for (const p of [...L.pages, ...L.mirrors, ...L.bolts, ...L.alcoves, ...L.spawns]) { const k = p.tx + "," + p.ty; if (occ[k]) issues.push("item on prop " + k); }
  if (L.bossSpawn) { const bs = [Math.floor(L.bossSpawn.x / 44), Math.floor(L.bossSpawn.y / 44)]; chk("boss", ...bs); reach("boss", ...bs); }
  if (L.kind === "climb") {
    // every stair arrival must be open floor on the right floor; per-floor spawn / waypoint counts
    for (const s of L.stairs) {
      chk(`arrive ${s.floor}${s.dir}`, ...s.arrive); reach(`stair ${s.floor}${s.dir}`, s.tx, s.ty);
      if (L.floorAt(...s.arrive) !== s.floor) issues.push(`arrival of ${s.floor}${s.dir} is on floor ${L.floorAt(...s.arrive)}`);
      if (L.floorAt(s.tx, s.ty) !== s.floor) issues.push(`stair ${s.floor}${s.dir} sits on floor ${L.floorAt(s.tx, s.ty)}`);
    }
    for (const f of FLOORS) {
      const sp = L.spawns.filter((s) => L.floorAt(s.tx, s.ty) === f.n).length;
      const w = wp.filter(([x, y]) => L.floorAt(x, y) === f.n).length;
      const br = L.braziers.filter((b) => L.floorAt(b.tx, b.ty) === f.n).length;
      if (sp < 3 || w < 4 || br < 2) issues.push(`floor ${f.n}: spawns ${sp} waypoints ${w} braziers ${br}`);
    }
    L.pages.forEach((p, i) => { if (L.floorAt(p.tx, p.ty) !== i + 1) issues.push(`seal ${i + 1} on floor ${L.floorAt(p.tx, p.ty)}`); });
    // Hall of Mirrors: start state must fail, the documented solution must light the sun
    const lr = L.lockedRooms.find((r) => r.key === "mirrors");
    const t0 = traceBeam(lr);
    if (t0.end === "sun") issues.push("mirrors start already solved");
    for (const it of lr.items) if (lr.solution[it.sym]) it.rot = lr.solution[it.sym];
    const t1 = traceBeam(lr);
    if (t1.end !== "sun") issues.push("mirror solution does not reach the sun: " + t1.end);
    // the beam must never cross a prop / item other than the mirrors
    for (const [x, y] of t1.cells.slice(1, -1)) { const k = x + "," + y; if (occ[k] && !String(occ[k]).startsWith("item:")) issues.push("beam crosses prop " + k); }
    console.log("  mirrors: start ->", t0.end, "| solution ->", t1.end, "| beam", t1.cells.length, "cells");
  }
  if (issues.length) bad++;
  console.log("stage", st, "reach", seen.size, issues.length ? issues : "OK");
}
process.exit(bad ? 1 : 0);
