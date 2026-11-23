import { hasLineOfSight, resolveCircleWallCollision, TILE_SIZE } from "./map.js";

export const AI_STATE = {
  PATROL: "PATROL",
  INVESTIGATE: "INVESTIGATE",
  HUNT: "HUNT",
  SEARCH: "SEARCH",
  STUNNED: "STUNNED"
};

export class CountessAI {
  constructor(spawn, waypoints, witchingHour = false) {
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
    this.witchingHour = witchingHour;
    this.trail = [];
    this.trailTimer = 0;
    this.stuckTimer = 0;
    this.lastPos = { x: spawn.x, y: spawn.y };
  }

  alertAt(x, y) {
    if (this.state === AI_STATE.HUNT || this.state === AI_STATE.STUNNED) return;
    this.state = AI_STATE.INVESTIGATE;
    this.targetX = x;
    this.targetY = y;
    this.stateTimer = 5.5;
  }

  stun(duration = 1.6) {
    this.state = AI_STATE.STUNNED;
    this.stunTimer = duration;
  }

  update(dt, level, player, callbacks = {}) {
    if (this.state === AI_STATE.STUNNED) {
      this.stunTimer -= dt;
      if (this.stunTimer <= 0) {
        this.state = AI_STATE.SEARCH;
        this.stateTimer = 3.2;
      }
      return;
    }

    const dxP = player.x - this.x;
    const dyP = player.y - this.y;
    const distToPlayer = Math.hypot(dxP, dyP);

    // Detection distance depends on lantern & hiding
    let detectDist = player.lanternOn ? 255 : 88;
    if (this.witchingHour) detectDist *= 1.12;
    if (player.hidden) detectDist = 0; // invisible inside iron alcoves unless caught mid-entry

    let canSeePlayer = false;
    if (distToPlayer < detectDist && hasLineOfSight(level, this.x, this.y, player.x, player.y)) {
      const angleToPlayer = Math.atan2(dyP, dxP);
      const diff = Math.abs(Math.atan2(Math.sin(angleToPlayer - this.angle), Math.cos(angleToPlayer - this.angle)));
      // Wide peripheral awareness when player's lantern is bright or very close
      const fovHalf = player.lanternOn ? 1.15 : 0.72;
      if (diff < fovHalf || distToPlayer < (player.lanternOn ? 95 : 44)) {
        canSeePlayer = true;
      }
    }

    if (canSeePlayer) {
      if (this.state !== AI_STATE.HUNT && callbacks.onSpotted) {
        callbacks.onSpotted();
      }
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
        this._pickNearestWaypoint();
      }
    }

    // Determine target & speed
    let speed = this.witchingHour ? 86 : 78;
    if (this.state === AI_STATE.INVESTIGATE) speed = 94;
    if (this.state === AI_STATE.SEARCH) speed = 76;
    if (this.state === AI_STATE.HUNT) speed = this.witchingHour ? 128 : 118;

    if (this.state === AI_STATE.PATROL) {
      const wp = this.waypoints[this.wpIndex];
      this.targetX = wp.x;
      this.targetY = wp.y;
      if (Math.hypot(wp.x - this.x, wp.y - this.y) < 18) {
        this.wpIndex = (this.wpIndex + 1) % this.waypoints.length;
      }
    } else if (this.state === AI_STATE.SEARCH) {
      // Orbit around last seen target
      if (Math.hypot(this.targetX - this.x, this.targetY - this.y) < 18) {
        this.angle += dt * 2.2;
        speed = 0;
      }
    } else if (this.state === AI_STATE.INVESTIGATE) {
      if (Math.hypot(this.targetX - this.x, this.targetY - this.y) < 18) {
        this.angle += dt * 1.8;
        speed = 0;
      }
    }

    // Move with obstacle steering
    if (speed > 0) {
      const desiredAngle = Math.atan2(this.targetY - this.y, this.targetX - this.x);
      let moveAngle = desiredAngle;

      // Simple 3-whisker wall avoidance when chasing or investigating
      const probeDist = TILE_SIZE * 0.72;
      if (!hasLineOfSight(level, this.x, this.y, this.x + Math.cos(desiredAngle) * probeDist, this.y + Math.sin(desiredAngle) * probeDist)) {
        const leftAngle = desiredAngle - 0.85;
        const rightAngle = desiredAngle + 0.85;
        const leftClear = hasLineOfSight(level, this.x, this.y, this.x + Math.cos(leftAngle) * probeDist, this.y + Math.sin(leftAngle) * probeDist);
        const rightClear = hasLineOfSight(level, this.x, this.y, this.x + Math.cos(rightAngle) * probeDist, this.y + Math.sin(rightAngle) * probeDist);
        if (leftClear && !rightClear) moveAngle = leftAngle;
        else if (rightClear && !leftClear) moveAngle = rightAngle;
        else moveAngle = desiredAngle + (this.wpIndex % 2 === 0 ? 1.1 : -1.1);
      }

      const angleDiff = Math.atan2(Math.sin(moveAngle - this.angle), Math.cos(moveAngle - this.angle));
      this.angle += angleDiff * Math.min(1, dt * 8);

      this.x += Math.cos(moveAngle) * speed * dt;
      this.y += Math.sin(moveAngle) * speed * dt;
      resolveCircleWallCollision(level, this, this.radius, false);
    }

    // Unstick fallback if wedged on corner during chase
    const moved = Math.hypot(this.x - this.lastPos.x, this.y - this.lastPos.y);
    if (speed > 0 && moved < 8 * dt) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 1.2) {
        this.stuckTimer = 0;
        this.state = AI_STATE.PATROL;
        this._pickNearestWaypoint();
      }
    } else {
      this.stuckTimer = 0;
    }
    this.lastPos.x = this.x;
    this.lastPos.y = this.y;

    // Crimson veil trail particles
    this.trailTimer += dt;
    if (this.trailTimer > 0.09) {
      this.trailTimer = 0;
      this.trail.push({ x: this.x, y: this.y, life: 0.75 });
      if (this.trail.length > 16) this.trail.shift();
    }
    this.trail.forEach((p) => { p.life -= dt; });
    this.trail = this.trail.filter((p) => p.life > 0);

    // Check catch
    if (!player.hidden && distToPlayer < this.radius + player.radius - 2) {
      if (callbacks.onCaught) callbacks.onCaught();
    }
  }

  _pickNearestWaypoint() {
    let bestIdx = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.waypoints.length; i++) {
      const d = Math.hypot(this.waypoints[i].x - this.x, this.waypoints[i].y - this.y);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    this.wpIndex = (bestIdx + 1) % this.waypoints.length;
  }
}
