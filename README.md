# Solara Bay — Make GTA 6

[![Make GTA 6](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/bongekanjing/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/bongekanjing/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

**Solara Bay** is an original open-world crime game in the spirit of GTA 6, built for the [gta6-01 bounty on make.fun](https://make.fun/bounty/gta6-01) — a $1,666 prize pool over 100 places.

Marco Reyes is back in Solara Bay after five years away, and Mama Lou wants her $50,000 back. Steal cars, outrun the Solara PD, run five jobs, and clear the debt.

## The game

- **A city to explore** — Solara Bay: a sun-soaked coastal grid of streets, beach, docks, casino, park and neighbourhoods, on foot and by car.
- **Traffic and pedestrians** — AI cars drive the road grid, pedestrians walk the sidewalks and flee from trouble.
- **Cars to steal and drive** — sedans, taxis, sports cars, trucks and vans, each with its own handling; pull a driver out and take theirs.
- **Wanted level and police** — crime raises the heat (1–5 stars); PD Interceptors chase and ram, foot cops chase and bust you.
- **Missions and a story** — five jobs for Mama Lou, from stealing wheels to the Big Score at the Golden Palm, with briefings, markers and rewards.
- **Combat** — fists and a pistol, rival Vultures to deal with, health and ammo to manage.
- **HUD with minimap** — objective, distance, wanted stars, health, money, speed and a live minimap with blips.
- **Start screen, pause and save** — progress saves automatically; continue where you left off.
- **Polish** — synthesized sound and music (no audio files), engine hum, sirens, particles, skid marks, screen shake and warm afternoon light.

## Play it

Open `game/index.html` in desktop Chrome (or run `node serve.ts` and open http://localhost:8080). No network needed — every file the game loads is under `game/`.

| Key | Action |
| --- | --- |
| W A S D / arrows | Move / drive |
| Shift | Run |
| E | Enter / exit a car |
| F | Punch |
| Q | Switch fists / pistol |
| Mouse click | Shoot (pistol out) |
| Space | Handbrake |
| Esc | Pause |
| M | Mute |

## Layout

- `game/` — the playable game: `index.html`, `style.css`, `src/` (one job per file: config, world, entities, missions, audio, input, render, shots, main).
- `screenshots/` — 4 real browser renders of the game's own code (cover first).
- `main.ts` — the entry program (Node 22 stdlib): copies `game/` and `screenshots/` to `/output` and writes `dossier.json` with `vendor/makefun-game.ts`.
- `serve.ts` — a tiny static server for local play.
- `vendor/makefun-game.ts` — the kit's copy, unchanged.

Built by my AI agent for a bounty on make.fun, where you can earn money making games with AI: https://make.fun/bounty/gta6-01

My referral link: https://make.fun/r/204hjvsp
