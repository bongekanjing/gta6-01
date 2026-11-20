// Solara Bay — rendering: the city, the people and cars in it, particles,
// the HUD (objective, wanted stars, minimap, health, money) and the lighting.
import { VIEW_W, VIEW_H, WORLD_W, WORLD_H, ROAD_W, ROAD_XS, ROAD_YS, BEACH_Y, SEA_Y, PALETTE, PLACES, TUNE } from './config.js';
import { clamp, lerp, fmtMoney, fmtClock } from './random.js';

// ---------- Particles ----------
export class Particles {
  constructor() { this.list = []; this.skids = []; }
  add(x, y, vx, vy, life, color, size) {
    if (this.list.length > 400) this.list.shift();
    this.list.push({ x, y, vx, vy, life, max: life, color, size });
  }
  burst(x, y, n, color, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.add(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.4 + Math.random() * 0.5, color, 2 + Math.random() * 3);
    }
  }
  skid(x1, y1, x2, y2) {
    this.skids.push({ x1, y1, x2, y2, life: 2.5 });
    if (this.skids.length > 120) this.skids.shift();
  }
  update(dt) {
    for (const p of this.list) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; p.life -= dt; }
    this.list = this.list.filter((p) => p.life > 0);
    for (const s of this.skids) s.life -= dt;
    this.skids = this.skids.filter((s) => s.life > 0);
  }
  draw(ctx) {
    ctx.save();
    for (const s of this.skids) {
      ctx.globalAlpha = Math.min(0.5, s.life * 0.25);
      ctx.strokeStyle = '#1c1c20'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
    }
    for (const p of this.list) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

// ---------- Renderer ----------
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.time = 0;
  }

  draw(game) {
    const ctx = this.ctx;
    this.time += 1 / 60;
    ctx.save();
    const shake = game.shakeAmt || 0;
    ctx.translate(-game.cam.x + (shake ? (Math.random() - 0.5) * shake : 0),
      -game.cam.y + (shake ? (Math.random() - 0.5) * shake : 0));
    this.drawGround(ctx, game);
    this.drawRoads(ctx, game);
    this.drawBuildings(ctx, game);
    this.drawProps(ctx, game);
    this.drawMarker(ctx, game);
    this.drawEntities(ctx, game);
    game.particles.draw(ctx);
    this.drawBullets(ctx, game);
    ctx.restore();
    this.drawLighting(ctx, game);
    this.drawHUD(ctx, game);
  }

  drawGround(ctx, game) {
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(game.cam.x - 20, game.cam.y - 20, VIEW_W + 40, VIEW_H + 40);
    // Beach and sea along the south edge.
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(game.cam.x - 20, BEACH_Y, VIEW_W + 40, SEA_Y - BEACH_Y);
    ctx.fillStyle = PALETTE.sea;
    ctx.fillRect(game.cam.x - 20, SEA_Y, VIEW_W + 40, WORLD_H - SEA_Y + 40);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let i = 0; i < 5; i++) {
      const y = SEA_Y + 14 + i * 16;
      const off = Math.sin(this.time * 0.8 + i * 1.7) * 8;
      ctx.fillRect(game.cam.x + ((i * 317 + off) % (VIEW_W + 120)) - 60, y, 90, 2);
    }
    // Parks.
    for (const pk of game.city.parks) {
      ctx.fillStyle = '#5d9448';
      ctx.fillRect(pk.x, pk.y, pk.w, pk.h);
    }
  }

  drawRoads(ctx, game) {
    // Sidewalks first, then asphalt, then markings.
    ctx.fillStyle = PALETTE.sidewalk;
    for (const rx of ROAD_XS) ctx.fillRect(rx - ROAD_W / 2 - 14, game.cam.y - 20, ROAD_W + 28, VIEW_H + 40);
    for (const ry of ROAD_YS) ctx.fillRect(game.cam.x - 20, ry - ROAD_W / 2 - 14, VIEW_W + 40, ROAD_W + 28);
    ctx.fillStyle = PALETTE.road;
    for (const rx of ROAD_XS) ctx.fillRect(rx - ROAD_W / 2, game.cam.y - 20, ROAD_W, VIEW_H + 40);
    for (const ry of ROAD_YS) ctx.fillRect(game.cam.x - 20, ry - ROAD_W / 2, VIEW_W + 40, ROAD_W);
    // Centre dashes.
    ctx.fillStyle = PALETTE.lane;
    const dash = 26, gap = 30;
    for (const rx of ROAD_XS) {
      for (let y = Math.floor((game.cam.y - 20) / (dash + gap)) * (dash + gap); y < game.cam.y + VIEW_H + 20; y += dash + gap) {
        ctx.fillRect(rx - 2, y, 4, dash);
      }
    }
    for (const ry of ROAD_YS) {
      for (let x = Math.floor((game.cam.x - 20) / (dash + gap)) * (dash + gap); x < game.cam.x + VIEW_W + 20; x += dash + gap) {
        ctx.fillRect(x, ry - 2, dash, 4);
      }
    }
    // Crosswalk stripes at intersections.
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (const rx of ROAD_XS) for (const ry of ROAD_YS) {
      for (let i = -3; i <= 3; i++) ctx.fillRect(rx + i * 11 - 3, ry - ROAD_W / 2 - 12, 6, 10);
    }
  }

  drawBuildings(ctx, game) {
    for (const b of game.city.buildings) {
      if (b.x > game.cam.x + VIEW_W + 40 || b.x + b.w < game.cam.x - 40 || b.y > game.cam.y + VIEW_H + 40 || b.y + b.h < game.cam.y - 40) continue;
      // Shadow.
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
      ctx.fillStyle = b.wall;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
      // Windows on the roof edge.
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      const cols = Math.floor(b.w / 26), rows = Math.floor(b.h / 26);
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        ctx.fillRect(b.x + 10 + i * 26, b.y + 10 + j * 26, 12, 9);
      }
      if (b.tall) {
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(b.x + b.w / 2 - 14, b.y + b.h / 2 - 14, 28, 28);
      }
      if (b.name) {
        ctx.fillStyle = 'rgba(20,20,28,0.85)';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(b.name, b.x + b.w / 2, b.y + b.h / 2 + 4);
      }
    }
  }

  drawProps(ctx, game) {
    for (const t of game.city.trees) {
      if (t.x < game.cam.x - 30 || t.x > game.cam.x + VIEW_W + 30 || t.y < game.cam.y - 30 || t.y > game.cam.y + VIEW_H + 30) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath(); ctx.arc(t.x + 4, t.y + 5, t.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PALETTE.tree;
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PALETTE.treeDark;
      ctx.beginPath(); ctx.arc(t.x - 3, t.y - 3, t.r * 0.55, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = PALETTE.lamp;
    for (const l of game.city.lamps) {
      if (l.x < game.cam.x - 10 || l.x > game.cam.x + VIEW_W + 10 || l.y < game.cam.y - 10 || l.y > game.cam.y + VIEW_H + 10) continue;
      ctx.fillRect(l.x - 2, l.y - 6, 4, 12);
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath(); ctx.arc(l.x, l.y - 8, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PALETTE.lamp;
    }
  }

  drawMarker(ctx, game) {
    const m = game.missions.marker();
    if (!m) return;
    const pulse = 1 + Math.sin(this.time * 4) * 0.12;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#ffd23e'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(m.x, m.y, (m.r || 40) * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath(); ctx.arc(m.x, m.y, (m.r || 40) * pulse, 0, Math.PI * 2); ctx.fill();
    // Beam of light so the marker reads from far away.
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#ffe98a';
    ctx.fillRect(m.x - 3, m.y - 260, 6, 260);
    ctx.restore();
    // Off-screen arrow at the view edge.
    const sx = m.x - game.cam.x, sy = m.y - game.cam.y;
    if (sx < 30 || sx > VIEW_W - 30 || sy < 30 || sy > VIEW_H - 30) {
      const cx = clamp(sx, 40, VIEW_W - 40), cy = clamp(sy, 40, VIEW_H - 40);
      const a = Math.atan2(sy - VIEW_H / 2, sx - VIEW_W / 2);
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(a);
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  drawEntities(ctx, game) {
    const list = [];
    for (const c of game.cars) if (!c.dead) list.push({ y: c.y, kind: 'car', o: c });
    for (const p of game.peds) list.push({ y: p.y, kind: 'ped', o: p });
    for (const t of game.thugs) if (!t.dead) list.push({ y: t.y, kind: 'thug', o: t });
    for (const cp of game.cops) list.push({ y: cp.y, kind: 'cop', o: cp });
    const pl = game.player;
    if (!pl.car) list.push({ y: pl.y, kind: 'player', o: pl });
    list.sort((a, b) => a.y - b.y);
    for (const e of list) {
      if (e.kind === 'car') this.drawCar(ctx, e.o, game);
      else if (e.kind === 'ped') this.drawPerson(ctx, e.o.x, e.o.y, e.o.angle, e.o.color, e.o.skin, e.o.state === 'down');
      else if (e.kind === 'thug') { this.drawPerson(ctx, e.o.x, e.o.y, e.o.angle, '#8e2f2f', '#e0ac69', false); this.drawHealthBar(ctx, e.o); }
      else if (e.kind === 'cop') { this.drawPerson(ctx, e.o.x, e.o.y, e.o.angle, '#1e4fd8', '#f1c27d', false); this.drawHealthBar(ctx, e.o); }
      else if (e.kind === 'player') this.drawPerson(ctx, e.o.x, e.o.y, e.o.angle, '#ff5a3c', '#f1c27d', false, e.o.weapon === 'pistol');
    }
  }

  drawPerson(ctx, x, y, angle, shirt, skin, down, armed) {
    ctx.save();
    ctx.translate(x, y);
    if (down) {
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillStyle = shirt;
      ctx.beginPath(); ctx.ellipse(0, 0, 14, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = skin;
      ctx.beginPath(); ctx.arc(16, 0, 6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(2, 4, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(angle);
    ctx.fillStyle = shirt;
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(9, 0, 6.5, 0, Math.PI * 2); ctx.fill();
    if (armed) {
      ctx.fillStyle = '#222';
      ctx.fillRect(8, -2, 14, 4);
    }
    ctx.restore();
  }

  drawHealthBar(ctx, o) {
    const w = 30, pct = clamp(o.health / 100, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(o.x - w / 2, o.y - 26, w, 5);
    ctx.fillStyle = pct > 0.5 ? '#2ecc71' : pct > 0.25 ? '#f39c12' : '#e74c3c';
    ctx.fillRect(o.x - w / 2 + 1, o.y - 25, (w - 2) * pct, 3);
  }

  drawCar(ctx, car, game) {
    const t = car.def;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(3, 5, t.len / 2, t.wid / 2 + 2, car.angle, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(car.angle);
    // Wheels.
    ctx.fillStyle = '#141414';
    const wl = t.len / 2 - 8, ww = t.wid / 2 + 1;
    ctx.fillRect(-wl, -ww - 3, 12, 5); ctx.fillRect(wl - 4, -ww - 3, 12, 5);
    ctx.fillRect(-wl, ww - 2, 12, 5); ctx.fillRect(wl - 4, ww - 2, 12, 5);
    // Body.
    ctx.fillStyle = car.color;
    ctx.beginPath();
    ctx.roundRect(-t.len / 2, -t.wid / 2, t.len, t.wid, 7);
    ctx.fill();
    // Cabin + windshield.
    ctx.fillStyle = 'rgba(20,30,44,0.9)';
    ctx.beginPath(); ctx.roundRect(-t.len / 6, -t.wid / 2 + 4, t.len / 3, t.wid - 8, 4); ctx.fill();
    ctx.fillStyle = 'rgba(180,220,255,0.55)';
    ctx.fillRect(t.len / 6 - 2, -t.wid / 2 + 5, 5, t.wid - 10);
    // Police livery and light bar.
    if (car.type === 'police') {
      ctx.fillStyle = '#1e4fd8';
      ctx.fillRect(-t.len / 2 + 2, -t.wid / 2, t.len - 4, 6);
      const flash = Math.sin(this.time * 10) > 0;
      ctx.fillStyle = flash ? '#ff2d2d' : '#2d6bff';
      ctx.fillRect(-6, -t.wid / 2 - 2, 6, 4);
      ctx.fillStyle = flash ? '#2d6bff' : '#ff2d2d';
      ctx.fillRect(0, -t.wid / 2 - 2, 6, 4);
      ctx.fillStyle = '#111';
      ctx.font = 'bold 9px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('PD', 0, 4);
    }
    if (car.type === 'taxi') {
      ctx.fillStyle = '#111';
      ctx.font = 'bold 9px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, 4);
    }
    // Headlights.
    ctx.fillStyle = 'rgba(255,244,180,0.9)';
    ctx.fillRect(t.len / 2 - 2, -t.wid / 2 + 3, 3, 5);
    ctx.fillRect(t.len / 2 - 2, t.wid / 2 - 8, 3, 5);
    // Smoke when damaged.
    if (car.smoking && Math.random() < 0.35) {
      game.particles.add(car.x - Math.cos(car.angle) * 10, car.y - Math.sin(car.angle) * 10,
        (Math.random() - 0.5) * 20, -30 - Math.random() * 20, 0.9, 'rgba(120,120,120,0.7)', 5);
    }
    ctx.restore();
  }

  drawBullets(ctx, game) {
    ctx.save();
    ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 3;
    for (const b of game.bullets) {
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawLighting(ctx, game) {
    // Warm afternoon sun + vignette.
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, 'rgba(255,190,90,0.05)');
    g.addColorStop(1, 'rgba(255,140,60,0.10)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const v = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.42, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.85);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const p = game.player;
    if (p.hurtTimer > 0) {
      ctx.fillStyle = `rgba(220,30,30,${0.22 * (p.hurtTimer / 0.5)})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (p.health > 0 && p.health < 30) {
      ctx.fillStyle = `rgba(200,0,0,${0.08 + Math.sin(this.time * 5) * 0.05})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  drawHUD(ctx, game) {
    const p = game.player;
    ctx.save();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    // Objective panel (top-left).
    const m = game.missions.current;
    ctx.fillStyle = 'rgba(12,12,20,0.72)';
    ctx.beginPath(); ctx.roundRect(14, 14, 330, 64, 10); ctx.fill();
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText(m ? m.title : 'SOLARA BAY — free roam', 26, 36);
    ctx.fillStyle = '#fff';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(game.missions.objectiveText(), 26, 56);
    const d = game.missions.distanceToObjective();
    if (d !== null) {
      ctx.fillStyle = '#ffd23e';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText(d + ' m', 26, 72);
    }
    // Wanted stars (top-centre).
    const cx = VIEW_W / 2;
    ctx.fillStyle = 'rgba(12,12,20,0.72)';
    ctx.beginPath(); ctx.roundRect(cx - 95, 14, 190, 34, 10); ctx.fill();
    ctx.font = '22px system-ui, sans-serif'; ctx.textAlign = 'center';
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i < p.wanted ? '#ffcf3d' : 'rgba(255,255,255,0.25)';
      ctx.fillText('★', cx - 72 + i * 36, 39);
    }
    ctx.textAlign = 'left';
    // Money + clock (bottom-right).
    ctx.fillStyle = 'rgba(12,12,20,0.72)';
    ctx.beginPath(); ctx.roundRect(VIEW_W - 214, VIEW_H - 92, 200, 78, 10); ctx.fill();
    ctx.fillStyle = '#7ee787';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText(fmtMoney(p.money), VIEW_W - 200, VIEW_H - 62);
    ctx.fillStyle = '#fff';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(fmtClock(game.clockSeconds) + '  •  Solara Bay', VIEW_W - 200, VIEW_H - 40);
    if (p.car) {
      ctx.fillStyle = '#ffd23e';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillText(Math.round(Math.abs(p.car.speed) * 0.36) + ' km/h  •  ' + p.car.def.name, VIEW_W - 200, VIEW_H - 22);
    } else if (p.weapon === 'pistol') {
      ctx.fillStyle = '#ffd23e';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillText('Pistol — ' + p.ammo + ' rounds', VIEW_W - 200, VIEW_H - 22);
    }
    // Health bar (bottom-left).
    ctx.fillStyle = 'rgba(12,12,20,0.72)';
    ctx.beginPath(); ctx.roundRect(14, VIEW_H - 52, 230, 38, 10); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText('HEALTH', 26, VIEW_H - 32);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(86, VIEW_H - 42, 140, 12);
    ctx.fillStyle = p.health > 50 ? '#2ecc71' : p.health > 25 ? '#f39c12' : '#e74c3c';
    ctx.fillRect(86, VIEW_H - 42, 140 * clamp(p.health / 100, 0, 1), 12);
    // Toasts.
    ctx.textAlign = 'center';
    let ty = 70;
    for (const t of game.toasts) {
      ctx.globalAlpha = clamp(t.life, 0, 1);
      ctx.fillStyle = 'rgba(12,12,20,0.8)';
      const w = ctx.measureText(t.text).width + 28;
      ctx.beginPath(); ctx.roundRect(VIEW_W / 2 - w / 2, ty, w, 28, 8); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillText(t.text, VIEW_W / 2, ty + 19);
      ty += 40;
    }
    ctx.globalAlpha = 1;
    // Crosshair when the pistol is out.
    if (p.weapon === 'pistol' && !p.car) {
      const mx = game.input.mouseX, my = game.input.mouseY;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mx, my, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx - 13, my); ctx.lineTo(mx - 5, my);
      ctx.moveTo(mx + 5, my); ctx.lineTo(mx + 13, my);
      ctx.moveTo(mx, my - 13); ctx.lineTo(mx, my - 5);
      ctx.moveTo(mx, my + 5); ctx.lineTo(mx, my + 13); ctx.stroke();
    }
    ctx.restore();
    this.drawMinimap(ctx, game);
  }

  drawMinimap(ctx, game) {
    const mw = 220, mh = 165, mx0 = VIEW_W - mw - 14, my0 = 14;
    const sx = mw / WORLD_W, sy = mh / WORLD_H;
    ctx.save();
    ctx.fillStyle = 'rgba(12,12,20,0.78)';
    ctx.beginPath(); ctx.roundRect(mx0 - 6, my0 - 6, mw + 12, mh + 12, 10); ctx.fill();
    ctx.beginPath(); ctx.rect(mx0, my0, mw, mh); ctx.clip();
    ctx.fillStyle = '#5d8a4a';
    ctx.fillRect(mx0, my0, mw, mh);
    ctx.fillStyle = '#e8d29a';
    ctx.fillRect(mx0, my0 + BEACH_Y * sy, mw, (SEA_Y - BEACH_Y) * sy);
    ctx.fillStyle = '#2e7f9e';
    ctx.fillRect(mx0, my0 + SEA_Y * sy, mw, mh - SEA_Y * sy);
    ctx.strokeStyle = '#3a3a40'; ctx.lineWidth = 5;
    for (const rx of ROAD_XS) { ctx.beginPath(); ctx.moveTo(mx0 + rx * sx, my0); ctx.lineTo(mx0 + rx * sx, my0 + mh); ctx.stroke(); }
    for (const ry of ROAD_YS) { ctx.beginPath(); ctx.moveTo(mx0, my0 + ry * sy); ctx.lineTo(mx0 + mw, my0 + ry * sy); ctx.stroke(); }
    // Safehouse.
    ctx.fillStyle = '#7ee787';
    ctx.fillRect(mx0 + PLACES.safehouse.x * sx - 3, my0 + PLACES.safehouse.y * sy - 3, 6, 6);
    // Mission marker.
    const m = game.missions.marker();
    if (m) {
      const pulse = 3 + Math.sin(this.time * 5) * 1.5;
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath(); ctx.arc(mx0 + m.x * sx, my0 + m.y * sy, pulse + 3, 0, Math.PI * 2); ctx.fill();
    }
    // Police blips.
    ctx.fillStyle = '#2d6bff';
    for (const c of game.cars) if (c.type === 'police' && !c.dead) {
      ctx.beginPath(); ctx.arc(mx0 + c.x * sx, my0 + c.y * sy, 3, 0, Math.PI * 2); ctx.fill();
    }
    for (const cp of game.cops) {
      ctx.beginPath(); ctx.arc(mx0 + cp.x * sx, my0 + cp.y * sy, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    // Player arrow.
    const p = game.player;
    ctx.save();
    ctx.translate(mx0 + p.x * sx, my0 + p.y * sy);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx0 - 6, my0 - 6, mw + 12, mh + 12);
  }
}
