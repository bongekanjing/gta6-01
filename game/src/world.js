// The game's rules and state, with no drawing and no browser in it: a 3200x3200 city of
// roads, buildings, parks and a beach; the player on foot or in a car; traffic, pedestrians,
// police, a wanted level, missions, combat, pickups and an economy. step() advances one
// fixed step and returns what happened as bit flags, so the caller can react without the
// world knowing about screens or sound.
import {
  BULLET_RANGE, BULLET_SPEED, BUST_SECONDS, CAR_ACCEL, CAR_BRAKE, CAR_MAX_REVERSE,
  CAR_MAX_SPEED, CAR_RADIUS, CAR_REVERSE, CAR_TURN, COP_HEALTH, COP_MAX, COP_SPEED,
  FIRE_INTERVAL, HEALTH_PACK, MAX_WANTED, PARKED_COUNT, PED_COUNT, PICKUP_CASH_MAX,
  PICKUP_CASH_MIN, PICKUP_COUNT, PLAYER_HEALTH, PLAYER_RADIUS, RIVAL_HEALTH,
  ROAD_EVERY, ROAD_WIDTH, SPRINT_MULT, START_CASH, TRAFFIC_COUNT, WALK_SPEED,
  WANTED_DECAY_SECONDS, WORLD,
} from './config.js';

export const EVENT_BUSTED = 1;
export const EVENT_WASTED = 2;
export const EVENT_MISSION = 4;
export const EVENT_PICKUP = 8;
export const EVENT_HIT = 16;
export const EVENT_WIN = 32;
export const EVENT_SHOT = 64;
export const EVENT_CRASH = 128;
export const EVENT_STEAL = 256;

const ROADS = [];
for (let v = 200; v <= 3000; v += ROAD_EVERY) ROADS.push(v);

const BUILDING_COLORS = ['#8d6e63', '#a1887f', '#90a4ae', '#b0bec5', '#c9a227', '#7e57c2', '#5c6bc0', '#ef6c00', '#66bb6a', '#ec407a', '#26a69a', '#78909c'];
const ROOF_COLORS = ['#5d4037', '#37474f', '#4e342e', '#263238', '#616161'];
const CAR_COLORS = ['#e53935', '#1e88e5', '#fdd835', '#43a047', '#fb8c00', '#8e24aa', '#00acc1', '#f5f5f5', '#212121', '#d81b60', '#7cb342'];
const PED_COLORS = ['#ffcc80', '#a1887f', '#90caf9', '#a5d6a7', '#ce93d8', '#fff59d', '#ef9a9a', '#bcaaa4'];

const MISSIONS = [
  { name: 'Hot Wheels', text: 'Steal a car — walk up to one and press E', kind: 'steal', reward: 200 },
  { name: 'First Delivery', text: 'Drive the package to the east docks', kind: 'goto', reward: 300, target: [2860, 1400] },
  { name: 'Getaway', text: 'Lose the heat — get your wanted level to zero', kind: 'escape', reward: 400 },
  { name: 'The Collector', text: 'Grab 5 street cash pickups', kind: 'collect', reward: 350 },
  { name: 'Rival Down', text: 'Take out Ricky Rook in Central Park — he shoots back', kind: 'eliminate', reward: 600, target: [1400, 1400] },
  { name: 'Midnight Run', text: 'Deliver to the north pier in 90 seconds', kind: 'goto', reward: 500, target: [600, 300], timer: 90 },
  { name: 'Heat Wave', text: 'Survive 3-star heat for 40 seconds', kind: 'survive', reward: 700 },
  { name: 'Kingpin', text: 'The final drop — the south beach', kind: 'goto', reward: 1000, target: [1600, 3050] },
];

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

function turnToward(angle, target, maxStep) {
  let d = target - angle;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (d > maxStep) return angle + maxStep;
  if (d < -maxStep) return angle - maxStep;
  return target;
}

