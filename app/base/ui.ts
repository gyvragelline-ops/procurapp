"use client";

import { useEffect, useRef } from "react";
import type { EstadoEtapa } from "@/lib/procuracion/constants";

// Colores del diseño (handoff/disenos): verde completo, ámbar en curso o
// falta, rojo bloqueado, gris sin iniciar.
export const COLOR = { g: "#1F9D6B", a: "#C98512", r: "#C8402F", n: "#C3CFD2", nd: "#9AAAAE", tx: "#1B2A2E", mu: "#5E7378" };
export const colorEtapa = (e: EstadoEtapa | undefined) => (e === "green" ? COLOR.g : e === "amber" ? COLOR.a : e === "red" ? COLOR.r : COLOR.n);
export const textoEstadoEtapa = (e: EstadoEtapa | undefined) => (e === "green" ? "Completa" : e === "amber" ? "En curso" : e === "red" ? "Bloqueada" : "Sin iniciar");

const p2 = (n: number) => String(n).padStart(2, "0");
export const dosCifras = p2;
export const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
};
export const ddmm = (iso: string) => {
  const d = new Date(iso);
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}`;
};
const mismoDia = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// "14:40" si es de hoy; "09/10 22:10" si no.
export function horaCorta(iso: string, ahora: number): string {
  return mismoDia(new Date(iso), new Date(ahora)) ? hhmm(iso) : `${ddmm(iso)} ${hhmm(iso)}`;
}
// "Hoy 21:30" · "Mañana 08:00" · "Ayer 23:10" · "12/10 08:00"
export function diaYHora(iso: string, ahora: number): string {
  const d = new Date(iso);
  const hoy = new Date(ahora);
  const manana = new Date(ahora + 86_400_000);
  const ayer = new Date(ahora - 86_400_000);
  const pre = mismoDia(d, hoy) ? "Hoy" : mismoDia(d, manana) ? "Mañana" : mismoDia(d, ayer) ? "Ayer" : ddmm(iso);
  return `${pre} ${hhmm(iso)}`;
}
// "hace 12 min" · "hace 2 h 10" · "hace 3 h"
export function hace(minutos: number): string {
  if (minutos < 60) return `hace ${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m ? `hace ${h} h ${p2(m)}` : `hace ${h} h`;
}
export const letraSexo = (s: string | null) => (s === "masculino" ? "M" : s === "femenino" ? "F" : null);

// Consulta periódica (sin Realtime): enseguida, después cada `ms`, solo con
// la pestaña visible; se pausa oculta y consulta apenas se vuelve.
export function useConsultaPeriodica(consultar: () => Promise<void> | void, ms: number, clave: string) {
  const ref = useRef(consultar);
  useEffect(() => {
    ref.current = consultar;
  });
  useEffect(() => {
    let t: ReturnType<typeof setInterval> | null = null;
    const arrancar = () => {
      if (t) return;
      void ref.current();
      t = setInterval(() => void ref.current(), ms);
    };
    const parar = () => {
      if (t) clearInterval(t);
      t = null;
    };
    const alCambiar = () => (document.visibilityState === "visible" ? arrancar() : parar());
    // La primera carga va siempre (aunque la pestaña esté oculta); la
    // consulta periódica, solo con la pestaña visible.
    if (document.visibilityState !== "visible") void ref.current();
    alCambiar();
    document.addEventListener("visibilitychange", alCambiar);
    return () => {
      parar();
      document.removeEventListener("visibilitychange", alCambiar);
    };
  }, [ms, clave]);
}

// Descarga de un archivo de texto (CSV con BOM ya incluido en el contenido).
export function descargar(nombre: string, contenido: string, tipo = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Nombre de quien usa la Base en este dispositivo (el mismo del chat).
const CLAVE_NOMBRE = "procurapp:chat:autor";
export function leerNombre(): string {
  try {
    return window.localStorage.getItem(CLAVE_NOMBRE) ?? "";
  } catch {
    return "";
  }
}
export function guardarNombre(n: string) {
  try {
    window.localStorage.setItem(CLAVE_NOMBRE, n);
  } catch {
    // sin almacenamiento: no se recuerda
  }
}
