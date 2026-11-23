import { hasLineOfSight, resolveCircleWallCollision } from "./map.js";

export const MONSTER_TYPES = {
  ghoul: { key: "ghoul", name: "Servant Ghoul", hp: 46, speed: 40, chaseSpeed: 66, dmg: 12, reach: 22, windup: 0.5, cooldown: 1.3, sight: 300, radius: 13, knockResist: 1 },
  maiden: { key: "maiden", name: "Blood Maiden", hp: 28, speed: 60, chaseSpeed: 132, dmg: 9, reach: 18, windup: 0.28, cooldown: 0.95, sight: 340, radius: 11, knockResist: 0.8 },
  bats: { key: "bats", name: "Bat Swarm", hp: 20, speed: 70, chaseSpeed: 108, dmg: 5, reach: 20, windup: 0.18, cooldown: 0.75, sight: 380, radius: 13, knockResist: 1.4, drainsOil: true },
  dweller: { key: "dweller", name: "Well Dweller", hp: 80, speed: 22, chaseSpeed: 38, dmg: 16, reach: 24, windup: 0.7, cooldown: 1.6, sight: 280, radius: 13, knockResist: 1.35, aura: 200 },
  // Crate slimes (v0.5): bouncy, split once into two minis on death.
  slime: { key: "slime", name: "Crate Slime", hp: 25, speed: 46, chaseSpeed: 92, dmg: 7, reach: 18, windup: 0.32, cooldown: 1.0, sight: 300, radius: 12, knockResist: 0.9, hops: true },
  slimelet: { key: "slimelet", name: "Mini Slime", hp: 9, speed: 60, chaseSpeed: 118, dmg: 4, reach: 14, windup: 0.22, cooldown: 0.8, sight: 300, radius: 8, knockResist: 0.6, hops: true }
};


let nextId = 1;

export class Monster {
  constructor(typeKey, x, y) {
    this.id = nextId++;
    this.type = MONSTER_TYPES[typeKey];
    this.kind = typeKey;
    this.x = x;
    this.y = y;
    this.radius = this.type.radius;
    this.hp = this.type.hp;
    this.maxHp = this.type.hp;
    this.angle = Math.random() * Math.PI * 2;
    this.state = "RISE"; // RISE -> WANDER/CHASE -> WINDUP -> ... -> DEAD
    this.timer = 0.9; // rise-from-mist time
    this.hurt = 0;
    this.flash = 0;
    this.burn = 0;
    this.repelled = 0;
    this.vx = 0;
    this.vy = 0;
    this.cooldown = 0;
    this.lastSeen = null;
    this.lostTimer = 0;
    this.wanderTimer = 0;
    this.dead = false;
    this.deadTime = 0;
    this.remove = false;
  }

  hit(dmg, fromX, fromY, knock = 60, burnSecs = 0) {
    if (this.dead || this.state === "RISE") return false;
    this.hp -= dmg;
    this.flash = 0.14;
    this.hurt = 0.28;
    const a = Math.atan2(this.y - fromY, this.x - fromX);
    const k = knock / this.type.knockResist;
    this.vx += Math.cos(a) * k * 3.2;
    this.vy += Math.sin(a) * k * 3.2;
    if (burnSecs > 0) this.burn = Math.max(this.burn, burnSecs);
    if (this.state === "WINDUP") { this.state = "CHASE"; this.cooldown = 0.5; }
    if (this.hp <= 0) this._die();
    return true;
  }

  repel(fromX, fromY, secs) {
    if (this.dead) return;
    this.repelled = secs;
    const a = Math.atan2(this.y - fromY, this.x - fromX);
    this.vx += Math.cos(a) * 900;
    this.vy += Math.sin(a) * 900;
    this.hit(18, fromX, fromY, 0);
  }

  _die() {
    this.dead = true;
    this.state = "DEAD";
    this.deadTime = 0;
  }

