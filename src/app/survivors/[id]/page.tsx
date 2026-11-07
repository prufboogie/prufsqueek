"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/client/api";
import { ago, shortAddress, when } from "@/client/format";
import { useAction, useApi, useMe } from "@/client/hooks";
import type { ShelterView, SurvivorDetail } from "@/client/types";
import { ActivityFeed, LevelPip, SurvivorArt } from "@/components/game";
import { ErrorBox, Loading, Panel, Stat, SubHeading } from "@/components/ui";

export default function SurvivorPage() {
  const { id } = useParams<{ id: string }>();
  const { data: s, error, isLoading, refetch } = useApi<SurvivorDetail>(`/api/survivors/${id}`);
  const { data: me } = useMe();
  const wallet = me?.signedIn ? (me.readsAs ?? me.wallet) : null;
  const mine = Boolean(wallet && s?.holder && wallet.toLowerCase() === s.holder.toLowerCase());

  if (isLoading) return <Loading label="Reading this Squeek from Sepolia…" />;
  if (error || !s) return <ErrorBox error={error} retry={() => refetch()} />;

  return (
    <div className="space-y-6">
      <Link href="/survivors" className="font-mono text-xs text-bone-mute hover:text-hazard">← Roster</Link>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <Panel className="p-3">
          <div className="relative overflow-hidden rounded-[3px]">
            <SurvivorArt tokenId={s.tokenId} hasArt={Boolean(s.imageUrl)} className="aspect-square w-full" alt={s.name} />
            <div className="absolute left-2 top-2"><LevelPip level={s.level} /></div>
          </div>
          <div className="mt-3 flex items-center justify-between px-1">
            <h1 className="stencil text-4xl">{s.name}</h1>
            <span className="font-mono text-sm text-bone-mute">Token #{s.tokenId}</span>
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Status</p>
                <p className={`stencil mt-1 text-2xl ${s.shelter?.role === "PRIMARY" ? "text-hazard" : s.shelter ? "text-signal" : "text-bone"}`}>{s.status}</p>
                {s.shelter && <p className="mt-1 text-sm text-bone-dim">{s.shelter.role === "PRIMARY" ? "Leads" : "Lives in"} <Link className="link" href={`/shelters/${s.shelter.id}`}>{s.shelter.name}</Link> since {when(s.shelter.joinedAt)}</p>}
              </div>
              {mine && <Actions s={s} />}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Level (on-chain)" value={s.level} tone="hazard" />
              <Stat label="Beds as primary" value={s.capacityAsPrimary} />
              <Stat label="Custody" value={s.custody === "staking" ? "Staked" : s.custody === "wallet" ? "Wallet" : "—"} sub={s.checkedAt ? `checked ${ago(s.checkedAt)}` : undefined} />
              <Stat label="Holder" value={<span className="font-mono text-base">{s.holder ? shortAddress(s.holder) : "—"}</span>} sub={s.holderPlayer ? <Link className="hover:text-hazard" href={`/players/${s.holderPlayer}`}>player profile →</Link> : "not signed in here"} />
            </div>
          </Panel>

          <div className="grid gap-6 md:grid-cols-2">
            <Panel className="p-5">
              <SubHeading note="from tokenURI">On-chain traits</SubHeading>
              {s.attributes.length ? (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                  {s.attributes.map((a) => (
                    <div key={a.traitType} className="rounded-[2px] border border-ash-700 bg-ash-900/60 px-2.5 py-1.5">
                      <dt className="eyebrow text-[0.6rem]">{a.traitType}</dt>
                      <dd className="truncate text-sm text-bone">{String(a.value)}</dd>
                    </div>
                  ))}
                </dl>
              ) : <p className="text-sm text-bone-mute">Traits can&apos;t be read right now.</p>}
            </Panel>
            <Panel className="p-5">
              <SubHeading note="The Last District only">Game stats</SubHeading>
              <p className="mb-4 text-xs text-bone-mute">Recorded by this game, not properties of the NFT.</p>
              <div className="grid grid-cols-3 gap-4">
                <Stat label="Drops counted" value={s.gameStats.dropsCounted} tone="signal" />
                <Stat label="Days sheltered" value={s.gameStats.daysSheltered} />
                <Stat label="Shelters lived" value={s.gameStats.sheltersLived} />
              </div>
              {s.drops.length > 0 && (
                <ul className="mt-4 space-y-1 text-sm">
                  {s.drops.slice(0, 5).map((d) => <li key={d.dropId}><Link className="hover:text-hazard" href={`/drops/${d.dropId}`}>#{d.number} {d.name}</Link> <span className="text-bone-mute">with {d.shelterName}</span></li>)}
                </ul>
              )}
            </Panel>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Panel className="p-5">
              <SubHeading>Shelter history</SubHeading>
              {s.history.length === 0 && !s.shelter ? <p className="text-sm text-bone-mute">Never sheltered yet.</p> : (
                <ol className="space-y-2 text-sm">
                  {s.shelter && <li className="text-signal">Now: {s.shelter.name} <span className="text-bone-mute">since {when(s.shelter.joinedAt)}</span></li>}
                  {s.history.map((h, i) => (
                    <li key={i} className="text-bone-dim"><Link className="text-bone hover:text-hazard" href={`/shelters/${h.shelterId}`}>{h.shelterName}</Link> · {when(h.joinedAt)} → {when(h.leftAt)} <span className="text-bone-faint">({h.reason})</span></li>
                  ))}
                </ol>
              )}
            </Panel>
            <Panel className="p-5">
              <SubHeading>Activity</SubHeading>
              <ActivityFeed items={s.activity} empty="No recorded activity." />
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}

function Actions({ s }: { s: SurvivorDetail }) {
  const router = useRouter();
  const { data } = useApi<{ shelters: ShelterView[] }>("/api/shelters");
  const [target, setTarget] = useState("");
  const stack = useAction((shelterId: string) => api(`/api/shelters/${shelterId}`, { body: { action: "stack", tokenId: s.tokenId, move: Boolean(s.shelter) } }), { success: () => `Survivor #${s.tokenId} is in.` });
  const leave = useAction(() => api(`/api/shelters/${s.shelter!.id}`, { body: { action: "unstack", tokenId: s.tokenId } }), { success: () => `Survivor #${s.tokenId} left ${s.shelter?.name}.` });
  const options = (data?.shelters ?? []).filter((x) => x.id !== s.shelter?.id && x.population < x.capacity);

  if (s.shelter?.role === "PRIMARY") return <Link href={`/shelters/${s.shelter.id}`} className="btn btn-steel">Manage shelter</Link>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!s.shelter && <button className="btn btn-hazard" onClick={() => router.push(`/shelters?primary=${s.tokenId}`)}>Lead a new shelter</button>}
      {options.length > 0 && (
        <div className="flex items-center gap-2">
          <select className="field h-10 w-44 py-0" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Shelter">
            <option value="">{s.shelter ? "Move to…" : "Assign to…"}</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.population}/{o.capacity})</option>)}
          </select>
          <button className="btn btn-steel" disabled={!target || stack.isPending} onClick={() => stack.mutate(target)}>{s.shelter ? "Move" : "Assign"}</button>
        </div>
      )}
      {s.shelter && <button className="btn btn-ghost" disabled={leave.isPending} onClick={() => leave.mutate(undefined)}>Remove from shelter</button>}
    </div>
  );
}
