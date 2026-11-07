"use client";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import Link from "next/link";
import { useState } from "react";
import { api, ApiError } from "@/client/api";
import { useApi } from "@/client/hooks";
import { toast } from "@/client/store";
import type { MySurvivors, ShelterView, SurvivorItem } from "@/client/types";
import { useQueryClient } from "@tanstack/react-query";
import { LevelPip, SurvivorArt } from "@/components/game";
import { Gate } from "@/components/Shell";
import { Empty, ErrorBox, Gauge, Heading, Loading, Notice, Panel } from "@/components/ui";

type Token = { tokenId: number; level: number; imageUrl: string | null; name: string; from: string | null };

export default function StackingPage() {
  return (
    <Gate>
      <Bay />
    </Gate>
  );
}

/** Finds the drop zone under a pointer, by data attribute. */
function zoneAt(x: number, y: number): string | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const z = (el as HTMLElement).dataset?.zone;
    if (z) return z;
  }
  return null;
}

function Bay() {
  const qc = useQueryClient();
  const sv = useApi<MySurvivors>("/api/survivors");
  const sh = useApi<{ shelters: ShelterView[] }>("/api/shelters");
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<Token | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [shake, setShake] = useState<string | null>(null);

  if (sv.isLoading || sh.isLoading) return <Loading label="Opening the stacking bay…" />;
  if (sv.error || sh.error) return <ErrorBox error={sv.error ?? sh.error} retry={() => { void sv.refetch(); void sh.refetch(); }} />;
  const survivors = sv.data!.survivors;
  const shelters = sh.data!.shelters;
  const free = survivors.filter((s) => !s.shelter);
  const asToken = (s: SurvivorItem | ShelterView["members"][number], from: string | null): Token => ({ tokenId: s.tokenId, level: s.level, imageUrl: s.imageUrl, name: s.name, from });

  const place = async (t: Token, zone: string) => {
    if (zone === (t.from ?? "tray")) return;
    setBusy(zone);
    setSelected(null);
    try {
      if (zone === "tray") {
        await api(`/api/shelters/${t.from}`, { body: { action: "unstack", tokenId: t.tokenId } });
        toast({ kind: "ok", title: `Survivor #${t.tokenId} is unassigned.` });
      } else {
        await api(`/api/shelters/${zone}`, { body: { action: "stack", tokenId: t.tokenId, move: Boolean(t.from) } });
        const s = shelters.find((x) => x.id === zone);
        toast({ kind: "ok", title: `Survivor #${t.tokenId} joined ${s?.name}.`, body: "Ownership confirmed on Sepolia." });
      }
      await qc.invalidateQueries();
    } catch (e) {
      setShake(zone);
      setTimeout(() => setShake(null), 450);
      toast({ kind: "error", title: e instanceof ApiError ? e.message : "That didn't work." });
    } finally {
      setBusy(null);
    }
  };

  const dragProps = (t: Token) => ({
    drag: true as const,
    dragSnapToOrigin: true,
    dragMomentum: false,
    whileDrag: { scale: 1.12, zIndex: 50, rotate: -3, boxShadow: "0 18px 30px rgba(0,0,0,.6)" },
    onDrag: (_e: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => setHover(zoneAt(info.point.x - window.scrollX, info.point.y - window.scrollY)),
    onDragEnd: (_e: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
      const z = zoneAt(info.point.x - window.scrollX, info.point.y - window.scrollY);
      setHover(null);
      if (z) void place(t, z);
    },
  });

  const chip = (t: Token, primary = false) => (
    <motion.div key={t.tokenId} layout layoutId={`tok-${t.tokenId}`} {...(primary ? {} : dragProps(t))}
      onTap={() => !primary && setSelected((s) => (s?.tokenId === t.tokenId ? null : t))}
      onClick={(e) => e.stopPropagation()}
      className={`relative w-[4.6rem] touch-none select-none rounded-[3px] border p-1 ${primary ? "cursor-default border-hazard/70 bg-hazard/10" : "cursor-grab border-ash-600 bg-ash-900 active:cursor-grabbing"} ${selected?.tokenId === t.tokenId ? "ring-2 ring-hazard" : ""}`}
      title={primary ? "Primary: disband the shelter to free it" : "Drag to a shelter, or tap then tap a shelter"}>
      <SurvivorArt tokenId={t.tokenId} hasArt={Boolean(t.imageUrl)} className="pointer-events-none aspect-square w-full rounded-[2px]" />
      <span className="pointer-events-none mt-0.5 flex items-center justify-between font-mono text-[0.58rem] text-bone-dim">#{t.tokenId}<span className="text-hazard">L{t.level}</span></span>
      {primary && <span className="pointer-events-none absolute -top-2 left-1 rounded-[2px] bg-hazard px-1 font-stencil text-[0.6rem] uppercase text-ash-950">Lead</span>}
    </motion.div>
  );

  const zoneClass = (z: string) => `${hover === z || (selected && selected.from !== z && z !== "tray") ? "border-hazard bg-hazard/5" : "border-ash-600"} ${shake === z ? "animate-shake border-rust" : ""}`;

  return (
    <div className="space-y-6">
      <Heading eyebrow="Logistics" title="Stacking Bay">
        Drag Survivors into a shelter, between shelters, or back to the tray. On a phone, tap a Survivor and then tap where it goes. Every placement is checked against Sepolia before it lands.
      </Heading>
      {shelters.length === 0 ? (
        <Empty title="No shelter to stack into" action={<Link href="/shelters" className="btn btn-hazard">Establish one</Link>}>Dig a shelter first. Its primary decides how many beds you get.</Empty>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <Panel className={`h-fit p-4 lg:sticky lg:top-24 ${zoneClass("tray")}`}>
            <div data-zone="tray" onClick={() => selected?.from && void place(selected, "tray")} className="min-h-[10rem]">
              <div className="mb-3 flex items-baseline justify-between"><h2 className="stencil text-xl">Unassigned</h2><span className="eyebrow">{free.length}</span></div>
              {free.length === 0 ? <p className="py-6 text-center font-mono text-xs text-bone-faint">Everyone has a bed. Drop a resident here to free them.</p> : (
                <div className="flex flex-wrap gap-2">
                  <AnimatePresence>{free.map((s) => chip(asToken(s, null)))}</AnimatePresence>
                </div>
              )}
              {busy === "tray" && <p className="mt-3 font-mono text-xs text-hazard">Updating…</p>}
            </div>
          </Panel>

          <div className="grid gap-4 md:grid-cols-2">
            {shelters.map((s) => {
              const residents = s.members.filter((m) => m.role !== "PRIMARY");
              const primary = s.members.find((m) => m.role === "PRIMARY");
              return (
                <Panel key={s.id} className={`p-4 transition ${zoneClass(s.id)}`}>
                  <div data-zone={s.id} onClick={() => selected && void place(selected, s.id)} className="min-h-[12rem]">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div className="min-w-0"><Link href={`/shelters/${s.id}`} className="stencil block truncate text-xl hover:text-hazard" onClick={(e) => e.stopPropagation()}>{s.name}</Link><p className="font-mono text-[0.65rem] text-bone-mute">{s.population}/{s.capacity} beds</p></div>
                      {busy === s.id ? <span className="font-mono text-[0.65rem] text-hazard">Verifying…</span> : s.population >= s.capacity ? <span className="chip chip-hazard">Full</span> : null}
                    </div>
                    <Gauge value={s.population} max={s.capacity} size="sm" />
                    <div className="mt-3 flex flex-wrap gap-2">
                      {primary && chip(asToken(primary, s.id), true)}
                      <AnimatePresence>{residents.map((m) => chip(asToken(m, s.id)))}</AnimatePresence>
                      {Array.from({ length: Math.max(0, s.capacity - s.population) }, (_, i) => (
                        <div key={i} className="grid aspect-[4/5] w-[4.6rem] place-items-center rounded-[3px] border border-dashed border-ash-600 font-mono text-[0.55rem] uppercase text-bone-faint">bed</div>
                      ))}
                    </div>
                  </div>
                </Panel>
              );
            })}
          </div>
        </div>
      )}
      {selected && <div className="fixed inset-x-0 bottom-20 z-30 mx-auto w-fit lg:bottom-6"><Notice tone="hazard">Survivor #{selected.tokenId} selected. Tap a shelter{selected.from ? " or the tray" : ""}. <button className="link ml-2" onClick={() => setSelected(null)}>cancel</button></Notice></div>}
    </div>
  );
}
