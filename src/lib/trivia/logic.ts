import type { TriviaQuestion } from "./questions";

export const MAX_PLAYERS = 5;
export const ROUNDS = 10;
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type Phase = "lobby" | "question" | "reveal" | "final";

export interface GameState {
  seq: number;
  hostId: string;
  phase: Phase;
  deck: number[];
  qIndex: number;
  scores: Record<string, number>;
  names: Record<string, string>;
  answers: Record<string, number>;
  locked: boolean;
  winnerId: string | null;
  roster: string[];
}

export interface Standing {
  id: string;
  name: string;
  score: number;
  place: number;
}

const PHASES = new Set<Phase>(["lobby", "question", "reveal", "final"]);

export function cleanName(name: string): string {
  const trimmed = name.replace(/\s+/g, " ").trim().slice(0, 16);
  return trimmed || "Player";
}

export function makeCode(random: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < 4; i += 1) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return code;
}

export function freshLobby(hostId: string, name: string): GameState {
  const cleaned = cleanName(name);
  return {
    seq: 1,
    hostId,
    phase: "lobby",
    deck: [],
    qIndex: 0,
    scores: { [hostId]: 0 },
    names: { [hostId]: cleaned },
    answers: {},
    locked: false,
    winnerId: null,
    roster: [hostId],
  };
}

export function isGameState(value: unknown): value is GameState {
  if (!value || typeof value !== "object") return false;
  const state = value as GameState;
  if (typeof state.seq !== "number" || !Number.isFinite(state.seq)) return false;
  if (typeof state.hostId !== "string" || !state.hostId) return false;
  if (!PHASES.has(state.phase)) return false;
  if (!Array.isArray(state.deck) || !Array.isArray(state.roster)) return false;
  if (typeof state.qIndex !== "number") return false;
  if (!state.scores || typeof state.scores !== "object") return false;
  if (!state.names || typeof state.names !== "object") return false;
  if (!state.answers || typeof state.answers !== "object") return false;
  if (typeof state.locked !== "boolean") return false;
  if (!(state.winnerId === null || typeof state.winnerId === "string")) return false;
  return true;
}

export function pickDeck(total: number, count: number, random: () => number = Math.random): number[] {
  const ids = Array.from({ length: total }, (_, index) => index);
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const swap = ids[i];
    ids[i] = ids[j] ?? i;
    ids[j] = swap ?? j;
  }
  return ids.slice(0, Math.min(count, ids.length));
}

export function currentQuestion(state: GameState, bank: TriviaQuestion[]): TriviaQuestion | null {
  const id = state.deck[state.qIndex];
  if (id === undefined) return null;
  return bank[id] ?? null;
}

export function displayName(state: GameState, id: string): string {
  const name = state.names[id];
  return typeof name === "string" && name ? name : "Player";
}

export function applyAnswer(
  state: GameState,
  playerId: string,
  choice: number,
  correct: number,
): GameState | null {
  if (state.phase !== "question" || state.locked) return null;
  if (!state.roster.includes(playerId)) return null;
  if (state.answers[playerId] !== undefined) return null;
  if (!Number.isInteger(choice) || choice < 0 || choice > 3) return null;
  const prev = state.scores[playerId];
  const score = typeof prev === "number" ? prev : 0;
  const answers = { ...state.answers, [playerId]: choice };
  if (choice === correct) {
    return {
      ...state,
      seq: state.seq + 1,
      answers,
      locked: true,
      winnerId: playerId,
      scores: { ...state.scores, [playerId]: score + 1 },
    };
  }
  return {
    ...state,
    seq: state.seq + 1,
    answers,
    scores: { ...state.scores, [playerId]: score - 1 },
  };
}

export function everyoneAnswered(state: GameState, connectedIds: string[]): boolean {
  const live = state.roster.filter((id) => connectedIds.includes(id));
  if (live.length === 0) return false;
  return live.every((id) => state.answers[id] !== undefined);
}

export function toReveal(state: GameState): GameState {
  if (state.phase !== "question") return state;
  return { ...state, seq: state.seq + 1, phase: "reveal" };
}

export function advancePhase(state: GameState): GameState {
  if (state.phase !== "reveal") return state;
  const nextIndex = state.qIndex + 1;
  if (nextIndex >= state.deck.length || nextIndex >= ROUNDS) {
    return { ...state, seq: state.seq + 1, phase: "final", locked: false };
  }
  return {
    ...state,
    seq: state.seq + 1,
    phase: "question",
    qIndex: nextIndex,
    answers: {},
    locked: false,
    winnerId: null,
  };
}

export function startMatch(state: GameState, deck: number[]): GameState {
  const scores: Record<string, number> = {};
  for (const id of state.roster) scores[id] = 0;
  return {
    ...state,
    seq: state.seq + 1,
    phase: "question",
    deck,
    qIndex: 0,
    scores,
    answers: {},
    locked: false,
    winnerId: null,
  };
}

export function backToLobby(state: GameState): GameState {
  const scores: Record<string, number> = {};
  for (const id of state.roster) scores[id] = 0;
  return {
    ...state,
    seq: state.seq + 1,
    phase: "lobby",
    deck: [],
    qIndex: 0,
    scores,
    answers: {},
    locked: false,
    winnerId: null,
  };
}

export function admitPeer(
  state: GameState,
  id: string,
  name: string,
): { state: GameState; rejected: boolean } {
  const cleaned = cleanName(name);
  if (state.roster.includes(id)) {
    if (state.names[id] === cleaned) return { state, rejected: false };
    return {
      rejected: false,
      state: { ...state, seq: state.seq + 1, names: { ...state.names, [id]: cleaned } },
    };
  }
  if (state.roster.length >= MAX_PLAYERS) return { state, rejected: true };
  return {
    rejected: false,
    state: {
      ...state,
      seq: state.seq + 1,
      roster: [...state.roster, id],
      names: { ...state.names, [id]: cleaned },
      scores: { ...state.scores, [id]: 0 },
    },
  };
}

export function standings(state: GameState): Standing[] {
  const rows = state.roster.map((id) => ({
    id,
    name: displayName(state, id),
    score: typeof state.scores[id] === "number" ? state.scores[id] : 0,
  }));
  rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  let place = 1;
  return rows.map((row, index) => {
    const prev = rows[index - 1];
    if (index > 0 && prev && row.score < prev.score) place = index + 1;
    return { ...row, place };
  });
}

export function formatScore(score: number): string {
  if (score > 0) return `+${score}`;
  return String(score);
}

export function placeLabel(place: number): string {
  if (place === 1) return "1st";
  if (place === 2) return "2nd";
  if (place === 3) return "3rd";
  return `${place}th`;
}
