import type { MetadataRoute } from "next";

// Marca: "Procurapp" (escrito por la app; ninguna imagen lleva letras).
// Iconos en public/brand/ (generados desde icono-512.png).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Procurapp",
    short_name: "Procurapp",
    description: "Procuración y trasplante — Argentina",
    start_url: "/",
    display: "standalone",
    background_color: "#041821",
    theme_color: "#041821",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
