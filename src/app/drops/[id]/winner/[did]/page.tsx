import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { KIND_LABEL } from "@/server/vault";

async function load(id: string, did: string) {
  const w = await db.rewardDistribution.findUnique({ where: { id: did }, include: { reward: true, drop: true, shelter: { include: { members: true } } } }).catch(() => null);
  return w && w.dropId === id && w.status !== "VOID" ? w : null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string; did: string }> }): Promise<Metadata> {
  const { id, did } = await params;
  const w = await load(id, did);
  if (!w) return { title: "Supply drop" };
  return { title: `${w.shelter.name} made the drop`, description: `${w.shelter.name} won ${w.reward.title}${w.reward.isDemo ? " (demo)" : ""} in ${w.drop.name}.` };
}

export default async function WinnerPage({ params }: { params: Promise<{ id: string; did: string }> }) {
  const { id, did } = await params;
  const w = await load(id, did);
  if (!w) notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="plate plate-bolts overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/drops/${id}/winner/${did}/opengraph-image`} alt={`${w.shelter.name} won ${w.reward.title}`} className="w-full" />
      </div>
      <div className="text-center">
        <p className="eyebrow">Drop #{w.drop.number} · slot {w.slot} · ticket #{w.ticket}</p>
        <h1 className="stencil mt-2 text-4xl">{w.shelter.name} made the drop</h1>
        <p className="mt-2 text-bone-dim">{KIND_LABEL[w.reward.kind]}: {w.reward.title}{w.reward.isDemo ? " · demo reward, no value" : ""}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link href={`/drops/${id}`} className="btn btn-steel">See the draw</Link>
          <Link href={`/shelters/${w.shelterId}`} className="btn btn-hazard">Visit the shelter</Link>
        </div>
      </div>
    </div>
  );
}
