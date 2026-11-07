"use client";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { api } from "@/client/api";
import { shortAddress } from "@/client/format";
import { useApi, useMe } from "@/client/hooks";
import type { DropsIndex } from "@/client/types";
import { Countdown, Toasts } from "./ui";
import { ConnectButton, ConnectModal } from "./wallet/ConnectModal";

const NAV = [
  { href: "/", label: "District", icon: "M3 20h18M5 20V9l4-3 4 3v11M13 20v-7h6v7M8 12h2M8 16h2" },
  { href: "/run", label: "Ash Run", icon: "M13 4a2 2 0 1 0 0-.01M9 21l3-6 3 3v4M7 12l3-4 4 1 3 3 3-1M10 8l-2 6" },
  { href: "/survivors", label: "Survivors", icon: "M8 7a3 3 0 1 0 0-.01M16 7a3 3 0 1 0 0-.01M4 20c0-4 3-7 8-7s8 3 8 7" },
  { href: "/shelters", label: "Shelters", icon: "M3 11 12 4l9 7v9H3zM9 20v-6h6v6" },
  { href: "/stacking", label: "Stacking", icon: "M4 17h16M6 13h12M8 9h8M10 5h4" },
  { href: "/drops", label: "Supply Drops", icon: "M6 9a6 6 0 0 1 12 0M6 9l5 6M18 9l-5 6M12 9v6M9 15h6v5H9z" },
  { href: "/vault", label: "Reward Vault", icon: "M4 6h16v13H4zM4 10h16M12 13v3M10 13h4" },
  { href: "/leaderboards", label: "Leaderboards", icon: "M5 20V12M12 20V5M19 20v-9M3 20h18" },
  { href: "/profile", label: "Profile", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6" },
];

function Icon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
}

export function Logo({ small }: { small?: boolean }) {
  return (
    <Link href="/" className="group flex items-center gap-2.5" aria-label="The Last District home">
      <svg viewBox="0 0 40 40" className={small ? "h-8 w-8" : "h-10 w-10"} aria-hidden>
        <rect x="1" y="1" width="38" height="38" rx="3" fill="#141816" stroke="#f2a93b" strokeWidth="1.5" />
        <path d="M7 27 L7 17 L12 17 L12 12 L16 12 L16 20 L22 20 L22 9 L26 6 L30 9 L30 18 L33 18 L33 27 Z" fill="#2f3732" />
        <rect x="6" y="29" width="28" height="5" fill="url(#lt)" />
        <defs><pattern id="lt" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="6" fill="#f2a93b" /></pattern></defs>
        <circle cx="26" cy="12" r="1.6" fill="#ffd28a" className="animate-flicker" />
      </svg>
      <span className="leading-none">
        <span className="stencil block text-[0.62rem] tracking-[0.3em] text-bone-mute">The</span>
        <span className="stencil block text-xl text-bone group-hover:text-hazard">Last District</span>
      </span>
    </Link>
  );
}

function DropTicker() {
  const { data } = useApi<DropsIndex>("/api/drops", { refetchInterval: 60_000 });
  const d = data?.current;
  if (!d) return null;
  const target = d.status === "SCHEDULED" ? d.startsAt : d.endsAt;
  return (
    <Link href={`/drops/${d.id}`} className="hidden items-center gap-2 rounded-[3px] border border-ash-600 bg-ash-900/80 px-3 py-1.5 font-mono text-xs text-bone-dim hover:border-hazard/60 md:flex">
      <span className={`h-2 w-2 rounded-full ${d.status === "OPEN" ? "animate-flicker bg-signal" : "bg-hazard"}`} />
      <span className="uppercase tracking-wider">{d.status === "SNAPSHOT" ? "Drawing" : d.status === "SCHEDULED" ? "Opens in" : "Snapshot in"}</span>
      {d.status !== "SNAPSHOT" && <span className="text-hazard"><Countdown to={target} compact /></span>}
    </Link>
  );
}

