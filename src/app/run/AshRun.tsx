"use client";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/client/api";
import { useApi, useMe, useMySurvivors } from "@/client/hooks";
import { SurvivorArt } from "@/components/game";
import { RunAudio } from "@/game/run/audio";
import type { Action, PowerKind, RunEngine, RunResult, RunStats } from "@/game/run/engine";
import { useConnectModal } from "@/components/wallet/ConnectModal";

type Phase = "loading" | "menu" | "signing" | "playing" | "paused" | "over";
type Banner = { id: number; text: string; tone: "hazard" | "signal" | "rust" | "steel" };
type Posted = { score: number; rank: number; best: number; name: string };
type Board = { board: string; runs: number; rows: { rank: number; name: string; tokenId: number | null; score: number; distance: number; coins: number }[] };

const POWER_LABEL: Record<PowerKind, string> = { magnet: "Magnet", shield: "Shield", boost: "Adrenaline", double: "2× Scrap" };
const POWER_MAX: Record<PowerKind, number> = { magnet: 10, shield: 30, boost: 5, double: 12 };
const TONE: Record<Banner["tone"], string> = { hazard: "text-hazard", signal: "text-signal", rust: "text-rust", steel: "text-steel" };

const store = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};

export function AshRun() {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const engine = useRef<RunEngine | null>(null);
  const audio = useRef<RunAudio | null>(null);
  const ticket = useRef<string | null>(null);
  const qc = useQueryClient();
  const { data: me } = useMe();
  const survivors = useMySurvivors();
  const [phase, setPhase] = useState<Phase>("loading");
  const [stats, setStats] = useState<RunStats | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [muted, setMuted] = useState(false);
  const [pick, setPick] = useState<number | null>(null);
  const [best, setBest] = useState(0);
  const [signError, setSignError] = useState<string | null>(null);
  const showConnect = useConnectModal((s) => s.show);
  const [posted, setPosted] = useState<Posted | null>(null);
  const [postError, setPostError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [hint, setHint] = useState(true);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    setBest(Number(store.get("ashrun.best") ?? 0));
    const p = Number(store.get("ashrun.squeek") ?? 0);
    if (p) setPick(p);
    audio.current = new RunAudio();
    setMuted(audio.current.muted);
    return () => audio.current?.dispose();
  }, []);

  /** Builds a fresh track. A run's seed comes from the server once the start message is signed. */
  const prepare = useCallback(async (seed = crypto.getRandomValues(new Uint32Array(1))[0]) => {
    engine.current?.dispose();
    engine.current = null;
    const { RunEngine } = await import("@/game/run/engine");
    if (!stage.current) return null;
    // A fresh canvas per run: a disposed WebGL context can't be reused. React never renders into the stage.
    const fresh = document.createElement("canvas");
    fresh.className = "absolute inset-0 block h-full w-full";
    stage.current.replaceChildren(fresh);
    const e = new RunEngine(fresh, {
      seed,
      audio: audio.current!,
      events: {
        stats: (s) => setStats(s),
        over: (r) => {
          setResult(r);
          setPhase("over");
        },
        banner: (text, tone = "hazard") => setBanner({ id: Math.random(), text, tone }),
        paused: () => setPhase("paused"),
      },
    });
    engine.current = e;
    return e;
  }, []);

  useEffect(() => {
    void prepare().then(() => setPhase("menu"));
    return () => engine.current?.dispose();
  }, [prepare]);

  // The chosen Squeek rides on the backpack.
  useEffect(() => {
    if (!engine.current) return;
    if (!pick) {
      engine.current.setPlate(null);
      return;
    }
    let live = true;
    void import("@/game/run/textures").then(({ plateFromImage }) => plateFromImage(`/api/survivors/${pick}/image`)).then((t) => {
      if (live && t) engine.current?.setPlate(t);
    });
    return () => {
      live = false;
    };
  }, [pick, phase === "menu"]);

  /** Every run starts with the wallet signing a gas-free start message for a server-issued ticket. */
  const play = useCallback(async () => {
    const from = phaseRef.current;
    if (from !== "menu" && from !== "over") return;
    if (!me?.signedIn) {
      showConnect();
      return;
    }
    audio.current?.unlock();
    setSignError(null);
    setPhase("signing");
    try {
      const s = await api<{ seed: number; ticket: string; message: string }>("/api/run/start", { body: {} });
      const { signAs } = await import("@/game/run/sign");
      const signature = await signAs(me.wallet, s.message);
      if (phaseRef.current !== "signing") return; // cancelled while the wallet was open
      const armed = await api<{ seed: number; ticket: string }>("/api/run/arm", { body: { ticket: s.ticket, signature } });
      ticket.current = armed.ticket;
      await prepare(armed.seed);
      if (pick) {
        const { plateFromImage } = await import("@/game/run/textures");
        const t = await plateFromImage(`/api/survivors/${pick}/image`);
        if (t) engine.current?.setPlate(t);
      }
    } catch (e) {
      if (phaseRef.current !== "signing") return;
      const { walletError } = await import("@/game/run/sign");
      setSignError(e instanceof ApiError ? e.message : walletError(e));
      setPhase(from);
      return;
    }
    if (phaseRef.current !== "signing") return;
    setResult(null);
    setPosted(null);
    setPostError(null);
    setStats(null);
    setHint(true);
    setTimeout(() => setHint(false), 5000);
    engine.current?.start();
    setPhase("playing");
  }, [prepare, pick, me, showConnect]);

  const togglePause = useCallback(() => {
    const e = engine.current;
    if (!e) return;
    if (phaseRef.current === "playing") {
      e.pause();
      setPhase("paused");
    } else if (phaseRef.current === "paused") {
      audio.current?.unlock();
      e.resume();
      setPhase("playing");
    }
  }, []);

  const act = useCallback((a: Action) => {
    if (phaseRef.current === "playing") engine.current?.input(a);
  }, []);

  // Keyboard.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement)?.tagName === "INPUT") return;
      const k = ev.key;
      const map: Record<string, Action> = { ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right", ArrowUp: "jump", w: "jump", W: "jump", " ": "jump", ArrowDown: "slide", s: "slide", S: "slide" };
      if ((k === " " || k === "Enter") && (phaseRef.current === "menu" || phaseRef.current === "over")) {
        ev.preventDefault();
        void play();
        return;
      }
      if (k === "p" || k === "P" || k === "Escape") {
        togglePause();
        return;
      }
      if (map[k]) {
        ev.preventDefault();
        act(map[k]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act, play, togglePause]);

  // Controllers (standard mapping): d-pad or left stick to steer, Ⓐ/Ⓨ jump, Ⓑ/Ⓧ slide, Start pauses.
  const [pad, setPad] = useState<string | null>(null);
  const padActions = useRef({ act, play, togglePause });
  padActions.current = { act, play, togglePause };
  useEffect(() => {
    let raf = 0;
    const held = new Set<string>();
    const onConnect = (e: GamepadEvent) => setPad(e.gamepad.id.replace(/\s*\(.*$/, "") || "Controller");
    const onDisconnect = () => setPad(navigator.getGamepads?.().some(Boolean) ? "Controller" : null);
    window.addEventListener("gamepadconnected", onConnect);
    window.addEventListener("gamepaddisconnected", onDisconnect);
    const poll = () => {
      raf = requestAnimationFrame(poll);
      const pads = navigator.getGamepads?.() ?? [];
      const now = new Set<string>();
      for (const g of pads) {
        if (!g) continue;
        const b = (i: number) => Boolean(g.buttons[i]?.pressed);
        const [ax = 0, ay = 0] = g.axes;
        if (b(14) || ax < -0.6) now.add("left");
        if (b(15) || ax > 0.6) now.add("right");
        if (b(0) || b(3) || b(12) || ay < -0.6) now.add("jump");
        if (b(1) || b(2) || b(13) || ay > 0.6) now.add("slide");
        if (b(9)) now.add("start");
        if (b(0)) now.add("a");
      }
      // Edge-triggered: one press, one action, however long it's held.
      const pressed = [...now].filter((k) => !held.has(k));
      held.clear();
      now.forEach((k) => held.add(k));
      if (!pressed.length) return;
      const { act, play, togglePause } = padActions.current;
      const ph = phaseRef.current;
      if (ph === "menu" || ph === "over") {
        if (pressed.includes("a") || pressed.includes("start")) void play();
      } else if (ph === "paused") {
        if (pressed.includes("a") || pressed.includes("start")) togglePause();
      } else if (ph === "playing") {
        if (pressed.includes("start")) togglePause();
        for (const k of pressed) if (k === "left" || k === "right" || k === "jump" || k === "slide") act(k);
      }
    };
    poll();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("gamepadconnected", onConnect);
      window.removeEventListener("gamepaddisconnected", onDisconnect);
    };
  }, []);

  // A short rumble on the controller when the run ends.
  useEffect(() => {
    if (phase !== "over") return;
    for (const g of navigator.getGamepads?.() ?? []) {
      const v = (g as (Gamepad & { vibrationActuator?: { playEffect?: (t: string, o: object) => Promise<unknown> } }) | null)?.vibrationActuator;
      void v?.playEffect?.("dual-rumble", { duration: 350, strongMagnitude: 0.9, weakMagnitude: 0.5 }).catch(() => undefined);
    }
  }, [phase]);

  // Swipes: act as soon as the finger has moved far enough, not on release.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let sx = 0;
    let sy = 0;
    let used = false;
    const start = (e: TouchEvent) => {
      if ((e.target as HTMLElement).closest("button,a,input")) return;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      used = false;
    };
    const move = (e: TouchEvent) => {
      if (used || phaseRef.current !== "playing") return;
      const dx = e.touches[0].clientX - sx;
      const dy = e.touches[0].clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 26) return;
      used = true;
      if (Math.abs(dx) > Math.abs(dy)) act(dx < 0 ? "left" : "right");
      else act(dy < 0 ? "jump" : "slide");
      e.preventDefault();
    };
    const end = (e: TouchEvent) => {
      if ((e.target as HTMLElement).closest("button,a,input")) return;
      if (!used && phaseRef.current === "playing") act("jump");
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
    };
  }, [act]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 1800);
    return () => clearTimeout(t);
  }, [banner]);

  // Game over: local best, then post the run.
  const post = useCallback(async () => {
    if (!result || !ticket.current) return;
    setPosting(true);
    setPostError(null);
    try {
      const r = await api<Posted>("/api/run/finish", { body: { ticket: ticket.current, distance: result.distance, coins: result.coins, tokenId: pick } });
      setPosted(r);
      ticket.current = null;
      void qc.invalidateQueries({ queryKey: ["/api/run/leaderboard?board=today"] });
      void qc.invalidateQueries({ queryKey: ["/api/run/leaderboard?board=all"] });
    } catch (e) {
      setPostError(e instanceof ApiError ? e.message : "Couldn't post that run.");
    } finally {
      setPosting(false);
    }
  }, [result, pick, qc]);

  useEffect(() => {
    if (phase !== "over" || !result) return;
    if (result.score > best) {
      setBest(result.score);
      store.set("ashrun.best", String(result.score));
    }
    if (result.distance < 20) return;
    void post();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, result]);

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    audio.current?.unlock();
    audio.current?.setMuted(m);
  };

  const heat = stats ? Math.min(1, stats.heat / 8) : 0;
  const myList = survivors.data?.survivors ?? [];
  const isNewBest = result && result.score >= best && result.score > 0;

  return (
    <div ref={host} className="fixed inset-0 select-none overflow-hidden bg-ash-950 [touch-action:none]">
      <div ref={stage} className="absolute inset-0" />

      {/* Swarm vignette */}
      <div className="pointer-events-none absolute inset-0 transition-opacity duration-300" style={{ opacity: phase === "playing" || phase === "paused" ? heat : 0, background: "radial-gradient(ellipse at center, transparent 45%, rgba(208,40,20,.55) 100%)" }} />

      {/* HUD */}
      {(phase === "playing" || phase === "paused") && stats && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3 sm:p-5">
          <div>
            <p className="stencil text-4xl leading-none text-bone drop-shadow-[0_2px_0_rgba(0,0,0,.6)] sm:text-5xl">{stats.score.toLocaleString()}</p>
            <div className="mt-1 flex items-center gap-3 font-mono text-xs text-bone-dim sm:text-sm">
              <span>{stats.distance.toLocaleString()} m</span>
              <span className="flex items-center gap-1 text-hazard"><Bolt />{stats.coins}</span>
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              {(Object.entries(stats.powers) as [PowerKind, number][]).map(([k, left]) => (
                <div key={k} className="w-32 rounded-[3px] border border-ash-600 bg-ash-950/70 px-2 py-1">
                  <p className="font-mono text-[0.62rem] uppercase tracking-wider text-bone">{POWER_LABEL[k]}</p>
                  {k !== "shield" && <div className="mt-1 h-1 bg-ash-700"><div className="h-full bg-hazard" style={{ width: `${Math.max(0, (left / POWER_MAX[k]) * 100)}%` }} /></div>}
                </div>
              ))}
            </div>
          </div>
          <div className="pointer-events-auto flex gap-2">
            <IconButton label={muted ? "Sound on" : "Mute"} onClick={toggleMute}>{muted ? "M3 9h4l5-4v14l-5-4H3zM16 9l5 6M21 9l-5 6" : "M3 9h4l5-4v14l-5-4H3zM16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14"}</IconButton>
            <IconButton label={phase === "paused" ? "Resume" : "Pause"} onClick={togglePause}>{phase === "paused" ? "M7 5l12 7-12 7z" : "M7 5h3v14H7zM14 5h3v14h-3z"}</IconButton>
          </div>
        </div>
      )}
      {phase === "playing" && heat > 0 && (
        <p className="pointer-events-none absolute inset-x-0 bottom-24 animate-pulse text-center font-mono text-xs uppercase tracking-[0.3em] text-rust">The swarm is on you · don&apos;t stumble again</p>
      )}

      <AnimatePresence>
        {banner && phase === "playing" && (
          <motion.p key={banner.id} initial={{ opacity: 0, y: -10, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }}
            className={`stencil pointer-events-none absolute inset-x-0 top-[22%] text-center text-3xl drop-shadow-[0_3px_0_rgba(0,0,0,.7)] sm:text-5xl ${TONE[banner.tone]}`}>
            {banner.text}
          </motion.p>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {phase === "playing" && hint && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center px-4">
            <p className="rounded-[3px] bg-ash-950/75 px-3 py-2 text-center font-mono text-[0.7rem] text-bone-dim">
              <span className="hidden sm:inline">← → dodge · ↑ / space jump · ↓ slide · P pause</span>
              <span className="sm:hidden">Swipe ← → dodge · ↑ jump · ↓ slide · tap jumps</span>
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {phase === "signing" && (
        <Overlay>
          <p className="eyebrow">Squeekchain · Sepolia</p>
          <h2 className="stencil mt-1 text-5xl">Check your wallet</h2>
          <p className="mt-3 text-sm leading-relaxed text-bone-dim">Sign the start-run message to begin. It&apos;s free: no gas, no transaction, nothing moved or approved.</p>
          <div className="mt-6 flex justify-center"><button className="btn btn-ghost" onClick={() => setPhase(result ? "over" : "menu")}>Cancel</button></div>
        </Overlay>
      )}

      {phase === "paused" && (
        <Overlay>
          <p className="eyebrow">Paused</p>
          <h2 className="stencil mt-1 text-5xl">Catch your breath</h2>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button className="btn btn-hazard px-6 py-3 text-xl" onClick={togglePause}>Keep running</button>
            <Link href="/" className="btn btn-steel">Quit to the district</Link>
          </div>
        </Overlay>
      )}

      {/* Title screen */}
      {(phase === "menu" || phase === "loading") && !result && (
        <Overlay wide>
          <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <p className="eyebrow flex items-center gap-2"><span className="h-1.5 w-1.5 animate-flicker rounded-full bg-rust" />The Last District presents</p>
              <h1 className="stencil mt-1 text-7xl leading-[0.85] sm:text-8xl">Ash <span className="text-hazard">Run</span></h1>
              <p className="mt-3 max-w-md text-[0.95rem] leading-relaxed text-bone-dim">
                The swarm broke through the wall. Grab your pack and run the ruined highway: dodge wrecks, vault barricades, slide under girders, and stay ahead of the oncoming trucks. Stumble twice and they have you.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                {me?.signedIn ? (
                  <button className="btn btn-hazard px-8 py-3 text-2xl" onClick={() => void play()} disabled={phase === "loading"}>
                    {phase === "loading" ? "Loading…" : "Sign & run"}
                  </button>
                ) : (
                  <button className="btn btn-hazard px-8 py-3 text-2xl" onClick={showConnect} disabled={!me}>Connect wallet to run</button>
                )}
                {best > 0 && <span className="chip">Your best {best.toLocaleString()}</span>}
                {pad && <span className="chip chip-steel" title={pad}>🎮 Controller ready · Ⓐ to start</span>}
                <button className="btn btn-ghost px-3 py-2 text-sm" onClick={toggleMute}>{muted ? "Sound off" : "Sound on"}</button>
              </div>
              {signError && <p role="alert" className="mt-3 text-sm text-rust">{signError}</p>}
              <p className="mt-3 max-w-md font-mono text-[0.68rem] leading-relaxed text-bone-mute">
                Each run starts with your wallet signing a Squeekchain (Sepolia) start message. It&apos;s free: no gas, no transaction, nothing moved or approved. Any wallet can run.
              </p>
              <Controls />
              <div className="mt-5">
                <p className="eyebrow mb-2">Run as</p>
                {me?.signedIn ? (
                  survivors.isLoading ? <p className="font-mono text-xs text-bone-mute">Reading your Squeeks…</p> : myList.length ? (
                    <div className="thin-scrollbar flex gap-2 overflow-x-auto pb-2">
                      <SquadPick active={pick === null} onClick={() => { setPick(null); store.set("ashrun.squeek", ""); }}>
                        <span className="grid aspect-square w-full place-items-center bg-ash-800 font-stencil text-xl text-hazard">LD</span>
                      </SquadPick>
                      {myList.map((s) => (
                        <SquadPick key={s.tokenId} active={pick === s.tokenId} onClick={() => { setPick(s.tokenId); store.set("ashrun.squeek", String(s.tokenId)); }} label={`#${s.tokenId}`}>
                          <SurvivorArt tokenId={s.tokenId} hasArt={Boolean(s.imageUrl)} className="aspect-square w-full" />
                        </SquadPick>
                      ))}
                    </div>
                  ) : <p className="font-mono text-xs text-bone-mute">No Squeeks in this wallet. You&apos;ll run with the district badge.</p>
                ) : (
                  <p className="text-sm text-bone-dim">Connect any wallet to run. Squeek holders carry their own Squeek on the pack.</p>
                )}
              </div>
            </div>
            <Leaderboard />
          </div>
          <p className="mt-6 font-mono text-[0.62rem] text-bone-faint">Community-built for Squeek holders. Not an official Squeekchain product. <Link href="/" className="hover:text-hazard">← The Last District</Link></p>
        </Overlay>
      )}

      {/* Game over */}
      {phase === "over" && result && (
        <Overlay wide>
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <div>
              <p className="eyebrow text-rust">{result.cause}</p>
              <h2 className="stencil mt-1 text-6xl leading-none">{result.score.toLocaleString()}</h2>
              {isNewBest && <p className="stencil mt-1 text-2xl text-signal">New personal best!</p>}
              <div className="mt-3 flex flex-wrap gap-2 font-mono text-sm">
                <span className="chip">{result.distance.toLocaleString()} m</span>
                <span className="chip text-hazard"><Bolt /> {result.coins} scrap</span>
                <span className="chip">{Math.round(result.durationMs / 1000)} s</span>
              </div>
              <div className="mt-5 min-h-[5.5rem]">
                {posted ? (
                  <p className="text-bone-dim">Posted as <b className="text-bone">{posted.name}</b>. You&apos;re <b className="text-hazard">#{posted.rank}</b> on the all-time board{posted.best > posted.score ? `; your best is ${posted.best.toLocaleString()}` : ""}.</p>
                ) : result.distance < 20 ? (
                  <p className="font-mono text-xs text-bone-mute">Run at least 20 m to post a score.</p>
                ) : (
                  <p className={`font-mono text-xs ${postError ? "text-rust" : "text-bone-mute"}`}>{posting ? "Posting…" : postError ?? ""}</p>
                )}
                {signError && <p role="alert" className="mt-2 text-sm text-rust">{signError}</p>}
              </div>
              <div className="mt-2 flex flex-wrap gap-3">
                <button className="btn btn-hazard px-8 py-3 text-2xl" onClick={() => void play()}>Sign &amp; run again</button>
                <Link href="/" className="btn btn-ghost">The district</Link>
              </div>
              <p className="mt-3 hidden font-mono text-[0.65rem] text-bone-faint sm:block">Enter, space or Ⓐ on a controller to run again.</p>
            </div>
            <Leaderboard highlight={posted?.name} />
          </div>
        </Overlay>
      )}
    </div>
  );
}

function Overlay({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 overflow-y-auto bg-gradient-to-b from-ash-950/85 via-ash-950/70 to-ash-950/95 sm:from-ash-950/70 sm:via-ash-950/55 sm:to-ash-950/90 [touch-action:pan-y]">
      <div className={`mx-auto flex min-h-full flex-col justify-center px-4 py-8 ${wide ? "max-w-5xl" : "max-w-md text-center"}`}>{children}</div>
    </motion.div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: string }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="grid h-10 w-10 place-items-center rounded-[3px] border border-ash-600 bg-ash-950/70 text-bone hover:border-hazard">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={children} /></svg>
    </button>
  );
}