function isOnRoad(x, y) {
  for (const r of ROADS) {
    if (Math.abs(x - r) <= ROAD_WIDTH / 2 || Math.abs(y - r) <= ROAD_WIDTH / 2) return true;
  }
  return false;
}

export function createWorld(random) {
  // ---- City generation (once; reset() keeps the city, rebuilds the life in it) ----
  const buildings = [];
  const parks = [];
  const trees = [];
  for (let bx = 0; bx < 7; bx += 1) {
    for (let by = 0; by < 7; by += 1) {
      const x0 = ROADS[bx] + ROAD_WIDTH / 2 + 14;
      const x1 = ROADS[bx + 1] - ROAD_WIDTH / 2 - 14;
      const y0 = ROADS[by] + ROAD_WIDTH / 2 + 14;
      const y1 = ROADS[by + 1] - ROAD_WIDTH / 2 - 14;
      const roll = random.next();
      if (roll < 0.12) {
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        const n = random.int(5, 9);
        for (let i = 0; i < n; i += 1) trees.push({ x: random.range(x0 + 14, x1 - 14), y: random.range(y0 + 14, y1 - 14), r: random.range(9, 15) });
        continue;
      }
      if (roll < 0.22) continue; // parking lot / empty lot
      const cols = 2;
      const rows = 2;
      const cw = (x1 - x0) / cols;
      const ch = (y1 - y0) / rows;
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          if (!random.chance(0.72)) continue;
          const w = cw - 22;
          const h = ch - 22;
          buildings.push({
            x: x0 + cx * cw + 11, y: y0 + cy * ch + 11, w, h,
            color: random.pick(BUILDING_COLORS), roof: random.pick(ROOF_COLORS),
            height: random.int(8, 34),
          });
        }
      }
    }
  }

  const state = {
    buildings, parks, trees,
    player: null, cars: [], peds: [], pickups: [], bullets: [], particles: [],
    cash: START_CASH, wanted: 0, wantedHeat: 0, wantedTimer: 0,
    missionIndex: 0, mission: null, missionTimer: 0, missionCollected: 0,
    elapsed: 0, timeOfDay: 18.2, damageTimer: 99, bustMeter: 0,
    stats: { carsStolen: 0, shotsFired: 0, missionsDone: 0, cashEarned: 0 },
    message: '', messageTimer: 0,
  };

  function roadPoint(margin) {
    const road = random.pick(ROADS);
    const along = random.range(margin, WORLD - margin);
    return random.chance(0.5) ? { x: road, y: along } : { x: along, y: road };
  }

  function freeSpot() {
    for (let tries = 0; tries < 40; tries += 1) {
      const p = roadPoint(120);
      if (dist(p.x, p.y, state.player.x, state.player.y) > 320) return p;
    }
    return roadPoint(120);
  }

  function makeCar(x, y, angle, kind) {
    return {
      x, y, angle, speed: 0, color: random.pick(CAR_COLORS), kind,
      health: kind === 'cop' ? 60 : 100, driven: false, wrecked: false, wasTraffic: kind === 'traffic',
      turnCooldown: 0, stopTimer: 0,
    };
  }

  function spawnTrafficCar() {
    const vertical = random.chance(0.5);
    const road = random.pick(ROADS);
    const along = random.range(120, WORLD - 120);
    const dir = random.chance(0.5) ? 1 : -1;
    const lane = 24;
    let x, y, angle;
    if (vertical) {
      x = road + (dir > 0 ? lane : -lane);
      y = along;
      angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      x = along;
      y = road + (dir > 0 ? lane : -lane);
      angle = dir > 0 ? 0 : Math.PI;
    }
    const car = makeCar(x, y, angle, 'traffic');
    car.speed = random.range(90, 170);
    car.targetSpeed = car.speed;
    state.cars.push(car);
  }

  function spawnParkedCar() {
    const vertical = random.chance(0.5);
    const road = random.pick(ROADS);
    const along = random.range(150, WORLD - 150);
    const side = random.chance(0.5) ? 1 : -1;
    const x = vertical ? road + side * (ROAD_WIDTH / 2 - 12) : along;
    const y = vertical ? along : road + side * (ROAD_WIDTH / 2 - 12);
    const angle = vertical ? (random.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : (random.chance(0.5) ? 0 : Math.PI);
    state.cars.push(makeCar(x, y, angle, 'parked'));
  }

  function spawnPed() {
    const p = roadPoint(100);
    state.peds.push({
      x: p.x, y: p.y, angle: random.range(0, Math.PI * 2), speed: random.range(28, 52),
      kind: 'ped', health: 1, state: 'walk', stateTimer: random.range(2, 8),
      color: random.pick(PED_COLORS), counted: false, fireTimer: random.range(0.5, 1.5),
    });
  }

  function spawnPickup(kind, x, y, mission) {
    state.pickups.push({
      x, y, kind, mission: !!mission, active: true,
      amount: kind === 'cash' ? random.int(PICKUP_CASH_MIN, PICKUP_CASH_MAX) : 0,
      bob: random.range(0, Math.PI * 2),
    });
  }

  function spawnCop() {
    const p = freeSpot();
    const car = makeCar(p.x, p.y, angleTo(p.x, p.y, state.player.x, state.player.y), 'cop');
    car.color = '#111827';
    car.speed = 120;
    state.cars.push(car);
  }

  function addWanted(n) {
    state.wanted = Math.min(MAX_WANTED, state.wanted + n);
    state.wantedTimer = 0;
  }

  function announce(text, seconds) {
    state.message = text;
    state.messageTimer = seconds || 3;
  }

  function setupMission(index) {
    const def = MISSIONS[index];
    if (!def) {
      state.mission = null;
      return;
    }
    state.mission = { ...def, targetX: def.target ? def.target[0] : 0, targetY: def.target ? def.target[1] : 0 };
    state.missionTimer = def.timer || 0;
    state.missionCollected = 0;
    if (def.kind === 'escape') addWanted(2);
    if (def.kind === 'survive') addWanted(3);
    if (def.kind === 'collect') {
      for (let i = 0; i < 5; i += 1) {
        const p = freeSpot();
        spawnPickup('cash', p.x, p.y, true);
      }
    }
    if (def.kind === 'eliminate') {
      state.peds.push({
        x: 1400, y: 1400, angle: 0, speed: 60, kind: 'rival', health: RIVAL_HEALTH,
        state: 'walk', stateTimer: 5, color: '#e53935', counted: false, fireTimer: 1,
      });
    }
    announce(`Mission: ${def.name} — ${def.text}`, 4);
  }

  function completeMission(events) {
    const def = state.mission;
    if (!def) return events;
    state.cash += def.reward;
    state.stats.cashEarned += def.reward;
    state.stats.missionsDone += 1;
    announce(`Mission complete: ${def.name} — +$${def.reward}`, 4);
    state.missionIndex += 1;
    if (state.missionIndex >= MISSIONS.length) {
      state.mission = null;
      return events | EVENT_MISSION | EVENT_WIN;
    }
    setupMission(state.missionIndex);
    return events | EVENT_MISSION;
  }

  // ---- Collisions: circle vs building rectangles, pushed out along the smallest axis ----
  function collideBuildings(entity, radius) {
    for (const b of buildings) {
      const cx = Math.max(b.x, Math.min(entity.x, b.x + b.w));
      const cy = Math.max(b.y, Math.min(entity.y, b.y + b.h));
      const dx = entity.x - cx;
      const dy = entity.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= radius * radius) continue;
      if (d2 === 0) {
        entity.x += radius;
        continue;
      }
      const d = Math.sqrt(d2);
      entity.x = cx + (dx / d) * radius;
      entity.y = cy + (dy / d) * radius;
      return true;
    }
    return false;
  }

  function clampWorld(entity, radius) {
    entity.x = Math.max(radius, Math.min(WORLD - radius, entity.x));
    entity.y = Math.max(radius, Math.min(WORLD - radius, entity.y));
  }

  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      if (state.particles.length > 220) return;
      const a = random.range(0, Math.PI * 2);
      const s = random.range(speed * 0.3, speed);
      state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: random.range(0.25, 0.7), color, size: random.range(2, 5) });
    }
  }

  function reset() {
    state.player = {
      x: 600, y: 600, angle: -Math.PI / 2, health: PLAYER_HEALTH, car: null,
      fireCooldown: 0, bustMeter: 0, moving: false,
    };
    state.cars = [];
    state.peds = [];
    state.pickups = [];
    state.bullets = [];
    state.particles = [];
    state.wanted = 0;
    state.wantedHeat = 0;
    state.wantedTimer = 0;
    state.elapsed = 0;
    state.timeOfDay = 18.2;
    state.damageTimer = 99;
    state.bustMeter = 0;
    state.message = '';
    state.messageTimer = 0;
    for (let i = 0; i < TRAFFIC_COUNT; i += 1) spawnTrafficCar();
    for (let i = 0; i < PARKED_COUNT; i += 1) spawnParkedCar();
    for (let i = 0; i < PED_COUNT; i += 1) spawnPed();
    for (let i = 0; i < PICKUP_COUNT; i += 1) {
      const p = freeSpot();
      spawnPickup(random.chance(0.7) ? 'cash' : 'health', p.x, p.y, false);
    }
    setupMission(state.missionIndex);
  }

  function nearestCar(x, y, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of state.cars) {
      if (car.driven || car.wrecked) continue;
      const d = dist(x, y, car.x, car.y);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function damagePlayer(amount) {
    const p = state.player;
    p.health -= amount;
    state.damageTimer = 0;
    if (p.health <= 0) p.health = 0;
  }

  /**
   * One fixed step.
   * controls: { mx, my, throttle, steer, sprint, firing, interact, aimX, aimY } — all in
   * world space where they need it. With `harmless` set (the title backdrop) the city lives
   * but nothing can hurt or score.
   */
  function step(dt, controls, harmless) {
    let events = 0;
    const p = state.player;
    state.elapsed += dt;
    state.timeOfDay = (state.timeOfDay + dt / 240) % 24;
    state.damageTimer += dt;
    if (state.messageTimer > 0) state.messageTimer -= dt;
    if (p.fireCooldown > 0) p.fireCooldown -= dt;
    if (p.health < PLAYER_HEALTH && state.damageTimer > 8 && !harmless) {
      p.health = Math.min(PLAYER_HEALTH, p.health + 1.5 * dt);
    }

    // ---- Wanted level: decays when no cop has seen the player lately ----
    if (state.wanted > 0) {
      state.wantedTimer += dt;
      let seen = false;
      for (const car of state.cars) {
        if (car.kind === 'cop' && dist(car.x, car.y, p.x, p.y) < 480) seen = true;
      }
      if (!seen && state.wantedTimer > WANTED_DECAY_SECONDS) {
        state.wanted -= 1;
        state.wantedTimer = 0;
        if (state.wanted === 0) announce('You lost the cops.', 2.5);
      }
    } else {
      state.wantedTimer = 0;
    }

    // ---- Player: on foot or driving ----
    if (p.car) {
      const car = p.car;
      car.x = p.x;
      car.y = p.y;
      car.angle = p.angle;
      const speed = car.speed;
      if (controls.throttle > 0) car.speed = Math.min(CAR_MAX_SPEED, speed + CAR_ACCEL * dt);
      else if (controls.throttle < 0) {
        car.speed = speed > 0 ? Math.max(0, speed - CAR_BRAKE * dt) : Math.max(-CAR_MAX_REVERSE, speed - CAR_REVERSE * dt);
      } else {
        car.speed = speed > 0 ? Math.max(0, speed - 140 * dt) : Math.min(0, speed + 140 * dt);
      }
      const moving = Math.abs(car.speed) > 12;
      if (moving) {
        p.angle += controls.steer * CAR_TURN * dt * Math.min(1, Math.abs(car.speed) / 160) * (car.speed < 0 ? -1 : 1);
      }
      p.x += Math.cos(p.angle) * car.speed * dt;
      p.y += Math.sin(p.angle) * car.speed * dt;
      p.moving = moving;
      const hit = collideBuildings(p, CAR_RADIUS);
      clampWorld(p, CAR_RADIUS);
      if (hit && Math.abs(car.speed) > 150) {
        car.health -= Math.abs(car.speed) * 0.12;
        car.speed *= 0.35;
        burst(p.x, p.y, '#ffb300', 10, 160);
        events |= EVENT_CRASH;
        if (car.health <= 0 && !car.wrecked) {
          car.wrecked = true;
          burst(p.x, p.y, '#616161', 22, 120);
          announce('Your car is wrecked!', 2.5);
          p.car = null;
          p.x += Math.cos(p.angle + Math.PI / 2) * 26;
          p.y += Math.sin(p.angle + Math.PI / 2) * 26;
        }
      }
      if (controls.interact) {
        p.car = null;
        car.kind = 'parked';
        car.speed = 0;
        p.x += Math.cos(p.angle + Math.PI / 2) * 26;
        p.y += Math.sin(p.angle + Math.PI / 2) * 26;
        collideBuildings(p, PLAYER_RADIUS);
      }
    } else {
      const speed = WALK_SPEED * (controls.sprint ? SPRINT_MULT : 1);
      const nx = p.x + controls.mx * speed * dt;
      const ny = p.y + controls.my * speed * dt;
      p.x = nx;
      p.y = ny;
      p.moving = controls.mx !== 0 || controls.my !== 0;
      if (p.moving) p.angle = Math.atan2(controls.my, controls.mx);
      collideBuildings(p, PLAYER_RADIUS);
      clampWorld(p, PLAYER_RADIUS);
      // Walking into a moving car hurts.
      for (const car of state.cars) {
        if (car.driven || car.wrecked) continue;
        if (dist(p.x, p.y, car.x, car.y) < CAR_RADIUS + PLAYER_RADIUS && Math.abs(car.speed) > 60) {
          damagePlayer(18);
          burst(p.x, p.y, '#e53935', 8, 140);
          events |= EVENT_HIT;
          p.x += (p.x - car.x) * 0.4;
          p.y += (p.y - car.y) * 0.4;
        }
      }
      if (controls.interact) {
        const car = nearestCar(p.x, p.y, 52);
        if (car) {
          p.car = car;
          car.driven = true;
          car.kind = car.kind === 'cop' ? 'cop' : 'driven';
          if (car.kind === 'cop') {
            addWanted(2);
            announce('You stole a cop car! The heat is on.', 3);
          } else if (car.wasTraffic) {
            addWanted(1);
            announce('Grand theft auto! +1 star', 2.5);
          } else {
            announce('Nice ride. Drive safe... or don\'t.', 2);
          }
          state.stats.carsStolen += 1;
          events |= EVENT_STEAL;
        }
      }
      // Shooting on foot, aimed at the mouse (world space).
      if (controls.firing && p.fireCooldown <= 0 && !harmless) {
        p.fireCooldown = FIRE_INTERVAL;
        const aim = angleTo(p.x, p.y, controls.aimX, controls.aimY);
        p.angle = aim;
        state.bullets.push({
          x: p.x + Math.cos(aim) * 20, y: p.y + Math.sin(aim) * 20,
          vx: Math.cos(aim) * BULLET_SPEED, vy: Math.sin(aim) * BULLET_SPEED,
          life: BULLET_RANGE / BULLET_SPEED, from: 'player',
        });
        burst(p.x + Math.cos(aim) * 22, p.y + Math.sin(aim) * 22, '#ffeb3b', 3, 90);
        state.stats.shotsFired += 1;
        state.wantedHeat += 0.15;
        if (state.wantedHeat >= 1) {
          state.wantedHeat = 0;
          addWanted(1);
        }
        events |= EVENT_SHOT;
      }
    }

    // ---- Traffic: drive their lane, turn at intersections, stop for the car ahead ----
    for (const car of state.cars) {
      if (car.kind !== 'traffic' || car.wrecked) continue;
      car.turnCooldown -= dt;
      const onVertical = Math.abs(Math.sin(car.angle)) > 0.7;
      let nearIntersection = false;
      for (const r of ROADS) {
        const other = onVertical ? car.y : car.x;
        if (Math.abs(other - r) < 26) nearIntersection = true;
      }
      if (nearIntersection && car.turnCooldown <= 0 && random.chance(dt * 0.25)) {
        const left = car.angle + Math.PI / 2;
        const right = car.angle - Math.PI / 2;
        car.angle = random.chance(0.5) ? left : right;
        car.turnCooldown = 2;
      }
      // Car ahead?
      let blocked = false;
      for (const other of state.cars) {
        if (other === car || other.wrecked) continue;
        const dx = other.x - car.x;
        const dy = other.y - car.y;
        const ahead = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
        const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
        if (ahead > 0 && ahead < 64 && side < 26) blocked = true;
      }
      const target = blocked ? 0 : car.targetSpeed;
      car.speed += Math.max(-260 * dt, Math.min(200 * dt, target - car.speed));
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      if (car.x < 60 || car.x > WORLD - 60 || car.y < 60 || car.y > WORLD - 60) {
        car.angle += Math.PI;
        car.x = Math.max(60, Math.min(WORLD - 60, car.x));
        car.y = Math.max(60, Math.min(WORLD - 60, car.y));
      }
      collideBuildings(car, CAR_RADIUS);
    }

    // ---- Police: spawn to match the wanted level, chase, ram, and bust on foot ----
    if (!harmless) {
      const cops = state.cars.filter((c) => c.kind === 'cop' && !c.wrecked);
      if (state.wanted > 0 && cops.length < Math.min(state.wanted, COP_MAX)) {
        spawnCop();
      }
      if (state.wanted === 0) {
        for (const car of cops) car.health = 0;
      }
    }
    for (const car of state.cars) {
      if (car.kind !== 'cop' || car.wrecked) continue;
      const targetAngle = angleTo(car.x, car.y, p.x, p.y);
      car.angle = turnToward(car.angle, targetAngle, 2.4 * dt);
      car.speed = Math.min(COP_SPEED, car.speed + 320 * dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      collideBuildings(car, CAR_RADIUS);
      clampWorld(car, CAR_RADIUS);
      const d = dist(car.x, car.y, p.x, p.y);
      if (d < CAR_RADIUS + PLAYER_RADIUS + 6) {
        if (p.car) {
          p.car.health -= 14 * dt;
          p.car.speed *= 1 - 0.6 * dt;
          if (Math.abs(p.car.speed) < 6) state.bustMeter += dt;
          if (p.car.health <= 0 && !p.car.wrecked) {
            p.car.wrecked = true;
            burst(p.x, p.y, '#616161', 22, 120);
            announce('Your car is wrecked!', 2.5);
            p.car = null;
          }
        } else {
          state.bustMeter += dt;
        }
        if (state.bustMeter >= BUST_SECONDS && !harmless) {
          return events | EVENT_BUSTED;
        }
      } else {
        state.bustMeter = Math.max(0, state.bustMeter - dt * 0.5);
      }
    }
    // Remove wrecked/dead cop cars once the heat is gone.
    if (state.wanted === 0) {
      state.cars = state.cars.filter((c) => !(c.kind === 'cop' && (c.wrecked || c.health <= 0)));
    }

    // ---- Pedestrians: stroll the sidewalks, flee danger, get knocked down ----
    for (const ped of state.peds) {
      if (ped.state === 'down') {
        ped.stateTimer -= dt;
        if (ped.stateTimer <= 0) {
          ped.state = 'walk';
          ped.stateTimer = random.range(2, 8);
        }
        continue;
      }
      const threat = dist(ped.x, ped.y, p.x, p.y) < (p.car ? 130 : 70) && (p.car ? Math.abs(p.car.speed) > 40 : true);
      if (threat && ped.state !== 'flee') {
        ped.state = 'flee';
        ped.stateTimer = random.range(1.5, 3);
      }
      if (ped.state === 'flee') {
        ped.stateTimer -= dt;
        const away = angleTo(p.x, p.y, ped.x, ped.y);
        ped.angle = away;
        ped.x += Math.cos(away) * ped.speed * 2.2 * dt;
        ped.y += Math.sin(away) * ped.speed * 2.2 * dt;
        if (ped.stateTimer <= 0) ped.state = 'walk';
      } else {
        ped.stateTimer -= dt;
        ped.x += Math.cos(ped.angle) * ped.speed * dt;
        ped.y += Math.sin(ped.angle) * ped.speed * dt;
        if (ped.stateTimer <= 0) {
          ped.angle = random.range(0, Math.PI * 2);
          ped.stateTimer = random.range(2, 8);
        }
      }
      collideBuildings(ped, 10);
      clampWorld(ped, 10);
      // Hit by a car?
      for (const car of state.cars) {
        if (car.wrecked) continue;
        if (dist(ped.x, ped.y, car.x, car.y) < CAR_RADIUS + 8 && Math.abs(car.speed) > 50) {
          ped.state = 'down';
          ped.stateTimer = 5;
          burst(ped.x, ped.y, '#e53935', 10, 130);
          if (!ped.counted && !harmless) {
            ped.counted = true;
            if (car.driven && car === p.car) {
              addWanted(1);
              announce('You ran someone over! +1 star', 2.5);
            }
          }
          if (ped.kind === 'rival') {
            ped.health = 0;
          }
        }
      }
      // The rival shoots back.
      if (ped.kind === 'rival' && ped.state !== 'down' && !harmless) {
        ped.fireTimer -= dt;
        const d = dist(ped.x, ped.y, p.x, p.y);
        if (d < 420 && ped.fireTimer <= 0) {
          ped.fireTimer = 1.3;
          const aim = angleTo(ped.x, ped.y, p.x, p.y);
          state.bullets.push({
            x: ped.x + Math.cos(aim) * 18, y: ped.y + Math.sin(aim) * 18,
            vx: Math.cos(aim) * BULLET_SPEED * 0.8, vy: Math.sin(aim) * BULLET_SPEED * 0.8,
            life: BULLET_RANGE / BULLET_SPEED, from: 'rival',
          });
          events |= EVENT_SHOT;
        }
      }
    }
    state.peds = state.peds.filter((ped) => !(ped.kind === 'rival' && ped.health <= 0));

    // ---- Bullets ----
    for (const b of state.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) continue;
      let hitBuilding = false;
      for (const bd of buildings) {
        if (b.x > bd.x && b.x < bd.x + bd.w && b.y > bd.y && b.y < bd.y + bd.h) hitBuilding = true;
      }
      if (hitBuilding) {
        b.life = 0;
        burst(b.x, b.y, '#ffb300', 4, 100);
        continue;
      }
      if (b.from === 'player') {
        for (const ped of state.peds) {
          if (ped.state === 'down') continue;
          if (dist(b.x, b.y, ped.x, ped.y) < 14) {
            b.life = 0;
            ped.health -= 1;
            burst(ped.x, ped.y, '#e53935', 8, 120);
            if (ped.health <= 0) {
              ped.state = 'down';
              ped.stateTimer = 6;
              if (ped.kind === 'rival') {
                announce('Ricky Rook is down!', 3);
              } else if (!ped.counted) {
                ped.counted = true;
                addWanted(1);
              }
            }
            break;
          }
        }
        if (b.life > 0) {
          for (const car of state.cars) {
            if (car.kind !== 'cop' || car.wrecked) continue;
            if (dist(b.x, b.y, car.x, car.y) < CAR_RADIUS + 4) {
              b.life = 0;
              car.health -= 1;
              burst(b.x, b.y, '#90caf9', 6, 110);
              if (car.health <= 0) {
                car.wrecked = true;
                burst(car.x, car.y, '#616161', 18, 130);
                addWanted(1);
                announce('Cop car disabled! +1 star', 2.5);
              }
              break;
            }
          }
        }
      } else if (dist(b.x, b.y, p.x, p.y) < PLAYER_RADIUS + 4) {
        b.life = 0;
        damagePlayer(9);
        events |= EVENT_HIT;
        burst(p.x, p.y, '#e53935', 6, 120);
      }
    }
    state.bullets = state.bullets.filter((b) => b.life > 0 && b.x > 0 && b.x < WORLD && b.y > 0 && b.y < WORLD);

    // ---- Pickups: magnet in, pay out ----
    for (const pk of state.pickups) {
      if (!pk.active) continue;
      pk.bob += dt * 3;
      if (dist(pk.x, pk.y, p.x, p.y) < 34) {
        pk.active = false;
        if (pk.kind === 'cash') {
          state.cash += pk.amount;
          state.stats.cashEarned += pk.amount;
          if (pk.mission) state.missionCollected += 1;
          announce(`+$${pk.amount}`, 1.2);
        } else {
          p.health = Math.min(PLAYER_HEALTH, p.health + HEALTH_PACK);
          announce(`Health +${HEALTH_PACK}`, 1.5);
        }
        burst(pk.x, pk.y, '#fdd835', 8, 110);
        events |= EVENT_PICKUP;
      }
    }
    state.pickups = state.pickups.filter((pk) => pk.active);

    // ---- Particles ----
    for (const pt of state.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 1 - 2.4 * dt;
      pt.vy *= 1 - 2.4 * dt;
      pt.life -= dt;
    }
    state.particles = state.particles.filter((pt) => pt.life > 0);

    // ---- Missions ----
    const m = state.mission;
    if (m && !harmless) {
      if (m.kind === 'goto') {
        if (dist(p.x, p.y, m.targetX, m.targetY) < 56) {
          events = completeMission(events);
        } else if (m.timer > 0) {
          m.timer -= dt;
          if (m.timer <= 0) {
            announce('Too slow! The client walked. Try again.', 3);
            setupMission(state.missionIndex);
          }
        }
      } else if (m.kind === 'steal') {
        if (p.car) events = completeMission(events);
      } else if (m.kind === 'escape') {
        if (state.wanted === 0) events = completeMission(events);
      } else if (m.kind === 'collect') {
        if (state.missionCollected >= 5) events = completeMission(events);
      } else if (m.kind === 'eliminate') {
        if (!state.peds.some((ped) => ped.kind === 'rival')) events = completeMission(events);
      } else if (m.kind === 'survive') {
        if (state.wanted >= 3) {
          state.missionTimer += dt;
          if (state.missionTimer >= 40) events = completeMission(events);
        }
      }
    }

    if (p.health <= 0 && !harmless) return events | EVENT_WASTED;
    return events;
  }

  function serialize() {
    return {
      cash: state.cash, missionIndex: state.missionIndex,
      missionsDone: state.stats.missionsDone, cashEarned: state.stats.cashEarned,
      carsStolen: state.stats.carsStolen,
    };
  }

  function restore(save) {
    if (!save) return;
    state.cash = save.cash ?? START_CASH;
    state.missionIndex = save.missionIndex ?? 0;
    state.stats.missionsDone = save.missionsDone ?? 0;
    state.stats.cashEarned = save.cashEarned ?? 0;
    state.stats.carsStolen = save.carsStolen ?? 0;
  }

  reset();
  return { state, reset, step, serialize, restore, setupMission, announce, MISSIONS };
}
