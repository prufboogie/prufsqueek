"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { plural } from "@/client/format";
import { useApi, useMe } from "@/client/hooks";
import type { District } from "@/client/types";
import { ActivityFeed, DistrictMap, StageTrack, SupplyCrate } from "@/components/game";
import { Countdown, ErrorBox, Gauge, Panel, Stat, SubHeading } from "@/components/ui";
import { ConnectButton } from "@/components/wallet/ConnectModal";

export default function DistrictPage() {
  const { data: me } = useMe();
  const { data, error, refetch } = useApi<District>("/api/district", { refetchInterval: 30_000 });
  const signedIn = me?.signedIn;
  const next = data?.nextDrop;
  const mine = data?.mine;

  return (
    <div className="space-y-6">
      {error && <ErrorBox error={error} retry={() => refetch()} />}

      {/* Hero */}
      <DistrictMap shelters={mine?.shelterList ?? []} dropOpen={next?.status === "OPEN"} height={signedIn ? 280 : 380}>
        <div className={`flex flex-1 flex-col justify-between gap-6 bg-gradient-to-r from-ash-950/85 via-ash-950/40 to-transparent p-5 sm:p-8 ${signedIn ? "pb-28" : ""}`}>
          <div className="max-w-xl">
            <p className="eyebrow flex items-center gap-2"><span className="h-1.5 w-1.5 animate-flicker rounded-full bg-signal" />Sector 9 · Sepolia relay</p>
            <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="stencil mt-2 text-5xl leading-[0.9] md:text-6xl xl:text-7xl">
              The world fell.
              <span className="block text-hazard">Your survival begins here.</span>
            </motion.h1>
            {!signedIn && (
              <p className="mt-4 max-w-md text-[0.95rem] leading-relaxed text-bone-dim">
                The Last District is one of the few settlements still standing. Your Squeeks are its Survivors. Dig shelters, bring your people in, and be ready when the supply planes come over.
              </p>
            )}
          </div>
          {!signedIn && me && (
            <div className="flex flex-wrap items-center gap-3">
              <ConnectButton label="Enter the district" className="btn btn-hazard px-6 py-3 text-xl" />
              <Link href="/manual" className="btn btn-steel">Read the field manual</Link>
            </div>
          )}
        </div>
      </DistrictMap>

      {/* My numbers */}
      {signedIn && mine && (
        <Panel className="grid grid-cols-2 gap-5 p-5 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Survivors held" value={mine.survivors} sub={<Link href="/survivors" className="hover:text-hazard">view roster →</Link>} />
          <Stat label="Active shelters" value={mine.shelters} sub="max 5" />
          <Stat label="Sheltered" value={mine.sheltered} sub={`${Math.max(0, mine.survivors - mine.sheltered)} unassigned`} tone="signal" />
          <div className="min-w-0">
            <Stat label="Capacity" value={`${mine.sheltered}/${mine.capacity || 0}`} />
            {mine.capacity > 0 && <div className="mt-2"><Gauge value={mine.sheltered} max={mine.capacity} size="sm" /></div>}
          </div>
          <Stat label="Next drop" value={next ? <Countdown to={next.status === "SCHEDULED" ? next.startsAt : next.endsAt} compact /> : "—"} sub={next ? next.status.toLowerCase() : "none scheduled"} tone="hazard" />
          <Stat label="Rewards to claim" value={mine.unclaimed} tone={mine.unclaimed ? "hazard" : "bone"} sub={<Link href="/vault" className="hover:text-hazard">open vault →</Link>} />
        </Panel>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          {/* Next drop */}
          {next && (
            <Panel className="overflow-hidden">
              <div className="grid items-center gap-6 p-5 sm:grid-cols-[auto_1fr] sm:p-6">
                <div className="mx-auto"><SupplyCrate size={110} falling={next.status === "OPEN"} /></div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="eyebrow">Supply drop #{next.number}</p>
                    <StageTrack status={next.status} />
                  </div>
                  <h2 className="stencil mt-1 text-3xl">{next.name}</h2>
                  <p className="mt-1 text-sm text-bone-dim">
                    {next.status === "SCHEDULED" ? "Opens in" : next.status === "OPEN" ? "Snapshot in" : "Snapshot taken. Waiting on the draw block."}
                  </p>
                  {next.status !== "SNAPSHOT" && <div className="mt-3"><Countdown to={next.status === "SCHEDULED" ? next.startsAt : next.endsAt} /></div>}
                  <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                    <span className="chip">{plural(next.rewardUnits, "reward")} in the pool</span>
                    <span className="chip">min {next.rules.minSurvivors} Survivors / shelter</span>
                    <span className="chip">{next.rules.minResidencyHours}h residency</span>
                    <Link href={`/drops/${next.id}`} className="link font-mono text-xs">rules & eligibility →</Link>
                  </div>
                </div>
              </div>
            </Panel>
          )}

          {/* My shelters, or how it works */}
          {signedIn && mine ? (
            <Panel className="p-5">
              <SubHeading note={<Link href="/shelters" className="hover:text-hazard">manage →</Link>}>Your shelters</SubHeading>
              {mine.shelterList.length === 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-[3px] border border-dashed border-ash-600 p-5">
                  <p className="text-sm text-bone-dim">No shelter yet. Pick one of your Survivors to lead it, then stack the others inside.</p>
                  <Link href="/shelters" className="btn btn-hazard">Establish a shelter</Link>
                </div>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {mine.shelterList.map((s) => (
                    <li key={s.id}>
                      <Link href={`/shelters/${s.id}`} className="block rounded-[3px] border border-ash-600 bg-ash-900/60 p-3 transition hover:border-hazard/60">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="stencil truncate text-lg">{s.name}</span>
                          <span className="font-mono text-xs text-bone-mute">{s.tier.name}</span>
                        </div>
                        <div className="mt-2"><Gauge value={s.population} max={s.capacity} size="sm" /></div>
                        <p className="mt-1.5 font-mono text-[0.68rem] text-bone-mute">{s.population}/{s.capacity} beds · led by #{s.primaryTokenId}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : (
            <Panel className="p-5 sm:p-6">
              <SubHeading>How survival works</SubHeading>
              <ol className="grid gap-4 sm:grid-cols-2">
                {[
                  ["Gather Survivors", "Every Squeek you hold, in your wallet or staked, is a Survivor. Nothing is moved or locked."],
                  ["Dig a shelter", "One Survivor leads it as primary. Its on-chain level sets the beds: Level 1 sleeps 4, Level 10 sleeps 13."],
                  ["Stack your people", "Move your other Survivors in. Each Survivor can be in one shelter at a time."],
                  ["Make the drop", `Every ${3} days a supply drop lands. Shelters with enough settled Survivors qualify and get tickets in a draw anyone can verify.`],
                ].map(([t, b], i) => (
                  <li key={t} className="flex gap-3">
                    <span className="stencil grid h-9 w-9 shrink-0 place-items-center rounded-[3px] bg-hazard text-xl text-ash-950">{i + 1}</span>
                    <div><p className="stencil text-lg">{t}</p><p className="text-sm leading-relaxed text-bone-dim">{b}</p></div>
                  </li>
                ))}
              </ol>
            </Panel>
          )}
        </div>

        <div className="space-y-6">
          <Panel className="p-5">
            <SubHeading note="all players">District census</SubHeading>
            {data ? (
              <div className="grid grid-cols-2 gap-4">
                <Stat label="Survivors signed in" value={data.district.players} />
                <Stat label="Active shelters" value={data.district.shelters} />
                <Stat label="Sheltered Squeeks" value={data.district.sheltered} tone="signal" />
                <Stat label="Drops drawn" value={data.district.dropsDrawn} tone="hazard" />
              </div>
            ) : <div className="h-28 animate-pulse rounded bg-ash-800" />}
          </Panel>
          <Panel className="p-5">
            <SubHeading note={signedIn ? "yours" : "district radio"}>Recent activity</SubHeading>
            <div className="thin-scrollbar max-h-[26rem] overflow-y-auto pr-1">
              <ActivityFeed items={(signedIn && mine?.activity.length ? mine.activity : data?.activity) ?? []} />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
