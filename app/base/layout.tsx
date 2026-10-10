import type { Metadata } from "next";
import localFont from "next/font/local";
import styles from "./base.module.css";

// Base operativa (/base): escritorio, tema CLARO (oficina e impresión),
// IBM Plex Sans / Plex Mono tabulares (archivos locales, sin red).
//
// ATENCIÓN: muestra datos de VARIOS donantes y todavía no hay login ni
// RLS. NO usar con donantes reales hasta tener autenticación por rol.

const plexSans = localFont({ src: "../fonts/ibm-plex-sans-latin-var.woff2", weight: "400 600", variable: "--font-base-sans", display: "swap", adjustFontFallback: false });
const plexSansGriego = localFont({ src: "../fonts/ibm-plex-sans-greek-var.woff2", weight: "400 600", variable: "--font-base-sans-griego", display: "swap", adjustFontFallback: false });

export const metadata: Metadata = { title: "Base operativa · Procurapp" };

export default function BaseLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${styles.app} ${plexSans.variable} ${plexSansGriego.variable}`}>{children}</div>;
}