function Bolt() {
  return <svg viewBox="0 0 24 24" className="inline h-3.5 w-3.5" aria-hidden><path d="M12 2l8.7 5v10L12 22l-8.7-5V7z" fill="currentColor" /><circle cx="12" cy="12" r="3.2" fill="#0a0c0b" /></svg>;
}

function SquadPick({ active, onClick, label, children }: { active: boolean; onClick: () => void; label?: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`w-16 shrink-0 rounded-[3px] border p-1 text-left ${active ? "border-hazard ring-1 ring-hazard" : "border-ash-600 hover:border-ash-500"}`}>
      <div className="overflow-hidden rounded-[2px]">{children}</div>
      {label && <span className="mt-0.5 block truncate font-mono text-[0.55rem] text-bone-mute">{label}</span>}
    </button>
  );
}

function Controls() {
  const rows: [string, string, string][] = [
    ["← →", "swipe ← →", "Change lanes. Clip a wreck from the side and you stumble."],
    ["↑ / space", "swipe ↑ / tap", "Jump barricades and drones."],
    ["↓", "swipe ↓", "Slide under girders. In the air, slams you down."],
  ];
  return (
    <div className="mt-5 grid gap-1.5">
      {rows.map(([key, touch, what]) => (
        <p key={key} className="flex items-baseline gap-3 text-sm text-bone-dim">
          <span className="w-24 shrink-0 font-mono text-xs text-hazard"><span className="hidden sm:inline">{key}</span><span className="sm:hidden">{touch}</span></span>
          {what}
        </p>
      ))}
      <p className="hidden items-baseline gap-3 text-sm text-bone-dim sm:flex">
        <span className="w-24 shrink-0 font-mono text-xs text-hazard">Controller</span>
        D-pad or stick to steer and jump/slide, Ⓐ jump, Ⓑ slide, Start pauses.
      </p>
      <p className="mt-1 text-sm text-bone-dim"><span className="mr-2 font-mono text-xs text-hazard">Pick-ups</span>Magnet, Shield, Adrenaline (smash through anything), 2× scrap.</p>
    </div>
  );
}

