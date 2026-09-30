"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { guardarConReintento } from "@/lib/procuracion/guardar";

const supabase = createClient();

// Mismo patrón que LabImagenesCompleto/ComDonacionRealizada: decisión
// manual del procurador, sin criterio automático.
export default function MedidasCompleto({
  donanteId,
  completo,
  onChange,
}: {
  donanteId: string;
  completo: boolean;
  onChange: (v: boolean) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  async function marcar(v: boolean) {
    const r = await guardarConReintento(() =>
      supabase
        .from("documentacion_estado")
        .upsert(
          {
            donante_id: donanteId,
            categoria: "medidas",
            item_key: "completo",
            estado: v ? "si" : "no",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "donante_id,categoria,item_key" }
        )
    );
    if (!r.ok) return setError(r.mensaje);
    setError(null);
    if (v) {
      const hora = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
      await guardarConReintento(() =>
        supabase.from("timeline_eventos").insert({
          donante_id: donanteId,
          texto: `Medidas antropométricas — marcadas como completas (${hora})`,
        })
      );
    }
    onChange(v);
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div className="field-row">
        <span className="field-label">Medidas antropométricas</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button className={`btn btn-sm ${completo ? "btn-accent" : ""}`} onClick={() => marcar(true)}>
            Marcar como completo
          </button>
          <button className={`btn btn-sm ${!completo ? "btn-accent" : ""}`} onClick={() => marcar(false)}>
            Marcar como pendiente
          </button>
        </div>
      </div>
      {error && (
        <div className="tiny" style={{ color: "var(--red)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
