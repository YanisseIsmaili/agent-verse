import * as fs from 'fs';
import { Activity, JournalEntry, TokenUsage, ToolCall } from './model';
import { describeTool } from './describe';

/**
 * Lecteur incrémental d'un fichier de transcription JSONL de Claude Code.
 *
 * Les transcriptions des sessions principales peuvent peser des centaines de
 * Mo : on ne les relit jamais en entier. À la première rencontre on lit
 * seulement la fin du fichier (TAIL_BYTES), puis on ne lit que ce qui a été
 * ajouté depuis le dernier passage.
 */
const TAIL_BYTES = 3 * 1024 * 1024;
const MAX_JOURNAL = 400;

export interface TranscriptState {
  path: string;
  offset: number;
  partial: string;
  /** true si on a commencé en milieu de fichier (gros fichier) */
  truncatedStart: boolean;
  firstPrompt: string;
  firstTimestamp?: number;
  lastTimestamp?: number;
  lastText: string;
  lastAction: string;
  lastActionAt: number;
  pending: Map<string, ToolCall>;
  lastTool?: ToolCall;
  toolCount: number;
  toolCounts: Record<string, number>;
  filesRead: Set<string>;
  filesWritten: Set<string>;
  tokens: TokenUsage;
  model?: string;
  handedBack: boolean;
  /** Le dernier message de l'assistant était un texte sans appel d'outil : fin de tour. */
  turnEnded: boolean;
  /** Titre généré par Claude pour la session (type « ai-title »). */
  aiTitle?: string;
  journal: JournalEntry[];
  /** Dernière demande de permission ou question en attente. */
  waitingSince?: number;
  /** Dernière demande de l'utilisateur (hors messages techniques) et son heure. */
  lastPrompt: string;
  turnStartedAt?: number;
  /** Sous-agents lancés par cette transcription : id d'appel d'outil → mission envoyée. */
  agentCalls: Map<string, { description: string; prompt: string; at: number; subagentType?: string }>;
  /** Résultats d'appels Agent synchrones (le rapport revient directement dans la transcription). */
  agentResults: Map<string, { text: string; at: number }>;
  /** Rapport rendu par ce sous-agent (SubagentHandback). */
  handbackText?: string;
  handbackAt?: number;
  _lastUsageMsg?: string;
}

export function newTranscriptState(p: string): TranscriptState {
  return {
    path: p,
    offset: 0,
    partial: '',
    truncatedStart: false,
    firstPrompt: '',
    lastText: '',
    lastAction: '',
    lastActionAt: 0,
    pending: new Map(),
    toolCount: 0,
    toolCounts: {},
    filesRead: new Set(),
    filesWritten: new Set(),
    tokens: { input: 0, output: 0, cacheRead: 0, cacheCreate: 0, context: 0 },
    handedBack: false,
    turnEnded: false,
    journal: [],
    lastPrompt: '',
    agentCalls: new Map(),
    agentResults: new Map(),
  };
}

/** Message technique envoyé par Claude Code au manager (fin d'un sous-agent, message d'une autre session). */
function isNotification(text: string): boolean {
  return /^\s*<task-notification>/.test(text)
    || /<agent-message\b/.test(text)
    || /^\s*Another Claude session sent a message/.test(text)
    || /^\s*<side-sessions-event>/.test(text)
    || /^\s*<cross-session-message/.test(text);
}

function notificationSummary(text: string): string {
  const m = /<summary>([\s\S]*?)<\/summary>/.exec(text);
  if (m) { return m[1].trim(); }
  const a = /<agent-message from="([^"]+)"/.exec(text);
  if (a) { return `Rapport reçu de l’agent ${a[1].slice(0, 6)}`; }
  return previewOf(text, 160);
}

function ts(o: any): number | undefined {
  if (typeof o?.timestamp === 'string') {
    const t = Date.parse(o.timestamp);
    return Number.isFinite(t) ? t : undefined;
  }
  return undefined;
}

function pushJournal(st: TranscriptState, e: JournalEntry) {
  st.journal.push(e);
  if (st.journal.length > MAX_JOURNAL) { st.journal.splice(0, st.journal.length - MAX_JOURNAL); }
}

