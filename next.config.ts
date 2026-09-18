import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Parent ~/package-lock.json made Next treat ~ as the workspace root,
  // which breaks client hydration on login (form click did a GET reload).
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  // Isolate production builds from the dev server's build directory. Running
  // `next build` while `next dev` is up used to clobber .next in place — the
  // dev server then lost routes-manifest.json / app-paths-manifest.json and
  // every lazy route chunk 404'd (ChunkLoadError) until a full restart.
  // `next start` picks the distDir up from required-server-files.json, which
  // is written at build time, so production serving is unaffected.
  distDir: process.env.NODE_ENV === "production" ? ".next-build" : ".next",
  poweredByHeader: false,
  // Default bottom-left badge sits on the sidebar account menu and steals clicks.
  devIndicators: { position: "bottom-right" },
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
