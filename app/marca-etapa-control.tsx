"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { EstadoEtapa } from "@/lib/procuracion/constants";
import { estadoConMarca, proximaMarca, type MarcaEtapa, type MarcaManual } from "@/lib/procuracion/marca-etapa";
import { guardarMarca } from "@/lib/procuracion/marca-etapa-datos";
import { ErrorVisible, hora } from "./mantenimiento-ui";

const supabase = createClient();

// Botón interno de cada etapa: "Marcar completo / Marcar no completo". La
// marca manual prevalece sobre el cálculo y queda en la línea de tiempo.
export default function MarcaEtapaControl({
  donanteId,
  etapaKey,
  etiqueta,
  calculado,
  marca,
  disponible,
  onChange,
}: {
  donanteId: string;
  etapaKey: string;
  etiqueta: string;
  calculado: EstadoEtapa | undefined;
  marca: MarcaEtapa | undefined;
  disponible: boolean; // false: faltan las columnas en la base (SQL sin aplicar)
  onChange: (marca: MarcaEtapa | null) => void;
}) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ef = estadoConMarca(calculado, marca?.marca);

  async function marcar(m: MarcaManual | null) {
    setError(null);
    setGuardando(true);
    try {
      const r = await guardarMarca(supabase, donanteId, etapaKey, etiqueta, m);
      onChange(m ? { marca: m, en: r.en } : null);
      if (r.avisoTimeline) setError(r.avisoTimeline);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la marca.");
    } finally {
      setGuardando(false);
    }
  }

  if (!disponible) {
    return (
      <div className="tiny muted" style={{ marginBottom: 10 }}>
        Marca manual no disponible todavía (falta aplicar el SQL de etapas_estado).
      </div>
    );
  }

  const siguiente = proximaMarca(ef.estado);
  return (
    <div style={{ marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid var(--border-soft)" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          className={`btn btn-sm ${siguiente === "completo" ? "btn-accent" : ""}`}
          style={{ minHeight: 40 }}
          disabled={guardando}
          onClick={() => marcar(siguiente)}
        >
          {siguiente === "completo" ? "Marcar completo" : "Marcar no completo"}
        </button>
        {marca && (
          <>
            <span className="tiny muted">
              marcado manualmente{marca.en ? ` ${hora(marca.en)}` : ""}
            </span>
            <button
              type="button"
              className="tiny"
              style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 4, textDecoration: "underline" }}
              disabled={guardando}
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
      <ErrorVisible mensaje={error} />
    </div>
  );
}
