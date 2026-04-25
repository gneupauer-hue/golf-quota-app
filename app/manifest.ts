import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Irem Quota",
    short_name: "Irem Quota",
    description: "Fast mobile golf quota scoring for live rounds, players, and results.",
    start_url: "/",
    display: "standalone",
    background_color: "#0d1c18",
    theme_color: "#10281f",
    orientation: "portrait",
    icons: [
      {
        src: "/icon-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "maskable"
      },
      {
        src: "/icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable"
      }
    ]
  };
}
