"use client";

import type { ReactNode } from "react";
import { chipClass, stageLabel, type EstadoEtapa } from "@/lib/procuracion/constants";
import { estadoConMarca, type MarcaEtapa as Marca } from "@/lib/procuracion/marca-etapa";
import MarcaEtapa from "./marca-etapa";

// Contenedor común de TODAS las etapas de la línea de tiempo: encabezado
// (número, nombre, estado) y, abierta, el contenido propio de la etapa
// seguido SIEMPRE de la marca manual, al final. Una etapa nueva la hereda
// sola: no hace falta tocar nada por etapa.
export default function EtapaFila({
  etapa,
  numero,
  donanteId,
  calculado,
  marca,
  marcasDisponibles,
  abierta,
  onAlternar,
  onMarca,
  children,
}: {
  etapa: { key: string; label: string };
  numero: number;
  donanteId: string;
  calculado: EstadoEtapa | undefined;
  marca: Marca | undefined;
  marcasDisponibles: boolean;
  abierta: boolean;
  onAlternar: () => void;
  onMarca: (marca: Marca | null) => void;
  children?: ReactNode;
}) {
  const st = marca ? estadoConMarca(calculado, marca.marca).estado : calculado;
  const num = numero < 10 ? `0${numero}` : String(numero);
  return (
    <div id={`etapa-${etapa.key}`}>
      <div
        className={`stage-item ${st === "green" ? "done" : ""} ${st === "amber" || st === "red" ? "attn" : ""} ${abierta ? "open" : ""}`}
        onClick={onAlternar}
      >
        <div className="stage-num">{num}</div>
        <div className="stage-name">{etapa.label}</div>
        <span className={`chip ${chipClass(st)}`}>{stageLabel(st)}</span>
      </div>
      {abierta && (
        <div className="stage-panel">
          {children}
          <MarcaEtapa
            donanteId={donanteId}
            etapaId={etapa.key}
            etiqueta={etapa.label}
            calculado={calculado}
            marca={marca}
            disponible={marcasDisponibles}
            onChange={onMarca}
          />
        </div>
      )}
    </div>
  );
}
