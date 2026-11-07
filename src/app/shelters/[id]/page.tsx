import type { Metadata } from "next";
import { db } from "@/server/db";
import ShelterPage from "./ShelterPage";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const s = await db.shelter.findUnique({ where: { id }, include: { _count: { select: { members: true } } } }).catch(() => null);
  if (!s) return { title: "Shelter" };
  return { title: s.name, description: `${s.name}: ${s._count.members} Survivors sheltered in The Last District.` };
}

export default function Page() {
  return <ShelterPage />;
}
