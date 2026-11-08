// Instantané fictif pour voir tous les états du bureau sans session Claude en cours.
// Ouvre scripts/preview.html?demo
(function () {
  const now = Date.now();
  const min = 60000;
  const tok = (o, c) => ({ input: 200, output: o, cacheRead: c, cacheCreate: 3000, context: c + 3000 });
  const agent = (o) => Object.assign({
    kind: 'subagent', sessionId: 'demo-session', parentId: 'demo-session', cwd: 'C:\\Users\\moi\\projects\\boutique',
    transcriptPath: 'C:\\Users\\moi\\.claude\\projects\\x\\demo.jsonl', lastText: '', toolCounts: {}, filesRead: [], filesWritten: [],
    tokens: tok(12000, 80000), model: 'claude-opus-5-5', journal: [], mission: 'Mission de démonstration.',
  }, o);
  const M = { id: 'demo-session', name: 'Ajouter la cagnotte des clubs', role: 'manager' };
  const x = (id, kind, from, to, at, summary, text) => ({ id, kind, at, fromId: from.id, fromName: from.name, fromRole: from.role, toId: to.id, toName: to.name, toRole: to.role, summary, text });
  const A1 = { id: 'demo-session/a1', name: 'Développer la cagnotte des clubs', role: 'dev' };
  const A2 = { id: 'demo-session/a2', name: 'Audit sécurité serveur', role: 'securite' };
  const A3 = { id: 'demo-session/a3', name: 'Chasse aux bugs du site', role: 'bugs' };
  const B1 = { id: 'demo-session/a3/b1', name: 'Bug hunt: panier / devis', role: 'bugs' };
  const A4 = { id: 'demo-session/a4', name: 'Documenter la cagnotte', role: 'readme' };
  const A5 = { id: 'demo-session/a5', name: 'Audit infos codées en dur', role: 'securite' };
  const A7 = { id: 'demo-session/a7', name: 'Vérifier les mails de relance', role: 'autre' };
  const A8 = { id: 'demo-session/a8', name: 'Préparer la PR cagnotte', role: 'git' };
  const A9 = { id: 'demo-session/a9', name: 'Modéliser la tirelire 3D', role: '3d' };
  const brief = (a, at, extra) => x(a.id + ':brief', 'brief', M, a, at, a.name, `# Agent ${a.role}\n\nTu es ${a.role} de l'équipe…\n\n---\n## Ta tâche\n${extra}\n\n## Contexte du projet\n- Dossier : C:\\Users\\moi\\projects\\boutique\n- Langage : Python (FastAPI) + React`);

  window.__PREVIEW_SNAPSHOT = {
    at: now, scope: 'workspace', sounds: true, workspaceFolders: ['C:\\Users\\moi\\projects\\boutique'], claudeDir: 'C:\\Users\\moi\\.claude',
    agents: [
      agent({
        id: M.id, kind: 'manager', parentId: undefined, role: 'manager', name: M.name, pid: 4242, entrypoint: 'claude-vscode',
        status: 'running', activity: 'delegating', startedAt: now - 48 * min, turnStartedAt: now - 14 * min, lastActivityAt: now - 2 * min,
        lastAction: 'délègue : Audit sécurité serveur', lastText: 'Je lance la sécurité et le chasseur de bugs en parallèle pendant que le développeur finit.',
        toolCount: 23, toolCounts: { Agent: 4, Read: 9, Bash: 6, AskUserQuestion: 1 }, mission: 'Ajoute une cagnotte par club : chaque commande crédite 5 % au club choisi, visible dans /mon-compte.',
        tokens: tok(31000, 420000),
      }),
      agent({
        id: A1.id, role: 'dev', name: A1.name, status: 'running', activity: 'writing',
        startedAt: now - 13 * min, lastActivityAt: now - 4000, toolCount: 41, toolCounts: { Read: 18, Edit: 11, Bash: 9, Grep: 3 },
        currentTool: { id: 't1', name: 'Edit', label: 'modifie paiement.py', detail: 'C:\\Users\\moi\\projects\\boutique\\site-backend\\paiement.py', activity: 'writing', startedAt: now - 4000 },
        filesRead: ['C:\\Users\\moi\\projects\\boutique\\site-backend\\main.py', 'C:\\Users\\moi\\projects\\boutique\\site-backend\\models.py'],
        filesWritten: ['C:\\Users\\moi\\projects\\boutique\\site-backend\\paiement.py', 'C:\\Users\\moi\\projects\\boutique\\frontend\\src\\pages\\Checkout.jsx'],
        lastText: 'Le crédit se fait dans _marquer_payee, après confirmation Stripe.',
      }),
      agent({
        id: A2.id, role: 'securite', name: A2.name, status: 'running', activity: 'running',
        startedAt: now - 9 * min, lastActivityAt: now - 1500, toolCount: 27, toolCounts: { Bash: 14, Read: 10, Grep: 3 },
        currentTool: { id: 't2', name: 'Bash', label: 'lance : Tester une injection sur /api/commande', detail: 'curl -s -X POST http://127.0.0.1:8000/api/commande -d "club=1 OR 1=1"', activity: 'running', startedAt: now - 1500 },
        filesRead: ['C:\\Users\\moi\\projects\\boutique\\site-backend\\auth.py'],
      }),
      agent({
        id: A3.id, role: 'bugs', name: A3.name, status: 'running', activity: 'reading',
        startedAt: now - 9 * min, lastActivityAt: now - 800, toolCount: 19, toolCounts: { Read: 12, Grep: 5, Bash: 2 },
        currentTool: { id: 't3', name: 'Read', label: 'lit Checkout.jsx', detail: 'C:\\Users\\moi\\projects\\boutique\\frontend\\src\\pages\\Checkout.jsx', activity: 'reading', startedAt: now - 800 },
        filesRead: ['C:\\Users\\moi\\projects\\boutique\\frontend\\src\\pages\\Checkout.jsx'],
      }),
      agent({
        id: B1.id, parentId: A3.id, role: 'bugs', name: B1.name, status: 'running', activity: 'thinking',
        startedAt: now - 3 * min, lastActivityAt: now - 6000, toolCount: 6, toolCounts: { Read: 4, Grep: 2 },
        lastAction: 'cherche « numeroJeu »', lastText: 'Le total ignore la remise si le panier est vide puis rempli à nouveau. Je vérifie.',
      }),
      agent({
        id: A4.id, role: 'readme', name: A4.name, status: 'waiting', activity: 'waiting',
        startedAt: now - 2 * min, lastActivityAt: now - 95000, toolCount: 3, toolCounts: { Read: 2, Bash: 1 },
        currentTool: { id: 't4', name: 'Bash', label: 'lance : npm run build', detail: 'cd frontend && npm run build', activity: 'running', startedAt: now - 95000 },
      }),
      agent({
        id: A5.id, role: 'securite', name: A5.name, status: 'done', activity: 'done',
        startedAt: now - 40 * min, lastActivityAt: now - 8000, finishedAt: now - 8000, toolCount: 52, toolCounts: { Grep: 30, Read: 20, Bash: 2 },
        lastText: 'Aucune clé en dur. Une adresse e-mail de test traîne dans deploy/compose.yml (risque bas).',
      }),
      agent({
        id: A7.id, role: 'autre', name: A7.name, status: 'running', activity: 'running',
        startedAt: now - 3000, lastActivityAt: now - 1000, toolCount: 1, toolCounts: { Bash: 1 },
        currentTool: { id: 't7', name: 'Bash', label: 'lance : Lister les paniers abandonnés', detail: 'python relances.py --dry-run', activity: 'running', startedAt: now - 1000 },
      }),
      agent({
        id: A8.id, role: 'git', name: A8.name, status: 'running', activity: 'running',
        startedAt: now - 4 * min, lastActivityAt: now - 900, toolCount: 7, toolCounts: { Bash: 7 },
        currentTool: { id: 't8', name: 'Bash', label: 'lance : git push -u origin cagnotte', detail: 'git push -u origin feat/cagnotte', activity: 'running', startedAt: now - 900 },
      }),
      agent({
        id: A9.id, role: '3d', name: A9.name, status: 'running', activity: 'writing',
        startedAt: now - 6 * min, lastActivityAt: now - 1200, toolCount: 9, toolCounts: { Write: 4, Bash: 5 },
        currentTool: { id: 't9', name: 'Bash', label: 'lance : blender --background tirelire.blend --render', detail: 'blender -b tirelire.blend -o //rendu/ -f 1', activity: 'running', startedAt: now - 1200 },
      }),
      agent({
        id: 'demo-session/a6', role: 'autre', name: 'Comparer le catalogue', status: 'stale', activity: 'stale',
        startedAt: now - 300 * min, lastActivityAt: now - 200 * min, toolCount: 12,
      }),
      agent({
        id: 'other-session', kind: 'manager', parentId: undefined, role: 'manager', name: 'Corriger le header du site', pid: 777, entrypoint: 'claude-desktop',
        status: 'idle', activity: 'idle', startedAt: now - 120 * min, turnStartedAt: now - 60 * min, lastActivityAt: now - 30 * min,
        lastAction: 'modifie Header.jsx', lastText: 'C\u2019est en ligne, tu peux vérifier avec Ctrl+Maj+R.', toolCount: 31, sessionId: 'other-session',
      }),
    ],
    exchanges: [
      brief(A5, now - 40 * min, 'Cherche toute information codée en dur (clés, mots de passe, e-mails, adresses) dans site-backend/ et deploy/.'),
      brief(A1, now - 13 * min, 'Implémente la cagnotte des clubs : table `cagnotte`, crédit de 5 % à chaque commande payée, affichage dans /mon-compte. Écris au moins un test.'),
      brief(A2, now - 9 * min, 'Attaque la fonctionnalité cagnotte : injection, droits, double crédit, montants négatifs. Fichiers : paiement.py, main.py, models.py.'),
      brief(A3, now - 9 * min, 'Casse la fonctionnalité cagnotte côté site : panier vide, remise, paiement annulé, deux onglets en même temps.'),
      x(B1.id + ':brief', 'brief', A3, B1, now - 3 * min, B1.name, '# Agent chasseur de bugs\n\n---\n## Ta tâche\nConcentre-toi sur Checkout.jsx et le calcul du total avec remise.'),
      brief(A4, now - 2 * min, 'Documente la cagnotte dans le README : ce que ça fait, comment la configurer (taux dans .env), et un exemple.'),
      x(A5.id + ':report', 'report', A5, M, now - 8000, 'Rapport sécurité : aucune clé en dur, un e-mail de test dans deploy/compose.yml',
        '## Rapport sécurité : informations codées en dur\n\n**Verdict : OK.**\n\n- Aucune clé, aucun mot de passe, aucun token en dur dans `site-backend/`.\n- `deploy/compose.yml` contient une adresse e-mail de test (`test@example.com`) utilisée pour les relances en recette. Risque **bas** : à déplacer dans `.env`.\n\nCommandes lancées : `grep -rn "password\\|secret\\|api_key" site-backend/` (0 résultat pertinent), `git log -p --all -S "sk_live"` (0 résultat).'),
      brief(A7, now - 3000, 'Vérifie si les paniers abandonnés reçoivent bien un mail de relance aujourd\u2019hui.'),
    ],
    feed: [
      { at: now - 1000, agentId: A7.id, agentName: A7.name, role: 'autre', kind: 'command', text: 'lance : Lister les paniers abandonnés', detail: 'python relances.py --dry-run' },
      { at: now - 3000, agentId: M.id, agentName: M.name, role: 'manager', kind: 'brief', exchangeId: A7.id + ':brief', text: 'confie à ' + A7.name + ' : ' + A7.name },
      { at: now - 4000, agentId: A1.id, agentName: A1.name, role: 'dev', kind: 'file', text: 'modifie paiement.py', path: 'C:\\Users\\moi\\projects\\boutique\\site-backend\\paiement.py' },
      { at: now - 8000, agentId: A5.id, agentName: A5.name, role: 'securite', kind: 'report', exchangeId: A5.id + ':report', text: 'rend son rapport à ' + M.name + ' : aucune clé en dur, un e-mail de test dans deploy/compose.yml' },
      { at: now - 20000, agentId: A2.id, agentName: A2.name, role: 'securite', kind: 'command', text: 'lance : Tester une injection sur /api/commande', detail: 'curl -s -X POST http://127.0.0.1:8000/api/commande -d "club=1 OR 1=1"', isError: true },
      { at: now - 35000, agentId: A1.id, agentName: A1.name, role: 'dev', kind: 'text', text: 'Le crédit se fait dans `_marquer_payee`, après confirmation Stripe.' },
      { at: now - 50000, agentId: A3.id, agentName: A3.name, role: 'bugs', kind: 'read', text: 'lit Checkout.jsx', path: 'C:\\Users\\moi\\projects\\boutique\\frontend\\src\\pages\\Checkout.jsx' },
      { at: now - 95000, agentId: A4.id, agentName: A4.name, role: 'readme', kind: 'command', text: 'lance : npm run build', detail: 'cd frontend && npm run build' },
      { at: now - 2 * min, agentId: M.id, agentName: M.name, role: 'manager', kind: 'brief', exchangeId: A4.id + ':brief', text: 'confie à ' + A4.name + ' : ' + A4.name },
      { at: now - 3 * min, agentId: A3.id, agentName: A3.name, role: 'bugs', kind: 'brief', exchangeId: B1.id + ':brief', text: 'confie à ' + B1.name + ' : ' + B1.name },
      { at: now - 9 * min, agentId: M.id, agentName: M.name, role: 'manager', kind: 'brief', exchangeId: A2.id + ':brief', text: 'confie à ' + A2.name + ' : ' + A2.name },
      { at: now - 14 * min, agentId: M.id, agentName: M.name, role: 'manager', kind: 'prompt', text: 'Ajoute une cagnotte par club : chaque commande crédite 5 % au club choisi.' },
    ],
  };
  // ?plein : salles pleines, pour voir le débordement en salle de réunion.
  if (location.search.includes('plein')) {
    const more = [['a8', 'dev', 'Refonte du panier'], ['a9', 'dev', 'API des clubs'], ['a10', 'dev', 'Tests unitaires cagnotte'], ['a12', 'autre', 'Relire les traductions'], ['a13', 'securite', 'Scanner les dépendances'], ['a14', 'bugs', 'Tester le paiement mobile'], ['a15', 'bugs', 'Tester le paiement web']];
    for (const [k, role, name] of more) {
      window.__PREVIEW_SNAPSHOT.agents.push(agent({ id: 'demo-session/' + k, role, name, status: 'running', activity: 'reading', startedAt: now - 5 * min, lastActivityAt: now - 2000, toolCount: 5, toolCounts: { Read: 5 }, agentType: role === 'autre' ? 'Explore' : undefined }));
    }
  }
})();
