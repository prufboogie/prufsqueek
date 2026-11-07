"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/client/api";
import { when } from "@/client/format";
import { useAction, useApi, useMe } from "@/client/hooks";
import { toast } from "@/client/store";
import type { DropDetail, DropsIndex, MySurvivors, ShelterDetail } from "@/client/types";
import { ActivityFeed, LevelPip, ShelterScene, SurvivorArt } from "@/components/game";
import { DemoTag, ErrorBox, Gauge, Loading, Modal, Notice, Panel, Stat, SubHeading } from "@/components/ui";
import { RESOURCE_LABELS, RULES, THEMES } from "@/shared/rules";

export default function ShelterPage() {
  const { id } = useParams<{ id: string }>();
  const { data: s, error, isLoading, refetch } = useApi<ShelterDetail>(`/api/shelters/${id}`);
  const { data: me } = useMe();
  const owner = Boolean(me?.signedIn && s && me.userId === s.ownerId && s.status === "ACTIVE");
  const [picked, setPicked] = useState<number | null>(null);

  if (isLoading) return <Loading label="Opening the hatch…" />;
  if (error || !s) return <ErrorBox error={error} retry={() => refetch()} />;
  const pickedMember = s.members.find((m) => m.tokenId === picked);

  return (
    <div className="space-y-6">
      <Link href={owner ? "/shelters" : "/leaderboards"} className="font-mono text-xs text-bone-mute hover:text-hazard">← {owner ? "My shelters" : "Back"}</Link>
      {s.status === "ABANDONED" && <Notice tone="rust"><b className="text-rust">Abandoned {s.abandonedAt ? when(s.abandonedAt) : ""}.</b> {s.abandonReason}. Its history stays on record.</Notice>}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">Shelter · Tier {s.tier.tier} {s.tier.name}</p>
          {owner ? <Rename s={s} /> : <h1 className="stencil text-5xl leading-none">{s.name}</h1>}
          <p className="mt-2 font-mono text-xs text-bone-mute">
            Run by {s.wallet ? <Link className="hover:text-hazard" href={`/players/${s.wallet}`}>{s.ownerName}</Link> : s.ownerName} · founded {when(s.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-steel" onClick={() => { void navigator.clipboard?.writeText(window.location.href); toast({ kind: "ok", title: "Shelter link copied", body: "Anyone can view it." }); }}>Share</button>
          {owner && <Link href="/stacking" className="btn btn-hazard">Stack Survivors</Link>}
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Panel className="p-3 sm:p-4">
            <ShelterScene members={s.members} capacity={s.status === "ACTIVE" ? s.capacity : s.members.length} theme={s.theme} name={`${s.name} · ${s.population}/${s.capacity}`} onBunkClick={setPicked} />
            <p className="mt-2 px-1 font-mono text-[0.65rem] text-bone-faint">Beds = 3 + the primary&apos;s on-chain level ({s.primaryLevel}). Tap a Survivor for details.</p>
          </Panel>
          {owner && <BringIn s={s} />}
          <div className="grid gap-6 md:grid-cols-2">
            <Panel className="p-5">
              <SubHeading note={`${s.drops.length} recorded`}>Supply drop record</SubHeading>
              {s.drops.length === 0 ? <p className="text-sm text-bone-mute">No snapshots yet.</p> : (
                <ul className="space-y-2 text-sm">
                  {s.drops.map((d) => (
                    <li key={d.dropId} className="flex items-start justify-between gap-3">
                      <Link className="hover:text-hazard" href={`/drops/${d.dropId}`}>#{d.number} {d.dropName}</Link>
                      <span className={`shrink-0 font-mono text-xs ${d.eligible ? "text-signal" : "text-bone-mute"}`}>{d.eligible ? `${d.tickets} tickets` : "not eligible"}</span>
                    </li>
                  ))}
                </ul>
              )}
              {s.wins.length > 0 && (
                <div className="mt-4 border-t border-ash-700 pt-3">
                  <p className="eyebrow mb-2">Rewards won</p>
                  <ul className="space-y-1 text-sm">{s.wins.map((w) => <li key={w.id} className="flex items-center gap-2"><span className="text-hazard">★</span>{w.reward}{w.isDemo && <DemoTag />}<span className="text-bone-mute">· {w.dropName}</span></li>)}</ul>
                </div>
              )}
            </Panel>
            <Panel className="p-5">
              <SubHeading>Activity</SubHeading>
              <div className="thin-scrollbar max-h-80 overflow-y-auto pr-1"><ActivityFeed items={s.activity} /></div>
            </Panel>
          </div>
          {s.pastResidents.length > 0 && (
            <Panel className="p-5">
              <SubHeading>Past residents</SubHeading>
              <ul className="grid gap-2 text-sm sm:grid-cols-2">
                {s.pastResidents.map((p, i) => (
                  <li key={i} className="text-bone-dim"><Link className="text-bone hover:text-hazard" href={`/survivors/${p.tokenId}`}>#{p.tokenId}</Link> {when(p.joinedAt)} → {when(p.leftAt)} <span className="text-bone-faint">({p.reason})</span></li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <aside className="space-y-6">
          <Panel className="p-5">
            <div className="mb-1 flex justify-between font-mono text-xs text-bone-mute"><span>Population</span><span>{s.population}/{s.capacity}</span></div>
            <Gauge value={s.population} max={s.capacity} />
            <div className="mt-5 grid grid-cols-2 gap-4">
              <Stat label="Dev points" value={s.xp} tone="hazard" sub={s.tier.next ? `${s.tier.next.minXp - s.xp} to ${s.tier.next.name}` : "top tier"} />
              <Stat label="Primary" value={`#${s.primaryTokenId}`} sub={`Level ${s.primaryLevel}`} />
            </div>
            <div className="mt-5">
              <p className="eyebrow mb-2">Supplies</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(s.resources).length ? Object.entries(s.resources).map(([k, v]) => <span key={k} className="chip">{RESOURCE_LABELS[k] ?? k}: {v}</span>) : <span className="text-xs text-bone-faint">Delivered when the shelter qualifies for a drop.</span>}
              </div>
              <p className="mt-2 text-[0.68rem] text-bone-faint">Game-only supplies. No value, no trading.</p>
            </div>
          </Panel>
          {s.status === "ACTIVE" && <DropStatus shelterId={s.id} owner={owner} />}
          {owner && <Themes s={s} />}
          <Panel className="p-5">
            <SubHeading note="ERC-6551">Shelter account</SubHeading>
            {s.account ? (
              <>
                <p className="break-all font-mono text-xs text-bone">{s.account.address}</p>
                <p className="mt-2 text-xs leading-relaxed text-bone-mute">
                  The token-bound account address of the primary, Squeek #{s.primaryTokenId}, from the canonical ERC-6551 registry on Sepolia. It is <b className="text-bone-dim">not deployed</b>: the game keeps shelter state off-chain for now, and this is where shelter assets can live later.
                </p>
                <a className="link mt-2 inline-block font-mono text-xs" href={`https://eth-sepolia.blockscout.com/address/${s.account.address}`} target="_blank" rel="noreferrer">View on Blockscout ↗</a>
              </>
            ) : <p className="text-xs text-bone-mute">Can&apos;t compute the account address while Sepolia is unreachable.</p>}
          </Panel>
          {owner && <Danger s={s} />}
        </aside>
      </div>

      <Modal open={Boolean(pickedMember)} onClose={() => setPicked(null)} title={pickedMember ? `Survivor #${pickedMember.tokenId}` : ""}>
        {pickedMember && <MemberSheet s={s} m={pickedMember} owner={owner} onClose={() => setPicked(null)} />}
      </Modal>
    </div>
  );
}

function Rename({ s }: { s: ShelterDetail }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(s.name);
  const save = useAction((n: string) => api(`/api/shelters/${s.id}`, { body: { action: "rename", name: n } }), { success: () => "Renamed.", onDone: () => setEditing(false) });
  if (!editing) return <button onClick={() => setEditing(true)} className="stencil group text-left text-5xl leading-none hover:text-hazard" title="Rename">{s.name}<span className="ml-2 align-middle font-mono text-xs text-bone-faint group-hover:text-hazard">✎</span></button>;
  return (
    <form className="mt-1 flex gap-2" onSubmit={(e) => { e.preventDefault(); save.mutate(name.trim()); }}>
      <input className="field stencil h-12 text-2xl" value={name} autoFocus maxLength={RULES.nameMax} onChange={(e) => setName(e.target.value)} aria-label="Shelter name" />
      <button className="btn btn-hazard" disabled={save.isPending}>Save</button>
      <button type="button" className="btn btn-ghost" onClick={() => { setName(s.name); setEditing(false); }}>Cancel</button>
    </form>
  );
}

function MemberSheet({ s, m, owner, onClose }: { s: ShelterDetail; m: ShelterDetail["members"][number]; owner: boolean; onClose: () => void }) {
  const remove = useAction(() => api(`/api/shelters/${s.id}`, { body: { action: "unstack", tokenId: m.tokenId } }), { success: () => `Survivor #${m.tokenId} left ${s.name}.`, onDone: onClose });
  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <SurvivorArt tokenId={m.tokenId} hasArt={Boolean(m.imageUrl)} className="h-28 w-28 rounded-[3px]" />
        <div className="space-y-1 text-sm">
          <p className="stencil text-2xl">{m.name}</p>
          <p className="text-bone-dim">{m.role === "PRIMARY" ? "Primary: holds the shelter together" : "Resident"} · Level {m.level}</p>
          <p className="font-mono text-xs text-bone-mute">Here since {when(m.joinedAt)}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={`/survivors/${m.tokenId}`} className="btn btn-steel">Survivor file</Link>
        {owner && m.role !== "PRIMARY" && <button className="btn btn-ghost" disabled={remove.isPending} onClick={() => remove.mutate(undefined)}>Remove from shelter</button>}
      </div>
    </div>
  );
}

function BringIn({ s }: { s: ShelterDetail }) {
  const { data } = useApi<MySurvivors>("/api/survivors");
  const candidates = (data?.survivors ?? []).filter((x) => x.shelter?.id !== s.id && x.shelter?.role !== "PRIMARY");
  const full = s.population >= s.capacity;
  const stack = useAction((x: { tokenId: number; move: boolean }) => api(`/api/shelters/${s.id}`, { body: { action: "stack", ...x } }), { success: (_o, x) => `Survivor #${x.tokenId} moved into ${s.name}.` });
  if (!data) return null;
  return (
    <Panel className="p-5">
      <SubHeading note={full ? "shelter full" : `${s.capacity - s.population} beds free`}>Bring Survivors in</SubHeading>
      {candidates.length === 0 ? <p className="text-sm text-bone-mute">No other Survivors available. Every one you hold is here or leading a shelter.</p> : (
        <ul className="thin-scrollbar flex gap-2 overflow-x-auto pb-2">
          {candidates.map((c) => (
            <li key={c.tokenId} className="w-28 shrink-0 rounded-[3px] border border-ash-600 bg-ash-900/60 p-1.5">
              <div className="relative"><SurvivorArt tokenId={c.tokenId} hasArt={Boolean(c.imageUrl)} className="aspect-square w-full rounded-[2px]" /><span className="absolute left-1 top-1"><LevelPip level={c.level} /></span></div>
              <p className="mt-1 truncate font-mono text-[0.62rem] text-bone-mute">#{c.tokenId} {c.shelter ? `· in ${c.shelter.name}` : "· free"}</p>
              <button className="btn btn-steel mt-1 w-full px-1 py-1 text-xs" disabled={full || stack.isPending} onClick={() => stack.mutate({ tokenId: c.tokenId, move: Boolean(c.shelter) })}>{c.shelter ? "Move here" : "Bring in"}</button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[0.7rem] text-bone-faint">A Survivor that just moved stays put for {RULES.moveCooldownMinutes} minutes. Each move is checked against Sepolia first.</p>
    </Panel>
  );
}

function DropStatus({ shelterId, owner }: { shelterId: string; owner: boolean }) {
  const { data: idx } = useApi<DropsIndex>("/api/drops");
  const cur = idx?.current;
  const { data: d } = useApi<DropDetail>(cur && owner ? `/api/drops/${cur.id}` : null);
  if (!cur) return null;
  const preview = (d?.preview as { shelterId: string; onTrack: boolean; tickets: number; note: string; settled: number }[] | null)?.find((p) => p.shelterId === shelterId);
  return (
    <Panel className="p-5">
      <SubHeading note={`#${cur.number}`}>{cur.name}</SubHeading>
      {owner && preview ? (
        <>
          <p className={`stencil text-2xl ${preview.onTrack ? "text-signal" : "text-hazard"}`}>{preview.onTrack ? `On track · ${preview.tickets} tickets` : "Not eligible yet"}</p>
          <p className="mt-1 text-sm text-bone-dim">{preview.note}</p>
        </>
      ) : <p className="text-sm text-bone-dim">Needs {cur.rules.minSurvivors} Survivors settled for {cur.rules.minResidencyHours}h by the snapshot.</p>}
      <Link href={`/drops/${cur.id}`} className="link mt-3 inline-block font-mono text-xs">drop rules →</Link>
    </Panel>
  );
}

function Themes({ s }: { s: ShelterDetail }) {
  const set = useAction((theme: string) => api(`/api/shelters/${s.id}`, { body: { action: "theme", theme } }), { success: () => "Shelter refitted." });
  return (
    <Panel className="p-5">
      <SubHeading note="cosmetic">Shelter fit-out</SubHeading>
      <ul className="space-y-2">
        {Object.entries(THEMES).map(([key, t]) => {
          const locked = s.tier.tier < t.tier;
          return (
            <li key={key}>
              <button disabled={locked || set.isPending || s.theme === key} onClick={() => set.mutate(key)}
                className={`w-full rounded-[3px] border px-3 py-2 text-left transition ${s.theme === key ? "border-hazard bg-hazard/10" : "border-ash-600 hover:border-bone-faint disabled:hover:border-ash-600"} ${locked ? "opacity-50" : ""}`}>
                <span className="flex items-center justify-between"><span className="stencil text-base">{t.name}</span><span className="font-mono text-[0.62rem] text-bone-mute">{locked ? `tier ${t.tier} 🔒` : s.theme === key ? "fitted" : "fit"}</span></span>
                <span className="block text-xs text-bone-mute">{t.blurb}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[0.68rem] text-bone-faint">Unlocked by development points from supply drops. Looks only: no effect on eligibility or odds.</p>
    </Panel>
  );
}

function Danger({ s }: { s: ShelterDetail }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const go = useAction(() => api(`/api/shelters/${s.id}`, { body: { action: "abandon", confirm: true } }), { success: () => `${s.name} disbanded.`, onDone: () => router.push("/shelters") });
  return (
    <Panel className="border-rust-deep/50 p-5">
      <SubHeading>Disband</SubHeading>
      <p className="text-sm text-bone-dim">Frees every Survivor inside. Development points stay with this shelter&apos;s record and don&apos;t carry over.</p>
      <button className="btn btn-danger mt-3" onClick={() => setOpen(true)}>Disband shelter</button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Disband ${s.name}?`}>
        <p className="text-sm text-bone-dim">{s.population} Survivors will be free to join other shelters. This can&apos;t be undone.</p>
        <div className="mt-4 flex gap-2">
          <button className="btn btn-danger" disabled={go.isPending} onClick={() => go.mutate(undefined)}>Disband</button>
          <button className="btn btn-ghost" onClick={() => setOpen(false)}>Keep it</button>
        </div>
      </Modal>
    </Panel>
  );
}
