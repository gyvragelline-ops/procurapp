"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  PARAMETROS_LAB_MANTENIMIENTO,
  anularValorLaboratorio,
  guardarTomaLaboratorio,
  type ValorLaboratorio,
} from "@/lib/procuracion/laboratorio-valores";
import { camposFueraDeRango } from "@/lib/procuracion/mantenimiento-calculos";
import { Confirmacion, ErrorVisible, aInputLocal, aNumero, esFutura, fechaHora, num } from "./mantenimiento-ui";

const supabase = createClient();

// Formulario mínimo de laboratorio de Mantenimiento: una extracción
// (misma hora, mismo toma_id) con Na, K, glucemia, pH, PaO2, FiO2 de la
// gasometría y Hb. La FiO2 viene precargada del último registro y es
// editable (la PaFi usa la FiO2 del momento de la gasometría).
export default function MantenimientoLaboratorio({
  donanteId,
  valores,
  fio2Ultima,
  onValoresChange,
}: {
  donanteId: string;
  valores: ValorLaboratorio[];
  fio2Ultima: number | null;
  onValoresChange: (v: ValorLaboratorio[]) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [horaTexto, setHoraTexto] = useState("");
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [pendiente, setPendiente] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anulandoId, setAnulandoId] = useState<string | null>(null);

  function abrir() {
    setHoraTexto(aInputLocal(new Date().toISOString()));
    setTextos(fio2Ultima !== null ? { fio2: String(fio2Ultima).replace(".", ",") } : {});
    setPendiente(null);
    setError(null);
    setAbierto(true);
  }

  async function guardar(confirmado = false) {
    setError(null);
    if (!horaTexto) return setError("Falta la hora de la extracción.");
    const iso = new Date(horaTexto).toISOString();
    if (esFutura(iso)) return setError("La hora no puede ser futura.");

    const items: { parametro: string; valor: number; unidad: string | null }[] = [];
    for (const p of PARAMETROS_LAB_MANTENIMIENTO) {
      const n = aNumero(textos[p.parametro] ?? "");
      if (n === null) continue;
      if (Number.isNaN(n)) return setError(`Valor inválido en ${p.etiqueta}.`);
      items.push({ parametro: p.parametro, valor: n, unidad: p.unidad });
    }
    // La FiO2 sola no es un resultado: tiene que acompañar una PaO2.
    const soloFio2 = items.every((i) => i.parametro === "fio2");
    if (items.length === 0 || soloFio2) return setError("Cargá al menos un valor de laboratorio.");

    const fuera = camposFueraDeRango(Object.fromEntries(items.map((i) => [i.parametro, i.valor])));
    if (fuera.length > 0 && !confirmado) {
      const etiqueta = (p: string) => PARAMETROS_LAB_MANTENIMIENTO.find((x) => x.parametro === p)?.etiqueta ?? p;
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
      setTextos({ [v.parametro]: String(v.valor).replace(".", ",") });
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
  const etiqueta = (p: string) => PARAMETROS_LAB_MANTENIMIENTO.find((x) => x.parametro === p)?.etiqueta ?? p;

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
          {PARAMETROS_LAB_MANTENIMIENTO.map((p) => (
            <div className="field-row" key={p.parametro}>
              <span className="field-label">
                {p.etiqueta}
                {p.unidad ? ` (${p.unidad})` : ""}
              </span>
              <input
                className="mini-input"
                inputMode="decimal"
                style={{ width: 110 }}
                value={textos[p.parametro] ?? ""}
                onChange={(e) => setTextos((t) => ({ ...t, [p.parametro]: e.target.value }))}
              />
            </div>
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
                  {etiqueta(v.parametro)}: {num(v.valor)} {v.unidad ?? ""}
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
