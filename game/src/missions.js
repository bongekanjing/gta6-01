// Solara Bay — missions and story: a five-job chain that pays off Marco's debt.
// The engine tracks the current step, its marker, and completion; main.js owns
// the panels (briefing / complete / ending) that talk to the player.
import { MISSIONS } from './config.js';
import { dist } from './random.js';

export class MissionEngine {
  constructor(game) {
    this.game = game;
    this.index = -1; // -1: no mission active (free roam between jobs)
    this.step = 0;
    this.defeated = 0;
    this.carrying = null; // 'package' | 'ledger' | 'cash' | null
    this.done = false;
  }

  get current() { return this.index >= 0 && this.index < MISSIONS.length ? MISSIONS[this.index] : null; }
  get stepDef() {
    const m = this.current;
    return m && this.step < m.steps.length ? m.steps[this.step] : null;
  }

  get completedCount() { return this.game.saveData.completedMissions || 0; }

  start(index) {
    const game = this.game;
    this.index = index;
    this.step = 0;
    this.defeated = 0;
    this.carrying = null;
    this.done = false;
    const m = this.current;
    if (!m) return;
    if (m.startWanted) game.setWanted(m.startWanted);
    if (m.startAmmo) { game.player.ammo += m.startAmmo; game.player.weapon = 'pistol'; }
    if (m.spawnThugs) game.spawnThugs(m.spawnThugs);
    game.audio.missionDone();
    game.toast(m.title + ' — started');
  }

  abort() { this.index = -1; this.step = 0; this.carrying = null; }

  // The objective label shown in the HUD, with live progress.
  objectiveText() {
    const s = this.stepDef;
    if (!s) return this.current ? 'Mission complete — head back' : 'Free roam — visit Mama Lou to start the next job';
    if (s.kind === 'defeat') return s.label.replace('(0/4)', `(${this.defeated}/${s.count})`);
    return s.label;
  }

  // The marker the HUD and minimap point at, or null.
  marker() {
    const s = this.stepDef;
    if (!s) return null;
    if (s.kind === 'defeat') {
      const t = this.game.thugs.find((t) => !t.dead);
      return t ? { x: t.x, y: t.y } : null;
    }
    if (s.kind === 'escape') return { x: s.x, y: s.y };
    if (s.kind === 'enterCar') return null;
    return { x: s.x, y: s.y, r: s.r };
  }

  // Distance to the current objective, for the HUD.
  distanceToObjective() {
    const m = this.marker();
    if (!m) return null;
    return Math.round(dist(this.game.player.x, this.game.player.y, m.x, m.y));
  }

  nextStep() {
    this.step++;
    const m = this.current;
    if (!m) return;
    if (this.step >= m.steps.length) this.complete();
    else {
      const s = this.stepDef;
      this.game.toast(s.label);
      if (s.kind === 'defeat') this.game.audio.gunshot();
    }
  }

  complete() {
    const game = this.game;
    const m = this.current;
    game.player.money += m.reward;
    game.saveData.completedMissions = this.index + 1;
    game.saveData.money = game.player.money;
    game.audio.missionDone();
    this.done = true;
    game.onMissionComplete(m);
  }

  // Called every frame while a mission is active.
  update(dt) {
    const game = this.game;
    const m = this.current;
    if (!m || this.done) return;
    const s = this.stepDef;
    if (!s) return;
    const p = game.player;
    switch (s.kind) {
      case 'enterCar':
        if (p.car) this.nextStep();
        break;
      case 'goto':
        if (dist(p.x, p.y, s.x, s.y) < s.r) this.nextStep();
        break;
      case 'driveTo':
        if (p.car && dist(p.x, p.y, s.x, s.y) < s.r) this.nextStep();
        break;
      case 'collect': {
        if (dist(p.x, p.y, s.x, s.y) < s.r && !p.car) {
          this.carrying = m.id === 'pickup' ? 'package' : m.id === 'payback' ? 'ledger' : 'cash';
          if (m.vaultAlarm) { game.setWanted(4); game.toast('ALARM TRIPPED — run!'); game.audio.busted(); }
          game.audio.pickup();
          this.nextStep();
        }
        break;
      }
      case 'defeat':
        if (this.defeated >= s.count) this.nextStep();
        break;
      case 'escape': {
        const atSafe = dist(p.x, p.y, s.x, s.y) < s.r;
        if (atSafe || p.wanted === 0) this.nextStep();
        break;
      }
      case 'deliver':
        if (dist(p.x, p.y, s.x, s.y) < s.r) {
          this.carrying = null;
          this.nextStep();
        }
        break;
    }
  }
}
