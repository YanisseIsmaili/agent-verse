// Agent-Verse : les six personnages, dessinés en SVG dans l'esprit du film
// comics (, contours épais, trame de points, couleur
// dominante par rôle). Dessins originaux, aucun visuel protégé n'est utilisé.
//
// Chaque personnage garde le même squelette (classes .head, .body, .arm-l,
// .arm-r, .legs, .desk, .x-*) pour que les animations CSS marchent partout.
(function () {
  'use strict';

  const PALETTE = {
    // Manager : costume noir, accents rouges, emblème araignée rouge graffiti.
    manager:  { suit: '#141414', accent: '#e5131f', pants: '#141414', boots: '#e5131f', eye: '#e5131f', web: '#e5131f' },
    // Développeur : le classique rouge et bleu, toile noire.
    dev:      { suit: '#d8232a', accent: '#1d4ed8', pants: '#1d4ed8', boots: '#d8232a', eye: '#111', web: '#111' },
    // Cybersécurité : noir et blanc, imperméable, chapeau, lunettes rondes.
    securite: { suit: '#2a2a2a', accent: '#9a9a9a', pants: '#1b1b1b', boots: '#0d0d0d', eye: '#fff', web: '#6b6b6b' },
    // Chasseur de bugs : blanc, capuche, rose et turquoise.
    bugs:     { suit: '#f7f7f7', accent: '#ff2d9b', pants: '#121212', boots: '#f7f7f7', eye: '#ff2d9b', web: '#2dd4bf', inner: '#2dd4bf' },
    // Rédacteur README : écolière + petit robot rouge.
    readme:   { suit: '#f9fafb', accent: '#1f2937', pants: '#1f2937', boots: '#7c2d12', eye: '#3b2412', skin: '#ffd9b8', hair: '#1a1024', robot: '#e5131f' },
    // Autre : cochon-araignée, rouge et bleu, gants blancs.
    autre:    { suit: '#d8232a', accent: '#2563eb', pants: '#2563eb', boots: '#d8232a', eye: '#111', web: '#111', skin: '#f9a8d4' },
  };

  const OUT = 'stroke="#000" stroke-width="3" stroke-linejoin="round"';

  // Trame de points (halftone) : un motif par rôle pour éviter les collisions d'id.
  function defs(role) {
    return `<defs>
      <pattern id="ht-${role}" width="3.6" height="3.6" patternUnits="userSpaceOnUse"><circle cx="1.8" cy="1.8" r=".75" fill="#000" opacity=".28"/></pattern>
    </defs>`;
  }
  const HT = role => `url(#ht-${role})`;

  // Toile d'araignée stylisée sur un masque (centre 70,40).
  function web(color, opacity) {
    return `<g fill="none" stroke="${color}" stroke-width="1.3" opacity="${opacity}">
      <path d="M70 14 V66 M44 40 H96 M52 22 L88 58 M88 22 L52 58"/>
      <path d="M58 24 Q70 30 82 24 M52 32 Q70 42 88 32 M50 46 Q70 56 90 46 M56 56 Q70 62 84 56"/>
    </g>`;
  }

  // Grands yeux blancs en amande, typiques du masque.
  function maskEyes(outline, w) {
    return `<path d="M46 44 Q58 18 70 40 Q60 52 46 44Z M94 44 Q82 18 70 40 Q80 52 94 44Z" fill="#fff" stroke="${outline}" stroke-width="${w || 3}" stroke-linejoin="round"/>`;
  }

  function chestEmblem(color, scale, cx, cy) {
    return ''; // pas d'emblème : personnages 100 % originaux
    return `<g transform="translate(${cx} ${cy}) scale(${scale})" fill="${color}" stroke="${color}" stroke-width="2" stroke-linecap="round">
      <ellipse cx="0" cy="2" rx="4.5" ry="7"/><circle cx="0" cy="-7" r="3"/>
      <path d="M-4 -4 L-14 -12 M-4 0 L-16 -2 M-4 4 L-14 8 M-3 7 L-10 16 M4 -4 L14 -12 M4 0 L16 -2 M4 4 L14 8 M3 7 L10 16" fill="none"/>
    </g>`;
  }

  // ---------- Têtes ----------
  function head(role, p) {
    switch (role) {
      case 'manager':
        return `<circle cx="70" cy="40" r="27" fill="${p.suit}" ${OUT}/>
          ${web(p.web, .85)}
          <path d="M70 13 A27 27 0 0 1 70 67Z" fill="${HT(role)}"/>
          ${maskEyes(p.eye, 3.5)}`;
      case 'dev':
        return `<circle cx="70" cy="40" r="27" fill="${p.suit}" ${OUT}/>
          ${web(p.web, .7)}
          <path d="M70 13 A27 27 0 0 1 70 67Z" fill="${HT(role)}"/>
          ${maskEyes('#111', 3)}`;
      case 'securite':
        return `<circle cx="70" cy="42" r="25" fill="${p.suit}" ${OUT}/>
          ${web('#777', .6)}
          <path d="M70 17 A25 25 0 0 1 70 67Z" fill="${HT(role)}"/>
          <circle cx="58" cy="44" r="8" fill="#fff" stroke="#111" stroke-width="3"/><circle cx="82" cy="44" r="8" fill="#fff" stroke="#111" stroke-width="3"/>
          <path d="M66 44 H74" stroke="#111" stroke-width="3"/>
          <ellipse cx="70" cy="22" rx="36" ry="7" fill="#1a1a1a" ${OUT}/>
          <path d="M50 22 L54 2 Q70 -2 86 2 L90 22Z" fill="#242424" ${OUT}/>
          <path d="M52 15 Q70 10 88 15" stroke="#6b6b6b" stroke-width="4" fill="none"/>`;
      case 'bugs':
        return `<path d="M34 34 Q70 -12 106 34 L108 74 Q70 84 32 74Z" fill="${p.suit}" ${OUT}/>
          <path d="M42 36 Q70 2 98 36 L99 68 Q70 76 41 68Z" fill="${p.inner}" stroke="#000" stroke-width="2"/>
          <path d="M70 36 V68 M48 50 H92 M54 40 L86 62 M86 40 L54 62" stroke="#0f766e" stroke-width="1.2" opacity=".6" fill="none"/>
          <circle cx="70" cy="46" r="23" fill="#fff" ${OUT}/>
          <path d="M70 23 A23 23 0 0 1 70 69Z" fill="${HT(role)}"/>
          <path d="M50 50 Q60 28 70 46 Q61 56 50 50Z M90 50 Q80 28 70 46 Q79 56 90 50Z" fill="#fff" stroke="${p.eye}" stroke-width="3.5" stroke-linejoin="round"/>`;
      case 'readme':
        return `<circle cx="70" cy="44" r="24" fill="${p.skin}" ${OUT}/>
          <path d="M70 20 A24 24 0 0 1 70 68Z" fill="${HT(role)}" opacity=".7"/>
          <path d="M44 48 Q40 8 70 10 Q100 8 96 48 L96 36 Q90 28 84 34 Q78 22 70 32 Q62 22 54 36 Q48 28 44 36Z" fill="${p.hair}" ${OUT}/>
          <path d="M44 48 L44 60 Q48 52 50 44Z M96 48 L96 60 Q92 52 90 44Z" fill="${p.hair}" ${OUT}/>
          <ellipse cx="60" cy="48" rx="5" ry="7" fill="#fff" stroke="#000" stroke-width="2"/><ellipse cx="80" cy="48" rx="5" ry="7" fill="#fff" stroke="#000" stroke-width="2"/>
          <circle cx="61" cy="49" r="3.2" fill="${p.eye}"/><circle cx="81" cy="49" r="3.2" fill="${p.eye}"/>
          <circle cx="62" cy="47" r="1.2" fill="#fff"/><circle cx="82" cy="47" r="1.2" fill="#fff"/>
          <path d="M66 60 Q70 63 74 60" stroke="#000" stroke-width="2" fill="none"/>`;
      case 'autre':
      default:
        return `<path d="M44 26 L36 4 L58 18Z M96 26 L104 4 L82 18Z" fill="${p.skin}" ${OUT}/>
          <circle cx="70" cy="42" r="27" fill="${p.skin}" ${OUT}/>
          <path d="M44 38 Q44 16 70 15 Q96 16 96 38 Q84 46 70 44 Q56 46 44 38Z" fill="${p.suit}" ${OUT}/>
          <path d="M70 15 V44 M50 30 L90 30 M56 22 L84 40 M84 22 L56 40" stroke="#111" stroke-width="1.2" opacity=".6" fill="none"/>
          <path d="M70 15 A27 27 0 0 1 70 69Z" fill="${HT(role)}" opacity=".8"/>
          <path d="M50 36 Q58 20 70 34 Q62 42 50 36Z M90 36 Q82 20 70 34 Q78 42 90 36Z" fill="#fff" stroke="#111" stroke-width="3" stroke-linejoin="round"/>
          <ellipse cx="70" cy="54" rx="11" ry="7" fill="#f472b6" ${OUT}/>
          <circle cx="66" cy="54" r="1.8" fill="#000"/><circle cx="74" cy="54" r="1.8" fill="#000"/>`;
    }
  }

  // ---------- Torses ----------
  function body(role, p) {
    const base = (fill) => `<rect x="42" y="62" width="56" height="52" rx="14" fill="${fill}" ${OUT}/>`;
    const shade = `<path d="M80 62 H84 Q98 62 98 76 V100 Q98 114 84 114 H80Z" fill="${HT(role)}"/>`;
    switch (role) {
      case 'manager':
        return `${base(p.suit)}
          <path d="M42 90 Q70 84 98 90 L98 100 Q70 94 42 100Z" fill="${p.accent}" opacity=".9"/>
          ${chestEmblem(p.accent, 1.1, 70, 80)}
          ${shade}`;
      case 'dev':
        return `${base(p.suit)}
          <path d="M42 84 Q48 80 52 86 V114 H42Z M98 84 Q92 80 88 86 V114 H98Z" fill="${p.accent}" stroke="#000" stroke-width="2"/>
          <path d="M70 62 V114 M46 70 Q70 80 94 70 M44 92 Q70 100 96 92" stroke="#111" stroke-width="1.1" opacity=".55" fill="none"/>
          ${chestEmblem('#111', .8, 70, 82)}
          ${shade}`;
      case 'securite':
        return `<path d="M38 70 Q42 62 50 62 H90 Q98 62 102 70 L104 114 H36Z" fill="${p.suit}" ${OUT}/>
          <path d="M50 62 L70 92 L90 62" fill="#3a3a3a" ${OUT}/>
          <path d="M54 62 L70 84 L86 62" fill="#575757" stroke="#000" stroke-width="2"/>
          <path d="M38 98 H102" stroke="#000" stroke-width="3"/><rect x="64" y="94" width="12" height="8" fill="#9a9a9a" stroke="#000" stroke-width="2"/>
          <circle cx="62" cy="104" r="1.8" fill="#9a9a9a"/><circle cx="78" cy="104" r="1.8" fill="#9a9a9a"/>
          <path d="M84 62 H90 Q98 62 102 70 L104 114 H84Z" fill="${HT(role)}"/>`;
      case 'bugs':
        return `${base(p.suit)}
          <path d="M42 92 Q70 86 98 92 V100 Q98 114 84 114 H56 Q42 114 42 100Z" fill="${p.pants}" stroke="#000" stroke-width="2"/>
          <path d="M42 70 Q52 62 58 62 L52 80Z M98 70 Q88 62 82 62 L88 80Z" fill="${p.accent}" stroke="#000" stroke-width="2"/>
          <path d="M46 88 Q70 82 94 88" stroke="${p.inner}" stroke-width="3" fill="none"/>
          ${shade}`;
      case 'readme':
        return `${base(p.suit)}
          <path d="M42 76 Q56 70 60 62 H80 Q84 70 98 76 V100 Q98 114 84 114 H56 Q42 114 42 100Z" fill="${p.accent}" ${OUT}/>
          <path d="M60 62 L70 90 L80 62Z" fill="#fff" stroke="#000" stroke-width="2"/>
          <path d="M66 66 L70 72 L74 66 L70 64Z" fill="#e5131f" stroke="#000" stroke-width="1.5"/>
          <path d="M70 72 L68 86 L72 86Z" fill="#e5131f" stroke="#000" stroke-width="1.5"/>
          ${shade}
          <g class="robot">
            <ellipse cx="22" cy="128" rx="18" ry="20" fill="${p.robot}" ${OUT}/>
            <path d="M22 108 A18 20 0 0 1 22 148Z" fill="${HT(role)}"/>
            <circle cx="22" cy="126" r="9" fill="#fff" stroke="#000" stroke-width="3"/><circle cx="22" cy="126" r="4" fill="#111"/>
            <path d="M8 140 L2 150 M36 140 L42 150 M10 118 L4 108 M34 118 L40 108" stroke="#000" stroke-width="5" stroke-linecap="round"/>
            <path d="M8 140 L2 150 M36 140 L42 150 M10 118 L4 108 M34 118 L40 108" stroke="${p.robot}" stroke-width="2.5" stroke-linecap="round"/>
          </g>`;
      case 'autre':
      default:
        return `${base(p.suit)}
          <path d="M42 96 Q70 90 98 96 V100 Q98 114 84 114 H56 Q42 114 42 100Z" fill="${p.accent}" stroke="#000" stroke-width="2"/>
          <path d="M70 62 V96 M48 72 Q70 80 92 72" stroke="#111" stroke-width="1.1" opacity=".55" fill="none"/>
          ${chestEmblem('#111', .7, 70, 80)}
          ${shade}`;
    }
  }

  // ---------- Bras et jambes ----------
  function arms(role, p) {
    const glove = role === 'autre' || role === 'bugs' ? '#fff' : role === 'manager' ? p.accent : p.suit;
    const arm = (d, cls) => `<g class="arm ${cls}">
      <path d="${d}" stroke="#000" stroke-width="13" fill="none" stroke-linecap="round"/>
      <path d="${d}" stroke="${p.suit}" stroke-width="7" fill="none" stroke-linecap="round"/>
      <path d="${d}" stroke="${glove}" stroke-width="7" fill="none" stroke-linecap="round" stroke-dasharray="9 100" stroke-dashoffset="-33"/>
    </g>`;
    return arm('M46 76 Q28 92 44 110', 'arm-l') + arm('M94 76 Q112 92 96 110', 'arm-r');
  }

  function legs(role, p) {
    const leg = (x, cls) => `<g class="leg ${cls}">
      <rect x="${x}" y="104" width="16" height="50" rx="6" fill="${p.pants}" ${OUT}/>
      <rect x="${x - 4}" y="148" width="24" height="12" rx="4" fill="${p.boots}" ${OUT}/>
    </g>`;
    const skirt = role === 'readme' ? `<path d="M46 104 L40 128 H100 L94 104Z" fill="${p.accent}" ${OUT}/>` : '';
    return `<g class="legs">${leg(50, 'leg-l')}${leg(74, 'leg-r')}${skirt}</g>`;
  }

  // ---------- Bureau (quand le personnage est assis) ----------
  function desk() {
    return `<g class="desk">
      <rect x="8" y="112" width="124" height="12" rx="3" fill="#2b1e12" ${OUT}/>
      <rect x="16" y="124" width="9" height="40" fill="#1d140b" ${OUT}/>
      <rect x="115" y="124" width="9" height="40" fill="#1d140b" ${OUT}/>
      <rect x="46" y="94" width="48" height="20" rx="2" fill="#111" ${OUT}/>
      <rect class="screen" x="50" y="97" width="40" height="14" fill="#1b2a44"/>
      <g class="screen-lines" fill="#5cf"><rect x="52" y="99" width="22" height="2"/><rect x="52" y="103" width="30" height="2"/><rect x="52" y="107" width="16" height="2"/></g>
      <rect x="40" y="113" width="60" height="4" rx="1" fill="#333" stroke="#000" stroke-width="2"/>
    </g>`;
  }

  // ---------- Accessoires d'activité (affichés par CSS selon l'état) ----------
  function extras() {
    return `<g class="x-paper">
        <rect x="18" y="56" width="28" height="36" rx="2" fill="#fff" ${OUT} transform="rotate(-12 32 74)"/>
        <path d="M24 64 h16 M24 70 h16 M24 76 h10 M24 82 h14" stroke="#000" stroke-width="2" transform="rotate(-12 32 74)"/>
      </g>
      <g class="x-folder"><rect x="96" y="70" width="30" height="24" rx="3" fill="#ffe600" ${OUT} transform="rotate(10 111 82)"/><path d="M100 78 h22" stroke="#000" stroke-width="2" transform="rotate(10 111 82)"/></g>
      <g class="x-zzz" font-family="Impact,Arial Black,sans-serif" fill="#fff" stroke="#000" stroke-width="1.5"><text x="98" y="22" font-size="16">Z</text><text x="110" y="10" font-size="12">z</text></g>
      <g class="x-check"><circle cx="112" cy="26" r="14" fill="#9be15d" ${OUT}/><path d="M104 27 l6 6 10 -12" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round"/></g>
      <g class="x-q"><text x="104" y="30" font-family="Impact,Arial Black,sans-serif" font-size="30" fill="#ff2d75" stroke="#000" stroke-width="1.5">?</text></g>
      <g class="x-phone"><rect x="104" y="40" width="12" height="20" rx="3" fill="#111" stroke="#000" stroke-width="2" transform="rotate(20 110 50)"/></g>
      <g class="x-waves" fill="none" stroke="#ff9f1c" stroke-width="3" stroke-linecap="round" style="transform-origin:118px 40px"><path d="M118 30 q8 10 0 20"/><path d="M124 24 q14 16 0 32"/><path d="M130 18 q20 22 0 44"/></g>
      <g class="x-dots" fill="#fff" stroke="#000" stroke-width="2"><circle cx="100" cy="22" r="4"/><circle cx="110" cy="14" r="5"/><circle cx="122" cy="6" r="6"/></g>
      <g class="x-sparks" fill="#ffe600" stroke="#000" stroke-width="1.5"><path d="M40 100 l3 -6 3 6 -3 6z"/><path d="M100 100 l3 -6 3 6 -3 6z"/><path d="M34 92 l2 -4 2 4 -2 4z"/></g>`;
  }

  function sprite(role) {
    const r = PALETTE[role] ? role : 'autre';
    const p = PALETTE[r];
    return `<svg viewBox="0 0 140 170" xmlns="http://www.w3.org/2000/svg">
      ${defs(r)}
      <ellipse class="shadow" cx="70" cy="164" rx="40" ry="5" fill="rgba(0,0,0,.25)"/>
      ${legs(r, p)}
      <g class="body">${body(r, p)}</g>
      ${desk()}
      ${arms(r, p)}
      <g class="head">${head(r, p)}</g>
      ${extras()}
    </svg>`;
  }

  window.AgentVerseSprites = { sprite, PALETTE };
})();
