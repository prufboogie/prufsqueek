"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { useMemo, useState } from "react";
import { shortAddress } from "@/client/format";
import { useApi, useMe } from "@/client/hooks";
import type { MySurvivors, SurvivorItem } from "@/client/types";
import { LevelPip, SurvivorArt } from "@/components/game";
import { Gate } from "@/components/Shell";
import { Empty, ErrorBox, Heading, Loading, Notice } from "@/components/ui";

const FILTERS = ["all", "unassigned", "sheltered", "primaries"] as const;

export default function SurvivorsPage() {
  return (
    <Gate>
      <Roster />
    </Gate>
  );
}

function Roster() {
  const { data: me } = useMe();
  const { data, error, isLoading, refetch } = useApi<MySurvivors>("/api/survivors");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const list = useMemo(() => {
    const all = data?.survivors ?? [];
    if (filter === "unassigned") return all.filter((s) => !s.shelter);
    if (filter === "sheltered") return all.filter((s) => s.shelter);
    if (filter === "primaries") return all.filter((s) => s.shelter?.role === "PRIMARY");
    return all;
  }, [data, filter]);

  return (
    <div>
      <Heading eyebrow="Roster" title="My Survivors">
        Every Squeek your wallet holds, in the wallet or deposited in SqueekStaking, read from Sepolia. Art, traits and levels are the official on-chain data.
      </Heading>
      {me?.signedIn && me.readsAs && (
        <div className="mb-4"><Notice tone="hazard"><b className="text-hazard">Development alias.</b> This wallet reads the Squeeks held by {shortAddress(me.readsAs)} (DEV_NFT_ALIAS). Production ignores this.</Notice></div>
      )}
      {data?.source === "chain" && <div className="mb-4"><Notice tone="hazard">The Squeek API isn&apos;t answering, so this list comes from Survivors already known to the game, re-checked on-chain. New arrivals show once the API is back.</Notice></div>}
      {data && data.removed > 0 && <div className="mb-4"><Notice tone="rust">{data.removed} sheltered Survivor{data.removed === 1 ? " is" : "s are"} no longer in your wallet and left {data.removed === 1 ? "its shelter" : "their shelters"}.</Notice></div>}
      {error && <ErrorBox error={error} retry={() => refetch()} />}
      {isLoading && <Loading label="Reading your Squeeks from Sepolia…" />}

      {data && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`chip h-8 px-3 ${filter === f ? "border-hazard text-hazard" : "hover:text-bone"}`}>
                {f} <span className="text-bone-faint">{f === "all" ? data.survivors.length : f === "unassigned" ? data.survivors.filter((s) => !s.shelter).length : f === "sheltered" ? data.survivors.filter((s) => s.shelter).length : data.survivors.filter((s) => s.shelter?.role === "PRIMARY").length}</span>
              </button>
            ))}
          </div>
          {data.survivors.length === 0 ? (
            <Empty title="No Survivors found">
              This wallet doesn&apos;t hold any Squeeks on Sepolia. Squeeks held in another wallet won&apos;t show here; connect that wallet instead.
            </Empty>
          ) : list.length === 0 ? (
            <Empty title="Nobody here" />
          ) : (
            <motion.ul layout className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {list.map((s, i) => <Card key={s.tokenId} s={s} i={i} />)}
            </motion.ul>
          )}
        </>
      )}
    </div>
  );
}

function Card({ s, i }: { s: SurvivorItem; i: number }) {
  return (
    <motion.li layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.4) }}>
      <Link href={`/survivors/${s.tokenId}`} className="group block rounded-[4px] border border-ash-600 bg-ash-900/70 p-2 transition hover:-translate-y-0.5 hover:border-hazard/60">
        <div className="relative overflow-hidden rounded-[2px]">
          <SurvivorArt tokenId={s.tokenId} hasArt={Boolean(s.imageUrl)} className="aspect-square w-full transition group-hover:scale-[1.03]" alt={s.name} />
          <div className="absolute left-1.5 top-1.5"><LevelPip level={s.level} /></div>
          {s.custody === "staking" && <span className="absolute right-1.5 top-1.5 chip chip-steel bg-ash-950/80 text-[0.6rem]" title="Deposited in SqueekStaking. Still yours to play with.">Staked</span>}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="stencil truncate text-lg">{s.name}</span>
        </div>
        <p className="mt-0.5 truncate font-mono text-[0.66rem] text-bone-mute">
          {s.shelter ? (
            <span className={s.shelter.role === "PRIMARY" ? "text-hazard" : "text-signal"}>{s.shelter.role === "PRIMARY" ? "Leads" : "In"} {s.shelter.name}</span>
          ) : (
            <span>Unassigned · could lead {s.capacityAsPrimary} beds</span>
          )}
        </p>
      </Link>
    </motion.li>
  );
}
