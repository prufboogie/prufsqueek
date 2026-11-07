"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import type { Hex } from "viem";
import { shortAddress, when } from "@/client/format";
import { useApi, useMe } from "@/client/hooks";
import { toast } from "@/client/store";
import type { DropDetail } from "@/client/types";
import { ActivityFeed, StageTrack, SupplyCrate } from "@/components/game";
import { Countdown, DemoTag, ErrorBox, Loading, Notice, Panel, SubHeading } from "@/components/ui";
import { verifyDraw } from "@/shared/fairness";

type Preview = { shelterId: string; name: string; population: number; settled: number; pending: number; onTrack: boolean; tickets: number; note: string };

export default function DropPage() {
  const { id } = useParams<{ id: string }>();
  const { data: d, error, isLoading, refetch } = useApi<DropDetail>(`/api/drops/${id}`, { refetchInterval: 20_000 });
  const { data: me } = useMe();
  if (isLoading) return <Loading />;
  if (error || !d) return <ErrorBox error={error} retry={() => refetch()} />;
  const preview = d.preview as Preview[] | null;
  const myWins = d.winners.filter((w) => w.mine);

  return (
    <div className="space-y-6">
      <Link href="/drops" className="font-mono text-xs text-bone-mute hover:text-hazard">← Supply drops</Link>
      <header className="grid items-end gap-6 md:grid-cols-[1fr_auto]">
        <div>
          <div className="flex flex-wrap items-center gap-3"><p className="eyebrow">Drop #{d.number}</p><StageTrack status={d.status} /></div>
          <h1 className="stencil mt-2 text-5xl leading-none sm:text-6xl">{d.name}</h1>
          <p className="mt-2 font-mono text-xs text-bone-mute">Opens {when(d.startsAt)} · Snapshot {when(d.endsAt)}{d.drawnAt && <> · Drawn {when(d.drawnAt)}</>}</p>
          {d.cancelReason && <div className="mt-3"><Notice tone="rust">Cancelled: {d.cancelReason}</Notice></div>}
        </div>
        {(d.status === "OPEN" || d.status === "SCHEDULED") && (
          <div><p className="eyebrow mb-2">{d.status === "SCHEDULED" ? "Opens in" : "Snapshot in"}</p><Countdown to={d.status === "SCHEDULED" ? d.startsAt : d.endsAt} /></div>
        )}
      </header>

      {myWins.length > 0 && (
        <Panel className="border-hazard/70 p-5">
          <div className="flex flex-wrap items-center gap-5">
            <SupplyCrate size={80} falling={false} />
            <div className="flex-1">
              <p className="stencil text-3xl text-hazard">Your shelter made the drop</p>
              <ul className="mt-1 text-sm">{myWins.map((w) => <li key={w.id}>{w.shelterName} won <b>{w.reward}</b> {w.isDemo && <DemoTag />} with ticket #{w.ticket}</li>)}</ul>
            </div>
            <div className="flex gap-2">
              <Link href="/vault" className="btn btn-hazard">Claim in the vault</Link>
              <Link href={`/drops/${d.id}/winner/${myWins[0].id}`} className="btn btn-steel">Share card</Link>
            </div>
          </div>
        </Panel>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {me?.signedIn && preview && (
            <Panel className="p-5">
              <SubHeading note="if the snapshot were now">Your shelters</SubHeading>
              {preview.length === 0 ? <p className="text-sm text-bone-mute">You have no shelter yet. <Link href="/shelters" className="link">Dig one</Link> and stack Survivors before {when(new Date(new Date(d.endsAt).getTime() - d.rules.minResidencyHours * 3600_000).toISOString())}.</p> : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {preview.map((p) => (
                    <li key={p.shelterId} className={`rounded-[3px] border p-3 ${p.onTrack ? "border-signal-deep/70 bg-signal/5" : "border-ash-600"}`}>
                      <div className="flex items-baseline justify-between"><Link href={`/shelters/${p.shelterId}`} className="stencil text-lg hover:text-hazard">{p.name}</Link><span className={`font-mono text-xs ${p.onTrack ? "text-signal" : "text-hazard"}`}>{p.onTrack ? `${p.tickets} tickets` : "not yet"}</span></div>
                      <p className="mt-1 text-xs text-bone-dim">{p.note}</p>
                      <p className="mt-1 font-mono text-[0.65rem] text-bone-faint">{p.settled} settled · {p.pending} too recent · {p.population} total</p>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-[0.7rem] text-bone-faint">A guide. The snapshot itself re-reads every Survivor&apos;s owner on Sepolia.</p>
            </Panel>
          )}

          <Panel className="p-5">
            <SubHeading note={d.status === "DRAWN" || d.status === "SNAPSHOT" ? `${d.eligibleCount} eligible · ${d.totalTickets ?? 0} tickets` : "after the snapshot"}>Eligibility snapshot</SubHeading>
            {d.eligibility.length === 0 ? <p className="text-sm text-bone-mute">{d.status === "OPEN" || d.status === "SCHEDULED" ? "Published the moment the snapshot is taken." : "No shelters were active at the snapshot."}</p> : (
              <div className="thin-scrollbar overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="eyebrow border-b border-ash-700"><tr><th className="py-2 pr-3 font-normal">Shelter</th><th className="pr-3 font-normal">Owner</th><th className="pr-3 font-normal">Tickets</th><th className="pr-3 font-normal">Counted</th><th className="font-normal">Why</th></tr></thead>
                  <tbody>
                    {d.eligibility.map((e) => (
                      <tr key={e.shelterId} className={`border-b border-ash-800 align-top ${e.mine ? "bg-hazard/5" : ""}`}>
                        <td className="py-2 pr-3"><Link href={`/shelters/${e.shelterId}`} className={`hover:text-hazard ${e.eligible ? "text-bone" : "text-bone-mute"}`}>{e.shelterName}</Link></td>
                        <td className="pr-3 font-mono text-xs text-bone-dim">{shortAddress(e.wallet)}</td>
                        <td className={`pr-3 font-mono ${e.eligible ? "text-signal" : "text-bone-faint"}`}>{e.tickets}{e.ticketStart !== null && e.tickets > 0 && <span className="text-[0.62rem] text-bone-faint"> (#{e.ticketStart}–{e.ticketStart + e.tickets - 1})</span>}</td>
                        <td className="pr-3 font-mono text-xs text-bone-dim">{e.counted.length ? e.counted.map((t) => `#${t}`).join(" ") : "—"}</td>
                        <td className="text-xs text-bone-dim">{e.reason}{(e.excluded as { tokenId: number; reason: string }[]).map((x) => <span key={x.tokenId} className="block text-bone-faint">#{x.tokenId}: {x.reason}</span>)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel className="p-5">
            <SubHeading note={d.status === "DRAWN" ? `${d.winners.length} of ${d.rewardUnits} units` : "drawn after the snapshot"}>Distribution</SubHeading>
            {d.winners.length === 0 ? <p className="text-sm text-bone-mute">{d.status === "DRAWN" ? "No shelter qualified, so every reward went back to the vault." : "Winners appear here once the draw block is mined."}</p> : (
              <ul className="divide-y divide-ash-800">
                {d.winners.map((w) => (
                  <li key={w.id} className={`flex flex-wrap items-center justify-between gap-3 py-2.5 ${w.mine ? "text-hazard" : ""}`}>
                    <span className="flex items-center gap-3"><span className="font-mono text-xs text-bone-faint">slot {w.slot}</span><Link className="stencil text-lg hover:text-hazard" href={`/shelters/${w.shelterId}`}>{w.shelterName}</Link><span className="font-mono text-xs text-bone-mute">ticket #{w.ticket}</span></span>
                    <span className="flex items-center gap-2 text-sm">{w.reward}{w.isDemo && <DemoTag />}<span className={`chip ${w.status === "CLAIMED" || w.status === "FULFILLED" ? "chip-signal" : w.status === "ALLOCATED" ? "chip-hazard" : ""}`}>{w.status.toLowerCase()}</span><Link href={`/drops/${d.id}/winner/${w.id}`} className="font-mono text-[0.65rem] text-bone-mute hover:text-hazard">card</Link></span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <aside className="space-y-6">
          <Panel className="p-5">
            <SubHeading>Rules</SubHeading>
            <ul className="list-inside list-disc space-y-1.5 text-sm text-bone-dim marker:text-hazard">{d.rulesText.map((t) => <li key={t}>{t}</li>)}</ul>
          </Panel>
          <Panel className="p-5">
            <SubHeading>Reward pool</SubHeading>
            {d.rewards.length === 0 ? <p className="text-sm text-bone-mute">No rewards allocated.</p> : (
              <ul className="space-y-3">{d.rewards.map((r) => (
                <li key={r.id} className="text-sm">
                  <p className="flex flex-wrap items-center gap-2"><span className="text-hazard">{d.status === "DRAWN" ? `${r.won} won` : `${r.quantity}×`}</span><b>{r.title}</b>{r.isDemo && <DemoTag />}</p>
                  <p className="text-xs text-bone-mute">{r.kindLabel} · from {r.source.name}{r.source.verified ? "" : " (unverified)"}</p>
                </li>
              ))}</ul>
            )}
          </Panel>
          <Fairness d={d} />
          <Panel className="p-5">
            <SubHeading>Event log</SubHeading>
            <ActivityFeed items={d.timeline} />
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function Fairness({ d }: { d: DropDetail }) {
  const f = d.fairness;
  const [result, setResult] = useState<ReturnType<typeof verifyDraw> | null>(null);
  const run = () => {
    if (!f.seed || !f.entropyBlockHash || !f.snapshotHash || f.slots === null) return;
    const r = verifyDraw({
      dropId: d.id, seed: f.seed as Hex, seedHash: f.seedHash as Hex, blockHash: f.entropyBlockHash as Hex, snapshotHash: f.snapshotHash as Hex,
      entries: d.eligibility.filter((e) => e.eligible).map((e) => ({ shelterId: e.shelterId, wallet: e.wallet, tickets: e.tickets })),
      slots: f.slots, maxWinsPerPlayer: d.rules.maxWinsPerPlayer, winners: d.winners.map((w) => ({ slot: w.slot, shelterId: w.shelterId })),
    });
    setResult(r);
    toast({ kind: r.ok ? "ok" : "error", title: r.ok ? "Draw verified in your browser" : "Verification failed" });
  };
  const row = (label: string, value: string | number | null | undefined, href?: string) => (
    <div className="py-1.5">
      <dt className="eyebrow text-[0.6rem]">{label}</dt>
      <dd className="break-all font-mono text-[0.7rem] text-bone-dim">{value === null || value === undefined ? <span className="text-bone-faint">not yet</span> : href ? <a className="link" href={href} target="_blank" rel="noreferrer">{value}</a> : value}</dd>
    </div>
  );
  return (
    <Panel className="p-5" as="section">
      <SubHeading note="commit-reveal + block hash">Fair draw record</SubHeading>
      <dl className="divide-y divide-ash-800">
        {row("1 · Seed commitment (published at creation)", f.seedHash)}
        {row("2 · Snapshot hash", f.snapshotHash)}
        {row("Snapshot read at Sepolia block", f.snapshotBlock)}
        {row("3 · Entropy block (chosen at snapshot)", f.entropyBlock, f.entropyBlock ? `https://eth-sepolia.blockscout.com/block/${f.entropyBlock}` : undefined)}
        {row("Entropy block hash", f.entropyBlockHash)}
        {row("4 · Revealed seed", f.seed)}
        {row("Randomness = keccak(seed ‖ blockHash ‖ snapshotHash)", f.randomness)}
      </dl>
      {d.status === "DRAWN" ? (
        <>
          <button className="btn btn-hazard mt-4 w-full" onClick={run}>Verify this draw</button>
          {result && (
            <ul className="mt-3 space-y-1.5 text-xs">
              {result.checks.map((c) => <li key={c.label} className={c.ok ? "text-signal" : "text-rust"}>{c.ok ? "✓" : "✕"} {c.label}</li>)}
            </ul>
          )}
          <p className="mt-3 text-[0.68rem] leading-relaxed text-bone-faint">Runs the same draw code in your browser against the published data. Check the entropy block hash on Blockscout yourself. This is auditable, not on-chain randomness: see the field manual for its limits.</p>
        </>
      ) : <p className="mt-3 text-[0.7rem] text-bone-faint">The seed stays sealed until the draw. Its hash above can&apos;t change.</p>}
    </Panel>
  );
}
