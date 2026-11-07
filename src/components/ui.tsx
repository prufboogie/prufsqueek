"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, type ReactNode } from "react";
import { ApiError } from "@/client/api";
import { useNow } from "@/client/hooks";
import { pad, split } from "@/client/format";
import { useToasts } from "@/client/store";

export function Panel({ children, className = "", bolts = true, as: Tag = "section" }: { children: ReactNode; className?: string; bolts?: boolean; as?: "section" | "div" | "article" }) {
  return <Tag className={`plate ${bolts ? "plate-bolts" : ""} ${className}`}>{children}</Tag>;
}

export function Heading({ eyebrow, title, children, action }: { eyebrow?: string; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1.5 flex items-center gap-2"><span className="inline-block h-1.5 w-1.5 animate-flicker rounded-full bg-hazard" />{eyebrow}</p>}
        <h1 className="stencil text-4xl leading-none text-bone sm:text-5xl">{title}</h1>
        {children && <div className="mt-3 max-w-2xl text-[0.95rem] leading-relaxed text-bone-dim">{children}</div>}
      </div>
      {action}
    </header>
  );
}

export function SubHeading({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="stencil text-xl text-bone">{children}</h2>
      {note && <span className="eyebrow">{note}</span>}
    </div>
  );
}

export function Stat({ label, value, sub, tone = "bone" }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "bone" | "hazard" | "signal" | "rust" | "steel" }) {
  const color = { bone: "text-bone", hazard: "text-hazard", signal: "text-signal", rust: "text-rust", steel: "text-steel" }[tone];
  return (
    <div className="min-w-0">
      <p className="eyebrow truncate">{label}</p>
      <p className={`stencil mt-1 text-3xl leading-none ${color}`}>{value}</p>
      {sub && <p className="mt-1 truncate font-mono text-[0.7rem] text-bone-mute">{sub}</p>}
    </div>
  );
}

/** Segmented bed gauge: one cell per bed. */
export function Gauge({ value, max, size = "md" }: { value: number; max: number; size?: "sm" | "md" }) {
  const h = size === "sm" ? "h-2" : "h-3";
  return (
    <div className="flex gap-[3px]" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={`${value} of ${max} beds`}>
      {Array.from({ length: max }, (_, i) => (
        <motion.span
          key={i}
          className={`${h} flex-1 rounded-[1px] ${i < value ? (value >= max ? "bg-hazard" : "bg-signal") : "bg-ash-600"}`}
          initial={false}
          animate={{ opacity: i < value ? 1 : 0.6, scaleY: i < value ? 1 : 0.7 }}
          transition={{ delay: i * 0.02 }}
        />
      ))}
    </div>
  );
}

export function Countdown({ to, compact }: { to: string; compact?: boolean }) {
  const now = useNow();
  const t = split(new Date(to).getTime() - now);
  const cells: [string, number][] = [["d", t.d], ["h", t.h], ["m", t.m], ["s", t.s]];
  if (compact) return <span className="font-mono tabular-nums">{t.d > 0 ? `${t.d}d ` : ""}{pad(t.h)}:{pad(t.m)}:{pad(t.s)}</span>;
  return (
    <div className="flex gap-2" aria-label="Countdown" suppressHydrationWarning>
      {cells.map(([k, v]) => (
        <div key={k} className="relative w-[3.6rem] overflow-hidden rounded-[3px] border border-ash-600 bg-ash-950 py-2 text-center">
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-black/60" />
          <span className="stencil block text-3xl leading-none tabular-nums text-hazard">{pad(v)}</span>
          <span className="eyebrow mt-1 block text-[0.6rem]">{k}</span>
        </div>
      ))}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[4px] border border-dashed border-ash-600 px-6 py-10 text-center">
      <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden className="text-bone-faint">
        <path d="M6 30 L22 8 L38 30 Z" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M22 16 v8 M22 27 v1.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M4 36 h36" stroke="currentColor" strokeWidth="2" strokeDasharray="3 3" />
      </svg>
      <p className="stencil text-xl">{title}</p>
      {children && <div className="max-w-md text-sm text-bone-dim">{children}</div>}
      {action}
    </div>
  );
}

export function Loading({ label = "Tuning the radio…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-10 font-mono text-sm text-bone-mute" role="status">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => <motion.span key={i} className="h-3 w-1.5 bg-hazard" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }} />)}
      </span>
      {label}
    </div>
  );
}

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  const msg = error instanceof ApiError ? error.message : "Lost the signal. Try again.";
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-rust-deep bg-rust/10 px-4 py-3 text-sm text-bone">
      <span><span className="stencil mr-2 text-rust">Signal lost.</span>{msg}</span>
      {retry && <button className="btn btn-steel py-1 text-sm" onClick={retry}>Retry</button>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-[2px] sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            role="dialog" aria-modal="true" aria-label={title}
            className={`plate plate-bolts thin-scrollbar max-h-[88svh] w-full overflow-y-auto rounded-b-none p-5 sm:rounded-[4px] ${wide ? "sm:max-w-3xl" : "sm:max-w-md"}`}
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-4 pt-1">
              <h2 className="stencil text-2xl">{title}</h2>
              <button onClick={onClose} aria-label="Close" className="chip h-8 w-8 justify-center text-sm">✕</button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Toasts() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:pr-6" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.button
            key={t.id} layout onClick={() => dismiss(t.id)}
            initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 40 }}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[4px] border bg-ash-900/95 px-4 py-3 text-left shadow-2xl backdrop-blur ${t.kind === "error" ? "border-rust-deep" : t.kind === "ok" ? "border-signal-deep" : "border-ash-500"}`}
          >
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${t.kind === "error" ? "bg-rust" : t.kind === "ok" ? "bg-signal" : "bg-hazard"}`} />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-bone">{t.title}</span>
              {t.body && <span className="block text-xs text-bone-dim">{t.body}</span>}
            </span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function DemoTag({ className = "" }: { className?: string }) {
  return <span className={`chip chip-steel ${className}`} title="A test reward with no value. Not from a partner.">Demo</span>;
}

export function Notice({ children, tone = "steel" }: { children: ReactNode; tone?: "steel" | "hazard" | "rust" | "signal" }) {
  const c = { steel: "border-steel-deep/60 bg-steel/5", hazard: "border-hazard-deep/60 bg-hazard/5", rust: "border-rust-deep/70 bg-rust/10", signal: "border-signal-deep/60 bg-signal/5" }[tone];
  return <div className={`rounded-[4px] border px-4 py-3 text-sm leading-relaxed text-bone-dim ${c}`}>{children}</div>;
}
