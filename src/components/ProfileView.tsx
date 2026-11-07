"use client";
import Link from "next/link";
import { shortAddress, when } from "@/client/format";
import type { PublicProfile } from "@/client/types";
import { ActivityFeed } from "./game";
import { DemoTag, Gauge, Panel, Stat, SubHeading } from "./ui";

export function ProfileView({ p, editor }: { p: PublicProfile; editor?: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">Survivor file{p.joinedAt ? ` · arrived ${when(p.joinedAt)}` : ""}</p>
          <h1 className="stencil text-5xl leading-none">{p.name}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 font-mono text-xs text-bone-mute">
            {p.title && <span className="chip chip-hazard">{p.title}</span>}
            <a className="hover:text-hazard" href={`https://eth-sepolia.blockscout.com/address/${p.wallet}`} target="_blank" rel="noreferrer">{shortAddress(p.wallet)} ↗</a>
            <span>· {p.xp} XP</span>
          </p>
        </div>
      </header>
      <Panel className="grid grid-cols-2 gap-5 p-5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Survivors" value={p.stats.survivors} />
        <Stat label="Active shelters" value={p.stats.shelters} />
        <Stat label="Sheltered" value={p.stats.sheltered} tone="signal" />
        <Stat label="Drops entered" value={p.stats.dropsEntered} />
        <Stat label="Drops qualified" value={p.stats.dropsQualified} tone="signal" />
        <Stat label="Rewards" value={p.stats.rewards} tone="hazard" />
      </Panel>
      {editor}
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Panel className="p-5">
            <SubHeading>Shelters</SubHeading>
            {p.shelters.length === 0 ? <p className="text-sm text-bone-mute">No active shelters.</p> : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {p.shelters.map((s) => (
                  <li key={s.id}><Link href={`/shelters/${s.id}`} className="block rounded-[3px] border border-ash-600 bg-ash-900/60 p-3 hover:border-hazard/60">
                    <span className="stencil block truncate text-lg">{s.name}</span>
                    <div className="mt-2"><Gauge value={s.population} max={s.capacity} size="sm" /></div>
                    <span className="mt-1 block font-mono text-[0.66rem] text-bone-mute">{s.population}/{s.capacity} · {s.tier.name} · {s.xp} dev pts</span>
                  </Link></li>
                ))}
              </ul>
            )}
          </Panel>
          <div className="grid gap-6 md:grid-cols-2">
            <Panel className="p-5">
              <SubHeading>Drop history</SubHeading>
              {p.drops.length === 0 ? <p className="text-sm text-bone-mute">No snapshots yet.</p> : (
                <ul className="space-y-1.5 text-sm">{p.drops.map((d, i) => <li key={i} className="flex justify-between gap-2"><Link className="truncate hover:text-hazard" href={`/drops/${d.dropId}`}>#{d.number} {d.name} <span className="text-bone-mute">· {d.shelterName}</span></Link><span className={`shrink-0 font-mono text-xs ${d.eligible ? "text-signal" : "text-bone-faint"}`}>{d.eligible ? `${d.tickets} tix` : "—"}</span></li>)}</ul>
              )}
            </Panel>
            <Panel className="p-5">
              <SubHeading>Rewards received</SubHeading>
              {p.rewards.length === 0 ? <p className="text-sm text-bone-mute">None yet.</p> : (
                <ul className="space-y-1.5 text-sm">{p.rewards.map((r) => <li key={r.id} className="flex flex-wrap items-center gap-2"><span className="text-hazard">★</span>{r.reward}{r.isDemo && <DemoTag />}<span className="text-bone-mute">· {r.shelterName} · {r.dropName}</span></li>)}</ul>
              )}
            </Panel>
          </div>
        </div>
        <aside className="space-y-6">
          <Panel className="p-5">
            <SubHeading note={`${p.badges.filter((b) => b.earnedAt).length}/${p.badges.length}`}>Badges</SubHeading>
            <ul className="grid grid-cols-2 gap-2">
              {p.badges.map((b) => (
                <li key={b.key} title={b.how} className={`rounded-[3px] border p-2.5 ${b.earnedAt ? "border-hazard/60 bg-hazard/10" : "border-ash-700 opacity-50"}`}>
                  <p className="stencil text-base leading-tight">{b.name}</p>
                  <p className="text-[0.68rem] leading-snug text-bone-mute">{b.earnedAt ? `Earned ${when(b.earnedAt)}` : b.how}</p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[0.68rem] text-bone-faint">Badges and titles are cosmetic. They never change eligibility or odds.</p>
          </Panel>
          <Panel className="p-5">
            <SubHeading>Activity</SubHeading>
            <div className="thin-scrollbar max-h-96 overflow-y-auto pr-1"><ActivityFeed items={p.activity} /></div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
