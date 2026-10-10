"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { guardarConReintento } from "@/lib/procuracion/guardar";
import { comunicadaEn, validarHoraComunicacion } from "@/lib/procuracion/comunicacion-hora";
import { aInputLocal, fechaHora, momentoActual } from "./mantenimiento-ui";

const supabase = createClient();

// "Realizada / No realizada" de una comunicación (04 muerte, 05 donación)
// con la fecha y hora de la comunicación: precargada con la hora actual,
// editable, nunca futura. Se guarda en documentacion_estado (estado + meta).
export default function ComunicacionRealizada({
  donanteId,
  categoria,
  etiqueta,
  realizada,
  onChange,
  textoLinea,
}: {
  donanteId: string;
  categoria: "comMuerte" | "comDonacion";
  etiqueta: string;
  realizada: boolean;
  onChange: (v: boolean) => void;
  textoLinea?: (hora: string) => string; // si se da, al marcar "Realizada" deja una línea en la línea de tiempo
}) {
  const [horaTexto, setHoraTexto] = useState(() => aInputLocal(new Date(momentoActual()).toISOString()));
  const [guardada, setGuardada] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // La hora ya guardada (si hay) reemplaza la precarga.
  useEffect(() => {
    let vivo = true;
    supabase
      .from("documentacion_estado")
      .select("meta")
      .eq("donante_id", donanteId)
      .eq("categoria", categoria)
      .eq("item_key", "realizada")
      .maybeSingle()
      .then(({ data }) => {
        const c = comunicadaEn((data as { meta: unknown } | null)?.meta);
        if (vivo && c) {
          setGuardada(c);
          setHoraTexto(aInputLocal(c));
        }
      });
    return () => {
      vivo = false;
    };
  }, [donanteId, categoria]);

  async function guardar(v: boolean) {
    setError(null);
    let meta: Record<string, unknown> = {};
    if (v) {
      const h = validarHoraComunicacion(horaTexto ? new Date(horaTexto).toISOString() : null, momentoActual());
      if (!h.ok) return setError(h.error);
      meta = { comunicada_en: h.iso };
    }
    const r = await guardarConReintento(() =>
      supabase
        .from("documentacion_estado")
        .upsert(
          { donante_id: donanteId, categoria, item_key: "realizada", estado: v ? "si" : "no", meta, updated_at: new Date().toISOString() },
          { onConflict: "donante_id,categoria,item_key" }
        )
    );
    if (!r.ok) return setError(r.mensaje);
    setGuardada(v ? (meta.comunicada_en as string) : null);
    if (v && textoLinea) {
      const t = await guardarConReintento(() => supabase.from("timeline_eventos").insert({ donante_id: donanteId, texto: textoLinea(fechaHora(meta.comunicada_en as string)) }));
      // El dato principal ya se guardó; si falla solo la línea de tiempo, se avisa.
      if (!t.ok) setError(`Se guardó, pero no se pudo registrar en la línea de tiempo: ${t.mensaje}`);
    }
    onChange(v);
  }

  const cambio = realizada && guardada !== null && aInputLocal(guardada) !== horaTexto;

  return (
    <>
      <div className="field-row">
        <span className="field-label">{etiqueta}</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button className={`btn btn-sm ${realizada ? "btn-accent" : ""}`} onClick={() => guardar(true)}>
            Realizada
          </button>
          <button className={`btn btn-sm ${!realizada ? "btn-accent" : ""}`} onClick={() => guardar(false)}>
            No realizada
          </button>
        </div>
      </div>
      <div className="field-row">
        <span className="field-label">Fecha y hora de la comunicación</span>
        <input type="datetime-local" className="mini-input" aria-label="Fecha y hora de la comunicación" value={horaTexto} onChange={(e) => setHoraTexto(e.target.value)} />
      </div>
      {cambio && (
        <div className="btn-row" style={{ marginTop: 4 }}>
          <button className="btn btn-sm btn-accent" style={{ minHeight: 44 }} onClick={() => guardar(true)}>
            Guardar hora
          </button>
        </div>
      )}
      {realizada && guardada && !cambio && <div className="tiny muted">Comunicada {fechaHora(guardada)}</div>}
      {error && (
        <div className="tiny" style={{ color: "var(--red)", marginTop: 4, marginBottom: 4 }}>
          {error}
        </div>
      )}
    </>
  );
}
