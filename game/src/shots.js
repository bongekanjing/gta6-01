// Solara Bay — screenshot staging: ?shot=chase|city|mission|combat (plus ?seed=N)
// puts the game into a deterministic, readable scene for the 4 screenshots.
// The game keeps running live after staging, so traffic and police are mid-action.
import { CAR_TYPES } from './config.js';
import { Car } from './entities.js';

function placeCar(game, type, x, y, angle, driver) {
  const def = CAR_TYPES[type];
  const car = new Car(type, x, y, angle, def.colors[0]);
  car.driver = driver;
  car.speed = driver === 'traffic' ? def.top * 0.4 : 0;
  game.cars.push(car);
  return car;
}

function clearTraffic(game) {
  game.cars = game.cars.filter((c) => c.driver === 'player' || c.driver === 'police');
  game.peds = [];
}

export function stageShot(game, shot) {
  const p = game.player;
  game.state = 'playing';
  game.shotMode = true; // freeze the ambient population for a readable frame
  game.hideAllOverlays();
  game.audio.setMuted(true);
  if (shot === 'chase') {
    // Cover: a police chase on the main avenue — wanted 3, minimap, mission HUD.
    game.missions.start(2); // Hot Pursuit
    game.setWanted(3);
    game.autopilot = true; // the staged car drives itself down the avenue
    const car = placeCar(game, 'sport', 1400, 1000, 0, 'player');
    game.enterCar(car, true);
    car.speed = 380;
    // Three interceptors in pursuit behind the player, eastbound on the avenue.
    placeCar(game, 'police', 1120, 1000, 0, 'police').speed = 380;
    placeCar(game, 'police', 1030, 1010, 0, 'police').speed = 360;
    placeCar(game, 'police', 950, 990, 0, 'police').speed = 340;
    placeCar(game, 'sedan', 1680, 1000, 0, 'traffic');
    placeCar(game, 'taxi', 1180, 1000, Math.PI, 'traffic');
    p.money = 1250;
  } else if (shot === 'city') {
    // Daytime city: driving in traffic with pedestrians on the sidewalks.
    game.missions.start(0); // Wheels
    game.missions.step = 1; // already has a car — drive to the paint shop
    game.autopilot = true;
    const car = placeCar(game, 'sedan', 1000, 600, 0, 'player');
    game.enterCar(car, true);
    car.speed = 240;
    placeCar(game, 'taxi', 1240, 600, 0, 'traffic');
    placeCar(game, 'van', 800, 600, Math.PI, 'traffic');
    placeCar(game, 'sport', 1400, 620, 0, 'traffic');
    placeCar(game, 'truck', 600, 1000, Math.PI / 2, 'traffic');
    game.spawnPedsNear(1000, 600, 10);
    p.money = 750;
  } else if (shot === 'mission') {
    // Mission in progress: on foot at the docks, package marker glowing.
    clearTraffic(game);
    game.missions.start(1); // The Pickup
    game.missions.step = 1; // at the docks, collect the package
    p.x = 2880; p.y = 980; p.angle = Math.PI / 4; // close to the marker, DOCKS in frame
    p.money = 1750;
    placeCar(game, 'van', 2960, 1080, Math.PI / 2, null);
    placeCar(game, 'sedan', 2760, 1060, 0, null);
    game.spawnPedsNear(2860, 960, 3);
  } else if (shot === 'combat') {
    // Warehouse payback: pistol out, thugs spread ahead, wanted 2, health showing.
    clearTraffic(game);
    game.missions.start(3); // Payback (spawns its 4 thugs)
    game.missions.step = 1; // defeat the Vultures
    // Spread the thugs in an arc ahead of the player so each one reads.
    const spots = [[1080, 1740], [1120, 1800], [1040, 1860], [1160, 1760]];
    game.thugs.forEach((t, i) => { t.x = spots[i][0]; t.y = spots[i][1]; });
    p.x = 940; p.y = 1760; p.angle = 0;
    p.health = 72; p.ammo = 24; p.weapon = 'pistol';
    p.money = 3750;
    game.setWanted(2);
    placeCar(game, 'police', 1350, 2000, -Math.PI / 2, 'police').speed = 200;
  } else {
    // Default: free roam at the safehouse.
    p.x = 420; p.y = 420;
  }
  game.cam.x = p.x - 640;
  game.cam.y = p.y - 360;
  game.clampCamera();
  window.__SHOT_READY = true;
}
