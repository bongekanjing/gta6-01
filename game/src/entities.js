// Solara Bay — the things that move: the player, cars, pedestrians, police,
// bullets, and the traffic AI that drives the city's cars around the road grid.
import { CAR_TYPES, TUNE, WORLD_W, WORLD_H, ROAD_XS, ROAD_YS } from './config.js';
import { clamp, dist, angleTo, angleDiff, makeRng } from './random.js';
import { collideBuildings, onRoad, randomRoadPoint, randomSidewalkPoint } from './world.js';

// ---------- Cars ----------
export class Car {
  constructor(typeKey, x, y, angle, color) {
    const t = CAR_TYPES[typeKey];
    this.type = typeKey; this.def = t;
    this.x = x; this.y = y; this.angle = angle;
    this.speed = 0; this.health = 100;
    this.color = color || t.colors[0];
    this.driver = null; // 'player' | 'traffic' | 'police' | null (parked)
    this.target = null; // traffic: next intersection {x,y}
    this.from = null; // traffic: intersection we came from
    this.smoking = false;
    this.id = Car.nextId++;
  }
}
Car.nextId = 1;

export function carCorners(c) {
  const l = c.def.len / 2, w = c.def.wid / 2;
  const cos = Math.cos(c.angle), sin = Math.sin(c.angle);
  return [
    { x: c.x + cos * l - sin * w, y: c.y + sin * l + cos * w },
    { x: c.x + cos * l + sin * w, y: c.y + sin * l - cos * w },
    { x: c.x - cos * l - sin * w, y: c.y - sin * l + cos * w },
    { x: c.x - cos * l + sin * w, y: c.y - sin * l - cos * w },
  ];
}

