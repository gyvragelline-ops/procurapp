"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { anularInfusion, guardarInfusion, type NuevaInfusion } from "@/lib/procuracion/mantenimiento";
import {
  concentracion,
  dosisDesdeVelocidad,
  estadoInfusiones,
  ordenarPorHora,
  ultimaDilucion,
  velocidadDesdeDosis,
  type InfusionFila,
} from "@/lib/procuracion/mantenimiento-calculos";
import { DROGAS_INFUSION } from "@/lib/procuracion/mantenimiento-metas";
import DilucionBomba, { type DrogaInfusion, type EstadoDilucion } from "./mantenimiento-dilucion";
import { Confirmacion, ErrorVisible, PedirPeso, aInputLocal, aNumero, esFutura, fechaHora, hora, num } from "./mantenimiento-ui";

const supabase = createClient();
const DROGAS = Object.keys(DROGAS_INFUSION) as DrogaInfusion[];

// Texto corto de una fila de infusión ("10 mL/h · 0,19 mcg/kg/min").
export function textoInfusion(f: InfusionFila): string {
  if (f.tipo === "bolo") return `bolo ${num(f.dosis_calculada)} mcg`;
  if ((f.velocidad_ml_h ?? 0) === 0) return "suspendida";
  const decimales = f.unidad_dosis === "U/min" ? 4 : f.unidad_dosis === "mcg/kg/min" ? 3 : 2;
  const uh = f.unidad_dosis === "U/min" && f.dosis_calculada !== null ? ` (${num(f.dosis_calculada * 60)} U/h)` : "";
  return `${num(f.velocidad_ml_h)} mL/h · ${num(f.dosis_calculada, decimales)} ${f.unidad_dosis ?? ""}${uh}`;
}

// Dilución vigente de una droga en curso (ya confirmada cuando se inició):
// cambiar solo la velocidad no la repregunta.
export function dilucionVigente(infusiones: InfusionFila[], droga: DrogaInfusion): EstadoDilucion {
  if (!estadoInfusiones(infusiones).porDroga[droga]?.activa) return null;
  const d = ultimaDilucion(infusiones, droga);
  if (!d) return null;
  const c = concentracion(droga, d);
  return c.ok ? { dilucion: d, concentracion: c.valor, unidad: c.unidad } : null;
}