function Account() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  if (!me) return <span className="h-9 w-28 animate-pulse rounded-[3px] bg-ash-800" />;
  if (!me.signedIn) return <ConnectButton className="btn btn-hazard py-1.5 text-sm" />;
  return (
    <div className="flex items-center gap-2">
      <Link href="/profile" className="chip h-9 px-3 text-[0.72rem] normal-case text-bone hover:border-hazard/60">
        <span className="h-2 w-2 rounded-full bg-signal" />
        {me.callsign || shortAddress(me.wallet)}
      </Link>
      <button
        className="btn btn-ghost px-2 py-1.5 text-sm"
        title="Disconnect"
        onClick={async () => {
          await api("/api/auth/logout", { body: {} });
          qc.setQueryData(["me"], { signedIn: false });
          await qc.invalidateQueries();
        }}
      >
        <Icon d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" className="h-4 w-4" />
        <span className="sr-only">Disconnect</span>
      </button>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  // Ash Run takes the whole screen.
  if (path === "/run") {
    return (
      <>
        {children}
        <ConnectModal />
        <Toasts />
      </>
    );
  }
  return (
    <div className="min-h-svh">
      <div className="hazard-tape h-1.5 w-full opacity-80" />
      <header className="sticky top-0 z-40 border-b border-ash-700 bg-ash-950/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-4 px-4 lg:px-6">
          <Logo />
          <div className="flex items-center gap-3">
            <DropTicker />
            <Account />
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-[1400px] gap-6 px-4 lg:px-6">
        <nav className="sticky top-20 hidden h-[calc(100svh-6rem)] w-52 shrink-0 flex-col gap-1 pt-6 lg:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}
              className={`group flex items-center gap-3 rounded-[3px] border-l-2 px-3 py-2.5 text-sm transition ${active(n.href) ? "border-hazard bg-ash-800 text-bone" : "border-transparent text-bone-mute hover:bg-ash-900 hover:text-bone"}`}>
              <Icon d={n.icon} className={`h-5 w-5 ${active(n.href) ? "text-hazard" : ""}`} />
              <span className="stencil text-[1.02rem]">{n.label}</span>
            </Link>
          ))}
          <div className="mt-auto space-y-2 border-t border-ash-700 pb-4 pt-4">
            <Link href="/manual" className="block font-mono text-xs text-bone-mute hover:text-hazard">Field manual & rules</Link>
            <p className="font-mono text-[0.62rem] leading-relaxed text-bone-faint">Community-built. Not an official Squeekchain product. Squeeks live on Sepolia, a testnet.</p>
          </div>
        </nav>
        <main className="min-w-0 flex-1 pb-28 pt-6 lg:pb-16">{children}</main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ash-700 bg-ash-950/95 backdrop-blur lg:hidden" aria-label="Main">
        <div className="thin-scrollbar flex overflow-x-auto px-1">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}
              className={`flex min-w-[4.6rem] flex-1 flex-col items-center gap-1 px-1 py-2 ${active(n.href) ? "text-hazard" : "text-bone-mute"}`}>
              <Icon d={n.icon} />
              <span className="whitespace-nowrap font-mono text-[0.58rem] uppercase tracking-wider">{n.label.split(" ")[0]}</span>
            </Link>
          ))}
        </div>
      </nav>
      <ConnectModal />
      <Toasts />
    </div>
  );
}

/** For pages that need a signed-in player. */
export function Gate({ children, title = "Survivors only", reason = "Connect the wallet that holds your Squeeks to see this." }: { children: ReactNode; title?: string; reason?: string }) {
  const { data: me, isLoading } = useMe();
  if (isLoading || !me) return <div className="h-40 animate-pulse rounded-[4px] bg-ash-900" />;
  if (!me.signedIn) {
    return (
      <div className="plate plate-bolts mx-auto mt-10 max-w-lg p-8 text-center">
        <p className="eyebrow">Checkpoint</p>
        <h1 className="stencil mt-2 text-4xl">{title}</h1>
        <p className="mt-3 text-sm text-bone-dim">{reason}</p>
        <div className="mt-6"><ConnectButton /></div>
      </div>
    );
  }
  return <>{children}</>;
}
