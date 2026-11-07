"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api } from "@/client/api";
import { useAction, useApi } from "@/client/hooks";
import type { MySurvivors, ShelterView } from "@/client/types";
import { LevelPip, ShelterScene, SurvivorArt } from "@/components/game";
import { Gate } from "@/components/Shell";
import { Empty, ErrorBox, Gauge, Heading, Loading, Panel, SubHeading } from "@/components/ui";
import { RESOURCE_LABELS, RULES } from "@/shared/rules";

const NAMES = ["Ironside", "The Burrow", "Lantern Hold", "Cinder Vault", "Rust Haven", "Deep Nine", "Quiet Hatch", "Ember Den", "Signal Cellar", "Last Light"];

export default function SheltersPage() {
  return (
    <Gate>
      <Suspense fallback={<Loading />}>
        <Shelters />
      </Suspense>
    </Gate>
  );
}

function Shelters() {
  const { data, error, isLoading, refetch } = useApi<{ shelters: ShelterView[] }>("/api/shelters");
  const params = useSearchParams();
  const preselect = Number(params.get("primary")) || null;
  const shelters = data?.shelters ?? [];
  return (
    <div className="space-y-6">
      <Heading eyebrow="Underground" title="My Shelters" action={shelters.length > 0 ? <Link href="/stacking" className="btn btn-steel">Open stacking bay</Link> : undefined}>
        Each shelter is led by a primary Survivor whose on-chain level sets the beds. You can run {RULES.maxShelters} at once.
      </Heading>
      {error && <ErrorBox error={error} retry={() => refetch()} />}
      {isLoading && <Loading />}
      {data && (
        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <div className="space-y-5">
            {shelters.length === 0 ? (
              <Empty title="No shelters dug yet">Pick a Survivor to lead your first shelter. Higher-level Squeeks hold more beds.</Empty>
            ) : shelters.map((s) => (
              <Panel key={s.id} className="p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/shelters/${s.id}`} className="stencil block truncate text-2xl hover:text-hazard">{s.name}</Link>
                    <p className="font-mono text-[0.7rem] text-bone-mute">Tier {s.tier.tier} · {s.tier.name} · {s.xp} dev points</p>
                  </div>
                  <div className="w-48">
                    <div className="mb-1 flex justify-between font-mono text-[0.68rem] text-bone-mute"><span>Beds</span><span>{s.population}/{s.capacity}</span></div>
                    <Gauge value={s.population} max={s.capacity} />
                  </div>
                </div>
                <ShelterScene members={s.members} capacity={s.capacity} theme={s.theme} compact />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(s.resources).map(([k, v]) => <span key={k} className="chip">{RESOURCE_LABELS[k] ?? k}: {v}</span>)}
                    {Object.keys(s.resources).length === 0 && <span className="font-mono text-[0.68rem] text-bone-faint">No supplies yet. Qualify for a drop to receive some.</span>}
                  </div>
                  <Link href={`/shelters/${s.id}`} className="btn btn-steel py-1.5 text-sm">Manage →</Link>
                </div>
              </Panel>
            ))}
          </div>
          {shelters.length < RULES.maxShelters ? <Establish preselect={preselect} /> : (
            <Panel className="h-fit p-5"><SubHeading>Shelter limit reached</SubHeading><p className="text-sm text-bone-dim">You run {RULES.maxShelters} shelters, the most allowed. Disband one to dig another.</p></Panel>
          )}
        </div>
      )}
    </div>
  );
}

function Establish({ preselect }: { preselect: number | null }) {
  const router = useRouter();
  const { data, isLoading } = useApi<MySurvivors>("/api/survivors");
  const free = (data?.survivors ?? []).filter((s) => !s.shelter);
  const [primary, setPrimary] = useState<number | null>(preselect);
  const [name, setName] = useState("");
  useEffect(() => {
    if (!name) setName(NAMES[Math.floor(Math.random() * NAMES.length)]);
  }, [name]);
  useEffect(() => {
    if (primary === null && free.length) setPrimary(free[0].tokenId);
  }, [free, primary]);
  const chosen = free.find((s) => s.tokenId === primary);
  const create = useAction((input: { primaryTokenId: number; name: string }) => api<{ id: string }>("/api/shelters", { body: input }), {
    success: (_o, i) => `${i.name} is dug. Now move people in.`,
    onDone: (o) => router.push(`/shelters/${o.id}`),
  });

  return (
    <Panel className="h-fit p-5">
      <SubHeading>Establish a shelter</SubHeading>
      {isLoading ? <Loading label="Checking your roster…" /> : free.length === 0 ? (
        <p className="text-sm text-bone-dim">Every Survivor you hold is already sheltered. Free one up, or bring another Squeek to this wallet.</p>
      ) : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (primary) create.mutate({ primaryTokenId: primary, name: name.trim() }); }}>
          <div>
            <p className="eyebrow mb-2">Primary Survivor</p>
            <div className="thin-scrollbar grid max-h-64 grid-cols-4 gap-2 overflow-y-auto pr-1">
              {free.map((s) => (
                <button type="button" key={s.tokenId} onClick={() => setPrimary(s.tokenId)} aria-pressed={primary === s.tokenId}
                  className={`relative rounded-[3px] border p-1 transition ${primary === s.tokenId ? "border-hazard bg-hazard/10" : "border-ash-600 hover:border-bone-faint"}`}>
                  <SurvivorArt tokenId={s.tokenId} hasArt={Boolean(s.imageUrl)} className="aspect-square w-full rounded-[2px]" />
                  <span className="mt-1 block font-mono text-[0.6rem] text-bone-dim">#{s.tokenId}</span>
                  <span className="absolute right-1 top-1"><LevelPip level={s.level} /></span>
                </button>
              ))}
            </div>
            {chosen && <p className="mt-2 font-mono text-xs text-bone-mute">Level {chosen.level} primary → <span className="text-hazard">{chosen.capacityAsPrimary} beds</span> (3 + level).</p>}
          </div>
          <label className="block">
            <span className="eyebrow mb-2 block">Shelter name</span>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={RULES.nameMax} minLength={RULES.nameMin} required />
          </label>
          <button className="btn btn-hazard w-full py-3 text-lg" disabled={!primary || create.isPending}>{create.isPending ? "Checking ownership on Sepolia…" : "Dig the shelter"}</button>
          <p className="text-xs leading-relaxed text-bone-mute">The game re-reads ownership on-chain before digging. Your Squeek stays in your wallet; no transaction is sent.</p>
        </form>
      )}
    </Panel>
  );
}
