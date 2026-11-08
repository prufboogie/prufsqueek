import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { Providers } from "@/components/Providers";
import { Shell } from "@/components/Shell";
import "./globals.css";

const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3500";

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: { default: "The Last District", template: "%s · The Last District" },
  description: "The world fell. Your survival begins here. A survival game for Squeek holders: shelter your Survivors, stack your shelters, make the supply drops.",
  openGraph: { siteName: "The Last District", type: "website" },
  twitter: { card: "summary_large_image" },
  // Squeekchain builder programme: proves this site belongs to the submitted project. Rechecked daily.
  other: { "squeekchain-project": "4aaab249-aed5-4a46-a75d-b1cecc532dcd" },
};

/** Hosts whose front page is Ash Run itself (served in place, so the page and its tags load at the bare address). */
const RUN_HOSTS = new Set(["prufsqueek.xyz"]);

export const viewport: Viewport = { themeColor: "#0a0c0b", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const host = ((await headers()).get("x-forwarded-host") ?? (await headers()).get("host") ?? "").split(":")[0];
  return (
    <html lang="en">
      <body>
        <Providers>
          <Shell runAtRoot={RUN_HOSTS.has(host)}>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
