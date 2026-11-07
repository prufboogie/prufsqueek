import { ImageResponse } from "next/og";
import { db } from "@/server/db";
import { Frame, artUri, ogFonts } from "@/server/og";
import { capacityFor, tierFor } from "@/shared/rules";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A shelter in The Last District";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await db.shelter.findUnique({ where: { id }, include: { members: { include: { survivor: true }, orderBy: { joinedAt: "asc" } } } });
  const fonts = await ogFonts();
  if (!s) return new ImageResponse(<Frame eyebrow="Shelter"><div style={{ display: "flex", fontFamily: "Stencil", fontSize: 90, marginTop: 120 }}>LOST SIGNAL</div></Frame>, { ...size, fonts });
  const primary = s.members.find((m) => m.role === "PRIMARY");
  const cap = capacityFor(primary?.survivor.level ?? 1);
  const ordered = [...s.members].sort((a, b) => (a.role === "PRIMARY" ? -1 : b.role === "PRIMARY" ? 1 : 0)).slice(0, 8);
  const arts = await Promise.all(ordered.map((m) => artUri(m.tokenId)));
  return new ImageResponse(
    <Frame eyebrow={`Shelter · tier ${tierFor(s.xp).tier} ${tierFor(s.xp).name}`}>
      <div style={{ display: "flex", fontFamily: "Stencil", fontSize: 96, lineHeight: 1, marginTop: 26, textTransform: "uppercase" }}>{s.name}</div>
      <div style={{ display: "flex", fontSize: 28, color: "#9be29f", marginTop: 12 }}>{`${s.members.length}/${cap} Survivors sheltered${s.status === "ABANDONED" ? " · abandoned" : ""}`}</div>
      <div style={{ display: "flex", gap: 14, marginTop: "auto" }}>
        {ordered.map((m, i) => (
          <div key={m.tokenId} style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 6, border: `3px solid ${m.role === "PRIMARY" ? "#f2a93b" : "#2f3732"}`, background: "#141816" }}>
            {arts[i] ? <img src={arts[i]!} width={118} height={118} alt="" /> : <div style={{ width: 118, height: 118, background: "#232a26", display: "flex" }} />}
            <div style={{ display: "flex", fontSize: 18, marginTop: 4, color: m.role === "PRIMARY" ? "#f2a93b" : "#b9b4a6" }}>#{m.tokenId}</div>
          </div>
        ))}
      </div>
    </Frame>,
    { ...size, fonts },
  );
}
