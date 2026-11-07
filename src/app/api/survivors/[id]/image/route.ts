import { route } from "@/server/http";
import { survivorArt } from "@/server/survivors";

/** Untrusted on-chain art: served as an image with a locked-down policy, never inlined into pages. */
export const GET = route("survivors.image", async (_req, ctx) => {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id < 1 || id > 9999) return new Response("Not found", { status: 404 });
  const svg = await survivorArt(id);
  if (!svg) return new Response("Not found", { status: 404 });
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=86400",
    },
  });
});
