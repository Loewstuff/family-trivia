import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Copy, Crown, LogOut, Play, Share2, Trophy, Volume2, VolumeX } from "lucide-react";
import { useP2PRoom } from "@/lib/multiplayer/use-p2p-room";
import { isMuted, playCorrect, playWrong, setMuted, unlockAudio } from "@/lib/trivia/audio";
import {
  MAX_PLAYERS,
  ROUNDS,
  admitPeer,
  advancePhase,
  applyAnswer,
  backToLobby,
  cleanName,
  currentQuestion,
  displayName,
  everyoneAnswered,
  formatScore,
  freshLobby,
  isGameState,
  pickDeck,
  placeLabel,
  standings,
  startMatch,
  toReveal,
  type GameState,
} from "@/lib/trivia/logic";
import { QUESTIONS } from "@/lib/trivia/questions";

const LETTERS = ["A", "B", "C", "D"] as const;
const CHOICE_STYLE = [
  "bg-hot text-cream",
  "bg-electric text-cream",
  "bg-bulb text-ink",
  "bg-neon text-ink",
] as const;
const AVATAR = CHOICE_STYLE;

const press =
  "border-4 border-ink shadow-board transition-transform duration-150 ease-out enabled:active:scale-[0.96]";

function Stage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-stage text-cream">
      <div className="bulb-strip" aria-hidden="true" />
      {children}
    </div>
  );
}

function MuteButton() {
  const [muted, setMutedState] = useState(isMuted);
  return (
    <button
      type="button"
      className={`${press} grid size-11 place-items-center bg-ink text-cream`}
      aria-label={muted ? "Unmute sounds" : "Mute sounds"}
      aria-pressed={muted}
      onClick={() => {
        unlockAudio();
        const next = !muted;
        setMuted(next);
        setMutedState(next);
      }}
    >
      {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
    </button>
  );
}

export function TriviaHome({
  roomFromUrl,
  onCreate,
  onJoin,
}: {
  roomFromUrl: string;
  onCreate: (name: string) => void;
  onJoin: (name: string, code: string) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState(roomFromUrl);
  const joining = roomFromUrl.length === 4;
  const cleaned = cleanName(name);
  const nameOk = name.trim().length > 0;

  return (
    <Stage>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-6 safe-b">
        <header className="text-center">
          <p className="font-display text-4xl uppercase leading-none">Family Trivia</p>
          <p className="mt-1 font-display text-3xl uppercase text-bulb">Showdown</p>
          <p className="mt-3 text-base text-cream/80">
            First correct tap scores a point. A wrong tap costs one. One shot each.
          </p>
        </header>

        <form
          className="flex flex-col gap-3 border-4 border-ink bg-cream p-4 text-ink shadow-board"
          onSubmit={(event) => {
            event.preventDefault();
            if (!nameOk) return;
            unlockAudio();
            if (joining) onJoin(cleaned, roomFromUrl);
            else onCreate(cleaned);
          }}
        >
          <label className="text-sm font-extrabold uppercase tracking-wide" htmlFor="player-name">
            Your name
          </label>
          <input
            id="player-name"
            value={name}
            maxLength={16}
            autoComplete="nickname"
            autoCapitalize="words"
            enterKeyHint="go"
            placeholder="Alex"
            className="w-full border-4 border-ink bg-cream px-3 py-3 text-base font-bold text-ink outline-none placeholder:text-ink/40"
            onChange={(event) => setName(event.target.value)}
          />
          {joining ? (
            <p className="text-sm font-bold">
              Room <span className="font-display code-track text-lg">{roomFromUrl}</span>
            </p>
          ) : null}
          <button
            type="submit"
            disabled={!nameOk}
            className={`${press} inline-flex min-h-14 items-center justify-center gap-2 bg-hot px-4 text-lg font-extrabold text-cream disabled:opacity-50`}
          >
            <Play className="size-5" aria-hidden="true" />
            {joining ? "Join the show" : "Start a room"}
          </button>
        </form>

        {joining ? null : (
          <form
            className="flex flex-col gap-3 border-4 border-ink bg-stage p-4 shadow-board"
            onSubmit={(event) => {
              event.preventDefault();
              if (!nameOk || code.length !== 4) return;
              unlockAudio();
              onJoin(cleaned, code);
            }}
          >
            <label className="text-sm font-extrabold uppercase tracking-wide" htmlFor="room-code">
              Or join with a code
            </label>
            <input
              id="room-code"
              value={code}
              maxLength={4}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              placeholder="ABCD"
              className="code-track w-full border-4 border-ink bg-cream px-3 py-3 text-center font-display text-3xl text-ink uppercase outline-none placeholder:text-ink/30"
              onChange={(event) =>
                setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))
              }
            />
            <button
              type="submit"
              disabled={!nameOk || code.length !== 4}
              className={`${press} min-h-14 bg-electric text-lg font-extrabold text-cream disabled:opacity-50`}
            >
              Join room
            </button>
          </form>
        )}

        <p className="text-center text-sm font-bold text-cream/70">
          2–5 phones · 10 questions · no timer
        </p>
      </main>
    </Stage>
  );
}

