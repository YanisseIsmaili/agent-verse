import * as fs from 'fs';
import * as path from 'path';
import { AgentInfo, AgentStatus, Activity, Exchange, FeedItem, Snapshot } from './model';
import { allProjectDirs, claudeDir, projectDirMatchesCwd } from './paths';
import { detectRole, extractMission } from './roles';
import { LiveSession, readLiveSessions } from './sessions';
import { TranscriptState, activityOf, currentTool, newTranscriptState, readMore } from './transcript';

export interface ScannerOptions {
  claudeDir?: string;
  scope: 'workspace' | 'all';
  workspaceFolders: string[];
  /** Garder les agents terminés depuis moins de N minutes. */
  showFinishedMinutes: number;
  /** Ignorer les transcriptions sans activité depuis N minutes quand la session n'est pas vivante. */
  staleMinutes?: number;
}

interface Tracked {
  st: TranscriptState;
  kind: 'manager' | 'subagent';
  sessionId: string;
  projectDir: string;
  agentId?: string;
  meta?: { description?: string; finished?: boolean; agentType?: string; toolUseId?: string };
  mtime: number;
}

const FEED_WINDOW_MS = 3 * 60 * 60_000;
const FEED_MAX = 300;

/** Fil d'activité : qui a fait quoi, tous agents confondus, du plus récent au plus ancien. */
function buildFeed(agents: AgentInfo[], exchanges: Exchange[], now: number): FeedItem[] {
  const items: FeedItem[] = [];
  const cutoff = now - FEED_WINDOW_MS;
  for (const a of agents) {
    const base = { agentId: a.id, agentName: a.name, role: a.role };
    if (a.kind === 'subagent' && a.startedAt >= cutoff) {
      items.push({ ...base, at: a.startedAt, kind: 'start', text: 'arrive et prend sa mission' });
    }
    for (const e of a.journal) {
      if (e.at < cutoff) { continue; }
      if (e.kind === 'prompt') {
        if (a.kind === 'manager') { items.push({ ...base, at: e.at, kind: 'prompt', text: e.text.slice(0, 240) }); }
        continue;
      }
      if (e.kind === 'text') { items.push({ ...base, at: e.at, kind: 'text', text: e.text.slice(0, 300) }); continue; }
      if (e.kind !== 'tool' || !e.tool) { continue; }
      const n = e.tool.name;
      if (n === 'Agent' || n === 'SubagentHandback') { continue; }
      if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(n)) {
        items.push({ ...base, at: e.at, kind: 'file', text: e.tool.label, path: e.tool.detail, isError: e.tool.isError });
      } else if (n === 'Bash' || n === 'PowerShell') {
        items.push({ ...base, at: e.at, kind: 'command', text: e.tool.label, detail: e.tool.detail, isError: e.tool.isError });
      } else if (/^(Read|Grep|Glob|WebFetch|WebSearch)$/.test(n)) {
        items.push({ ...base, at: e.at, kind: 'read', text: e.tool.label, path: n === 'Read' ? e.tool.detail : undefined, detail: n === 'Read' ? undefined : e.tool.detail });
      } else if (n === 'AskUserQuestion') {
        // La question (et ses choix) telle qu'elle a été posée, puis la réponse de l'utilisateur si elle est arrivée.
        const raw = e.tool.resultPreview || '';
        const pairs = [...raw.matchAll(/"([^"]{1,300})"="([^"]{1,500})"/g)].map(mm => `${mm[1]} → ${mm[2]}`);
        const answer = pairs.length ? pairs.join('\n') : (raw && !/^\s*$/.test(raw) ? raw.slice(0, 600) : '');
        items.push({ ...base, at: e.at, kind: 'question', text: e.tool.detail || e.tool.label, detail: answer ? `Réponse : ${answer}` : (e.tool.endedAt ? '' : 'En attente de ta réponse…') });
      } else {
        items.push({ ...base, at: e.at, kind: 'tool', text: e.tool.label, detail: e.tool.detail });
      }
    }
  }
  for (const x of exchanges) {
    if (x.at < cutoff) { continue; }
    items.push({
      at: x.at, agentId: x.fromId, agentName: x.fromName, role: x.fromRole,
      kind: x.kind, exchangeId: x.id,
      text: x.kind === 'brief' ? `confie à ${x.toName} : ${x.summary}` : `rend son rapport à ${x.toName} : ${x.summary}`,
    });
  }
  items.sort((p, q) => q.at - p.at);
  return items.slice(0, FEED_MAX);
}

