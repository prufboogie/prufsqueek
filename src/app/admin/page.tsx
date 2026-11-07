"use client";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { api } from "@/client/api";
import { ago, shortAddress, when } from "@/client/format";
import { useAction, useApi } from "@/client/hooks";
import type { AdminData } from "@/client/types";
import { DemoTag, ErrorBox, Heading, Loading, Panel, Stat, SubHeading } from "@/components/ui";

type Data = Extract<AdminData, { admin: true }>;
const TABS = ["overview", "drops", "vault", "distributions", "players", "shelters", "activity"] as const;

export default function AdminPage() {
  const { data, error, isLoading, refetch } = useApi<AdminData>("/api/admin/data");
  const [tab, setTab] = useState<(typeof TABS)[number]>("overview");
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} retry={() => refetch()} />;
  if (!data?.admin) return <Login />;
  return (
    <div className="space-y-6">
      <Heading eyebrow="Command post" title="Admin" action={<Logout />}>Every action here is checked on the server and written to the public activity log as an admin action.</Heading>
      <div className="thin-scrollbar flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => <button key={t} onClick={() => setTab(t)} className={`btn py-1.5 text-sm ${tab === t ? "btn-hazard" : "btn-steel"}`}>{t}</button>)}
      </div>
      {tab === "overview" && <Overview d={data} />}
      {tab === "drops" && <Drops d={data} />}
      {tab === "vault" && <VaultAdmin d={data} />}
      {tab === "distributions" && <Distributions d={data} />}
      {tab === "players" && <Table head={["Wallet", "Callsign", "Shelters", "Sheltered", "XP", "Last seen"]} rows={data.users.map((u) => [u.wallet ? <Link key="w" className="font-mono text-xs hover:text-hazard" href={`/players/${u.wallet}`}>{shortAddress(u.wallet)}</Link> : "—", u.callsign ?? "—", u.shelters, u.sheltered, u.xp, ago(u.lastSeenAt)])} />}
      {tab === "shelters" && <Table head={["Shelter", "Owner", "Status", "Primary", "Pop.", "Dev", "Founded"]} rows={data.shelters.map((s) => [<Link key="s" className="hover:text-hazard" href={`/shelters/${s.id}`}>{s.name}</Link>, s.owner, s.status === "ACTIVE" ? "active" : <span key="a" title={s.abandonReason ?? ""} className="text-rust">abandoned</span>, `#${s.primaryTokenId}`, s.population, s.xp, when(s.createdAt)])} />}
      {tab === "activity" && (
        <Panel className="p-5">
          <ul className="divide-y divide-ash-800 text-sm">{data.activity.map((a) => <li key={a.id} className="flex gap-3 py-2"><span className="w-20 shrink-0 font-mono text-[0.65rem] text-bone-faint">{ago(a.at)}</span><span className={`w-16 shrink-0 font-mono text-[0.65rem] ${a.actor === "admin" ? "text-rust" : a.actor === "system" ? "text-steel" : "text-bone-mute"}`}>{a.actor}</span><span className="text-bone-dim">{a.message}</span></li>)}</ul>
        </Panel>
      )}
    </div>
  );
}

function Login() {
  const qc = useQueryClient();
  const [pw, setPw] = useState("");
  const login = useAction((password: string) => api("/api/admin/login", { body: { password } }), { success: () => "Signed in as admin.", onDone: () => void qc.invalidateQueries() });
  return (
    <Panel className="mx-auto mt-10 max-w-sm p-6">
      <h1 className="stencil text-3xl">Command post</h1>
      <p className="mt-1 text-sm text-bone-dim">Admins only. Wallets listed in ADMIN_WALLETS are let in automatically.</p>
      <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); login.mutate(pw); }}>
        <input className="field" type="password" autoComplete="current-password" placeholder="Admin password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <button className="btn btn-hazard w-full" disabled={!pw || login.isPending}>Sign in</button>
      </form>
    </Panel>
  );
}

