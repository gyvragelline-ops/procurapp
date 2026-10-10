"use client";

import { dotClass, stageLabel, type EstadoEtapa } from "@/lib/procuracion/constants";
import { primeraNoCompleta } from "@/lib/procuracion/marca-etapa";

// Franja de luces: una por etapa, numeradas como la lista, en UNA sola
// línea (si no entran se achican; sin salto ni scroll). Tocar una abre
// esa etapa; la primera no completa lleva un anillo.
export default function FranjaEtapas({
  etapas,
  estadoDe,
  onIr,
}: {
  etapas: { key: string; label: string }[];
  estadoDe: (key: string) => EstadoEtapa | undefined;
  onIr: (key: string) => void;
}) {
  const anillo = primeraNoCompleta(etapas.map((s) => s.key), estadoDe);
  return (
    <div className="status-strip" role="navigation" aria-label="Etapas">
      {etapas.map((s, idx) => {
        const st = estadoDe(s.key);
        return (
          <button
            type="button"
            key={s.key}
            className={`status-luz ${dotClass(st)} ${anillo === s.key ? "status-luz-anillo" : ""}`}
            title={`${idx + 1}. ${s.label} — ${stageLabel(st)}`}
            aria-label={`${idx + 1}. ${s.label}: ${stageLabel(st)}`}
            onClick={() => onIr(s.key)}
          >
            {idx + 1}
          </button>
        );
      })}
    </div>
  );
}
