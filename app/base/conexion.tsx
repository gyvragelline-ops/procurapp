"use client";

import { useEffect, useState } from "react";
import { CONSULTA_BASE_MS, estadoActualizacion, type EstadoActualizacion } from "@/lib/procuracion/base-actualizacion";
import styles from "./base.module.css";

// Estado de la actualización automática: última consulta buena y último
// fallo (incluido el evento "offline" del navegador).
export function useConexion() {
  const [cargadoEn, setCargadoEn] = useState<number | null>(null);
  const [falloEn, setFalloEn] = useState<number | null>(null);
  useEffect(() => {
    const sinRed = () => setFalloEn(Date.now());
    window.addEventListener("offline", sinRed);
    return () => window.removeEventListener("offline", sinRed);
  }, []);
  return {
    cargadoEn,
    estado: estadoActualizacion(cargadoEn, falloEn),
    ok: (t: number) => setCargadoEn(t),
    fallo: () => setFalloEn(Date.now()),
  };
}

// "Actualizado 14:05:09" (gris) o "Sin conexión: datos de 14:05" (rojo).
export function MarcaActualizado({ estado }: { estado: EstadoActualizacion }) {
  const sin = estado.tipo === "sin_conexion";
  return (
    <span className={`${styles.chico} ${styles.num} ${sin ? "" : styles.mu}`} style={sin ? { color: "#C8402F", fontWeight: 600 } : undefined} role="status">
      {estado.texto}
    </span>
  );
}

export function AvisoSinConexion({ estado }: { estado: EstadoActualizacion }) {
  if (estado.tipo !== "sin_conexion") return null;
  return (
    <div className={`${styles.aviso} ${styles.noImprimir}`} role="alert">
      <strong>{estado.texto}.</strong> Lo que ves NO está actualizado. Se reintenta solo cada {CONSULTA_BASE_MS / 1000} s.
    </div>
  );
}
