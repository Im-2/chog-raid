import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Chog Raid",
    short_name: "Chog Raid",
    description: "Every Chog becomes a room in one giant shared dungeon. Defend yours, raid others.",
    start_url: "/",
    display: "standalone",
    background_color: "#120d0a",
    theme_color: "#120d0a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
