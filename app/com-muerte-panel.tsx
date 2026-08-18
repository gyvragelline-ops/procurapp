"use client";

import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

export default function ComMuertePanel({
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
          categoria: "comMuerte",
          item_key: "realizada",
          estado: v ? "si" : "no",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "donante_id,categoria,item_key" }
      );
    onChange(v);
  }

  return (
    <div className="field-row">
      <span className="field-label">Comunicación de muerte</span>
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