  update(dt, level, player, pathing, cb) {
    if (this.flash > 0) this.flash -= dt;
    if (this.dead) {
      this.deadTime += dt;
      if (this.deadTime > 1.1) this.remove = true;
      return;
    }
    if (this.state === "RISE") {
      this.timer -= dt;
      if (this.timer <= 0) this.state = "WANDER";
      return;
    }

    // knockback slide
    if (this.vx || this.vy) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      const damp = Math.exp(-dt * 9);
      this.vx *= damp;
      this.vy *= damp;
      if (Math.hypot(this.vx, this.vy) < 4) { this.vx = 0; this.vy = 0; }
      resolveCircleWallCollision(level, this, this.radius, false);
    }

    if (this.burn > 0) {
      this.burn -= dt;
      this.hp -= 5 * dt;
      if (this.hp <= 0) { this._die(); cb.onKilled && cb.onKilled(this); return; }
    }
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.hurt > 0) { this.hurt -= dt; return; }
    if (this.repelled > 0) { this.repelled -= dt; return; }

    if (this.kind === "dweller") {
      this.lurch = (this.lurch || 0) - dt;
      if (this.lurch <= 0) {
        this.lurch = 0.18 + Math.random() * 0.85;
        this.lurchPause = Math.random() < 0.5 ? 0.18 + Math.random() * 0.45 : 0;
      }
      if (this.lurchPause > 0) { this.lurchPause -= dt; return; }
    }

    const T = this.type;
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);
    const sight = T.sight * (player.lanternOn ? 1 : 0.55);
    const sees = !player.hidden && dist < sight && hasLineOfSight(level, this.x, this.y, player.x, player.y);

    if (sees) {
      if (this.state === "WANDER" && cb.onSpot) cb.onSpot(this);
      this.lastSeen = { x: player.x, y: player.y };
      this.lostTimer = 4;
      if (this.state === "WANDER") this.state = "CHASE";
    } else if (this.state === "CHASE") {
      this.lostTimer -= dt;
      if (this.lostTimer <= 0 || player.hidden) { this.state = "WANDER"; this.lastSeen = null; }
    }

    if (this.state === "WINDUP") {
      this.timer -= dt;
      this.angle = Math.atan2(dy, dx);
      if (this.timer <= 0) {
        this.state = "CHASE";
        this.cooldown = T.cooldown;
        if (!player.hidden && dist < T.reach + this.radius + player.radius + 10) cb.onHitPlayer(this);
      }
      return;
    }

    let speed = 0;
    let dir = null;
    if (this.state === "CHASE") {
      const goal = sees ? player : this.lastSeen;
      if (goal) {
        if (sees && dist < T.reach + this.radius + player.radius) {
          if (this.cooldown <= 0) { this.state = "WINDUP"; this.timer = T.windup; }
          return;
        }
        dir = pathing.steer(this.x, this.y, goal.x, goal.y);
        speed = T.chaseSpeed;
        if (this.kind === "bats") {
          const wob = Math.sin(performance.now() / 180 + this.id) * 0.6;
          const c = Math.cos(wob), s = Math.sin(wob);
          dir = { x: dir.x * c - dir.y * s, y: dir.x * s + dir.y * c };
        }
      }
    } else {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 1.5 + Math.random() * 2.5;
        this.angle = Math.random() * Math.PI * 2;
        this.idle = Math.random() < 0.35;
      }
      if (!this.idle) {
        dir = { x: Math.cos(this.angle), y: Math.sin(this.angle) };
        speed = T.speed;
      }
    }
    if (T.hops && speed) {
      // Slimes move in springy hops: fast mid-air, stuck to the floor between bounces.
      this.hop = ((this.hop || Math.random()) + dt * (this.state === "CHASE" ? 2.1 : 1.4)) % 1;
      speed *= this.hop < 0.55 ? 1.75 : 0.08;
    }
    if (dir && speed) {
      const ox = this.x, oy = this.y;
      this.x += dir.x * speed * dt;
      this.y += dir.y * speed * dt;
      resolveCircleWallCollision(level, this, this.radius, false);
      const target = Math.atan2(dir.y, dir.x);
      if (this.state === "CHASE") {
        const d = Math.atan2(Math.sin(target - this.angle), Math.cos(target - this.angle));
        this.angle += d * Math.min(1, dt * 10);
      } else if (Math.hypot(this.x - ox, this.y - oy) < speed * dt * 0.3) {
        this.wanderTimer = 0; // bumped a wall, pick a new heading
      }
    }
  }
}
