// Types partagés entre la détection (côté extension) et l'affichage (webviews).

export type RoleKey = 'manager' | 'dev' | 'securite' | 'bugs' | 'readme' | 'git' | '3d' | 'autre';

export type Activity =
  | 'reading'     // lit un fichier, cherche
  | 'writing'     // modifie / écrit un fichier
  | 'running'     // lance une commande
  | 'delegating'  // lance un sous-agent
  | 'thinking'    // entre deux outils : rédige, réfléchit
  | 'waiting'     // attend l'utilisateur ou une permission
  | 'idle'        // session vivante mais au repos (attend un message)
  | 'done'        // terminé
  | 'stale';      // plus de nouvelles depuis longtemps, processus absent

export type AgentStatus = 'running' | 'waiting' | 'idle' | 'done' | 'stale';

export interface ToolCall {
  id: string;
  name: string;
  /** Phrase courte en français : « lit main.py » */
  label: string;
  /** Détail plus long : commande complète, chemin complet… */
  detail: string;
  activity: Activity;
  startedAt: number;
  endedAt?: number;
  isError?: boolean;
  resultPreview?: string;
}

export interface JournalEntry {
  at: number;
  kind: 'prompt' | 'text' | 'tool' | 'handback' | 'system';
  text: string;
  tool?: ToolCall;
}

/** Un échange entre deux agents : la mission envoyée (brief) ou le rapport rendu. */
export interface Exchange {
  id: string;
  at: number;
  kind: 'brief' | 'report';
  fromId: string;
  fromName: string;
  fromRole: RoleKey;
  toId: string;
  toName: string;
  toRole: RoleKey;
  /** Texte complet (prompt de la mission ou rapport). */
  text: string;
  /** Résumé court pour les bulles et le fil. */
  summary: string;
}

/** Une ligne du fil d'activité en direct. */
export interface FeedItem {
  at: number;
  agentId: string;
  agentName: string;
  role: RoleKey;
  kind: 'question' | 'brief' | 'report' | 'file' | 'command' | 'read' | 'text' | 'prompt' | 'tool' | 'start' | 'done';
  text: string;
  detail?: string;
  path?: string;
  exchangeId?: string;
  isError?: boolean;
}

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate: number;
  /** Taille du contexte à la dernière requête (entrée + cache). */
  context: number;
}

export interface AgentInfo {
  id: string;
  kind: 'manager' | 'subagent';
  sessionId: string;
  parentId?: string;
  role: RoleKey;
  /** Nom court : description donnée par le manager, ou nom de la session. */
  name: string;
  /** Mission détaillée (début du prompt après la fiche de rôle). */
  mission: string;
  cwd: string;
  transcriptPath: string;
  status: AgentStatus;
  activity: Activity;
  startedAt: number;
  /** Début du tour en cours (dernière demande de l'utilisateur), pour les managers. */
  turnStartedAt?: number;
  lastActivityAt: number;
  finishedAt?: number;
  currentTool?: ToolCall;
  lastAction: string;
  lastText: string;
  toolCount: number;
  toolCounts: Record<string, number>;
  filesRead: string[];
  filesWritten: string[];
  tokens: TokenUsage;
  model?: string;
  /** Numéro de processus de la session principale, si connue comme vivante. */
  pid?: number;
  entrypoint?: string;
  /** Type de sous-agent demandé à l'outil Agent (Explore, Plan, general-purpose…) ou agentType du meta. */
  agentType?: string;
  journal: JournalEntry[];
}

export interface Snapshot {
  at: number;
  scope: 'workspace' | 'all';
  agents: AgentInfo[];
  exchanges: Exchange[];
  feed: FeedItem[];
  workspaceFolders: string[];
  claudeDir: string;
  sounds?: boolean;
}
