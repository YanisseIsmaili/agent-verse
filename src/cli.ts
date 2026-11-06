// Petit outil de test hors VS Code : `npm run dump -- [dossier-projet] [--all] [--json]`
// Affiche ce que la détection voit en ce moment.
import { Scanner } from './scanner';
import { ROLE_LABELS } from './roles';

import * as fs from 'fs';
import * as path from 'path';

const args = process.argv.slice(2);
const all = args.includes('--all');
const json = args.includes('--json');
const preview = args.includes('--preview');
const folders = args.filter(a => !a.startsWith('--'));

const finishedArg = args.find(a => a.startsWith('--finished='));
const scanner = new Scanner({
  scope: all || folders.length === 0 ? 'all' : 'workspace',
  workspaceFolders: folders,
  showFinishedMinutes: finishedArg ? Number(finishedArg.split('=')[1]) : 120,
  staleMinutes: finishedArg ? Number(finishedArg.split('=')[1]) : undefined,
});

const snap = scanner.scan(true);
if (preview) {
  // Écrit un instantané pour scripts/preview.html (aperçu du bureau hors VS Code).
  const target = path.join(__dirname, '..', 'scripts', 'preview-state.js');
  fs.writeFileSync(target, 'window.__PREVIEW_SNAPSHOT = ' + JSON.stringify(snap) + ';\n');
  console.log(`Instantané écrit dans ${target} (${snap.agents.length} agents)`);
} else if (json) {
  console.log(JSON.stringify(snap, null, 2));
} else {
  console.log(`Portée : ${snap.scope} — ${snap.agents.length} agent(s) — dossier Claude : ${snap.claudeDir}`);
  for (const a of snap.agents) {
    const indent = a.kind === 'manager' ? '' : '    ';
    const dur = Math.round((snap.at - a.startedAt) / 60000);
    console.log(`${indent}[${a.status.toUpperCase()}] ${ROLE_LABELS[a.role]} — ${a.name}`);
    console.log(`${indent}   activité : ${a.activity} | outils : ${a.toolCount} | depuis ${dur} min | pid ${a.pid ?? '-'} | ${a.model ?? ''}`);
    if (a.currentTool) { console.log(`${indent}   en cours : ${a.currentTool.label}`); }
    if (a.lastAction) { console.log(`${indent}   dernière action : ${a.lastAction}`); }
    if (a.lastText) { console.log(`${indent}   dernier texte : ${a.lastText.slice(0, 120).replace(/\n/g, ' ')}`); }
    console.log(`${indent}   fichiers lus : ${a.filesRead.length}, modifiés : ${a.filesWritten.length} | tokens sortie ${a.tokens.output}, contexte ${a.tokens.context}`);
  }
}
