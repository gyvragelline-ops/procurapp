"use client";

import { createClient } from "@/lib/supabase/client";

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
  async function marcar(v: boolean) {
    await supabase
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
      );
    if (v) {
      const hora = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
      await supabase.from("timeline_eventos").insert({
        donante_id: donanteId,
        texto: `Medidas antropométricas — marcadas como completas (${hora})`,
      });
    }
    onChange(v);
  }

  return (
    <div className="field-row" style={{ marginTop: 10 }}>
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
  );
}
