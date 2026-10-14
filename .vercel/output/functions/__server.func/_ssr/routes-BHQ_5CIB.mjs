import { o as __toESM } from "../_runtime.mjs";
import { K as require_react, b as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as Share2, c as Crown, l as Copy, n as Volume2, o as Play, r as Trophy, s as LogOut, t as VolumeX } from "../_libs/lucide-react.mjs";
import { n as Route$1 } from "./router-OydMQPeP.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-BHQ_5CIB.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var FAST_POLL_MS = 400;
var IDLE_POLL_MS = 2e3;
var PING_INTERVAL_MS = 2e3;
var STALL_MS = 1e4;
var MAX_RECOVERY_ATTEMPTS = 3;
var SIGNAL_RETRY_DELAYS_MS = [250, 750];
function defaultIceServers() {
	return [{ urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] }];
}
var P2PRoom = class {
	opts;
	peers = /* @__PURE__ */ new Map();
	/** Per-remote-peer signal delivery chains (order-preserving). */
	signalQueues = /* @__PURE__ */ new Map();
	cursor = 0;
	pollTimer = null;
	pingTimer = null;
	closed = false;
	everPolled = false;
	lastPeersFingerprint = "";
	constructor(opts) {
		this.opts = opts;
	}
	/**
	* The first poll IS the join: it registers this peer and returns the
	* roster. A failed first poll (cold DB, offline tab) must not strand the
	* room: the loop and timers start regardless and the next poll retries.
	*/
	async join() {
		try {
			await this.pollOnce();
		} catch {}
		if (this.closed) return;
		this.schedulePoll(this.anyPairConnecting() ? FAST_POLL_MS : IDLE_POLL_MS);
		this.pingTimer = setInterval(() => {
			this.pingAll();
			this.watchdog();
		}, PING_INTERVAL_MS);
	}
	close() {
		this.closed = true;
		if (this.pollTimer) clearTimeout(this.pollTimer);
		if (this.pingTimer) clearInterval(this.pingTimer);
		for (const slot of this.peers.values()) slot.pc.close();
		this.peers.clear();
		fetch("/api/rtc", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				op: "leave",
				room: this.opts.room,
				peer: this.opts.selfId
			}),
			keepalive: true
		}).catch(() => {});
	}
	/** Send on the unreliable game-state channel (drops stale packets). */
	broadcast(data) {
		const wire = JSON.stringify({
			t: "d",
			d: data
		});
		for (const slot of this.peers.values()) if (slot.state?.readyState === "open") slot.state.send(wire);
	}
	/** Send reliably (ordered) to one peer, or to all when peerId is omitted. */
	send(data, peerId) {
		const wire = JSON.stringify({
			t: "d",
			d: data
		});
		const targets = peerId ? [this.peers.get(peerId)] : [...this.peers.values()];
		for (const slot of targets) if (slot?.reliable?.readyState === "open") slot.reliable.send(wire);
	}
	peerList() {
		return [...this.peers.values()].map((s) => ({ ...s.info }));
	}
	schedulePoll(delay) {
		if (this.closed) return;
		if (this.pollTimer) clearTimeout(this.pollTimer);
		this.pollTimer = setTimeout(() => void this.poll(), delay);
	}
	anyPairConnecting() {
		for (const s of this.peers.values()) {
			if (s.terminal) continue;
			if (s.info.connectionState !== "connected") return true;
		}
		return false;
	}
	async pollOnce() {
		const params = new URLSearchParams({
			room: this.opts.room,
			peer: this.opts.selfId,
			name: this.opts.name ?? "",
			since: String(this.cursor)
		});
		const res = await fetch(`/api/rtc?${params}`);
		if (this.closed) return;
		if (!res.ok) throw new Error(`signaling poll failed: ${res.status}`);
		const body = await res.json();
		if (this.closed) return;
		if (!this.everPolled) {
			this.everPolled = true;
			this.opts.onConnected?.();
		}
		this.reconcileRoster(body.peers);
		const roster = new Set(body.peers.map((p) => p.id));
		for (const sig of body.signals) {
			this.cursor = Math.max(this.cursor, sig.id);
			await this.onSignal(sig.from, sig.kind, sig.payload, roster);
			if (this.closed) return;
		}
	}
	async poll() {
		if (this.closed) return;
		try {
			await this.pollOnce();
		} catch {}
		this.schedulePoll(this.anyPairConnecting() ? FAST_POLL_MS : IDLE_POLL_MS);
	}
	reconcileRoster(peers) {
		const alive = new Set(peers.map((p) => p.id));
		for (const p of peers) {
			if (p.id === this.opts.selfId) continue;
			const existing = this.peers.get(p.id);
			if (existing) existing.info.name = p.name;
			else this.connectTo(p.id, p.name, this.opts.selfId > p.id);
		}
		for (const [id, slot] of this.peers) if (!alive.has(id)) {
			slot.pc.close();
			this.peers.delete(id);
		}
		this.emitPeers();
	}
	connectTo(peerId, name, initiator) {
		if (this.closed) return null;
		const pc = new RTCPeerConnection({ iceServers: this.opts.iceServers ?? defaultIceServers() });
		const slot = {
			pc,
			makingOffer: false,
			ignoreOffer: false,
			pendingCandidates: [],
			lastProgressAt: Date.now(),
			recoveryAttempts: 0,
			info: {
				id: peerId,
				name,
				connectionState: pc.connectionState,
				candidateType: null,
				rttMs: null
			}
		};
		this.peers.set(peerId, slot);
		pc.onicecandidate = (e) => {
			if (e.candidate) this.sendSignal(peerId, "ice", e.candidate.toJSON());
		};
		pc.onconnectionstatechange = () => {
			slot.info.connectionState = pc.connectionState;
			if (pc.connectionState === "connecting" || pc.connectionState === "connected") slot.lastProgressAt = Date.now();
			if (pc.connectionState === "connected") {
				slot.recoveryAttempts = 0;
				slot.terminal = false;
				this.readCandidateType(slot);
			}
			this.emitPeers();
			if (pc.connectionState === "failed") pc.restartIce();
			if (pc.connectionState === "failed" || pc.connectionState === "disconnected") this.schedulePoll(FAST_POLL_MS);
		};
		pc.onnegotiationneeded = async () => {
			try {
				slot.makingOffer = true;
				await pc.setLocalDescription();
				await this.sendSignal(peerId, "offer", pc.localDescription.toJSON());
			} catch {} finally {
				slot.makingOffer = false;
			}
		};
		pc.ondatachannel = (e) => this.attachChannel(slot, e.channel);
		if (initiator) {
			this.attachChannel(slot, pc.createDataChannel("state", {
				ordered: false,
				maxRetransmits: 0
			}));
			this.attachChannel(slot, pc.createDataChannel("reliable", { ordered: true }));
		}
		return slot;
	}
	attachChannel(slot, channel) {
		if (channel.label === "state") slot.state = channel;
		else slot.reliable = channel;
		channel.onopen = () => {
			slot.lastProgressAt = Date.now();
		};
		channel.onmessage = (e) => {
			let msg;
			try {
				msg = JSON.parse(e.data);
			} catch {
				return;
			}
			if (msg.t === "ping") {
				if (slot.state?.readyState === "open") slot.state.send(JSON.stringify({ t: "pong" }));
			} else if (msg.t === "pong") {
				if (slot.pingSentAt) {
					slot.info.rttMs = Math.round(performance.now() - slot.pingSentAt);
					slot.pingSentAt = void 0;
					this.emitPeers();
				}
			} else this.opts.onMessage?.(slot.info.id, msg.d, channel.label === "state" ? "state" : "reliable");
		};
	}
	/** Apply buffered ICE candidates once a remote description is in place. */
	async flushPendingCandidates(slot) {
		while (slot.pendingCandidates.length > 0) {
			const candidate = slot.pendingCandidates.shift();
			try {
				await slot.pc.addIceCandidate(candidate);
			} catch (err) {
				if (!slot.ignoreOffer) console.warn("[p2p] addIceCandidate failed:", err);
			}
			if (this.closed) return;
		}
	}
	async onSignal(from, kind, payload, roster) {
		if (this.closed) return;
		let slot = this.peers.get(from);
		if (!slot) {
			if (!roster.has(from)) return;
			const created = this.connectTo(from, "", false);
			if (!created) return;
			slot = created;
		}
		const polite = this.opts.selfId < from;
		try {
			if (kind === "offer" || kind === "answer") {
				const description = payload;
				const collision = kind === "offer" && (slot.makingOffer || slot.pc.signalingState !== "stable");
				slot.ignoreOffer = !polite && collision;
				if (slot.ignoreOffer) return;
				try {
					await slot.pc.setRemoteDescription(description);
				} catch (err) {
					if (kind !== "offer" || slot.recreatedForOffer) throw err;
					const attempts = slot.recoveryAttempts;
					const name = slot.info.name;
					slot.pc.close();
					this.peers.delete(from);
					const fresh = this.connectTo(from, name, false);
					if (!fresh) return;
					fresh.recoveryAttempts = attempts;
					fresh.recreatedForOffer = true;
					slot = fresh;
					await slot.pc.setRemoteDescription(description);
				}
				if (this.closed) return;
				await this.flushPendingCandidates(slot);
				if (this.closed) return;
				if (kind === "offer") {
					await slot.pc.setLocalDescription();
					if (this.closed) return;
					await this.sendSignal(from, "answer", slot.pc.localDescription.toJSON());
				}
			} else if (kind === "ice") {
				const candidate = payload;
				if (!slot.pc.remoteDescription) {
					slot.pendingCandidates.push(candidate);
					return;
				}
				try {
					await slot.pc.addIceCandidate(candidate);
				} catch (err) {
					if (!slot.ignoreOffer) console.warn("[p2p] addIceCandidate failed:", err);
				}
			}
		} catch {}
	}
	/**
	* Signals are serialized per remote peer (a candidate must never overtake
	* its SDP into the DB) and retried on failure with short backoff.
	*/
	sendSignal(to, kind, payload) {
		const next = (this.signalQueues.get(to) ?? Promise.resolve()).then(() => this.postSignal(to, kind, payload));
		this.signalQueues.set(to, next.catch(() => {}));
		return next;
	}
	async postSignal(to, kind, payload) {
		for (let attempt = 0;; attempt++) {
			if (this.closed) return;
			try {
				const res = await fetch("/api/rtc", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						op: "signal",
						room: this.opts.room,
						from: this.opts.selfId,
						to,
						kind,
						payload
					})
				});
				if (res.ok) return;
				throw new Error(`signal POST failed: ${res.status}`);
			} catch (err) {
				if (attempt >= SIGNAL_RETRY_DELAYS_MS.length) {
					console.warn(`[p2p] signal ${kind} to ${to} failed after retries`, err);
					return;
				}
				await new Promise((r) => setTimeout(r, SIGNAL_RETRY_DELAYS_MS[attempt]));
			}
		}
	}
	pingAll() {
		const wire = JSON.stringify({ t: "ping" });
		for (const slot of this.peers.values()) {
			if (slot.state?.readyState !== "open") continue;
			const stale = slot.pingSentAt !== void 0 && performance.now() - slot.pingSentAt > 2 * PING_INTERVAL_MS;
			if (slot.pingSentAt === void 0 || stale) {
				slot.pingSentAt = performance.now();
				slot.state.send(wire);
			}
		}
	}
	/**
	* Stuck-pair recovery, piggybacked on the ping interval. A pair that has
	* made no progress for STALL_MS gets rebuilt by the dialer with a FRESH
	* RTCPeerConnection (new DTLS identity — fixes the suspend/resume
	* fingerprint wedge). After MAX_RECOVERY_ATTEMPTS the pair is terminal:
	* visible to the app as its last connectionState, ignored by fast-poll.
	*/
	watchdog() {
		if (this.closed) return;
		const now = Date.now();
		for (const [peerId, slot] of this.peers) {
			const live = slot.pc.connectionState;
			if (live !== slot.info.connectionState) {
				slot.info.connectionState = live;
				if (live === "connecting" || live === "connected") slot.lastProgressAt = now;
				this.emitPeers();
			}
			if (slot.terminal || live === "connected") continue;
			if (now - slot.lastProgressAt <= STALL_MS) continue;
			if (slot.recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
				slot.terminal = true;
				this.emitPeers();
				continue;
			}
			slot.recoveryAttempts += 1;
			slot.lastProgressAt = now;
			if (this.opts.selfId > peerId) {
				const { name } = slot.info;
				const attempts = slot.recoveryAttempts;
				slot.pc.close();
				this.peers.delete(peerId);
				const fresh = this.connectTo(peerId, name, true);
				if (fresh) fresh.recoveryAttempts = attempts;
				this.schedulePoll(FAST_POLL_MS);
			}
		}
	}
	async readCandidateType(slot) {
		try {
			const stats = await slot.pc.getStats();
			let selected;
			stats.forEach((s) => {
				if (s.type === "candidate-pair" && s.nominated) selected = s;
			});
			const localId = selected?.localCandidateId;
			if (localId) {
				const local = stats.get(localId);
				slot.info.candidateType = local?.candidateType ?? null;
				this.emitPeers();
			}
		} catch {}
	}
	emitPeers() {
		const list = this.peerList();
		const fingerprint = JSON.stringify(list.map((p) => [
			p.id,
			p.name,
			p.connectionState,
			p.candidateType,
			p.rttMs
		]));
		if (fingerprint === this.lastPeersFingerprint) return;
		this.lastPeersFingerprint = fingerprint;
		this.opts.onPeersChanged?.(list);
	}
};
/**
* React binding for P2PRoom. Identity and room id are captured once on mount
* so re-renders never tear the mesh down. Change room or name by remounting
* (key the component on them).
*/
function useP2PRoom(options) {
	const [selfId] = (0, import_react.useState)(() => `p-${Math.random().toString(36).slice(2, 10)}`);
	const [room] = (0, import_react.useState)(() => options.room);
	const [name] = (0, import_react.useState)(() => options.name);
	const [peers, setPeers] = (0, import_react.useState)([]);
	const [joined, setJoined] = (0, import_react.useState)(false);
	const roomRef = (0, import_react.useRef)(null);
	const listeners = (0, import_react.useRef)(/* @__PURE__ */ new Set());
	(0, import_react.useEffect)(() => {
		const p2p = new P2PRoom({
			room,
			selfId,
			name,
			onPeersChanged: setPeers,
			onMessage: (from, data, channel) => {
				for (const fn of listeners.current) fn(from, data, channel);
			},
			onConnected: () => setJoined(true)
		});
		roomRef.current = p2p;
		p2p.join();
		return () => {
			roomRef.current = null;
			p2p.close();
		};
	}, [
		room,
		selfId,
		name
	]);
	return {
		selfId,
		room,
		peers,
		joined,
		broadcast: (0, import_react.useCallback)((data) => roomRef.current?.broadcast(data), []),
		send: (0, import_react.useCallback)((data, peerId) => roomRef.current?.send(data, peerId), []),
		onMessage: (0, import_react.useCallback)((fn) => {
			listeners.current.add(fn);
			return () => {
				listeners.current.delete(fn);
			};
		}, [])
	};
}
var ctx = null;
var muted = false;
var hooked = false;
function isMuted() {
	return muted;
}
function setMuted(next) {
	muted = next;
}
function unlockAudio() {
	const AudioCtx = window.AudioContext || window.webkitAudioContext;
	if (!AudioCtx) return;
	if (!ctx) ctx = new AudioCtx({ latencyHint: "interactive" });
	if (ctx.state === "suspended") ctx.resume();
	if (hooked) return;
	hooked = true;
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "visible" && ctx?.state === "suspended") ctx.resume();
	});
}
function tone(frequency, when, duration, type, gain) {
	if (!ctx) return;
	const osc = ctx.createOscillator();
	const amp = ctx.createGain();
	osc.type = type;
	osc.frequency.setValueAtTime(frequency, when);
	amp.gain.setValueAtTime(1e-4, when);
	amp.gain.exponentialRampToValueAtTime(gain, when + .015);
	amp.gain.exponentialRampToValueAtTime(1e-4, when + duration);
	osc.connect(amp);
	amp.connect(ctx.destination);
	osc.start(when);
	osc.stop(when + duration + .02);
	osc.onended = () => {
		osc.disconnect();
		amp.disconnect();
	};
}
function playCorrect() {
	unlockAudio();
	if (!ctx || muted) return;
	const now = ctx.currentTime;
	tone(523.25, now, .09, "square", .07);
	tone(659.25, now + .08, .09, "square", .07);
	tone(783.99, now + .16, .16, "square", .08);
}
function playWrong() {
	unlockAudio();
	if (!ctx || muted) return;
	const now = ctx.currentTime;
	tone(196, now, .12, "sawtooth", .05);
	tone(130, now + .1, .18, "sawtooth", .045);
}
var CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
var PHASES = /* @__PURE__ */ new Set([
	"lobby",
	"question",
	"reveal",
	"final"
]);
function cleanName(name) {
	return name.replace(/\s+/g, " ").trim().slice(0, 16) || "Player";
}
function makeCode(random = Math.random) {
	let code = "";
	for (let i = 0; i < 4; i += 1) code += CODE_ALPHABET[Math.floor(random() * 32)];
	return code;
}
function freshLobby(hostId, name) {
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
		roster: [hostId]
	};
}
function isGameState(value) {
	if (!value || typeof value !== "object") return false;
	const state = value;
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
function pickDeck(total, count, random = Math.random) {
	const ids = Array.from({ length: total }, (_, index) => index);
	for (let i = ids.length - 1; i > 0; i -= 1) {
		const j = Math.floor(random() * (i + 1));
		const swap = ids[i];
		ids[i] = ids[j] ?? i;
		ids[j] = swap ?? j;
	}
	return ids.slice(0, Math.min(count, ids.length));
}
function currentQuestion(state, bank) {
	const id = state.deck[state.qIndex];
	if (id === void 0) return null;
	return bank[id] ?? null;
}
function displayName(state, id) {
	const name = state.names[id];
	return typeof name === "string" && name ? name : "Player";
}
function applyAnswer(state, playerId, choice, correct) {
	if (state.phase !== "question" || state.locked) return null;
	if (!state.roster.includes(playerId)) return null;
	if (state.answers[playerId] !== void 0) return null;
	if (!Number.isInteger(choice) || choice < 0 || choice > 3) return null;
	const prev = state.scores[playerId];
	const score = typeof prev === "number" ? prev : 0;
	const answers = {
		...state.answers,
		[playerId]: choice
	};
	if (choice === correct) return {
		...state,
		seq: state.seq + 1,
		answers,
		locked: true,
		winnerId: playerId,
		scores: {
			...state.scores,
			[playerId]: score + 1
		}
	};
	return {
		...state,
		seq: state.seq + 1,
		answers,
		scores: {
			...state.scores,
			[playerId]: score - 1
		}
	};
}
function everyoneAnswered(state, connectedIds) {
	const live = state.roster.filter((id) => connectedIds.includes(id));
	if (live.length === 0) return false;
	return live.every((id) => state.answers[id] !== void 0);
}
function toReveal(state) {
	if (state.phase !== "question") return state;
	return {
		...state,
		seq: state.seq + 1,
		phase: "reveal"
	};
}
function advancePhase(state) {
	if (state.phase !== "reveal") return state;
	const nextIndex = state.qIndex + 1;
	if (nextIndex >= state.deck.length || nextIndex >= 10) return {
		...state,
		seq: state.seq + 1,
		phase: "final",
		locked: false
	};
	return {
		...state,
		seq: state.seq + 1,
		phase: "question",
		qIndex: nextIndex,
		answers: {},
		locked: false,
		winnerId: null
	};
}
function startMatch(state, deck) {
	const scores = {};
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
		winnerId: null
	};
}
function backToLobby(state) {
	const scores = {};
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
		winnerId: null
	};
}
function admitPeer(state, id, name) {
	const cleaned = cleanName(name);
	if (state.roster.includes(id)) {
		if (state.names[id] === cleaned) return {
			state,
			rejected: false
		};
		return {
			rejected: false,
			state: {
				...state,
				seq: state.seq + 1,
				names: {
					...state.names,
					[id]: cleaned
				}
			}
		};
	}
	if (state.roster.length >= 5) return {
		state,
		rejected: true
	};
	return {
		rejected: false,
		state: {
			...state,
			seq: state.seq + 1,
			roster: [...state.roster, id],
			names: {
				...state.names,
				[id]: cleaned
			},
			scores: {
				...state.scores,
				[id]: 0
			}
		}
	};
}
function standings(state) {
	const rows = state.roster.map((id) => ({
		id,
		name: displayName(state, id),
		score: typeof state.scores[id] === "number" ? state.scores[id] : 0
	}));
	rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
	let place = 1;
	return rows.map((row, index) => {
		const prev = rows[index - 1];
		if (index > 0 && prev && row.score < prev.score) place = index + 1;
		return {
			...row,
			place
		};
	});
}
function formatScore(score) {
	if (score > 0) return `+${score}`;
	return String(score);
}
function placeLabel(place) {
	if (place === 1) return "1st";
	if (place === 2) return "2nd";
	if (place === 3) return "3rd";
	return `${place}th`;
}
var QUESTIONS = [
	{
		prompt: "How many legs does a spider have?",
		choices: [
			"6",
			"8",
			"10",
			"4"
		],
		answer: 1
	},
	{
		prompt: "Which planet is known as the Red Planet?",
		choices: [
			"Venus",
			"Jupiter",
			"Mars",
			"Saturn"
		],
		answer: 2
	},
	{
		prompt: "How many days are in a leap year?",
		choices: [
			"365",
			"366",
			"364",
			"360"
		],
		answer: 1
	},
	{
		prompt: "What do honeybees make that people eat?",
		choices: [
			"Honey",
			"Silk",
			"Milk",
			"Maple syrup"
		],
		answer: 0
	},
	{
		prompt: "Which ocean is the largest?",
		choices: [
			"Atlantic",
			"Indian",
			"Arctic",
			"Pacific"
		],
		answer: 3
	},
	{
		prompt: "How many sides does a triangle have?",
		choices: [
			"4",
			"5",
			"3",
			"6"
		],
		answer: 2
	},
	{
		prompt: "What is the capital of France?",
		choices: [
			"London",
			"Paris",
			"Rome",
			"Madrid"
		],
		answer: 1
	},
	{
		prompt: "Water freezes at what temperature Fahrenheit?",
		choices: [
			"0°",
			"32°",
			"100°",
			"212°"
		],
		answer: 1
	},
	{
		prompt: "How many continents are there?",
		choices: [
			"5",
			"6",
			"7",
			"8"
		],
		answer: 2
	},
	{
		prompt: "Which gas do plants take in from the air?",
		choices: [
			"Oxygen",
			"Helium",
			"Carbon dioxide",
			"Hydrogen"
		],
		answer: 2
	},
	{
		prompt: "Which sport is played with a puck?",
		choices: [
			"Soccer",
			"Tennis",
			"Hockey",
			"Golf"
		],
		answer: 2
	},
	{
		prompt: "How many hours are in one day?",
		choices: [
			"12",
			"24",
			"36",
			"48"
		],
		answer: 1
	},
	{
		prompt: "What is a baby dog called?",
		choices: [
			"Kitten",
			"Calf",
			"Cub",
			"Puppy"
		],
		answer: 3
	},
	{
		prompt: "Which of these is a fruit?",
		choices: [
			"Carrot",
			"Broccoli",
			"Strawberry",
			"Potato"
		],
		answer: 2
	},
	{
		prompt: "How many wheels does a typical bicycle have?",
		choices: [
			"1",
			"2",
			"3",
			"4"
		],
		answer: 1
	},
	{
		prompt: "What is the tallest mountain on Earth?",
		choices: [
			"Kilimanjaro",
			"Denali",
			"Everest",
			"Matterhorn"
		],
		answer: 2
	},
	{
		prompt: "Which season comes right after winter?",
		choices: [
			"Spring",
			"Summer",
			"Fall",
			"Monsoon"
		],
		answer: 0
	},
	{
		prompt: "What do you call a group of lions?",
		choices: [
			"Pack",
			"Herd",
			"Flock",
			"Pride"
		],
		answer: 3
	},
	{
		prompt: "How many letters are in the English alphabet?",
		choices: [
			"24",
			"25",
			"26",
			"27"
		],
		answer: 2
	},
	{
		prompt: "Which instrument has black and white keys?",
		choices: [
			"Violin",
			"Piano",
			"Drum",
			"Flute"
		],
		answer: 1
	},
	{
		prompt: "What is H2O more commonly called?",
		choices: [
			"Salt",
			"Sugar",
			"Water",
			"Air"
		],
		answer: 2
	},
	{
		prompt: "Which country is shaped like a boot?",
		choices: [
			"Spain",
			"Greece",
			"Italy",
			"Portugal"
		],
		answer: 2
	},
	{
		prompt: "How many players from one team are on a baseball field?",
		choices: [
			"7",
			"9",
			"11",
			"5"
		],
		answer: 1
	},
	{
		prompt: "What color do you get by mixing red and yellow?",
		choices: [
			"Green",
			"Purple",
			"Brown",
			"Orange"
		],
		answer: 3
	},
	{
		prompt: "Which planet is closest to the Sun?",
		choices: [
			"Venus",
			"Earth",
			"Mercury",
			"Mars"
		],
		answer: 2
	},
	{
		prompt: "What is the main ingredient in guacamole?",
		choices: [
			"Tomato",
			"Avocado",
			"Corn",
			"Black beans"
		],
		answer: 1
	},
	{
		prompt: "How many minutes are in an hour?",
		choices: [
			"30",
			"60",
			"90",
			"100"
		],
		answer: 1
	},
	{
		prompt: "Which of these animals can truly fly?",
		choices: [
			"Penguin",
			"Ostrich",
			"Bat",
			"Dolphin"
		],
		answer: 2
	},
	{
		prompt: "What is the hardest natural substance?",
		choices: [
			"Gold",
			"Iron",
			"Quartz",
			"Diamond"
		],
		answer: 3
	},
	{
		prompt: "Which holiday is famous for jack-o'-lanterns?",
		choices: [
			"Christmas",
			"Halloween",
			"Easter",
			"Thanksgiving"
		],
		answer: 1
	},
	{
		prompt: "How many sides does a stop sign have?",
		choices: [
			"6",
			"8",
			"4",
			"5"
		],
		answer: 1
	},
	{
		prompt: "What force pulls objects toward Earth?",
		choices: [
			"Magnetism",
			"Friction",
			"Gravity",
			"Wind"
		],
		answer: 2
	},
	{
		prompt: "What is the capital of Japan?",
		choices: [
			"Seoul",
			"Beijing",
			"Tokyo",
			"Bangkok"
		],
		answer: 2
	},
	{
		prompt: "A decade is how many years?",
		choices: [
			"5",
			"10",
			"20",
			"100"
		],
		answer: 1
	},
	{
		prompt: "Which of these is a mammal?",
		choices: [
			"Shark",
			"Frog",
			"Whale",
			"Trout"
		],
		answer: 2
	},
	{
		prompt: "How many zeros are in one thousand?",
		choices: [
			"2",
			"3",
			"4",
			"6"
		],
		answer: 1
	},
	{
		prompt: "What do caterpillars turn into?",
		choices: [
			"Frogs",
			"Birds",
			"Butterflies",
			"Fish"
		],
		answer: 2
	},
	{
		prompt: "Which ocean is on the west coast of the United States?",
		choices: [
			"Atlantic",
			"Pacific",
			"Indian",
			"Arctic"
		],
		answer: 1
	},
	{
		prompt: "What is 12 times 12?",
		choices: [
			"124",
			"144",
			"132",
			"112"
		],
		answer: 1
	},
	{
		prompt: "Which planet is famous for its rings?",
		choices: [
			"Mars",
			"Venus",
			"Saturn",
			"Mercury"
		],
		answer: 2
	},
	{
		prompt: "What is the largest planet in our solar system?",
		choices: [
			"Earth",
			"Saturn",
			"Neptune",
			"Jupiter"
		],
		answer: 3
	},
	{
		prompt: "How many innings are in a standard baseball game?",
		choices: [
			"7",
			"8",
			"9",
			"10"
		],
		answer: 2
	},
	{
		prompt: "Which sense uses your ears?",
		choices: [
			"Sight",
			"Hearing",
			"Taste",
			"Smell"
		],
		answer: 1
	},
	{
		prompt: "What is frozen water called?",
		choices: [
			"Steam",
			"Dew",
			"Ice",
			"Fog"
		],
		answer: 2
	},
	{
		prompt: "Which of these states touches Lake Michigan?",
		choices: [
			"Iowa",
			"Michigan",
			"Missouri",
			"Kentucky"
		],
		answer: 1
	},
	{
		prompt: "How many legs does an insect usually have?",
		choices: [
			"4",
			"6",
			"8",
			"10"
		],
		answer: 1
	},
	{
		prompt: "What color is a typical emerald?",
		choices: [
			"Blue",
			"Red",
			"Green",
			"Yellow"
		],
		answer: 2
	},
	{
		prompt: "How many players from one team are on a basketball court?",
		choices: [
			"4",
			"5",
			"6",
			"7"
		],
		answer: 1
	},
	{
		prompt: "Which bird is a symbol of the United States?",
		choices: [
			"Bald eagle",
			"Penguin",
			"Ostrich",
			"Parrot"
		],
		answer: 0
	},
	{
		prompt: "What do you call molten rock that has reached the surface?",
		choices: [
			"Magma",
			"Lava",
			"Granite",
			"Slate"
		],
		answer: 1
	}
];
var LETTERS = [
	"A",
	"B",
	"C",
	"D"
];
var CHOICE_STYLE = [
	"bg-hot text-cream",
	"bg-electric text-cream",
	"bg-bulb text-ink",
	"bg-neon text-ink"
];
var AVATAR = CHOICE_STYLE;
var press = "border-4 border-ink shadow-board transition-transform duration-150 ease-out enabled:active:scale-[0.96]";
function Stage({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex min-h-dvh flex-col bg-stage text-cream",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "bulb-strip",
			"aria-hidden": "true"
		}), children]
	});
}
function MuteButton() {
	const [muted, setMutedState] = (0, import_react.useState)(isMuted);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		className: `${press} grid size-11 place-items-center bg-ink text-cream`,
		"aria-label": muted ? "Unmute sounds" : "Mute sounds",
		"aria-pressed": muted,
		onClick: () => {
			unlockAudio();
			const next = !muted;
			setMuted(next);
			setMutedState(next);
		},
		children: muted ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(VolumeX, { className: "size-5" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Volume2, { className: "size-5" })
	});
}
function TriviaHome({ roomFromUrl, onCreate, onJoin }) {
	const [name, setName] = (0, import_react.useState)("");
	const [code, setCode] = (0, import_react.useState)(roomFromUrl);
	const joining = roomFromUrl.length === 4;
	const cleaned = cleanName(name);
	const nameOk = name.trim().length > 0;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stage, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-6 safe-b",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "text-center",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "font-display text-4xl uppercase leading-none",
						children: "Family Trivia"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 font-display text-3xl uppercase text-bulb",
						children: "Showdown"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-3 text-base text-cream/80",
						children: "First correct tap scores a point. A wrong tap costs one. One shot each."
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
				className: "flex flex-col gap-3 border-4 border-ink bg-cream p-4 text-ink shadow-board",
				onSubmit: (event) => {
					event.preventDefault();
					if (!nameOk) return;
					unlockAudio();
					if (joining) onJoin(cleaned, roomFromUrl);
					else onCreate(cleaned);
				},
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
						className: "text-sm font-extrabold uppercase tracking-wide",
						htmlFor: "player-name",
						children: "Your name"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						id: "player-name",
						value: name,
						maxLength: 16,
						autoComplete: "nickname",
						autoCapitalize: "words",
						enterKeyHint: "go",
						placeholder: "Alex",
						className: "w-full border-4 border-ink bg-cream px-3 py-3 text-base font-bold text-ink outline-none placeholder:text-ink/40",
						onChange: (event) => setName(event.target.value)
					}),
					joining ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "text-sm font-bold",
						children: ["Room ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "font-display code-track text-lg",
							children: roomFromUrl
						})]
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "submit",
						disabled: !nameOk,
						className: `${press} inline-flex min-h-14 items-center justify-center gap-2 bg-hot px-4 text-lg font-extrabold text-cream disabled:opacity-50`,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Play, {
							className: "size-5",
							"aria-hidden": "true"
						}), joining ? "Join the show" : "Start a room"]
					})
				]
			}),
			joining ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
				className: "flex flex-col gap-3 border-4 border-ink bg-stage p-4 shadow-board",
				onSubmit: (event) => {
					event.preventDefault();
					if (!nameOk || code.length !== 4) return;
					unlockAudio();
					onJoin(cleaned, code);
				},
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
						className: "text-sm font-extrabold uppercase tracking-wide",
						htmlFor: "room-code",
						children: "Or join with a code"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						id: "room-code",
						value: code,
						maxLength: 4,
						autoCapitalize: "characters",
						autoCorrect: "off",
						spellCheck: false,
						inputMode: "text",
						placeholder: "ABCD",
						className: "code-track w-full border-4 border-ink bg-cream px-3 py-3 text-center font-display text-3xl text-ink uppercase outline-none placeholder:text-ink/30",
						onChange: (event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "submit",
						disabled: !nameOk || code.length !== 4,
						className: `${press} min-h-14 bg-electric text-lg font-extrabold text-cream disabled:opacity-50`,
						children: "Join room"
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-center text-sm font-bold text-cream/70",
				children: "2–5 phones · 10 questions · no timer"
			})
		]
	}) });
}
function ScoreStrip({ state, selfId }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
		className: "flex flex-wrap gap-2",
		"aria-label": "Live scores",
		children: standings(state).map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
			className: `min-w-16 border-4 border-ink px-2 py-1 ${row.id === selfId ? "bg-bulb text-ink" : "bg-ink text-cream"}`,
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "max-w-28 truncate text-xs font-extrabold uppercase",
				children: row.name
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "font-display text-xl tabular-nums leading-none",
				children: formatScore(row.score)
			})]
		}, row.id))
	});
}
function Showdown({ room, name, creator, onLeave }) {
	const p2p = useP2PRoom({
		room,
		name
	});
	const [state, setState] = (0, import_react.useState)(null);
	const [isHost, setIsHost] = (0, import_react.useState)(creator);
	const [full, setFull] = (0, import_react.useState)(false);
	const [pendingChoice, setPendingChoice] = (0, import_react.useState)(null);
	const [copied, setCopied] = (0, import_react.useState)(false);
	const [canShare, setCanShare] = (0, import_react.useState)(false);
	const [live, setLive] = (0, import_react.useState)("");
	const stateRef = (0, import_react.useRef)(null);
	const peersRef = (0, import_react.useRef)(p2p.peers);
	const isHostRef = (0, import_react.useRef)(creator);
	const pendingRef = (0, import_react.useRef)(false);
	const refused = (0, import_react.useRef)(/* @__PURE__ */ new Set());
	const booted = (0, import_react.useRef)(false);
	const seen = (0, import_react.useRef)(null);
	peersRef.current = p2p.peers;
	isHostRef.current = isHost;
	const commit = (0, import_react.useCallback)((next, echo) => {
		stateRef.current = next;
		setState(next);
		const hosting = next.hostId === p2p.selfId;
		isHostRef.current = hosting;
		setIsHost(hosting);
		if (echo && hosting) p2p.send({
			t: "state",
			state: next
		});
	}, [p2p.selfId, p2p.send]);
	const connectedIds = (0, import_react.useCallback)(() => {
		const ids = /* @__PURE__ */ new Set([p2p.selfId]);
		for (const peer of peersRef.current) if (peer.connectionState === "connected") ids.add(peer.id);
		return (stateRef.current?.roster ?? []).filter((id) => ids.has(id));
	}, [p2p.selfId]);
	const ingest = (0, import_react.useCallback)((playerId, choice, qIndex) => {
		const current = stateRef.current;
		if (!current || current.hostId !== p2p.selfId) return;
		if (current.qIndex !== qIndex) return;
		const question = currentQuestion(current, QUESTIONS);
		if (!question) return;
		const next = applyAnswer(current, playerId, choice, question.answer);
		if (!next) return;
		const finished = !next.locked && everyoneAnswered(next, connectedIds());
		commit(finished ? toReveal(next) : next, true);
	}, [
		commit,
		connectedIds,
		p2p.selfId
	]);
	(0, import_react.useEffect)(() => {
		if (!creator || booted.current) return;
		booted.current = true;
		commit(freshLobby(p2p.selfId, name), true);
	}, [
		creator,
		commit,
		name,
		p2p.selfId
	]);
	(0, import_react.useEffect)(() => {
		setCanShare(typeof navigator.share === "function");
	}, []);
	(0, import_react.useEffect)(() => {
		return p2p.onMessage((from, data) => {
			if (!data || typeof data !== "object") return;
			const msg = data;
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
			if (msg.t === "answer" && typeof msg.q === "number" && typeof msg.choice === "number" && Number.isInteger(msg.q) && Number.isInteger(msg.choice)) ingest(from, msg.choice, msg.q);
		});
	}, [
		p2p.onMessage,
		commit,
		ingest
	]);
	const peerFingerprint = p2p.peers.map((peer) => `${peer.id}:${peer.connectionState}:${peer.name}`).join("|");
	(0, import_react.useEffect)(() => {
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
		else for (const peer of connected) p2p.send({
			t: "state",
			state: current
		}, peer.id);
	}, [
		peerFingerprint,
		isHost,
		commit,
		p2p.selfId,
		p2p.send
	]);
	(0, import_react.useEffect)(() => {
		if (!state || isHost) return;
		if (p2p.peers.some((peer) => peer.id === state.hostId) || state.hostId === p2p.selfId) return;
		const timer = window.setTimeout(() => {
			const latest = stateRef.current;
			if (!latest || latest.hostId === p2p.selfId) return;
			if (peersRef.current.some((peer) => peer.id === latest.hostId)) return;
			if ([p2p.selfId, ...peersRef.current.map((peer) => peer.id)].sort()[0] !== p2p.selfId) return;
			commit({
				...latest,
				hostId: p2p.selfId,
				seq: latest.seq + 1
			}, true);
		}, 1500);
		return () => window.clearTimeout(timer);
	}, [
		state,
		isHost,
		p2p.peers,
		p2p.selfId,
		commit
	]);
	(0, import_react.useEffect)(() => {
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
	}, [
		isHost,
		state?.phase,
		state?.locked,
		state?.qIndex,
		commit
	]);
	(0, import_react.useEffect)(() => {
		pendingRef.current = false;
		setPendingChoice(null);
	}, [state?.qIndex, state?.phase]);
	(0, import_react.useEffect)(() => {
		if (!state) return;
		const prev = seen.current;
		seen.current = state;
		if (!prev || prev.qIndex !== state.qIndex) return;
		if (prev.phase !== "question") return;
		const question = currentQuestion(state, QUESTIONS);
		if (!question) return;
		const before = prev.answers[p2p.selfId];
		const mine = state.answers[p2p.selfId];
		if (before === void 0 && mine !== void 0) {
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
		if (state.locked && !prev.locked && state.winnerId && state.winnerId !== p2p.selfId && mine === void 0) setLive("Too late. Someone already got it.");
	}, [state, p2p.selfId]);
	function pick(choice) {
		const current = stateRef.current;
		if (!current || current.phase !== "question" || current.locked) return;
		if (current.answers[p2p.selfId] !== void 0 || pendingRef.current) return;
		if (!(current.hostId === p2p.selfId || peersRef.current.some((peer) => peer.id === current.hostId && peer.connectionState === "connected"))) return;
		unlockAudio();
		pendingRef.current = true;
		setPendingChoice(choice);
		if (current.hostId === p2p.selfId) ingest(p2p.selfId, choice, current.qIndex);
		else p2p.send({
			t: "answer",
			q: current.qIndex,
			choice
		}, current.hostId);
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
				url: url.toString()
			});
		} catch {}
	}
	if (full) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stage, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 text-center",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "font-display text-4xl uppercase",
				children: "Room is full"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "text-base text-cream/80",
				children: [
					"This show already has ",
					5,
					" players."
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				className: `${press} min-h-14 bg-hot px-6 text-lg font-extrabold text-cream`,
				onClick: onLeave,
				children: "Back"
			})
		]
	}) });
	const question = state ? currentQuestion(state, QUESTIONS) : null;
	const tooLate = !!state && state.phase === "question" && state.locked && state.winnerId !== null && state.winnerId !== p2p.selfId;
	const hostPeer = state ? p2p.peers.find((peer) => peer.id === state.hostId) : void 0;
	const hostReady = !state || isHost || hostPeer?.connectionState === "connected";
	const failed = p2p.peers.filter((peer) => peer.connectionState === "failed");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Stage, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "sr-only",
			"aria-live": "polite",
			children: live
		}),
		tooLate ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "late-tint pointer-events-none fixed inset-0 z-40",
			"aria-hidden": "true"
		}) : null,
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
			className: "relative mx-auto flex w-full max-w-md flex-1 flex-col gap-3 px-4 py-3 safe-b",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
					className: "flex items-center justify-between gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "font-display text-xl uppercase leading-none",
						children: "Showdown"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "text-xs font-extrabold uppercase tracking-wide text-cream/70",
						children: ["Room ", room]
					})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MuteButton, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: `${press} grid size-11 place-items-center bg-cream text-ink`,
							onClick: onLeave,
							"aria-label": "Leave room",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LogOut, { className: "size-5" })
						})]
					})]
				}),
				!state ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "flex flex-1 flex-col items-center justify-center gap-3 text-center",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "font-display text-3xl uppercase",
						children: "Linking phones"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-base text-cream/80",
						children: p2p.joined ? "Waiting for the host. Double-check the code if nobody shows up." : "Connecting to the room…"
					})]
				}) : null,
				state?.phase === "lobby" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "flex flex-1 flex-col gap-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "border-4 border-ink bg-cream p-4 text-center text-ink shadow-board",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-sm font-extrabold uppercase",
									children: "Room code"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "code-track mt-1 font-display text-5xl leading-none",
									children: room
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "mt-2 text-sm font-bold",
									children: [
										state.roster.length,
										" / ",
										5,
										" players"
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "mt-3 flex gap-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
										type: "button",
										className: `${press} inline-flex min-h-12 flex-1 items-center justify-center gap-2 bg-bulb font-extrabold text-ink`,
										onClick: () => void copyLink(),
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Copy, {
											className: "size-4",
											"aria-hidden": "true"
										}), copied ? "Copied" : "Copy link"]
									}), canShare ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
										type: "button",
										className: `${press} inline-flex min-h-12 flex-1 items-center justify-center gap-2 bg-electric font-extrabold text-cream`,
										onClick: () => void shareLink(),
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Share2, {
											className: "size-4",
											"aria-hidden": "true"
										}), "Share"]
									}) : null]
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
							className: "flex flex-col gap-2",
							"aria-label": "Players in the room",
							children: [state.roster.map((id, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
								className: "flex items-center gap-3 border-4 border-ink bg-cream px-3 py-2 text-ink",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: `grid size-10 place-items-center font-display text-lg ${AVATAR[index % AVATAR.length]}`,
										"aria-hidden": "true",
										children: displayName(state, id).slice(0, 1).toUpperCase()
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "min-w-0 flex-1 truncate font-extrabold",
										children: [displayName(state, id), id === p2p.selfId ? " (you)" : ""]
									}),
									id === state.hostId ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "inline-flex items-center gap-1 text-xs font-extrabold uppercase",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Crown, {
											className: "size-4",
											"aria-hidden": "true"
										}), "Host"]
									}) : null
								]
							}, id)), p2p.peers.filter((peer) => !state.roster.includes(peer.id) && peer.connectionState !== "failed").map((peer) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
								className: "border-4 border-dashed border-cream/40 px-3 py-3 text-sm font-bold text-cream/80",
								children: [
									"Linking ",
									peer.name || "a phone",
									"…"
								]
							}, peer.id))]
						}),
						failed.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm font-bold text-bulb",
							children: "A phone couldn’t link. Put everyone on the same Wi-Fi and rejoin."
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm text-cream/70",
							children: "Same Wi-Fi is the surest way for every phone to lock in together."
						}),
						isHost ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							className: `${press} mt-auto inline-flex min-h-14 items-center justify-center gap-2 bg-neon text-lg font-extrabold text-ink`,
							onClick: () => {
								unlockAudio();
								const current = stateRef.current;
								if (!current) return;
								commit(startMatch(current, pickDeck(QUESTIONS.length, 10)), true);
							},
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Play, {
								className: "size-5",
								"aria-hidden": "true"
							}), state.roster.length < 2 ? "Start a practice round" : "Start game"]
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-auto text-center text-base font-extrabold",
							children: "Waiting for the host to start…"
						})
					]
				}) : null,
				state && (state.phase === "question" || state.phase === "reveal") && question ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "flex flex-1 flex-col gap-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScoreStrip, {
							state,
							selfId: p2p.selfId
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "border-4 border-ink bg-cream p-4 text-ink shadow-board",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "text-xs font-extrabold uppercase tracking-wide",
								children: [
									"Question ",
									state.qIndex + 1,
									" / ",
									10
								]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
								className: "mt-1 text-xl font-extrabold leading-snug",
								children: question.prompt
							})]
						}),
						tooLate ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "border-4 border-ink bg-hot px-3 py-2 text-center font-display text-lg uppercase leading-tight text-cream",
							children: "Too late — someone already got it!"
						}) : null,
						state.phase === "question" && state.winnerId === p2p.selfId ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "border-4 border-ink bg-neon px-3 py-2 text-center font-display text-lg uppercase text-ink",
							children: "You got it! +1"
						}) : null,
						state.phase === "reveal" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "border-4 border-ink bg-bulb px-3 py-2 text-center font-extrabold text-ink",
							children: [
								state.winnerId ? `${displayName(state, state.winnerId)} was first.` : "Nobody got it.",
								" ",
								"Answer: ",
								question.choices[question.answer]
							]
						}) : null,
						!hostReady && state.phase === "question" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-center text-sm font-bold text-bulb",
							children: "Linking to the host phone…"
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "flex flex-1 flex-col gap-2",
							children: question.choices.map((choice, index) => {
								const mine = state.answers[p2p.selfId];
								const isCorrect = index === question.answer;
								const showGood = state.phase === "reveal" && isCorrect || mine === index && isCorrect && (state.locked || state.phase === "reveal");
								const showBad = mine === index && !isCorrect;
								const dim = state.phase === "reveal" && !isCorrect && mine !== index ? "opacity-50" : "";
								const lockedOut = state.phase !== "question" || state.locked || mine !== void 0 || pendingChoice !== null || !hostReady;
								return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									disabled: lockedOut,
									className: `${press} flex min-h-16 items-center gap-3 px-3 text-left text-lg font-extrabold disabled:active:scale-100 ${showGood ? "mark-good" : showBad ? "mark-bad" : CHOICE_STYLE[index]} ${dim}`,
									onClick: () => pick(index),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "grid size-9 shrink-0 place-items-center border-4 border-ink bg-cream font-display text-ink",
										children: LETTERS[index]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "min-w-0 flex-1 leading-tight",
										children: choice
									})]
								}, `${state.qIndex}-${index}`);
							})
						}),
						isHost && state.phase === "question" && !state.locked ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: `${press} min-h-12 bg-cream text-sm font-extrabold text-ink`,
							onClick: () => {
								const current = stateRef.current;
								if (!current || current.phase !== "question") return;
								commit(toReveal(current), true);
							},
							children: "Nobody? Reveal answer"
						}) : null
					]
				}) : null,
				state?.phase === "final" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "flex flex-1 flex-col gap-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center justify-center gap-2 text-bulb",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trophy, {
								className: "size-7",
								"aria-hidden": "true"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
								className: "font-display text-4xl uppercase",
								children: "Final scores"
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
							className: "flex flex-col gap-2",
							"aria-label": "Final standings",
							children: standings(state).map((row) => {
								const lead = row.place === 1;
								return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
									className: `flex items-center gap-3 border-4 border-ink px-3 py-3 ${lead ? "bg-bulb text-ink" : "bg-cream text-ink"}`,
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "font-display text-2xl tabular-nums",
											children: placeLabel(row.place)
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
											className: "min-w-0 flex-1 truncate text-lg font-extrabold",
											children: [row.name, row.id === p2p.selfId ? " (you)" : ""]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "font-display text-3xl tabular-nums",
											children: formatScore(row.score)
										})
									]
								}, row.id);
							})
						}),
						isHost ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: `${press} mt-auto min-h-14 bg-neon text-lg font-extrabold text-ink`,
							onClick: () => {
								const current = stateRef.current;
								if (!current) return;
								commit(backToLobby(current), true);
							},
							children: "Play again"
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-auto text-center font-extrabold",
							children: "Waiting for the host to play again…"
						})
					]
				}) : null
			]
		})
	] });
}
function Home() {
	const search = Route$1.useSearch();
	const navigate = Route$1.useNavigate();
	const [name, setName] = (0, import_react.useState)(null);
	const [creator, setCreator] = (0, import_react.useState)(false);
	if (name && search.room.length === 4) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Showdown, {
		room: search.room,
		name,
		creator,
		onLeave: () => {
			setName(null);
			setCreator(false);
			navigate({ search: { room: "" } });
		}
	}, `${search.room}:${name}:${creator ? "host" : "guest"}`);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriviaHome, {
		roomFromUrl: search.room,
		onCreate: (entered) => {
			setCreator(true);
			setName(cleanName(entered));
			navigate({ search: { room: makeCode() } });
		},
		onJoin: (entered, code) => {
			setCreator(false);
			setName(cleanName(entered));
			navigate({ search: { room: code } });
		}
	});
}
//#endregion
export { Home as component };
