// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between title, play, paused, busted, wasted and win screens, and progress autosaves
// to local storage.
//
// ?seed=N fixes the city's random layout. ?shot=start|play|end (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  EVENT_BUSTED, EVENT_CRASH, EVENT_HIT, EVENT_MISSION, EVENT_PICKUP,
  EVENT_SHOT, EVENT_STEAL, EVENT_WASTED, EVENT_WIN, createWorld,
} from './world.js';
import {
  ACTION_CONFIRM, ACTION_FIRE, ACTION_INTERACT, ACTION_MISSIONS, ACTION_NEWGAME,
  ACTION_PAUSE, createInput,
} from './input.js';
import {
  SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED,
  SCREEN_WIN, createRenderer,
} from './render.js';
import { stageShot } from './shots.js';
import { createAudio } from './audio.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.serialize()));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function runShot(name) {
  window.__shotErrors = [];
  window.addEventListener('error', (event) => {
    window.__shotErrors.push(String(event.message || event.error || 'error'));
  });
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, {
      showMissions: false, missions: world.MISSIONS.map((m) => m.name),
      hasSave: false, saveCash: 0, saveMissions: 0,
    });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let save = readSave();
  let showMissions = false;
  let accumulator = 0;
  let last = performance.now();
  let saveTimer = 0;

  const ui = {
    showMissions: false,
    missions: world.MISSIONS.map((m) => m.name),
    hasSave: !!save,
    saveCash: save ? save.cash : 0,
    saveMissions: save ? save.missionsDone : 0,
  };

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame(newGame) {
    if (newGame || !save) {
      world.restore(null);
      world.state.cash = 100;
      world.state.missionIndex = 0;
      world.state.stats = { carsStolen: 0, shotsFired: 0, missionsDone: 0, cashEarned: 0 };
    } else {
      world.restore(save);
    }
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce('Playing. Steal a car to start the first mission.');
  }

  function handleEvents(events) {
    if (events & EVENT_SHOT) audio.shot();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_MISSION) {
      audio.mission();
      writeSave();
    }
    if (events & EVENT_STEAL) announce('Car stolen.');
    if (events & EVENT_HIT) announce('You are hurt.');
    if (events & EVENT_BUSTED) {
      screen = SCREEN_BUSTED;
      audio.busted();
      writeSave();
      announce('Busted by the police.');
    } else if (events & EVENT_WASTED) {
      screen = SCREEN_WASTED;
      audio.busted();
      writeSave();
      announce('Wasted.');
    } else if (events & EVENT_WIN) {
      screen = SCREEN_WIN;
      audio.mission();
      writeSave();
      announce('Kingpin! You own Vice City.');
    }
  }

  function handleActions(actions) {
    if (actions & ACTION_NEWGAME && screen === SCREEN_TITLE) {
      save = null;
      startGame(true);
      return;
    }
    if (actions & ACTION_CONFIRM) {
      audio.unlock();
      if (screen === SCREEN_TITLE) startGame(false);
      else if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) startGame(false);
      else if (screen === SCREEN_WIN) screen = SCREEN_PLAY;
      else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    if (actions & ACTION_MISSIONS && screen === SCREEN_PLAY) {
      showMissions = !showMissions;
      ui.showMissions = showMissions;
    }
  }

  function controls(actions) {
    const move = input.move();
    const mouse = input.mouse();
    const cam = renderer.camera();
    return {
      mx: move.x, my: move.y,
      throttle: input.throttle(), steer: input.steer(), sprint: input.sprint(),
      firing: mouse.down || (actions & ACTION_FIRE) !== 0,
      interact: (actions & ACTION_INTERACT) !== 0,
      aimX: cam.x + mouse.x, aimY: cam.y + mouse.y,
    };
  }

  function step(actions) {
    const c = controls(actions);
    const events = world.step(STEP, c, screen === SCREEN_TITLE);
    handleEvents(events);
    const p = world.state.player;
    audio.update(p.car ? Math.abs(p.car.speed) : 0, world.state.wanted, STEP);
    saveTimer += STEP;
    if (saveTimer > 5) {
      saveTimer = 0;
      writeSave();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    handleActions(actions);
    if (screen === SCREEN_TITLE) {
      // The title screen's backdrop is the living city.
      while (accumulator >= STEP) {
        world.step(STEP, { mx: 0, my: 0, throttle: 0, steer: 0, sprint: false, firing: false, interact: false, aimX: 0, aimY: 0 }, true);
        accumulator -= STEP;
      }
    } else if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        step(actions);
        accumulator -= STEP;
        if (screen !== SCREEN_PLAY) {
          accumulator = 0;
          break;
        }
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, ui);
  }

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Vice City Nights. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
