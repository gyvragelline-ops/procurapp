"use client";

// Imagen de cabecera de la ficha por órgano (la genera la app): dibujo del
// órgano, nombre del equipo y PD. Sin nombre ni DNI. Cartel PRUEBA si el
// donante es de prueba.

import { dataUrlOrgano } from "@/lib/procuracion/organos-svg";
import type { ConfigOrgano } from "@/lib/procuracion/distribucion-requisitos";

const ANCHO = 1200;
const ALTO = 300;
const FUENTE = "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

function cargar(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo dibujar el órgano."));
    img.src = src;
  });
}

export async function imagenCabeceraFicha(o: { cfg: ConfigOrgano; equipo: string; pd: string; esPrueba: boolean; datosHasta: string | null }): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = ANCHO;
  canvas.height = ALTO;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo generar la imagen.");

  const g = ctx.createLinearGradient(0, 0, ANCHO, ALTO);
  g.addColorStop(0, o.cfg.fondo[0]);
  g.addColorStop(1, o.cfg.fondo[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, ANCHO, ALTO);

  const dibujo = await cargar(dataUrlOrgano(o.cfg.clave, "rgba(255,255,255,0.92)", 220));
  ctx.drawImage(dibujo, 48, 40, 220, 220);

  const x = 310;
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.font = `600 30px ${FUENTE}`;
  ctx.fillText("PROCURAPP · FICHA", x, 92);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `600 64px ${FUENTE}`;
  let equipo = o.equipo;
  while (ctx.measureText(equipo).width > ANCHO - x - 40 && equipo.length > 4) equipo = `${equipo.slice(0, -2)}…`;
  ctx.fillText(equipo, x, 168);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = `500 32px ${FUENTE}`;
  ctx.fillText([o.pd, o.datosHasta ? `datos hasta ${o.datosHasta}` : null].filter(Boolean).join(" · "), x, 222);

  if (o.esPrueba) {
    const t = "PRUEBA";
    ctx.font = `700 30px ${FUENTE}`;
    const w = ctx.measureText(t).width + 36;
    ctx.fillStyle = "#C98512";
    ctx.beginPath();
    ctx.roundRect(ANCHO - w - 36, 32, w, 48, 8);
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(t, ANCHO - w - 36 + 18, 67);
  }

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo generar la imagen."))), "image/png"));
}
