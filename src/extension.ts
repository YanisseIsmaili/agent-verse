import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { AgentInfo, Snapshot } from './model';
import { ROLE_LABELS } from './roles';
import { Scanner } from './scanner';

let scanner: Scanner;
let office: vscode.WebviewPanel | undefined;
const journals = new Map<string, vscode.WebviewPanel>();
let timer: ReturnType<typeof setInterval> | undefined;
let statusBar: vscode.StatusBarItem;
let lastSnapshot: Snapshot | undefined;
let lastOfficeKey = '';
let extCtx: vscode.ExtensionContext;

function cfg() { return vscode.workspace.getConfiguration('agentVerse'); }
function workspaceFolders(): string[] { return (vscode.workspace.workspaceFolders ?? []).map(f => f.uri.fsPath); }

export function activate(ctx: vscode.ExtensionContext) {
  extCtx = ctx;
  scanner = new Scanner({
    claudeDir: cfg().get<string>('claudeDir') || undefined,
    scope: cfg().get<'workspace' | 'all'>('scope') ?? 'workspace',
    workspaceFolders: workspaceFolders(),
    showFinishedMinutes: cfg().get<number>('showFinishedMinutes') ?? 120,
  });

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
  statusBar.command = 'agentVerse.open';
  statusBar.text = '$(organization) Agents';
  statusBar.tooltip = 'Agent-Verse : ouvrir le bureau des agents Claude Code';
  statusBar.show();
  ctx.subscriptions.push(statusBar);

  ctx.subscriptions.push(
    vscode.commands.registerCommand('agentVerse.open', () => openOffice()),
    vscode.commands.registerCommand('agentVerse.openJournal', () => pickJournal()),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (!e.affectsConfiguration('agentVerse')) { return; }
      scanner.opts.claudeDir = cfg().get<string>('claudeDir') || undefined;
      scanner.opts.scope = cfg().get<'workspace' | 'all'>('scope') ?? 'workspace';
      scanner.opts.showFinishedMinutes = cfg().get<number>('showFinishedMinutes') ?? 120;
      scanner.reset();
      lastOfficeKey = '';
      startTimer();
      refresh(true);
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      scanner.opts.workspaceFolders = workspaceFolders();
      scanner.reset();
      lastOfficeKey = '';
      refresh(true);
    }),
  );

  startTimer();
  refresh(true);
}

export function deactivate() {
  if (timer) { clearInterval(timer); }
}

function startTimer() {
  if (timer) { clearInterval(timer); }
  const fast = cfg().get<number>('refreshMs') ?? 1500;
  // Sans panneau ouvert, on rafraîchit plus doucement : seule la barre d'état en a besoin.
  const period = office || journals.size > 0 ? Math.max(500, fast) : 5000;
  timer = setInterval(() => refresh(false), period);
}

function refresh(force: boolean) {
  let snap: Snapshot;
  try { snap = scanner.scan(force); }
  catch (e) { console.error('[agent-verse] scan failed', e); return; }
  lastSnapshot = snap;
  updateStatusBar(snap);

  if (office) {
    const light = {
      ...snap,
      sounds: cfg().get<boolean>('sounds') ?? true,
      style: cfg().get<'images' | 'dessine'>('style') ?? 'images',
      map: cfg().get<'immeuble' | 'decor'>('map') ?? 'decor',
      agents: snap.agents.map(a => ({
        ...a,
        journal: [],
        filesRead: a.filesRead.slice(-200),
        filesWritten: a.filesWritten.slice(-200),
      })),
    };
    const key = JSON.stringify([light.agents, light.exchanges, light.feed, light.scope, light.sounds, light.style, light.map]);
    if (force || key !== lastOfficeKey) {
      lastOfficeKey = key;
      office.webview.postMessage({ type: 'snapshot', snapshot: light });
    }
  }
  for (const [id, panel] of journals) {
    const a = snap.agents.find(x => x.id === id);
    panel.webview.postMessage(a ? { type: 'agent', agent: a, at: snap.at } : { type: 'gone', at: snap.at });
  }
}

