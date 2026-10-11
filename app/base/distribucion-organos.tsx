"use client";

import { lazy, Suspense, useMemo, useState } from "react";
import type { ExpedienteDatos, FuenteBase } from "@/lib/procuracion/base-armado";
import { SIMBOLO, fichasDistribucion, type Evaluado, type Marca } from "@/lib/procuracion/distribucion";
import { dataUrlOrgano } from "@/lib/procuracion/organos-svg";
import { COLOR } from "./ui";
import styles from "./base.module.css";

// Distribución por órgano (solo Base; diseño handoff/disenos/
// Base-Expediente-Compacto). Requisitos en lib/procuracion/
// distribucion-requisitos.ts (A VALIDAR CON PROTOCOLO CUCAIBA/INCUCAI).
// "Editar ficha" abre la ficha para el equipo (ficha-panel.tsx, diseño
// preview-ficha.png): se carga recién al abrirla, con el generador de PDF.

const FichaPanel = lazy(() => import("./ficha-panel"));

const COLOR_MARCA: Record<Marca, string> = { listo: COLOR.g, falta: COLOR.r, info: COLOR.a, verificar: COLOR.a };
const COLOR_ESTADO = { g: COLOR.g, a: COLOR.a, r: COLOR.r, mu: "#8EA0A4" } as const;

export default function DistribucionOrganos({ datos, fuente, donanteId, ahora, recargar }: { datos: ExpedienteDatos; fuente: FuenteBase; donanteId: string; ahora: number; recargar: () => Promise<void> }) {
  const fichas = useMemo(() => fichasDistribucion(datos, ahora), [datos, ahora]);
  const [editando, setEditando] = useState<string | null>(null);
  const ficha = fichas.find((f) => f.cfg.clave === editando) ?? null;

  return (
    <div className={styles.cardC}>
      <div className={styles.cabDistribucion}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Distribución por órgano</span>
        <span className={styles.soloBaseChip}>Solo Base</span>
        <span className={`${styles.chico} ${styles.mu}`}>Lo que pide cada equipo, cruzado con lo cargado. En «Editar ficha» elegís qué va, editás valores y ves el PDF.</span>
      </div>
      <div className={styles.organos}>
        {fichas.map((f) => (
          <div key={f.cfg.clave} className={styles.organo}>
            <div className={styles.organoCab}>
              <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={dataUrlOrgano(f.cfg.clave, f.cfg.color, 24)} alt="" width={24} height={24} style={{ flex: "none" }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>{f.cfg.etiqueta}</span>
              </span>
              <span className={styles.organoEstado} style={{ color: COLOR_ESTADO[f.estado.color] }} title={f.estado.texto}>
                {f.estado.texto}
              </span>
            </div>
            {f.requisitos.map((r) => (
              <FilaRequisito key={r.clave} r={r} />
            ))}
            <div className={styles.organoPie}>
              <span style={{ fontSize: 11, fontWeight: 600, color: f.listos === f.total ? COLOR.g : COLOR.a }}>
                {f.listos} de {f.total} listos
              </span>
              <button type="button" className={styles.btnCab} onClick={() => setEditando(f.cfg.clave)}>
                Editar ficha
              </button>
            </div>
          </div>
        ))}
      </div>
      {ficha && (
        <Suspense
          fallback={
            <div className={styles.fondoPanel}>
              <div className={styles.fichaModal} style={{ padding: 20 }}>
                Abriendo la ficha…
              </div>
            </div>
          }
        >
          <FichaPanel key={ficha.cfg.clave} datos={datos} ficha={ficha} fuente={fuente} donanteId={donanteId} ahora={ahora} recargar={recargar} onCerrar={() => setEditando(null)} />
        </Suspense>
      )}
    </div>
  );
}

function FilaRequisito({ r }: { r: Evaluado }) {
  return (
    <div className={styles.filaRequisito} title={r.nota ?? undefined}>
      <span style={{ color: COLOR_MARCA[r.marca], fontWeight: 700 }}>{SIMBOLO[r.marca]}</span>
      <span>{r.etiqueta}</span>
      <span className={styles.num} style={{ color: r.marca === "falta" ? COLOR.r : COLOR.mu, fontSize: 10.5, textAlign: "right" }}>
        {r.valor}
      </span>
    </div>
  );
}