function previewOf(content: unknown, max = 240): string {
  let text = '';
  if (typeof content === 'string') { text = content; }
  else if (Array.isArray(content)) {
    text = content.map((b: any) => (b && typeof b.text === 'string') ? b.text : '').join('\n');
  }
  text = text.replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

/** Lit ce qui a été ajouté au fichier depuis le dernier appel. Retourne true si quelque chose a changé. */
export function readMore(st: TranscriptState): boolean {
  let stat: fs.Stats;
  try { stat = fs.statSync(st.path); } catch { return false; }
  const size = stat.size;
  if (size < st.offset) {
    // Fichier tronqué ou remplacé : on repart de zéro.
    const fresh = newTranscriptState(st.path);
    Object.assign(st, fresh);
  }
  if (size === st.offset) { return false; }

  let start = st.offset;
  if (start === 0 && size > TAIL_BYTES) {
    start = size - TAIL_BYTES;
    st.truncatedStart = true;
  }
  const length = size - start;
  const buf = Buffer.alloc(length);
  let fd: number | undefined;
  try {
    fd = fs.openSync(st.path, 'r');
    fs.readSync(fd, buf, 0, length, start);
  } catch {
    return false;
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* ignore */ } }
  }
  st.offset = size;

  let text = st.partial + buf.toString('utf8');
  if (st.truncatedStart && start !== 0 && st.partial === '' && st.journal.length === 0) {
    // On a commencé au milieu d'une ligne : on saute jusqu'au premier retour à la ligne.
    const nl = text.indexOf('\n');
    text = nl >= 0 ? text.slice(nl + 1) : '';
  }
  const lastNl = text.lastIndexOf('\n');
  if (lastNl < 0) { st.partial = text; return false; }
  st.partial = text.slice(lastNl + 1);
  const lines = text.slice(0, lastNl).split('\n');
  for (const line of lines) {
    if (!line.trim()) { continue; }
    let o: any;
    try { o = JSON.parse(line); } catch { continue; }
    applyRecord(st, o);
  }
  return true;
}

