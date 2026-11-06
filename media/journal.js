// Agent-Verse : journal lisible d'un agent (webview).
(function () {
  'use strict';
  const vscode = acquireVsCodeApi();
  const ROLE = {
    manager: { label: 'Manager', color: '#8a2be2' }, dev: { label: 'Développeur', color: '#1e6fff' },
    securite: { label: 'Cybersécurité', color: '#e8232a' }, bugs: { label: 'Chasseur de bugs', color: '#22c55e' },
    readme: { label: 'Rédacteur README', color: '#ffb000' }, autre: { label: 'Agent', color: '#8d99ae' },
  };
  const STATE_LABEL = { running: 'en cours', waiting: 'attend', idle: 'au repos', done: 'terminé', stale: 'sans nouvelles' };
  const ICON = { prompt: '📨', text: '💬', tool: '🔧', handback: '🏁', system: 'ℹ' };
  const TOOL_ICON = { Read: '👁', Edit: '✎', MultiEdit: '✎', Write: '✎', NotebookEdit: '✎', Bash: '▶', PowerShell: '▶', Grep: '🔍', Glob: '🔍', Agent: '📣', WebFetch: '🌐', WebSearch: '🌐', AskUserQuestion: '❓', SubagentHandback: '🏁' };

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const base = p => String(p || '').split(/[\\/]/).pop() || p;
  const time = t => new Date(t).toLocaleTimeString('fr-FR');
  // Mise en forme légère : gras, code, liens de fichiers.
  const md = s => esc(s)
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>');

  const app = document.getElementById('app');
  app.innerHTML = `<div class="head"></div><div class="timeline"><p class="empty">En attente des données…</p></div><button class="tofollow">↓ Suivre</button>`;
  const head = app.querySelector('.head');
  const tl = app.querySelector('.timeline');
  const follow = app.querySelector('.tofollow');

  let agent = null;
  let renderedCount = 0;
  let firstKey = '';
  let autoScroll = true;

  const entryKey = e => e.at + '|' + e.kind + '|' + (e.tool ? e.tool.id : e.text.slice(0, 30));

  function entryHtml(e) {
    if (e.kind === 'prompt') {
      return `<div class="entry prompt"><span class="time">${time(e.at)}</span><span class="ico">${ICON.prompt}</span><div class="body"><span class="lbl">Consigne reçue</span>${md(e.text)}</div></div>`;
    }
    if (e.kind === 'text') {
      return `<div class="entry text"><span class="time">${time(e.at)}</span><span class="ico">${ICON.text}</span><div class="body">${md(e.text)}</div></div>`;
    }
    if (e.kind === 'handback') {
      return `<div class="entry handback"><span class="time">${time(e.at)}</span><span class="ico">${ICON.handback}</span><div class="body"><span class="lbl">Rapport rendu au manager</span>${md(e.text)}</div></div>`;
    }
    const t = e.tool || {};
    const fileish = /^(Read|Edit|MultiEdit|Write|NotebookEdit)$/.test(t.name) && t.detail;
    const st = t.endedAt ? (t.isError ? '<span class="st err">✗ erreur</span>' : '<span class="st ok">✓</span>') : '<span class="st run">⏳ en cours</span>';
    return `<div class="entry tool" data-tid="${esc(t.id)}"><span class="time">${time(e.at)}</span><span class="ico">${TOOL_ICON[t.name] || '🔧'}</span>
      <div class="body"><span class="lbl">${esc(t.label)}</span>${st}
        ${t.detail ? (fileish ? `<div class="det"><a data-path="${esc(t.detail)}">${esc(t.detail)}</a></div>` : `<div class="det">${esc(t.detail)}</div>`) : ''}
        ${t.resultPreview ? `<details><summary>résultat</summary><div class="res ${t.isError ? 'err' : ''}">${esc(t.resultPreview)}</div></details>` : ''}
      </div></div>`;
  }

  function renderHead(at) {
    const r = ROLE[agent.role] || ROLE.autre;
    const alive = agent.status === 'running' || agent.status === 'waiting';
    head.innerHTML = `
      <span class="role-badge" style="background:${r.color}">${esc(agent.kind === 'manager' ? 'Manager' : r.label)}</span>
      <h1>${esc(agent.name)}</h1>
      <span class="state ${agent.status}">${esc(STATE_LABEL[agent.status] || agent.status)}</span>
      <span class="live ${alive ? 'on' : ''}">${alive ? 'en direct' : 'figé'} · ${agent.toolCount} actions · ${agent.journal.length} entrées</span>
      <button data-act="raw" title="Ouvrir le fichier de transcription brut">Brut</button>
      <div class="now">${agent.currentTool ? '⏳ ' + esc(agent.currentTool.label) : (agent.lastAction ? 'dernière action : ' + esc(agent.lastAction) : '')}</div>`;
  }

  function renderTimeline() {
    const j = agent.journal || [];
    if (j.length === 0) { tl.innerHTML = '<p class="empty">Rien à montrer pour l’instant (gros fichier : seule la fin est lue).</p>'; renderedCount = 0; return; }
    const key = entryKey(j[0]);
    const atBottom = tl.scrollHeight - tl.scrollTop - tl.clientHeight < 40;
    if (key !== firstKey || j.length < renderedCount) {
      // Le journal a glissé (limite d'entrées) ou tout a changé : on repart.
      firstKey = key;
      tl.innerHTML = j.map(entryHtml).join('');
      renderedCount = j.length;
    } else {
      // On ajoute seulement les nouvelles entrées et on rafraîchit les outils encore en cours.
      if (j.length > renderedCount) {
        tl.insertAdjacentHTML('beforeend', j.slice(renderedCount).map(entryHtml).join(''));
        renderedCount = j.length;
      }
      tl.querySelectorAll('.entry.tool .st.run').forEach(stEl => {
        const row = stEl.closest('.entry');
        const e = j.find(x => x.tool && x.tool.id === row.dataset.tid);
        if (e && e.tool.endedAt) { row.outerHTML = entryHtml(e); }
      });
    }
    if (autoScroll && !atBottom) { tl.scrollTop = tl.scrollHeight; }
    else if (autoScroll) { tl.scrollTop = tl.scrollHeight; }
  }

  tl.addEventListener('scroll', () => {
    const atBottom = tl.scrollHeight - tl.scrollTop - tl.clientHeight < 40;
    autoScroll = atBottom;
    follow.classList.toggle('show', !atBottom);
  });
  follow.addEventListener('click', () => { autoScroll = true; tl.scrollTop = tl.scrollHeight; follow.classList.remove('show'); });
  app.addEventListener('click', e => {
    const a = e.target.closest('a[data-path]');
    if (a) { vscode.postMessage({ type: 'openFile', path: a.dataset.path }); return; }
    if (e.target.closest('[data-act="raw"]')) { vscode.postMessage({ type: 'openTranscript' }); }
  });

  window.addEventListener('message', ev => {
    const m = ev.data;
    if (!m) { return; }
    if (m.type === 'agent') { agent = m.agent; renderHead(m.at); renderTimeline(); }
    else if (m.type === 'gone' && agent) { agent.status = 'stale'; renderHead(m.at); }
  });
  vscode.postMessage({ type: 'ready' });
})();
