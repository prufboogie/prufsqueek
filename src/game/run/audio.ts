/** Every sound is synthesised in WebAudio: no audio files to ship or license. */
export type Sfx = "coin" | "jump" | "slide" | "stumble" | "crash" | "power" | "smash" | "lane" | "milestone";

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
// A minor loop: A F C G, one bar each.
const ROOTS = [33, 29, 36, 31];
const BASS_STEPS = [0, 0, 12, 0, 0, 12, 0, 7, 0, 0, 12, 0, 7, 0, 12, 10];

export class RunAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private nextAt = 0;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem("ashrun.muted") === "1";
    } catch {
      /* private mode */
    }
  }

  /** Must run inside a user gesture, or browsers keep the context suspended. */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);
      this.music = this.ctx.createGain();
      this.music.gain.value = 0.32;
      this.music.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem("ashrun.muted", m ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
  }

  private tone(type: OscillatorType, from: number, to: number, at: number, dur: number, vol: number, dest?: AudioNode) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, at);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + dur);
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(dest ?? this.master!);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  private hiss(at: number, dur: number, vol: number, filter: BiquadFilterType, freq: number, dest?: AudioNode) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    s.connect(f).connect(g).connect(dest ?? this.master!);
    s.start(at, Math.random() * 0.5);
    s.stop(at + dur + 0.02);
  }

  sfx(kind: Sfx) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    switch (kind) {
      case "coin":
        this.tone("square", 988, 1480, t, 0.07, 0.08);
        this.tone("square", 1480, 1976, t + 0.05, 0.08, 0.06);
        break;
      case "jump":
        this.tone("sine", 260, 620, t, 0.16, 0.22);
        break;
      case "lane":
        this.hiss(t, 0.09, 0.08, "bandpass", 2400);
        break;
      case "slide":
        this.hiss(t, 0.28, 0.16, "lowpass", 900);
        break;
      case "stumble":
        this.tone("sine", 140, 50, t, 0.25, 0.5);
        this.hiss(t, 0.18, 0.25, "lowpass", 600);
        break;
      case "crash":
        this.tone("sine", 110, 30, t, 0.7, 0.7);
        this.hiss(t, 0.6, 0.5, "lowpass", 1400);
        this.tone("sawtooth", 220, 55, t, 0.5, 0.12);
        break;
      case "smash":
        this.hiss(t, 0.3, 0.4, "bandpass", 1200);
        this.tone("square", 180, 60, t, 0.2, 0.15);
        break;
      case "power":
        [0, 4, 7, 12].forEach((n, i) => this.tone("triangle", NOTE(76 + n), NOTE(76 + n), t + i * 0.06, 0.14, 0.12));
        break;
      case "milestone":
        [0, 7, 12].forEach((n, i) => this.tone("square", NOTE(72 + n), NOTE(72 + n), t + i * 0.08, 0.12, 0.06));
        break;
    }
  }

  startMusic() {
    if (!this.ctx || this.timer) return;
    this.step = 0;
    this.nextAt = this.ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stopMusic() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.music) return;
    const sixteenth = 60 / 138 / 4;
    while (this.nextAt < ctx.currentTime + 0.12) {
      const s = this.step % 16;
      const bar = Math.floor(this.step / 16) % 4;
      const at = this.nextAt;
      if (s % 4 === 0) this.tone("sine", 150, 42, at, 0.22, 0.9, this.music);
      if (s % 4 === 2) this.hiss(at, 0.04, 0.18, "highpass", 7000, this.music);
      if (s === 4 || s === 12) this.hiss(at, 0.14, 0.35, "bandpass", 1800, this.music);
      const note = ROOTS[bar] + BASS_STEPS[s];
      const o = ctx.createOscillator();
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      o.type = "sawtooth";
      o.frequency.value = NOTE(note);
      f.type = "lowpass";
      f.frequency.setValueAtTime(1400, at);
      f.frequency.exponentialRampToValueAtTime(220, at + sixteenth * 0.9);
      g.gain.setValueAtTime(0.22, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + sixteenth * 0.95);
      o.connect(f).connect(g).connect(this.music);
      o.start(at);
      o.stop(at + sixteenth);
      // A thin lead on the off-bars keeps it moving.
      if (bar % 2 === 1 && s % 2 === 0) this.tone("square", NOTE(note + 36 + (s % 8 === 0 ? 7 : 3)), NOTE(note + 36), at, sixteenth * 0.9, 0.025, this.music);
      this.nextAt += sixteenth;
      this.step++;
    }
  }

  dispose() {
    this.stopMusic();
    void this.ctx?.close();
    this.ctx = null;
  }
}
