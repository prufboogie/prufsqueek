"use client";
import Link from "next/link";
import { api } from "@/client/api";
import { shortAddress, when } from "@/client/format";
import { useAction, useApi, useMe } from "@/client/hooks";
import type { MyReward, Vault } from "@/client/types";
import { DemoTag, Empty, ErrorBox, Heading, Loading, Notice, Panel, SubHeading } from "@/components/ui";

const STATUS_CHIP: Record<string, string> = { ALLOCATED: "chip-hazard", CLAIMED: "chip-signal", FULFILLED: "chip-signal", VOID: "chip-rust", EXPIRED: "" };

export default function VaultPage() {
  const { data: me } = useMe();
  const { data, error, isLoading, refetch } = useApi<Vault>("/api/vault");
  return (
    <div className="space-y-6">
      <Heading eyebrow="Stores" title="Reward Vault">
        What the supply drops can deliver. Every reward shows where it comes from. Test rewards are marked <DemoTag className="mx-1" /> and have no value; no partner rewards are listed until a partnership is confirmed.
      </Heading>
      {error && <ErrorBox error={error} retry={() => refetch()} />}
      {isLoading && <Loading label="Taking inventory…" />}
      {me?.signedIn && <MyRewards />}
      {data && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel className="p-5">
            <SubHeading note="loaded into a drop">Upcoming</SubHeading>
            {data.upcoming.length === 0 ? <p className="text-sm text-bone-mute">Nothing allocated to an upcoming drop yet.</p> : (
              <ul className="space-y-3">{data.upcoming.map((r) => <RewardRow key={r.id} r={r} extra={r.drop && <Link className="link font-mono text-xs" href={`/drops/${r.drop.id}`}>#{r.drop.number} {r.drop.name} · {when(r.drop.endsAt)}</Link>} />)}</ul>
            )}
          </Panel>
          <Panel className="p-5">
            <SubHeading note="not yet allocated">In the vault</SubHeading>
            {data.available.length === 0 ? <p className="text-sm text-bone-mute">Empty shelves. Admins add campaigns here.</p> : (
              <ul className="space-y-3">{data.available.map((r) => <RewardRow key={r.id} r={r} />)}</ul>
            )}
          </Panel>
          <Panel className="p-5 xl:col-span-2">
            <SubHeading note={`${data.distributions.length} shown`}>Previous distributions</SubHeading>
            {data.distributions.length === 0 ? <Empty title="Nothing handed out yet">Winners show here after each draw.</Empty> : (
              <div className="thin-scrollbar overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="eyebrow border-b border-ash-700"><tr><th className="py-2 pr-3 font-normal">Drop</th><th className="pr-3 font-normal">Reward</th><th className="pr-3 font-normal">Shelter</th><th className="pr-3 font-normal">Wallet</th><th className="font-normal">Status</th></tr></thead>
                  <tbody>
                    {data.distributions.map((d) => (
                      <tr key={d.id} className="border-b border-ash-800">
                        <td className="py-2 pr-3"><Link className="hover:text-hazard" href={`/drops/${d.dropId}`}>#{d.dropNumber} {d.dropName}</Link></td>
                        <td className="pr-3">{d.reward} {d.isDemo && <DemoTag />}</td>
                        <td className="pr-3"><Link className="hover:text-hazard" href={`/shelters/${d.shelterId}`}>{d.shelterName}</Link></td>
                        <td className="pr-3 font-mono text-xs text-bone-dim">{shortAddress(d.wallet)}</td>
                        <td><span className={`chip ${STATUS_CHIP[d.status] ?? ""}`}>{d.status.toLowerCase()}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          <Panel className="p-5 xl:col-span-2">
            <SubHeading>Reward sources</SubHeading>
            {data.campaigns.length === 0 ? <p className="text-sm text-bone-mute">No campaigns yet.</p> : (
              <ul className="grid gap-3 md:grid-cols-2">
                {data.campaigns.map((c) => (
                  <li key={c.id} className="rounded-[3px] border border-ash-600 bg-ash-900/50 p-4">
                    <p className="flex flex-wrap items-center gap-2"><span className="stencil text-lg">{c.title}</span>{c.isDemo && <DemoTag />}<span className="chip">{c.status.toLowerCase()}</span></p>
                    <p className="mt-1 text-sm text-bone-dim">{c.description}</p>
                    <p className="mt-2 font-mono text-[0.68rem] text-bone-mute">
                      Source: {c.partner ? <>{c.partner.name}{c.partner.verified ? " · verified partner" : " · unverified"}{c.partner.website && <> · <a className="link" href={c.partner.website} target="_blank" rel="noreferrer">site</a></>}</> : "The Last District"}
                    </p>
                    {c.requirements && <p className="mt-1 font-mono text-[0.68rem] text-bone-faint">Requires: {c.requirements}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}

function RewardRow({ r, extra }: { r: Vault["available"][number]; extra?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 rounded-[3px] border border-ash-700 bg-ash-900/50 p-3">
      <span className="stencil grid h-10 w-10 shrink-0 place-items-center rounded-[3px] bg-hazard/15 text-xl text-hazard">{r.quantity}</span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2"><b className="text-bone">{r.title}</b>{r.isDemo && <DemoTag />}<span className="chip">{r.kindLabel}</span></p>
        <p className="mt-0.5 text-sm text-bone-dim">{r.description}</p>
        <p className="mt-1 font-mono text-[0.65rem] text-bone-mute">from {r.source.name}{r.source.verified ? "" : " (unverified)"}</p>
        {extra && <div className="mt-1">{extra}</div>}
      </div>
    </li>
  );
}

function MyRewards() {
  const { data } = useApi<{ rewards: MyReward[] }>("/api/rewards");
  const claim = useAction((distributionId: string) => api("/api/claims", { body: { distributionId } }), { success: () => "Claimed. It's recorded against your wallet." });
  if (!data) return null;
  return (
    <Panel className="border-hazard/40 p-5">
      <SubHeading note={`${data.rewards.filter((r) => r.status === "ALLOCATED").length} to claim`}>Your rewards</SubHeading>
      {data.rewards.length === 0 ? <p className="text-sm text-bone-mute">No wins yet. Keep your shelters staffed through the snapshot to stay in every draw.</p> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {data.rewards.map((r) => (
            <li key={r.id} className="rounded-[3px] border border-ash-600 bg-ash-900/60 p-4">
              <div className="flex flex-wrap items-center gap-2"><b>{r.reward}</b>{r.isDemo && <DemoTag />}<span className={`chip ${STATUS_CHIP[r.status] ?? ""}`}>{r.status.toLowerCase()}</span></div>
              <p className="mt-1 text-xs text-bone-mute">{r.kindLabel} · {r.shelterName} · <Link className="hover:text-hazard" href={`/drops/${r.dropId}`}>#{r.dropNumber} {r.dropName}</Link> · ticket #{r.ticket}</p>
              <p className="mt-1 text-sm text-bone-dim">{r.description}</p>
              {r.status === "ALLOCATED" && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button className="btn btn-hazard" disabled={claim.isPending} onClick={() => claim.mutate(r.id)}>Claim</button>
                  <span className="font-mono text-[0.65rem] text-bone-mute">by {when(r.claimBy)}</span>
                </div>
              )}
              {r.claimedAt && <p className="mt-2 font-mono text-[0.65rem] text-signal">Claimed {when(r.claimedAt)}{r.fulfilledAt ? ` · delivered ${when(r.fulfilledAt)}` : " · awaiting delivery"}{r.note ? ` · ${r.note}` : ""}</p>}
              <Link href={`/drops/${r.dropId}/winner/${r.id}`} className="mt-2 inline-block font-mono text-[0.65rem] text-bone-mute hover:text-hazard">share card →</Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3"><Notice>Claiming records the delivery address (your connected wallet). Demo rewards aren&apos;t delivered anywhere. Real partner rewards would be delivered by the team, and marked delivered here.</Notice></div>
    </Panel>
  );
}
