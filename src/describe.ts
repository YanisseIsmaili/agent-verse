import * as path from 'path';
import { Activity } from './model';

function base(p: unknown): string {
  if (typeof p !== 'string' || !p) { return '?'; }
  return path.basename(p.replace(/[\\/]+$/, '')) || p;
}

function short(s: unknown, max = 70): string {
  if (typeof s !== 'string') { return ''; }
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > max ? one.slice(0, max - 1) + '…' : one;
}

export interface ToolDescription {
  label: string;
  detail: string;
  activity: Activity;
  fileRead?: string;
  fileWritten?: string;
}

/** Traduit un appel d'outil en phrase courte en français. */
export function describeTool(name: string, input: Record<string, unknown> | undefined): ToolDescription {
  const inp = input ?? {};
  const fp = (inp.file_path ?? inp.notebook_path ?? inp.path) as string | undefined;
  switch (name) {
    case 'Read':
      return { label: `lit ${base(fp)}`, detail: String(fp ?? ''), activity: 'reading', fileRead: fp };
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return { label: `modifie ${base(fp)}`, detail: String(fp ?? ''), activity: 'writing', fileWritten: fp };
    case 'Write':
      return { label: `écrit ${base(fp)}`, detail: String(fp ?? ''), activity: 'writing', fileWritten: fp };
    case 'Bash':
    case 'PowerShell': {
      const desc = typeof inp.description === 'string' ? inp.description : '';
      const cmd = short(inp.command, 200);
      return { label: `lance : ${short(desc || cmd, 60)}`, detail: cmd, activity: 'running' };
    }
    case 'Grep':
      return { label: `cherche « ${short(inp.pattern, 40)} »`, detail: `dans ${String(inp.path ?? inp.glob ?? 'le projet')}`, activity: 'reading' };
    case 'Glob':
      return { label: `cherche des fichiers ${short(inp.pattern, 40)}`, detail: String(inp.path ?? ''), activity: 'reading' };
    case 'Agent':
      return { label: `délègue : ${short(inp.description, 50)}`, detail: short(inp.prompt, 200), activity: 'delegating' };
    case 'WebFetch':
      return { label: `consulte ${short(inp.url, 50)}`, detail: String(inp.url ?? ''), activity: 'reading' };
    case 'WebSearch':
      return { label: `cherche sur le web « ${short(inp.query, 40)} »`, detail: String(inp.query ?? ''), activity: 'reading' };
    case 'AskUserQuestion':
    {
      const qs = Array.isArray(inp.questions) ? inp.questions : [];
      const lines = qs.map((q: any) => {
        const opts = Array.isArray(q?.options) ? q.options.map((o: any) => String(o?.label ?? '')).filter(Boolean) : [];
        return String(q?.question ?? '') + (opts.length ? ' — ' + opts.join(' / ') : '');
      }).filter(Boolean);
      const first = qs[0] && typeof qs[0].question === 'string' ? qs[0].question : '';
      return { label: first ? `demande : ${short(first, 90)}` : 'pose une question à l’utilisateur', detail: lines.join('\n'), activity: 'waiting' };
    }
    case 'SubagentHandback':
      return { label: 'rend son rapport au manager', detail: typeof inp.message === 'string' ? inp.message.slice(0, 6000) : '', activity: 'done' };
    case 'TodoWrite':
    case 'TaskCreate':
    case 'TaskUpdate':
    case 'mcp__ccd_turn__update_plan':
      return { label: 'met à jour son plan', detail: '', activity: 'thinking' };
    case 'mcp__ccd_turn__wrap_up':
      return { label: 'conclut son travail', detail: short(inp.recap, 300), activity: 'thinking' };
    case 'Skill':
      return { label: `utilise le skill ${short(inp.skill, 30)}`, detail: '', activity: 'thinking' };
    case 'SendMessage':
      return { label: 'envoie un message à une autre session', detail: short(inp.message, 120), activity: 'delegating' };
    case 'ToolSearch':
      return { label: 'charge un outil', detail: short(inp.query, 60), activity: 'thinking' };
    default: {
      if (name.startsWith('mcp__')) {
        const parts = name.split('__');
        const server = parts[1] ?? name;
        const tool = parts.slice(2).join('__');
        return { label: `utilise ${server}${tool ? ' : ' + tool : ''}`, detail: '', activity: 'running' };
      }
      return { label: `utilise ${name}`, detail: '', activity: 'running' };
    }
  }
}
