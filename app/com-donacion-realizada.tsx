"use client";

import { createClient } from "@/lib/supabase/client";

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
  async function marcar(v: boolean) {
    await supabase
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
      );
    if (v) {
      const hora = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
      await supabase.from("timeline_eventos").insert({
        donante_id: donanteId,
        texto: `Comunicación de donación — marcada como realizada (${hora})`,
      });
    }
    onChange(v);
  }

  return (
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
  );
}