/**
 * Le scanner découvre les transcriptions à surveiller et maintient, pour
 * chacune, un état de lecture incrémental. Appeler `scan()` régulièrement.
 */
export class Scanner {
  private tracked = new Map<string, Tracked>();
  private lastDiscovery = 0;
  private live: LiveSession[] = [];

  constructor(public opts: ScannerOptions) {}

  get claude(): string { return claudeDir(this.opts.claudeDir); }

  private wantsProjectDir(name: string): boolean {
    if (this.opts.scope === 'all') { return true; }
    return this.opts.workspaceFolders.some(f => projectDirMatchesCwd(name, f));
  }

  private discover(now: number) {
    this.live = readLiveSessions(this.claude);
    const staleMs = (this.opts.staleMinutes ?? 30) * 60_000;
    const liveIds = new Set(this.live.filter(s => s.alive).map(s => s.sessionId));

    for (const dir of allProjectDirs(this.claude)) {
      const name = path.basename(dir);
      if (!this.wantsProjectDir(name)) { continue; }
      let entries: string[];
      try { entries = fs.readdirSync(dir); } catch { continue; }
      for (const e of entries) {
        if (!e.endsWith('.jsonl')) { continue; }
        const sessionId = e.slice(0, -'.jsonl'.length);
        const full = path.join(dir, e);
        let mtime = 0;
        try { mtime = fs.statSync(full).mtimeMs; } catch { continue; }
        const isLive = liveIds.has(sessionId);
        if (!isLive && now - mtime > staleMs && !this.tracked.has(full)) { continue; }
        if (!this.tracked.has(full)) {
          this.tracked.set(full, { st: newTranscriptState(full), kind: 'manager', sessionId, projectDir: dir, mtime });
        } else { this.tracked.get(full)!.mtime = mtime; }

        // Sous-agents : <projectDir>/<sessionId>/subagents/agent-*.jsonl
        const subDir = path.join(dir, sessionId, 'subagents');
        if (!fs.existsSync(subDir)) { continue; }
        let subs: string[];
        try { subs = fs.readdirSync(subDir); } catch { continue; }
        for (const s of subs) {
          if (!s.startsWith('agent-') || !s.endsWith('.jsonl')) { continue; }
          const agentId = s.slice('agent-'.length, -'.jsonl'.length);
          const sfull = path.join(subDir, s);
          let smtime = 0;
          try { smtime = fs.statSync(sfull).mtimeMs; } catch { continue; }
          const metaPath = path.join(subDir, `agent-${agentId}.meta.json`);
          let meta: Tracked['meta'];
          try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch { meta = undefined; }
          const finishedAgo = now - smtime;
          const keepFinishedMs = this.opts.showFinishedMinutes * 60_000;
          if (!this.tracked.has(sfull)) {
            // Un sous-agent déjà fini depuis longtemps n'intéresse personne.
            if (meta?.finished && finishedAgo > keepFinishedMs) { continue; }
            if (!isLive && finishedAgo > staleMs) { continue; }
            this.tracked.set(sfull, { st: newTranscriptState(sfull), kind: 'subagent', sessionId, projectDir: dir, agentId, meta, mtime: smtime });
          } else {
            const t = this.tracked.get(sfull)!;
            t.meta = meta ?? t.meta;
            t.mtime = smtime;
          }
        }
      }
    }
    // On oublie ce qui n'est plus dans le périmètre (changement de portée).
    for (const [p, t] of this.tracked) {
      if (!this.wantsProjectDir(path.basename(t.projectDir))) { this.tracked.delete(p); }
    }
  }

