import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactNode } from "react";
import { db } from "./db";

const font = (pkg: string, file: string) => readFile(join(process.cwd(), "node_modules/@fontsource", pkg, "files", file));

export async function ogFonts() {
  const [stencil, mono] = await Promise.all([
    font("big-shoulders-stencil-display", "big-shoulders-stencil-display-latin-900-normal.woff"),
    font("ibm-plex-mono", "ibm-plex-mono-latin-500-normal.woff"),
  ]);
  return [
    { name: "Stencil", data: stencil, weight: 900 as const, style: "normal" as const },
    { name: "Mono", data: mono, weight: 500 as const, style: "normal" as const },
  ];
}

/** The Squeek's own art as a data URI for the card. Only the stored, validated SVG. */
export async function artUri(tokenId: number) {
  const s = await db.survivor.findUnique({ where: { tokenId }, select: { imageUri: true } });
  return s?.imageUri?.startsWith("data:image/svg+xml;base64,") ? s.imageUri : null;
}

export function Frame({ children, eyebrow }: { children: ReactNode; eyebrow: string }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#0a0c0b", color: "#e9e4d6", fontFamily: "Mono" }}>
      <div style={{ height: 14, width: "100%", display: "flex", background: "repeating-linear-gradient(-45deg, #f2a93b 0 18px, #141816 18px 36px)" }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "40px 56px", backgroundImage: "radial-gradient(900px 400px at 85% 0%, rgba(242,169,59,.16), transparent 60%)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, letterSpacing: 4, color: "#8d8f86", textTransform: "uppercase" }}>
          <span>{eyebrow}</span>
          <span style={{ fontFamily: "Stencil", color: "#f2a93b", letterSpacing: 2, fontSize: 28 }}>THE LAST DISTRICT</span>
        </div>
        {children}
      </div>
    </div>
  );
}
