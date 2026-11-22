import type { MetadataRoute } from "next";

/** Install metadata (legacy manifest.webmanifest). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "My Reading Room",
    short_name: "Reading Room",
    description: "Private shared reading tracker, bookshelves and insights.",
    start_url: "/insights",
    scope: "/",
    display: "standalone",
    background_color: "#f9f8f3",
    theme_color: "#254c38",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