function updateStatusBar(snap: Snapshot) {
  const running = snap.agents.filter(a => a.status === 'running').length;
  const waiting = snap.agents.filter(a => a.status === 'waiting').length;
  const subs = snap.agents.filter(a => a.kind === 'subagent' && a.status === 'running').length;
  if (waiting > 0) {
    statusBar.text = `$(bell) ${waiting} agent${waiting > 1 ? 's' : ''} attend${waiting > 1 ? 'ent' : ''}`;
    statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  } else {
    statusBar.backgroundColor = undefined;
    statusBar.text = running > 0
      ? `$(organization) ${running} en cours${subs ? ` (${subs} sous-agent${subs > 1 ? 's' : ''})` : ''}`
      : '$(organization) Agents au repos';
  }
}

function nonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 32; i++) { s += chars[Math.floor(Math.random() * chars.length)]; }
  return s;
}

function html(webview: vscode.Webview, page: 'office' | 'journal', title: string): string {
  const n = nonce();
  const css = webview.asWebviewUri(vscode.Uri.joinPath(extCtx.extensionUri, 'media', `${page}.css`));
  const js = webview.asWebviewUri(vscode.Uri.joinPath(extCtx.extensionUri, 'media', `${page}.js`));
  const chars = webview.asWebviewUri(vscode.Uri.joinPath(extCtx.extensionUri, 'media', 'characters.js'));
  const building = webview.asWebviewUri(vscode.Uri.joinPath(extCtx.extensionUri, 'media', 'building.js'));
  let extraScript = '';
  if (page === 'office') {
    // Zones du décor et racine des images (sprites, icônes, décor) pour le mode « images ».
    let zones = 'null';
    try { zones = fs.readFileSync(path.join(extCtx.extensionPath, 'media', 'zones.json'), 'utf8'); JSON.parse(zones); } catch { zones = 'null'; }
    let sprites = 'null';
    try { sprites = fs.readFileSync(path.join(extCtx.extensionPath, 'media', 'sprites.json'), 'utf8'); JSON.parse(sprites); } catch { sprites = 'null'; }
    let places = 'null';
    try { places = fs.readFileSync(path.join(extCtx.extensionPath, 'media', 'map', 'places.json'), 'utf8'); JSON.parse(places); } catch { places = 'null'; }
    const media = webview.asWebviewUri(vscode.Uri.joinPath(extCtx.extensionUri, 'media')).toString() + '/';
    extraScript = `<script nonce="${n}">window.AgentVerseZones = ${zones}; window.AgentVerseSpriteInfo = ${sprites}; window.AgentVersePlaces = ${places}; window.AgentVerseMedia = ${JSON.stringify(media)};</script>\n<script nonce="${n}" src="${chars}"></script>\n<script nonce="${n}" src="${building}"></script>\n`;
  }
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${n}'; img-src ${webview.cspSource} data:;">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${css}">
<title>${title}</title>
</head>
<body>
<div id="app"></div>
${extraScript}<script nonce="${n}" src="${js}"></script>
</body>
</html>`;
}

function openOffice() {
  if (office) { office.reveal(); return; }
  office = vscode.window.createWebviewPanel('agentVerse.office', 'Agent-Verse', vscode.ViewColumn.Beside, {
    enableScripts: true,
    retainContextWhenHidden: true,
    localResourceRoots: [vscode.Uri.joinPath(extCtx.extensionUri, 'media')],
  });
  office.iconPath = vscode.Uri.joinPath(extCtx.extensionUri, 'media', 'icon.svg');
  office.webview.html = html(office.webview, 'office', 'Agent-Verse');
  office.webview.onDidReceiveMessage((m: any) => handleOfficeMessage(m));
  office.onDidDispose(() => { office = undefined; lastOfficeKey = ''; startTimer(); });
  startTimer();
}

async function handleOfficeMessage(m: any) {
  switch (m?.type) {
    case 'ready':
      lastOfficeKey = '';
      refresh(true);
      break;
    case 'setScope':
      await cfg().update('scope', m.scope === 'all' ? 'all' : 'workspace', vscode.ConfigurationTarget.Global);
      break;
    case 'setSounds':
      await cfg().update('sounds', !!m.on, vscode.ConfigurationTarget.Global);
      break;
    case 'openJournal':
      openJournal(String(m.id));
      break;
    case 'openFile':
      openFile(String(m.path));
      break;
    case 'openTranscript':
      openTranscript(String(m.id));
      break;
  }
}

async function openFile(p: string) {
  if (!p || !fs.existsSync(p)) {
    vscode.window.showWarningMessage(`Agent-Verse : fichier introuvable : ${p}`);
    return;
  }
  try {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(p));
    await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.One });
  } catch (e: any) {
    vscode.window.showWarningMessage(`Agent-Verse : impossible d'ouvrir ${p} (${e?.message ?? e})`);
  }
}

