import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import SwRegister from "./sw-register";
import SubidasVideoProvider from "./subidas-video-context";
import SubidasVideoIndicator from "./subidas-video-indicator";
import "./globals.css";

// Tipografías guardadas en el repositorio (app/fonts, subconjunto latino,
// los mismos archivos que servía Google Fonts): el build no baja nada de
// la red.
const spaceGrotesk = localFont({
  src: "./fonts/space-grotesk-latin-var.woff2",
  weight: "500 700",
  variable: "--font-space-grotesk",
  display: "swap",
});

const inter = localFont({
  src: "./fonts/inter-latin-var.woff2",
  weight: "400 700",
  variable: "--font-inter",
  display: "swap",
});

const ibmPlexMono = localFont({
  src: [
    { path: "./fonts/ibm-plex-mono-latin-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-mono-latin-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ibm-plex-mono-latin-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Procuración",
  description: "Sistema operativo de procuración de órganos — CUCAIBA",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Procuración",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${spaceGrotesk.variable} ${inter.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SwRegister />
        <SubidasVideoProvider>
          {children}
          <SubidasVideoIndicator />
        </SubidasVideoProvider>
      </body>
    </html>
  );
}
