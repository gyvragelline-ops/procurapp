"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  GRUPOS_LAB,
  MAX_TEXTO_LAB,
  PARAMETROS_LAB_MANTENIMIENTO,
  anularValorLaboratorio,
  guardarTomaLaboratorio,
  type ValorLaboratorio,
} from "@/lib/procuracion/laboratorio-valores";
import { camposFueraDeRango } from "@/lib/procuracion/mantenimiento-calculos";
import { Confirmacion, ErrorVisible, aInputLocal, aNumero, esFutura, fechaHora, num } from "./mantenimiento-ui";

const supabase = createClient();

// Laboratorio de Mantenimiento (tipeado): una extracción (misma hora,
// mismo toma_id) con los valores que se carguen, por grupos. La unidad va
// siempre con el valor; troponina y CPK-MB la eligen al cargar. El
// sedimento urinario es texto libre corto, fuera de las reglas. La FiO2
// de la PaFi sale del respirador (no se pide acá).
export default function MantenimientoLaboratorio({
  donanteId,
  valores,
  onValoresChange,
}: {
  donanteId: string;
  valores: ValorLaboratorio[];
  onValoresChange: (v: ValorLaboratorio[]) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [horaTexto, setHoraTexto] = useState("");
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [unidades, setUnidades] = useState<Record<string, string>>({});
  const [pendiente, setPendiente] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anulandoId, setAnulandoId] = useState<string | null>(null);

  function abrir() {
    setHoraTexto(aInputLocal(new Date().toISOString()));
    setTextos({});
    setUnidades({});
    setPendiente(null);
    setError(null);
    setAbierto(true);
  }

  async function guardar(confirmado = false) {
    setError(null);
    if (!horaTexto) return setError("Falta la hora de la extracción.");
    const iso = new Date(horaTexto).toISOString();
    if (esFutura(iso)) return setError("La hora no puede ser futura.");

    const items: { parametro: string; valor: number | null; unidad: string | null; valor_texto?: string | null }[] = [];
    for (const g of GRUPOS_LAB) {
      for (const p of g.parametros) {
        const texto = (textos[p.parametro] ?? "").trim();
        if (texto === "") continue;
        if (p.texto) {
          items.push({ parametro: p.parametro, valor: null, unidad: null, valor_texto: texto.slice(0, MAX_TEXTO_LAB) });
          continue;
        }
        const n = aNumero(texto);
        if (n === null || Number.isNaN(n)) return setError(`Valor inválido en ${p.etiqueta}.`);
        const unidad = p.unidades ? unidades[p.parametro] ?? null : p.unidad;
        if (p.unidades && !unidad) return setError(`Elegí la unidad de ${p.etiqueta}.`);
        items.push({ parametro: p.parametro, valor: n, unidad });
      }
    }
    if (items.length === 0) return setError("Cargá al menos un valor de laboratorio.");

    const fuera = camposFueraDeRango(Object.fromEntries(items.filter((i) => i.valor !== null).map((i) => [i.parametro, i.valor])));
    if (fuera.length > 0 && !confirmado) {
      return setPendiente(
        `¿Seguro? Fuera del rango esperable: ${fuera.map((f) => `${etiqueta(f.campo)} ${num(f.valor)} (${num(f.min)}-${num(f.max)})`).join("; ")}.`
      );
    }

    setGuardando(true);
    try {
      const nuevos = await guardarTomaLaboratorio(supabase, donanteId, iso, items);
      onValoresChange([...nuevos, ...valores]);
      setAbierto(false);
      setPendiente(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el laboratorio.");
    } finally {
      setGuardando(false);
    }
  }

  // "Corregir" (glucemia): un toque anula el valor y abre uno nuevo con el
  // valor y la hora anteriores para editar.
  async function corregir(v: ValorLaboratorio) {
    setError(null);
    setGuardando(true);
    try {
      await anularValorLaboratorio(supabase, v.id);
      onValoresChange(valores.map((x) => (x.id === v.id ? { ...x, anulado: true } : x)));
      setHoraTexto(aInputLocal(v.medido_en));
      setTextos({ [v.parametro]: String(v.valor ?? "").replace(".", ",") });
      setUnidades({});
      setPendiente(null);
      setAbierto(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo anular el valor.");
    } finally {
      setGuardando(false);
    }
  }

  async function anular(id: string) {
    setError(null);
    setGuardando(true);
    try {
      await anularValorLaboratorio(supabase, id);
      onValoresChange(valores.map((v) => (v.id === id ? { ...v, anulado: true } : v)));
      setAnulandoId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo anular el valor.");
    } finally {
      setGuardando(false);
    }
  }

  // Últimas extracciones, agrupadas por toma.
  const tomas = new Map<string, ValorLaboratorio[]>();
  for (const v of [...valores].sort((a, b) => b.medido_en.localeCompare(a.medido_en))) {
    tomas.set(v.toma_id, [...(tomas.get(v.toma_id) ?? []), v]);
  }
  function etiqueta(p: string) {
    return PARAMETROS_LAB_MANTENIMIENTO.find((x) => x.parametro === p)?.etiqueta ?? p;
  }
  const textoValor = (v: ValorLaboratorio) => (v.valor === null ? v.valor_texto ?? "" : `${num(v.valor)}${v.unidad ? ` ${v.unidad}` : ""}`);

  return (
    <div>
      <ErrorVisible mensaje={error} />
      {!abierto && (
        <button className="btn btn-sm btn-accent" onClick={abrir}>
          + Cargar laboratorio
        </button>
      )}
      {abierto && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, marginBottom: 10 }}>
          <div className="field-row">
            <span className="field-label">Hora de la extracción</span>
            <input type="datetime-local" className="mini-input" value={horaTexto} onChange={(e) => setHoraTexto(e.target.value)} />
          </div>
          {GRUPOS_LAB.map((g, i) => (
            <details key={g.grupo} open={i === 0 || g.parametros.some((p) => (textos[p.parametro] ?? "") !== "") || undefined}>
              <summary className="tiny" style={{ marginTop: 6 }}>
                {g.grupo}
              </summary>
              {g.parametros.map((p) => (
                <div className="field-row" key={p.parametro}>
                  <span className="field-label">
                    {p.etiqueta}
                    {p.unidad ? ` (${p.unidad})` : ""}
                  </span>
                  <span style={{ display: "inline-flex", gap: 4, alignItems: "center", whiteSpace: "nowrap" }}>
                    <input
                      className="mini-input"
                      inputMode={p.texto ? "text" : "decimal"}
                      maxLength={p.texto ? MAX_TEXTO_LAB : undefined}
                      style={{ width: p.texto ? 200 : 90 }}
                      value={textos[p.parametro] ?? ""}
                      onChange={(e) => setTextos((t) => ({ ...t, [p.parametro]: e.target.value }))}
                    />
                    {p.unidades && (
                      <select
                        className="mini-input"
                        value={unidades[p.parametro] ?? ""}
                        onChange={(e) => setUnidades((u) => ({ ...u, [p.parametro]: e.target.value }))}
                        aria-label={`Unidad de ${p.etiqueta}`}
                      >
                        <option value="">unidad…</option>
                        {p.unidades.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    )}
                  </span>
                </div>
              ))}
            </details>
          ))}
          {pendiente ? (
            <Confirmacion texto={pendiente} textoSi="Sí, guardar" ocupado={guardando} onSi={() => guardar(true)} onNo={() => setPendiente(null)} />
          ) : (
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button className="btn btn-sm btn-accent" disabled={guardando} onClick={() => guardar()}>
                {guardando ? "Guardando…" : "Guardar laboratorio"}
              </button>
              <button className="btn btn-sm" disabled={guardando} onClick={() => setAbierto(false)}>
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}

      {tomas.size === 0 && <div className="tiny muted">Sin valores de laboratorio cargados.</div>}
      {[...tomas.entries()].slice(0, 6).map(([tomaId, vs]) => (
        <div key={tomaId} style={{ marginBottom: 6 }}>
          <div className="tiny muted">{fechaHora(vs[0].medido_en)}</div>
          {vs.map((v) => (
            <div key={v.id}>
              <div className="field-row" style={{ opacity: v.anulado ? 0.5 : 1 }}>
                <span className="field-label" style={{ textDecoration: v.anulado ? "line-through" : undefined }}>
                  {etiqueta(v.parametro)}: {textoValor(v)}
                  {v.parametro === "glucemia" && v.origen ? (
                    <span className="muted"> · {v.origen === "enfermeria" ? "enfermería" : "laboratorio"}</span>
                  ) : null}
                  {v.anulado ? " (anulado)" : ""}
                </span>
                {!v.anulado && (
                  <span style={{ display: "flex", gap: 4 }}>
                    {v.parametro === "glucemia" && (
                      <button className="btn btn-sm" disabled={guardando} onClick={() => corregir(v)}>
                        Corregir
                      </button>
                    )}
                    <button className="btn btn-sm" onClick={() => setAnulandoId(v.id)}>
                      Anular
                    </button>
                  </span>
                )}
              </div>
              {anulandoId === v.id && (
                <Confirmacion
                  texto="¿Anular este valor? Va a quedar tachado y no cuenta en alarmas ni score. Si fue un error de carga, volvé a cargar el valor correcto."
                  textoSi="Sí, anular"
                  ocupado={guardando}
                  onSi={() => anular(v.id)}
                  onNo={() => setAnulandoId(null)}
                />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
