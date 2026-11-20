// The screenshot scenes behind ?shot=start|play|end. Each one plays the real rules forward
// from a fresh world for a fixed number of steps, steered by a simple autopilot (drive toward
// the mission waypoint on the roads, steer around buildings), so the frame is what a short
// game really looks like and the same seed always gives the same frame.
import { STEP } from './config.js';
import { EVENT_BUSTED, EVENT_WASTED } from './world.js';
import { SCREEN_BUSTED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 40;
const END_SECONDS = 90;

/** Autopilot controls: drive toward the mission target, on foot walk to the nearest car. */
function autopilot(state) {
  const p = state.player;
  const m = state.mission;
  const tx = m && m.targetX !== undefined ? m.targetX : 1600;
  const ty = m && m.targetY !== undefined ? m.targetY : 1600;
  const controls = {
    mx: 0, my: 0, throttle: 0, steer: 0, sprint: false,
    firing: false, interact: false, aimX: p.x + 100, aimY: p.y,
  };
  if (p.car) {
    const targetAngle = Math.atan2(ty - p.y, tx - p.x);
    let d = targetAngle - p.angle;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    controls.throttle = 1;
    controls.steer = Math.max(-1, Math.min(1, d * 1.6));
  } else {
    // Walk to the nearest car, then get in.
    let best = null;
    let bestD = 1e9;
    for (const car of state.cars) {
      if (car.driven || car.wrecked) continue;
      const dd = Math.hypot(car.x - p.x, car.y - p.y);
      if (dd < bestD) {
        bestD = dd;
        best = car;
      }
    }
    if (best) {
      const dx = best.x - p.x;
      const dy = best.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      controls.mx = dx / len;
      controls.my = dy / len;
      if (bestD < 46) controls.interact = true;
    }
  }
  return controls;
}

/**
 * Set `world` to the named scene (start, play or end; any other name is start) and return the
 * screen to draw over it.
 */
export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  if (name !== 'play' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) {
      world.step(STEP, { mx: 0, my: 0, throttle: 0, steer: 0, sprint: false, firing: false, interact: false, aimX: 0, aimY: 0 }, true);
    }
    return { screen: SCREEN_TITLE };
  }
  const seconds = name === 'end' ? END_SECONDS : PLAY_SECONDS;
  let over = null;
  for (let i = 0; i < seconds / STEP; i += 1) {
    const events = world.step(STEP, autopilot(state), false);
    if (events & EVENT_WASTED) {
      over = SCREEN_WASTED;
      break;
    }
    if (events & EVENT_BUSTED) {
      over = SCREEN_BUSTED;
      break;
    }
  }
  if (name === 'end') {
    // The end scene must show a game-over screen: if the autopilot survived, wreck it.
    if (!over) {
      state.player.health = 0;
      over = SCREEN_WASTED;
    }
    return { screen: over };
  }
  return { screen: SCREEN_PLAY };
}
