"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DOCUMENTOS, generarDocumentoPdf, descargarPdf } from "@/lib/procuracion/documentos-pdf";
import type { Donante, Familiar } from "@/lib/procuracion/types";

const supabase = createClient();

export default function DocumentosPanel({ donante, familiar }: { donante: Donante; familiar: Familiar | null }) {
  const [generando, setGenerando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDescargar(key: string) {
    const doc = DOCUMENTOS.find((d) => d.key === key);
    if (!doc || !doc.archivo) return;
    setError(null);
    setGenerando(key);
    try {
      const bytes = await generarDocumentoPdf(supabase, doc, donante, familiar);
      descargarPdf(bytes, `${doc.key}_${donante.nombre_completo ?? donante.id}.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el PDF.");
    } finally {
      setGenerando(null);
    }
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--border-soft)" }}>
      <div className="section-label" style={{ marginTop: 0 }}>
        Acceso a formularios
      </div>
      {error && (
        <div className="tiny" style={{ color: "var(--red)", marginBottom: 8 }}>
          {error}
        </div>
      )}
      {DOCUMENTOS.map((doc) => (
        <div className="field-row" key={doc.key}>
          <span className="field-label" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span>{doc.nombre}</span>
            <span className="tiny">{doc.fuente}</span>
          </span>
          {doc.archivo ? (
            <button className="chip chip-gray" style={{ border: "none", cursor: "pointer" }} disabled={generando === doc.key} onClick={() => handleDescargar(doc.key)}>
              {generando === doc.key ? "Generando…" : "Descargar"}
            </button>
          ) : (
            <span className="chip chip-amber">Falta plantilla</span>
          )}
        </div>
      ))}
      <div className="tiny" style={{ marginTop: 8 }}>
        Se completa con lo que ya esté cargado en otros paneles — el resto queda en blanco para cargar a mano.
      </div>
    </div>
  );
}
