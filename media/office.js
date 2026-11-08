// Agent-Verse : l'entreprise (webview). Aucune donnée ne quitte la machine :
// tout vient de l'extension via postMessage.
(function () {
  'use strict';
  const vscode = acquireVsCodeApi();

  // ---------- Constantes ----------
  const ROLE = {
    manager:  { label: 'Manager',          color: '#8a2be2', dark: '#2d0a4e', emblem: 'star' },
    dev:      { label: 'Développeur',      color: '#1e6fff', dark: '#0b2a6b', emblem: 'code' },
    securite: { label: 'Cybersécurité',    color: '#e8232a', dark: '#5a0a0e', emblem: 'shield' },
    bugs:     { label: 'Chasseur de bugs', color: '#22c55e', dark: '#0b4a24', emblem: 'bug' },
    readme:   { label: 'Rédacteur README', color: '#ffb000', dark: '#6b4a00', emblem: 'doc' },
    git:      { label: 'Git',              color: '#166534', dark: '#052e16', emblem: 'git' },
    '3d':     { label: '3D Maker',         color: '#14b8a6', dark: '#0f4c45', emblem: 'cube' },
    autre:    { label: 'Agent',            color: '#8d99ae', dark: '#3a4150', emblem: 'dot' },
  };
  const ACT = {
    reading:    { tag: 'SCAN',    verb: 'lit' },
    writing:    { tag: 'TAP TAP', verb: 'écrit' },
    running:    { tag: 'VROOM',   verb: 'lance' },
    delegating: { tag: 'CALL!',   verb: 'délègue' },
    thinking:   { tag: 'HMM…',    verb: 'réfléchit' },
    waiting:    { tag: '?!',      verb: 'attend' },
    idle:       { tag: 'ZZZ',     verb: 'au repos' },
    done:       { tag: 'DONE!',   verb: 'terminé' },
    stale:      { tag: '…',       verb: 'sans nouvelles' },
  };
  const STATE_LABEL = { running: 'en cours', waiting: 'attend', idle: 'au repos', done: 'terminé', stale: 'sans nouvelles' };
  const FEED_KINDS = {
    exchange: { label: 'Échanges', kinds: ['brief', 'report', 'start'] },
    file:     { label: 'Fichiers', kinds: ['file'] },
    command:  { label: 'Commandes', kinds: ['command', 'tool'] },
    text:     { label: 'Paroles', kinds: ['text', 'prompt', 'question'] },
    read:     { label: 'Lectures', kinds: ['read'] },
  };
  const FEED_ICON = { question: '❓', brief: '📋', report: '📨', start: '🚪', file: '✎', command: '▶', tool: '🔧', text: '💬', prompt: '🗣', read: '👁', done: '🏁' };

  // Plan de l'entreprise (unités du plateau : 1200 × 720).
  // Deux plateaux : « images » (décor peint + sprites, zones dans media/zones.json) ou « dessiné » (SVG, plan ci-dessous).
  let W = 1200, H = 720;
  const ZONES = window.AgentVerseZones || null;
  const MEDIA = window.AgentVerseMedia || '';
  const POSES = ['assis', 'debout', 'marche'];
  const ANIM_KEYS = ['marche', 'clavier', 'attente'];
  const SPRITE_INFO = window.AgentVerseSpriteInfo || { sprites: {}, anims: {} };
  // Rôles sans images propres : Git emprunte le personnage générique (teinté en vert par le CSS).
  const SPRITE_OF = {}; // rôles qui empruntent les images d'un autre (aucun : Git et 3D ont les leurs)
  const PLACES = window.AgentVersePlaces || null;
  // Visages découpés (media/visages/<role>-1.png) pour le fil et les étiquettes ; les autres rôles gardent leur vignette.
  const FACE_ROLES = new Set(['securite', 'bugs', 'readme', 'autre']);
  const faceUrl = role => (imgMode() && FACE_ROLES.has(role) ? `${MEDIA}visages/${role}-1.png` : null);
  const ROOM_OF = { git: 'bugs', '3d': 'dev', autre: 'dev' };
  const ALT_ROOM = { '3d': 'readme' }; // salle de repli quand celle du rôle est pleine
  const spriteBase = role => SPRITE_OF[role] || (ROLE[role] ? role : 'autre');
  const ROOMS_SVG = {
    dev:      { x: 24,  y: 24,  w: 372, h: 312, label: 'Open space dev',    bg: '#dbeafe', accent: '#3b82f6', slots: grid(24, 24, 3, 2, 372) },
    manager:  { x: 420, y: 24,  w: 360, h: 216, label: 'Bureau du manager', bg: '#efe3ff', accent: '#a855f7', desk: [600, 158],
                visitors: [[600, 228], [520, 224], [680, 224], [460, 220], [740, 220], [560, 236], [640, 236]] },
    securite: { x: 804, y: 24,  w: 372, h: 312, label: 'Labo sécurité',     bg: '#fee2e2', accent: '#ef4444', slots: grid(804, 24, 3, 2, 372) },
    readme:   { x: 24,  y: 360, w: 372, h: 204, label: 'Rédaction & docs',  bg: '#fef9c3', accent: '#f59e0b', slots: grid(24, 360, 3, 1, 372) },
    meeting:  { x: 420, y: 264, w: 360, h: 300, label: 'Salle de réunion',  bg: '#fce7f3', accent: '#ec4899', table: [600, 430], head: [600, 342],
                seats: [[480, 420], [720, 420], [540, 505], [660, 505], [500, 340], [700, 340]] },
    bugs:     { x: 804, y: 360, w: 372, h: 204, label: 'Salle de test',     bg: '#dcfce7', accent: '#22c55e', slots: grid(804, 360, 3, 1, 372) },
    autre:    { x: 24,  y: 588, w: 372, h: 108, label: 'Accueil',           bg: '#e5e7eb', accent: '#6b7280', slots: grid(24, 588, 3, 1, 372, 80) },
  };
  const ROOMS_IMG = ZONES ? ZONES.rooms : null;
  let ROOMS = ROOMS_SVG, CORRIDOR_Y = 668, ENTRANCE = [900, 668], OVERFLOW_X = 420;
  function imgMode() { return state.style !== 'dessine' && !!ROOMS_IMG && !!MEDIA; }
  // Carte : « immeuble » (modulaire, grandit tout seul) ou « decor » (décor fixe / plan SVG).
  function mapMode() { return state.map !== 'decor' && !!window.AgentVerseBuilding; }
  const buildings = new Map(); // id de session → immeuble (les places y sont stables)
  let curSessionId = 'none', roomsDirty = false;
  function BLD() {
    let b = buildings.get(curSessionId);
    if (!b) { b = window.AgentVerseBuilding.create(MEDIA, () => { roomsDirty = true; }, PLACES); buildings.set(curSessionId, b); }
    return b;
  }
  // Caméra (mode immeuble) : zoom à la molette, glisser à la souris, « tout voir », suivre un agent.
  const cam = { k: 1, tx: 0, ty: 0, auto: true };
  function applyStyle() {
    if (mapMode()) {
      ROOMS = BLD().roomsObject(); const sz = BLD().size(); W = sz.W; H = sz.H; ENTRANCE = BLD().entrance(); CORRIDOR_Y = ENTRANCE[1]; OVERFLOW_X = 0;
    } else if (imgMode()) { ROOMS = ROOMS_IMG; W = ZONES.stage.w; H = ZONES.stage.h; CORRIDOR_Y = ZONES.corridors.bottom; ENTRANCE = ZONES.entrance; OVERFLOW_X = ZONES.overflowX; }
    else { ROOMS = ROOMS_SVG; W = 1200; H = 720; CORRIDOR_Y = 668; ENTRANCE = [900, 668]; OVERFLOW_X = 420; }
    stage.classList.toggle('img', imgMode());
    stage.classList.toggle('bld', mapMode());
    app.classList.toggle('map', mapMode());
    stage.style.width = W + 'px'; stage.style.height = H + 'px';
    const sky = mapMode() ? BLD().skyUrl() : '';
    stage.style.backgroundImage = mapMode() ? sky : (imgMode() ? `url("${MEDIA}${ZONES.decor || 'decor-nuit.jpg'}")` : '');
    // Fond des bulles en mode images : la bulle de pensée découpée de la planche.
    stage.style.setProperty('--pensee', imgMode() ? `url("${MEDIA}icones/pensee.png")` : 'none');
    fitStage();
  }
  // Les pièces ont changé (nouvelle pièce, image arrivée) : on redessine seulement la couche des pièces.
  function refreshRooms() {
    roomsDirty = false;
    ROOMS = BLD().roomsObject(); const sz = BLD().size(); W = sz.W; H = sz.H; ENTRANCE = BLD().entrance();
    stage.style.width = W + 'px'; stage.style.height = H + 'px';
    stage.style.backgroundImage = BLD().skyUrl();
    const layer = stage.querySelector('.rooms');
    if (layer) { layer.innerHTML = BLD().html(); }
    fitStage();
  }

  function grid(x, y, cols, rows, w, firstY) {
    const out = [];
    const stepX = w / cols;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) { out.push([Math.round(x + stepX * (i + 0.5)), y + (firstY || 128) + j * 150]); }
    }
    return out;
  }

  // ---------- État ----------
  const state = {
    snapshot: null,
    selected: null,
    session: null,
    showIdle: false,
    showDone: true,
    sounds: false,
    style: 'images',
    map: 'decor',
    follow: null,
    filters: { exchange: true, file: true, command: true, text: true, read: false },
    expanded: new Set(),
    openFeed: new Set(),
  };
  try {
    const saved = vscode.getState();
    if (saved) {
      Object.assign(state, {
        showIdle: !!saved.showIdle, showDone: saved.showDone !== false,
        selected: saved.selected || null, session: saved.session || null,
        filters: Object.assign({}, state.filters, saved.filters || {}),
      });
    }
  } catch { /* ignore */ }
  const persist = () => { try { vscode.setState({ showIdle: state.showIdle, showDone: state.showDone, selected: state.selected, session: state.session, filters: state.filters }); } catch { /* ignore */ } };

  // ---------- Utilitaires ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const base = p => String(p || '').split(/[\\/]/).pop() || p;
  const now = () => Date.now();
  const time = t => new Date(t).toLocaleTimeString('fr-FR');
  const fmtDur = ms => {
    if (!Number.isFinite(ms) || ms < 0) { return '–'; }
    const s = Math.floor(ms / 1000);
    if (s < 60) { return s + ' s'; }
    const m = Math.floor(s / 60);
    if (m < 60) { return m + ' min ' + String(s % 60).padStart(2, '0') + ' s'; }
    const h = Math.floor(m / 60);
    if (h < 48) { return h + ' h ' + String(m % 60).padStart(2, '0'); }
    return Math.floor(h / 24) + ' j';
  };
  const fmtAgo = ms => (ms < 5000 ? 'à l’instant' : 'il y a ' + fmtDur(ms));
  const fmtTok = n => (n >= 1e6 ? (n / 1e6).toFixed(1) + ' M' : n >= 1000 ? Math.round(n / 1000) + ' k' : String(n || 0));
  const md = s => esc(s).replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/`([^`\n]+)`/g, '<code>$1</code>');
  const oneLine = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
  // Coupe proprement à la fin d'un mot, avec des points de suspension.
  const cut = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); if (t.length <= n) { return t; } const c = t.slice(0, n); const i = c.lastIndexOf(' '); return (i > n * 0.5 ? c.slice(0, i) : c) + '…'; };
  const htmlToEl = h => { const tpl = document.createElement('template'); tpl.innerHTML = h.trim(); return tpl.content.firstElementChild; };

  // ---------- Sons ----------
  let audio = null;
  function chime(kind) {
    if (!state.sounds) { return; }
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') { audio.resume(); }
      const t0 = audio.currentTime;
      const notes = kind === 'report' ? [[784, 0], [1175, 0.13]] : kind === 'waiting' ? [[660, 0], [660, 0.2], [660, 0.4]] : [[523, 0]];
      for (const [f, dt] of notes) {
        const o = audio.createOscillator(); const g = audio.createGain();
        o.type = 'triangle'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + dt);
        g.gain.exponentialRampToValueAtTime(0.12, t0 + dt + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.32);
        o.connect(g).connect(audio.destination);
        o.start(t0 + dt); o.stop(t0 + dt + 0.36);
      }
    } catch { /* pas de son possible */ }
  }

  // ---------- Personnage (dessins dans media/characters.js) ----------
  const sprite = role => window.AgentVerseSprites.sprite(spriteBase(role));

  // ---------- Textes des bulles ----------
  function bubbleText(a, phase) {
    const t = now();
    const N = 52;
    if (phase === 'briefing') { return { text: 'Reçoit sa mission : ' + cut(a.mission || a.name, N), ago: '', cls: 'alert' }; }
    if (phase === 'reporting') { return { text: 'Rend son rapport : ' + cut(a.lastText || 'terminé', N), ago: fmtAgo(t - a.lastActivityAt), cls: 'alert' }; }
    if (a.activity === 'done') { return { text: 'Terminé. ' + cut(a.lastText, N), ago: fmtAgo(t - a.lastActivityAt), cls: '' }; }
    if (a.activity === 'waiting') { return { text: cut((a.currentTool ? a.currentTool.label + ' — ' : '') + 'attend une réponse de toi', N + 20), ago: fmtAgo(t - a.lastActivityAt), cls: 'alert' }; }
    if (a.activity === 'idle') { return { text: cut(a.lastText, N) || 'Attend ton prochain message.', ago: fmtAgo(t - a.lastActivityAt), cls: 'thought' }; }
    if (a.activity === 'stale') { return { text: 'Plus de nouvelles… la session a peut-être été fermée.', ago: fmtAgo(t - a.lastActivityAt), cls: 'thought' }; }
    if (a.currentTool) { return { text: cut(a.currentTool.label, N), ago: 'depuis ' + fmtDur(t - a.currentTool.startedAt), cls: '' }; }
    if (a.activity === 'delegating') { return { text: 'Attend les rapports de ses agents…', ago: a.lastAction ? 'dernière action : ' + cut(a.lastAction, 30) : '', cls: 'thought' }; }
    return { text: cut(a.lastText, N) || (a.lastAction ? 'vient de : ' + cut(a.lastAction, 40) : 'Réfléchit…'), ago: fmtAgo(t - a.lastActivityAt), cls: 'thought' };
  }

  // ---------- Sessions ----------
  function allSessions() {
    const snap = state.snapshot;
    if (!snap) { return []; }
    const by = new Map();
    for (const a of snap.agents) {
      if (!by.has(a.sessionId)) { by.set(a.sessionId, { id: a.sessionId, manager: null, agents: [] }); }
      const s = by.get(a.sessionId);
      if (a.kind === 'manager') { s.manager = a; } else { s.agents.push(a); }
    }
    const rank = s => {
      const all = [s.manager, ...s.agents].filter(Boolean);
      if (all.some(a => a.status === 'waiting')) { return 0; }
      if (all.some(a => a.status === 'running')) { return 1; }
      if (all.some(a => a.status === 'done')) { return 2; }
      return 3;
    };
    const list = [...by.values()].map(s => Object.assign(s, { rank: rank(s), last: Math.max(...[s.manager, ...s.agents].filter(Boolean).map(a => a.lastActivityAt)) }));
    list.sort((x, y) => x.rank - y.rank || y.last - x.last);
    return list.filter(s => state.showIdle || s.rank < 3);
  }
  function currentSession(sessions) {
    return sessions.find(s => s.id === state.session) || sessions[0] || null;
  }
  function sessionLabel(s) {
    if (s.rank === 0) { return { cls: 'waiting', text: 'ATTEND TOI' }; }
    const n = s.agents.filter(a => a.status === 'running').length;
    if (n > 0) { return { cls: 'delegating', text: n + ' AU TRAVAIL' }; }
    if (s.manager && s.manager.status === 'running') { return { cls: 'running', text: 'EN COURS' }; }
    if (s.rank === 2) { return { cls: 'idle', text: 'TERMINÉ' }; }
    return { cls: 'idle', text: 'AU REPOS' };
  }

  // ---------- Placement ----------
  // Le parcours d'un agent : entrée → brief chez le manager → poste → rapport en réunion → poste (terminé).
  const BRIEF_MS = 9000, REPORT_MS = 22000, QUIET_MS = 8000, SPEED = 170; // SPEED en px/s
  function phaseOf(a, exchanges, t) {
    if (a.kind === 'manager') {
      const fresh = exchanges.some(x => x.kind === 'report' && x.toId === a.id && t - x.at < REPORT_MS);
      return fresh ? 'meeting' : 'desk';
    }
    if (a.status === 'done') { return t - (a.finishedAt || a.lastActivityAt) < REPORT_MS ? 'reporting' : 'rest'; }
    if (a.status === 'waiting' || a.activity === 'waiting') { return 'waiting'; }
    if (t - a.startedAt < BRIEF_MS) { return 'briefing'; }
    return 'work';
  }
  const deskSlot = new Map(); // id → [x, y]
  const meetingSeat = new Map(); // id → index de chaise en réunion
  const roomCursor = {};
  const overflowIds = new Set(); // agents sans bureau libre : debout sur une chaise de la salle de réunion
  function roomOf(role) { const r = ROOM_OF[role] || role; return ROOMS[r] ? r : 'autre'; }
  function deskFor(a) {
    if (deskSlot.has(a.id)) { return deskSlot.get(a.id); }
    if (mapMode()) { const p = BLD().assign(a); deskSlot.set(a.id, p); return p; }
    const room = roomOf(a.role);
    const r = ROOMS[room];
    const used = new Set([...deskSlot.values()].map(p => p.join(',')));
    let pos = (r.slots || []).find(p => !used.has(p.join(',')));
    if (!pos && ALT_ROOM[a.role] && ROOMS[ALT_ROOM[a.role]]) { pos = (ROOMS[ALT_ROOM[a.role]].slots || []).find(p => !used.has(p.join(','))); }
    if (!pos) {
      // Salle pleine : débordement sur les chaises libres de la salle de réunion, puis debout le long de ses murs.
      // Jamais en bas de l'image (accueil).
      const m = ROOMS.meeting;
      for (const k of meetingSeat.values()) { used.add(m.seats[k].join(',')); } // chaises prises par un rapport en cours
      pos = m.seats.concat(m.standing || []).find(p => !used.has(p.join(',')));
      if (!pos) {
        roomCursor.overflow = (roomCursor.overflow || 0) + 1;
        pos = [m.x + 40 + ((roomCursor.overflow - 1) % 7) * Math.max(40, (m.w - 80) / 7), m.y + 60];
      }
      overflowIds.add(a.id);
    }
    deskSlot.set(a.id, pos);
    return pos;
  }
  function layout(session, exchanges) {
    const t = now();
    const out = new Map();
    const agents = [session.manager, ...session.agents].filter(Boolean).sort((x, y) => x.startedAt - y.startedAt);
    let visitor = 0;
    const reporting = new Set(agents.filter(a => a.kind !== 'manager' && phaseOf(a, exchanges, t) === 'reporting').map(a => a.id));
    for (const id of [...meetingSeat.keys()]) { if (!reporting.has(id)) { meetingSeat.delete(id); } }
    for (const a of agents) {
      const phase = phaseOf(a, exchanges, t);
      let pos;
      if (a.kind === 'manager') { pos = phase === 'meeting' ? ROOMS.meeting.head : ROOMS.manager.desk; }
      else if (phase === 'briefing' || phase === 'waiting') { pos = ROOMS.manager.visitors[Math.min(visitor++, ROOMS.manager.visitors.length - 1)]; }
      else if (phase === 'reporting') {
        if (!meetingSeat.has(a.id)) {
          const taken = new Set(meetingSeat.values());
          const asDesk = new Set([...deskSlot.values()].map(p => p.join(',')));
          let i = ROOMS.meeting.seats.findIndex((p, k) => !taken.has(k) && !asDesk.has(p.join(',')));
          if (i < 0) { i = meetingSeat.size % ROOMS.meeting.seats.length; }
          meetingSeat.set(a.id, i);
        }
        pos = ROOMS.meeting.seats[meetingSeat.get(a.id)];
      }
      else { pos = deskFor(a); }
      out.set(a.id, { phase, pos, sitting: (phase === 'work' || phase === 'rest' || phase === 'desk') && !overflowIds.has(a.id) });
    }
    return out;
  }

  // ---------- DOM ----------
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="topbar">
      <h1 class="title">Agent-Verse</h1>
      <div class="counts"></div>
      <div class="spacer"></div>
      <div class="controls">
        <div class="seg"><button data-scope="workspace" title="Seulement les sessions du dossier ouvert dans VS Code">Ce projet</button><button data-scope="all" title="Toutes les sessions Claude de la machine">Toute la machine</button></div>
        <label class="chk"><input type="checkbox" id="chk-idle"> au repos</label>
        <label class="chk"><input type="checkbox" id="chk-done"> terminés</label>
        <button class="iconbtn" id="btn-sound" title="Sons"></button><button class="iconbtn maponly" id="btn-fit" title="Tout voir">⤢</button><select class="maponly" id="sel-follow" title="Centrer la caméra sur un agent"></select>
      </div>
      <div class="tabs"></div>
    </div>
    <div class="main">
      <div class="stage-wrap"><div class="stage"></div></div>
      <aside class="side">
        <div class="side-tabs"><button data-side="feed" class="on">Fil d’activité</button><button data-side="agent"></button><span class="spacer"></span><button class="fold" title="Replier / déplier le fil">▾</button></div>
        <div class="side-body"></div>
      </aside>
    </div>`;
  const stage = app.querySelector('.stage');
  const stageWrap = app.querySelector('.stage-wrap');
  const sideBody = app.querySelector('.side-body');
  let sideTab = 'feed';
  let stageKey = '';
  const chars = new Map();     // id → élément
  const lastPos = new Map();   // id → 'x,y'
  const seenExchanges = new Set();
  const seenFx = new Set();
  const wasWaiting = new Set();
  let firstSnapshot = true;

  function fitStage() {
    const w = stageWrap.clientWidth, h = stageWrap.clientHeight;
    if (!w || !h) { return; }
    if (mapMode()) {
      if (cam.auto) { cam.k = Math.min(w / W, h / H, 1.2); cam.tx = (w - W * cam.k) / 2; cam.ty = Math.max(0, (h - H * cam.k) / 2); }
      stage.style.marginLeft = '0'; stage.style.marginTop = '0';
      stage.style.transform = `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.k})`;
      return;
    }
    const k = Math.min(w / W, h / H, 1.4);
    stage.style.transform = `scale(${k})`;
    stage.style.marginLeft = Math.max(0, (w - W * k) / 2) + 'px';
    stage.style.marginTop = Math.max(0, (h - H * k) / 2) + 'px';
  }
  stageWrap.addEventListener('wheel', e => {
    if (!mapMode()) { return; }
    e.preventDefault();
    const r = stageWrap.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top;
    const k2 = Math.min(3, Math.max(0.12, cam.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    cam.tx = mx - (mx - cam.tx) * (k2 / cam.k); cam.ty = my - (my - cam.ty) * (k2 / cam.k); cam.k = k2; cam.auto = false; state.follow = null;
    fitStage(); renderTop();
  }, { passive: false });
  let drag = null;
  stageWrap.addEventListener('pointerdown', e => { if (mapMode() && e.button === 0) { drag = { x: e.clientX, y: e.clientY, tx: cam.tx, ty: cam.ty, moved: false }; } });
  window.addEventListener('pointermove', e => {
    if (!drag) { return; }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) { return; }
    drag.moved = true; cam.auto = false; state.follow = null; cam.tx = drag.tx + dx; cam.ty = drag.ty + dy; fitStage();
  });
  window.addEventListener('pointerup', () => { if (drag && drag.moved) { stageWrap._dragged = now(); } drag = null; });
  stageWrap.addEventListener('click', e => { if (stageWrap._dragged && now() - stageWrap._dragged < 300) { e.stopPropagation(); } }, true);
  function followAgent() {
    if (!mapMode() || !state.follow) { return; }
    const el = chars.get(state.follow);
    if (!el) { return; }
    const w = stageWrap.clientWidth, h = stageWrap.clientHeight;
    const x = parseFloat(el.style.left), y = parseFloat(el.style.top);
    cam.auto = false; cam.k = Math.max(cam.k, 0.6); cam.tx = w / 2 - x * cam.k; cam.ty = h / 2 - (y - 60) * cam.k;
    fitStage();
  }
  new ResizeObserver(fitStage).observe(stageWrap);
  applyStyle();

  function roomsHtml() {
    if (mapMode()) { return '<div class="rooms">' + BLD().html() + '</div>'; }
    let h = '<div class="rooms">';
    for (const [key, r] of Object.entries(ROOMS)) {
      h += `<div class="room room-${key}" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;--room:${r.bg};--accent:${r.accent}"><div class="room-label">${esc(r.label)}</div></div>`;
    }
    const m = ROOMS.manager.desk;
    const tb = ROOMS.meeting.table;
    if (imgMode()) {
      return h + '</div>';
    }
    h += `<div class="deskph boss" style="left:${m[0]}px;top:${m[1]}px"></div>`;
    h += `<div class="table" style="left:${tb[0]}px;top:${tb[1]}px"></div>`;
    h += `<div class="deco plant" style="left:410px;top:${CORRIDOR_Y + 10}px">🪴</div><div class="deco coffee" style="left:1140px;top:${CORRIDOR_Y + 10}px">☕</div><div class="deco door" style="left:${ENTRANCE[0]}px;top:${CORRIDOR_Y - 6}px">🚪 Entrée</div>`;
    return h + '</div>';
  }
  function emptyHtml(snap) {
    return `<div class="empty"><h2>Personne au bureau</h2>
      <p>Aucune session Claude Code ${snap && snap.scope === 'workspace' ? 'dans le dossier ouvert' : 'sur cette machine'} pour le moment.</p>
      <p>Lance Claude Code, donne-lui une tâche, et l’équipe arrive toute seule.</p>
      ${snap && snap.scope === 'workspace' ? '<p>Tu peux aussi passer en <b>Toute la machine</b> pour voir les autres projets.</p>' : ''}</div>`;
  }

  const icon = name => `<img class="ico" draggable="false" alt="" src="${MEDIA}icones/${name}.png">`;
  function spriteHtml(role, isManager) {
    if (!imgMode()) { return sprite(role); }
    const r = spriteBase(role);
    let h = POSES.map(p => `<img class="pose pose-${p}" draggable="false" alt="" src="${MEDIA}sprites/${r}-${p}.png">`).join('');
    // Bandes d'animation (media/anim/<role>-<anim>.png, cases carrées) quand elles existent.
    for (const k of ANIM_KEYS) {
      const an = SPRITE_INFO.anims[r + '-' + k];
      if (!an) { continue; }
      const cell = figureHeight(isManager, k === 'clavier') / (an.feet - an.top);
      h += `<div class="anim anim-${k}" style="width:${cell}px;height:${cell}px;margin-bottom:${-(1 - an.feet) * cell}px;background-image:url('${MEDIA}anim/${r}-${k}.png');background-size:${an.frames * 100}% 100%" data-frames="${an.frames}" data-cell="${cell}"></div>`;
    }
    return h;
  }
  // Hauteur affichée d'un personnage (pieds → haut de la tête), en px du plateau.
  function figureHeight(isManager, sitting) { return sitting ? (isManager ? 102 : 94) : (isManager ? 112 : 104); }
  // Où est la tête d'un personnage dans sa boîte (150 px de large, pieds en bas) selon la pose affichée.
  function headOf(a, pose, flip) {
    const r = spriteBase(a.role), isMgr = a.kind === 'manager';
    const an = pose === 'marche' && SPRITE_INFO.anims[r + '-marche'];
    const sitting = pose === 'assis';
    const h = figureHeight(isMgr, sitting);
    let w, hx;
    if (an) { w = h / (an.feet - an.top); hx = an.headX; }
    else { const sp = SPRITE_INFO.sprites[r + '-' + pose]; w = sp ? h * sp.w / sp.h : 60; hx = sp ? sp.headX : 0.5; }
    if (flip && pose === 'marche') { hx = 1 - hx; }
    return { x: 75 - w / 2 + hx * w, top: h };
  }
  function charHtml(a) {
    const r = ROLE[a.role] || ROLE.autre;
    return `<div class="char ${a.kind} role-${a.role}" data-id="${esc(a.id)}" title="Clique : fiche et conversation · double-clic : journal">
      <div class="tag"></div>
      <div class="bubble"><span class="bubble-text"></span><span class="ago"></span></div>
      <div class="sprite">${spriteHtml(a.role, a.kind === 'manager')}</div>
      <div class="plate ${faceUrl(a.role) ? 'has-face' : ''}">${faceUrl(a.role) ? `<img class="face" alt="" draggable="false" src="${faceUrl(a.role)}">` : ''}<span class="role">${esc(a.kind === 'manager' ? 'Manager' : (a.role === 'autre' && a.agentType ? a.agentType : r.label))}</span><span class="name"></span></div>
    </div>`;
  }

  function renderStage() {
    const snap = state.snapshot;
    const s = currentSession(allSessions());
    curSessionId = s ? s.id : 'none';
    const key = curSessionId + '|' + (imgMode() ? 'img' : 'svg') + '|' + (mapMode() ? 'bld' : 'flat');
    if (key !== stageKey) {
      stageKey = key;
      chars.clear(); lastPos.clear(); deskSlot.clear(); overflowIds.clear(); meetingSeat.clear(); roomCursor.overflow = 0;
      applyStyle();
      stage.innerHTML = roomsHtml() + (s ? '' : emptyHtml(snap));
      fitStage();
      // Au premier rendu d'une session, tout le monde apparaît directement à sa place.
      stage.classList.add('no-anim');
      syncChars(s, true);
      void stage.offsetWidth;
      setTimeout(() => stage.classList.remove('no-anim'), 50);
      return;
    }
    syncChars(s, false);
  }

  // Ajoute les nouveaux personnages (par la porte d'entrée), retire ceux qui ne sont plus là.
  function syncChars(s, instant) {
    if (!s) { return; }
    const wanted = [s.manager, ...s.agents].filter(Boolean).filter(a => state.showDone || a.status !== 'done');
    const ids = new Set(wanted.map(a => a.id));
    for (const [id, el] of chars) { if (!ids.has(id)) { el.remove(); chars.delete(id); lastPos.delete(id); deskSlot.delete(id); overflowIds.delete(id); if (mapMode()) { BLD().release(id); } } }
    for (const a of wanted) {
      if (chars.has(a.id)) { continue; }
      const el = htmlToEl(charHtml(a));
      const fromDoor = !instant && a.kind !== 'manager';
      if (fromDoor) {
        el.classList.add('no-anim');
        el.style.left = ENTRANCE[0] + 'px'; el.style.top = ENTRANCE[1] + 'px';
        lastPos.set(a.id, ENTRANCE.join(','));
      }
      stage.appendChild(el);
      chars.set(a.id, el);
      if (fromDoor) { void el.offsetWidth; el.classList.remove('no-anim'); }
    }
    updateChars(s, instant, wanted);
    if (mapMode() && roomsDirty) { refreshRooms(); }
  }

  function updateChars(s, instant, agents) {
    const t = now();
    const ex = (state.snapshot.exchanges || []).filter(x => x.fromId.startsWith(s.id) || x.toId.startsWith(s.id));
    const lay = layout(s, ex);
    const reportingIds = new Set();
    for (const a of agents) {
      const el = chars.get(a.id);
      if (!el) { continue; }
      const l = lay.get(a.id);
      const posKey = l.pos.join(',');
      if (lastPos.get(a.id) !== posKey) {
        const prev = (lastPos.get(a.id) || posKey).split(',').map(Number);
        lastPos.set(a.id, posKey);
        if (instant) { el.style.transitionDuration = '0s'; el.style.left = l.pos[0] + 'px'; el.style.top = l.pos[1] + 'px'; }
        else { walkAlong(el, prev, l.pos); }
      }
      const walking = el.classList.contains('walking');
      const flip = el.classList.contains('flip');
      const quiet = a.status === 'done' && t - (a.finishedAt || a.lastActivityAt) > REPORT_MS + QUIET_MS;
      if (l.phase === 'reporting') { reportingIds.add(a.id); placeReportDoc(a, l.pos); }
      const hasAnims = imgMode() ? ANIM_KEYS.filter(k => SPRITE_INFO.anims[spriteBase(a.role) + '-' + k]).map(k => 'has-' + k).join(' ') : '';
      el.className = `char ${a.kind} role-${a.role} act-${a.activity} ph-${l.phase} ${l.sitting && !walking ? 'sitting' : 'standing'} ${walking ? 'walking' : ''} ${flip ? 'flip' : ''} ${quiet ? 'quiet' : ''} ${hasAnims} ${state.selected === a.id ? 'selected' : ''}`;
      el.style.zIndex = String(10 + Math.round(l.pos[1] / 10));
      let tagText = l.phase === 'briefing' ? 'GO!' : l.phase === 'reporting' ? 'RAPPORT' : (ACT[a.activity] || ACT.thinking).tag;
      if (a.role === '3d' && a.status !== 'done' && /blender|rend(u|er)|\.blend\b/i.test(a.currentTool ? a.currentTool.label : '')) {
        tagText = 'RENDER!';
        const k = a.id + ':render:' + a.currentTool.startedAt;
        if (!seenFx.has(k)) { seenFx.add(k); if (!firstSnapshot) { burst('RENDER!', l.pos, 'call'); } }
      }
      if (a.role === 'git' && a.status !== 'done') {
        const toolLbl = a.currentTool ? a.currentTool.label : '';
        if (/git push/i.test(toolLbl)) {
          tagText = 'PUSH!';
          const k = a.id + ':push:' + a.currentTool.startedAt;
          if (!seenFx.has(k)) { seenFx.add(k); if (!firstSnapshot) { burst('PUSH!', l.pos, 'call'); } }
        } else if (/(^|[^a-z])ci([^a-z]|$).{0,40}(ok|vert|pass|réussi|succ)/i.test(a.lastText || '')) {
          tagText = 'CI OK!';
          const k = a.id + ':ci:' + a.lastActivityAt;
          if (!seenFx.has(k)) { seenFx.add(k); if (!firstSnapshot) { burst('CI OK!', l.pos, 'done'); } }
        }
      }
      const tag = el.querySelector('.tag');
      tag.textContent = tagText;
      if (el._lastTag === undefined || instant) { el._lastTag = tagText; }
      else if (tagText !== el._lastTag) {
        el._lastTag = tagText;
        const cls = /^(DONE!|RAPPORT|CI OK!)$/.test(tagText) ? 'done' : /^(CALL!|PUSH!|GO!)$/.test(tagText) ? 'call' : 'alert';
        el._pendingBurst = { text: tagText, cls };
      }
      const b = bubbleText(a, l.phase);
      const bubble = el.querySelector('.bubble');
      // La traîne de la bulle (en bas à gauche de l'image) pointe vers la tête : bulle décalée à droite,
      // ou en miroir et décalée à gauche quand le personnage est près du bord droit.
      if (imgMode()) {
        // Bulle au-dessus de la tête réelle du sprite, la traîne finissant juste au-dessus de la tête ;
        // en miroir (traîne à droite) quand elle déborderait du plateau à droite.
        const pose = walking ? 'marche' : (l.sitting && !walking) ? 'assis' : 'debout';
        const head = headOf(a, pose, flip);
        const mirror = l.pos[0] - 75 + head.x + 140 > W;
        bubble.className = 'bubble ' + b.cls + (mirror ? ' mirror' : '');
        bubble.style.left = Math.round(mirror ? head.x - 139 : head.x - 17) + 'px';
        bubble.style.bottom = Math.round(head.top + 2) + 'px';
        tag.style.left = Math.round(mirror ? head.x + 12 : head.x - 64) + 'px';
        tag.style.bottom = Math.round(head.top - 10) + 'px';
        if (el._pendingBurst) { burst(el._pendingBurst.text, [l.pos[0] - 75 + head.x - 70, l.pos[1] - head.top + 40], el._pendingBurst.cls); el._pendingBurst = null; }
      } else {
        if (el._pendingBurst) { burst(el._pendingBurst.text, [l.pos[0] - 70, l.pos[1] - 60], el._pendingBurst.cls); el._pendingBurst = null; }
        bubble.className = 'bubble ' + b.cls;
        bubble.style.left = bubble.style.bottom = tag.style.left = tag.style.bottom = '';
      }
      bubble.title = b.text + (b.ago ? ' · ' + b.ago : '');
      bubble.querySelector('.bubble-text').textContent = b.text;
      bubble.querySelector('.ago').textContent = b.ago;
      el.querySelector('.name').textContent = a.name;
    }
    for (const d of stage.querySelectorAll('.table-doc')) { if (!reportingIds.has(d.dataset.select)) { d.remove(); } }
    // Courriers : missions qui partent, rapports qui reviennent.
    for (const x of ex) {
      if (seenExchanges.has(x.id)) { continue; }
      seenExchanges.add(x.id);
      if (firstSnapshot && t - x.at > 15000) { continue; }
      if (t - x.at > 60000) { continue; }
      const from = lay.get(x.fromId), to = lay.get(x.toId);
      if (!from || !to) { continue; }
      flyMail(x, from.pos, x.kind === 'report' ? [ROOMS.meeting.table[0], ROOMS.meeting.table[1] + 70] : to.pos);
      if (x.kind === 'report') { burst('DONE!', ROOMS.meeting.table, 'done'); chime('report'); }
      else { burst('CALL!', ROOMS.manager.desk, 'call'); }
    }
  }

  // Points de passage entre deux positions : couloir du haut (sous les bureaux du haut), couloir du bas (sol libre),
  // et deux passages verticaux entre les salles. En mode dessiné, on marche tout droit.
  function route(from, to) {
    if (mapMode()) { return BLD().route(from, to); }
    if (!imgMode()) { return [to]; }
    const C = ZONES.corridors;
    const low = p => p[1] >= ZONES.bottomFrom;
    if (low(from) === low(to) && Math.abs(from[1] - to[1]) < 40) { return [to]; }
    const cyA = low(from) ? C.bottom : C.top, cyB = low(to) ? C.bottom : C.top;
    const pts = [[from[0], cyA]];
    if (cyA !== cyB) {
      const mid = (from[0] + to[0]) / 2;
      const vx = C.verticals.reduce((b, x) => (Math.abs(x - mid) < Math.abs(b - mid) ? x : b));
      pts.push([vx, cyA], [vx, cyB]);
    }
    pts.push([to[0], cyB], to);
    return pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 2);
  }
  // Fait marcher un personnage le long d'un trajet, à vitesse constante, en repartant de là où il est vraiment.
  function walkAlong(el, from, to) {
    const cs = getComputedStyle(el);
    const cur = [parseFloat(cs.left), parseFloat(cs.top)].map((v, i) => (Number.isFinite(v) ? v : from[i]));
    const pts = route(cur, to);
    clearTimeout(el._walkTimer);
    el.classList.add('walking');
    const step = i => {
      if (i >= pts.length) { el.classList.remove('walking'); el.classList.remove('in-lift'); return; }
      const p0 = i === 0 ? cur : pts[i - 1], p1 = pts[i];
      const dist = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const dur = Math.max(0.15, Math.min(4.5, dist / SPEED));
      if (Math.abs(p1[0] - p0[0]) > 2) { el.classList.toggle('flip', p1[0] < p0[0]); }
      const lift = !!p1[2];
      el.classList.toggle('in-lift', lift);
      if (lift && mapMode()) { BLD().moveCabin(stage, p0[1], p1[1], dur); }
      el.style.transitionDuration = dur + 's';
      el.style.left = p1[0] + 'px'; el.style.top = p1[1] + 'px';
      el._walkTimer = setTimeout(() => step(i + 1), dur * 1000 + 30);
    };
    step(0);
  }

  // Document posé sur la table devant l'agent qui rend son rapport ; le verdict au survol, la conversation au clic.
  function placeReportDoc(a, seat) {
    const tb = ROOMS.meeting.table;
    let d = [...stage.querySelectorAll('.table-doc')].find(x => x.dataset.select === a.id);
    if (!d) {
      d = document.createElement('div');
      d.className = 'table-doc on';
      d.dataset.select = a.id;
      d.innerHTML = imgMode() ? icon('document') : '📄';
      stage.appendChild(d);
    }
    d.style.left = Math.round(seat[0] + (tb[0] - seat[0]) * 0.55) + 'px';
    d.style.top = Math.round(seat[1] - 20 + (tb[1] - seat[1]) * 0.55) + 'px';
    d.title = 'Rapport de ' + a.name + ' : ' + cut(a.lastText || 'terminé', 220) + '\n(clic : la conversation complète)';
  }

  // Petite onomatopée qui éclate puis disparaît (CALL! quand un brief part, DONE! quand un rapport arrive).
  function burst(text, at, cls) {
    const el = document.createElement('div');
    el.className = 'burst ' + cls + (imgMode() ? ' img' : '');
    if (imgMode()) { el.innerHTML = icon(cls === 'done' ? 'eclat-vert' : 'eclat-jaune') + '<span></span>'; el.querySelector('span').textContent = text; }
    // (en mode images, l'étoile est l'image elle-même : ses proportions sont celles du fichier eclat-*.png)
    else { el.textContent = text; }
    el.style.left = (at[0] + 70) + 'px'; el.style.top = (at[1] - 70) + 'px';
    el.dataset.t = String(now()); el.dataset.life = '1600';
    el.addEventListener('animationend', () => el.remove());
    stage.appendChild(el);
    setTimeout(() => el.remove(), 1700);
  }

  function flyMail(x, from, to) {
    const el = document.createElement('div');
    el.className = 'mail ' + x.kind;
    el.dataset.x = x.id;
    el.innerHTML = `<span class="mail-ico">${imgMode() ? icon(x.kind === 'brief' ? 'enveloppe' : 'document') : (x.kind === 'brief' ? '📋' : '📨')}</span><span class="mail-lbl">${x.kind === 'brief' ? 'MISSION' : 'RAPPORT'}</span><span class="mail-txt">${esc(cut(x.summary, 50))}</span>`;
    el.style.left = from[0] + 'px'; el.style.top = (from[1] - 120) + 'px';
    el.dataset.t = String(now()); el.dataset.life = '4300';
    stage.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => { el.style.left = to[0] + 'px'; el.style.top = (to[1] - 120) + 'px'; el.classList.add('fly'); }));
    setTimeout(() => el.classList.add('land'), 1900);
    setTimeout(() => el.classList.add('gone'), 3600);
    setTimeout(() => el.remove(), 4200);
  }

  // ---------- Barre du haut ----------
  function renderTop() {
    const snap = state.snapshot;
    const agents = snap ? snap.agents : [];
    const n = st => agents.filter(a => a.status === st).length;
    const top = app.querySelector('.topbar');
    top.querySelector('.counts').innerHTML = `
      <span class="pill run ${n('running') ? '' : 'zero'}">${n('running')} en cours</span>
      <span class="pill wait ${n('waiting') ? '' : 'zero'}">${n('waiting')} attend${n('waiting') > 1 ? 'ent' : ''}</span>
      <span class="pill done ${n('done') ? '' : 'zero'}">${n('done')} terminé${n('done') > 1 ? 's' : ''}</span>`;
    top.querySelector('[data-scope="workspace"]').classList.toggle('on', !snap || snap.scope === 'workspace');
    top.querySelector('[data-scope="all"]').classList.toggle('on', !!snap && snap.scope === 'all');
    top.querySelector('#chk-idle').checked = state.showIdle;
    top.querySelector('#chk-done').checked = state.showDone;
    top.querySelector('#btn-sound').textContent = state.sounds ? '🔔' : '🔕';
    const sel = top.querySelector('#sel-follow');
    if (sel) {
      const cur = currentSession(allSessions());
      const list = cur ? [cur.manager, ...cur.agents].filter(Boolean) : [];
      const opts = ['<option value="">Suivre…</option>'].concat(list.map(a => `<option value="${esc(a.id)}" ${state.follow === a.id ? 'selected' : ''}>${esc((a.kind === 'manager' ? 'Manager' : (ROLE[a.role] || ROLE.autre).label) + ' · ' + oneLine(a.name, 28))}</option>`));
      const html = opts.join('');
      if (sel._html !== html) { sel._html = html; sel.innerHTML = html; }
    }
    const sessions = allSessions();
    const cur = currentSession(sessions);
    top.querySelector('.tabs').innerHTML = sessions.map(s => {
      const l = sessionLabel(s);
      const name = s.manager ? s.manager.name : 'Session ' + s.id.slice(0, 8);
      const where = s.manager ? base(s.manager.cwd || '') : '';
      return `<button class="tab ${cur && cur.id === s.id ? 'on' : ''}" data-session="${esc(s.id)}" title="${esc(name)}"><span class="dot ${l.cls}"></span><span class="tab-name">${esc(name)}</span>${where ? `<span class="tab-where">${esc(where)}</span>` : ''}<span class="tab-state ${l.cls}">${l.text}</span></button>`;
    }).join('');
  }

  // ---------- Colonne de droite ----------
  function renderSide() {
    const snap = state.snapshot;
    const sel = snap && snap.agents.find(a => a.id === state.selected);
    const tabs = app.querySelector('.side-tabs');
    tabs.querySelector('[data-side="feed"]').classList.toggle('on', sideTab === 'feed' || !sel);
    const tb = tabs.querySelector('[data-side="agent"]');
    tb.textContent = sel ? sel.name : '';
    tb.style.display = sel ? '' : 'none';
    tb.classList.toggle('on', sideTab === 'agent' && !!sel);
    if (sideTab === 'agent' && sel) { renderAgentPanel(sel); } else { renderFeed(); }
  }

  function feedAvatar(role) {
    const r = ROLE[role] || ROLE.autre;
    const dot = `<span class="rdot" style="--c:${r.color}"></span>`;
    if (!imgMode()) { return dot; }
    const face = faceUrl(role);
    return dot + (face ? `<img class="avatar face" alt="" draggable="false" src="${face}">` : `<img class="avatar" alt="" draggable="false" src="${MEDIA}sprites/${spriteBase(role)}-debout.png">`);
  }
  function feedRow(f) {
    const key = f.at + '|' + f.agentId + '|' + f.kind;
    const open = state.openFeed.has(key);
    const card = f.kind === 'brief' || f.kind === 'report';
    return `<div class="fi k-${f.kind} ${f.isError ? 'err' : ''} ${open ? 'open' : ''} ${card ? 'card' : ''}" data-key="${esc(key)}" data-agent="${esc(f.agentId)}" ${f.exchangeId ? `data-x="${esc(f.exchangeId)}"` : ''} title="${card ? 'Ouvrir la conversation' : (open ? 'Replier' : 'Déplier')}">
      <span class="t">${time(f.at)}</span>
      <span class="txt"><span class="ico">${FEED_ICON[f.kind] || '•'}</span>${md(f.text)}${f.path ? ` <a data-path="${esc(f.path)}" title="${esc(f.path)}">ouvrir</a>` : ''}</span>
      ${f.detail ? `<span class="detail">${md(f.detail)}</span>` : ''}
    </div>`;
  }
  function renderFeed() {
    const snap = state.snapshot;
    const sessions = allSessions();
    const cur = currentSession(sessions);
    const items = (snap && snap.feed || []).filter(f => {
      if (cur && !f.agentId.startsWith(cur.id)) { return false; }
      for (const [k, def] of Object.entries(FEED_KINDS)) { if (def.kinds.includes(f.kind)) { return state.filters[k]; } }
      return true;
    });
    const chips = Object.entries(FEED_KINDS).map(([k, def]) => `<button class="chip ${state.filters[k] ? 'on' : ''}" data-filter="${k}">${def.label}</button>`).join('');
    // Regroupement : les actions consécutives d'un même agent sous un seul en-tête ; les échanges restent des cartes à part.
    let h = '', group = null;
    const close = () => { if (group) { h += '</div></div>'; group = null; } };
    for (const f of items) {
      if (f.kind === 'brief' || f.kind === 'report') { close(); h += feedRow(f); continue; }
      if (!group || group !== f.agentId) {
        close();
        group = f.agentId;
        const r = ROLE[f.role] || ROLE.autre;
        h += `<div class="fg"><div class="fg-head" data-select="${esc(f.agentId)}" title="Fiche et conversation de cet agent" style="--c:${r.color}">${feedAvatar(f.role)}<span class="who">${esc(f.agentName)}</span><span class="rl">${esc(r.label)}</span></div><div class="fg-rows">`;
      }
      h += feedRow(f);
    }
    close();
    sideBody.innerHTML = `<div class="filters">${chips}</div>
      <div class="feed">${items.length ? h : '<p class="empty-feed">Rien pour l’instant. Les actions des agents apparaîtront ici au fur et à mesure.</p>'}</div>`;
  }

  function conversationHtml(a) {
    const ex = (state.snapshot.exchanges || []).filter(x => x.fromId === a.id || x.toId === a.id).sort((p, q) => p.at - q.at);
    if (ex.length === 0) {
      return a.kind === 'manager'
        ? '<p class="hint">Aucune mission envoyée pour l’instant. Les briefs que le manager donne à ses agents et leurs rapports s’afficheront ici.</p>'
        : '<p class="hint">Pas d’échange retrouvé pour cet agent.</p>';
    }
    return ex.map(x => {
      const mine = x.fromId === a.id;
      const fr = ROLE[x.fromRole] || ROLE.autre;
      const open = state.expanded.has(x.id);
      const full = x.text || '';
      const shortTxt = full.length > 600 && !open ? full.slice(0, 600) + '…' : full;
      return `<div class="msg ${mine ? 'mine' : 'theirs'} ${x.kind}">
        <div class="msg-head"><span class="who" style="--c:${fr.color}">${esc(x.fromName)}</span> → ${esc(x.toName)} · ${time(x.at)} · <b>${x.kind === 'brief' ? 'MISSION' : 'RAPPORT'}</b></div>
        <div class="msg-body">${md(shortTxt)}</div>
        ${full.length > 600 ? `<button class="link" data-expand="${esc(x.id)}">${open ? 'Réduire' : 'Voir tout (' + Math.round(full.length / 1000) + ' k caractères)'}</button>` : ''}
      </div>`;
    }).join('');
  }

  function renderAgentPanel(a) {
    const r = ROLE[a.role] || ROLE.autre;
    const t = now();
    const end = a.status === 'done' ? a.lastActivityAt : t;
    const files = [...a.filesWritten.map(f => ({ f, w: true })), ...a.filesRead.filter(f => !a.filesWritten.includes(f)).map(f => ({ f, w: false }))];
    const toolChips = Object.entries(a.toolCounts || {}).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, v]) => `<span class="chip static">${esc(k)} <b>${v}</b></span>`).join('');
    const parent = a.parentId && state.snapshot.agents.find(x => x.id === a.parentId);
    const tk = a.tokens || {};
    const kids = state.snapshot.agents.filter(x => x.parentId === a.id);
    sideBody.innerHTML = `
      <div class="detail-head">
        <span class="role-badge" style="background:${r.color}">${esc(a.kind === 'manager' ? 'Manager' : r.label)}</span>
        <h2>${esc(a.name)}</h2>
        <button class="close" title="Fermer">✕</button>
      </div>
      <div class="detail-body">
        <div class="now">
          <div class="lbl">${esc((STATE_LABEL[a.status] || a.status).toUpperCase())} — ${esc(a.currentTool ? a.currentTool.label : (ACT[a.activity] || {}).verb || a.activity)}</div>
          ${a.currentTool && a.currentTool.detail ? `<div class="det">${esc(a.currentTool.detail)}</div>` : ''}
          ${!a.currentTool && a.lastAction ? `<div class="det">dernière action : ${esc(a.lastAction)}</div>` : ''}
        </div>
        <div class="actions"><button class="btn" data-act="journal">Journal complet</button><button class="btn secondary" data-act="raw">Fichier brut</button></div>

        <h3>Conversation</h3>
        ${parent ? `<p class="hint">Lancé par <b>${esc(parent.name)}</b></p>` : ''}
        ${kids.length ? `<p class="hint">A lancé : ${kids.map(k => `<a class="link" data-select="${esc(k.id)}">${esc(k.name)}</a>`).join(', ')}</p>` : ''}
        <div class="conv">${conversationHtml(a)}</div>

        <h3>Compteurs</h3>
        <dl class="kv">
          <dt>Démarré</dt><dd>${time(a.startedAt)} (${fmtDur(end - a.startedAt)})</dd>
          ${a.kind === 'manager' && a.turnStartedAt ? `<dt>Tour en cours</dt><dd>depuis ${fmtDur(t - a.turnStartedAt)}</dd>` : ''}
          <dt>Dernière activité</dt><dd>${fmtAgo(t - a.lastActivityAt)}</dd>
          <dt>Actions</dt><dd>${a.toolCount}</dd>
          <dt>Tokens produits</dt><dd>${fmtTok(tk.output)}</dd>
          <dt>Contexte actuel</dt><dd>${fmtTok(tk.context)} tokens</dd>
          ${a.model ? `<dt>Modèle</dt><dd>${esc(a.model)}</dd>` : ''}
        </dl>
        <div class="chips">${toolChips}</div>

        <h3>Fichiers (${files.length})</h3>
        ${files.length ? `<ul class="files">${files.map(x => `<li><span class="${x.w ? 'w' : 'r'}">${x.w ? '✎' : '👁'}</span><a data-path="${esc(x.f)}" title="${esc(x.f)}">${esc(base(x.f))}</a></li>`).join('')}</ul>` : '<p class="hint">Aucun fichier touché pour l’instant.</p>'}

        <h3>Dernier message</h3>
        <div class="lasttext">${md(a.lastText || '…')}</div>
      </div>`;
  }

  function renderAll() { renderTop(); renderStage(); renderSide(); }

  // ---------- Événements ----------
  function select(id, openAgentTab) {
    state.selected = id;
    if (openAgentTab) { sideTab = id ? 'agent' : 'feed'; }
    persist();
    renderStage(); renderSide();
  }
  app.addEventListener('click', e => {
    const scopeBtn = e.target.closest('[data-scope]');
    if (scopeBtn) { vscode.postMessage({ type: 'setScope', scope: scopeBtn.dataset.scope }); return; }
    if (e.target.closest('#btn-fit')) { cam.auto = true; state.follow = null; fitStage(); renderTop(); return; }
    if (e.target.closest('#btn-sound')) { state.sounds = !state.sounds; vscode.postMessage({ type: 'setSounds', on: state.sounds }); renderTop(); if (state.sounds) { chime('report'); } return; }
    const tab = e.target.closest('.tab[data-session]');
    if (tab) { state.session = tab.dataset.session; persist(); renderAll(); return; }
    const sideBtn = e.target.closest('[data-side]');
    if (sideBtn) { sideTab = sideBtn.dataset.side; renderSide(); return; }
    const filter = e.target.closest('[data-filter]');
    if (filter) { state.filters[filter.dataset.filter] = !state.filters[filter.dataset.filter]; persist(); renderFeed(); return; }
    const ch = e.target.closest('.char');
    if (ch) { select(state.selected === ch.dataset.id ? null : ch.dataset.id, true); return; }
    const mail = e.target.closest('.mail');
    if (mail) {
      const x = (state.snapshot.exchanges || []).find(y => y.id === mail.dataset.x);
      if (x) { select(x.kind === 'brief' ? x.toId : x.fromId, true); }
      return;
    }
    if (e.target.closest('.close')) { select(null, true); return; }
    const sel = e.target.closest('[data-select]');
    if (sel) { select(sel.dataset.select, true); return; }
    const exp = e.target.closest('[data-expand]');
    if (exp) { const id = exp.dataset.expand; if (state.expanded.has(id)) { state.expanded.delete(id); } else { state.expanded.add(id); } renderSide(); return; }
    const link = e.target.closest('a[data-path]');
    if (link) { vscode.postMessage({ type: 'openFile', path: link.dataset.path }); return; }
    const fi = e.target.closest('.fi');
    if (fi) {
      if (fi.classList.contains('card')) {
        if (fi.dataset.x) { const x = (state.snapshot.exchanges || []).find(y => y.id === fi.dataset.x); if (x) { state.expanded.add(x.id); } }
        select(fi.dataset.agent, true);
      } else {
        // Une ligne du fil : clic pour la déplier ou la replier.
        if (state.openFeed.has(fi.dataset.key)) { state.openFeed.delete(fi.dataset.key); } else { state.openFeed.add(fi.dataset.key); }
        fi.classList.toggle('open');
      }
      return;
    }
    if (e.target.closest('.fold')) { app.querySelector('.side').classList.toggle('collapsed'); return; }
    const act = e.target.closest('[data-act]');
    if (act && state.selected) { vscode.postMessage({ type: act.dataset.act === 'journal' ? 'openJournal' : 'openTranscript', id: state.selected }); }
  });
  app.addEventListener('change', e => {
    if (e.target.id === 'chk-idle') { state.showIdle = e.target.checked; persist(); renderAll(); }
    if (e.target.id === 'chk-done') { state.showDone = e.target.checked; persist(); renderAll(); }
    if (e.target.id === 'sel-follow') { state.follow = e.target.value || null; if (state.follow) { followAgent(); } }
  });
  app.addEventListener('dblclick', e => {
    const ch = e.target.closest('.char');
    if (ch) { vscode.postMessage({ type: 'openJournal', id: ch.dataset.id }); }
  });

  window.addEventListener('message', ev => {
    const m = ev.data;
    if (!m || m.type !== 'snapshot') { return; }
    state.snapshot = m.snapshot;
    if (typeof m.snapshot.sounds === 'boolean') { state.sounds = m.snapshot.sounds; }
    if (m.snapshot.style) { state.style = m.snapshot.style; }
    if (m.snapshot.map) { state.map = m.snapshot.map; }
    // Nouveaux agents qui attendent une réponse → petit son.
    const waitingNow = new Set(m.snapshot.agents.filter(a => a.status === 'waiting').map(a => a.id));
    if (!firstSnapshot) { for (const id of waitingNow) { if (!wasWaiting.has(id)) { chime('waiting'); break; } } }
    wasWaiting.clear(); for (const id of waitingNow) { wasWaiting.add(id); }
    renderAll();
    firstSnapshot = false;
  });

  // Éléments éphémères (éclats, courriers) : jamais de filigrane qui reste, même si la webview a été gelée.
  function purgeTransients(all) {
    const t = now();
    for (const el of stage.querySelectorAll('.burst, .mail')) {
      if (all || t - Number(el.dataset.t || 0) > Number(el.dataset.life || 2000)) { el.remove(); }
    }
  }
  document.addEventListener('visibilitychange', () => purgeTransients(true));

  // Bandes d'animation : une case toutes les 100 ms, pilotée en JS (fiable dans une webview, même en arrière-plan).
  let animFrame = 0;
  setInterval(() => {
    animFrame++;
    for (const el of stage.querySelectorAll('.anim[data-frames]')) {
      if (el.offsetParent === null) { continue; }
      el.style.backgroundPositionX = (-(animFrame % Number(el.dataset.frames)) * Number(el.dataset.cell)) + 'px';
    }
  }, 100);

  // Les durées et les déplacements avancent toutes les secondes même sans nouveau message.
  setInterval(() => { purgeTransients(false); if (mapMode()) { BLD().prune(); if (roomsDirty) { refreshRooms(); } BLD().updateFree(stage); } if (state.snapshot) { renderStage(); followAgent(); if (sideTab === 'agent' && state.selected) { /* les compteurs bougent peu : on laisse */ } } }, 1000);

  renderTop();
  vscode.postMessage({ type: 'ready' });
})();