async function openTranscript(id: string) {
  const a = lastSnapshot?.agents.find(x => x.id === id);
  if (!a) { return; }
  let size = 0;
  try { size = fs.statSync(a.transcriptPath).size; } catch { /* ignore */ }
  if (size > 40 * 1024 * 1024) {
    const choice = await vscode.window.showWarningMessage(
      `Ce fichier de transcription pèse ${Math.round(size / 1024 / 1024)} Mo : VS Code risque de refuser de l'ouvrir. Le journal lisible est plus pratique.`,
      'Ouvrir le journal', 'Essayer quand même');
    if (choice === 'Ouvrir le journal') { openJournal(id); return; }
    if (!choice) { return; }
  }
  await openFile(a.transcriptPath);
}

function journalTitle(a: AgentInfo): string {
  return `${ROLE_LABELS[a.role]} · ${a.name}`.slice(0, 60);
}

function openJournal(id: string) {
  const existing = journals.get(id);
  if (existing) { existing.reveal(); return; }
  const a = lastSnapshot?.agents.find(x => x.id === id);
  if (!a) { vscode.window.showWarningMessage('Agent-Verse : cet agent n\'est plus suivi.'); return; }
  const panel = vscode.window.createWebviewPanel('agentVerse.journal', journalTitle(a), vscode.ViewColumn.Beside, {
    enableScripts: true,
    retainContextWhenHidden: true,
    localResourceRoots: [vscode.Uri.joinPath(extCtx.extensionUri, 'media')],
  });
  panel.iconPath = vscode.Uri.joinPath(extCtx.extensionUri, 'media', 'icon.svg');
  panel.webview.html = html(panel.webview, 'journal', journalTitle(a));
  panel.webview.onDidReceiveMessage((m: any) => {
    switch (m?.type) {
      case 'ready': {
        const cur = lastSnapshot?.agents.find(x => x.id === id);
        if (cur) { panel.webview.postMessage({ type: 'agent', agent: cur, at: Date.now() }); }
        break;
      }
      case 'openFile': openFile(String(m.path)); break;
      case 'openTranscript': openTranscript(id); break;
    }
  });
  panel.onDidDispose(() => { journals.delete(id); startTimer(); });
  journals.set(id, panel);
  startTimer();
}

async function pickJournal() {
  const snap = lastSnapshot ?? scanner.scan(true);
  if (snap.agents.length === 0) {
    vscode.window.showInformationMessage('Agent-Verse : aucun agent Claude Code détecté pour le moment.');
    return;
  }
  const items = snap.agents.map(a => ({
    label: `${a.kind === 'subagent' ? '    ↳ ' : ''}${ROLE_LABELS[a.role]} · ${a.name}`,
    description: a.status === 'running' ? (a.currentTool?.label || a.lastAction) : a.status,
    id: a.id,
  }));
  const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Quel agent veux-tu suivre ?' });
  if (pick) { openJournal(pick.id); }
}