function Logout() {
  const qc = useQueryClient();
  return <button className="btn btn-ghost" onClick={async () => { await api("/api/admin/logout", { body: {} }); await qc.invalidateQueries(); }}>Sign out</button>;
}

function useAdmin(label: string) {
  return useAction((input: Record<string, unknown>) => api<{ result: unknown }>("/api/admin/action", { body: input }), { success: (o: { result: unknown }) => {
    const log = (o.result as { log?: string[] } | null)?.log;
    return log ? `${label}: ${log.length ? log.join(", ") : "nothing due"}` : label;
  } });
}

function Overview({ d }: { d: Data }) {
  const tick = useAdmin("Scheduler ran");
  return (
    <div className="space-y-6">
      <Panel className="grid grid-cols-2 gap-5 p-5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Players" value={d.stats.players} />
        <Stat label="Active 24h" value={d.stats.active24h} />
        <Stat label="Shelters" value={d.stats.shelters} />
        <Stat label="Sheltered" value={d.stats.sheltered} tone="signal" />
        <Stat label="Stacking 24h" value={d.stats.stacking24h} />
        <Stat label="To deliver" value={d.stats.awaitingDelivery} tone={d.stats.awaitingDelivery ? "hazard" : "bone"} />
      </Panel>
      <Panel className="flex flex-wrap items-center justify-between gap-4 p-5">
        <p className="text-sm text-bone-dim">The scheduler opens, snapshots and draws drops when due. It also runs on page loads and from <span className="font-mono text-xs">/api/cron/tick</span>.</p>
        <button className="btn btn-steel" disabled={tick.isPending} onClick={() => tick.mutate({ action: "tick" })}>Run scheduler now</button>
      </Panel>
      <Panel className="p-5">
        <SubHeading note={`${d.errors.length} recent`}>Errors</SubHeading>
        {d.errors.length === 0 ? <p className="text-sm text-bone-mute">None recorded.</p> : <ul className="space-y-1 font-mono text-xs">{d.errors.map((e) => <li key={e.id}><span className="text-bone-faint">{ago(e.at)}</span> <span className="text-rust">{e.scope}</span> {e.message}</li>)}</ul>}
      </Panel>
    </div>
  );
}

const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

