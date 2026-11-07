import { ImageResponse } from "next/og";
import { db } from "@/server/db";
import { Frame, artUri, ogFonts } from "@/server/og";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A supply drop winner in The Last District";

export default async function Image({ params }: { params: Promise<{ id: string; did: string }> }) {
  const { did } = await params;
  const fonts = await ogFonts();
  const w = await db.rewardDistribution.findUnique({ where: { id: did }, include: { reward: true, drop: true, shelter: true } });
  if (!w || w.status === "VOID") return new ImageResponse(<Frame eyebrow="Supply drop"><div style={{ display: "flex", fontFamily: "Stencil", fontSize: 90, marginTop: 120 }}>LOST SIGNAL</div></Frame>, { ...size, fonts });
  const art = await artUri(w.shelter.primaryTokenId);
  return new ImageResponse(
    <Frame eyebrow={`Supply drop #${w.drop.number} · ${w.drop.name}`}>
      <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 48, marginTop: 20 }}>
        <div style={{ display: "flex", padding: 10, border: "4px solid #f2a93b", background: "#141816" }}>
          {art ? <img src={art} width={300} height={300} alt="" /> : <div style={{ width: 300, height: 300, background: "#232a26", display: "flex" }} />}
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", fontSize: 26, color: "#9be29f", letterSpacing: 3 }}>MADE THE DROP</div>
          <div style={{ display: "flex", fontFamily: "Stencil", fontSize: 88, lineHeight: 1, textTransform: "uppercase", marginTop: 8 }}>{w.shelter.name}</div>
          <div style={{ display: "flex", fontSize: 34, color: "#f2a93b", marginTop: 22 }}>{w.reward.title}</div>
          <div style={{ display: "flex", fontSize: 22, color: "#8d8f86", marginTop: 14 }}>{`Ticket #${w.ticket} · verifiable draw${w.reward.isDemo ? " · demo reward" : ""}`}</div>
        </div>
      </div>
    </Frame>,
    { ...size, fonts },
  );
}
