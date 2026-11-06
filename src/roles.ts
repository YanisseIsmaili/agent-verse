import { RoleKey } from './model';

/**
 * Reconnaît les fiches du skill « equipe-dev » : le prompt d'un sous-agent
 * commence par le titre de sa fiche (« # Agent développeur », …).
 * On tolère la casse, les accents et quelques variantes.
 */
const PATTERNS: Array<{ role: RoleKey; re: RegExp }> = [
  { role: 'dev',      re: /^\s*#\s*agent\s+d[ée]veloppeur/i },
  { role: 'securite', re: /^\s*#\s*agent\s+cyber\s*s[ée]curit[ée]/i },
  { role: 'bugs',     re: /^\s*#\s*agent\s+chasseur\s+de\s+bugs?/i },
  { role: 'readme',   re: /^\s*#\s*agent\s+r[ée]dacteur\s+readme/i },
  { role: 'git',      re: /^\s*#\s*agent\s+git\b/i },
];

export function detectRole(prompt: string, description = ''): RoleKey {
  const head = prompt.slice(0, 200);
  for (const p of PATTERNS) {
    if (p.re.test(head)) { return p.role; }
  }
  // Repli : quelques mots-clés dans la description donnée par le manager.
  const low = description.toLowerCase();
  if (/s[ée]cu|audit|faille|vuln/.test(low)) { return 'securite'; }
  if (/bug|casser|planter/.test(low)) { return 'bugs'; }
  if (/readme|documente|documentation/.test(low)) { return 'readme'; }
  if (/d[ée]velopp|impl[ée]mente|coder?\b|ajouter|cr[ée]er/.test(low)) { return 'dev'; }
  return 'autre';
}

/**
 * Extrait la partie « Ta tâche » du prompt (après la fiche de rôle), pour
 * afficher la mission réelle plutôt que la fiche entière.
 */
export function extractMission(prompt: string, max = 700): string {
  const idx = prompt.search(/^##\s*Ta t[âa]che/im);
  let body = idx >= 0 ? prompt.slice(idx) : prompt;
  body = body.replace(/^##\s*Ta t[âa]che\s*/im, '');
  const cut = body.search(/^##\s*Contexte/im);
  if (cut > 0) { body = body.slice(0, cut); }
  body = body.replace(/^#+\s*/gm, '').trim();
  return body.length > max ? body.slice(0, max - 1) + '…' : body;
}

export const ROLE_LABELS: Record<RoleKey, string> = {
  manager: 'Manager',
  dev: 'Développeur',
  securite: 'Cybersécurité',
  bugs: 'Chasseur de bugs',
  readme: 'Rédacteur README',
  git: 'Git',
  autre: 'Agent',
};
