import { hasLineOfSight, resolveCircleWallCollision, TILE_SIZE } from "./map.js";

export const AI_STATE = {
  PATROL: "PATROL",
  INVESTIGATE: "INVESTIGATE",
  HUNT: "HUNT",
  SEARCH: "SEARCH",
  STUNNED: "STUNNED",
  FROZEN: "FROZEN"
};

// The Blood Countess. Invulnerable: weapons only stagger her, mirrors freeze her.
export class CountessAI {
  constructor(spawn, waypoints, witchingHour = false, pathing = null) {
    this.x = spawn.x;
    this.y = spawn.y;
    this.radius = 13;
    this.angle = Math.PI / 2;
    this.state = AI_STATE.PATROL;
    this.waypoints = waypoints;
    this.wpIndex = 0;
    this.targetX = waypoints[0].x;
    this.targetY = waypoints[0].y;
    this.stateTimer = 0;
    this.stunTimer = 0;
    this.freezeTimer = 0;
    this.freezeTotal = 0;
    this.witchingHour = witchingHour;
    this.pathing = pathing;
    this.farTimer = 0;
    this.stuckTimer = 0;
    this.lastPos = { x: spawn.x, y: spawn.y };
    this.aggro = 1; // v0.7: Stage III floors make her faster and sharper-eyed the higher you climb
  }

  alertAt(x, y) {
    if ([AI_STATE.HUNT, AI_STATE.STUNNED, AI_STATE.FROZEN].includes(this.state)) return;
    this.state = AI_STATE.INVESTIGATE;
    this.targetX = x;
    this.targetY = y;
    this.stateTimer = 7;
  }

  stun(duration = 1.6) {
    if (this.state === AI_STATE.FROZEN) return;
    this.state = AI_STATE.STUNNED;
    this.stunTimer = duration;
  }

  // Weapon hits: a brief recoil, never damage.
  stagger(duration) {
    if (this.state === AI_STATE.FROZEN || this.state === AI_STATE.STUNNED) return;
    this.state = AI_STATE.STUNNED;
    this.stunTimer = duration;
  }

  freeze(seconds) {
    this.state = AI_STATE.FROZEN;
    this.freezeTimer = seconds;
    this.freezeTotal = seconds;
  }

  get frozen() {
    return this.state === AI_STATE.FROZEN;
  }

