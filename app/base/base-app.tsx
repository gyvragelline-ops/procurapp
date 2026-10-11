"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fuenteSupabase } from "@/lib/procuracion/base-datos";
import { pedirIniciales } from "@/lib/procuracion/base-iniciales";
import { CONSULTA_BASE_MS } from "@/lib/procuracion/base-actualizacion";
import type { FuenteBase } from "@/lib/procuracion/base-armado";
import type { InsumosTablero } from "@/lib/procuracion/base-tablero";
import { puedeVerBase, rolActual } from "@/lib/procuracion/rol";
import Tablero from "./tablero";
import Expediente from "./expediente";
import { useConsultaPeriodica } from "./ui";
import { AvisoSinConexion, useConexion } from "./conexion";
import styles from "./base.module.css";

// Siempre la base real (sin modo demo ni datos de ejemplo).
export default function BaseApp() {
  const params = useSearchParams();
  return <BaseConFuente donanteId={params.get("d")} />;
}

function BaseConFuente({ donanteId }: { donanteId: string | null }) {
  const router = useRouter();
  // Las iniciales las calcula el servidor: el navegador no recibe nombres ni DNI.
  const [fuente] = useState<FuenteBase>(() => fuenteSupabase(createClient(), { iniciales: pedirIniciales }));
  const [insumos, setInsumos] = useState<InsumosTablero[] | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const conexion = useConexion();
  const [ahora, setAhora] = useState(() => Date.now());

  async function cargar() {
    try {
      const r = await fuente.cargarTablero();
      setInsumos(r.insumos);
      setAvisos(r.avisos);
      setError(null);
      const t = Date.now();
      conexion.ok(t);
      setAhora(t);
    } catch (e) {
      conexion.fallo();
      setError(e instanceof Error ? e.message : "No se pudo cargar el tablero.");
    }
  }
  useConsultaPeriodica(cargar, CONSULTA_BASE_MS, "tablero");
  // reloj para "actualizado hace X" y los "hace N min"
  useConsultaPeriodica(() => setAhora(Date.now()), 10_000, "reloj");

  const irA = (id: string | null) => {
    const q = new URLSearchParams();
    if (id) q.set("d", id);
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
      {avisos.map((a) => (
        <div key={a} className={`${styles.aviso} ${styles.avisoDemo} ${styles.noImprimir}`}>
          {a}
        </div>
      ))}
      {!donanteId && <AvisoSinConexion estado={conexion.estado} />}
      {error && <div className={styles.error}>{error}</div>}
      {donanteId ? (
        <Expediente key={donanteId} fuente={fuente} donanteId={donanteId} activos={insumos ?? []} ahora={ahora} onAhora={setAhora} irA={irA} onCambioTablero={cargar} />
      ) : (
        <Tablero insumos={insumos} ahora={ahora} actualizacion={conexion.estado} onAbrir={(id) => irA(id)} />
      )}
    </>
  );
}
