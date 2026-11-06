import * as fs from 'fs';
import * as path from 'path';

/**
 * Claude Code écrit un fichier par processus vivant dans ~/.claude/sessions/<pid>.json
 * avec l'identifiant de session, le dossier de travail, un nom et un état
 * (« busy » / « idle »). On s'en sert pour savoir quelles sessions tournent.
 */
export interface LiveSession {
  pid: number;
  sessionId: string;
  cwd: string;
  name: string;
  status: string;
  entrypoint: string;
  startedAt: number;
  updatedAt: number;
  alive: boolean;
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    // EPERM = le processus existe mais on n'a pas le droit de lui envoyer un signal.
    return e && e.code === 'EPERM';
  }
}

export function readLiveSessions(claude: string): LiveSession[] {
  const dir = path.join(claude, 'sessions');
  if (!fs.existsSync(dir)) { return []; }
  const out: LiveSession[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) { continue; }
    try {
      const o = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (!o || typeof o.sessionId !== 'string') { continue; }
      const pid = Number(o.pid);
      out.push({
        pid,
        sessionId: o.sessionId,
        cwd: String(o.cwd ?? ''),
        name: String(o.name ?? ''),
        status: String(o.status ?? ''),
        entrypoint: String(o.entrypoint ?? ''),
        startedAt: Number(o.startedAt ?? 0),
        updatedAt: Number(o.updatedAt ?? 0),
        alive: Number.isFinite(pid) && isProcessAlive(pid),
      });
    } catch { /* fichier en cours d'écriture, on réessaiera */ }
  }
  return out;
}