// Traffic car: drive axis-aligned along the road grid, right-hand lane, and
// pick a new direction at intersections. Cars stay on the asphalt.
function trafficDrive(car, dt, city, rng) {
  const t = car.def;
  if (car.axis === undefined) {
    let bx = ROAD_XS[0], bd = 1e12;
    for (const rx of ROAD_XS) { const d = Math.abs(car.x - rx); if (d < bd) { bd = d; bx = rx; } }
    let by = ROAD_YS[0]; bd = 1e12;
    for (const ry of ROAD_YS) { const d = Math.abs(car.y - ry); if (d < bd) { bd = d; by = ry; } }
    if (Math.abs(car.x - bx) <= Math.abs(car.y - by)) { car.axis = 'y'; car.road = bx; }
    else { car.axis = 'x'; car.road = by; }
    car.dir = car.axis === 'x' ? (Math.cos(car.angle) >= 0 ? 1 : -1) : (Math.sin(car.angle) >= 0 ? 1 : -1);
    car.lastTurnAt = null;
  }
  car.speed = Math.min(car.speed + t.accel * 0.5 * dt, t.top * 0.55);
  // At an intersection, decide once whether to turn.
  const perp = car.axis === 'x' ? ROAD_XS : ROAD_YS;
  const along = car.axis === 'x' ? car.x : car.y;
  let nearest = null, nd = 1e12;
  for (const v of perp) { const d = Math.abs(along - v); if (d < nd) { nd = d; nearest = v; } }
  if (nd < 16 && car.lastTurnAt !== nearest) {
    car.lastTurnAt = nearest;
    if (rng.chance(0.4)) {
      // Turn onto the crossing road, either direction.
      car.axis = car.axis === 'x' ? 'y' : 'x';
      car.road = nearest;
      car.dir = rng.chance(0.5) ? 1 : -1;
    }
  } else if (nd > 60) car.lastTurnAt = null;
  // Steer toward the axis direction, sliding into the right-hand lane.
  const wantAngle = car.axis === 'x' ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  car.angle += clamp(angleDiff(car.angle, wantAngle), -3.6 * dt, 3.6 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  // Ease onto the lane: right-hand side of the road.
  const lane = car.axis === 'x' ? car.road + (car.dir > 0 ? 16 : -16) : car.road + (car.dir > 0 ? -16 : 16);
  if (car.axis === 'x') car.y += clamp(lane - car.y, -60 * dt, 60 * dt);
  else car.x += clamp(lane - car.x, -60 * dt, 60 * dt);
  const pos = { x: car.x, y: car.y };
  if (collideBuildings(city, pos, 20)) { car.speed *= 0.4; car.axis = undefined; }
  car.x = pos.x; car.y = pos.y;
}

// Manhattan driving: axis-aligned steps toward a target point (police far mode).
// The car moves along one axis at a time, so it stays on the road grid instead
// of cutting diagonally across blocks.
function manhattanDrive(car, dt, tx, ty, top) {
  const dx = tx - car.x, dy = ty - car.y;
  let want = car.angle, moveX = 0, moveY = 0, speed = top;
  if (Math.abs(dx) > 26 && Math.abs(dx) >= Math.abs(dy)) { want = dx > 0 ? 0 : Math.PI; moveX = dx > 0 ? 1 : -1; }
  else if (Math.abs(dy) > 26) { want = dy > 0 ? Math.PI / 2 : -Math.PI / 2; moveY = dy > 0 ? 1 : -1; }
  else speed = 0;
  const turn = Math.abs(angleDiff(car.angle, want));
  const capped = turn > 0.6 ? Math.min(speed, 140) : speed;
  car.angle += clamp(angleDiff(car.angle, want), -3.4 * dt, 3.4 * dt);
  car.speed += clamp(capped - car.speed, -420 * dt, 280 * dt);
  if (moveX) car.x += moveX * car.speed * dt;
  else if (moveY) car.y += moveY * car.speed * dt;
  else { car.x += Math.cos(car.angle) * car.speed * dt; car.y += Math.sin(car.angle) * car.speed * dt; }
}

// Police car: follow the roads toward the player's area, then tailgate close in.
function policeDrive(car, dt, player, city) {
  const t = car.def;
  const d = dist(car.x, car.y, player.x, player.y);
  if (d > 320) {
    const node = city.nearestNode(player.x, player.y);
    manhattanDrive(car, dt, node.x, node.y, t.top * 0.95);
  } else {
    const want = angleTo(car.x, car.y, player.x, player.y);
    car.angle += clamp(angleDiff(car.angle, want), -3.4 * dt, 3.4 * dt);
    // Tailgate instead of pinning: full speed far, ease off when touching.
    const target = d > 110 ? t.top * 0.95 : d > 60 ? t.top * 0.5 : t.top * 0.25;
    car.speed += clamp(target - car.speed, -t.accel * dt, t.accel * 0.6 * dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
  }
  const pos = { x: car.x, y: car.y };
  if (collideBuildings(city, pos, 20)) car.speed *= 0.5;
  car.x = pos.x; car.y = pos.y;
}

export function updateCar(car, dt, game) {
  const { city, rng, player } = game;
  if (car.driver === 'traffic') trafficDrive(car, dt, city, rng);
  else if (car.driver === 'police') policeDrive(car, dt, player, city);
  else if (car.driver === 'player') {
    // Player driving: handled by Player.drive so input stays in one place.
  } else {
    car.speed *= Math.max(0, 1 - 3 * dt); // parked: stay put
  }
  if (car.health < 40 && !car.smoking) car.smoking = true;
  if (car.health <= 0 && !car.dead) {
    car.dead = true;
    game.explode(car.x, car.y);
    if (car.driver === 'player') game.ejectPlayer();
  }
}

// ---------- Pedestrians ----------
export class Ped {
  constructor(x, y, rng) {
    this.x = x; this.y = y;
    this.angle = rng.range(0, Math.PI * 2);
    this.speed = rng.range(28, 52);
    this.state = 'walk'; // walk | flee | down
    this.downTimer = 0;
    this.target = { x, y };
    this.color = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'][Math.floor(rng.next() * 6)];
    this.skin = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'][Math.floor(rng.next() * 5)];
    this.fleeX = 0; this.fleeY = 0;
  }
}

export function updatePed(ped, dt, game) {
  if (ped.state === 'down') {
    ped.downTimer -= dt;
    if (ped.downTimer <= 0) { ped.state = 'walk'; ped.target = randomSidewalkPoint(game.rng, ped.x, ped.y, 300); }
    return;
  }
  const speed = ped.state === 'flee' ? 150 : ped.speed;
  let tx = ped.target.x, ty = ped.target.y;
  if (ped.state === 'flee') { tx = ped.fleeX; ty = ped.fleeY; }
  const d = dist(ped.x, ped.y, tx, ty);
  if (d < 14) {
    if (ped.state === 'flee') { ped.state = 'walk'; ped.target = randomSidewalkPoint(game.rng, ped.x, ped.y, 300); }
    else ped.target = randomSidewalkPoint(game.rng, ped.x, ped.y, 300);
    return;
  }
  // Walk axis-aligned (Manhattan) so pedestrians stay on sidewalks and roads
  // instead of cutting diagonally through blocks.
  const dx = tx - ped.x, dy = ty - ped.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    ped.angle += clamp(angleDiff(ped.angle, dx > 0 ? 0 : Math.PI), -5 * dt, 5 * dt);
    ped.x += Math.sign(dx) * speed * dt;
  } else {
    ped.angle += clamp(angleDiff(ped.angle, dy > 0 ? Math.PI / 2 : -Math.PI / 2), -5 * dt, 5 * dt);
    ped.y += Math.sign(dy) * speed * dt;
  }
  const pos = { x: ped.x, y: ped.y };
  collideBuildings(game.city, pos, 10);
  ped.x = pos.x; ped.y = pos.y;
  ped.x = clamp(ped.x, 30, WORLD_W - 30);
  ped.y = clamp(ped.y, 30, WORLD_H - 30);
}

export function scarePeds(game, x, y, radius) {
  for (const p of game.peds) {
    if (p.state !== 'down' && dist(p.x, p.y, x, y) < radius) {
      p.state = 'flee';
      const a = angleTo(x, y, p.x, p.y);
      p.fleeX = p.x + Math.cos(a) * 320;
      p.fleeY = p.y + Math.sin(a) * 320;
    }
  }
}

// ---------- Foot police ----------
export class Cop {
  constructor(x, y) {
    this.x = x; this.y = y; this.angle = 0;
    this.health = 80; this.bustTimer = 0; this.hitCounted = false;
  }
}

export function updateCop(cop, dt, game) {
  const p = game.player;
  const d = dist(cop.x, cop.y, p.x, p.y);
  if (p.car) {
    // Player in a car: foot cops stand down, run to the roadside.
    return;
  }
  const want = angleTo(cop.x, cop.y, p.x, p.y);
  cop.angle += clamp(angleDiff(cop.angle, want), -6 * dt, 6 * dt);
  if (d > 30) {
    cop.x += Math.cos(cop.angle) * TUNE.copFootSpeed * dt;
    cop.y += Math.sin(cop.angle) * TUNE.copFootSpeed * dt;
    cop.bustTimer = Math.max(0, cop.bustTimer - dt * 0.5);
  } else {
    cop.bustTimer += dt;
    if (cop.bustTimer >= TUNE.bustTime) game.busted();
  }
  const pos = { x: cop.x, y: cop.y };
  collideBuildings(game.city, pos, 12);
  cop.x = pos.x; cop.y = pos.y;
}

// ---------- Bullets ----------
export function spawnBullet(game, x, y, angle, from) {
  game.bullets.push({ x, y, vx: Math.cos(angle) * 900, vy: Math.sin(angle) * 900, life: 0.7, from });
}

export function updateBullets(game, dt) {
  for (const b of game.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    // Hit a building?
    let dead = b.life <= 0;
    for (const bd of game.city.buildings) {
      if (b.x > bd.x && b.x < bd.x + bd.w && b.y > bd.y && b.y < bd.y + bd.h) { dead = true; game.sparks(b.x, b.y, 4); break; }
    }
    if (dead) continue;
    // Hit a thug / cop / ped?
    const targets = [...game.thugs, ...game.cops];
    for (const t of targets) {
      if (t.dead || t.state === 'down') continue;
      if (dist(b.x, b.y, t.x, t.y) < 16) {
        dead = true;
        t.health -= TUNE.pistolDamage;
        game.sparks(b.x, b.y, 6);
        if (t.health <= 0) {
          t.dead = true;
          if (game.thugs.includes(t)) game.onThugDown(t);
          else game.addWanted(2, 'cop down');
          game.audio.gunshot();
        }
        break;
      }
    }
    if (dead) continue;
    // Hit a car?
    for (const c of game.cars) {
      if (c.dead) continue;
      if (Math.abs(b.x - c.x) < c.def.len / 2 && Math.abs(b.y - c.y) < c.def.wid / 2) {
        dead = true; c.health -= 12; game.sparks(b.x, b.y, 5);
        if (c.driver === 'police') game.addWanted(1, 'shot at police');
        break;
      }
    }
    b.dead = dead;
  }
  game.bullets = game.bullets.filter((b) => !b.dead);
}

// ---------- Player ----------
export class Player {
  constructor(x, y) {
    this.x = x; this.y = y; this.angle = -Math.PI / 2;
    this.health = TUNE.playerHealth;
    this.money = TUNE.moneyStart;
    this.wanted = 0;
    this.ammo = 0;
    this.weapon = 'fists'; // fists | pistol
    this.car = null;
    this.punchTimer = 0; this.punchCooldown = 0;
    this.shootCooldown = 0;
    this.hurtTimer = 0; this.regenTimer = 0;
    this.lastCrimeAt = -999;
  }

  hurt(amount, game) {
    if (this.hurtTimer > 0) return;
    this.health -= amount;
    this.hurtTimer = 0.5;
    this.regenTimer = 0;
    game.audio.punch();
    if (this.health <= 0) { this.health = 0; game.wasted(); }
  }

  updateOnFoot(dt, game) {
    const inp = game.input;
    let mx = 0, my = 0;
    if (inp.down('w', 'W', 'ArrowUp')) my -= 1;
    if (inp.down('s', 'S', 'ArrowDown')) my += 1;
    if (inp.down('a', 'A', 'ArrowLeft')) mx -= 1;
    if (inp.down('d', 'D', 'ArrowRight')) mx += 1;
    const run = inp.down('Shift');
    const speed = run ? TUNE.playerRun : TUNE.playerWalk;
    if (mx || my) {
      const len = Math.hypot(mx, my);
      this.angle = Math.atan2(my / len, mx / len);
      this.x += (mx / len) * speed * dt;
      this.y += (my / len) * speed * dt;
      this.moving = true;
    } else this.moving = false;
    const pos = { x: this.x, y: this.y };
    collideBuildings(game.city, pos, TUNE.playerRadius);
    this.x = pos.x; this.y = pos.y;
    this.x = clamp(this.x, 24, WORLD_W - 24);
    this.y = clamp(this.y, 24, WORLD_H - 24);

    // Enter a car.
    if (inp.hit('e', 'E')) {
      const car = game.nearestCar(this.x, this.y, 52);
      if (car) game.enterCar(car);
    }
    // Punch.
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    if (inp.hit('f', 'F') && this.punchCooldown <= 0) game.playerPunch();
    // Switch weapon.
    if (inp.hit('q', 'Q')) {
      if (this.weapon === 'fists' && this.ammo > 0) { this.weapon = 'pistol'; game.toast('Pistol out — click to shoot'); }
      else if (this.weapon === 'pistol') { this.weapon = 'fists'; game.toast('Fists'); }
      else game.toast('No pistol yet — find one');
    }
    // Shoot with the mouse.
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    if (this.weapon === 'pistol' && inp.mouseDown && this.shootCooldown <= 0) game.playerShoot();
    // Aim follows the mouse when armed.
    if (this.weapon === 'pistol') {
      const wx = game.cam.x + inp.mouseX, wy = game.cam.y + inp.mouseY;
      this.angle = angleTo(this.x, this.y, wx, wy);
    }
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.regenTimer += dt;
    if (this.regenTimer > 8 && this.health > 0 && this.health < TUNE.playerHealth) {
      this.health = Math.min(TUNE.playerHealth, this.health + 2 * dt);
    }
  }

  updateDriving(dt, game) {
    const inp = game.input;
    const car = this.car;
    if (!car) return;
    const t = car.def;
    // Staged screenshots drive themselves: accelerate and steer along the road
    // ahead so the chase and city shots show the car moving, not parked.
    let steer = (inp.down('a', 'A', 'ArrowLeft') ? -1 : 0) + (inp.down('d', 'D', 'ArrowRight') ? 1 : 0);
    let accel = inp.down('w', 'W', 'ArrowUp') ? t.accel : 0;
    let brake = inp.down('s', 'S', 'ArrowDown');
    if (game.autopilot) {
      accel = t.accel;
      brake = false;
      let bx = ROAD_XS[0], bd = 1e12;
      for (const rx of ROAD_XS) { const d = Math.abs(car.x - rx); if (d < bd) { bd = d; bx = rx; } }
      let by = ROAD_YS[0]; bd = 1e12;
      for (const ry of ROAD_YS) { const d = Math.abs(car.y - ry); if (d < bd) { bd = d; by = ry; } }
      const onV = Math.abs(car.x - bx) < 46, onH = Math.abs(car.y - by) < 46;
      let tx, ty;
      if (onV && !onH) { tx = bx + 16; ty = car.y + (Math.sin(car.angle) >= 0 ? 300 : -300); }
      else if (onH) { tx = car.x + (Math.cos(car.angle) >= 0 ? 300 : -300); ty = by + 16; }
      else { tx = car.x + Math.cos(car.angle) * 300; ty = car.y + Math.sin(car.angle) * 300; }
      const want = Math.atan2(ty - car.y, tx - car.x);
      steer = clamp(angleDiff(car.angle, want) * 2.5, -1, 1);
    }
    const handbrake = !game.autopilot && inp.down(' ');
    if (accel) car.speed = Math.min(car.speed + accel * dt, t.top);
    else if (brake) car.speed = Math.max(car.speed - t.accel * 1.4 * dt, -t.top * 0.35);
    else car.speed *= Math.max(0, 1 - (handbrake ? 3.2 : 0.55) * dt);
    const dir = car.speed >= 0 ? 1 : -1;
    car.angle += steer * t.turn * dt * dir * clamp(Math.abs(car.speed) / 120, 0.25, 1);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const pos = { x: nx, y: ny };
    const hitWall = collideBuildings(game.city, pos, 20);
    car.x = pos.x; car.y = pos.y;
    if (hitWall && Math.abs(car.speed) > 140) {
      car.health -= Math.abs(car.speed) * 0.045;
      game.audio.crash();
      game.shake(6);
      game.sparks(car.x, car.y, 8);
      car.speed *= 0.35;
      if (car.health <= 0) updateCar(car, 0, game);
    }
    // Ram peds and other cars.
    for (const p of game.peds) {
      if (p.state === 'down') continue;
      if (dist(car.x, car.y, p.x, p.y) < 30 && Math.abs(car.speed) > 60) {
        p.state = 'down'; p.downTimer = 5;
        p.x += Math.cos(car.angle) * 26; p.y += Math.sin(car.angle) * 26;
        game.addWanted(1, 'pedestrian hit');
        game.sparks(p.x, p.y, 6);
        scarePeds(game, p.x, p.y, 260);
      }
    }
    for (const other of game.cars) {
      if (other === car || other.dead) continue;
      const d = dist(car.x, car.y, other.x, other.y);
      if (d < 44 && d > 0.01) {
        const push = (44 - d) * 0.5;
        const a = angleTo(other.x, other.y, car.x, car.y);
        car.x += Math.cos(a) * push; car.y += Math.sin(a) * push;
        other.x -= Math.cos(a) * push; other.y -= Math.sin(a) * push;
        if (Math.abs(car.speed) > 200) {
          other.health -= 6; car.health -= 3;
          game.audio.crash(); game.shake(4);
          if (other.driver === 'police') game.addWanted(1, 'rammed a cop car');
        }
        car.speed *= 0.96;
      }
    }
    this.x = car.x; this.y = car.y; this.angle = car.angle;
    if (inp.hit('e', 'E')) game.exitCar();
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
  }
}
