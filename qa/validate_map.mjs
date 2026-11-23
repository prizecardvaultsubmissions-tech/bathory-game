import { createLevel } from "/workspace/bathory-game/js/map.js";
for (const st of [1,2]) {
  const L = createLevel(st);
  const g = L.grid; const issues=[];
  const chk=(n,tx,ty,want=[0])=>{ if(!want.includes(g[ty][tx])) issues.push(`${n} @${tx},${ty}=${g[ty][tx]}`); };
  // reachability BFS from player
  const sx=Math.floor(L.playerSpawn.x/44), sy=Math.floor(L.playerSpawn.y/44);
  const seen=new Set([sx+","+sy]); const q=[[sx,sy]];
  while(q.length){const [x,y]=q.shift(); for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy; if(ny<0||ny>=58||nx<0||nx>=58)continue; const k=nx+","+ny; if(seen.has(k))continue; if(g[ny][nx]===0||g[ny][nx]===2){seen.add(k);q.push([nx,ny]);}}}
  const reach=(n,tx,ty)=>{ const ok=[[0,0],[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>seen.has((tx+dx)+","+(ty+dy))); if(!ok) issues.push(`unreachable ${n} @${tx},${ty}`); };
  for (const p of L.pages) { chk("page",p.tx,p.ty); reach("page",p.tx,p.ty); }
  for (const p of L.mirrors) { chk("mirror",p.tx,p.ty); reach("mirror",p.tx,p.ty);}
  for (const p of L.bolts) { chk("bolt",p.tx,p.ty); reach("bolt",p.tx,p.ty);}
  for (const p of L.spawns) { chk("spawn",p.tx,p.ty); reach("spawn",p.tx,p.ty);}
  for (const p of L.braziers) chk("brazier",p.tx,p.ty,[0,3]);
  for (const p of L.alcoves) chk("alcove",p.tx,p.ty);
  for (const p of L.glass) chk("glass",p.tx,p.ty);
  for (const p of L.breakables) reach("crate",p.tx,p.ty);
  for (const p of L.props) reach("prop "+p.type,p.tx,p.ty);
  for (const s of L.secrets) { reach("secretItem",s.itemTx,s.itemTy); for(const [x,y] of s.tiles) chk("secretTile",x,y,[1]); }
  if (L.merchant) reach("merchant",L.merchant.tx,L.merchant.ty);
  for (const lr of L.lockedRooms){ const [dx,dy]=lr.door; reach("door",dx,dy); }
  reach("exit",L.exitTile.tx,L.exitTile.ty+1);
  const wp=L.waypoints.map(w=>[Math.floor(w.x/44),Math.floor(w.y/44)]); for(const [x,y] of wp){chk("wp",x,y); reach("wp",x,y);}
  const cs=[Math.floor(L.countessSpawn.x/44),Math.floor(L.countessSpawn.y/44)]; chk("countess",...cs);
  // duplicates of cell-3 objects
  const occ={}; for(const p of L.props){const k=p.tx+","+p.ty; occ[k]=(occ[k]||[]).concat(p.type);} for(const b of L.breakables){const k=b.tx+","+b.ty; occ[k]=(occ[k]||[]).concat(b.type);}
  for(const [k,v] of Object.entries(occ)) if(v.length>1) issues.push("overlap "+k+" "+v);
  for (const p of [...L.pages,...L.mirrors,...L.bolts]) { const k=p.tx+","+p.ty; if(occ[k]) issues.push("item on prop "+k); }
  console.log("stage",st,"reach",seen.size, issues.length?issues:"OK");
}
