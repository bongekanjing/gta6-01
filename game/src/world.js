// Solara Bay — the city itself: road grid, blocks, buildings, props, beach,
// the road graph traffic follows, and the collision helpers everything uses.
import { WORLD_W, WORLD_H, ROAD_W, ROAD_XS, ROAD_YS, BEACH_Y, SEA_Y, PALETTE, PLACES } from './config.js';
import { makeRng, clamp } from './random.js';

// A building: axis-aligned box with a name, roof colour and height (for shadows).
export function buildCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const trees = [];
  const lamps = [];
  const parks = [];

  // Blocks are the rectangles between neighbouring roads.
  for (let i = 0; i < ROAD_XS.length - 1; i++) {
    for (let j = 0; j < ROAD_YS.length - 1; j++) {
      const x0 = ROAD_XS[i] + ROAD_W / 2 + 14;
      const x1 = ROAD_XS[i + 1] - ROAD_W / 2 - 14;
      const y0 = ROAD_YS[j] + ROAD_W / 2 + 14;
      const y1 = ROAD_YS[j + 1] - ROAD_W / 2 - 14;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      // The central block is Palm Court Park; the beach strip has no buildings.
      if (Math.abs(cx - PLACES.park.x) < 200 && Math.abs(cy - PLACES.park.y) < 200) {
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        for (let t = 0; t < 14; t++) trees.push({ x: rng.range(x0 + 20, x1 - 20), y: rng.range(y0 + 20, y1 - 20), r: rng.range(9, 14) });
        continue;
      }
      if (y0 > BEACH_Y - 60) continue;
      // 1-3 buildings per block, or a parking lot.
      if (rng.chance(0.18)) {
        for (let t = 0; t < 5; t++) trees.push({ x: rng.range(x0 + 16, x1 - 16), y: rng.range(y0 + 16, y1 - 16), r: rng.range(8, 12) });
        continue;
      }
      const n = rng.int(1, 3);
      for (let b = 0; b < n; b++) {
        const bw = rng.range(90, Math.min(190, (x1 - x0) / n - 24));
        const bh = rng.range(80, Math.min(160, y1 - y0 - 24));
        const bx = x0 + ((x1 - x0) / n) * b + rng.range(8, 20);
        const by = y0 + rng.range(10, Math.max(11, y1 - y0 - bh - 10));
        buildings.push({
          x: bx, y: by, w: bw, h: bh,
          roof: rng.pick(PALETTE.buildingRoof),
          wall: rng.pick(PALETTE.buildingWall),
          tall: rng.chance(0.3),
          name: '',
        });
      }
      for (let t = 0; t < 2; t++) trees.push({ x: rng.range(x0 + 12, x1 - 12), y: rng.range(y0 + 12, y1 - 12), r: rng.range(8, 12) });
    }
  }

  // Name the landmark buildings near their places.
  const named = [
    [PLACES.safehouse, 'APARTMENTS'], [PLACES.diner, 'DINER'], [PLACES.docks, 'DOCKS'],
    [PLACES.casino, 'GOLDEN PALM'], [PLACES.warehouse, 'WAREHOUSE'], [PLACES.pdhq, 'POLICE HQ'],
    [PLACES.hospital, 'HOSPITAL'], [PLACES.paintshop, 'SPRAY & GO'],
  ];
  for (const [place, label] of named) {
    let best = null, bestD = 1e12;
    for (const b of buildings) {
      const d = (b.x + b.w / 2 - place.x) ** 2 + (b.y + b.h / 2 - place.y) ** 2;
      if (d < bestD) { bestD = d; best = b; }
    }
    if (best) best.name = label;
  }

  // Street lamps along the roads.
  for (const rx of ROAD_XS) for (const ry of ROAD_YS) {
    lamps.push({ x: rx + ROAD_W / 2 + 6, y: ry - ROAD_W / 2 - 6 });
    lamps.push({ x: rx - ROAD_W / 2 - 6, y: ry + ROAD_W / 2 + 6 });
  }

  // Road graph: intersections, used by traffic and police.
  const nodes = [];
  for (const rx of ROAD_XS) for (const ry of ROAD_YS) nodes.push({ x: rx, y: ry });
  function nearestNode(x, y) {
    let best = nodes[0], bd = 1e12;
    for (const n of nodes) { const d = (n.x - x) ** 2 + (n.y - y) ** 2; if (d < bd) { bd = d; best = n; } }
    return best;
  }

  return { seed, buildings, trees, lamps, parks, nodes, nearestNode };
}

// Is a point on a road (with a little margin)?
export function onRoad(x, y) {
  const half = ROAD_W / 2 + 6;
  for (const rx of ROAD_XS) if (Math.abs(x - rx) < half) return true;
  for (const ry of ROAD_YS) if (Math.abs(y - ry) < half) return true;
  return false;
}

// Is a point on a sidewalk (the strip just outside a road)?
export function onSidewalk(x, y) {
  const half = ROAD_W / 2 + 16;
  for (const rx of ROAD_XS) if (Math.abs(x - rx) < half && Math.abs(x - rx) > ROAD_W / 2) return true;
  for (const ry of ROAD_YS) if (Math.abs(y - ry) < half && Math.abs(y - ry) > ROAD_W / 2) return true;
  return false;
}

// Push a circle (x, y, radius) out of every building and the world edge.
// Returns true if a collision happened. Mutates pos in place.
export function collideBuildings(city, pos, radius) {
  let hit = false;
  for (const b of city.buildings) {
    const cx = clamp(pos.x, b.x, b.x + b.w);
    const cy = clamp(pos.y, b.y, b.y + b.h);
    const dx = pos.x - cx, dy = pos.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.01) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.y = cy + (dy / d) * radius;
      } else {
        pos.x = b.x - radius; // inside: shove out to the left
      }
    }
  }
  const m = 24;
  if (pos.x < m) { pos.x = m; hit = true; }
  if (pos.y < m) { pos.y = m; hit = true; }
  if (pos.x > WORLD_W - m) { pos.x = WORLD_W - m; hit = true; }
  if (pos.y > WORLD_H - m) { pos.y = WORLD_H - m; hit = true; }
  return hit;
}

// A random point on a road, for spawning traffic near the player.
export function randomRoadPoint(rng) {
  if (rng.chance(0.5)) {
    return { x: rng.pick(ROAD_XS) + rng.range(-16, 16), y: rng.range(80, WORLD_H - 160) };
  }
  return { x: rng.range(80, WORLD_W - 80), y: rng.pick(ROAD_YS) + rng.range(-16, 16) };
}

// A random sidewalk point near (x, y) for pedestrians.
export function randomSidewalkPoint(rng, x, y, radius) {
  for (let tries = 0; tries < 12; tries++) {
    const px = x + rng.range(-radius, radius);
    const py = y + rng.range(-radius, radius);
    if (px > 60 && px < WORLD_W - 60 && py > 60 && py < BEACH_Y - 20 && onSidewalk(px, py)) return { x: px, y: py };
  }
  return { x: clamp(x, 80, WORLD_W - 80), y: clamp(y, 80, WORLD_H - 80) };
}