function Drops({ d }: { d: Data }) {
  const act = useAdmin("Done");
  const now = new Date();
  const [form, setForm] = useState({ name: "Special Delivery", startsAt: toLocalInput(now), endsAt: toLocalInput(new Date(now.getTime() + 72 * 3600_000)), minSurvivors: 3, minResidencyHours: 12, ticketRule: "PER_SURVIVOR", maxWinsPerPlayer: 1 });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    act.mutate({ action: "drop.create", ...form, startsAt: new Date(form.startsAt).toISOString(), endsAt: new Date(form.endsAt).toISOString() });
  };
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <Panel className="p-5">
        <SubHeading>Drops</SubHeading>
        <div className="thin-scrollbar overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="eyebrow border-b border-ash-700"><tr>{["#", "Name", "Status", "Window", "Rules", "Elig.", "Won", ""].map((h) => <th key={h} className="py-2 pr-3 font-normal">{h}</th>)}</tr></thead>
            <tbody>
              {d.drops.map((x) => (
                <tr key={x.id} className="border-b border-ash-800 align-top">
                  <td className="py-2 pr-3 font-mono">{x.number}</td>
                  <td className="pr-3"><Link className="hover:text-hazard" href={`/drops/${x.id}`}>{x.name}</Link><span className="block font-mono text-[0.6rem] text-bone-faint">{x.createdBy}</span></td>
                  <td className="pr-3"><span className="chip">{x.status.toLowerCase()}</span></td>
                  <td className="pr-3 font-mono text-[0.68rem] text-bone-dim">{when(x.startsAt)}<br />→ {when(x.endsAt)}</td>
                  <td className="pr-3 font-mono text-[0.68rem] text-bone-dim">min {x.minSurvivors} · {x.minResidencyHours}h · {x.ticketRule === "FLAT" ? "flat" : "per Survivor"} · {x.maxWinsPerPlayer}/player</td>
                  <td className="pr-3 font-mono">{x.eligible}</td>
                  <td className="pr-3 font-mono">{x.winners}</td>
                  <td className="space-x-1 whitespace-nowrap">
                    {(x.status === "OPEN" || x.status === "SCHEDULED") && <>
                      <button className="btn btn-steel px-2 py-0.5 text-xs" onClick={() => confirm(`Move ${x.name}'s snapshot to now?`) && act.mutate({ action: "drop.endNow", id: x.id })}>Snapshot now</button>
                      <button className="btn btn-danger px-2 py-0.5 text-xs" onClick={() => { const reason = prompt("Reason for cancelling (shown publicly)?"); if (reason) act.mutate({ action: "drop.cancel", id: x.id, reason }); }}>Cancel</button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel className="h-fit p-5">
        <SubHeading>Create a drop</SubHeading>
        <form className="space-y-3" onSubmit={submit}>
          <Field label="Name"><input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={60} /></Field>
          <Field label="Opens"><input className="field" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></Field>
          <Field label="Snapshot"><input className="field" type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Min Survivors"><input className="field" type="number" min={1} max={13} value={form.minSurvivors} onChange={(e) => setForm({ ...form, minSurvivors: Number(e.target.value) })} /></Field>
            <Field label="Residency (h)"><input className="field" type="number" min={0} max={168} value={form.minResidencyHours} onChange={(e) => setForm({ ...form, minResidencyHours: Number(e.target.value) })} /></Field>
            <Field label="Tickets"><select className="field" value={form.ticketRule} onChange={(e) => setForm({ ...form, ticketRule: e.target.value })}><option value="PER_SURVIVOR">Per Survivor</option><option value="FLAT">One per shelter</option></select></Field>
            <Field label="Wins / player"><input className="field" type="number" min={1} max={10} value={form.maxWinsPerPlayer} onChange={(e) => setForm({ ...form, maxWinsPerPlayer: Number(e.target.value) })} /></Field>
          </div>
          <button className="btn btn-hazard w-full" disabled={act.isPending}>Create drop</button>
          <p className="text-[0.68rem] text-bone-faint">Drops run one at a time; a new one can&apos;t overlap a scheduled or open drop. Its seed commitment is published immediately.</p>
        </form>
      </Panel>
    </div>
  );
}

function VaultAdmin({ d }: { d: Data }) {
  const act = useAdmin("Saved");
  const [partner, setPartner] = useState({ name: "", website: "", description: "", isDemo: true });
  const [campaign, setCampaign] = useState({ title: "", description: "", requirements: "", partnerId: "", isDemo: true, status: "ACTIVE" });
  const [reward, setReward] = useState({ campaignId: "", kind: "COLLECTIBLE", title: "", description: "", quantity: 1 });
  const openDrops = d.drops.filter((x) => x.status === "OPEN" || x.status === "SCHEDULED");
  return (
    <div className="space-y-6">
      <Panel className="p-5">
        <SubHeading>Rewards</SubHeading>
        <Table head={["Reward", "Kind", "Qty", "Campaign", "Status", "Drop", ""]} rows={d.rewards.map((r) => [
          <span key="t" className="flex items-center gap-2">{r.title}{r.isDemo && <DemoTag />}</span>, r.kind, r.quantity, r.campaign, r.status.toLowerCase(), r.drop ? r.drop.name : "—",
          <span key="a" className="flex gap-1">
            {r.status === "AVAILABLE" && openDrops.length > 0 && <select className="field h-7 w-36 py-0 text-xs" defaultValue="" onChange={(e) => e.target.value && act.mutate({ action: "reward.allocate", id: r.id, dropId: e.target.value })}><option value="">Allocate to…</option>{openDrops.map((o) => <option key={o.id} value={o.id}>#{o.number} {o.name}</option>)}</select>}
            {r.status === "ALLOCATED" && r.drop && ["OPEN", "SCHEDULED"].includes(r.drop.status) && <button className="btn btn-steel px-2 py-0.5 text-xs" onClick={() => act.mutate({ action: "reward.release", id: r.id })}>Release</button>}
            {r.status === "AVAILABLE" && <button className="btn btn-ghost px-2 py-0.5 text-xs" onClick={() => act.mutate({ action: "reward.withdraw", id: r.id })}>Withdraw</button>}
          </span>,
        ])} />
      </Panel>
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel className="p-5">
          <SubHeading>Add reward batch</SubHeading>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act.mutate({ action: "reward.create", ...reward }); }}>
            <Field label="Campaign"><select className="field" required value={reward.campaignId} onChange={(e) => setReward({ ...reward, campaignId: e.target.value })}><option value="">Choose…</option>{d.campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}{c.isDemo ? " (demo)" : ""}</option>)}</select></Field>
            <Field label="Kind"><select className="field" value={reward.kind} onChange={(e) => setReward({ ...reward, kind: e.target.value })}>{["PARTNER_NFT", "WHITELIST", "FREE_MINT", "COLLECTIBLE", "ECOSYSTEM", "OTHER"].map((k) => <option key={k}>{k}</option>)}</select></Field>
            <Field label="Title"><input className="field" required maxLength={80} value={reward.title} onChange={(e) => setReward({ ...reward, title: e.target.value })} /></Field>
            <Field label="Description"><textarea className="field" required maxLength={400} value={reward.description} onChange={(e) => setReward({ ...reward, description: e.target.value })} /></Field>
            <Field label="Quantity (winners)"><input className="field" type="number" min={1} max={500} value={reward.quantity} onChange={(e) => setReward({ ...reward, quantity: Number(e.target.value) })} /></Field>
            <button className="btn btn-hazard w-full" disabled={act.isPending}>Add to vault</button>
            <p className="text-[0.68rem] text-bone-faint">A batch inherits its campaign&apos;s demo flag.</p>
          </form>
        </Panel>
        <Panel className="p-5">
          <SubHeading>Campaigns</SubHeading>
          <ul className="mb-4 space-y-1.5 text-sm">{d.campaigns.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2"><span className="truncate">{c.title} {c.isDemo && <DemoTag />}<span className="block font-mono text-[0.62rem] text-bone-faint">{c.partner ?? "in-house"}</span></span>
              <select className="field h-7 w-24 py-0 text-xs" value={c.status} onChange={(e) => act.mutate({ action: "campaign.update", id: c.id, status: e.target.value })}>{["DRAFT", "ACTIVE", "ENDED"].map((s) => <option key={s}>{s}</option>)}</select></li>
          ))}</ul>
          <form className="space-y-3 border-t border-ash-700 pt-3" onSubmit={(e) => { e.preventDefault(); act.mutate({ action: "campaign.create", ...campaign }); }}>
            <Field label="Title"><input className="field" required maxLength={80} value={campaign.title} onChange={(e) => setCampaign({ ...campaign, title: e.target.value })} /></Field>
            <Field label="Description"><textarea className="field" required maxLength={600} value={campaign.description} onChange={(e) => setCampaign({ ...campaign, description: e.target.value })} /></Field>
            <Field label="Requirements"><input className="field" maxLength={400} value={campaign.requirements} onChange={(e) => setCampaign({ ...campaign, requirements: e.target.value })} /></Field>
            <Field label="Partner"><select className="field" value={campaign.partnerId} onChange={(e) => setCampaign({ ...campaign, partnerId: e.target.value })}><option value="">In-house</option>{d.partners.map((p) => <option key={p.id} value={p.id}>{p.name}{p.verified ? "" : " (unverified)"}</option>)}</select></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={campaign.isDemo} onChange={(e) => setCampaign({ ...campaign, isDemo: e.target.checked })} /> Demo campaign (test rewards, no value)</label>
            <button className="btn btn-hazard w-full" disabled={act.isPending}>Create campaign</button>
          </form>
        </Panel>
        <Panel className="p-5">
          <SubHeading>Partners</SubHeading>
          <ul className="mb-4 space-y-2 text-sm">{d.partners.length === 0 ? <li className="text-bone-mute">No partners. Add one only once there&apos;s an agreement.</li> : d.partners.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2">
              <span className="truncate">{p.name} {p.isDemo && <DemoTag />}<span className="block font-mono text-[0.62rem] text-bone-faint">{p.status.toLowerCase()} · {p.verified ? "verified" : "unverified"}</span></span>
              <button className="btn btn-steel px-2 py-0.5 text-xs" onClick={() => act.mutate({ action: "partner.update", id: p.id, verified: !p.verified, status: p.verified ? "INACTIVE" : "ACTIVE" })}>{p.verified ? "Unverify" : "Verify"}</button>
            </li>
          ))}</ul>
          <form className="space-y-3 border-t border-ash-700 pt-3" onSubmit={(e) => { e.preventDefault(); act.mutate({ action: "partner.create", ...partner }); }}>
            <Field label="Name"><input className="field" required maxLength={60} value={partner.name} onChange={(e) => setPartner({ ...partner, name: e.target.value })} /></Field>
            <Field label="Website"><input className="field" type="url" value={partner.website} onChange={(e) => setPartner({ ...partner, website: e.target.value })} /></Field>
            <Field label="Description"><textarea className="field" maxLength={500} value={partner.description} onChange={(e) => setPartner({ ...partner, description: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={partner.isDemo} onChange={(e) => setPartner({ ...partner, isDemo: e.target.checked })} /> Demo partner</label>
            <button className="btn btn-hazard w-full" disabled={act.isPending}>Add partner</button>
            <p className="text-[0.68rem] text-bone-faint">A real partner&apos;s campaigns can&apos;t go live until you mark it verified.</p>
          </form>
        </Panel>
      </div>
    </div>
  );
}

function Distributions({ d }: { d: Data }) {
  const act = useAdmin("Updated");
  return (
    <Panel className="p-5">
      <SubHeading note="claimed rewards need delivery">Distributions</SubHeading>
      <Table head={["Drop", "Reward", "Shelter", "Winner", "Status", "Claim", ""]} rows={d.distributions.map((x) => [
        x.drop, <span key="r">{x.reward} {x.isDemo && <DemoTag />}</span>, x.shelter, <span key="w" className="font-mono text-xs">{shortAddress(x.wallet)}</span>, x.status.toLowerCase(),
        x.claimedAt ? <span key="c" className="font-mono text-[0.65rem]">{when(x.claimedAt)} → {shortAddress(x.claimWallet)}</span> : `by ${when(x.claimBy)}`,
        <span key="a" className="flex gap-1">
          {x.status === "CLAIMED" && <button className="btn btn-hazard px-2 py-0.5 text-xs" onClick={() => { const note = prompt("Delivery note (tx hash, etc.)") ?? undefined; act.mutate({ action: "distribution.fulfil", id: x.id, note }); }}>Mark delivered</button>}
          {(x.status === "ALLOCATED" || x.status === "CLAIMED") && <button className="btn btn-danger px-2 py-0.5 text-xs" onClick={() => { const note = prompt("Reason for voiding (shown publicly)?"); if (note) act.mutate({ action: "distribution.void", id: x.id, note }); }}>Void</button>}
        </span>,
      ])} />
    </Panel>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="eyebrow mb-1 block">{label}</span>{children}</label>;
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="thin-scrollbar overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="eyebrow border-b border-ash-700"><tr>{head.map((h, i) => <th key={i} className="py-2 pr-3 font-normal">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-ash-800 align-top">{r.map((c, j) => <td key={j} className="py-2 pr-3">{c}</td>)}</tr>)}</tbody>
      </table>
      {rows.length === 0 && <p className="py-4 text-sm text-bone-mute">Nothing yet.</p>}
    </div>
  );
}
