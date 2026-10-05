"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { guardarConReintento } from "@/lib/procuracion/guardar";

const supabase = createClient();

export default function ComDonacionRealizada({
  donanteId,
  realizada,
  onChange,
}: {
  donanteId: string;
  realizada: boolean;
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
            categoria: "comDonacion",
            item_key: "realizada",
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
      const t = await guardarConReintento(() =>
        supabase.from("timeline_eventos").insert({
          donante_id: donanteId,
          texto: `Comunicación de donación — marcada como realizada (${hora})`,
        })
      );
      // El dato principal ya se guardó; si falla solo el registro en la
      // línea de tiempo, se avisa en vez de perderlo en silencio.
      if (!t.ok) setError(`Se marcó como realizada, pero no se pudo registrar en la línea de tiempo: ${t.mensaje}`);
    }
    onChange(v);
  }

  return (
    <>
      <div className="field-row">
        <span className="field-label">Comunicación de donación</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button className={`btn btn-sm ${realizada ? "btn-accent" : ""}`} onClick={() => marcar(true)}>
            Realizada
          </button>
          <button className={`btn btn-sm ${!realizada ? "btn-accent" : ""}`} onClick={() => marcar(false)}>
            No realizada
          </button>
        </div>
      </div>
      {error && (
        <div className="tiny" style={{ color: "var(--red)", marginTop: -4, marginBottom: 4 }}>
          {error}
        </div>
      )}
    </>
  );
}
