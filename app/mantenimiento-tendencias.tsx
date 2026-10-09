"use client";

import { useState } from "react";
import { direccionTendencia, edadUltimoDato, recortarVentana, type Punto } from "@/lib/procuracion/mantenimiento-calculos";
import {
  CAMBIO_MINIMO_FLECHA,
  VENTANA_TENDENCIA_INICIAL_H,
  VENTANAS_TENDENCIA_H,
  type ClaveTendencia,
} from "@/lib/procuracion/mantenimiento-metas";
import { num } from "./mantenimiento-ui";

export type SerieTendencia = {
  clave: ClaveTendencia;
  etiqueta: string;
  unidad: string;
  puntos: Punto[];
  decimales: number;
  banda: { desde?: number; hasta?: number } | null; // verde de la meta
  sueltos?: boolean; // puntos sueltos con su hora (sin línea)
};

const FLECHA = { sube: "↑", baja: "↓", estable: "→ estable" } as const;

function edadTexto(min: number | null): string {
  if (min === null) return "sin datos";
  if (min < 60) return `hace ${Math.max(0, Math.round(min))} min`;
  return `hace ${num(min / 60, 1)} h`;
}

// Tendencias por parámetro: banda verde de la meta, selector de 6, 12 y
// 24 h (arranca en 12), edad del último dato y flecha de dirección (solo
// con 3 puntos o más; por debajo del cambio mínimo, "estable").
export default function Tendencias({ series, ahora }: { series: SerieTendencia[]; ahora: number }) {
  const [ventana, setVentana] = useState<number>(VENTANA_TENDENCIA_INICIAL_H);
  return (
    <div>
      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", marginBottom: 6 }}>
        {VENTANAS_TENDENCIA_H.map((h) => (
          <button key={h} className={`btn btn-sm ${ventana === h ? "btn-accent" : ""}`} onClick={() => setVentana(h)}>
            {h} h
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
        {series.map((s) => (
          <Grafico key={s.clave} serie={s} ahora={ahora} horas={ventana} />
        ))}
      </div>
    </div>
  );
}

function Grafico({ serie, ahora, horas }: { serie: SerieTendencia; ahora: number; horas: number }) {
  const puntos = recortarVentana(serie.puntos, ahora, horas);
  const ultimo = serie.puntos.length ? serie.puntos.reduce((a, b) => (b.t > a.t ? b : a)) : null;
  const dir = direccionTendencia(puntos, CAMBIO_MINIMO_FLECHA[serie.clave]);
  const edad = edadUltimoDato(serie.puntos, ahora);

  const W = 300;
  const H = 60;
  const pad = 4;
  const desde = ahora - horas * 3_600_000;
  const valores = [...puntos.map((p) => p.valor), serie.banda?.desde, serie.banda?.hasta].filter((v): v is number => v !== undefined);
  const min = valores.length ? Math.min(...valores) : 0;
  const max = valores.length ? Math.max(...valores) : 1;
  const rango = max - min || 1;
  const x = (t: number) => pad + ((t - desde) / (ahora - desde)) * (W - 2 * pad);
  const y = (v: number) => H - pad - ((v - min) / rango) * (H - 2 * pad);
  const banda = serie.banda
    ? { y1: y(Math.min(serie.banda.hasta ?? max, max)), y2: y(Math.max(serie.banda.desde ?? min, min)) }
    : null;

  return (
    <div style={{ border: "1px solid var(--border-soft)", borderRadius: 8, padding: "6px 8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
        <span className="tiny" style={{ fontWeight: 600 }}>
          {serie.etiqueta}
        </span>
        <span className="tiny">
          {ultimo ? (
            <strong>
              {num(ultimo.valor, serie.decimales)} {serie.unidad}
            </strong>
          ) : (
            "—"
          )}
          {dir && <span style={{ marginLeft: 6 }}>{FLECHA[dir]}</span>}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-label={`Tendencia de ${serie.etiqueta}`}>
        {banda && banda.y2 > banda.y1 && <rect x={0} y={banda.y1} width={W} height={banda.y2 - banda.y1} fill="var(--green)" opacity={0.15} />}
        {!serie.sueltos && puntos.length > 1 && (
          <polyline points={puntos.map((p) => `${x(p.t)},${y(p.valor)}`).join(" ")} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
        )}
        {puntos.map((p, i) => (
          <circle key={`${p.t}-${i}`} cx={x(p.t)} cy={y(p.valor)} r={serie.sueltos ? 3 : 2} fill="var(--accent)" />
        ))}
      </svg>
      <div className="tiny muted">
        Último dato: {edadTexto(edad)}
        {puntos.length === 0 && serie.puntos.length > 0 ? ` (fuera de las últimas ${horas} h)` : ""}
      </div>
    </div>
  );
}
