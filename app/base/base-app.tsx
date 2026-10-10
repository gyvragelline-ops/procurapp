"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fuenteSupabase } from "@/lib/procuracion/base-datos";
import { crearFuenteDemo } from "@/lib/procuracion/base-demo";
import type { FuenteBase } from "@/lib/procuracion/base-armado";
import type { InsumosTablero } from "@/lib/procuracion/base-tablero";
import { puedeVerBase, rolActual } from "@/lib/procuracion/rol";
import Tablero from "./tablero";
import Expediente from "./expediente";
import { useConsultaPeriodica } from "./ui";
import styles from "./base.module.css";

const CONSULTA_MS = 30_000;
// El modo demo (datos simulados en memoria) solo existe en desarrollo.
const DEMO_PERMITIDO = process.env.NODE_ENV !== "production";

export default function BaseApp() {
  const params = useSearchParams();
  const demo = params.get("demo") === "1" && DEMO_PERMITIDO;
  return <BaseConFuente key={demo ? "demo" : "real"} demo={demo} pidioDemo={params.get("demo") === "1"} donanteId={params.get("d")} />;
}

function BaseConFuente({ demo, pidioDemo, donanteId }: { demo: boolean; pidioDemo: boolean; donanteId: string | null }) {
  const router = useRouter();
  const [fuente] = useState<FuenteBase>(() => (demo ? crearFuenteDemo(Date.now()) : fuenteSupabase(createClient())));
  const [insumos, setInsumos] = useState<InsumosTablero[] | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargadoEn, setCargadoEn] = useState<number | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  async function cargar() {
    try {
      const r = await fuente.cargarTablero();
      setInsumos(r.insumos);
      setAvisos(r.avisos);
      setError(null);
      const t = Date.now();
      setCargadoEn(t);
      setAhora(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el tablero.");
    }
  }
  useConsultaPeriodica(cargar, CONSULTA_MS, "tablero");
  // reloj para "actualizado hace X" y los "hace N min"
  useConsultaPeriodica(() => setAhora(Date.now()), 10_000, "reloj");

  const irA = (id: string | null) => {
    const q = new URLSearchParams();
    if (id) q.set("d", id);
    if (demo) q.set("demo", "1");
    const s = q.toString();
    router.push(s ? `/base?${s}` : "/base");
  };

  // Entrada detrás de la abstracción de rol (sin login: rol fijo "base").
  if (!puedeVerBase(rolActual("base"))) return <div className={styles.aviso}>Sin permiso para ver la Base operativa.</div>;

  return (
    <>
      <div className={`${styles.aviso} ${styles.noImprimir}`}>
        <strong>Sin login todavía:</strong> esta pantalla muestra datos de varios donantes y no tiene autenticación por rol. No usar con donantes
        reales.
      </div>
      {demo && (
        <div className={`${styles.aviso} ${styles.avisoDemo} ${styles.noImprimir}`}>
          <strong>Modo demo:</strong> datos simulados en memoria. Nada se guarda en la base; al recargar vuelve al inicio.
        </div>
      )}
      {pidioDemo && !demo && <div className={`${styles.aviso} ${styles.noImprimir}`}>El modo demo solo funciona en desarrollo: se muestran los datos reales.</div>}
      {avisos.map((a) => (
        <div key={a} className={`${styles.aviso} ${styles.avisoDemo} ${styles.noImprimir}`}>
          {a}
        </div>
      ))}
      {error && <div className={styles.error}>{error}</div>}
      {donanteId ? (
        <Expediente key={donanteId} fuente={fuente} donanteId={donanteId} activos={insumos ?? []} ahora={ahora} onAhora={setAhora} irA={irA} onCambioTablero={cargar} />
      ) : (
        <Tablero insumos={insumos} ahora={ahora} cargadoEn={cargadoEn} onAbrir={(id) => irA(id)} />
      )}
    </>
  );
}
