// Solara Bay — the game itself: state machine, loop, camera, wanted level and
// police response, stealing and driving, combat hooks, toasts, saving, menus.
import { VIEW_W, VIEW_H, WORLD_W, WORLD_H, CAR_TYPES, MISSIONS, STORY_INTRO, SAVE_KEY, TUNE, PLACES } from './config.js';
import { makeRng, clamp, dist, angleTo } from './random.js';
import { buildCity, randomRoadPoint, randomSidewalkPoint } from './world.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { Renderer, Particles } from './render.js';
import { Car, Ped, Cop, Player, updateCar, updatePed, updateCop, updateBullets, spawnBullet, scarePeds } from './entities.js';
import { MissionEngine } from './missions.js';
import { stageShot } from './shots.js';

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas);
    this.input = new Input(canvas);
    this.audio = new AudioEngine();
    const params = new URLSearchParams(location.search);
    this.seed = parseInt(params.get('seed') || '20261121', 10);
    this.shot = params.get('shot') || null;
    this.rng = makeRng(this.seed);
    this.city = buildCity(this.seed);
    this.particles = new Particles();
    this.player = new Player(PLACES.safehouse.x, PLACES.safehouse.y);
    this.cars = []; this.peds = []; this.cops = []; this.thugs = []; this.bullets = [];
    this.missions = new MissionEngine(this);
    this.cam = { x: 0, y: 0 };
    this.state = 'menu'; // menu | playing | paused | briefing | complete | over | ending
    this.shotMode = false; // staged screenshots: no maintenance spawns
    this.toasts = [];
    this.clockSeconds = 17.5 * 3600;
    this.shakeAmt = 0;
    this.wantedTimer = 0;
    this.policeTimer = 0;
    this.saveData = loadSave() || { completedMissions: 0, money: TUNE.moneyStart };
    this.player.money = this.saveData.money || TUNE.moneyStart;
    this.spawnInitialTraffic();
    this.spawnPedsNear(this.player.x, this.player.y, TUNE.pedCount);
    this.wireMenus();
    this.lastTime = performance.now();
    const loop = (t) => { this.frame(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    if (this.shot) {
      this.audio.ensure();
      stageShot(this, this.shot);
    }
  }

  // ---------- Setup ----------
  spawnInitialTraffic() {
    const types = ['sedan', 'taxi', 'sport', 'truck', 'van'];
    for (let i = 0; i < TUNE.trafficCount; i++) {
      const pt = randomRoadPoint(this.rng);
      const type = this.rng.pick(types);
      const car = new Car(type, pt.x, pt.y, this.rng.range(0, Math.PI * 2), CAR_TYPES[type].colors[0]);
      car.driver = 'traffic';
      car.speed = CAR_TYPES[type].top * 0.4;
      this.cars.push(car);
    }
    // Parked cars the player can take without a scene.
    for (let i = 0; i < 6; i++) {
      const pt = randomRoadPoint(this.rng);
      const type = this.rng.pick(types);
      const car = new Car(type, pt.x + this.rng.range(-30, 30), pt.y + this.rng.range(-30, 30), this.rng.range(0, Math.PI * 2), CAR_TYPES[type].colors[0]);
      car.driver = null;
      this.cars.push(car);
    }
  }

  spawnPedsNear(x, y, n) {
    for (let i = 0; i < n; i++) {
      const pt = randomSidewalkPoint(this.rng, x, y, 600);
      this.peds.push(new Ped(pt.x, pt.y, this.rng));
    }
  }

  spawnThugs(n) {
    for (let i = 0; i < n; i++) {
      const x = PLACES.warehouse.x + this.rng.range(-90, 90);
      const y = PLACES.warehouse.y + this.rng.range(-70, 70);
      this.thugs.push({ x, y, angle: 0, health: 60, dead: false, punchTimer: 0, speed: 120 });
    }
    this.toast('Vultures at the warehouse — deal with them');
  }

  onThugDown(t) {
    this.missions.defeated++;
    const cash = 50 + Math.floor(this.rng.next() * 100);
    this.player.money += cash;
    this.toast('Vulture down — +' + '$' + cash);
    this.sparks(t.x, t.y, 10);
    if (this.missions.defeated >= 4) this.toast('All Vultures down — take the ledger');
  }

  // ---------- Menus ----------
  wireMenus() {
    const $ = (id) => document.getElementById(id);
    const story = $('story-text'); if (story) story.textContent = STORY_INTRO;
    const newBtn = $('btn-new'); if (newBtn) newBtn.onclick = () => { this.audio.ensure(); this.audio.click(); this.newGame(); };
    const contBtn = $('btn-continue');
    if (contBtn) {
      contBtn.style.display = this.saveData && this.saveData.completedMissions > 0 ? '' : 'none';
      contBtn.onclick = () => { this.audio.ensure(); this.audio.click(); this.continueGame(); };
    }
    const helpBtn = $('btn-help'); if (helpBtn) helpBtn.onclick = () => { this.audio.click(); $('help').classList.remove('hidden'); };
    const helpClose = $('btn-help-close'); if (helpClose) helpClose.onclick = () => { this.audio.click(); $('help').classList.add('hidden'); };
    const muteBtn = $('btn-mute'); if (muteBtn) muteBtn.onclick = () => { this.toggleMute(); muteBtn.textContent = this.audio.muted ? 'Sound: Off' : 'Sound: On'; };
    const resumeBtn = $('btn-resume'); if (resumeBtn) resumeBtn.onclick = () => { this.audio.click(); this.resume(); };
    const restartBtn = $('btn-restart'); if (restartBtn) restartBtn.onclick = () => { this.audio.click(); this.restartMission(); };
    const quitBtn = $('btn-quit'); if (quitBtn) quitBtn.onclick = () => { this.audio.click(); this.saveGame(); this.showMenu(); };
    const briefBtn = $('btn-start-mission'); if (briefBtn) briefBtn.onclick = () => { this.audio.click(); this.confirmMission(); };
    const nextBtn = $('btn-next-mission'); if (nextBtn) nextBtn.onclick = () => { this.audio.click(); this.afterMission(); };
    const retryBtn = $('btn-retry'); if (retryBtn) retryBtn.onclick = () => { this.audio.click(); this.retryAfterOver(); };
    const freeBtn = $('btn-freeroam'); if (freeBtn) freeBtn.onclick = () => { this.audio.click(); this.hideAllOverlays(); this.state = 'playing'; };
  }

  hideAllOverlays() {
    for (const id of ['menu', 'pause', 'briefing', 'complete', 'gameover', 'ending', 'help']) {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    }
  }

  showMenu() {
    this.state = 'menu';
    this.hideAllOverlays();
    const el = document.getElementById('menu');
    if (el) el.classList.remove('hidden');
    const cont = document.getElementById('btn-continue');
    if (cont) cont.style.display = this.saveData && this.saveData.completedMissions > 0 ? '' : 'none';
  }

  newGame() {
    this.saveData = { completedMissions: 0, money: TUNE.moneyStart };
    this.player = new Player(PLACES.safehouse.x, PLACES.safehouse.y);
    this.cops = []; this.thugs = []; this.bullets = [];
    this.missions = new MissionEngine(this);
    this.audio.startMusic();
    this.showBriefing(0);
  }

  continueGame() {
    this.player.money = this.saveData.money || TUNE.moneyStart;
    this.player.x = PLACES.safehouse.x; this.player.y = PLACES.safehouse.y;
    this.audio.startMusic();
    if (this.saveData.completedMissions < MISSIONS.length) this.showBriefing(this.saveData.completedMissions);
    else { this.hideAllOverlays(); this.state = 'playing'; this.toast('Free roam — the debt is paid'); }
  }

  showBriefing(index) {
    this.state = 'briefing';
    this.hideAllOverlays();
    const m = MISSIONS[index];
    const t = document.getElementById('briefing-title'); if (t) t.textContent = m.title;
    const b = document.getElementById('briefing-text'); if (b) b.textContent = m.briefing;
    const r = document.getElementById('briefing-reward'); if (r) r.textContent = 'Reward: $' + m.reward.toLocaleString('en-US');
    const el = document.getElementById('briefing');
    if (el) el.classList.remove('hidden');
    this.pendingMission = index;
  }

  confirmMission() {
    this.hideAllOverlays();
    this.state = 'playing';
    this.missions.start(this.pendingMission);
  }

  onMissionComplete(m) {
    this.state = 'complete';
    this.hideAllOverlays();
    const t = document.getElementById('complete-title'); if (t) t.textContent = m.title + ' — done';
    const b = document.getElementById('complete-text');
    if (b) b.textContent = 'Reward $' + m.reward.toLocaleString('en-US') + '. Total: $' + this.player.money.toLocaleString('en-US') + '.';
    const el = document.getElementById('complete');
    if (el) el.classList.remove('hidden');
    this.saveGame();
  }

  afterMission() {
    const next = this.missions.index + 1;
    if (next < MISSIONS.length) this.showBriefing(next);
    else {
      this.state = 'ending';
      this.hideAllOverlays();
      const el = document.getElementById('ending');
      if (el) el.classList.remove('hidden');
    }
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.hideAllOverlays();
    const el = document.getElementById('pause');
    if (el) el.classList.remove('hidden');
  }

  resume() { this.hideAllOverlays(); this.state = 'playing'; }

  restartMission() {
    this.hideAllOverlays();
    this.cops = []; this.thugs = [];
    this.setWanted(0);
    this.player.health = TUNE.playerHealth;
    this.player.x = PLACES.safehouse.x; this.player.y = PLACES.safehouse.y;
    if (this.player.car) { this.player.car.driver = null; this.player.car = null; }
    this.state = 'playing';
    if (this.missions.current) this.missions.start(this.missions.index);
  }

  retryAfterOver() {
    this.hideAllOverlays();
    this.setWanted(0);
    this.cops = [];
    this.player.health = TUNE.playerHealth;
    this.player.x = PLACES.hospital.x; this.player.y = PLACES.hospital.y + 60;
    if (this.player.car) { this.player.car.driver = null; this.player.car = null; }
    this.state = 'playing';
  }

  toggleMute() { this.audio.ensure(); this.audio.setMuted(!this.audio.muted); }

  // ---------- Wanted / police ----------
  addWanted(n, reason) {
    const p = this.player;
    const now = performance.now() / 1000;
    if (now - (p.lastCrimeAt || 0) < 1.5 && reason) return; // throttle spam
    p.lastCrimeAt = now;
    this.setWanted(Math.min(TUNE.wantedMax, p.wanted + n));
    if (n > 0) this.toast('Wanted level ' + p.wanted + (reason ? ' — ' + reason : ''));
  }

  setWanted(n) {
    this.player.wanted = clamp(n, 0, TUNE.wantedMax);
    this.wantedTimer = 0;
  }

  maintainPolice(dt) {
    const p = this.player;
    this.policeTimer -= dt;
    if (this.policeTimer > 0) return;
    this.policeTimer = 0.8;
    if (p.wanted <= 0) {
      // Stand down: cops drive away and despawn.
      for (const c of this.cars) if (c.driver === 'police') c.driver = 'traffic';
      this.cops = [];
      return;
    }
    const wantCars = Math.min(p.wanted + 1, 5);
    const haveCars = this.cars.filter((c) => c.driver === 'police' && !c.dead).length;
    if (haveCars < wantCars) {
      const pt = randomRoadPoint(this.rng);
      // Spawn on a road 500-800 units from the player.
      const dx = pt.x - p.x, dy = pt.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const sx = p.x + (dx / d) * 650, sy = p.y + (dy / d) * 650;
      const car = new Car('police', clamp(sx, 80, WORLD_W - 80), clamp(sy, 80, WORLD_H - 80), Math.atan2(p.y - sy, p.x - sx), '#e8e8f0');
      car.driver = 'police';
      car.speed = 300;
      this.cars.push(car);
    }
    if (!p.car) {
      const wantFoot = Math.min(p.wanted, 3);
      if (this.cops.length < wantFoot) {
        const pt = randomSidewalkPoint(this.rng, p.x, p.y, 420);
        this.cops.push(new Cop(pt.x, pt.y));
      }
    }
    // Despawn far police.
    this.cars = this.cars.filter((c) => !(c.driver === 'police' && dist(c.x, c.y, p.x, p.y) > 1400));
    this.cops = this.cops.filter((c) => dist(c.x, c.y, p.x, p.y) < 1200);
    // Siren when a cop car is near.
    const near = this.cars.some((c) => c.driver === 'police' && dist(c.x, c.y, p.x, p.y) < 750);
    this.audio.siren(near && p.wanted > 0);
  }

  // ---------- Cars ----------
  nearestCar(x, y, radius) {
    let best = null, bd = radius * radius;
    for (const c of this.cars) {
      if (c.dead || c.driver === 'police') continue;
      const d = (c.x - x) ** 2 + (c.y - y) ** 2;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  enterCar(car, silent) {
    const p = this.player;
    if (car.driver === 'traffic') {
      // Pull the driver out — they flee on foot.
      const drv = new Ped(car.x + 30, car.y + 30, this.rng);
      drv.state = 'flee'; drv.fleeX = car.x + 300; drv.fleeY = car.y + 300;
      this.peds.push(drv);
      const copNear = this.cops.length > 0 || this.cars.some((c) => c.driver === 'police' && dist(c.x, c.y, p.x, p.y) < 600);
      if (copNear) this.addWanted(1, 'carjacking');
      else if (!silent) this.toast('Car stolen — keep it quiet');
    } else if (car.type === 'police') {
      this.addWanted(2, 'stole a police car');
    }
    car.driver = 'player';
    p.car = car;
    p.x = car.x; p.y = car.y;
    if (!silent) this.audio.click();
  }

  exitCar() {
    const p = this.player;
    const car = p.car;
    if (!car) return;
    car.driver = null;
    car.speed *= 0.4;
    p.car = null;
    p.x = car.x - Math.sin(car.angle) * 34;
    p.y = car.y + Math.cos(car.angle) * 34;
    p.angle = car.angle;
  }

  ejectPlayer() {
    const p = this.player;
    if (!p.car) return;
    const car = p.car;
    car.driver = null;
    p.car = null;
    p.x = car.x + 40; p.y = car.y + 40;
    p.hurt(20, this);
  }

  // ---------- Combat ----------
  playerPunch() {
    const p = this.player;
    p.punchCooldown = TUNE.punchCooldown;
    p.punchTimer = 0.22;
    this.audio.punch();
    const targets = [...this.thugs, ...this.cops, ...this.peds];
    for (const t of targets) {
      if (t.dead || t.state === 'down') continue;
      const d = dist(p.x, p.y, t.x, t.y);
      if (d > TUNE.punchRange + 12) continue;
      const a = Math.atan2(t.y - p.y, t.x - p.x);
      let diff = Math.abs(a - p.angle);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff > TUNE.punchArc) continue;
      t.health -= TUNE.punchDamage;
      t.x += Math.cos(a) * 18; t.y += Math.sin(a) * 18;
      this.sparks(t.x, t.y, 5);
      if (this.thugs.includes(t)) {
        if (t.health <= 0) { t.dead = true; this.onThugDown(t); }
      } else if (this.cops.includes(t)) {
        if (!t.hitCounted) { t.hitCounted = true; this.addWanted(1, 'assaulted an officer'); }
        if (t.health <= 0) { t.dead = true; this.addWanted(2, 'cop down'); }
        this.cops = this.cops.filter((c) => !c.dead);
      } else {
        t.state = 'down'; t.downTimer = 4;
        this.addWanted(1, 'assaulted a pedestrian');
        scarePeds(this, t.x, t.y, 260);
      }
      break; // one target per swing
    }
  }

  playerShoot() {
    const p = this.player;
    if (p.ammo <= 0) { this.audio.denied(); this.toast('Out of ammo'); p.weapon = 'fists'; return; }
    p.ammo--;
    p.shootCooldown = TUNE.pistolCooldown;
    const wx = this.cam.x + this.input.mouseX, wy = this.cam.y + this.input.mouseY;
    const a = Math.atan2(wy - p.y, wx - p.x);
    p.angle = a;
    spawnBullet(this, p.x + Math.cos(a) * 18, p.y + Math.sin(a) * 18, a, 'player');
    this.audio.gunshot();
    this.particles.burst(p.x + Math.cos(a) * 22, p.y + Math.sin(a) * 22, 3, '#ffe9a8', 60);
    scarePeds(this, p.x, p.y, 320);
    if (p.wanted === 0) this.addWanted(1, 'shots fired');
  }

  // ---------- Effects / events ----------
  toast(text) {
    this.toasts.push({ text, life: 3.2 });
    if (this.toasts.length > 3) this.toasts.shift();
  }
  sparks(x, y, n) { this.particles.burst(x, y, n, '#ffd23e', 140); }
  shake(n) { this.shakeAmt = Math.max(this.shakeAmt, n); }
  explode(x, y) {
    this.particles.burst(x, y, 26, '#ff7a2d', 260);
    this.particles.burst(x, y, 14, '#555', 120);
    this.audio.crash();
    this.shake(10);
    scarePeds(this, x, y, 420);
  }

  busted() {
    if (this.state !== 'playing') return;
    this.state = 'over';
    this.audio.busted();
    this.audio.siren(false);
    this.audio.engine(0, false);
    const fine = Math.min(200, this.player.money);
    this.player.money -= fine;
    this.hideAllOverlays();
    const t = document.getElementById('gameover-title'); if (t) t.textContent = 'BUSTED';
    const b = document.getElementById('gameover-text');
    if (b) b.textContent = 'The Solara PD caught up with you. Bail cost $' + fine + '. The job is not over — it never is.';
    const el = document.getElementById('gameover');
    if (el) el.classList.remove('hidden');
    this.saveGame();
  }

  wasted() {
    if (this.state !== 'playing') return;
    this.state = 'over';
    this.audio.busted();
    this.audio.siren(false);
    this.audio.engine(0, false);
    const fee = Math.min(500, this.player.money);
    this.player.money -= fee;
    this.hideAllOverlays();
    const t = document.getElementById('gameover-title'); if (t) t.textContent = 'WASTED';
    const b = document.getElementById('gameover-text');
    if (b) b.textContent = 'St. Marina patched you up for $' + fee + '. Solara Bay is still out there. So is the debt.';
    const el = document.getElementById('gameover');
    if (el) el.classList.remove('hidden');
    this.saveGame();
  }

  saveGame() {
    this.saveData = { completedMissions: this.missions.completedCount, money: this.player.money };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.saveData)); } catch (e) {}
  }

  clampCamera() {
    this.cam.x = clamp(this.cam.x, 0, WORLD_W - VIEW_W);
    this.cam.y = clamp(this.cam.y, 0, WORLD_H - VIEW_H);
  }

  // ---------- Frame ----------
  frame(now) {
    const dt = Math.min(0.05, (now - this.lastTime) / 1000 || 0.016);
    this.lastTime = now;
    const p = this.player;
    if (this.state === 'playing') {
      this.clockSeconds += dt * 12;
      if (this.input.hit('Escape')) { this.pause(); }
      else if (this.input.hit('m', 'M')) this.toggleMute();
      if (p.car) p.updateDriving(dt, this);
      else p.updateOnFoot(dt, this);
      // Wanted decay: quiet for a while and no cop nearby, heat drops.
      if (p.wanted > 0) {
        this.wantedTimer += dt;
        const copNear = this.cops.length > 0 || this.cars.some((c) => c.driver === 'police' && dist(c.x, c.y, p.x, p.y) < 600);
        if (!copNear && this.wantedTimer > TUNE.wantedDecayDelay) {
          this.wantedTimer = 0;
          this.setWanted(p.wanted - 1);
          this.toast('Heat cooling off — wanted ' + p.wanted);
        }
      }
      if (!this.shotMode) this.maintainPolice(dt);
      for (const c of this.cars) if (!c.dead) updateCar(c, dt, this);
      this.cars = this.cars.filter((c) => !c.dead || c.driver === 'player');
      for (const pd of this.peds) updatePed(pd, dt, this);
      for (const cp of this.cops) updateCop(cp, dt, this);
      // Thugs chase and swing at the player (slow advance in staged shots).
      for (const t of this.thugs) {
        if (t.dead) continue;
        const d = dist(t.x, t.y, p.x, p.y);
        const chase = t.speed * (this.shotMode ? 0.3 : 1);
        if (d < 520 && !p.car) {
          const a = angleTo(t.x, t.y, p.x, p.y);
          t.angle = a;
          if (d > 26) { t.x += Math.cos(a) * chase * dt; t.y += Math.sin(a) * chase * dt; }
          else {
            t.punchTimer -= dt;
            if (t.punchTimer <= 0) { t.punchTimer = 1.0; p.hurt(8, this); this.sparks(p.x, p.y, 4); }
          }
        } else if (d < 520 && p.car) {
          // Thugs scatter from cars.
          const a = angleTo(p.x, p.y, t.x, t.y);
          t.x += Math.cos(a) * t.speed * dt; t.y += Math.sin(a) * t.speed * dt;
        }
      }
      this.thugs = this.thugs.filter((t) => !t.dead);
      updateBullets(this, dt);
      this.missions.update(dt);
      // Keep traffic and pedestrians populated near the player (not in shots).
      if (!this.shotMode) {
        const traffic = this.cars.filter((c) => c.driver === 'traffic').length;
        if (traffic < TUNE.trafficCount) {
          const pt = randomRoadPoint(this.rng);
          if (dist(pt.x, pt.y, p.x, p.y) > 380 && dist(pt.x, pt.y, p.x, p.y) < 950) {
            const type = this.rng.pick(['sedan', 'taxi', 'sport', 'truck', 'van']);
            const car = new Car(type, pt.x, pt.y, this.rng.range(0, Math.PI * 2), CAR_TYPES[type].colors[0]);
            car.driver = 'traffic'; car.speed = CAR_TYPES[type].top * 0.4;
            this.cars.push(car);
          }
        }
        if (this.peds.length < TUNE.pedCount && Math.random() < 0.2) this.spawnPedsNear(p.x, p.y, 1);
      }
      // Skid marks while handbraking hard.
      if (p.car && this.input.down(' ') && Math.abs(p.car.speed) > 150) {
        const c = p.car;
        this.particles.skid(c.x - Math.cos(c.angle) * 18, c.y - Math.sin(c.angle) * 18, c.x - Math.cos(c.angle) * 24, c.y - Math.sin(c.angle) * 24);
      }
      // Camera follows the player.
      this.cam.x = clamp(p.x - VIEW_W / 2, 0, WORLD_W - VIEW_W);
      this.cam.y = clamp(p.y - VIEW_H / 2, 0, WORLD_H - VIEW_H);
      this.particles.update(dt);
      for (const t of this.toasts) t.life -= dt;
      this.toasts = this.toasts.filter((t) => t.life > 0);
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 26);
      this.audio.engine(p.car ? clamp(Math.abs(p.car.speed) / p.car.def.top, 0, 1) : 0, !!p.car);
    } else if (this.state === 'menu') {
      // Slow drift behind the menu so the city is visible.
      this.cam.x = clamp(700 + Math.sin(performance.now() / 9000) * 500, 0, WORLD_W - VIEW_W);
      this.cam.y = clamp(500 + Math.cos(performance.now() / 11000) * 300, 0, WORLD_H - VIEW_H);
      this.particles.update(dt);
    }
    this.renderer.draw(this);
    this.input.endFrame();
  }
}