function Leaderboard({ highlight }: { highlight?: string }) {
  const [board, setBoard] = useState<"today" | "all">("all");
  const { data, isLoading, error } = useApi<Board>(`/api/run/leaderboard?board=${board}`, { refetchInterval: 30_000 });
  return (
    <div className="plate h-fit p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="stencil text-2xl">Fastest runners</h3>
        <div className="flex gap-1">
          {(["all", "today"] as const).map((b) => (
            <button key={b} onClick={() => setBoard(b)} className={`chip h-7 px-2 ${board === b ? "border-hazard text-hazard" : ""}`}>{b === "all" ? "All time" : "Today"}</button>
          ))}
        </div>
      </div>
      {isLoading ? <p className="py-6 text-center font-mono text-xs text-bone-mute">Loading…</p> : error ? <p className="py-6 text-center font-mono text-xs text-rust">Board unavailable.</p> : !data?.rows.length ? (
        <p className="py-6 text-center font-mono text-xs text-bone-mute">No runs yet{board === "today" ? " today" : ""}. Be the first.</p>
      ) : (
        <ol className="space-y-1">
          {data.rows.slice(0, 10).map((r) => (
            <li key={r.rank} className={`flex items-center gap-2 rounded-[2px] px-2 py-1.5 ${highlight && r.name === highlight ? "bg-hazard/15 ring-1 ring-hazard/50" : r.rank <= 3 ? "bg-ash-800/70" : ""}`}>
              <span className={`w-6 font-mono text-xs ${r.rank === 1 ? "text-hazard" : "text-bone-mute"}`}>{r.rank}</span>
              {r.tokenId ? <SurvivorArt tokenId={r.tokenId} className="h-6 w-6 rounded-[2px]" /> : <span className="h-6 w-6 rounded-[2px] bg-ash-700" />}
              <span className="min-w-0 flex-1 truncate text-sm">{r.name}</span>
              <span className="font-mono text-xs text-bone-mute">{r.distance.toLocaleString()} m</span>
              <span className="w-16 text-right font-mono text-sm text-bone">{r.score.toLocaleString()}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-3 font-mono text-[0.58rem] leading-relaxed text-bone-faint">
        {data ? `${data.runs.toLocaleString()} run${data.runs === 1 ? "" : "s"} posted. ` : ""}Score = metres + 5 per scrap. The server recomputes it and checks each run against the time since it started; runs aren&apos;t replayed.
      </p>
    </div>
  );
}
