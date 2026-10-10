"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { EstadoEtapa } from "@/lib/procuracion/constants";
import { estadoConMarca, proximaMarca, type MarcaEtapa as Marca, type MarcaManual } from "@/lib/procuracion/marca-etapa";
import { guardarMarca } from "@/lib/procuracion/marca-etapa-datos";
import { ErrorVisible, hora } from "./mantenimiento-ui";

// Marca manual de una etapa: "Marcar completo / Marcar no completo". La
// renderiza SOLO el contenedor común de etapas (EtapaFila), al final de
// cada etapa, así toda etapa (también una nueva) la tiene. La marca
// prevalece sobre el cálculo y queda en la línea de tiempo.
export default function MarcaEtapa({
  donanteId,
  etapaId,
  etiqueta,
  calculado,
  marca,
  disponible,
  onChange,
}: {
  donanteId: string;
  etapaId: string;
  etiqueta: string;
  calculado: EstadoEtapa | undefined;
  marca: Marca | undefined;
  disponible: boolean; // false: faltan las columnas en la base (SQL sin aplicar)
  onChange: (marca: Marca | null) => void;
}) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ef = estadoConMarca(calculado, marca?.marca);
  const siguiente = proximaMarca(ef.estado);

  async function marcar(m: MarcaManual | null) {
    setError(null);
    setGuardando(true);
    try {
      const r = await guardarMarca(createClient(), donanteId, etapaId, etiqueta, m);
      onChange(m ? { marca: m, en: r.en } : null);
      if (r.avisoTimeline) setError(r.avisoTimeline);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la marca.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div data-marca-etapa={etapaId} style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--border-soft)" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          className={`btn btn-sm ${siguiente === "completo" ? "btn-accent" : ""}`}
          style={{ minHeight: 40 }}
          disabled={guardando || !disponible}
          onClick={() => marcar(siguiente)}
        >
          {siguiente === "completo" ? "Marcar completo" : "Marcar no completo"}
        </button>
        {marca && (
          <>
            <span className="tiny muted">marcado manualmente{marca.en ? ` ${hora(marca.en)}` : ""}</span>
            <button
              type="button"
              className="tiny"
              style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 4, textDecoration: "underline" }}
              disabled={guardando || !disponible}
              onClick={() => marcar(null)}
            >
              quitar marca
            </button>
          </>
        )}
      </div>
      {ef.faltanDatos && (
        <div className="tiny" style={{ marginTop: 6, color: "var(--text-faint)" }}>
          Marcada completa; el sistema ve datos faltantes.
        </div>
      )}
      {!disponible && (
        <div className="tiny" style={{ marginTop: 6, color: "var(--text-faint)" }}>
          Marca manual no disponible todavía: falta aplicar el SQL de etapas_estado.
        </div>
      )}
      <ErrorVisible mensaje={error} />
    </div>
  );
}
