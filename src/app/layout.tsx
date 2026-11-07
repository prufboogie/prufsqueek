import type { Metadata, Viewport } from "next";
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
};

export const viewport: Viewport = { themeColor: "#0a0c0b", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
