"use client";
import Link from "next/link";
import { when } from "@/client/format";
import { useApi, useMe } from "@/client/hooks";
import type { DropsIndex } from "@/client/types";
import { StageTrack, SupplyCrate } from "@/components/game";
import { Countdown, DemoTag, Empty, ErrorBox, Heading, Loading, Panel, SubHeading } from "@/components/ui";

export default function DropsPage() {
  const { data: me } = useMe();
  const { data, error, isLoading, refetch } = useApi<DropsIndex>("/api/drops", { refetchInterval: 30_000 });
  const d = data?.current;
  return (
    <div className="space-y-6">
      <Heading eyebrow="Airspace" title="Supply Drops">
        Every three days a plane comes over the district. Shelters that meet the published rules at the snapshot qualify, and the rewards are drawn in a way anyone can re-check.
      </Heading>
      {error && <ErrorBox error={error} retry={() => refetch()} />}
      {isLoading && <Loading />}
      {d && (
        <Panel className="relative overflow-hidden">
          <div className="scanlines pointer-events-none absolute inset-0 opacity-60" />
          <div className="relative grid gap-6 p-6 md:grid-cols-[1fr_auto] md:p-8">
            <div>
              <div className="flex flex-wrap items-center gap-3"><p className="eyebrow">Drop #{d.number} · {d.kind}</p><StageTrack status={d.status} /></div>
              <h2 className="stencil mt-2 text-5xl">{d.name}</h2>
              <p className="mt-2 text-sm text-bone-dim">
                {d.status === "SCHEDULED" && <>Opens {when(d.startsAt)}. </>}
                Snapshot {when(d.endsAt)}.
              </p>
              {d.status !== "SNAPSHOT" ? (
                <div className="mt-4">
                  <p className="eyebrow mb-2">{d.status === "SCHEDULED" ? "Opens in" : "Snapshot in"}</p>
                  <Countdown to={d.status === "SCHEDULED" ? d.startsAt : d.endsAt} />
                </div>
              ) : <p className="stencil mt-4 text-2xl text-signal">Snapshot taken. Waiting on the draw block…</p>}
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="eyebrow mb-2">Reward pool</p>
                  {d.rewards.length === 0 ? <p className="text-sm text-bone-mute">No rewards allocated yet. Qualifying shelters still receive supplies.</p> : (
                    <ul className="space-y-1 text-sm">{d.rewards.map((r, i) => <li key={i} className="flex flex-wrap items-center gap-2"><span className="text-hazard">{r.quantity}×</span>{r.title}{r.isDemo && <DemoTag />}</li>)}</ul>
                  )}
                </div>
                <div>
                  <p className="eyebrow mb-2">To qualify</p>
                  <ul className="list-inside list-disc space-y-1 text-sm text-bone-dim marker:text-hazard">{d.rulesText.slice(0, 3).map((t) => <li key={t}>{t}</li>)}</ul>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href={`/drops/${d.id}`} className="btn btn-hazard">{me?.signedIn ? "Check my shelters" : "Full rules & eligibility"}</Link>
                <Link href="/manual#fairness" className="btn btn-steel">How the draw works</Link>
              </div>
            </div>
            <div className="hidden place-items-center md:grid"><SupplyCrate size={170} falling={d.status === "OPEN"} /></div>
          </div>
        </Panel>
      )}
      <Panel className="p-5">
        <SubHeading note={`${data?.history.length ?? 0} past`}>Previous drops</SubHeading>
        {data && data.history.length === 0 ? <Empty title="No drops have landed yet">The first one is on its way.</Empty> : (
          <div className="thin-scrollbar overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="eyebrow border-b border-ash-700"><tr><th className="py-2 pr-3 font-normal">#</th><th className="pr-3 font-normal">Drop</th><th className="pr-3 font-normal">Snapshot</th><th className="pr-3 font-normal">Eligible</th><th className="pr-3 font-normal">Winners</th>{me?.signedIn && <th className="font-normal">You</th>}</tr></thead>
              <tbody>
                {data?.history.map((h) => (
                  <tr key={h.id} className="border-b border-ash-800 hover:bg-ash-900/60">
                    <td className="py-2.5 pr-3 font-mono text-bone-mute">{h.number}</td>
                    <td className="pr-3"><Link href={`/drops/${h.id}`} className="stencil text-lg hover:text-hazard">{h.name}</Link>{h.status === "CANCELLED" && <span className="chip chip-rust ml-2">cancelled</span>}</td>
                    <td className="pr-3 font-mono text-xs text-bone-dim">{when(h.endsAt)}</td>
                    <td className="pr-3 font-mono">{h.eligibleCount}</td>
                    <td className="pr-3 font-mono">{h.winners}</td>
                    {me?.signedIn && <td className={`font-mono text-xs ${h.mine.eligible ? "text-signal" : "text-bone-faint"}`}>{h.mine.eligible ? `${h.mine.tickets} tickets` : "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
