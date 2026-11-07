import * as THREE from "three";
import { runScore, speedAt, RUN } from "@/shared/run";
import type { RunAudio } from "./audio";
import * as T from "./textures";

export type Action = "left" | "right" | "jump" | "slide";
export type PowerKind = "magnet" | "shield" | "boost" | "double";
export type RunStats = {
  score: number;
  distance: number;
  coins: number;
  speed: number;
  powers: Partial<Record<PowerKind, number>>;
  heat: number;
  zone: number;
};
export type RunResult = { distance: number; coins: number; score: number; durationMs: number; cause: string };
export type RunEvents = {
  stats: (s: RunStats) => void;
  over: (r: RunResult) => void;
  banner?: (text: string, tone?: "hazard" | "signal" | "rust" | "steel") => void;
  /** The engine paused itself (the tab was hidden). */
  paused?: () => void;
};

/** Seeded generator: the server picks the seed, so a run's track can be rebuilt later. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LANE_X = [-2.4, 0, 2.4];
const GRAVITY = -52;
const JUMP_V = 15.5;
const SLIDE_TIME = 0.72;
const VIEW = 170;
const TRACK_LEN = 320;
const HEAT_TIME = 8;
const POWER_TIME: Record<PowerKind, number> = { magnet: 10, shield: 30, boost: 5, double: 12 };
const POWER_COLOR: Record<PowerKind, number> = { magnet: 0x7fa1b8, shield: 0x9be29f, boost: 0xd0603a, double: 0xf2a93b };

export const ZONES = [
  { name: "Sector 1 · Cinder Highway", bg: 0x2b1810, fog: 0x3b2114, sky: 0xffb070, lamp: 0xffc76b, lit: "#e8a04a" },
  { name: "Sector 2 · The Green Haze", bg: 0x0c201b, fog: 0x12352b, sky: 0x9be29f, lamp: 0xc8ffcb, lit: "#9be29f" },
  { name: "Sector 3 · Blackout Row", bg: 0x0b0d1c, fog: 0x151a36, sky: 0x8fb4ff, lamp: 0x8fb4ff, lit: "#7fa1b8" },
  { name: "Sector 4 · Red Market", bg: 0x22090b, fog: 0x3a1014, sky: 0xff7a6b, lamp: 0xff8a6b, lit: "#d0603a" },
];
const ZONE_LEN = 800;

type Kind = "barrier" | "beam" | "wall" | "drone" | "truck" | "coin" | "power";
type Ent = {
  kind: Kind;
  key: string;
  d: number;
  lane: number;
  x: number;
  y: number;
  halfW: number;
  halfD: number;
  y0: number;
  y1: number;
  obj: THREE.Object3D;
  hit?: boolean;
  phase?: number;
  power?: PowerKind;
  pulled?: boolean;
};
type Prop = { d: number; obj: THREE.Object3D; key: string };
type Particle = { mesh: THREE.Mesh; v: THREE.Vector3; life: number; max: number; world: boolean; spin: number };

export class RunEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
  private clock = new THREE.Clock(false);
  private raf = 0;
  private ro: ResizeObserver;
  private rng: () => number;
  private srng: () => number;

  // Run state
  private distance = 0;
  private speed: number = RUN.baseSpeed;
  private boostMix = 0;
  private coins = 0;
  private lane = 1;
  private fromLane = 1;
  private px = 0;
  private py = 0;
  private vy = 0;
  private slideT = 0;
  private jumpBuffer = 0;
  private slideAfterLand = false;
  private heat = 0;
  /** The swarm starts on your heels and falls back: a look, not a threat. */
  private intro = 3;
  private powers: Partial<Record<PowerKind, number>> = {};
  private shield = false;
  private state: "ready" | "running" | "paused" | "dying" | "over" = "ready";
  private dyingT = 0;
  private cause = "";
  private startedAt = 0;
  private activeMs = 0;
  private statsT = 0;
  private shake = 0;
  private runPhase = 0;
  private nextRow = 40;
  private nextPowerAt = 260;
  private nextMilestone = 500;
  private laneClearAt = [0, 0, 0];
  private lastObstacle = [-999, -999, -999];
  private propNext = { left: 0, right: 0, lamp: 10, junk: 30 };
  private zone = 0;
  private time = 0;

  // Scene parts
  private ents: Ent[] = [];
  private props: Prop[] = [];
  private pool = new Map<string, THREE.Object3D[]>();
  private particles: Particle[] = [];
  private partPool: Particle[] = [];
  private runner!: THREE.Group;
  private rig!: { body: THREE.Group; legL: THREE.Group; legR: THREE.Group; armL: THREE.Group; armR: THREE.Group; tail: THREE.Mesh; plate: THREE.MeshStandardMaterial; bubble: THREE.Mesh };
  private shadow!: THREE.Mesh;
  private swarm!: THREE.Group;
  private swarmBits: { m: THREE.Object3D; a: number; r: number; s: number; h: number }[] = [];
  private road!: THREE.Texture;
  private walk!: THREE.Texture;
  private rails!: THREE.Texture;
  private hemi!: THREE.HemisphereLight;
  private skyline!: THREE.Mesh;
  private fog!: THREE.Fog;
  private bgColor = new THREE.Color();
  private lampMat!: THREE.MeshBasicMaterial;
  private glowMat!: THREE.SpriteMaterial;
  private facades: THREE.MeshStandardMaterial[][] = [];
  private mats: Record<string, THREE.Material> = {};
  private geos: Record<string, THREE.BufferGeometry> = {};

  constructor(private canvas: HTMLCanvasElement, private opts: { seed: number; audio: RunAudio; events: RunEvents; plate?: THREE.Texture | null }) {
    this.rng = mulberry32(opts.seed);
    this.srng = mulberry32(opts.seed ^ 0x9e3779b9);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr < 2, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(dpr);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.buildWorld();
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement ?? canvas);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.renderOnce();
    this.idle();
  }

  // ── Public API ──────────────────────────────────────────────────────────────
  start() {
    if (this.state !== "ready") return;
    this.state = "running";
    this.startedAt = performance.now();
    this.clock.start();
    this.opts.audio.startMusic();
    this.opts.events.banner?.(ZONES[0].name, "hazard");
    cancelAnimationFrame(this.raf);
    this.loop();
  }

  pause() {
    if (this.state !== "running") return;
    this.state = "paused";
    this.clock.stop();
    this.opts.audio.stopMusic();
  }

  resume() {
    if (this.state !== "paused") return;
    this.state = "running";
    this.clock.start();
    this.opts.audio.startMusic();
  }

  get paused() {
    return this.state === "paused";
  }

  input(a: Action) {
    if (this.state !== "running") return;
    const audio = this.opts.audio;
    if (a === "left" || a === "right") {
      const to = this.lane + (a === "left" ? -1 : 1);
      if (to < 0 || to > 2) {
        this.shake = Math.max(this.shake, 0.12);
        return;
      }
      this.fromLane = this.lane;
      this.lane = to;
      audio.sfx("lane");
    } else if (a === "jump") {
      if (this.py <= 0.001) this.jump();
      else this.jumpBuffer = 0.16;
    } else if (a === "slide") {
      if (this.py > 0.001) {
        this.vy = Math.min(this.vy, -32);
        this.slideAfterLand = true;
      } else if (this.slideT <= 0) {
        this.slideT = SLIDE_TIME;
        audio.sfx("slide");
        this.dust(6);
      }
    }
  }

  setPlate(t: THREE.Texture | null) {
    if (!this.rig) return;
    this.rig.plate.map = t ?? this.tex("plate", () => T.defaultPlate());
    this.rig.plate.needsUpdate = true;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.opts.audio.stopMusic();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
    this.renderer.dispose();
  }

  // ── Loop ────────────────────────────────────────────────────────────────────
  private onVisibility = () => {
    if (document.hidden && this.state === "running") {
      this.pause();
      this.opts.events.paused?.();
    }
  };

  /** Before the start the runner jogs in place and the world idles. */
  private idle = () => {
    if (this.state !== "ready") return;
    this.time += 1 / 60;
    this.animateRunner(1 / 60, 6);
    this.animateSwarm(1 / 60);
    this.updateCamera(1 / 60);
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.idle);
  };

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    if (this.state === "paused" || this.state === "over") return;
    // Real time even on a slow phone, in steps short enough that nothing is skipped over.
    let total = Math.min(this.clock.getDelta(), 0.1);
    if (this.state === "dying") {
      this.dyingT += total;
      total *= this.dyingT < 0.5 ? 0.25 : 0.6;
    }
    const n = Math.max(1, Math.ceil(total / (1 / 60)));
    for (let i = 0; i < n && (this.state as string) !== "over"; i++) {
      this.time += total / n;
      this.step(total / n);
    }
    this.renderer.render(this.scene, this.camera);
  };

  private renderOnce() {
    this.updateCamera(0);
    this.renderer.render(this.scene, this.camera);
  }

  private step(dt: number) {
    const running = this.state === "running";
    if (running) this.activeMs += dt * 1000;

    // Speed: ramps with distance; Adrenaline pushes past it.
    const boosting = (this.powers.boost ?? 0) > 0;
    this.boostMix += ((boosting ? 1 : 0) - this.boostMix) * Math.min(1, dt * 4);
    const target = running ? speedAt(this.distance) * (1 + (RUN.boostFactor - 1) * this.boostMix) : Math.max(0, this.speed - 40 * dt);
    this.speed = running ? target : Math.max(0, this.speed * (1 - dt * 3));
    const move = this.speed * dt;
    this.distance += move;

    for (const k of Object.keys(this.powers) as PowerKind[]) {
      this.powers[k]! -= dt;
      if (this.powers[k]! <= 0) {
        delete this.powers[k];
        if (k === "boost") this.opts.events.banner?.("Adrenaline wore off", "steel");
      }
    }
    if (this.heat > 0) this.heat = Math.max(0, this.heat - dt);
    if (running && this.intro > 0) this.intro -= dt;

    // Player physics.
    const tx = LANE_X[this.lane];
    this.px += (tx - this.px) * Math.min(1, dt * 14);
    if (this.py > 0 || this.vy > 0) {
      this.vy += GRAVITY * dt;
      this.py += this.vy * dt;
      if (this.py <= 0) {
        this.py = 0;
        this.vy = 0;
        this.dust(5);
        if (this.slideAfterLand) {
          this.slideAfterLand = false;
          this.slideT = SLIDE_TIME;
          this.opts.audio.sfx("slide");
        } else if (this.jumpBuffer > 0) this.jump();
      }
    }
    if (this.jumpBuffer > 0) this.jumpBuffer -= dt;
    if (this.slideT > 0) this.slideT -= dt;

    if (running) {
      this.generate();
      this.collide();
      this.milestones();
    }
    this.updateEnts(dt);
    this.updateProps();
    this.updateParticles(dt, move);
    this.updateZone(dt);
    this.animateRunner(dt, this.speed);
    this.animateSwarm(dt);
    this.updateCamera(dt);

    // Scroll the long surfaces instead of moving them.
    const off = this.distance / T.ROAD_TILE;
    this.road.offset.y = off;
    this.walk.offset.y = this.distance / 6;
    this.rails.offset.x = -this.distance / 12;

    if (boosting && Math.random() < dt * 40) this.streak();

    this.statsT -= dt;
    if (this.statsT <= 0 && this.state !== "over") {
      this.statsT = 0.1;
      this.opts.events.stats(this.stats());
    }
    if (this.state === "dying" && this.dyingT > 1.4) this.finish();
  }

  private stats(): RunStats {
    return {
      score: runScore(this.distance, this.coins),
      distance: Math.floor(this.distance),
      coins: this.coins,
      speed: this.speed,
      powers: { ...this.powers, ...(this.shield ? { shield: this.powers.shield ?? 1 } : {}) },
      heat: this.heat,
      zone: this.zone,
    };
  }

  private finish() {
    this.state = "over";
    this.opts.audio.stopMusic();
    this.opts.events.stats(this.stats());
    this.opts.events.over({ distance: Math.floor(this.distance), coins: this.coins, score: runScore(this.distance, this.coins), durationMs: Math.round(this.activeMs), cause: this.cause });
  }

  private jump() {
    this.vy = JUMP_V;
    this.py = 0.0011;
    this.slideT = 0;
    this.jumpBuffer = 0;
    this.opts.audio.sfx("jump");
  }

  private die(cause: string) {
    if (this.state !== "running") return;
    this.state = "dying";
    this.cause = cause;
    this.heat = HEAT_TIME;
    this.shake = 0.9;
    this.opts.audio.sfx("crash");
    this.burst(this.px, 1, 0, 26, "spark", 7);
    this.burst(this.px, 1, 0, 14, "concrete", 6);
  }

  private stumble(e: Ent) {
    e.hit = true;
    if (this.heat > 0) {
      this.die("The swarm caught you");
      return;
    }
    this.lane = this.fromLane;
    this.heat = HEAT_TIME;
    this.shake = 0.45;
    this.opts.audio.sfx("stumble");
    this.burst(this.px, 1, 0, 10, "spark", 5);
    this.opts.events.banner?.("Stumbled! The swarm is on you", "rust");
  }

  private milestones() {
    if (this.distance >= this.nextMilestone) {
      this.opts.events.banner?.(`${this.nextMilestone} m`, "signal");
      this.opts.audio.sfx("milestone");
      this.nextMilestone += 500;
    }
  }

  // ── Track generation ───────────────────────────────────────────────────────
  private generate() {
    while (this.nextRow < this.distance + VIEW) {
      const d = this.nextRow;
      const v = speedAt(d);
      const gap = 10 + v * 0.75 + this.rng() * 8;
      this.spawnRow(d, gap);
      this.nextRow += gap;
    }
  }

  private open(lane: number, d: number) {
    return d > this.laneClearAt[lane];
  }

  private place(kind: Kind, d: number, lane: number) {
    this.lastObstacle[lane] = d;
    return this.spawn(kind, d, lane);
  }

  private spawnRow(d: number, gap: number) {
    const r = this.rng;
    const diff = Math.min(1, d / 2600);
    const pick = r();
    const lanes = [0, 1, 2].filter((l) => this.open(l, d));
    const free = new Set(lanes);
    let arcLane = -1;
    let lowLane = -1;

    if (d < 70) {
      // Warm-up: coins only.
    } else if (pick < 0.08 + diff * 0.07 && d > 450) {
      // Oncoming truck in a lane that has been clear long enough for it to drive down.
      const clear = [0, 1, 2].filter((l) => this.lastObstacle[l] < d - 80 && this.open(l, d));
      if (clear.length) {
        const l = clear[Math.floor(r() * clear.length)];
        this.place("truck", d + 30, l);
        this.laneClearAt[l] = d + 40;
        free.delete(l);
      }
    } else if (pick < 0.3) {
      const l = lanes[Math.floor(r() * lanes.length)];
      if (l !== undefined) {
        const k: Kind = r() < 0.55 ? "barrier" : r() < 0.5 ? "beam" : "wall";
        this.place(k, d, l);
        if (k === "wall") free.delete(l);
        else if (k === "barrier") arcLane = l;
        else lowLane = l;
      }
    } else if (pick < 0.48) {
      // Two lanes blocked: take the third.
      const openLane = lanes[Math.floor(r() * lanes.length)] ?? 1;
      for (const l of lanes) if (l !== openLane) {
        this.place(r() < 0.6 ? "wall" : "barrier", d, l);
        free.delete(l);
      }
    } else if (pick < 0.6) {
      for (const l of lanes) this.place("barrier", d, l);
      arcLane = lanes[Math.floor(r() * lanes.length)] ?? -1;
      free.clear();
    } else if (pick < 0.72) {
      for (const l of lanes) this.place("beam", d, l);
      lowLane = lanes[Math.floor(r() * lanes.length)] ?? -1;
      free.clear();
    } else if (pick < 0.86) {
      // One of each, at least one lane you can get through without changing.
      const kinds: Kind[] = ["barrier", "beam", "wall"].sort(() => r() - 0.5) as Kind[];
      lanes.forEach((l, i) => {
        const k = kinds[i % 3];
        this.place(k, d, l);
        if (k === "wall") free.delete(l);
      });
    } else {
      const e = this.place("drone", d, Math.floor(r() * 3));
      e.phase = r() * Math.PI * 2;
      if (diff > 0.4 && r() < 0.5) {
        const l = Math.floor(r() * 3);
        if (this.open(l, d)) this.place("barrier", d + gap * 0.5, l);
      }
    }

    // Coins: an arc over a barrier, a low line under a beam, or a line in an open lane.
    if (arcLane >= 0) {
      for (let i = -3; i <= 3; i++) {
        const c = this.spawn("coin", d + i * 1.6, arcLane);
        const t = (i + 3) / 6;
        c.y = 0.9 + Math.sin(t * Math.PI) * 1.6;
      }
    } else if (lowLane >= 0) {
      for (let i = -2; i <= 2; i++) this.spawn("coin", d + i * 2.2, lowLane).y = 0.5;
    } else {
      const choices = [...free];
      if (choices.length && r() < 0.85) {
        const l = choices[Math.floor(r() * choices.length)];
        const n = Math.min(8, Math.floor((gap - 8) / 2.8));
        for (let i = 0; i < n; i++) this.spawn("coin", d + 4 + i * 2.8, l).y = 0.9;
      }
    }

    // Power-ups float in a lane with nothing in it.
    if (d >= this.nextPowerAt) {
      const choices = [0, 1, 2].filter((l) => free.has(l) && this.open(l, d + gap / 2));
      if (choices.length) {
        const kinds: PowerKind[] = ["magnet", "shield", "boost", "double"];
        const p = this.spawn("power", d + gap / 2, choices[Math.floor(r() * choices.length)]);
        p.power = kinds[Math.floor(r() * kinds.length)];
        p.y = 1.3;
        this.dressPower(p);
        this.nextPowerAt = d + 380 + r() * 260;
      }
    }
  }

  private spawn(kind: Kind, d: number, lane: number): Ent {
    const key = kind;
    const obj = this.take(key) ?? this.build(kind);
    this.scene.add(obj);
    obj.visible = true;
    const base = { kind, key, d, lane, x: LANE_X[lane], y: 0, obj, hit: false, pulled: false };
    const dims: Record<Kind, [number, number, number, number]> = {
      // halfW, halfD, y0, y1
      barrier: [1.0, 0.3, 0, 1.0],
      beam: [1.1, 0.25, 1.15, 3.2],
      wall: [1.05, 1.5, 0, 2.7],
      drone: [0.55, 0.45, 1.0, 1.6],
      truck: [1.05, 2.8, 0, 2.7],
      coin: [0.45, 0.45, 0, 0],
      power: [0.55, 0.55, 0, 0],
    };
    const [halfW, halfD, y0, y1] = dims[kind];
    const e: Ent = { ...base, halfW, halfD, y0, y1 };
    this.ents.push(e);
    return e;
  }

  private take(key: string) {
    return this.pool.get(key)?.pop();
  }

  private release(key: string, o: THREE.Object3D) {
    this.scene.remove(o);
    if (!this.pool.has(key)) this.pool.set(key, []);
    this.pool.get(key)!.push(o);
  }

  // ── Per-frame entity work ──────────────────────────────────────────────────
  private updateEnts(dt: number) {
    const magnet = (this.powers.magnet ?? 0) > 0 || (this.powers.boost ?? 0) > 0;
    for (let i = this.ents.length - 1; i >= 0; i--) {
      const e = this.ents[i];
      if (e.kind === "truck" && this.state !== "over") e.d -= 15 * dt;
      if (e.kind === "drone") e.x = Math.cos(this.time * 1.7 + (e.phase ?? 0)) * 2.4;
      if (e.kind === "coin" || e.kind === "power") {
        e.obj.rotation.y += dt * 4;
        if (e.kind === "coin" && magnet && !e.hit) {
          const rel = e.d - this.distance;
          if (rel < 16 && rel > -1) e.pulled = true;
          if (e.pulled) {
            const k = Math.min(1, dt * 12);
            e.x += (this.px - e.x) * k;
            e.y += (this.py + 0.9 - e.y) * k;
            e.d += (this.distance - e.d) * k;
          }
        }
      }
      const z = -(e.d - this.distance);
      e.obj.position.set(e.x, e.y, z);
      if (e.kind === "drone") e.obj.position.y = 1.3 + Math.sin(this.time * 6 + (e.phase ?? 0)) * 0.08;
      if (e.kind === "power") e.obj.position.y = e.y + Math.sin(this.time * 3) * 0.15;
      if (z > 14 || e.hit && (e.kind === "coin" || e.kind === "power")) {
        this.release(e.key, e.obj);
        this.ents.splice(i, 1);
      }
    }
  }

  private collide() {
    const top = this.py + (this.slideT > 0 ? 0.85 : 1.75);
    const bottom = this.py;
    const boosting = (this.powers.boost ?? 0) > 0;
    for (const e of this.ents) {
      if (e.hit) continue;
      const dz = Math.abs(e.d - this.distance);
      if (e.kind === "coin") {
        if (dz < 1.0 && Math.abs(e.x - this.px) < 0.9 && Math.abs(e.y - (this.py + 0.9)) < 1.3) {
          e.hit = true;
          this.coins += (this.powers.double ?? 0) > 0 ? 2 : 1;
          this.opts.audio.sfx("coin");
          this.burst(e.x, e.y, -(e.d - this.distance), 5, "gold", 3);
        }
        continue;
      }
      if (e.kind === "power") {
        if (dz < 1.1 && Math.abs(e.x - this.px) < 1.0 && Math.abs(e.y - (this.py + 0.9)) < 1.4) {
          e.hit = true;
          this.grant(e.power!);
        }
        continue;
      }
      if (dz > e.halfD + 0.32) continue;
      if (Math.abs(e.x - this.px) > e.halfW + 0.36) continue;
      if (top <= e.y0 || bottom >= e.y1) continue;
      // A hit.
      if (boosting || this.shield) {
        e.hit = true;
        e.obj.visible = false;
        this.burst(e.x, 1, -(e.d - this.distance), 22, e.kind === "drone" ? "spark" : "concrete", 8);
        this.opts.audio.sfx("smash");
        this.shake = Math.max(this.shake, 0.35);
        if (!boosting) {
          this.shield = false;
          delete this.powers.shield;
          this.opts.events.banner?.("Shield broke", "steel");
        }
        continue;
      }
      // Mid-jump, an obstacle is a springboard, not a wall: bounce off its top and carry on.
      if (this.py > 0.05) {
        this.bounce(e);
        continue;
      }
      const headOn = Math.abs(e.x - this.px) < e.halfW - 0.2;
      if (e.kind === "drone" || !headOn) this.stumble(e);
      else {
        e.hit = true;
        this.die(e.kind === "truck" ? "Flattened by a truck" : e.kind === "beam" ? "Clotheslined by a girder" : e.kind === "barrier" ? "Tripped over a barricade" : "Ran into a wreck");
      }
      if (this.state !== "running") return;
    }
  }

  /**
   * Hitting an obstacle in the air bounces you off it instead of ending the run.
   * Girders are overhead, so those knock you down into a slide underneath; drones get stomped;
   * everything else springs you high enough to clear its top.
   */
  private bounce(e: Ent) {
    e.hit = true;
    const z = -(e.d - this.distance);
    if (e.kind === "beam") {
      this.vy = -26;
      this.slideAfterLand = true;
      this.shake = Math.max(this.shake, 0.2);
      this.opts.audio.sfx("stumble");
      this.burst(e.x, 1.4, z, 8, "spark", 4);
      return;
    }
    if (e.kind === "drone") {
      e.obj.visible = false;
      this.burst(e.x, 1.3, z, 18, "spark", 7);
      this.opts.audio.sfx("smash");
      this.opts.events.banner?.("Stomped!", "signal");
    } else {
      this.opts.events.banner?.("Bounce!", "signal");
    }
    // Enough lift to clear the obstacle's top from wherever you met it.
    const rise = Math.max(0.6, e.y1 + 0.5 - this.py);
    this.vy = Math.max(14, Math.sqrt(2 * -GRAVITY * rise));
    this.slideT = 0;
    this.jumpBuffer = 0;
    this.shake = Math.max(this.shake, 0.18);
    this.opts.audio.sfx("jump");
    this.dust(6);
  }

  private grant(p: PowerKind) {
    this.opts.audio.sfx("power");
    this.powers[p] = POWER_TIME[p];
    if (p === "shield") this.shield = true;
    if (p === "boost") this.heat = 0;
    const label: Record<PowerKind, string> = { magnet: "Magnet", shield: "Shield", boost: "Adrenaline!", double: "Double scrap" };
    this.opts.events.banner?.(label[p], p === "boost" ? "rust" : p === "shield" ? "signal" : p === "magnet" ? "steel" : "hazard");
    this.burst(this.px, 1.2, 0, 16, "gold", 5);
  }

  // ── Scenery ────────────────────────────────────────────────────────────────
  private updateProps() {
    const r = this.srng;
    const far = this.distance + VIEW + 20;
    for (const side of ["left", "right"] as const) {
      while (this.propNext[side] < far) {
        const variant = Math.floor(r() * 4);
        const key = `bld${variant}`;
        const obj = this.take(key) ?? this.buildBuilding(variant);
        const w = (obj.userData.w as number) ?? 8;
        const sx = side === "left" ? -1 : 1;
        obj.position.x = sx * (9 + w / 2 + r() * 3);
        obj.rotation.y = 0;
        obj.userData.mat.forEach((m: THREE.MeshStandardMaterial) => m.emissiveIntensity = 0.9);
        this.scene.add(obj);
        this.props.push({ d: this.propNext[side] + w / 2, obj, key });
        this.propNext[side] += w + 1 + r() * 6;
      }
    }
    while (this.propNext.lamp < far) {
      for (const sx of [-1, 1]) {
        const obj = this.take("lamp") ?? this.buildLamp();
        obj.scale.x = sx;
        obj.position.x = sx * 5.3;
        this.scene.add(obj);
        this.props.push({ d: this.propNext.lamp + (sx > 0 ? 18 : 0), obj, key: "lamp" });
      }
      this.propNext.lamp += 36;
    }
    while (this.propNext.junk < far) {
      const variant = Math.floor(r() * 3);
      const key = `junk${variant}`;
      const obj = this.take(key) ?? this.buildJunk(variant);
      const sx = r() < 0.5 ? -1 : 1;
      obj.position.x = sx * (5.6 + r() * 1.6);
      obj.rotation.y = r() * Math.PI;
      this.scene.add(obj);
      this.props.push({ d: this.propNext.junk, obj, key });
      this.propNext.junk += 9 + r() * 22;
    }
    for (let i = this.props.length - 1; i >= 0; i--) {
      const p = this.props[i];
      const z = -(p.d - this.distance);
      p.obj.position.z = z;
      if (z > 30) {
        this.release(p.key, p.obj);
        this.props.splice(i, 1);
      }
    }
  }

  private updateZone(dt: number) {
    const z = Math.floor(this.distance / ZONE_LEN) % ZONES.length;
    if (z !== this.zone) {
      this.zone = z;
      this.opts.events.banner?.(ZONES[z].name, "hazard");
    }
    const target = ZONES[this.zone];
    const k = Math.min(1, dt * 0.8);
    this.bgColor.lerp(new THREE.Color(target.bg), k);
    (this.scene.background as THREE.Color).copy(this.bgColor);
    this.fog.color.lerp(new THREE.Color(target.fog), k);
    this.hemi.color.lerp(new THREE.Color(target.sky), k);
    (this.skyline.material as THREE.MeshBasicMaterial).color.lerp(new THREE.Color(target.sky), k);
    this.lampMat.color.lerp(new THREE.Color(target.lamp), k);
    this.glowMat.color.lerp(new THREE.Color(target.lamp), k);
    for (const set of this.facades) for (const m of set) m.emissive.lerp(new THREE.Color(target.lit), k);
  }

  // ── Runner & camera ────────────────────────────────────────────────────────
  private animateRunner(dt: number, speed: number) {
    const rig = this.rig;
    const sliding = this.slideT > 0;
    const air = this.py > 0.001;
    this.runPhase += dt * (4 + speed * 0.42);
    const s = Math.sin(this.runPhase);
    this.runner.position.set(this.px, this.py, 0);
    if (this.state === "dying" || this.state === "over") {
      this.runner.rotation.x = Math.min(this.runner.rotation.x + dt * 7, Math.PI / 2);
      this.runner.position.y = Math.max(0.2, this.runner.position.y);
      rig.legL.rotation.x = rig.legR.rotation.x = 0.4;
      return;
    }
    const lean = (LANE_X[this.lane] - this.px) * -0.12;
    this.runner.rotation.z += (lean - this.runner.rotation.z) * Math.min(1, dt * 10);
    const targetX = sliding ? 1.15 : air ? -0.15 : -0.12;
    this.runner.rotation.x += (targetX - this.runner.rotation.x) * Math.min(1, dt * 16);
    rig.body.position.y = sliding ? -0.35 : air ? 0 : Math.abs(s) * 0.09;
    if (air) {
      rig.legL.rotation.x = rig.legR.rotation.x = -1.0;
      rig.armL.rotation.x = rig.armR.rotation.x = -2.4;
    } else if (sliding) {
      rig.legL.rotation.x = rig.legR.rotation.x = -1.4;
      rig.armL.rotation.x = rig.armR.rotation.x = 0.6;
    } else {
      rig.legL.rotation.x = s * 1.0;
      rig.legR.rotation.x = -s * 1.0;
      rig.armL.rotation.x = -s * 0.9;
      rig.armR.rotation.x = s * 0.9;
    }
    rig.tail.rotation.y = Math.sin(this.runPhase * 0.5) * 0.4;
    const shielded = this.shield || (this.powers.boost ?? 0) > 0;
    rig.bubble.visible = shielded;
    if (shielded) {
      rig.bubble.rotation.y += dt * 2;
      (rig.bubble.material as THREE.MeshBasicMaterial).color.set((this.powers.boost ?? 0) > 0 ? 0xd0603a : 0x9be29f);
    }
    this.shadow.position.set(this.px, 0.02, 0);
    const sc = Math.max(0.4, 1 - this.py * 0.18);
    this.shadow.scale.set(sc, sc, sc);
  }

  private animateSwarm(dt: number) {
    const close = this.state === "dying" || this.state === "over" ? 1 : this.heat > 0 ? 0.55 + (this.heat / HEAT_TIME) * 0.25 : this.intro > 0 ? 0.5 : 0;
    const cur = this.swarm.userData.close ?? 0;
    const next = cur + (close - cur) * Math.min(1, dt * 3);
    this.swarm.userData.close = next;
    this.swarm.visible = next > 0.03;
    this.swarm.position.set(this.px * 0.8, 1.1, 2.2 + (1 - next) * 12);
    for (const b of this.swarmBits) {
      b.a += dt * b.s;
      b.m.position.set(Math.cos(b.a) * b.r, Math.sin(b.a * 1.3) * 0.5 + b.h, Math.sin(b.a) * b.r * 0.6);
      b.m.rotation.y += dt * 5;
    }
  }

  private updateCamera(dt: number) {
    const boost = this.boostMix;
    const fov = 60 + Math.max(0, this.speed - RUN.baseSpeed) * 0.35 + boost * 9;
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 4 || 1);
      this.camera.updateProjectionMatrix();
    }
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const sx = (Math.random() - 0.5) * this.shake * 0.6;
    const sy = (Math.random() - 0.5) * this.shake * 0.6;
    const cx = this.px * 0.55;
    // Portrait screens sit higher and further back, so the runner doesn't hide the lane ahead.
    const tall = this.camera.aspect < 0.8;
    this.camera.position.set(cx + sx, (tall ? 4.9 : 3.5) + this.py * 0.35 + sy, (tall ? 7.6 : 6.6) - boost * 0.8);
    this.camera.lookAt(this.px * 0.7, (tall ? 0.9 : 1.3) + this.py * 0.3, tall ? -16 : -10);
  }

  private resize() {
    const host = this.canvas.parentElement ?? this.canvas;
    const w = host.clientWidth || window.innerWidth;
    const h = host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Narrow phones need a wider view to see all three lanes.
    this.camera.zoom = w / h < 0.75 ? 0.78 : 1;
    this.camera.updateProjectionMatrix();
    if (this.state !== "running") this.renderOnce();
  }

  // ── Particles ──────────────────────────────────────────────────────────────
  private particle(kind: "gold" | "spark" | "concrete" | "dust" | "streak"): Particle {
    const p = this.partPool.pop() ?? { mesh: new THREE.Mesh(this.geo("part", () => new THREE.BoxGeometry(1, 1, 1))), v: new THREE.Vector3(), life: 0, max: 1, world: true, spin: 0 };
    p.mesh.material = this.mat(`p-${kind}`, () => new THREE.MeshBasicMaterial({ color: { gold: 0xffc76b, spark: 0xff7a3b, concrete: 0x8a877d, dust: 0x6b6458, streak: 0xffffff }[kind], transparent: kind === "streak" || kind === "dust", opacity: kind === "streak" ? 0.5 : kind === "dust" ? 0.6 : 1 }));
    this.scene.add(p.mesh);
    this.particles.push(p);
    return p;
  }

  private burst(x: number, y: number, z: number, n: number, kind: "gold" | "spark" | "concrete", power: number) {
    for (let i = 0; i < n; i++) {
      const p = this.particle(kind);
      const s = kind === "concrete" ? 0.18 + Math.random() * 0.22 : 0.08 + Math.random() * 0.08;
      p.mesh.scale.set(s, s, s);
      p.mesh.position.set(x + (Math.random() - 0.5) * 0.6, y + Math.random() * 0.6, z);
      p.v.set((Math.random() - 0.5) * power, Math.random() * power, (Math.random() - 0.5) * power);
      p.life = p.max = 0.5 + Math.random() * 0.5;
      p.world = true;
      p.spin = (Math.random() - 0.5) * 12;
    }
  }

  private dust(n: number) {
    for (let i = 0; i < n; i++) {
      const p = this.particle("dust");
      const s = 0.15 + Math.random() * 0.15;
      p.mesh.scale.set(s, s, s);
      p.mesh.position.set(this.px + (Math.random() - 0.5) * 0.6, 0.1, 0.3);
      p.v.set((Math.random() - 0.5) * 3, Math.random() * 1.5, Math.random() * 2);
      p.life = p.max = 0.4;
      p.world = true;
      p.spin = 3;
    }
  }

  private streak() {
    const p = this.particle("streak");
    p.mesh.scale.set(0.04, 0.04, 3 + Math.random() * 3);
    const a = Math.random() * Math.PI * 2;
    p.mesh.position.set(this.px + Math.cos(a) * (2.5 + Math.random() * 3), 2 + Math.sin(a) * 2.2, -20 - Math.random() * 10);
    p.v.set(0, 0, 40);
    p.life = p.max = 0.6;
    p.world = true;
    p.spin = 0;
  }

  private updateParticles(dt: number, move: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
        this.partPool.push(p);
        continue;
      }
      p.v.y += (p.mesh.scale.z > 1 ? 0 : -18) * dt;
      p.mesh.position.addScaledVector(p.v, dt);
      if (p.world) p.mesh.position.z += move;
      if (p.mesh.position.y < 0.05 && p.v.y < 0) {
        p.mesh.position.y = 0.05;
        p.v.y *= -0.3;
        p.v.x *= 0.6;
      }
      p.mesh.rotation.x += p.spin * dt;
      p.mesh.rotation.y += p.spin * dt;
    }
  }

  // ── Building the world ─────────────────────────────────────────────────────
  private tex(name: string, make: () => THREE.Texture) {
    const key = `tex:${name}`;
    if (!this.mats[key]) this.mats[key] = new THREE.MeshBasicMaterial({ map: make() });
    return (this.mats[key] as THREE.MeshBasicMaterial).map!;
  }

  private mat<M extends THREE.Material>(name: string, make: () => M): M {
    if (!this.mats[name]) this.mats[name] = make();
    return this.mats[name] as M;
  }

  private geo<G extends THREE.BufferGeometry>(name: string, make: () => G): G {
    if (!this.geos[name]) this.geos[name] = make();
    return this.geos[name] as G;
  }

  private buildWorld() {
    const s = this.scene;
    const z0 = ZONES[0];
    this.bgColor.set(z0.bg);
    s.background = this.bgColor.clone();
    this.fog = new THREE.Fog(z0.fog, 28, VIEW + 10);
    s.fog = this.fog;
    this.hemi = new THREE.HemisphereLight(z0.sky, 0x1a1410, 1.7);
    s.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xffe2b8, 1.5);
    sun.position.set(-5, 10, 8);
    s.add(sun);

    // Road, sidewalks, rails: long strips whose textures scroll.
    this.road = T.roadTexture(TRACK_LEN);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(T.ROAD_WIDTH, TRACK_LEN), new THREE.MeshStandardMaterial({ map: this.road, roughness: 0.95 }));
    road.rotation.x = -Math.PI / 2;
    road.position.z = -TRACK_LEN / 2 + 20;
    s.add(road);
    this.walk = T.sidewalkTexture(TRACK_LEN);
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(4, 0.25, TRACK_LEN), new THREE.MeshStandardMaterial({ map: this.walk, roughness: 1 }));
      w.position.set(sx * (T.ROAD_WIDTH / 2 + 2), 0.12, -TRACK_LEN / 2 + 20);
      s.add(w);
    }
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, TRACK_LEN), new THREE.MeshStandardMaterial({ color: 0x141412, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.02, -TRACK_LEN / 2 + 20);
    s.add(ground);
    this.rails = T.railTexture(TRACK_LEN);
    for (const sx of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_LEN, 0.9), new THREE.MeshStandardMaterial({ map: this.rails, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4 }));
      rail.rotation.y = Math.PI / 2;
      rail.position.set(sx * 4.75, 0.6, -TRACK_LEN / 2 + 20);
      s.add(rail);
    }

    // Skyline far out, outside the fog.
    this.skyline = new THREE.Mesh(new THREE.PlaneGeometry(700, 170), new THREE.MeshBasicMaterial({ map: T.skylineTexture(), color: z0.sky, fog: false, transparent: true, depthWrite: false }));
    this.skyline.position.set(0, 55, -300);
    s.add(this.skyline);

    this.lampMat = new THREE.MeshBasicMaterial({ color: z0.lamp });
    this.glowMat = new THREE.SpriteMaterial({ map: T.glowTexture(), color: z0.lamp, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });

    this.facades = [0, 1, 2, 3].map((v) => [0, 1].map((k) => {
      const t = T.facadeTexture(v * 10 + k + 3, 6, 16, z0.lit);
      return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: new THREE.Color(z0.lit), emissiveIntensity: 0.9, roughness: 0.9 });
    }));

    this.buildRunner();
    this.buildSwarm();
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: T.blobShadow(), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    this.shadow = shadow;
    s.add(shadow);

    // Pre-fill the scenery so the first frame isn't empty.
    this.propNext = { left: -30, right: -26, lamp: -20, junk: 10 };
    this.updateProps();
  }

  private buildRunner() {
    const g = new THREE.Group();
    const body = new THREE.Group();
    g.add(body);
    const fur = new THREE.MeshStandardMaterial({ color: 0xa7a296, roughness: 0.85 });
    const pink = new THREE.MeshStandardMaterial({ color: 0xe59a9a, roughness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1d1f1c, roughness: 0.7 });
    const olive = new THREE.MeshStandardMaterial({ color: 0x4a5a3c, roughness: 0.9 });
    const amber = new THREE.MeshStandardMaterial({ color: 0xf2a93b, roughness: 0.5, emissive: 0x3a2000 });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.42, 6, 14), fur);
    torso.position.y = 1.05;
    body.add(torso);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), pink);
    belly.scale.set(1, 1.2, 0.6);
    belly.position.set(0, 1.0, -0.2);
    body.add(belly);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 20, 16), fur);
    head.position.set(0, 1.66, -0.05);
    body.add(head);
    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.32, 14), fur);
    snout.rotation.x = -Math.PI / 2;
    snout.position.set(0, 1.6, -0.42);
    body.add(snout);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), pink);
    nose.position.set(0, 1.6, -0.59);
    body.add(nose);
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.06, 22), fur);
      ear.rotation.x = Math.PI / 2;
      ear.position.set(sx * 0.32, 2.0, 0.02);
      body.add(ear);
      const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 20), pink);
      inner.rotation.x = Math.PI / 2;
      inner.position.set(sx * 0.32, 2.0, -0.02);
      body.add(inner);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), dark);
      eye.position.set(sx * 0.14, 1.74, -0.33);
      body.add(eye);
    }
    // Goggles strap and scarf, district colours.
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 8, 20), amber);
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 1.38;
    body.add(scarf);
    const tailEnd = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.5), amber);
    tailEnd.position.set(0.18, 1.32, 0.35);
    tailEnd.rotation.set(0.6, 0.3, 0);
    body.add(tailEnd);

    // Backpack with the Squeek plate facing the camera.
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.62, 0.26), olive);
    pack.position.set(0, 1.12, 0.36);
    body.add(pack);
    const plate = new THREE.MeshStandardMaterial({ map: this.opts.plate ?? this.tex("plate", () => T.defaultPlate()), roughness: 0.6 });
    const plateMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46), plate);
    plateMesh.position.set(0, 1.14, 0.495);
    body.add(plateMesh);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.52, 0.02), amber);
    frame.position.set(0, 1.14, 0.485);
    body.add(frame);

    const tail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.1, 0.4), new THREE.Vector3(0.1, 0.25, 0.8), new THREE.Vector3(-0.1, 0.6, 0.95)]), 20, 0.045, 6), pink);
    tail.position.set(0, 0.78, 0.25);
    body.add(tail);

    const limb = (x: number, y: number, len: number, mat: THREE.Material) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, len, 4, 8), mat);
      m.position.y = -len / 2 - 0.05;
      pivot.add(m);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), pink);
      foot.scale.set(1, 0.6, 1.5);
      foot.position.set(0, -len - 0.1, -0.06);
      pivot.add(foot);
      body.add(pivot);
      return pivot;
    };
    const legL = limb(-0.17, 0.72, 0.45, fur);
    const legR = limb(0.17, 0.72, 0.45, fur);
    const armL = limb(-0.42, 1.32, 0.34, fur);
    const armR = limb(0.42, 1.32, 0.34, fur);

    const bubble = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 1), new THREE.MeshBasicMaterial({ color: 0x9be29f, wireframe: true, transparent: true, opacity: 0.45 }));
    bubble.position.y = 1.1;
    bubble.visible = false;
    g.add(bubble);

    this.runner = g;
    this.rig = { body, legL, legR, armL, armR, tail, plate, bubble };
    this.scene.add(g);
  }

  private buildSwarm() {
    const g = new THREE.Group();
    const shell = new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.4, metalness: 0.6 });
    const eye = new THREE.MeshBasicMaterial({ color: 0xff3b2b });
    const geo = new THREE.IcosahedronGeometry(0.22, 0);
    const eg = new THREE.SphereGeometry(0.06, 6, 6);
    for (let i = 0; i < 42; i++) {
      const m = new THREE.Group();
      const b = new THREE.Mesh(geo, shell);
      const e1 = new THREE.Mesh(eg, eye);
      e1.position.set(0.08, 0.05, -0.2);
      const e2 = e1.clone();
      e2.position.x = -0.08;
      m.add(b, e1, e2);
      const sc = 0.6 + Math.random() * 0.9;
      m.scale.setScalar(sc);
      g.add(m);
      this.swarmBits.push({ m, a: Math.random() * Math.PI * 2, r: 0.6 + Math.random() * 2.6, s: 1.5 + Math.random() * 3, h: Math.random() * 1.6 - 0.4 });
    }
    this.swarm = g;
    this.scene.add(g);
  }

  private buildBuilding(variant: number) {
    const sizes = [[8, 18, 8], [6, 30, 7], [10, 12, 9], [7, 44, 8]][variant];
    const [w, h, dp] = sizes;
    const g = new THREE.Group();
    const geo = new THREE.BoxGeometry(w, h, dp);
    const set = this.facades[variant];
    const m = new THREE.Mesh(geo, set[0]);
    m.position.y = h / 2;
    g.add(m);
    if (variant !== 2) {
      // A broken-off top section.
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 3, dp * 0.6), set[1]);
      cap.position.set(w * 0.15, h + 1.4, 0);
      cap.rotation.z = 0.08;
      g.add(cap);
    }
    if (variant === 3) {
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6), this.mat("steel", () => new THREE.MeshStandardMaterial({ color: 0x454e48 })));
      ant.position.set(-w * 0.2, h + 3, 0);
      g.add(ant);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.3), this.mat("beacon", () => new THREE.MeshBasicMaterial({ color: 0xff3b2b })));
      beacon.position.set(-w * 0.2, h + 6, 0);
      g.add(beacon);
    }
    g.userData = { w, mat: set };
    return g;
  }

  private buildLamp() {
    const g = new THREE.Group();
    const steel = this.mat("lampsteel", () => new THREE.MeshStandardMaterial({ color: 0x2f3732, roughness: 0.6, metalness: 0.5 }));
    const pole = new THREE.Mesh(this.geo("pole", () => new THREE.CylinderGeometry(0.08, 0.1, 6.4)), steel);
    pole.position.y = 3.2;
    const arm = new THREE.Mesh(this.geo("arm", () => new THREE.BoxGeometry(1.7, 0.1, 0.1)), steel);
    arm.position.set(-0.8, 6.3, 0);
    const bulb = new THREE.Mesh(this.geo("bulb", () => new THREE.BoxGeometry(0.5, 0.14, 0.3)), this.lampMat);
    bulb.position.set(-1.5, 6.2, 0);
    const glow = new THREE.Sprite(this.glowMat);
    glow.scale.set(3.2, 3.2, 1);
    glow.position.set(-1.5, 6.1, 0);
    const pool = new THREE.Mesh(this.geo("lightpool", () => new THREE.PlaneGeometry(4, 4)), this.mat("lightpool", () => new THREE.MeshBasicMaterial({ map: T.glowTexture(), color: 0xffc76b, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false })));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(-1.8, 0.03, 0);
    g.add(pole, arm, bulb, glow, pool);
    return g;
  }

  private buildJunk(variant: number) {
    const g = new THREE.Group();
    if (variant === 0) {
      const barrel = this.mat("barrel", () => new THREE.MeshStandardMaterial({ color: 0x8f3a1f, roughness: 0.7, metalness: 0.3 }));
      for (let i = 0; i < 3; i++) {
        const b = new THREE.Mesh(this.geo("barrel", () => new THREE.CylinderGeometry(0.35, 0.35, 0.95, 14)), barrel);
        b.position.set((i - 1) * 0.75, 0.48, (i % 2) * 0.4);
        if (i === 2) {
          b.rotation.z = Math.PI / 2;
          b.position.y = 0.35;
        }
        g.add(b);
      }
    } else if (variant === 1) {
      const car = this.mat("junkcar", () => new THREE.MeshStandardMaterial({ map: T.containerTexture("#3d4a52"), roughness: 0.8 }));
      const body = new THREE.Mesh(this.geo("junkcar", () => new THREE.BoxGeometry(1.8, 0.8, 3.6)), car);
      body.position.y = 0.55;
      body.rotation.z = 0.12;
      const cab = new THREE.Mesh(this.geo("junkcab", () => new THREE.BoxGeometry(1.5, 0.6, 1.8)), car);
      cab.position.set(0, 1.2, 0.2);
      g.add(body, cab);
    } else {
      const fire = new THREE.Mesh(this.geo("firebarrel", () => new THREE.CylinderGeometry(0.4, 0.4, 1)), this.mat("firebarrel", () => new THREE.MeshStandardMaterial({ color: 0x2a2a28 })));
      fire.position.y = 0.5;
      const flame = new THREE.Sprite(this.mat("flame", () => new THREE.SpriteMaterial({ map: T.glowTexture(), color: 0xff7a2b, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })));
      flame.scale.set(2.2, 2.6, 1);
      flame.position.y = 1.4;
      g.add(fire, flame);
    }
    return g;
  }

  private dressPower(e: Ent) {
    const core = e.obj.children[0] as THREE.Mesh;
    const ring = e.obj.children[1] as THREE.Mesh;
    const c = POWER_COLOR[e.power!];
    (core.material as THREE.MeshStandardMaterial).color.set(c);
    (core.material as THREE.MeshStandardMaterial).emissive.set(c);
    (ring.material as THREE.MeshBasicMaterial).color.set(c);
    ((e.obj.children[2] as THREE.Sprite).material as THREE.SpriteMaterial).color.set(c);
  }

  private build(kind: Kind): THREE.Object3D {
    const g = new THREE.Group();
    switch (kind) {
      case "barrier": {
        const m = new THREE.Mesh(this.geo("barrier", () => new THREE.BoxGeometry(2.0, 1.0, 0.6)), this.mat("barrier", () => new THREE.MeshStandardMaterial({ map: T.concreteTexture(), roughness: 0.9 })));
        m.position.y = 0.5;
        const lamp = new THREE.Mesh(this.geo("blink", () => new THREE.SphereGeometry(0.09, 8, 6)), this.mat("blink", () => new THREE.MeshBasicMaterial({ color: 0xffb030 })));
        lamp.position.set(0.8, 1.08, 0);
        g.add(m, lamp);
        break;
      }
      case "beam": {
        const steel = this.mat("girder", () => new THREE.MeshStandardMaterial({ color: 0x6b3a22, roughness: 0.6, metalness: 0.5 }));
        const beam = new THREE.Mesh(this.geo("beam", () => new THREE.BoxGeometry(2.3, 0.5, 0.45)), this.mat("beamstripe", () => new THREE.MeshStandardMaterial({ map: T.stripes(), roughness: 0.6 })));
        beam.position.y = 1.55;
        const sign = new THREE.Mesh(this.geo("sign", () => new THREE.PlaneGeometry(1.4, 0.35)), this.mat("sign", () => new THREE.MeshBasicMaterial({ map: T.signTexture("DUCK"), side: THREE.DoubleSide })));
        sign.position.set(0, 1.55, 0.24);
        for (const sx of [-1, 1]) {
          const post = new THREE.Mesh(this.geo("post", () => new THREE.BoxGeometry(0.16, 2.2, 0.16)), steel);
          post.position.set(sx * 1.08, 1.1, 0);
          g.add(post);
        }
        const chain = new THREE.Mesh(this.geo("chain", () => new THREE.BoxGeometry(2.2, 0.12, 0.12)), steel);
        chain.position.y = 2.35;
        g.add(beam, sign, chain);
        break;
      }
      case "wall": {
        const colors = ["#7a2f1d", "#2f4f5a", "#5a5a2a"];
        const c = colors[Math.floor(this.srng() * colors.length)];
        const box = new THREE.Mesh(this.geo("container", () => new THREE.BoxGeometry(2.1, 2.6, 3.0)), this.mat(`container-${c}`, () => new THREE.MeshStandardMaterial({ map: T.containerTexture(c), roughness: 0.8, metalness: 0.2 })));
        box.position.y = 1.3;
        const stripe = new THREE.Mesh(this.geo("cstripe", () => new THREE.PlaneGeometry(2.1, 0.4)), this.mat("beamstripe2", () => new THREE.MeshBasicMaterial({ map: T.stripes("#f2a93b", "#151515", 8) })));
        stripe.position.set(0, 0.5, 1.51);
        g.add(box, stripe);
        break;
      }
      case "drone": {
        const shell = this.mat("drone", () => new THREE.MeshStandardMaterial({ color: 0x23272a, roughness: 0.4, metalness: 0.7 }));
        const core = new THREE.Mesh(this.geo("dronecore", () => new THREE.BoxGeometry(0.8, 0.28, 0.8)), shell);
        const eye = new THREE.Mesh(this.geo("droneeye", () => new THREE.SphereGeometry(0.14, 10, 8)), this.mat("droneeye", () => new THREE.MeshBasicMaterial({ color: 0xff3b2b })));
        eye.position.set(0, -0.05, 0.42);
        const glow = new THREE.Sprite(this.mat("droneglow", () => new THREE.SpriteMaterial({ map: T.glowTexture(), color: 0xff3b2b, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })));
        glow.scale.set(1.4, 1.4, 1);
        glow.position.copy(eye.position);
        g.add(core, eye, glow);
        for (const [x, z] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) {
          const rotor = new THREE.Mesh(this.geo("rotor", () => new THREE.CylinderGeometry(0.3, 0.3, 0.03, 12)), this.mat("rotor", () => new THREE.MeshBasicMaterial({ color: 0x9aa0a0, transparent: true, opacity: 0.35 })));
          rotor.position.set(x, 0.18, z);
          g.add(rotor);
        }
        break;
      }
      case "truck": {
        const paint = this.mat("truck", () => new THREE.MeshStandardMaterial({ map: T.containerTexture("#6b6b5a"), roughness: 0.7, metalness: 0.3 }));
        const cargo = new THREE.Mesh(this.geo("cargo", () => new THREE.BoxGeometry(2.1, 2.5, 3.8)), paint);
        cargo.position.set(0, 1.45, 0.8);
        const cab = new THREE.Mesh(this.geo("cab", () => new THREE.BoxGeometry(2.0, 1.9, 1.5)), this.mat("cab", () => new THREE.MeshStandardMaterial({ color: 0x8f3a1f, roughness: 0.6 })));
        cab.position.set(0, 1.15, -1.9);
        const glass = new THREE.Mesh(this.geo("glass", () => new THREE.PlaneGeometry(1.7, 0.6)), this.mat("glass", () => new THREE.MeshBasicMaterial({ color: 0x1a2a30 })));
        glass.position.set(0, 1.6, -2.66);
        glass.rotation.y = Math.PI;
        const plow = new THREE.Mesh(this.geo("plow", () => new THREE.BoxGeometry(2.3, 0.6, 0.2)), this.mat("beamstripe", () => new THREE.MeshStandardMaterial({ map: T.stripes(), roughness: 0.6 })));
        plow.position.set(0, 0.45, -2.75);
        g.add(cargo, cab, glass, plow);
        for (const sx of [-0.65, 0.65]) {
          const light = new THREE.Sprite(this.mat("headlight", () => new THREE.SpriteMaterial({ map: T.glowTexture(), color: 0xfff2c0, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })));
          light.scale.set(2.2, 2.2, 1);
          light.position.set(sx, 0.95, -2.8);
          g.add(light);
        }
        const beam = new THREE.Mesh(this.geo("headbeam", () => new THREE.PlaneGeometry(2.6, 14)), this.mat("headbeam", () => new THREE.MeshBasicMaterial({ map: T.glowTexture(), color: 0xfff2c0, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false })));
        beam.rotation.x = -Math.PI / 2;
        beam.position.set(0, 0.04, -9);
        g.add(beam);
        break;
      }
      case "coin": {
        const m = new THREE.Mesh(this.geo("coin", () => new THREE.CylinderGeometry(0.3, 0.3, 0.08, 6)), this.mat("coin", () => new THREE.MeshStandardMaterial({ color: 0xf2a93b, emissive: 0x8a5410, roughness: 0.3, metalness: 0.8 })));
        m.rotation.x = Math.PI / 2;
        const hole = new THREE.Mesh(this.geo("coinhole", () => new THREE.CylinderGeometry(0.11, 0.11, 0.1, 12)), this.mat("coinhole", () => new THREE.MeshBasicMaterial({ color: 0x241706 })));
        hole.rotation.x = Math.PI / 2;
        g.add(m, hole);
        break;
      }
      case "power": {
        const core = new THREE.Mesh(this.geo("powercore", () => new THREE.OctahedronGeometry(0.42)), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.8 }));
        const ring = new THREE.Mesh(this.geo("powerring", () => new THREE.TorusGeometry(0.62, 0.04, 6, 30)), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex("glow", () => T.glowTexture()), color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.6 }));
        glow.scale.set(2.4, 2.4, 1);
        g.add(core, ring, glow);
        break;
      }
    }
    return g;
  }
}