function applyRecord(st: TranscriptState, o: any) {
  const t = ts(o);
  if (t) {
    if (!st.firstTimestamp) { st.firstTimestamp = t; }
    st.lastTimestamp = t;
  }
  const type = o?.type;
  if (type === 'ai-title' && typeof o.aiTitle === 'string') { st.aiTitle = o.aiTitle; return; }
  if (type !== 'user' && type !== 'assistant') { return; }
  const msg = o.message;
  if (!msg) { return; }
  const content = msg.content;
  const at = t ?? Date.now();

  if (type === 'user') {
    const onPrompt = (text: string) => {
      if (isNotification(text)) {
        pushJournal(st, { at, kind: 'system', text: notificationSummary(text) });
        st.turnEnded = false;
        st.waitingSince = undefined;
        return;
      }
      if (!st.firstPrompt) { st.firstPrompt = text; }
      // Nouvelle demande : un outil resté sans réponse a été interrompu.
      st.pending.clear();
      st.lastPrompt = text;
      st.turnStartedAt = at;
      pushJournal(st, { at, kind: 'prompt', text: previewOf(text, 2000) });
      st.turnEnded = false;
      st.waitingSince = undefined;
    };
    if (typeof content === 'string') {
      if (!o.isMeta) { onPrompt(content); }
      return;
    }
    if (!Array.isArray(content)) { return; }
    for (const b of content) {
      if (!b || typeof b !== 'object') { continue; }
      if (b.type === 'text' && typeof b.text === 'string' && !o.isMeta) {
        onPrompt(b.text);
      } else if (b.type === 'tool_result') {
        const call = st.pending.get(b.tool_use_id);
        if (call) {
          call.endedAt = at;
          call.isError = !!b.is_error;
          call.resultPreview = previewOf(b.content, call.name === 'AskUserQuestion' ? 3000 : undefined);
          st.pending.delete(b.tool_use_id);
          if (call.name === 'Agent') {
            const full = previewOf(b.content, 12000);
            if (!/^Async agent launched/i.test(full)) { st.agentResults.set(b.tool_use_id, { text: full, at }); }
          }
        }
        st.waitingSince = undefined;
      }
    }
    return;
  }

  // assistant
  if (msg.model && typeof msg.model === 'string') { st.model = msg.model; }
  if (msg.usage && typeof msg.usage === 'object') {
    const u = msg.usage;
    const inp = Number(u.input_tokens ?? 0);
    const out = Number(u.output_tokens ?? 0);
    const cr = Number(u.cache_read_input_tokens ?? 0);
    const cc = Number(u.cache_creation_input_tokens ?? 0);
    // Chaque ligne « assistant » d'une même réponse répète le même usage :
    // on ne compte qu'une fois par identifiant de message.
    const mid = typeof msg.id === 'string' ? msg.id : '';
    if (mid && st._lastUsageMsg !== mid) {
      st._lastUsageMsg = mid;
      st.tokens.input += inp;
      st.tokens.output += out;
      st.tokens.cacheRead += cr;
      st.tokens.cacheCreate += cc;
      st.tokens.context = inp + cr + cc;
    }
  }
  if (!Array.isArray(content)) { return; }
  let sawToolUse = false;
  for (const b of content) {
    if (!b || typeof b !== 'object') { continue; }
    if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
      st.lastText = b.text.trim();
      pushJournal(st, { at, kind: 'text', text: b.text.trim() });
    } else if (b.type === 'tool_use') {
      sawToolUse = true;
      const name = String(b.name ?? '?');
      const d = describeTool(name, b.input);
      const call: ToolCall = {
        id: String(b.id ?? ''),
        name,
        label: d.label,
        detail: d.detail,
        activity: d.activity,
        startedAt: at,
      };
      st.toolCount++;
      st.toolCounts[name] = (st.toolCounts[name] ?? 0) + 1;
      if (d.fileRead) { st.filesRead.add(d.fileRead); }
      if (d.fileWritten) { st.filesWritten.add(d.fileWritten); }
      st.lastAction = d.label;
      st.lastActionAt = at;
      st.lastTool = call;
      if (name === 'SubagentHandback') {
        st.handedBack = true;
        st.handbackText = d.detail;
        st.handbackAt = at;
        pushJournal(st, { at, kind: 'handback', text: d.detail, tool: call });
      } else {
        pushJournal(st, { at, kind: 'tool', text: d.label, tool: call });
      }
      if (name === 'AskUserQuestion') { st.waitingSince = at; }
      if (name === 'Agent' && call.id) {
        const desc = b.input && typeof b.input.description === 'string' ? b.input.description : '';
        const prompt = b.input && typeof b.input.prompt === 'string' ? b.input.prompt : '';
        const subagentType = b.input && typeof b.input.subagent_type === 'string' ? b.input.subagent_type : undefined;
        st.agentCalls.set(call.id, { description: desc, prompt: prompt.slice(0, 12000), at, subagentType });
      }
      if (call.id) { st.pending.set(call.id, call); }
    }
  }
  if (!sawToolUse && msg.stop_reason === 'end_turn') {
    st.turnEnded = true;
    // Fin de tour : plus rien ne tourne, même si un résultat d'outil n'a jamais été écrit.
    st.pending.clear();
  }
  else if (sawToolUse) { st.turnEnded = false; }
}

/** L'outil en cours (le plus récent sans résultat). */
export function currentTool(st: TranscriptState): ToolCall | undefined {
  let latest: ToolCall | undefined;
  for (const c of st.pending.values()) {
    if (!latest || c.startedAt > latest.startedAt) { latest = c; }
  }
  return latest;
}

export function activityOf(st: TranscriptState, alive: boolean, now: number): Activity {
  if (st.handedBack) { return 'done'; }
  const cur = currentTool(st);
  const last = st.lastTimestamp ?? 0;
  const silence = now - last;
  if (cur) {
    if (cur.activity === 'waiting') { return 'waiting'; }
    // Un outil sans réponse depuis longtemps : sûrement une permission à accorder.
    if (silence > 90_000 && cur.activity !== 'delegating' && cur.activity !== 'running') { return 'waiting'; }
    if (!alive && silence > 5 * 60_000) { return 'stale'; }
    return cur.activity;
  }
  if (!alive) { return silence > 10 * 60_000 ? 'stale' : (st.turnEnded ? 'idle' : 'thinking'); }
  if (st.turnEnded) { return 'idle'; }
  if (silence > 10 * 60_000) { return 'idle'; }
  return 'thinking';
}
