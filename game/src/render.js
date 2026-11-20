// Drawing only: the world's state and the current screen in, pixels out. A camera follows
// the player through the city; the HUD, minimap, wanted stars and mission banner are drawn in
// screen space on top. Flat shapes and canvas text, no images, no network.
import { ROAD_EVERY, ROAD_WIDTH, WORLD } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_WIN = 'win';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const ROADS = [];
for (let v = 200; v <= 3000; v += ROAD_EVERY) ROADS.push(v);

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  let viewW = 0;
  let viewH = 0;
  let camX = 0;
  let camY = 0;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    canvas.width = Math.round(viewW * ratio);
    canvas.height = Math.round(viewH * ratio);
    canvas.style.width = `${viewW}px`;
    canvas.style.height = `${viewH}px`;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, weight) {
    const key = `${weight || ''}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight ? '700 ' : ''}${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function darknessAt(hour) {
    if (hour >= 7 && hour < 17) return 0;
    if (hour >= 17 && hour < 19.5) return (hour - 17) / 2.5 * 0.28;
    if (hour >= 19.5 || hour < 5) return 0.42;
    if (hour >= 5 && hour < 7) return (7 - hour) / 2 * 0.42;
    return 0;
  }

  function drawWorld(state) {
    const p = state.player;
    camX = clamp(p.x - viewW / 2, 0, WORLD - viewW);
    camY = clamp(p.y - viewH / 2, 0, WORLD - viewH);
    if (WORLD < viewW) camX = (WORLD - viewW) / 2;
    if (WORLD < viewH) camY = (WORLD - viewH) / 2;
    context.save();
    context.translate(-camX, -camY);

    // Water around the island, then the ground.
    context.fillStyle = '#1d6fb8';
    context.fillRect(camX - 80, camY - 80, viewW + 160, viewH + 160);
    context.fillStyle = '#3f7d4e';
    context.fillRect(0, 0, WORLD, WORLD);
    // Beach along the south edge.
    context.fillStyle = '#e0c98f';
    context.fillRect(0, 3040, WORLD, 160);

    // Parks.
    for (const park of state.parks) {
      context.fillStyle = '#2e8b47';
      context.fillRect(park.x, park.y, park.w, park.h);
    }
    // Roads: asphalt, then sidewalks as pale borders, then lane dashes.
    for (const r of ROADS) {
      context.fillStyle = '#3a3f4a';
      context.fillRect(r - ROAD_WIDTH / 2, 0, ROAD_WIDTH, WORLD);
      context.fillRect(0, r - ROAD_WIDTH / 2, WORLD, ROAD_WIDTH);
    }
    for (const r of ROADS) {
      context.fillStyle = '#565d6b';
      context.fillRect(r - ROAD_WIDTH / 2, 0, 10, WORLD);
      context.fillRect(r + ROAD_WIDTH / 2 - 10, 0, 10, WORLD);
      context.fillRect(0, r - ROAD_WIDTH / 2, WORLD, 10);
      context.fillRect(0, r + ROAD_WIDTH / 2 - 10, WORLD, 10);
    }
    context.strokeStyle = '#f2c94c';
    context.lineWidth = 3;
    context.setLineDash([26, 30]);
    context.beginPath();
    for (const r of ROADS) {
      context.moveTo(r, 0);
      context.lineTo(r, WORLD);
      context.moveTo(0, r);
      context.lineTo(WORLD, r);
    }
    context.stroke();
    context.setLineDash([]);

    // Trees.
    for (const t of state.trees) {
      context.fillStyle = '#1f6b34';
      context.beginPath();
      context.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#2fa055';
      context.beginPath();
      context.arc(t.x - 3, t.y - 3, t.r * 0.6, 0, Math.PI * 2);
      context.fill();
    }

    // Buildings: shadow offset by height, body, roof inset.
    for (const b of state.buildings) {
      context.fillStyle = 'rgba(0,0,0,0.30)';
      context.fillRect(b.x + b.height * 0.45, b.y + b.height * 0.55, b.w, b.h);
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.fillStyle = b.roof;
      context.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      context.fillStyle = 'rgba(255,255,255,0.10)';
      context.fillRect(b.x, b.y, b.w, 4);
    }

    // Pickups.
    for (const pk of state.pickups) {
      const bob = Math.sin(pk.bob) * 2;
      if (pk.kind === 'cash') {
        context.fillStyle = '#2e7d32';
        roundRect(pk.x - 11, pk.y - 7 + bob, 22, 14, 3);
        context.fill();
        context.fillStyle = '#fdd835';
        text('$', pk.x, pk.y + 4 + bob, 12, '#fdd835', 'center', true);
      } else {
        context.fillStyle = '#f5f5f5';
        roundRect(pk.x - 10, pk.y - 10 + bob, 20, 20, 4);
        context.fill();
        context.fillStyle = '#e53935';
        context.fillRect(pk.x - 2, pk.y - 7 + bob, 4, 14);
        context.fillRect(pk.x - 7, pk.y - 2 + bob, 14, 4);
      }
    }

    // Cars.
    for (const car of state.cars) {
      drawCar(car);
    }

    // Pedestrians.
    for (const ped of state.peds) {
      context.save();
      context.translate(ped.x, ped.y);
      if (ped.state === 'down') {
        context.fillStyle = ped.color;
        context.beginPath();
        context.ellipse(0, 0, 13, 6, ped.angle, 0, Math.PI * 2);
        context.fill();
      } else {
        context.rotate(ped.angle);
        context.fillStyle = ped.kind === 'rival' ? '#b71c1c' : ped.color;
        context.beginPath();
        context.arc(0, 0, 9, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#212121';
        context.beginPath();
        context.arc(6, 0, 4, 0, Math.PI * 2);
        context.fill();
        if (ped.kind === 'rival') {
          context.strokeStyle = '#ff5252';
          context.lineWidth = 2;
          context.beginPath();
          context.arc(0, 0, 13, 0, Math.PI * 2);
          context.stroke();
        }
      }
      context.restore();
    }

    // Player on foot (when not driving, the driven car already shows them).
    if (!p.car) {
      context.save();
      context.translate(p.x, p.y);
      context.rotate(p.angle);
      context.fillStyle = '#4fc3f7';
      context.beginPath();
      context.arc(0, 0, 12, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#0d47a1';
      context.beginPath();
      context.arc(7, 0, 5, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#e1f5fe';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(0, 0, 15, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }

    // Bullets.
    context.fillStyle = '#ffeb3b';
    for (const b of state.bullets) {
      context.beginPath();
      context.arc(b.x, b.y, 3, 0, Math.PI * 2);
      context.fill();
    }

    // Particles.
    for (const pt of state.particles) {
      context.globalAlpha = Math.max(0, pt.life * 1.6);
      context.fillStyle = pt.color;
      context.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    context.globalAlpha = 1;

    // Waypoint marker for the active mission.
    const m = state.mission;
    if (m && m.targetX !== undefined && (m.kind === 'goto' || m.kind === 'eliminate')) {
      const pulse = 1 + Math.sin(state.elapsed * 5) * 0.15;
      context.save();
      context.translate(m.targetX, m.targetY);
      context.rotate(Math.PI / 4);
      context.fillStyle = '#ffea00';
      context.strokeStyle = '#212121';
      context.lineWidth = 2;
      const s = 13 * pulse;
      context.fillRect(-s / 2, -s / 2, s, s);
      context.strokeRect(-s / 2, -s / 2, s, s);
      context.restore();
    }

    context.restore();

    // Night: darken the world, then punch a circle of light around the player.
    const dark = darknessAt(state.timeOfDay);
    if (dark > 0.02) {
      context.fillStyle = `rgba(8,10,38,${dark})`;
      context.fillRect(0, 0, viewW, viewH);
      const sx = p.x - camX;
      const sy = p.y - camY;
      const grad = context.createRadialGradient(sx, sy, 60, sx, sy, 320);
      grad.addColorStop(0, 'rgba(8,10,38,0)');
      grad.addColorStop(1, `rgba(8,10,38,${dark})`);
      context.fillStyle = grad;
      context.fillRect(0, 0, viewW, viewH);
    }
  }

  function drawCar(car) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    const wrecked = car.wrecked;
    context.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(-19, -11 + 4, 38, 22, 6);
    context.fill();
    context.fillStyle = wrecked ? '#424242' : car.color;
    roundRect(-20, -11, 40, 22, 6);
    context.fill();
    if (car.kind === 'cop') {
      context.fillStyle = '#f5f5f5';
      context.fillRect(-4, -11, 10, 22);
      const flash = Math.floor(performance.now() / 260) % 2 === 0;
      context.fillStyle = flash ? '#ff1744' : '#2979ff';
      context.fillRect(-8, -9, 5, 5);
      context.fillStyle = flash ? '#2979ff' : '#ff1744';
      context.fillRect(-8, 4, 5, 5);
    }
    context.fillStyle = wrecked ? '#212121' : '#263238';
    roundRect(-2, -8, 12, 16, 3);
    context.fill();
    context.fillStyle = '#eceff1';
    context.fillRect(18, -8, 2, 4);
    context.fillRect(18, 4, 2, 4);
    if (car.driven) {
      context.strokeStyle = '#ffea00';
      context.lineWidth = 2;
      roundRect(-23, -14, 46, 28, 8);
      context.stroke();
    }
    context.restore();
  }

  function drawHud(state, ui) {
    const p = state.player;
    // Top-left: cash, health, wanted stars.
    context.textBaseline = 'alphabetic';
    text(`$${state.cash}`, 20, 40, 30, '#aeea00', 'left', true);
    context.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(20, 52, 210, 16, 8);
    context.fill();
    context.fillStyle = p.health > 50 ? '#66bb6a' : p.health > 25 ? '#ffa726' : '#ef5350';
    roundRect(22, 54, 206 * Math.max(0, p.health / 100), 12, 6);
    context.fill();
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += i < state.wanted ? '★' : '☆';
    text(stars, 20, 102, 30, '#ffd54f', 'left', true);

    // Top-right: minimap.
    const mm = 168;
    const mx = viewW - mm - 16;
    const my = 16;
    const scale = mm / WORLD;
    context.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(mx - 4, my - 4, mm + 8, mm + 8, 6);
    context.fill();
    context.save();
    context.beginPath();
    context.rect(mx, my, mm, mm);
    context.clip();
    context.fillStyle = '#3f7d4e';
    context.fillRect(mx, my, mm, mm);
    context.strokeStyle = '#3a3f4a';
    context.lineWidth = 3;
    for (const r of ROADS) {
      context.beginPath();
      context.moveTo(mx + r * scale, my);
      context.lineTo(mx + r * scale, my + mm);
      context.moveTo(mx, my + r * scale);
      context.lineTo(mx + mm, my + r * scale);
      context.stroke();
    }
    for (const b of state.buildings) {
      context.fillStyle = '#78909c';
      context.fillRect(mx + b.x * scale, my + b.y * scale, Math.max(1, b.w * scale), Math.max(1, b.h * scale));
    }
    const m = state.mission;
    if (m && m.targetX !== undefined && (m.kind === 'goto' || m.kind === 'eliminate')) {
      context.fillStyle = '#ffea00';
      context.beginPath();
      context.arc(mx + m.targetX * scale, my + m.targetY * scale, 5, 0, Math.PI * 2);
      context.fill();
    }
    for (const car of state.cars) {
      if (car.kind !== 'cop') continue;
      context.fillStyle = '#2979ff';
      context.beginPath();
      context.arc(mx + car.x * scale, my + car.y * scale, 3, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = '#4fc3f7';
    context.beginPath();
    context.arc(mx + p.x * scale, my + p.y * scale, 4, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#ffffff';
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(mx + p.x * scale, my + p.y * scale, 6, 0, Math.PI * 2);
    context.stroke();
    context.restore();
    // Clock under the minimap.
    const hour = Math.floor(state.timeOfDay);
    const min = Math.floor((state.timeOfDay - hour) * 60);
    text(`${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`, viewW - 16, my + mm + 26, 18, '#eef1f5', 'right', true);

    // Bottom-left: current mission.
    if (m) {
      context.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(16, viewH - 86, 480, 66, 8);
      context.fill();
      text(m.name, 30, viewH - 58, 18, '#ffea00', 'left', true);
      text(m.text, 30, viewH - 34, 15, '#eef1f5', 'left');
      if (m.kind === 'collect') text(`${state.missionCollected}/5`, 470, viewH - 58, 18, '#eef1f5', 'right', true);
      if (m.kind === 'survive') text(`${Math.floor(state.missionTimer)}s / 40s`, 470, viewH - 58, 18, '#eef1f5', 'right', true);
      if (m.timer > 0) text(`${Math.ceil(m.timer)}s left`, 470, viewH - 58, 18, '#ff8a65', 'right', true);
      if (m.kind === 'goto' || m.kind === 'eliminate') {
        const d = Math.round(Math.hypot(m.targetX - p.x, m.targetY - p.y));
        text(`${d}m`, 470, viewH - 34, 15, '#90caf9', 'right');
      }
    }

    // Bottom-right: speed while driving, controls hint otherwise.
    if (p.car) {
      text(`${Math.round(Math.abs(p.car.speed) * 0.45)} mph`, viewW - 20, viewH - 24, 26, '#eef1f5', 'right', true);
    } else {
      text('WASD move · E enter car · Space shoot · M missions · P pause', viewW - 20, viewH - 24, 14, '#b0bec5', 'right');
    }

    // Waypoint arrow at the screen edge when the target is off-screen.
    if (m && m.targetX !== undefined && (m.kind === 'goto' || m.kind === 'eliminate')) {
      const sx = m.targetX - camX;
      const sy = m.targetY - camY;
      if (sx < 0 || sx > viewW || sy < 0 || sy > viewH) {
        const cx = viewW / 2;
        const cy = viewH / 2;
        const a = Math.atan2(sy - cy, sx - cx);
        const ax = cx + Math.cos(a) * (Math.min(viewW, viewH) / 2 - 70);
        const ay = cy + Math.sin(a) * (Math.min(viewW, viewH) / 2 - 70);
        context.save();
        context.translate(ax, ay);
        context.rotate(a);
        context.fillStyle = '#ffea00';
        context.beginPath();
        context.moveTo(16, 0);
        context.lineTo(-10, -11);
        context.lineTo(-10, 11);
        context.closePath();
        context.fill();
        context.restore();
      }
    }

    // Announcement banner.
    if (state.messageTimer > 0) {
      context.globalAlpha = Math.min(1, state.messageTimer);
      text(state.message, viewW / 2, 140, 22, '#ffea00', 'center', true);
      context.globalAlpha = 1;
    }

    // Mission list overlay.
    if (ui.showMissions) {
      const lines = ui.missions;
      const h = 60 + lines.length * 30;
      context.fillStyle = 'rgba(0,0,0,0.75)';
      roundRect(viewW / 2 - 300, viewH / 2 - h / 2, 600, h, 10);
      context.fill();
      text('MISSIONS', viewW / 2, viewH / 2 - h / 2 + 36, 22, '#ffea00', 'center', true);
      lines.forEach((line, i) => {
        text(line, viewW / 2, viewH / 2 - h / 2 + 72 + i * 30, 16, i < state.missionIndex ? '#66bb6a' : i === state.missionIndex ? '#ffffff' : '#90a4ae', 'center');
      });
    }
  }

  function drawPanel(title, titleColor, lines, prompt) {
    context.fillStyle = 'rgba(0,0,0,0.72)';
    context.fillRect(0, 0, viewW, viewH);
    text(title, viewW / 2, viewH / 2 - 90, 64, titleColor, 'center', true);
    lines.forEach((line, i) => {
      text(line, viewW / 2, viewH / 2 - 20 + i * 30, 19, '#eef1f5', 'center');
    });
    text(prompt, viewW / 2, viewH / 2 + 60 + lines.length * 8, 20, '#ffea00', 'center', true);
  }

  /** Paint one frame: the world, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, ui) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    const ratio = window.devicePixelRatio || 1;
    context.scale(ratio, ratio);
    context.fillStyle = '#11141b';
    context.fillRect(0, 0, viewW, viewH);
    drawWorld(state);
    if (screen === SCREEN_TITLE) {
      context.fillStyle = 'rgba(0,0,0,0.45)';
      context.fillRect(0, 0, viewW, viewH);
      text('VICE CITY', viewW / 2, viewH / 2 - 150, 72, '#ffea00', 'center', true);
      text('NIGHTS', viewW / 2, viewH / 2 - 80, 72, '#4fc3f7', 'center', true);
      text('A tiny open-world crime saga — not affiliated with Rockstar Games', viewW / 2, viewH / 2 - 40, 16, '#b0bec5', 'center');
      const lines = [
        'Steal cars, outrun the Vice City PD, run missions, become Kingpin.',
        'WASD / arrows — move & drive · E — enter / exit car · Space / click — shoot',
        'Shift — sprint · M — missions · P — pause · N — new game',
        ui.hasSave ? `Save found: $${ui.saveCash} · ${ui.saveMissions} mission(s) done — Enter continues` : 'No save yet — Enter starts a new game',
      ];
      lines.forEach((line, i) => {
        text(line, viewW / 2, viewH / 2 + 10 + i * 28, 17, '#eef1f5', 'center');
      });
      text('Press Enter or click to play', viewW / 2, viewH / 2 + 140, 22, '#ffea00', 'center', true);
      return;
    }
    drawHud(state, ui);
    if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', '#eef1f5', ['The city waits for you.'], 'Press P or Enter to resume');
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('BUSTED', '#82b1ff', [`The Vice City PD got you. Cash kept: $${state.cash}.`, `Missions done: ${state.stats.missionsDone} of ${ui.missions.length}`], 'Press Enter to try again');
    } else if (screen === SCREEN_WASTED) {
      drawPanel('WASTED', '#ef5350', [`Vice City claims another one. Cash kept: $${state.cash}.`, `Missions done: ${state.stats.missionsDone} of ${ui.missions.length}`], 'Press Enter to try again');
    } else if (screen === SCREEN_WIN) {
      drawPanel('KINGPIN', '#ffea00', ['Every mission done. Vice City is yours.', `Final cash: $${state.cash} · Cars stolen: ${state.stats.carsStolen}`], 'Press Enter to keep playing');
    }
  }

  /** Where the camera is looking (top-left of the visible world rect), for mouse aiming. */
  function camera() {
    return { x: camX, y: camY };
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, camera };
}
