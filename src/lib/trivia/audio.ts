let ctx: AudioContext | null = null;
let muted = false;
let hooked = false;

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
}

export function unlockAudio(): void {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  if (!ctx) ctx = new AudioCtx({ latencyHint: "interactive" });
  if (ctx.state === "suspended") void ctx.resume();
  if (hooked) return;
  hooked = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && ctx?.state === "suspended") void ctx.resume();
  });
}

function tone(frequency: number, when: number, duration: number, type: OscillatorType, gain: number): void {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, when);
  amp.gain.setValueAtTime(0.0001, when);
  amp.gain.exponentialRampToValueAtTime(gain, when + 0.015);
  amp.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(when);
  osc.stop(when + duration + 0.02);
  osc.onended = () => {
    osc.disconnect();
    amp.disconnect();
  };
}

export function playCorrect(): void {
  unlockAudio();
  if (!ctx || muted) return;
  const now = ctx.currentTime;
  tone(523.25, now, 0.09, "square", 0.07);
  tone(659.25, now + 0.08, 0.09, "square", 0.07);
  tone(783.99, now + 0.16, 0.16, "square", 0.08);
}

export function playWrong(): void {
  unlockAudio();
  if (!ctx || muted) return;
  const now = ctx.currentTime;
  tone(196, now, 0.12, "sawtooth", 0.05);
  tone(130, now + 0.1, 0.18, "sawtooth", 0.045);
}