function ScoreStrip({ state, selfId }: { state: GameState; selfId: string }) {
  return (
    <ol className="flex flex-wrap gap-2" aria-label="Live scores">
      {standings(state).map((row) => (
        <li
          key={row.id}
          className={`min-w-16 border-4 border-ink px-2 py-1 ${row.id === selfId ? "bg-bulb text-ink" : "bg-ink text-cream"}`}
        >
          <p className="max-w-28 truncate text-xs font-extrabold uppercase">{row.name}</p>
          <p className="font-display text-xl tabular-nums leading-none">{formatScore(row.score)}</p>
        </li>
      ))}
    </ol>
  );
}

export function Showdown({
  room,
  name,
  creator,
  onLeave,
}: {
  room: string;
  name: string;
  creator: boolean;
  onLeave: () => void;
}) {
  const p2p = useP2PRoom({ room, name });
  const [state, setState] = useState<GameState | null>(null);
  const [isHost, setIsHost] = useState(creator);
  const [full, setFull] = useState(false);
  const [pendingChoice, setPendingChoice] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [live, setLive] = useState("");
  const stateRef = useRef<GameState | null>(null);
  const peersRef = useRef(p2p.peers);
  const isHostRef = useRef(creator);
  const pendingRef = useRef(false);
  const refused = useRef(new Set<string>());
  const booted = useRef(false);
  const seen = useRef<GameState | null>(null);
  peersRef.current = p2p.peers;
  isHostRef.current = isHost;

  const commit = useCallback(
    (next: GameState, echo: boolean) => {
      stateRef.current = next;
      setState(next);
      const hosting = next.hostId === p2p.selfId;
      isHostRef.current = hosting;
      setIsHost(hosting);
      if (echo && hosting) p2p.send({ t: "state", state: next });
    },
    [p2p.selfId, p2p.send],
  );

  const connectedIds = useCallback((): string[] => {
    const ids = new Set<string>([p2p.selfId]);
    for (const peer of peersRef.current) {
      if (peer.connectionState === "connected") ids.add(peer.id);
    }
    const roster = stateRef.current?.roster ?? [];
    return roster.filter((id) => ids.has(id));
  }, [p2p.selfId]);

  const ingest = useCallback(
    (playerId: string, choice: number, qIndex: number) => {
      const current = stateRef.current;
      if (!current || current.hostId !== p2p.selfId) return;
      if (current.qIndex !== qIndex) return;
      const question = currentQuestion(current, QUESTIONS);
      if (!question) return;
      const next = applyAnswer(current, playerId, choice, question.answer);
      if (!next) return;
      const finished = !next.locked && everyoneAnswered(next, connectedIds());
      commit(finished ? toReveal(next) : next, true);
    },
    [commit, connectedIds, p2p.selfId],
  );

  useEffect(() => {
    if (!creator || booted.current) return;
    booted.current = true;
    commit(freshLobby(p2p.selfId, name), true);
  }, [creator, commit, name, p2p.selfId]);

  useEffect(() => {
    setCanShare(typeof navigator.share === "function");
  }, []);

  useEffect(() => {
    return p2p.onMessage((from, data) => {
      if (!data || typeof data !== "object") return;
      const msg = data as { t?: string; state?: unknown; q?: unknown; choice?: unknown };
      if (msg.t === "full") {
        setFull(true);
        return;
      }
      if (msg.t === "state" && isGameState(msg.state)) {
        const incoming = msg.state;
        const cur = stateRef.current;
        if (cur && incoming.seq <= cur.seq) return;
        commit(incoming, false);
        return;
      }
      if (
        msg.t === "answer" &&
        typeof msg.q === "number" &&
        typeof msg.choice === "number" &&
        Number.isInteger(msg.q) &&
        Number.isInteger(msg.choice)
      ) {
        ingest(from, msg.choice, msg.q);
      }
    });
  }, [p2p.onMessage, commit, ingest]);

  const peerFingerprint = p2p.peers
    .map((peer) => `${peer.id}:${peer.connectionState}:${peer.name}`)
    .join("|");

  useEffect(() => {
    if (!isHostRef.current) return;
    const current = stateRef.current;
    if (!current || current.hostId !== p2p.selfId) return;
    const connected = peersRef.current.filter((peer) => peer.connectionState === "connected");
    let next = current;
    for (const peer of connected) {
      const result = admitPeer(next, peer.id, peer.name || "Player");
      if (result.rejected) {
        if (!refused.current.has(peer.id)) {
          refused.current.add(peer.id);
          p2p.send({ t: "full" }, peer.id);
        }
        continue;
      }
      next = result.state;
    }
    if (next !== current) commit(next, true);
    else {
      for (const peer of connected) p2p.send({ t: "state", state: current }, peer.id);
    }
  }, [peerFingerprint, isHost, commit, p2p.selfId, p2p.send]);

  useEffect(() => {
    if (!state || isHost) return;
    const hostHere = p2p.peers.some((peer) => peer.id === state.hostId);
    if (hostHere || state.hostId === p2p.selfId) return;
    const timer = window.setTimeout(() => {
      const latest = stateRef.current;
      if (!latest || latest.hostId === p2p.selfId) return;
      if (peersRef.current.some((peer) => peer.id === latest.hostId)) return;
      const ids = [p2p.selfId, ...peersRef.current.map((peer) => peer.id)].sort();
      if (ids[0] !== p2p.selfId) return;
      commit({ ...latest, hostId: p2p.selfId, seq: latest.seq + 1 }, true);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [state, isHost, p2p.peers, p2p.selfId, commit]);

  useEffect(() => {
    if (!isHost || !state) return;
    if (state.phase === "question" && state.locked) {
      const timer = window.setTimeout(() => {
        const current = stateRef.current;
        if (!current || current.phase !== "question" || !current.locked) return;
        commit(toReveal(current), true);
      }, 1400);
      return () => window.clearTimeout(timer);
    }
    if (state.phase === "reveal") {
      const timer = window.setTimeout(() => {
        const current = stateRef.current;
        if (!current || current.phase !== "reveal") return;
        commit(advancePhase(current), true);
      }, 2800);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [isHost, state?.phase, state?.locked, state?.qIndex, commit]);

  useEffect(() => {
    pendingRef.current = false;
    setPendingChoice(null);
  }, [state?.qIndex, state?.phase]);

  useEffect(() => {
    if (!state) return;
    const prev = seen.current;
    seen.current = state;
    if (!prev || prev.qIndex !== state.qIndex) return;
    if (prev.phase !== "question") return;
    const question = currentQuestion(state, QUESTIONS);
    if (!question) return;
    const before = prev.answers[p2p.selfId];
    const mine = state.answers[p2p.selfId];
    if (before === undefined && mine !== undefined) {
      if (mine === question.answer && state.winnerId === p2p.selfId) {
        playCorrect();
        setLive("You got it. Plus one.");
        return;
      }
      if (mine !== question.answer) {
        playWrong();
        setLive("Wrong answer. Minus one.");
      }
    }
    if (
      state.locked &&
      !prev.locked &&
      state.winnerId &&
      state.winnerId !== p2p.selfId &&
      mine === undefined
    ) {
      setLive("Too late. Someone already got it.");
    }
  }, [state, p2p.selfId]);

  function pick(choice: number) {
    const current = stateRef.current;
    if (!current || current.phase !== "question" || current.locked) return;
    if (current.answers[p2p.selfId] !== undefined || pendingRef.current) return;
    const hostReady =
      current.hostId === p2p.selfId ||
      peersRef.current.some(
        (peer) => peer.id === current.hostId && peer.connectionState === "connected",
      );
    if (!hostReady) return;
    unlockAudio();
    pendingRef.current = true;
    setPendingChoice(choice);
    if (current.hostId === p2p.selfId) ingest(p2p.selfId, choice, current.qIndex);
    else p2p.send({ t: "answer", q: current.qIndex, choice }, current.hostId);
  }

  async function copyLink() {
    const url = new URL(window.location.href);
    url.searchParams.set("room", room);
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  async function shareLink() {
    const url = new URL(window.location.href);
    url.searchParams.set("room", room);
    if (!navigator.share) return;
    try {
      await navigator.share({
        title: "Family Trivia Showdown",
        text: `Join my trivia room ${room}`,
        url: url.toString(),
      });
    } catch {
      // The player dismissed the share sheet.
    }
  }

  if (full) {
    return (
      <Stage>
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
          <h1 className="font-display text-4xl uppercase">Room is full</h1>
          <p className="text-base text-cream/80">This show already has {MAX_PLAYERS} players.</p>
          <button
            type="button"
            className={`${press} min-h-14 bg-hot px-6 text-lg font-extrabold text-cream`}
            onClick={onLeave}
          >
            Back
          </button>
        </main>
      </Stage>
    );
  }

  const question = state ? currentQuestion(state, QUESTIONS) : null;
  const tooLate =
    !!state &&
    state.phase === "question" &&
    state.locked &&
    state.winnerId !== null &&
    state.winnerId !== p2p.selfId;
  const hostPeer = state ? p2p.peers.find((peer) => peer.id === state.hostId) : undefined;
  const hostReady = !state || isHost || hostPeer?.connectionState === "connected";
  const failed = p2p.peers.filter((peer) => peer.connectionState === "failed");

  return (
    <Stage>
      <div className="sr-only" aria-live="polite">
        {live}
      </div>
      {tooLate ? (
        <div className="late-tint pointer-events-none fixed inset-0 z-40" aria-hidden="true" />
      ) : null}
      <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col gap-3 px-4 py-3 safe-b">
        <header className="flex items-center justify-between gap-2">
          <div>
            <p className="font-display text-xl uppercase leading-none">Showdown</p>
            <p className="text-xs font-extrabold uppercase tracking-wide text-cream/70">
              Room {room}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <MuteButton />
            <button
              type="button"
              className={`${press} grid size-11 place-items-center bg-cream text-ink`}
              onClick={onLeave}
              aria-label="Leave room"
            >
              <LogOut className="size-5" />
            </button>
          </div>
        </header>

        {!state ? (
          <section className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <h1 className="font-display text-3xl uppercase">Linking phones</h1>
            <p className="text-base text-cream/80">
              {p2p.joined
                ? "Waiting for the host. Double-check the code if nobody shows up."
                : "Connecting to the room…"}
            </p>
          </section>
        ) : null}

        {state?.phase === "lobby" ? (
          <section className="flex flex-1 flex-col gap-4">
            <div className="border-4 border-ink bg-cream p-4 text-center text-ink shadow-board">
              <p className="text-sm font-extrabold uppercase">Room code</p>
              <p className="code-track mt-1 font-display text-5xl leading-none">{room}</p>
              <p className="mt-2 text-sm font-bold">
                {state.roster.length} / {MAX_PLAYERS} players
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className={`${press} inline-flex min-h-12 flex-1 items-center justify-center gap-2 bg-bulb font-extrabold text-ink`}
                  onClick={() => void copyLink()}
                >
                  <Copy className="size-4" aria-hidden="true" />
                  {copied ? "Copied" : "Copy link"}
                </button>
                {canShare ? (
                  <button
                    type="button"
                    className={`${press} inline-flex min-h-12 flex-1 items-center justify-center gap-2 bg-electric font-extrabold text-cream`}
                    onClick={() => void shareLink()}
                  >
                    <Share2 className="size-4" aria-hidden="true" />
                    Share
                  </button>
                ) : null}
              </div>
            </div>

            <ul className="flex flex-col gap-2" aria-label="Players in the room">
              {state.roster.map((id, index) => (
                <li
                  key={id}
                  className="flex items-center gap-3 border-4 border-ink bg-cream px-3 py-2 text-ink"
                >
                  <span
                    className={`grid size-10 place-items-center font-display text-lg ${AVATAR[index % AVATAR.length]}`}
                    aria-hidden="true"
                  >
                    {displayName(state, id).slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-extrabold">
                    {displayName(state, id)}
                    {id === p2p.selfId ? " (you)" : ""}
                  </span>
                  {id === state.hostId ? (
                    <span className="inline-flex items-center gap-1 text-xs font-extrabold uppercase">
                      <Crown className="size-4" aria-hidden="true" />
                      Host
                    </span>
                  ) : null}
                </li>
              ))}
              {p2p.peers
                .filter(
                  (peer) =>
                    !state.roster.includes(peer.id) && peer.connectionState !== "failed",
                )
                .map((peer) => (
                  <li
                    key={peer.id}
                    className="border-4 border-dashed border-cream/40 px-3 py-3 text-sm font-bold text-cream/80"
                  >
                    Linking {peer.name || "a phone"}…
                  </li>
                ))}
            </ul>

            {failed.length > 0 ? (
              <p className="text-sm font-bold text-bulb">
                A phone couldn’t link. Put everyone on the same Wi-Fi and rejoin.
              </p>
            ) : (
              <p className="text-sm text-cream/70">
                Same Wi-Fi is the surest way for every phone to lock in together.
              </p>
            )}

            {isHost ? (
              <button
                type="button"
                className={`${press} mt-auto inline-flex min-h-14 items-center justify-center gap-2 bg-neon text-lg font-extrabold text-ink`}
                onClick={() => {
                  unlockAudio();
                  const current = stateRef.current;
                  if (!current) return;
                  commit(startMatch(current, pickDeck(QUESTIONS.length, ROUNDS)), true);
                }}
              >
                <Play className="size-5" aria-hidden="true" />
                {state.roster.length < 2 ? "Start a practice round" : "Start game"}
              </button>
            ) : (
              <p className="mt-auto text-center text-base font-extrabold">
                Waiting for the host to start…
              </p>
            )}
          </section>
        ) : null}

        {state && (state.phase === "question" || state.phase === "reveal") && question ? (
          <section className="flex flex-1 flex-col gap-3">
            <ScoreStrip state={state} selfId={p2p.selfId} />
            <div className="border-4 border-ink bg-cream p-4 text-ink shadow-board">
              <p className="text-xs font-extrabold uppercase tracking-wide">
                Question {state.qIndex + 1} / {ROUNDS}
              </p>
              <h1 className="mt-1 text-xl font-extrabold leading-snug">{question.prompt}</h1>
            </div>
            {tooLate ? (
              <p className="border-4 border-ink bg-hot px-3 py-2 text-center font-display text-lg uppercase leading-tight text-cream">
                Too late — someone already got it!
              </p>
            ) : null}
            {state.phase === "question" && state.winnerId === p2p.selfId ? (
              <p className="border-4 border-ink bg-neon px-3 py-2 text-center font-display text-lg uppercase text-ink">
                You got it! +1
              </p>
            ) : null}
            {state.phase === "reveal" ? (
              <p className="border-4 border-ink bg-bulb px-3 py-2 text-center font-extrabold text-ink">
                {state.winnerId
                  ? `${displayName(state, state.winnerId)} was first.`
                  : "Nobody got it."}{" "}
                Answer: {question.choices[question.answer]}
              </p>
            ) : null}
            {!hostReady && state.phase === "question" ? (
              <p className="text-center text-sm font-bold text-bulb">Linking to the host phone…</p>
            ) : null}
            <div className="flex flex-1 flex-col gap-2">
              {question.choices.map((choice, index) => {
                const mine = state.answers[p2p.selfId];
                const isCorrect = index === question.answer;
                const showGood =
                  (state.phase === "reveal" && isCorrect) ||
                  (mine === index && isCorrect && (state.locked || state.phase === "reveal"));
                const showBad = mine === index && !isCorrect;
                const dim =
                  state.phase === "reveal" && !isCorrect && mine !== index ? "opacity-50" : "";
                const lockedOut =
                  state.phase !== "question" ||
                  state.locked ||
                  mine !== undefined ||
                  pendingChoice !== null ||
                  !hostReady;
                return (
                  <button
                    key={`${state.qIndex}-${index}`}
                    type="button"
                    disabled={lockedOut}
                    className={`${press} flex min-h-16 items-center gap-3 px-3 text-left text-lg font-extrabold disabled:active:scale-100 ${
                      showGood ? "mark-good" : showBad ? "mark-bad" : CHOICE_STYLE[index]
                    } ${dim}`}
                    onClick={() => pick(index)}
                  >
                    <span className="grid size-9 shrink-0 place-items-center border-4 border-ink bg-cream font-display text-ink">
                      {LETTERS[index]}
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">{choice}</span>
                  </button>
                );
              })}
            </div>
            {isHost && state.phase === "question" && !state.locked ? (
              <button
                type="button"
                className={`${press} min-h-12 bg-cream text-sm font-extrabold text-ink`}
                onClick={() => {
                  const current = stateRef.current;
                  if (!current || current.phase !== "question") return;
                  commit(toReveal(current), true);
                }}
              >
                Nobody? Reveal answer
              </button>
            ) : null}
          </section>
        ) : null}

        {state?.phase === "final" ? (
          <section className="flex flex-1 flex-col gap-3">
            <div className="flex items-center justify-center gap-2 text-bulb">
              <Trophy className="size-7" aria-hidden="true" />
              <h1 className="font-display text-4xl uppercase">Final scores</h1>
            </div>
            <ol className="flex flex-col gap-2" aria-label="Final standings">
              {standings(state).map((row) => {
                const lead = row.place === 1;
                return (
                  <li
                    key={row.id}
                    className={`flex items-center gap-3 border-4 border-ink px-3 py-3 ${
                      lead ? "bg-bulb text-ink" : "bg-cream text-ink"
                    }`}
                  >
                    <span className="font-display text-2xl tabular-nums">{placeLabel(row.place)}</span>
                    <span className="min-w-0 flex-1 truncate text-lg font-extrabold">
                      {row.name}
                      {row.id === p2p.selfId ? " (you)" : ""}
                    </span>
                    <span className="font-display text-3xl tabular-nums">{formatScore(row.score)}</span>
                  </li>
                );
              })}
            </ol>
            {isHost ? (
              <button
                type="button"
                className={`${press} mt-auto min-h-14 bg-neon text-lg font-extrabold text-ink`}
                onClick={() => {
                  const current = stateRef.current;
                  if (!current) return;
                  commit(backToLobby(current), true);
                }}
              >
                Play again
              </button>
            ) : (
              <p className="mt-auto text-center font-extrabold">Waiting for the host to play again…</p>
            )}
          </section>
        ) : null}
      </main>
    </Stage>
  );
}
