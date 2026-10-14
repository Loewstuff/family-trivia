import assert from "node:assert/strict";
import { QUESTIONS } from "./questions.ts";
import {
  MAX_PLAYERS,
  admitPeer,
  advancePhase,
  applyAnswer,
  everyoneAnswered,
  freshLobby,
  pickDeck,
  standings,
  startMatch,
  toReveal,
} from "./logic.ts";

let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log("ok", name);
  } catch (error) {
    failed += 1;
    console.error("FAIL", name, error);
  }
}

test("wrong answer subtracts and stays open", () => {
  let state = startMatch(freshLobby("h", "Host"), [0]);
  state = admitPeer(state, "g", "Guest").state;
  const next = applyAnswer(state, "g", 0, QUESTIONS[0]?.answer ?? 1);
  assert.ok(next);
  assert.equal(next.locked, false);
  assert.equal(next.scores.g, -1);
  assert.equal(next.winnerId, null);
});

test("first correct answer locks and scores once", () => {
  let state = startMatch(freshLobby("h", "Host"), [0]);
  state = admitPeer(state, "g", "Guest").state;
  const correct = QUESTIONS[0]?.answer ?? 1;
  const first = applyAnswer(state, "h", correct, correct);
  assert.ok(first);
  assert.equal(first.locked, true);
  assert.equal(first.winnerId, "h");
  assert.equal(first.scores.h, 1);
  const late = applyAnswer(first, "g", correct, correct);
  assert.equal(late, null);
});

test("a player only answers once", () => {
  const state = startMatch(freshLobby("h", "Host"), [0]);
  const wrong = applyAnswer(state, "h", 0, 1);
  assert.ok(wrong);
  assert.equal(applyAnswer(wrong, "h", 1, 1), null);
});

test("all connected wrong answers reveal", () => {
  let state = startMatch(freshLobby("h", "Host"), [0, 1]);
  state = admitPeer(state, "g", "Away").state;
  const wrong = applyAnswer(state, "h", 0, 1);
  assert.ok(wrong);
  assert.equal(everyoneAnswered(wrong, ["h"]), true);
  assert.equal(everyoneAnswered(wrong, ["h", "g"]), false);
  const revealed = toReveal(wrong);
  assert.equal(revealed.phase, "reveal");
  assert.equal(advancePhase(revealed).phase, "question");
  assert.equal(advancePhase(revealed).qIndex, 1);
});

test("deck is 10 unique questions and the room caps at 5", () => {
  const deck = pickDeck(QUESTIONS.length, 10, () => 0.3);
  assert.equal(deck.length, 10);
  assert.equal(new Set(deck).size, 10);
  let state = freshLobby("h", "Host");
  for (let i = 0; i < MAX_PLAYERS; i += 1) {
    const result = admitPeer(state, `p${i}`, `P${i}`);
    assert.equal(result.rejected, i >= MAX_PLAYERS - 1 && state.roster.length >= MAX_PLAYERS);
    if (!result.rejected) state = result.state;
  }
  assert.equal(state.roster.length, MAX_PLAYERS);
  assert.equal(admitPeer(state, "extra", "Extra").rejected, true);
});

test("ties share a place", () => {
  let state = startMatch(freshLobby("h", "Host"), [0]);
  state = admitPeer(state, "g", "Guest").state;
  state = {
    ...state,
    scores: { h: 2, g: 2 },
  };
  const rows = standings(state);
  assert.equal(rows[0]?.place, 1);
  assert.equal(rows[1]?.place, 1);
});

if (failed > 0) process.exit(1);
