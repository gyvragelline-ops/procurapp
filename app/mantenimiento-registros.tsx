"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CAMPOS_REGISTRO,
  anularRegistro,
  guardarRegistro,
  type CampoNumericoRegistro,
  type DatosRegistro,
  type RegistroMantenimiento,
} from "@/lib/procuracion/mantenimiento";
import { camposFueraDeRango, ordenarPorHora, validarHoraRegistro } from "@/lib/procuracion/mantenimiento-calculos";
import { Confirmacion, ErrorVisible, aInputLocal, aNumero, fechaHora, hora, momentoActual, num } from "./mantenimiento-ui";

const supabase = createClient();

type Pendiente = { tipo: "orden" | "plausibilidad"; texto: string };

// Registro horario de Mantenimiento: carga, edición (hora y valores) y
// anulación. Validaciones antes de guardar: hora futura no se acepta; si
// la edición cambia el orden de los registros, pide confirmación; valores
// fuera de rango plausible piden "¿seguro?" (no bloquea).
export default function MantenimientoRegistros({
  donanteId,
  registros,
  monitoreoAvanzado,
  onRegistrosChange,
}: {
  donanteId: string;
  registros: RegistroMantenimiento[];
  monitoreoAvanzado: boolean;
  onRegistrosChange: (r: RegistroMantenimiento[]) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [horaTexto, setHoraTexto] = useState("");
  const [textos, setTextos] = useState<Partial<Record<CampoNumericoRegistro, string>>>({});
  const [disfuncion, setDisfuncion] = useState(false);
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [confirmados, setConfirmados] = useState<{ orden: boolean; plausibilidad: boolean }>({ orden: false, plausibilidad: false });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anulandoId, setAnulandoId] = useState<string | null>(null);

  const vigentes = ordenarPorHora(registros.filter((r) => !r.anulado));

  function abrirNuevo() {
    setEditId(null);
    setHoraTexto(aInputLocal(new Date().toISOString()));
    // FiO2 y disfunción se arrastran del último registro (editables).
    const ultimo = vigentes[vigentes.length - 1];
    setTextos(ultimo?.fio2 != null ? { fio2: String(ultimo.fio2) } : {});
    setDisfuncion(ultimo?.disfuncion_miocardica ?? false);
    setPendiente(null);
    setConfirmados({ orden: false, plausibilidad: false });
    setError(null);
    setAbierto(true);
  }

  function abrirEdicion(r: RegistroMantenimiento) {
    setEditId(r.id);
    setHoraTexto(aInputLocal(r.registrado_en));
    const t: Partial<Record<CampoNumericoRegistro, string>> = {};
    for (const c of CAMPOS_REGISTRO) if (r[c.campo] !== null) t[c.campo] = String(r[c.campo]).replace(".", ",");
    setTextos(t);
    setDisfuncion(r.disfuncion_miocardica);
    setPendiente(null);
    setConfirmados({ orden: false, plausibilidad: false });
    setError(null);
    setAbierto(true);
  }

  // Diuresis: el primer registro (sin otro vigente antes) carga "mL de la
  // última hora"; los demás, "mL desde el registro anterior".
  function anteriorA(isoHora: string): RegistroMantenimiento | null {
    const previos = vigentes.filter((r) => r.id !== editId && r.registrado_en < isoHora);
    return previos[previos.length - 1] ?? null;
  }
  const horaIso = horaTexto ? new Date(horaTexto).toISOString() : new Date().toISOString();
  const anterior = anteriorA(horaIso);

  async function guardar(conf = confirmados) {
    setError(null);
    if (!horaTexto) return setError("Falta la hora del registro.");
    const iso = new Date(horaTexto).toISOString();

    const v = validarHoraRegistro(iso, momentoActual(), registros, editId);
    if (v.estado === "futura") return setError("La hora no puede ser futura.");

    const valores: Partial<Record<CampoNumericoRegistro, number | null>> = {};
    for (const c of CAMPOS_REGISTRO) {
      if (c.avanzado && !monitoreoAvanzado && !editId) continue;
      const n = aNumero(textos[c.campo] ?? "");
      if (n !== null && Number.isNaN(n)) return setError(`Valor inválido en ${c.etiqueta}.`);
      valores[c.campo] = n;
    }
    if (Object.values(valores).every((x) => x === null)) return setError("Cargá al menos un valor.");

    if (v.cambiaOrden && !conf.orden) {
      return setPendiente({ tipo: "orden", texto: "Con esta hora cambia el orden de los registros (y los intervalos de diuresis). ¿Confirmás?" });
    }
    const fuera = camposFueraDeRango(valores);
    if (fuera.length > 0 && !conf.plausibilidad) {
      const etiqueta = (campo: string) => CAMPOS_REGISTRO.find((c) => c.campo === campo)?.etiqueta ?? campo;
      return setPendiente({
        tipo: "plausibilidad",
        texto: `¿Seguro? Fuera del rango esperable: ${fuera.map((f) => `${etiqueta(f.campo)} ${num(f.valor)} (${num(f.min)}-${num(f.max)})`).join("; ")}.`,
      });
    }

    const datos: DatosRegistro = {
      registrado_en: iso,
      ...valores,
      disfuncion_miocardica: disfuncion,
      diuresis_es_ultima_hora: anteriorA(iso) === null,
    };
    setGuardando(true);
    try {
      const guardado = await guardarRegistro(supabase, donanteId, datos, editId);
      onRegistrosChange(editId ? registros.map((r) => (r.id === editId ? guardado : r)) : [...registros, guardado]);
      setAbierto(false);
      setPendiente(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el registro.");
    } finally {
      setGuardando(false);
    }
  }

  function confirmarPendiente() {
    if (!pendiente) return;
    const nuevos = { ...confirmados, [pendiente.tipo]: true };
    setConfirmados(nuevos);
    setPendiente(null);
    guardar(nuevos);
  }

  async function anular(id: string) {
    setError(null);
    setGuardando(true);
    try {
      await anularRegistro(supabase, id);
      onRegistrosChange(registros.map((r) => (r.id === id ? { ...r, anulado: true } : r)));
      setAnulandoId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo anular el registro.");
    } finally {
      setGuardando(false);
    }
  }

  const campos = CAMPOS_REGISTRO.filter((c) => !c.avanzado || monitoreoAvanzado);
  const recientes = ordenarPorHora(registros).reverse().slice(0, 12);

  return (
    <div style={{ marginTop: 14 }}>
      <div className="section-label">Registros</div>
      <ErrorVisible mensaje={error} />

      {!abierto && (
        <button className="btn btn-sm btn-accent" onClick={abrirNuevo}>
          + Nuevo registro
        </button>
      )}

      {abierto && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, marginBottom: 10 }}>
          <div className="field-row">
            <span className="field-label">{editId ? "Editar registro · hora" : "Hora del registro"}</span>
            <input type="datetime-local" className="mini-input" value={horaTexto} onChange={(e) => setHoraTexto(e.target.value)} />
          </div>
          {campos.map((c) => (
            <div className="field-row" key={c.campo}>
              <span className="field-label">
                {c.campo === "diuresis_ml"
                  ? anterior
                    ? `Diuresis desde el registro anterior (${hora(anterior.registrado_en)})`
                    : "Diuresis de la última hora"
                  : c.etiqueta}
                {c.unidad ? ` (${c.unidad})` : ""}
              </span>
              <input
                className="mini-input"
                inputMode="decimal"
                style={{ width: 110 }}
                value={textos[c.campo] ?? ""}
                onChange={(e) => setTextos((t) => ({ ...t, [c.campo]: e.target.value }))}
              />
            </div>
          ))}
          <label className="check-row" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={disfuncion} onChange={(e) => setDisfuncion(e.target.checked)} /> Disfunción miocárdica
            (criterio clínico o ecocardiograma)
          </label>

          {pendiente && (
            <Confirmacion
              texto={pendiente.texto}
              textoSi="Sí, guardar"
              ocupado={guardando}
              onSi={confirmarPendiente}
              onNo={() => setPendiente(null)}
            />
          )}
          {!pendiente && (
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button className="btn btn-sm btn-accent" disabled={guardando} onClick={() => guardar()}>
                {guardando ? "Guardando…" : "Guardar registro"}
              </button>
              <button className="btn btn-sm" disabled={guardando} onClick={() => setAbierto(false)}>
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}

      {recientes.length === 0 && <div className="tiny muted">Sin registros todavía.</div>}
      {recientes.map((r) => (
        <div key={r.id}>
          <div className="field-row" style={{ opacity: r.anulado ? 0.5 : 1 }}>
            <span className="field-label" style={{ textDecoration: r.anulado ? "line-through" : undefined }}>
              {fechaHora(r.registrado_en)} · FC {num(r.fc, 0)} · PAM {num(r.pam, 0)} · Diuresis {num(r.diuresis_ml, 0)} mL
              {r.anulado ? " (anulado)" : ""}
            </span>
            {!r.anulado && (
              <span style={{ display: "flex", gap: 4 }}>
                <button className="btn btn-sm" onClick={() => abrirEdicion(r)}>
                  Editar
                </button>
                <button className="btn btn-sm" onClick={() => setAnulandoId(r.id)}>
                  Anular
                </button>
              </span>
            )}
          </div>
          {anulandoId === r.id && (
            <Confirmacion
              texto="¿Anular este registro? Va a quedar tachado y no cuenta en alarmas, score, tendencias ni balance. Si fue un error de carga, volvé a cargar el registro correcto."
              textoSi="Sí, anular"
              ocupado={guardando}
              onSi={() => anular(r.id)}
              onNo={() => setAnulandoId(null)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
