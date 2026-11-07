import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: root,
  serverExternalPackages: ["@prisma/client"],
  images: { unoptimized: true },
  webpack: (config) => {
    // wagmi's optional connectors reach for node-only packages.
    config.externals.push("pino-pretty", "lokijs", "encoding");
    config.resolve.fallback = { ...config.resolve.fallback, "@react-native-async-storage/async-storage": false };
    // Not the wagmi/connectors barrel: it drags in every vendor SDK and breaks the build.
    config.resolve.alias["wagmi-walletconnect"] = join(root, "node_modules/@wagmi/connectors/dist/esm/walletConnect.js");
    return config;
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
