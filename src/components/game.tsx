"use client";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ago } from "@/client/format";
import type { Activity } from "@/client/types";

// ── Survivor art ────────────────────────────────────────────────────────────
/** The Squeek's own on-chain art, served as an image. A plain silhouette while it can't be read. */
export function SurvivorArt({ tokenId, hasArt = true, className = "", alt }: { tokenId: number; hasArt?: boolean; className?: string; alt?: string }) {
  const [failed, setFailed] = useState(false);
  if (!hasArt || failed) {
    return (
      <div className={`grid place-items-center bg-ash-800 ${className}`} aria-label={alt ?? `Survivor #${tokenId}, art unavailable`}>
        <svg viewBox="0 0 64 64" className="h-1/2 w-1/2 text-ash-500" aria-hidden>
          <circle cx="20" cy="18" r="7" fill="currentColor" /><circle cx="44" cy="18" r="7" fill="currentColor" />
          <ellipse cx="32" cy="38" rx="20" ry="18" fill="currentColor" />
        </svg>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/api/survivors/${tokenId}/image`} alt={alt ?? `Survivor #${tokenId}`} className={`bg-ash-800 object-cover [image-rendering:pixelated] ${className}`} loading="lazy" draggable={false} onError={() => setFailed(true)} />;
}

export function LevelPip({ level }: { level: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-[2px] bg-ash-950/85 px-1.5 py-0.5 font-mono text-[0.65rem] text-hazard ring-1 ring-hazard/40" title="On-chain level from SqueekNFT.level()">
      LV {level}
    </span>
  );
}

// ── Shelter cutaway ─────────────────────────────────────────────────────────
const THEME_LIGHT: Record<string, { lamp: string; wall: string; glow: string }> = {
  bunker: { lamp: "#ffcf7a", wall: "#262b27", glow: "rgba(255,207,122,.22)" },
  greenhouse: { lamp: "#b8ff9e", wall: "#1f2a22", glow: "rgba(155,226,159,.22)" },
  radio: { lamp: "#8fd3ff", wall: "#1f262b", glow: "rgba(127,161,184,.25)" },
  foundry: { lamp: "#ff9a4d", wall: "#2b2320", glow: "rgba(208,96,58,.26)" },
  beacon: { lamp: "#ffffff", wall: "#272a2c", glow: "rgba(233,228,214,.2)" },
};

type Bunkmate = { tokenId: number; name: string; level: number; role: string; imageUrl: string | null };

/**
 * A cutaway of the shelter below the street: the primary at the command post, residents in bunks,
 * empty bunks for the free beds. Residents slide in and out when they join or leave.
 */
export function ShelterScene({ members, capacity, theme = "bunker", name, onBunkClick, highlight, compact }: {
  members: Bunkmate[]; capacity: number; theme?: string; name?: string; onBunkClick?: (tokenId: number) => void; highlight?: boolean; compact?: boolean;
}) {
  const t = THEME_LIGHT[theme] ?? THEME_LIGHT.bunker;
  const residents = members.filter((m) => m.role !== "PRIMARY");
  const primary = members.find((m) => m.role === "PRIMARY");
  const free = Math.max(0, capacity - members.length);
  return (
    <div className={`relative overflow-hidden rounded-[4px] border ${highlight ? "border-hazard" : "border-ash-600"} transition-colors`}>
      {/* Street level */}
      <div className="relative h-8 bg-gradient-to-b from-[#1b1f1d] to-[#2a2420]">
        <svg viewBox="0 0 400 32" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
          <path d="M0 22 L30 18 L44 22 L70 14 L92 20 L130 16 L160 22 L190 12 L214 20 L250 17 L290 22 L320 15 L350 21 L400 18 L400 32 L0 32Z" fill="#3a302a" />
          <rect x="182" y="8" width="36" height="8" rx="1" fill="#4a4f4b" stroke="#6b726d" />
          <path d="M186 12 h28" stroke="#f2a93b" strokeWidth="1.5" strokeDasharray="4 3" />
        </svg>
        {name && <span className="absolute left-2 top-1 font-mono text-[0.6rem] uppercase tracking-widest text-bone-faint">{name}</span>}
      </div>
      {/* Interior */}
      <div className="scanlines relative px-3 pb-3 pt-4" style={{ background: `radial-gradient(120% 90% at 50% 0%, ${t.glow}, transparent 60%), linear-gradient(180deg, ${t.wall}, #121513)` }}>
        <div className="pointer-events-none absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 animate-flicker rounded-full" style={{ background: t.lamp, boxShadow: `0 0 18px 6px ${t.glow}` }} />
        <div className={`grid gap-2 ${compact ? "grid-cols-4 sm:grid-cols-6" : "grid-cols-3 sm:grid-cols-4 md:grid-cols-5"}`}>
          {primary && (
            <Bunk key={primary.tokenId} m={primary} primary onClick={onBunkClick} />
          )}
          <AnimatePresence initial={false}>
            {residents.map((m) => <Bunk key={m.tokenId} m={m} onClick={onBunkClick} />)}
          </AnimatePresence>
          {Array.from({ length: free }, (_, i) => (
            <div key={`free-${i}`} className="relative aspect-[4/5] rounded-[3px] border border-dashed border-ash-600/80 bg-black/20">
              <svg viewBox="0 0 40 50" className="absolute inset-x-2 bottom-2 opacity-40" aria-hidden><rect x="2" y="34" width="36" height="6" rx="1" fill="#454e48" /><rect x="4" y="40" width="3" height="8" fill="#454e48" /><rect x="33" y="40" width="3" height="8" fill="#454e48" /></svg>
              <span className="absolute inset-x-0 top-2 text-center font-mono text-[0.55rem] uppercase tracking-widest text-bone-faint">Free bed</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Bunk({ m, primary, onClick }: { m: Bunkmate; primary?: boolean; onClick?: (id: number) => void }) {
  const body = (
    <>
      <SurvivorArt tokenId={m.tokenId} hasArt={Boolean(m.imageUrl)} className="aspect-square w-full rounded-[2px]" alt={m.name} />
      <div className="mt-1 flex items-center justify-between gap-1">
        <span className="truncate font-mono text-[0.62rem] text-bone-dim">#{m.tokenId}</span>
        <LevelPip level={m.level} />
      </div>
      {primary && <span className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[2px] bg-hazard px-1.5 font-stencil text-[0.7rem] uppercase text-ash-950">Primary</span>}
    </>
  );
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -24, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 18, scale: 0.8 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
      className={`relative rounded-[3px] border p-1.5 ${primary ? "border-hazard/70 bg-hazard/10" : "border-ash-600 bg-ash-900/70"}`}
    >
      {onClick ? <button className="block w-full text-left" onClick={() => onClick(m.tokenId)} aria-label={`Survivor #${m.tokenId}`}>{body}</button> : body}
    </motion.div>
  );
}

// ── The district map ────────────────────────────────────────────────────────
type MapShelter = { id: string; name: string; population: number; capacity: number };

/** The settlement at night: ruins on the skyline, searchlights, your shelters lit below the street, and the supply plane when a drop is open. */
export function DistrictMap({ shelters = [], dropOpen, height = 300, children }: { shelters?: MapShelter[]; dropOpen?: boolean; height?: number; children?: ReactNode }) {
  const spots = [130, 300, 470, 640, 810];
  return (
    <div className="relative flex flex-col overflow-hidden rounded-[4px] border border-ash-600" style={{ minHeight: height }}>
      <svg viewBox="0 0 960 300" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full" role="img" aria-label="Map of the district">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0b0e10" /><stop offset=".6" stopColor="#1a1b19" /><stop offset="1" stopColor="#2b2219" /></linearGradient>
          <linearGradient id="beam" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="rgba(255,226,170,.28)" /><stop offset="1" stopColor="rgba(255,226,170,0)" /></linearGradient>
          <linearGradient id="earth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2a241f" /><stop offset="1" stopColor="#121412" /></linearGradient>
          <radialGradient id="hatch"><stop offset="0" stopColor="#ffd28a" /><stop offset="1" stopColor="rgba(242,169,59,0)" /></radialGradient>
        </defs>
        <rect width="960" height="300" fill="url(#sky)" />
        <circle cx="820" cy="54" r="22" fill="#d9d2bf" opacity=".85" />
        <circle cx="812" cy="48" r="22" fill="#1a1b19" opacity=".25" />
        {/* searchlights */}
        <g style={{ transformOrigin: "260px 190px" }} className="animate-sweep"><path d="M256 190 L190 0 L250 0 Z" fill="url(#beam)" /></g>
        <g style={{ transformOrigin: "700px 185px", animationDelay: "-4s" }} className="animate-sweep"><path d="M696 185 L700 0 L760 0 Z" fill="url(#beam)" /></g>
        {/* far ruins */}
        <path d="M0 200 L0 150 L40 150 L40 120 L70 120 L70 160 L110 160 L110 100 L118 92 L150 92 L150 170 L200 170 L200 130 L240 130 L240 112 L262 112 L262 160 L330 160 L330 84 L350 70 L372 84 L372 150 L420 150 L420 118 L470 118 L470 160 L520 160 L520 96 L540 96 L548 80 L572 80 L572 165 L620 165 L620 126 L660 126 L660 104 L700 104 L700 160 L760 160 L760 120 L800 120 L800 150 L860 150 L860 110 L900 110 L900 160 L960 160 L960 200 Z" fill="#161816" />
        {/* near ruins, broken windows */}
        <path d="M0 220 L0 180 L60 180 L60 158 L96 150 L96 190 L180 190 L180 140 L214 140 L224 128 L240 140 L240 196 L330 196 L330 170 L380 164 L380 200 L470 200 L470 150 L520 150 L520 196 L600 196 L600 172 L650 172 L650 140 L690 132 L690 200 L780 200 L780 160 L830 168 L830 196 L900 196 L900 176 L960 176 L960 220Z" fill="#1d1e1b" />
        {[[200, 160], [208, 172], [500, 162], [664, 150], [674, 166], [70, 168], [352, 178]].map(([x, y], i) => (
          <rect key={i} x={x} y={y} width="6" height="7" fill="#f2a93b" opacity={0.35 + (i % 3) * 0.15} className={i % 2 ? "animate-flicker" : ""} />
        ))}
        {/* ground and underground */}
        <path d="M0 214 L60 210 L140 216 L260 208 L380 214 L520 209 L640 215 L780 210 L960 214 L960 300 L0 300Z" fill="url(#earth)" />
        <path d="M0 236 H960" stroke="#3a3330" strokeDasharray="2 6" />
        {/* plane + crate when a drop is open */}
        {dropOpen && (
          <g>
            <g className="animate-drift" style={{ animationDuration: "28s" }}>
              <path d="M0 40 l26 -4 l10 -10 l6 0 l-4 12 l20 -2 l6 -6 l4 0 l-2 8 l2 8 l-4 0 l-6 -6 l-20 -2 l4 12 l-6 0 l-10 -10 Z" fill="#3a403c" transform="translate(0,10)" />
            </g>
            <motion.g initial={{ y: -40 }} animate={{ y: [0, 80, 0] }} transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}>
              <path d="M470 40 Q490 10 510 40" fill="#c9c2ad" opacity=".8" />
              <path d="M470 40 L486 62 M510 40 L494 62" stroke="#c9c2ad" strokeWidth="1" />
              <rect x="482" y="62" width="16" height="13" fill="#7a5a30" stroke="#f2a93b" strokeWidth="1" />
            </motion.g>
          </g>
        )}
      </svg>
      {/* Shelters as hatches along the street, rendered as links */}
      <div className="absolute inset-x-0 bottom-0 z-10 h-24">
        {shelters.slice(0, 5).map((s, i) => (
          <Link key={s.id} href={`/shelters/${s.id}`} className="group absolute -translate-x-1/2 text-center" style={{ left: `${(spots[i] / 960) * 100}%`, top: "28%" }}>
            <span className="mx-auto block h-3 w-10 rounded-[2px] border border-hazard/70 bg-ash-800 shadow-[0_0_24px_6px_rgba(242,169,59,.35)] transition group-hover:shadow-[0_0_30px_10px_rgba(242,169,59,.5)]" />
            <span className="mt-1.5 block max-w-[9rem] truncate rounded-[2px] bg-ash-950/80 px-1.5 py-0.5 font-mono text-[0.62rem] text-bone group-hover:text-hazard">
              {s.name} · {s.population}/{s.capacity}
            </span>
          </Link>
        ))}
      </div>
      {children && <div className="relative flex flex-1 flex-col">{children}</div>}
    </div>
  );
}

// ── Supply crate ────────────────────────────────────────────────────────────
export function SupplyCrate({ size = 120, falling = true }: { size?: number; falling?: boolean }) {
  return (
    <motion.svg
      width={size} height={size * 1.25} viewBox="0 0 100 125" aria-hidden
      animate={falling ? { y: [0, 6, 0], rotate: [-2, 2, -2] } : undefined}
      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
    >
      <path d="M10 42 Q50 -8 90 42 Q70 34 50 40 Q30 34 10 42Z" fill="#cbc4ae" />
      <path d="M10 42 Q50 -8 90 42" fill="none" stroke="#8d8f86" strokeWidth="1" />
      <path d="M30 37 Q50 6 70 37" fill="none" stroke="#a9a28e" strokeWidth="1" />
      <path d="M12 42 L38 78 M88 42 L62 78 M50 40 L50 78" stroke="#8d8f86" strokeWidth="1" />
      <rect x="28" y="76" width="44" height="40" rx="2" fill="#6e4f28" stroke="#2a1c0c" strokeWidth="2" />
      <path d="M28 88 H72 M28 104 H72" stroke="#3b2a14" strokeWidth="2" />
      <path d="M30 78 L70 114 M70 78 L30 114" stroke="#3b2a14" strokeWidth="2" opacity=".6" />
      <rect x="40" y="91" width="20" height="10" fill="#f2a93b" />
      <path d="M43 96 h14" stroke="#141816" strokeWidth="2" />
    </motion.svg>
  );
}

// ── Drop stage track ────────────────────────────────────────────────────────
const STAGES = [
  { key: "SCHEDULED", label: "Scheduled" },
  { key: "OPEN", label: "Open" },
  { key: "SNAPSHOT", label: "Snapshot" },
  { key: "DRAWN", label: "Drawn" },
];

export function StageTrack({ status }: { status: string }) {
  if (status === "CANCELLED") return <span className="chip chip-rust">Cancelled</span>;
  const at = STAGES.findIndex((s) => s.key === status);
  return (
    <ol className="flex items-center gap-1" aria-label="Drop stage">
      {STAGES.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1">
          <span className={`rounded-[2px] px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider ${i < at ? "bg-ash-700 text-bone-dim" : i === at ? "bg-hazard text-ash-950" : "bg-ash-800 text-bone-faint"}`} aria-current={i === at ? "step" : undefined}>
            {s.label}
          </span>
          {i < STAGES.length - 1 && <span className={`h-px w-3 ${i < at ? "bg-bone-mute" : "bg-ash-600"}`} />}
        </li>
      ))}
    </ol>
  );
}

// ── Activity feed ───────────────────────────────────────────────────────────
const KIND_ICON: Record<string, string> = {
  "shelter.established": "▲", "shelter.abandoned": "✕", "shelter.renamed": "✎", "shelter.theme": "◐",
  "survivor.stacked": "+", "survivor.unstacked": "−", "survivor.moved": "⇄", "survivor.left": "↗",
  "drop.scheduled": "◷", "drop.opened": "◉", "drop.snapshot": "◎", "drop.drawn": "✦", "drop.won": "★", "drop.qualified": "✓",
  "reward.claimed": "⬇", "reward.fulfilled": "✔", "badge.earned": "✪", "player.joined": "→", "admin.action": "⚙",
};

export function ActivityFeed({ items, empty = "Quiet on the radio." }: { items: Activity[]; empty?: string }) {
  if (items.length === 0) return <p className="py-4 font-mono text-sm text-bone-faint">{empty}</p>;
  return (
    <ul className="divide-y divide-ash-700/70">
      {items.map((a) => (
        <li key={a.id} className="flex gap-3 py-2.5">
          <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-[2px] text-xs ${a.kind.startsWith("drop.won") ? "bg-hazard text-ash-950" : a.actor === "system" ? "bg-steel/15 text-steel" : a.actor === "admin" ? "bg-rust/15 text-rust" : "bg-ash-700 text-bone-dim"}`} aria-hidden>
            {KIND_ICON[a.kind] ?? "•"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-snug text-bone">{a.message}</p>
            <p className="mt-0.5 font-mono text-[0.65rem] text-bone-faint" suppressHydrationWarning>
              {ago(a.at)}
              {a.shelterId && <> · <Link className="hover:text-hazard" href={`/shelters/${a.shelterId}`}>shelter</Link></>}
              {a.dropId && <> · <Link className="hover:text-hazard" href={`/drops/${a.dropId}`}>drop</Link></>}
              {a.tokenId && <> · <Link className="hover:text-hazard" href={`/survivors/${a.tokenId}`}>#{a.tokenId}</Link></>}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
