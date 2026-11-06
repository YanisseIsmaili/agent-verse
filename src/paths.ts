import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Dossier de données de Claude Code (~/.claude ou CLAUDE_CONFIG_DIR). */
export function claudeDir(override?: string): string {
  if (override && override.trim()) { return override.trim(); }
  if (process.env.CLAUDE_CONFIG_DIR) { return process.env.CLAUDE_CONFIG_DIR; }
  return path.join(os.homedir(), '.claude');
}

/**
 * Claude Code range les transcriptions sous projects/<cwd encodé>/ :
 * chaque caractère qui n'est ni une lettre ni un chiffre devient « - ».
 *   c:\Users\ntjum\projects\Basket5  →  c--Users-ntjum-projects-Basket5
 */
export function encodeProjectDir(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, '-');
}

/**
 * Retrouve le(s) dossier(s) projets correspondant à un cwd, sans se soucier
 * de la casse du lecteur (« C: » vs « c: ») ni du sens des slashs.
 */
export function findProjectDirs(claude: string, cwd: string): string[] {
  const projectsRoot = path.join(claude, 'projects');
  if (!fs.existsSync(projectsRoot)) { return []; }
  const wanted = encodeProjectDir(cwd).toLowerCase();
  const out: string[] = [];
  for (const name of fs.readdirSync(projectsRoot)) {
    if (name.toLowerCase() === wanted) { out.push(path.join(projectsRoot, name)); }
  }
  return out;
}

export function allProjectDirs(claude: string): string[] {
  const projectsRoot = path.join(claude, 'projects');
  if (!fs.existsSync(projectsRoot)) { return []; }
  return fs.readdirSync(projectsRoot)
    .map(n => path.join(projectsRoot, n))
    .filter(p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } });
}

export function samePath(a: string, b: string): boolean {
  const norm = (p: string) => path.resolve(p).replace(/[\\/]+$/, '').toLowerCase();
  return norm(a) === norm(b);
}

/** Le dossier projets d'un cwd, pour comparer avec le nom d'un dossier existant. */
export function projectDirMatchesCwd(projectDirName: string, cwd: string): boolean {
  return projectDirName.toLowerCase() === encodeProjectDir(cwd).toLowerCase();
}