  scan(force = false): Snapshot {
    const now = Date.now();
    if (force || now - this.lastDiscovery > 4000) {
      this.discover(now);
      this.lastDiscovery = now;
    }
    const agents: AgentInfo[] = [];
    const keepFinishedMs = this.opts.showFinishedMinutes * 60_000;
    const liveBySession = new Map<string, LiveSession>();
    for (const s of this.live) {
      const prev = liveBySession.get(s.sessionId);
      if (!prev || (s.alive && !prev.alive) || s.updatedAt > prev.updatedAt) { liveBySession.set(s.sessionId, s); }
    }

    // Première passe : lire les nouveautés, puis repérer qui a lancé qui
    // (un sous-agent peut lui-même lancer des sous-agents).
    const launcherByToolUse = new Map<string, string>();
    const subtypeByToolUse = new Map<string, string>();
    const trackedById = new Map<string, Tracked>();
    for (const [, t] of this.tracked) {
      readMore(t.st);
      const ownerId = t.kind === 'manager' ? t.sessionId : `${t.sessionId}/${t.agentId}`;
      trackedById.set(ownerId, t);
      for (const [toolUseId, call] of t.st.agentCalls) { launcherByToolUse.set(toolUseId, ownerId); if (call.subagentType) { subtypeByToolUse.set(toolUseId, call.subagentType); } }
    }

    for (const [p, t] of this.tracked) {
      const st = t.st;
      const live = liveBySession.get(t.sessionId);
      const alive = !!live?.alive;
      const lastAt = st.lastTimestamp ?? t.mtime;

      let activity: Activity = activityOf(st, alive, now);
      if (t.kind === 'subagent' && (t.meta?.finished || st.handedBack)) { activity = 'done'; }
      if (t.kind === 'manager' && !alive && now - lastAt > 10 * 60_000) { activity = 'stale'; }
      if (t.kind === 'manager' && alive) {
        // Claude Code écrit lui-même l'état de la session : c'est la source la plus fiable.
        if (live?.status === 'idle') {
          if (activity !== 'waiting') { activity = 'idle'; st.pending.clear(); }
        } else if (live?.status === 'busy' && activity === 'idle') { activity = 'thinking'; }
      }
      // Un sous-agent qui n'écrit plus rien depuis 15 min a été arrêté ou a planté.
      if (t.kind === 'subagent' && activity !== 'done' && now - lastAt > 15 * 60_000) { activity = 'stale'; }

      const status: AgentStatus =
        activity === 'done' ? 'done' :
        activity === 'stale' ? 'stale' :
        activity === 'waiting' ? 'waiting' :
        activity === 'idle' ? 'idle' : 'running';

      if (status === 'done' && now - lastAt > keepFinishedMs) { this.tracked.delete(p); continue; }
      if (status === 'stale' && now - lastAt > (this.opts.staleMinutes ?? 30) * 60_000) { this.tracked.delete(p); continue; }

      const cur = currentTool(st);
      const cwd = live?.cwd ?? '';
      const role = t.kind === 'manager' ? 'manager' : detectRole(st.firstPrompt, t.meta?.description ?? '');
      const name = t.kind === 'manager'
        ? (st.aiTitle || live?.name || `Session ${t.sessionId.slice(0, 8)}`)
        : (t.meta?.description || `Agent ${t.agentId?.slice(0, 6)}`);
      const mission = t.kind === 'manager'
        ? (st.lastPrompt ? st.lastPrompt.slice(0, 600) : '')
        : extractMission(st.firstPrompt);
      const parentId = t.kind === 'subagent'
        ? ((t.meta?.toolUseId && launcherByToolUse.get(t.meta.toolUseId)) || t.sessionId)
        : undefined;

      agents.push({
        id: t.kind === 'manager' ? t.sessionId : `${t.sessionId}/${t.agentId}`,
        kind: t.kind,
        sessionId: t.sessionId,
        parentId,
        role,
        name,
        mission,
        cwd,
        transcriptPath: p,
        status,
        activity,
        startedAt: st.firstTimestamp ?? (live?.startedAt || t.mtime),
        turnStartedAt: st.turnStartedAt,
        lastActivityAt: lastAt,
        finishedAt: status === 'done' ? lastAt : undefined,
        currentTool: cur,
        lastAction: st.lastAction,
        lastText: st.lastText.length > 400 ? st.lastText.slice(0, 399) + '…' : st.lastText,
        agentType: t.kind === 'subagent' ? (t.meta?.agentType || (t.meta?.toolUseId ? subtypeByToolUse.get(t.meta.toolUseId) : undefined)) : undefined,
        toolCount: st.toolCount,
        toolCounts: st.toolCounts,
        filesRead: [...st.filesRead],
        filesWritten: [...st.filesWritten],
        tokens: st.tokens,
        model: st.model,
        pid: live?.pid,
        entrypoint: live?.entrypoint,
        journal: st.journal,
      });
    }

    // Un manager dont des agents tournent encore est « en train de déléguer »,
    // même s'il a fini son tour en attendant leurs rapports.
    const running = new Set(agents.filter(a => a.status === 'running' || a.status === 'waiting').map(a => a.parentId));
    for (const a of agents) {
      if ((a.status === 'idle' || a.activity === 'thinking') && running.has(a.id) && !a.currentTool) {
        a.activity = 'delegating';
        a.status = 'running';
      }
    }
    // Les managers d'abord, puis les sous-agents par date de début.
    agents.sort((a, b) => (a.kind === b.kind ? a.startedAt - b.startedAt : a.kind === 'manager' ? -1 : 1));

    const exchanges = this.buildExchanges(agents, trackedById);
    const feed = buildFeed(agents, exchanges, now);
    return { at: now, scope: this.opts.scope, agents, exchanges, feed, workspaceFolders: this.opts.workspaceFolders, claudeDir: this.claude };
  }

