"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ETAPAS_EMOCIONALES,
  HERRAMIENTAS_TRANSVERSALES,
  type AnalisisComunicacion,
  type RegistroComunicacion,
} from "@/lib/procuracion/comunicacion-donacion";

const supabase = createClient();

export default function ComDonacionPanel({ donanteId }: { donanteId: string }) {
  const [openEtapa, setOpenEtapa] = useState<number | null>(null);
  const [texto, setTexto] = useState("");
  const [analizando, setAnalizando] = useState(false);
  const [resultado, setResultado] = useState<AnalisisComunicacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historial, setHistorial] = useState<RegistroComunicacion[] | null>(null);

  async function cargarHistorial() {
    const { data } = await supabase
      .from("comunicacion_donacion_analisis")
      .select("id, texto, etapa_detectada, frases_sugeridas, created_at")
      .eq("donante_id", donanteId)
      .order("created_at", { ascending: false })
      .limit(10);
    setHistorial((data as RegistroComunicacion[]) ?? []);
  }

  useEffect(() => {
    cargarHistorial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [donanteId]);

  async function analizar() {
    if (!texto.trim()) return;
    setAnalizando(true);
    setError(null);
    setResultado(null);
    try {
      const res = await fetch("/api/analizar-comunicacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al analizar.");
        return;
      }
      setResultado(data);

      await supabase.from("comunicacion_donacion_analisis").insert({
        donante_id: donanteId,
        texto,
        etapa_detectada: data.etapa,
        frases_sugeridas: data.frases_sugeridas,
      });
      const etapaNombre = ETAPAS_EMOCIONALES.find((e) => e.id === data.etapa)?.nombre ?? `Etapa ${data.etapa}`;
      await supabase.from("timeline_eventos").insert({
        donante_id: donanteId,
        texto: `Comunicación de donación — etapa detectada: ${etapaNombre}`,
      });

      setTexto("");
      cargarHistorial();
    } finally {
      setAnalizando(false);
    }
  }

  return (
    <>
      <div className="tiny" style={{ marginBottom: 8, textTransform: "uppercase", letterSpacing: ".5px" }}>
        Etapas emocionales de la familia
      </div>
      {ETAPAS_EMOCIONALES.map((e) => {
        const open = openEtapa === e.id;
        const destacada = resultado?.etapa === e.id;
        return (
          <div key={e.id} style={{ marginBottom: 4 }}>
            <div
              className="check-row"
              style={{
                cursor: "pointer",
                background: destacada ? "var(--accent-dim)" : undefined,
                borderRadius: 8,
                paddingLeft: 6,
                paddingRight: 6,
              }}
              onClick={() => setOpenEtapa(open ? null : e.id)}
            >
              <span>
                {e.id}. {e.nombre} {open ? "▾" : "▸"}
              </span>
              {destacada && <span className="chip chip-green">Detectada</span>}
            </div>
            {open && (
              <div style={{ padding: "4px 6px 8px" }}>
                <div className="tiny" style={{ marginBottom: 6 }}>
                  {e.descripcion}
                </div>
                <div className="tiny" style={{ fontStyle: "italic" }}>
                  {e.ejemplos.map((ej) => `"${ej}"`).join(" · ")}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border-soft)" }}>
        <div className="tiny" style={{ marginBottom: 8, textTransform: "uppercase", letterSpacing: ".5px" }}>
          Herramientas transversales (aplican en cualquier etapa)
        </div>
        <div className="tiny">{HERRAMIENTAS_TRANSVERSALES.join(" · ")}</div>
      </div>

      <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border-soft)" }}>
        <div className="tiny" style={{ marginBottom: 6, textTransform: "uppercase", letterSpacing: ".5px" }}>
          Analizar lo que dice/hace la familia
        </div>
        <textarea
          value={texto}
          onChange={(ev) => setTexto(ev.target.value)}
          placeholder="Escribí o pegá lo que la familia está diciendo…"
          rows={3}
          style={{
            width: "100%",
            background: "var(--bg-elev-3)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 8,
            color: "var(--text)",
            fontSize: "12.5px",
            fontFamily: "inherit",
            resize: "vertical",
          }}
        />
        <button
          className="btn btn-accent btn-sm"
          style={{ marginTop: 6 }}
          disabled={analizando || !texto.trim()}
          onClick={analizar}
        >
          {analizando ? "Analizando…" : "Analizar"}
        </button>

        {error && (
          <div className="tiny" style={{ color: "var(--red)", marginTop: 6 }}>
            {error}
          </div>
        )}

        {resultado && (
          <div className="stage-panel" style={{ marginTop: 8 }}>
            <div className="field-row">
              <span className="field-label">Etapa detectada</span>
              <span className="field-value">
                {resultado.etapa}. {ETAPAS_EMOCIONALES.find((e) => e.id === resultado.etapa)?.nombre}
              </span>
            </div>
            <div className="tiny" style={{ marginTop: 8, marginBottom: 4, textTransform: "uppercase", letterSpacing: ".5px" }}>
              Frases sugeridas
            </div>
            {resultado.frases_sugeridas.map((f, i) => (
              <div key={i} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: "13px" }}>&ldquo;{f.frase}&rdquo;</div>
                <div className="tiny" style={{ opacity: 0.65 }}>[{f.herramienta}]</div>
              </div>
            ))}
            {resultado.etapa === 4 && (
              <div className="tiny" style={{ marginTop: 8, opacity: 0.65, fontStyle: "italic" }}>
                Ya falta poco para poder hablar de donación.
              </div>
            )}
          </div>
        )}
      </div>

      {historial && historial.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border-soft)" }}>
          <div className="tiny" style={{ marginBottom: 6, textTransform: "uppercase", letterSpacing: ".5px" }}>
            Historial
          </div>
          {historial.map((r) => (
            <div className="field-row" key={r.id}>
              <span className="field-label" style={{ maxWidth: "60%" }}>
                {new Date(r.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} —{" "}
                {r.texto.length > 40 ? r.texto.slice(0, 40) + "…" : r.texto}
              </span>
              <span className="field-value">{r.etapa_detectada != null ? `Etapa ${r.etapa_detectada}` : "—"}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
