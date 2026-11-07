import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: root,
  serverExternalPackages: ["@prisma/client"],
  images: { unoptimized: true },
  // Share cards read these fonts at runtime, so the tracer can't see them on its own.
  outputFileTracingIncludes: {
    "/shelters/[id]/opengraph-image": ["./node_modules/@fontsource/big-shoulders-stencil-display/files/*-latin-900-normal.woff", "./node_modules/@fontsource/ibm-plex-mono/files/*-latin-500-normal.woff"],
    "/drops/[id]/winner/[did]/opengraph-image": ["./node_modules/@fontsource/big-shoulders-stencil-display/files/*-latin-900-normal.woff", "./node_modules/@fontsource/ibm-plex-mono/files/*-latin-500-normal.woff"],
  },
  webpack: (config) => {
    // wagmi's optional connectors reach for node-only packages.
    config.externals.push("pino-pretty", "lokijs", "encoding");
    config.resolve.fallback = { ...config.resolve.fallback, "@react-native-async-storage/async-storage": false };
    // Not the wagmi/connectors barrel: it drags in every vendor SDK and breaks the build.
    config.resolve.alias["wagmi-walletconnect"] = join(root, "node_modules/@wagmi/connectors/dist/esm/walletConnect.js");
    return config;
  },
  async redirects() {
    return [
      // www goes to the bare domain, and the bare domain opens straight into Ash Run.
      { source: "/:path*", has: [{ type: "host", value: "www.prufsqueek.xyz" }], destination: "https://prufsqueek.xyz/:path*", permanent: true },
      { source: "/", has: [{ type: "host", value: "prufsqueek.xyz" }], destination: "/run", permanent: false },
    ];
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
      ],
    }];
  },
};

export default nextConfig;
