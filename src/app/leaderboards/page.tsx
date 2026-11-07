"use client";
import Link from "next/link";
import { useState } from "react";
import { ago, shortAddress } from "@/client/format";
import { useApi } from "@/client/hooks";
import type { Leaderboards } from "@/client/types";
import { Empty, ErrorBox, Heading, Loading, Panel } from "@/components/ui";

export default function LeaderboardsPage() {
  const { data, error, isLoading, refetch } = useApi<Leaderboards>("/api/leaderboards");
  const [tab, setTab] = useState("developed");
  const board = data?.boards.find((b) => b.key === tab);
  return (
    <div className="space-y-6">
      <Heading eyebrow="Notice board" title="Leaderboards">
        Ranked from recorded game data only: shelters, snapshots, draws and actions. {data?.computedAt && <span className="font-mono text-xs text-bone-mute">Updated {ago(data.computedAt)}.</span>}
      </Heading>
      {error && <ErrorBox error={error} retry={() => refetch()} />}
      {isLoading && <Loading />}
      {data && (
        <>
          <div className="thin-scrollbar flex gap-2 overflow-x-auto pb-1" role="tablist">
            {data.boards.map((b) => (
              <button key={b.key} role="tab" aria-selected={tab === b.key} onClick={() => setTab(b.key)} className={`btn whitespace-nowrap py-1.5 text-sm ${tab === b.key ? "btn-hazard" : "btn-steel"}`}>{b.title}</button>
            ))}
          </div>
          {board && (
            <Panel className="p-2 sm:p-4">
              {board.rows.length === 0 ? <Empty title="No entries yet">This board fills as players build shelters and drops land.</Empty> : (
                <ol>
                  {board.rows.map((r) => (
                    <li key={r.rank} className={`flex items-center gap-4 border-b border-ash-800 px-2 py-3 last:border-0 ${r.mine ? "bg-hazard/5" : ""}`}>
                      <span className={`stencil w-10 text-center text-3xl ${r.rank === 1 ? "text-hazard" : r.rank <= 3 ? "text-bone" : "text-bone-faint"}`}>{r.rank}</span>
                      <div className="min-w-0 flex-1">
                        {r.shelterId ? <Link href={`/shelters/${r.shelterId}`} className="stencil block truncate text-xl hover:text-hazard">{r.label}</Link> : r.wallet ? <Link href={`/players/${r.wallet}`} className="stencil block truncate text-xl hover:text-hazard">{r.label}</Link> : <span className="stencil text-xl">{r.label}</span>}
                        {r.shelterId && r.wallet && <Link href={`/players/${r.wallet}`} className="font-mono text-[0.68rem] text-bone-mute hover:text-hazard">{shortAddress(r.wallet)}</Link>}
                      </div>
                      <span className="text-right"><span className="stencil text-2xl text-bone">{r.value}</span><span className="block font-mono text-[0.62rem] text-bone-mute">{board.unit}</span></span>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
