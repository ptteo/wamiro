import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import { resolveOrgForHostCached, verifyCustomDomain } from "@/modules/org/host";

export const dynamic = "force-dynamic";

/**
 * PWA manifest (Phase D). White-label aware: when the request arrives on a
 * tenant host the installed app takes that company's name + colors.
 * Auto-linked by Next at /manifest.webmanifest.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const host = (await headers()).get("host") ?? "";
  const tenant = await resolveOrgForHostCached(host).catch(() => null);
  if (tenant?.needsVerification) {
    void verifyCustomDomain(tenant.id).catch(() => {});
  }

  const short = tenant ? tenant.name.slice(0, 12) : "Wamiro";
  const icons: MetadataRoute.Manifest["icons"] = [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    {
      src: "/icons/icon-512-maskable.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ];

  return {
    name: tenant ? `${tenant.name} — work portal` : "Wamiro",
    short_name: short,
    description: tenant
      ? `The work portal for ${tenant.name}.`
      : "Wamiro — the operating system for modern organizations.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: tenant?.primaryColor ?? "#4f46e5",
    icons,
    categories: ["business", "productivity"],
    lang: "en",
  };
}