// Infusiones (vista del médico). La dilución se confirma con un toque al
// iniciar una droga o al cambiar su dilución (DilucionBomba); cambiar solo
// la velocidad de una droga en curso no la repregunta. La cuenta se
// muestra siempre. Desmopresina: solo bolos en mcg, sin bomba.
export default function MantenimientoInfusiones({
  pesoKg,
  donanteId,
  infusiones,
  onInfusionesChange,
  onGuardarPeso,
}: {
  pesoKg: number | null;
  donanteId: string;
  infusiones: InfusionFila[];
  onInfusionesChange: (f: InfusionFila[]) => void;
  onGuardarPeso: (pesoKg: number) => Promise<void>;
}) {
  const [droga, setDroga] = useState<DrogaInfusion | null>(null);
  const [dil, setDil] = useState<EstadoDilucion>(null);
  const [velocidadTexto, setVelocidadTexto] = useState("");
  const [dosisObjetivoTexto, setDosisObjetivoTexto] = useState("");
  const [horaTexto, setHoraTexto] = useState("");
  const [suspendiendo, setSuspendiendo] = useState<DrogaInfusion | null>(null);
  const [anulandoId, setAnulandoId] = useState<string | null>(null);
  const [boloAbierto, setBoloAbierto] = useState(false);
  const [boloMcg, setBoloMcg] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const estado = estadoInfusiones(infusiones);
  const enCurso = DROGAS.filter((d) => estado.porDroga[d]?.activa);

  function abrir(d: DrogaInfusion) {
    const enCursoD = estado.porDroga[d]?.activa ?? false;
    setDroga(d);
    setDil(dilucionVigente(infusiones, d));
    setVelocidadTexto(enCursoD ? String(estado.porDroga[d]?.velocidad_ml_h ?? "").replace(".", ",") : "");
    setDosisObjetivoTexto("");
    setHoraTexto(aInputLocal(new Date().toISOString()));
    setError(null);
  }

  const unidadDosis = droga ? DROGAS_INFUSION[droga].unidadDosis : null;
  const usaPeso = unidadDosis === "mcg/kg/min";
  const velocidad = aNumero(velocidadTexto);
  const resultado =
    droga && dil && velocidad !== null && !Number.isNaN(velocidad) ? dosisDesdeVelocidad(droga, velocidad, dil.concentracion, pesoKg) : null;
  const dosisObjetivo = aNumero(dosisObjetivoTexto);
  const inversa =
    droga && dil && dosisObjetivo !== null && !Number.isNaN(dosisObjetivo)
      ? velocidadDesdeDosis(droga, dosisObjetivo, dil.concentracion, pesoKg)
      : null;

  async function insertar(fila: NuevaInfusion, despues: () => void) {
    setError(null);
    setGuardando(true);
    try {
      const nueva = await guardarInfusion(supabase, donanteId, fila);
      onInfusionesChange([...infusiones, nueva]);
      despues();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la infusión.");
    } finally {
      setGuardando(false);
    }
  }

  function guardar() {
    if (!droga || !dil) return setError("Confirmá la dilución antes de guardar.");
    if (!resultado?.ok) return setError(resultado?.error ?? "Cargá la velocidad en mL/h.");
    if (!horaTexto) return setError("Falta la hora.");
    const iso = new Date(horaTexto).toISOString();
    if (esFutura(iso)) return setError("La hora no puede ser futura.");
    insertar(
      {
        registrado_en: iso,
        droga,
        tipo: "infusion",
        ampollas: dil.dilucion.ampollas,
        contenido_por_ampolla: dil.dilucion.contenidoPorAmpolla,
        unidad_contenido: dil.dilucion.unidadContenido,
        volumen_final_ml: dil.dilucion.volumenFinalMl,
        concentracion_calculada: dil.concentracion,
        unidad_concentracion: dil.unidad,
        velocidad_ml_h: velocidad,
        dosis_calculada: resultado.dosis,
        unidad_dosis: resultado.unidad,
        peso_usado_kg: usaPeso ? pesoKg : null,
      },
      () => setDroga(null)
    );
  }

  // Suspender = fila con 0 mL/h y la misma dilución.
  function suspender(d: DrogaInfusion) {
    const actual = estado.porDroga[d];
    if (!actual) return;
    insertar(
      {
        registrado_en: new Date().toISOString(),
        droga: d,
        tipo: "infusion",
        ampollas: actual.ampollas,
        contenido_por_ampolla: actual.contenido_por_ampolla,
        unidad_contenido: actual.unidad_contenido,
        volumen_final_ml: actual.volumen_final_ml,
        concentracion_calculada: null,
        unidad_concentracion: null,
        velocidad_ml_h: 0,
        dosis_calculada: 0,
        unidad_dosis: DROGAS_INFUSION[d].unidadDosis,
        peso_usado_kg: null,
      },
      () => setSuspendiendo(null)
    );
  }

  function guardarBolo() {
    const mcg = aNumero(boloMcg);
    if (mcg === null || Number.isNaN(mcg) || mcg <= 0) return setError("Dosis de desmopresina inválida (mcg).");
    insertar(
      {
        registrado_en: new Date().toISOString(),
        droga: "desmopresina",
        tipo: "bolo",
        ampollas: null,
        contenido_por_ampolla: null,
        unidad_contenido: null,
        volumen_final_ml: null,
        concentracion_calculada: null,
        unidad_concentracion: null,
        velocidad_ml_h: null,
        dosis_calculada: mcg,
        unidad_dosis: "mcg",
        peso_usado_kg: null,
      },
      () => {
        setBoloAbierto(false);
        setBoloMcg("");
      }
    );
  }

  async function anular(id: string) {
    setError(null);
    setGuardando(true);
    try {
      await anularInfusion(supabase, id);
      onInfusionesChange(infusiones.map((f) => (f.id === id ? { ...f, anulado: true } : f)));
      setAnulandoId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo anular.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <ErrorVisible mensaje={error} />

      {enCurso.length === 0 && <div className="tiny muted">Sin infusiones en curso.</div>}
      {enCurso.map((d) => {
        const f = estado.porDroga[d]!;
        return (
          <div key={d}>
            <div className="field-row">
              <span className="field-label">
                {DROGAS_INFUSION[d].etiqueta} · {textoInfusion(f)} <span className="muted">desde {hora(f.registrado_en)}</span>
              </span>
              <span style={{ display: "flex", gap: 4 }}>
                <button className="btn btn-sm" onClick={() => abrir(d)}>
                  Cambiar
                </button>
                <button className="btn btn-sm" onClick={() => setSuspendiendo(d)}>
                  Suspender
                </button>
              </span>
            </div>
            {suspendiendo === d && (
              <Confirmacion
                texto={`¿Suspender ${DROGAS_INFUSION[d].etiqueta}? Se registra 0 mL/h.`}
                textoSi="Sí, suspender"
                ocupado={guardando}
                onSi={() => suspender(d)}
                onNo={() => setSuspendiendo(null)}
              />
            )}
          </div>
        );
      })}

      {!droga && (
        <div className="btn-row" style={{ marginTop: 8, flexWrap: "wrap" }}>
          <select className="mini-input" value="" onChange={(e) => e.target.value && abrir(e.target.value as DrogaInfusion)}>
            <option value="">+ Iniciar / cambiar droga…</option>
            {DROGAS.map((d) => (
              <option key={d} value={d}>
                {DROGAS_INFUSION[d].etiqueta} ({DROGAS_INFUSION[d].unidadDosis})
              </option>
            ))}
          </select>
          <button className="btn btn-sm" onClick={() => setBoloAbierto((v) => !v)}>
            Bolo de desmopresina
          </button>
        </div>
      )}

      {boloAbierto && !droga && (
        <div className="field-row">
          <span className="field-label">Desmopresina (bolo, mcg)</span>
          <span style={{ display: "flex", gap: 4 }}>
            <input className="mini-input" inputMode="decimal" style={{ width: 80 }} value={boloMcg} onChange={(e) => setBoloMcg(e.target.value)} />
            <button className="btn btn-sm btn-accent" disabled={guardando} onClick={guardarBolo}>
              Registrar
            </button>
          </span>
        </div>
      )}

      {droga && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, marginTop: 8 }}>
          <div className="tiny" style={{ marginBottom: 6, fontWeight: 600 }}>
            {DROGAS_INFUSION[droga].etiqueta} — dosis en {unidadDosis}
            {droga === "vasopresina" ? " (y U/h)" : ""}
          </div>
          <DilucionBomba
            key={droga}
            droga={droga}
            inicial={ultimaDilucion(infusiones, droga)}
            vigente={estado.porDroga[droga]?.activa ?? false}
            onConfirmada={setDil}
          />

          {dil && (
            <>
              {usaPeso && !pesoKg && <PedirPeso onGuardar={onGuardarPeso} />}
              <div className="field-row">
                <span className="field-label">Velocidad (mL/h)</span>
                <input className="mini-input" inputMode="decimal" style={{ width: 80 }} value={velocidadTexto} onChange={(e) => setVelocidadTexto(e.target.value)} />
              </div>
              {resultado && (
                <div className="tiny" style={{ margin: "4px 0", color: resultado.ok ? "var(--text)" : "var(--red)" }}>
                  {resultado.ok ? `= ${resultado.cuenta}` : resultado.error}
                </div>
              )}
              <div className="field-row">
                <span className="field-label">¿Qué velocidad para una dosis? ({unidadDosis})</span>
                <span style={{ display: "flex", gap: 4 }}>
                  <input
                    className="mini-input"
                    inputMode="decimal"
                    style={{ width: 80 }}
                    value={dosisObjetivoTexto}
                    onChange={(e) => setDosisObjetivoTexto(e.target.value)}
                  />
                  {inversa?.ok && (
                    <button className="btn btn-sm" onClick={() => setVelocidadTexto(String(Number(inversa.velocidadMlH.toFixed(2))).replace(".", ","))}>
                      Usar
                    </button>
                  )}
                </span>
              </div>
              {inversa && (
                <div className="tiny" style={{ margin: "4px 0", color: inversa.ok ? "var(--text)" : "var(--red)" }}>
                  {inversa.ok ? `= ${inversa.cuenta}` : inversa.error}
                </div>
              )}
              <div className="field-row">
                <span className="field-label">Hora</span>
                <input type="datetime-local" className="mini-input" value={horaTexto} onChange={(e) => setHoraTexto(e.target.value)} />
              </div>
            </>
          )}

          <div className="btn-row" style={{ marginTop: 8 }}>
            <button className="btn btn-sm btn-accent" disabled={guardando || !dil || !resultado?.ok} onClick={guardar}>
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            <button className="btn btn-sm" disabled={guardando} onClick={() => setDroga(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {estado.ultimoBoloDesmopresina && (
        <div className="tiny muted" style={{ marginTop: 6 }}>
          Último bolo de desmopresina: {fechaHora(estado.ultimoBoloDesmopresina)} (informativo)
        </div>
      )}

      <details style={{ marginTop: 8 }}>
        <summary className="tiny">Historial de infusiones</summary>
        {ordenarPorHora(infusiones)
          .reverse()
          .slice(0, 20)
          .map((f) => (
            <div key={f.id}>
              <div className="field-row" style={{ opacity: f.anulado ? 0.5 : 1 }}>
                <span className="field-label" style={{ textDecoration: f.anulado ? "line-through" : undefined }}>
                  {fechaHora(f.registrado_en)} · {f.droga === "desmopresina" ? "Desmopresina" : DROGAS_INFUSION[f.droga].etiqueta} · {textoInfusion(f)}
                  {f.anulado ? " (anulada)" : ""}
                </span>
                {!f.anulado && (
                  <button className="btn btn-sm" onClick={() => setAnulandoId(f.id)}>
                    Anular
                  </button>
                )}
              </div>
              {anulandoId === f.id && (
                <Confirmacion
                  texto="¿Anular esta fila? Va a quedar tachada y no cuenta. Si fue un error de carga, volvé a cargar la correcta."
                  textoSi="Sí, anular"
                  ocupado={guardando}
                  onSi={() => anular(f.id)}
                  onNo={() => setAnulandoId(null)}
                />
              )}
            </div>
          ))}
      </details>
    </div>
  );
}