  update(dt, level, player, callbacks = {}) {
    if (this.state === AI_STATE.FROZEN) {
      this.freezeTimer -= dt;
      if (this.freezeTimer <= 0) {
        this.freezeTimer = 0;
        this.state = AI_STATE.SEARCH;
        this.targetX = this.x;
        this.targetY = this.y;
        this.stateTimer = 2.5;
        if (callbacks.onThaw) callbacks.onThaw();
      }
      return;
    }
    if (this.state === AI_STATE.STUNNED) {
      this.stunTimer -= dt;
      if (this.stunTimer <= 0) {
        this.state = AI_STATE.SEARCH;
        this.targetX = player.x;
        this.targetY = player.y;
        this.stateTimer = 3.2;
      }
      return;
    }

    const dxP = player.x - this.x;
    const dyP = player.y - this.y;
    const distToPlayer = Math.hypot(dxP, dyP);

    let detectDist = player.lanternOn ? 255 : 88;
    if (this.witchingHour) detectDist *= 1.12;
    detectDist *= Math.min(1.3, this.aggro);
    if (player.hidden) detectDist = 0;

    let canSeePlayer = false;
    if (distToPlayer < detectDist && hasLineOfSight(level, this.x, this.y, player.x, player.y)) {
      const angleToPlayer = Math.atan2(dyP, dxP);
      const diff = Math.abs(Math.atan2(Math.sin(angleToPlayer - this.angle), Math.cos(angleToPlayer - this.angle)));
      const fovHalf = player.lanternOn ? 1.15 : 0.72;
      if (diff < fovHalf || distToPlayer < (player.lanternOn ? 95 : 44)) canSeePlayer = true;
    }

    if (canSeePlayer) {
      if (this.state !== AI_STATE.HUNT && callbacks.onSpotted) callbacks.onSpotted();
      this.state = AI_STATE.HUNT;
      this.targetX = player.x;
      this.targetY = player.y;
      this.stateTimer = 2.6;
    } else if (this.state === AI_STATE.HUNT) {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this.state = AI_STATE.SEARCH;
        this.stateTimer = 4.2;
      }
    } else if (this.state === AI_STATE.INVESTIGATE || this.state === AI_STATE.SEARCH) {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this.state = AI_STATE.PATROL;
        this._pickWaypoint(player);
      }
    }

    // In a big castle she drifts toward you: if far away for a while she re-manifests nearby, out of sight.
    if (this.state === AI_STATE.PATROL && distToPlayer > TILE_SIZE * 22) {
      this.farTimer += dt;
      if (this.farTimer > 22 / this.aggro) {
        this.farTimer = 0;
        this._manifestNear(level, player, callbacks);
      }
    } else {
      this.farTimer = 0;
    }

    let speed = this.witchingHour ? 86 : 78;
    if (this.state === AI_STATE.INVESTIGATE) speed = 94;
    if (this.state === AI_STATE.SEARCH) speed = 76;
    if (this.state === AI_STATE.HUNT) speed = this.witchingHour ? 128 : 118;
    speed *= this.aggro;

    if (this.state === AI_STATE.PATROL) {
      const wp = this.waypoints[this.wpIndex];
      this.targetX = wp.x;
      this.targetY = wp.y;
      if (Math.hypot(wp.x - this.x, wp.y - this.y) < 22) this._pickWaypoint(player);
    } else if (this.state === AI_STATE.SEARCH || this.state === AI_STATE.INVESTIGATE) {
      if (Math.hypot(this.targetX - this.x, this.targetY - this.y) < 20) {
        this.angle += dt * 2.0;
        speed = 0;
      }
    }

    if (speed > 0) {
      const dir = this.pathing
        ? this.pathing.steer(this.x, this.y, this.targetX, this.targetY)
        : (() => { const a = Math.atan2(this.targetY - this.y, this.targetX - this.x); return { x: Math.cos(a), y: Math.sin(a) }; })();
      const moveAngle = Math.atan2(dir.y, dir.x);
      const angleDiff = Math.atan2(Math.sin(moveAngle - this.angle), Math.cos(moveAngle - this.angle));
      this.angle += angleDiff * Math.min(1, dt * 8);
      this.x += dir.x * speed * dt;
      this.y += dir.y * speed * dt;
      resolveCircleWallCollision(level, this, this.radius, false);
    }

    const moved = Math.hypot(this.x - this.lastPos.x, this.y - this.lastPos.y);
    if (speed > 0 && moved < 8 * dt) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 1.5) {
        this.stuckTimer = 0;
        this.state = AI_STATE.PATROL;
        this._pickWaypoint(player);
      }
    } else {
      this.stuckTimer = 0;
    }
    this.lastPos.x = this.x;
    this.lastPos.y = this.y;

    if (!player.hidden && distToPlayer < this.radius + player.radius - 2) {
      if (callbacks.onCaught) callbacks.onCaught();
    }
  }

  setWaypoints(wps) {
    if (!wps || !wps.length) return;
    this.waypoints = wps;
    this.wpIndex = 0;
  }

  // Put her down at a waypoint far from the player (used when she follows you up a stair).
  arriveFar(player) {
    const sorted = [...this.waypoints].sort((a, b) => Math.hypot(b.x - player.x, b.y - player.y) - Math.hypot(a.x - player.x, a.y - player.y));
    const w = sorted[0];
    this.x = w.x; this.y = w.y;
    this.lastPos = { x: w.x, y: w.y };
    this.state = AI_STATE.PATROL;
    this.wpIndex = this.waypoints.indexOf(w);
    this.farTimer = 0;
    this.stuckTimer = 0;
  }

  _pickWaypoint(player) {
    // Half the time she heads for the waypoint nearest to you.
    if (Math.random() < 0.5) {
      let best = 0;
      let bestD = Infinity;
      this.waypoints.forEach((w, i) => {
        const d = Math.hypot(w.x - player.x, w.y - player.y);
        if (d < bestD && i !== this.wpIndex) { bestD = d; best = i; }
      });
      this.wpIndex = best;
    } else {
      this.wpIndex = (this.wpIndex + 1 + Math.floor(Math.random() * 3)) % this.waypoints.length;
    }
  }

  _manifestNear(level, player, callbacks) {
    const options = this.waypoints.filter((w) => {
      const d = Math.hypot(w.x - player.x, w.y - player.y);
      return d > TILE_SIZE * 9 && d < TILE_SIZE * 18 && !hasLineOfSight(level, w.x, w.y, player.x, player.y);
    });
    if (!options.length) return;
    const w = options[Math.floor(Math.random() * options.length)];
    this.x = w.x;
    this.y = w.y;
    this.lastPos = { x: w.x, y: w.y };
    if (callbacks.onManifest) callbacks.onManifest();
  }
}
