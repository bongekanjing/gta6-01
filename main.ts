// Solara Bay — entry program (Node 22, standard library only).
// Hands the game in: copies game/ and screenshots/ from this repository into
// /output (or MAKEFUN_OUTPUT_DIR outside the grader) and writes dossier.json
// with the kit's vendored library. Deterministic: the same input files always
// produce the same output bytes.
//
// Run it locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's caps for this competition: the dossier text cap shapes the
// bytes; the rest refuse an entry the scorer would refuse (too many or too
// large screenshots, too many game files or too much game data, a game path
// over 1000 bytes). game/ plus screenshots/ plus dossier.json also share
// /output's own 1000-entry cap, so the game is kept well inside them.
const dossierOptions = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

mkdirSync(outDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}
writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, dossierOptions));
