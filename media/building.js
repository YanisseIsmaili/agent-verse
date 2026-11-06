/* Agent-Verse : l'immeuble modulaire (vue en coupe, façon maison de poupée).
 *
 * Unités du plateau : un module de pièce fait 384 × 192 (l'image fournie fait 1536 × 768, soit ×4) ;
 * dalle de sol 12 px en bas, plafond 10 px en haut, murs 6 px. Cage d'ascenseur de 96 px à gauche,
 * toit de 96 px, rue de 64 px sous le rez-de-chaussée. Le plan est ancré en haut : ajouter un étage
 * pousse seulement le rez-de-chaussée (où personne n'est assis) vers le bas, les agents installés ne bougent pas.
 *
 * Étage du haut : bureau du manager (1 place) + salle de réunion (2 modules, 6 places + le manager).
 * Étages intermédiaires : 3 pièces de 4 places par étage, ajoutées quand un rôle n'a plus de place.
 * Rez-de-chaussée : hall (3 modules) ; l'entrée est à droite, côté rue.
 * Images (media/map/*.png) chargées automatiquement quand elles existent ; sinon rectangles de couleur.
 */
(function () {
  'use strict';
  const MOD_W = 384, MOD_H = 192, FLOOR = 12, SHAFT_W = 96, ROOF_H = 96, STREET_H = 64, MARGIN = 48, COLS = 3;
  const EMPTY_MS = 10 * 60 * 1000;
  const SERVICES = {
    manager:   { label: 'Manager',       img: 'piece-manager',   bg: '#efe3ff', accent: '#a855f7', slots: 1 },
    meeting:   { label: 'Réunion',       img: 'piece-reunion',   bg: '#fce7f3', accent: '#ec4899', slots: 0 },
    hall:      { label: 'Hall',          img: 'piece-hall',      bg: '#e5e7eb', accent: '#6b7280', slots: 0 },
    dev:       { label: 'Développement', img: 'piece-dev',       bg: '#dbeafe', accent: '#3b82f6', slots: 4 },
    securite:  { label: 'Sécurité',      img: 'piece-securite',  bg: '#fee2e2', accent: '#ef4444', slots: 4 },
    bugs:      { label: 'Tests',         img: 'piece-test',      bg: '#dcfce7', accent: '#22c55e', slots: 4 },
    readme:    { label: 'Rédaction',     img: 'piece-redaction', bg: '#fef9c3', accent: '#f59e0b', slots: 4 },
    git:       { label: 'Git',           img: 'piece-git',       bg: '#dcfce7', accent: '#166534', slots: 4 },
    openspace: { label: 'Open space',    img: 'piece-openspace', bg: '#e0f2fe', accent: '#0ea5e9', slots: 4 },
  };
  const SERVICE_OF_ROLE = { manager: 'manager', dev: 'dev', securite: 'securite', bugs: 'bugs', readme: 'readme', git: 'git', autre: 'openspace' };
  const IMAGES = ['piece-manager', 'piece-reunion', 'piece-hall', 'piece-dev', 'piece-securite', 'piece-test', 'piece-redaction', 'piece-git', 'piece-openspace', 'ascenseur', 'toit', 'ciel', 'rue', 'bureau-libre'];
  const SEAT_X = [70, 157, 244, 331];

  const probed = { set: new Set(), listeners: [], started: false };
  function probeImages(media, onFound) {
    probed.listeners.push(onFound);
    if (!probed.started) {
      probed.started = true;
      for (const name of IMAGES) {
        const im = new Image();
        im.onload = () => { probed.set.add(name); for (const f of probed.listeners) { f(); } };
        im.src = `${media}map/${name}.png`;
      }
    }
    return probed.set;
  }

  // Bordures CSS des pièces (box-sizing: border-box) : l'image de fond occupe l'intérieur.
  const BORDER = { l: 6, r: 6, t: 10, b: 12 };

  function create(media, onChange, places) {
    const PL = places || {};
    const plc = service => PL[SERVICES[service].img] || null;
    const slotCount = service => (plc(service) && plc(service).slots ? plc(service).slots.length : SERVICES[service].slots);
    // Un point donné en fractions de l'image → coordonnées du plateau (pieds du personnage).
    const inRoom = (r, p) => [Math.round(r.x + BORDER.l + p[0] * (r.w - BORDER.l - BORDER.r)), Math.round(r.y + BORDER.t + p[1] * (r.h - BORDER.t - BORDER.b))];
    const B = {
      version: 1,
      floors: [],          // étages intermédiaires, du haut vers le bas : [{ rooms: [room|null, room|null, room|null], emptySince }]
      rooms: {},           // id → room
      byAgent: new Map(),  // agentId → { room, slot }
      images: new Set(),
      cabinFloorY: 0,
    };
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const bump = () => { B.version++; if (onChange) { onChange(); } };

    // Images de la carte : sondées une seule fois pour toute la page ; on passe du provisoire à l'image dès qu'elle arrive.
    B.images = probeImages(media, bump);
    const url = name => (B.images.has(name) ? `url('${media}map/${name}.png')` : '');

    // ----- géométrie -----
    const x0 = MARGIN;                       // bord gauche de l'immeuble (cage d'ascenseur)
    const colX = c => x0 + SHAFT_W + c * MOD_W;
    const topY = MARGIN + ROOF_H;            // haut de l'étage du manager
    const midY = k => topY + MOD_H * (k + 1);
    const groundY = () => topY + MOD_H * (B.floors.length + 1);
    const feetOf = y => y + MOD_H - FLOOR;
    B.size = () => ({ W: MARGIN * 2 + SHAFT_W + COLS * MOD_W, H: groundY() + MOD_H + STREET_H });
    B.entrance = () => [colX(COLS) - 70, feetOf(groundY())];
    B.liftX = x0 + SHAFT_W / 2;

    function makeRoom(service, floorIndex, col) {
      const n = Object.values(B.rooms).filter(r => r.service === service).length + 1;
      const room = { id: `${service}-${n}`, service, floor: floorIndex, col, occupants: new Map(), emptySince: Date.now() };
      B.rooms[room.id] = room;
      return room;
    }
    function roomRect(room) {
      const y = room.service === 'manager' || room.service === 'meeting' ? topY : midY(room.floor);
      const w = room.service === 'meeting' && !plc('meeting') ? MOD_W * 2 : MOD_W;
      return { x: colX(room.col), y, w, h: MOD_H, feet: feetOf(y) };
    }
    function seatsOf(room) {
      const r = roomRect(room);
      const p = plc(room.service);
      if (p && p.slots) { return p.slots.map(s => inRoom(r, s)); }
      return SEAT_X.slice(0, SERVICES[room.service].slots).map(dx => [r.x + dx, r.feet]);
    }

    // Pièces fixes : manager (col 0) et réunion (cols 1-2) en haut.
    const managerRoom = makeRoom('manager', -1, 0);
    const meetingRoom = makeRoom('meeting', -1, 1);

    // ----- places -----
    function addRoom(service) {
      for (let k = 0; k < B.floors.length; k++) {
        const c = B.floors[k].rooms.findIndex(r => !r);
        if (c >= 0) { const room = makeRoom(service, k, c); B.floors[k].rooms[c] = room; bump(); return room; }
      }
      B.floors.push({ rooms: [null, null, null] });
      const room = makeRoom(service, B.floors.length - 1, 0);
      B.floors[B.floors.length - 1].rooms[0] = room;
      bump();
      return room;
    }
    B.assign = function (agent) {
      const known = B.byAgent.get(agent.id);
      if (known) { return seatsOf(known.room)[known.slot]; }
      const service = agent.kind === 'manager' ? 'manager' : (SERVICE_OF_ROLE[agent.role] || 'openspace');
      let room = Object.values(B.rooms).find(r => r.service === service && r.occupants.size < slotCount(service));
      if (!room) { room = addRoom(service); }
      let slot = 0;
      while ([...room.occupants.values()].includes(slot)) { slot++; }
      room.occupants.set(agent.id, slot);
      room.emptySince = 0;
      B.byAgent.set(agent.id, { room, slot });
      bump();
      return seatsOf(room)[slot];
    };
    B.release = function (agentId) {
      const k = B.byAgent.get(agentId);
      if (!k) { return; }
      k.room.occupants.delete(agentId);
      if (k.room.occupants.size === 0) { k.room.emptySince = Date.now(); }
      B.byAgent.delete(agentId);
      bump();
    };
    // Les pièces vides depuis plus de 10 min disparaissent quand tout l'étage du bas est vide depuis 10 min.
    B.prune = function () {
      const t = Date.now();
      while (B.floors.length) {
        const f = B.floors[B.floors.length - 1];
        const stale = f.rooms.every(r => !r || (r.occupants.size === 0 && r.emptySince && t - r.emptySince > EMPTY_MS));
        if (!stale) { break; }
        for (const r of f.rooms) { if (r) { delete B.rooms[r.id]; } }
        B.floors.pop();
        bump();
      }
    };

    // ----- objet ROOMS attendu par le bureau -----
    B.roomsObject = function () {
      const out = {};
      const mr = roomRect(managerRoom), me = roomRect(meetingRoom);
      const pm = plc('manager'), pr = plc('meeting');
      out.manager = { x: mr.x, y: mr.y, w: mr.w, h: mr.h, label: 'Manager', bg: SERVICES.manager.bg, accent: SERVICES.manager.accent,
        desk: pm && pm.desk ? inRoom(mr, pm.desk) : [mr.x + 192, mr.feet],
        visitors: pm && pm.visitors ? pm.visitors.map(p => inRoom(mr, p)) : [[mr.x + 100, mr.feet], [mr.x + 290, mr.feet], [mr.x + 60, mr.feet], [mr.x + 330, mr.feet], [mr.x + 140, mr.feet], [mr.x + 250, mr.feet], [mr.x + 192, mr.feet]] };
      const cx = me.x + me.w / 2;
      out.meeting = { x: me.x, y: me.y, w: me.w, h: me.h, label: 'Réunion', bg: SERVICES.meeting.bg, accent: SERVICES.meeting.accent,
        table: pr && pr.table ? inRoom(me, pr.table) : [cx, me.feet - 56], head: pr && pr.head ? inRoom(me, pr.head) : [cx, me.feet],
        seats: pr && pr.seats ? pr.seats.map(p => inRoom(me, p)) : [[me.x + 120, me.feet], [me.x + 220, me.feet], [me.x + 320, me.feet], [me.x + 450, me.feet], [me.x + 550, me.feet], [me.x + 650, me.feet]] };
      for (const room of Object.values(B.rooms)) {
        if (room.service === 'manager' || room.service === 'meeting') { continue; }
        const r = roomRect(room);
        out[room.id] = { x: r.x, y: r.y, w: r.w, h: r.h, label: SERVICES[room.service].label, bg: SERVICES[room.service].bg, accent: SERVICES[room.service].accent, slots: seatsOf(room) };
      }
      return out;
    };

    // ----- trajets : à pied dans l'étage, par l'ascenseur entre étages -----
    B.route = function (from, to) {
      if (Math.abs(from[1] - to[1]) < 4) { return [to]; }
      return [[B.liftX, from[1]], [B.liftX, to[1], 'lift'], to].filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 2);
    };

    // ----- rendu (provisoire ou images) -----
    B.html = function () {
      const { W, H } = B.size();
      const gy = groundY();
      let h = '';
      const roomDiv = (room, extra) => {
        const r = roomRect(room); const s = SERVICES[room.service];
        const bg = url(s.img);
        return `<div class="room bld-room svc-${room.service}" data-room="${esc(room.id)}" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;--room:${s.bg};--accent:${s.accent};${bg ? `background-image:${bg};` : ''}"><div class="room-label">${esc(s.label)}</div>${extra || ''}</div>`;
      };
      // Toit
      h += `<div class="bld-roof" style="left:${x0}px;top:${MARGIN}px;width:${SHAFT_W + COLS * MOD_W}px;height:${ROOF_H}px;${url('toit') ? `background-image:${url('toit')};` : ''}"></div>`;
      // Cage d'ascenseur + cabine
      h += `<div class="bld-shaft" style="left:${x0}px;top:${topY}px;width:${SHAFT_W}px;height:${gy + MOD_H - topY}px;${url('ascenseur') ? `background-image:${url('ascenseur')};` : ''}"></div>`;
      h += `<div class="bld-cabin" style="left:${x0 + 8}px;top:${B.cabinFloorY || gy}px;width:${SHAFT_W - 16}px;height:${MOD_H}px"><span></span><span></span></div>`;
      // Étage du haut
      h += roomDiv(managerRoom, url('piece-manager') ? '' : `<div class="bld-desk boss" style="left:192px;bottom:${FLOOR}px"></div>`);
      h += roomDiv(meetingRoom, url('piece-reunion') ? '' : `<div class="bld-table" style="left:${roomRect(meetingRoom).w / 2}px;bottom:${FLOOR + 30}px"></div>`);
      // Étages intermédiaires
      for (const f of B.floors) {
        for (let c = 0; c < COLS; c++) {
          const room = f.rooms[c];
          if (!room) { h += `<div class="room bld-room bld-empty" style="left:${colX(c)}px;top:${midY(B.floors.indexOf(f))}px;width:${MOD_W}px;height:${MOD_H}px"></div>`; continue; }
          const seats = seatsOf(room);
          const taken = new Set(room.occupants.values());
          const drawn = !!(plc(room.service) && url(SERVICES[room.service].img));
          const desks = seats.map((p, i) => `<div class="bld-free ${taken.has(i) ? 'taken' : ''} ${drawn ? 'drawn' : ''}" data-slot="${i}" style="left:${p[0] - roomRect(room).x}px;bottom:${FLOOR}px">${url('bureau-libre') ? `<img alt="" draggable="false" src="${media}map/bureau-libre.png">` : ''}</div>`).join('');
          h += roomDiv(room, desks);
        }
      }
      // Rez-de-chaussée : hall sur toute la largeur, rue dessous
      const hallBg = url('piece-hall');
      h += `<div class="room bld-room svc-hall" style="left:${colX(0)}px;top:${gy}px;width:${COLS * MOD_W}px;height:${MOD_H}px;--room:${SERVICES.hall.bg};--accent:${SERVICES.hall.accent};${hallBg ? `background-image:${hallBg};background-size:${MOD_W}px ${MOD_H}px;background-repeat:repeat-x;` : ''}"><div class="room-label">Hall</div><div class="bld-door" style="right:30px;bottom:${FLOOR}px"></div></div>`;
      h += `<div class="bld-street" style="left:0;top:${gy + MOD_H}px;width:${W}px;height:${STREET_H}px;${url('rue') ? `background-image:${url('rue')};` : ''}"></div>`;
      return h;
    };
    B.skyUrl = () => url('ciel');
    B.updateFree = function (stage) {
      for (const room of Object.values(B.rooms)) {
        const el = stage.querySelector(`.bld-room[data-room="${room.id}"]`);
        if (!el) { continue; }
        const taken = new Set(room.occupants.values());
        el.querySelectorAll('.bld-free').forEach(d => d.classList.toggle('taken', taken.has(Number(d.dataset.slot))));
      }
    };
    // Cabine : monte ou descend avec le passager, portes fermées pendant le trajet.
    B.moveCabin = function (stage, fromFeetY, toFeetY, durSec) {
      const cab = stage.querySelector('.bld-cabin');
      if (!cab) { return; }
      cab.style.transitionDuration = '0s';
      cab.style.top = (fromFeetY - MOD_H + FLOOR) + 'px';
      void cab.offsetWidth;
      cab.classList.add('closed');
      cab.style.transitionDuration = durSec + 's';
      cab.style.top = (toFeetY - MOD_H + FLOOR) + 'px';
      B.cabinFloorY = toFeetY - MOD_H + FLOOR;
      clearTimeout(cab._t);
      cab._t = setTimeout(() => cab.classList.remove('closed'), durSec * 1000 + 200);
    };
    return B;
  }

  window.AgentVerseBuilding = { create, SERVICES };
})();
