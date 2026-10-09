"use client";

import type { Color } from "@/lib/procuracion/mantenimiento-calculos";
import { enEje, type ValorHora } from "@/lib/procuracion/mantenimiento-tendencias";
import { EJE_Y, type ClaveTendencia } from "@/lib/procuracion/mantenimiento-metas";

// Gráficos de la vista del médico. Sin librería: banda de meta + curva +
// punto. Eje Y FIJO por parámetro (EJE_Y). Horas sin dato = hueco (la
// curva se corta; no se interpola ni se inventa).

export const COLOR_GRAFICO: Record<Color, string> = {
  verde: "var(--m-ok)",
  amarillo: "var(--m-fuera)",
  rojo: "var(--m-critico)",
  sin_dato: "var(--m-apagado)",
};

// Ancho de referencia del viewBox: ~el ancho real de la tarjeta en un
// celular de 390 px (160 en la grilla de 2 columnas, 340 en las anchas),
// para que los puntos no se deformen.
// Eje X = TIEMPO de la ventana elegida [desde, hasta] (no la cantidad de
// puntos): cada valor va en su hora real. El SVG ocupa todo el ancho de la
// tarjeta (width 100% + viewBox + preserveAspectRatio none; la línea con
// non-scaling-stroke). 1 dato: un punto, sin línea.
export function Sparkline({
  valores,
  clave,
  banda,
  color,
  desde,
  hasta,
  alto = 44,
  ancho: W = 160,
  etiqueta,
}: {
  valores: ValorHora[];
  clave: ClaveTendencia;
  banda: { desde: number; hasta: number } | null;
  color: string;
  desde: number;
  hasta: number;
  alto?: number;
  ancho?: number;
  etiqueta: string;
}) {
  const eje = EJE_Y[clave];
  const pad = 4;
  const tiempo = (i: number) => valores[i].t ?? valores[i].inicio;
  const x = (i: number) => pad + Math.min(1, Math.max(0, (tiempo(i) - desde) / Math.max(1, hasta - desde))) * (W - 2 * pad);
  const y = (v: number) => alto - pad - ((enEje(v, clave).valor - eje.min) / (eje.max - eje.min)) * (alto - 2 * pad);

  // Tramos consecutivos con dato (un hueco corta la curva).
  const tramos: { i: number; v: number }[][] = [];
  let actual: { i: number; v: number }[] = [];
  valores.forEach((p, i) => {
    if (p.valor === null) {
      if (actual.length) tramos.push(actual);
      actual = [];
    } else actual.push({ i, v: p.valor });
  });
  if (actual.length) tramos.push(actual);
  const ultimo = [...valores.entries()].reverse().find(([, p]) => p.valor !== null);

  return (
    <svg
      viewBox={`0 0 ${W} ${alto}`}
      width="100%"
      height={alto}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Tendencia de ${etiqueta}`}
      style={{ display: "block", width: "100%" }}
    >
      {banda && <rect x={0} y={y(banda.hasta)} width={W} height={Math.max(0, y(banda.desde) - y(banda.hasta))} fill="var(--m-ok)" opacity={0.16} />}
      {tramos.map((t, k) =>
        t.length === 1 ? (
          <circle key={k} cx={x(t[0].i)} cy={y(t[0].v)} r={2} fill={color} />
        ) : (
          <polyline
            key={k}
            points={t.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")}
            fill="none"
            stroke={color}
            strokeWidth={1.8}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )
      )}
      {ultimo && <circle cx={x(ultimo[0])} cy={y(ultimo[1].valor!)} r={3} fill={color} />}
    </svg>
  );
}

export function BarrasHora({
  barras,
  clave,
  meta,
  alto = 80,
  ancho: W = 340,
}: {
  barras: (ValorHora & { color: Color })[];
  clave: ClaveTendencia;
  meta: number;
  alto?: number;
  ancho?: number;
}) {
  const eje = EJE_Y[clave];
  const n = barras.length;
  const hueco = 2;
  const ancho = n ? W / n : W;
  const y = (v: number) => alto - ((enEje(v, clave).valor - eje.min) / (eje.max - eje.min)) * alto;
  return (
    <svg
      viewBox={`0 0 ${W} ${alto}`}
      width="100%"
      height={alto}
      preserveAspectRatio="none"
      role="img"
      aria-label="Ritmo diurético por hora"
      style={{ display: "block", width: "100%" }}
    >
      {barras.map((b, i) =>
        b.valor === null ? (
          <rect key={i} x={i * ancho + hueco / 2} y={alto - 1} width={Math.max(0.5, ancho - hueco)} height={1} fill="var(--m-borde)" />
        ) : (
          <rect key={i} x={i * ancho + hueco / 2} y={y(b.valor)} width={Math.max(0.5, ancho - hueco)} height={alto - y(b.valor)} fill={COLOR_GRAFICO[b.color]} rx={1} />
        )
      )}
      <line x1={0} x2={W} y1={y(meta)} y2={y(meta)} stroke="var(--m-texto)" strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" opacity={0.7} />
    </svg>
  );
}