  /** Les missions envoyées (brief) et les rapports rendus, entre chaque lanceur et son sous-agent. */
  private buildExchanges(agents: AgentInfo[], trackedById: Map<string, Tracked>): Exchange[] {
    const byId = new Map(agents.map(a => [a.id, a]));
    const out: Exchange[] = [];
    for (const a of agents) {
      if (a.kind !== 'subagent' || !a.parentId) { continue; }
      const t = trackedById.get(a.id);
      const launcher = byId.get(a.parentId);
      const lt = trackedById.get(a.parentId);
      if (!t || !launcher || !lt) { continue; }
      const toolUseId = t.meta?.toolUseId;
      const call = toolUseId ? lt.st.agentCalls.get(toolUseId) : undefined;
      const briefText = call?.prompt || t.st.firstPrompt;
      if (briefText) {
        out.push({
          id: `${a.id}:brief`, at: call?.at ?? a.startedAt, kind: 'brief',
          fromId: launcher.id, fromName: launcher.name, fromRole: launcher.role,
          toId: a.id, toName: a.name, toRole: a.role,
          text: briefText, summary: (call?.description || t.meta?.description || a.name).slice(0, 160),
        });
      }
      let reportText = t.st.handbackText;
      let reportAt = t.st.handbackAt;
      if (!reportText && toolUseId) {
        const r = lt.st.agentResults.get(toolUseId);
        if (r) { reportText = r.text; reportAt = r.at; }
      }
      if (!reportText && a.status === 'done' && a.lastText) { reportText = a.lastText; reportAt = a.lastActivityAt; }
      if (reportText) {
        const firstLine = reportText.split('\n').map(l => l.replace(/^#+\s*/, '').trim()).find(l => l.length > 0) || '';
        out.push({
          id: `${a.id}:report`, at: reportAt ?? a.lastActivityAt, kind: 'report',
          fromId: a.id, fromName: a.name, fromRole: a.role,
          toId: launcher.id, toName: launcher.name, toRole: launcher.role,
          text: reportText, summary: firstLine.slice(0, 160),
        });
      }
    }
    out.sort((x, y) => x.at - y.at);
    return out;
  }

  /** Vide l'état pour forcer une redécouverte complète (changement de portée). */
  reset() {
    this.tracked.clear();
    this.lastDiscovery = 0;
  }
}
