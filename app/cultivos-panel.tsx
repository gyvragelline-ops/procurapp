"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { anularCultivo, crearCultivo, guardarResultadoCultivo } from "@/lib/procuracion/cultivos";
import {
  MAX_GERMEN,
  MAX_SENSIBILIDAD,
  MAX_TIPO_OTRO,
  TIPOS_CULTIVO,
  etiquetaCultivo,
  validarAlta,
  validarResultado,
  type Cultivo,
  type EstadoCultivo,
  type TipoCultivo,
} from "@/lib/procuracion/cultivos-calculos";
import { Confirmacion, ErrorVisible, aInputLocal, fechaHora, hora, momentoActual } from "./mantenimiento-ui";

const supabase = createClient();

// Etapa Cultivos: alta rápida (tipo + hora de toma), resultado sobre el
// mismo registro (negativo / positivo con germen y sensibilidad), y
// anulación. Corregir un resultado deja la marca "corregido HH:MM".
export default function CultivosPanel({
  donanteId,
  cultivos,
  onChange,
}: {
  donanteId: string;
  cultivos: Cultivo[];
  onChange: (c: Cultivo[]) => void;
}) {
  // Reloj propio (cada minuto) para las horas de los pendientes.
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const [alta, setAlta] = useState(false);
  const [tipo, setTipo] = useState<TipoCultivo | null>(null);
  const [tipoOtro, setTipoOtro] = useState("");
  const [tomaTexto, setTomaTexto] = useState("");
  const [resultadoDe, setResultadoDe] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoCultivo | null>(null);
  const [germen, setGermen] = useState("");
  const [sensibilidad, setSensibilidad] = useState("");
  const [resultadoTexto, setResultadoTexto] = useState("");
  const [anulandoId, setAnulandoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vigentes = cultivos.filter((c) => !c.anulado).sort((a, b) => b.tomado_en.localeCompare(a.tomado_en));
  const anulados = cultivos.filter((c) => c.anulado);

  function abrirAlta() {
    setTipo(null);
    setTipoOtro("");
    setTomaTexto(aInputLocal(new Date(momentoActual()).toISOString()));
    setError(null);
    setAlta(true);
  }

  async function guardarAlta() {
    setError(null);
    const v = validarAlta({ tipo, tipoOtro, tomadoEnIso: tomaTexto ? new Date(tomaTexto).toISOString() : null }, momentoActual());
    if (!v.ok) return setError(v.error);
    setGuardando(true);
    try {
      const nuevo = await crearCultivo(supabase, donanteId, v.datos);
      onChange([nuevo, ...cultivos]);
      setAlta(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el cultivo.");
    } finally {
      setGuardando(false);
    }
  }

  function abrirResultado(c: Cultivo) {
    setResultadoDe(c.id);
    setEstado(c.estado === "pendiente" ? null : c.estado);
    setGermen(c.germen ?? "");
    setSensibilidad(c.sensibilidad ?? "");
    setResultadoTexto(aInputLocal(c.resultado_en ?? new Date(momentoActual()).toISOString()));
    setError(null);
  }

  async function guardarResultado(c: Cultivo) {
    setError(null);
    const v = validarResultado(
      c,
      { estado, germen, sensibilidad, resultadoEnIso: resultadoTexto ? new Date(resultadoTexto).toISOString() : null },
      momentoActual()
    );
    if (!v.ok) return setError(v.error);
    setGuardando(true);
    try {
      const actualizado = await guardarResultadoCultivo(supabase, c.id, v.cambios);
      onChange(cultivos.map((x) => (x.id === c.id ? actualizado : x)));
      setResultadoDe(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el resultado.");
    } finally {
      setGuardando(false);
    }
  }

  async function anular(id: string) {
    setError(null);
    setGuardando(true);
    try {
      await anularCultivo(supabase, id);
      onChange(cultivos.map((x) => (x.id === id ? { ...x, anulado: true } : x)));
      setAnulandoId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo anular.");
    } finally {
      setGuardando(false);
    }
  }

  const horasDesde = (iso: string) => Math.floor((ahora - new Date(iso).getTime()) / 3_600_000);

  return (
    <div>
      <ErrorVisible mensaje={error} />

      {!alta ? (
        <button className="btn btn-accent" style={{ minHeight: 44 }} onClick={abrirAlta}>
          Cargar cultivo
        </button>
      ) : (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, marginBottom: 10 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
            {TIPOS_CULTIVO.map((t) => (
              <button key={t.valor} className={`btn btn-sm ${tipo === t.valor ? "btn-accent" : ""}`} style={{ minHeight: 44 }} onClick={() => setTipo(t.valor)}>
                {t.etiqueta}
              </button>
            ))}
          </div>
          {tipo === "otro" && (
            <div className="field-row">
              <span className="field-label">¿Cuál?</span>
              <input className="mini-input" maxLength={MAX_TIPO_OTRO} style={{ width: 180 }} value={tipoOtro} onChange={(e) => setTipoOtro(e.target.value)} />
            </div>
          )}
          <div className="field-row">
            <span className="field-label">Fecha y hora de toma</span>
            <input type="datetime-local" className="mini-input" value={tomaTexto} onChange={(e) => setTomaTexto(e.target.value)} />
          </div>
          <div className="btn-row" style={{ marginTop: 6 }}>
            <button className="btn btn-sm btn-accent" disabled={guardando} onClick={guardarAlta}>
              {guardando ? "Guardando…" : "Guardar (pendiente)"}
            </button>
            <button className="btn btn-sm" disabled={guardando} onClick={() => setAlta(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {vigentes.length === 0 && !alta && <div className="tiny muted" style={{ marginTop: 8 }}>Sin cultivos cargados.</div>}
      {vigentes.map((c) => (
        <div key={c.id} style={{ borderBottom: "1px solid var(--border-soft)", padding: "8px 0" }}>
          <div className="field-row">
            <span className="field-label">
              <strong>{etiquetaCultivo(c)}</strong>
              <span className="tiny muted" style={{ display: "block" }}>
                Toma {fechaHora(c.tomado_en)}
              </span>
            </span>
            <span className="field-value" style={{ textAlign: "right" }}>
              {c.estado === "pendiente" ? (
                <span className="chip chip-amber">Pendiente · {horasDesde(c.tomado_en) < 1 ? "menos de 1 h" : `${horasDesde(c.tomado_en)} h`}</span>
              ) : c.estado === "negativo" ? (
                <span className="chip chip-green">✓ Negativo</span>
              ) : (
                <span className="chip chip-red">✕ Positivo</span>
              )}
            </span>
          </div>
          {c.estado === "positivo" && (
            <div className="tiny" style={{ marginTop: 2 }}>
              <strong>{c.germen}</strong>
              {c.sensibilidad ? <span style={{ display: "block", whiteSpace: "pre-wrap" }}>Sensibilidad: {c.sensibilidad}</span> : null}
            </div>
          )}
          {c.resultado_en && (
            <div className="tiny muted">
              Resultado {fechaHora(c.resultado_en)}
              {c.modificado_en ? ` · corregido ${hora(c.modificado_en)}` : ""}
            </div>
          )}

          {resultadoDe === c.id ? (
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, marginTop: 6 }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <button className={`btn btn-sm ${estado === "negativo" ? "btn-accent" : ""}`} style={{ minHeight: 44 }} onClick={() => setEstado("negativo")}>
                  Negativo
                </button>
                <button className={`btn btn-sm ${estado === "positivo" ? "btn-accent" : ""}`} style={{ minHeight: 44 }} onClick={() => setEstado("positivo")}>
                  Positivo
                </button>
              </div>
              {estado === "positivo" && (
                <>
                  <div className="field-row">
                    <span className="field-label">Germen</span>
                    <input className="mini-input" maxLength={MAX_GERMEN} style={{ width: 200 }} value={germen} onChange={(e) => setGermen(e.target.value)} />
                  </div>
                  <div className="field-row" style={{ alignItems: "flex-start" }}>
                    <span className="field-label">Sensibilidad (opcional)</span>
                    <textarea
                      className="mini-input"
                      maxLength={MAX_SENSIBILIDAD}
                      rows={3}
                      style={{ width: 200 }}
                      value={sensibilidad}
                      onChange={(e) => setSensibilidad(e.target.value)}
                    />
                  </div>
                </>
              )}
              <div className="field-row">
                <span className="field-label">Fecha y hora del resultado</span>
                <input type="datetime-local" className="mini-input" value={resultadoTexto} onChange={(e) => setResultadoTexto(e.target.value)} />
              </div>
              <div className="btn-row" style={{ marginTop: 6 }}>
                <button className="btn btn-sm btn-accent" disabled={guardando} onClick={() => guardarResultado(c)}>
                  {guardando ? "Guardando…" : "Guardar resultado"}
                </button>
                <button className="btn btn-sm" disabled={guardando} onClick={() => setResultadoDe(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : anulandoId === c.id ? (
            <Confirmacion
              texto="¿Anular este cultivo? Va a quedar tachado y no cuenta. Si fue un error de carga, volvé a cargarlo."
              textoSi="Sí, anular"
              ocupado={guardando}
              onSi={() => anular(c.id)}
              onNo={() => setAnulandoId(null)}
            />
          ) : (
            <div className="btn-row" style={{ marginTop: 6 }}>
              <button className="btn btn-sm" style={{ minHeight: 44 }} onClick={() => abrirResultado(c)}>
                {c.estado === "pendiente" ? "Cargar resultado" : "Corregir resultado"}
              </button>
              <button className="btn btn-sm" style={{ minHeight: 44 }} onClick={() => setAnulandoId(c.id)}>
                Anular
              </button>
            </div>
          )}
        </div>
      ))}

      {anulados.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary className="tiny">Anulados ({anulados.length})</summary>
          {anulados.map((c) => (
            <div key={c.id} className="tiny muted" style={{ textDecoration: "line-through" }}>
              {etiquetaCultivo(c)} · toma {fechaHora(c.tomado_en)}
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
