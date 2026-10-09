"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { anularInfusion, guardarInfusion, type NuevaInfusion } from "@/lib/procuracion/mantenimiento";
import {
  concentracion,
  dosisDesdeVelocidad,
  horaMinutos,
  ordenarPorHora,
  solucionDeFila,
  unidadCorta,
  type EstadoBomba,
  type EstadoBombas,
  type InfusionFila,
} from "@/lib/procuracion/mantenimiento-calculos";
import { textoSolucion } from "./mantenimiento-dilucion";
import { BOLOS, BOMBAS_ENFERMERIA, DROGAS_INFUSION, MINUTOS_DOSIS_DESACTUALIZADA, type DrogaBolo, type DrogaInfusion } from "@/lib/procuracion/mantenimiento-metas";
import { Confirmacion, ErrorVisible, aInputLocal, aNumero, esFutura, fechaHora, momentoActual, num } from "./mantenimiento-ui";

const supabase = createClient();

const etiquetaDroga = (d: InfusionFila["droga"]) =>
  d === "desmopresina" ? BOLOS.desmopresina.etiqueta : DROGAS_INFUSION[d].etiqueta;

// Texto corto de una fila de mantenimiento_infusiones.
export function textoInfusion(f: InfusionFila): string {
  if (f.tipo === "bolo") return `bolo ${num(f.dosis_calculada)} ${f.unidad_dosis ?? ""}`;
  if (f.motivo === "cambio_velocidad") return `cambié la velocidad: ${num(f.velocidad_ml_h)} mL/h`;
  if (f.motivo === "inicio" || f.motivo === "cambio_dilucion") {
    const sol = textoSolucion(solucionDeFila(f));
    return `${f.motivo === "inicio" ? "seteo (inicio)" : "cambio de seteo"}: ${num(f.contenido_por_ampolla)} ${f.unidad_contenido ?? ""} × ${num(f.ampollas)} en ${num(f.volumen_final_ml)} mL${sol ? ` · ${sol}` : ""}`;
  }
  // Filas viejas (Fase 1): velocidad como evento.
  if ((f.velocidad_ml_h ?? 0) === 0) return "suspendida";
  return `${num(f.velocidad_ml_h)} mL/h · ${num(f.dosis_calculada, 3)} ${f.unidad_dosis ?? ""}`;
}

// Dosis de una bomba en curso, como texto ("0,19 mcg/kg/min" / motivo).
export function textoDosisBomba(b: EstadoBomba): string {
  if (b.estado === "sin_dilucion") return "sin dilución confirmada";
  if (b.estado === "falta_peso") return "falta peso";
  const dec = b.dosis!.unidad === "U/min" ? 4 : b.dosis!.unidad === "mcg/kg/min" ? 3 : 2;
  const uh = b.dosis!.uPorHora !== undefined ? ` (${num(b.dosis!.uPorHora)} U/h)` : "";
  return `${num(b.dosis!.dosis, dec)} ${unidadCorta(b.dosis!.unidad)}${uh}`;
}

// ---------------------------------------------------------------------
// Bombas en curso (gammas en vivo) + "cambié la velocidad"
// ---------------------------------------------------------------------
// Las dosis salen de la última fila horaria; "cambié la velocidad" guarda
// un evento con la hora real que actualiza las gammas en vivo entre
// cargas. NO cambia el balance (sigue horario); la fila siguiente se
// precarga con esa velocidad.
export function BombasEnCurso({
  estado,
  donanteId,
  pesoKg,
  infusiones,
  onInfusionesChange,
  soloLectura = false,
}: {
  estado: EstadoBombas;
  donanteId: string;
  pesoKg: number | null;
  infusiones: InfusionFila[];
  onInfusionesChange: (f: InfusionFila[]) => void;
  soloLectura?: boolean; // vista del médico: "cambié la velocidad" es solo de enfermería
}) {
  const [editando, setEditando] = useState<DrogaInfusion | null>(null);
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activas = BOMBAS_ENFERMERIA.map((d) => estado.porDroga[d]).filter((b): b is EstadoBomba => b !== undefined);

  async function guardarCambio(b: EstadoBomba) {
    const v = aNumero(texto);
    if (v === null || Number.isNaN(v) || v < 0) return setError("Velocidad inválida (mL/h).");
    setError(null);
    setGuardando(true);
    try {
      const conc = b.dilucion ? concentracion(b.droga, b.dilucion) : null;
      const dosis = conc?.ok ? dosisDesdeVelocidad(b.droga, v, conc.valor, pesoKg) : null;
      const nueva = await guardarInfusion(supabase, donanteId, {
        registrado_en: new Date(momentoActual()).toISOString(),
        droga: b.droga,
        tipo: "infusion",
        motivo: "cambio_velocidad",
        cargado_por: null,
        ampollas: null,
        contenido_por_ampolla: null,
        unidad_contenido: null,
        volumen_final_ml: null,
        concentracion_calculada: conc?.ok ? conc.valor : null,
        unidad_concentracion: conc?.ok ? conc.unidad : null,
        velocidad_ml_h: v,
        dosis_calculada: dosis?.ok ? dosis.dosis : null,
        unidad_dosis: dosis?.ok ? dosis.unidad : null,
        peso_usado_kg: DROGAS_INFUSION[b.droga].unidadDosis === "mcg/kg/min" ? pesoKg : null,
      });
      onInfusionesChange([...infusiones, nueva]);
      setEditando(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el cambio de velocidad.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <ErrorVisible mensaje={error} />
      {activas.length === 0 && <div className="tiny muted">Sin bombas corriendo en la última fila cargada.</div>}
      {activas.map((b) => (
        <div key={b.droga} style={{ padding: "3px 0" }}>
          <div className="field-row">
            <span className="field-label">
              {DROGAS_INFUSION[b.droga].etiqueta} · {num(b.velocidadMlH)} mL/h ·{" "}
              <span style={{ color: b.estado === "ok" && !b.desactualizado ? undefined : "var(--amber)" }}>{textoDosisBomba(b)}</span>
              <span className="tiny muted" style={{ display: "block" }}>
                Dato de las {horaMinutos(b.momento)} ({b.origen === "fila" ? "fila horaria" : "cambié la velocidad"})
                {b.desactualizado ? (
                  <span style={{ color: "var(--amber)", fontWeight: 600 }}> · dato desactualizado (más de {MINUTOS_DOSIS_DESACTUALIZADA} min)</span>
                ) : null}
              </span>
            </span>
            {!soloLectura && editando !== b.droga && (
              <button
                className="btn btn-sm"
                onClick={() => {
                  setEditando(b.droga);
                  setTexto(String(b.velocidadMlH).replace(".", ","));
                  setError(null);
                }}
              >
                Cambié la velocidad
              </button>
            )}
          </div>
          {!soloLectura && editando === b.droga && (
            <div className="field-row">
              <span className="field-label tiny">Velocidad nueva (mL/h), con la hora de ahora. No cambia el balance.</span>
              <span style={{ display: "flex", gap: 4 }}>
                <input className="mini-input" inputMode="decimal" style={{ width: 64 }} value={texto} onChange={(e) => setTexto(e.target.value)} />
                <button className="btn btn-sm btn-accent" disabled={guardando} onClick={() => guardarCambio(b)}>
                  {guardando ? "Guardando…" : "Guardar"}
                </button>
                <button className="btn btn-sm" disabled={guardando} onClick={() => setEditando(null)}>
                  Cancelar
                </button>
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Bolos (solapa aparte): hora y dosis, FUERA del balance
// ---------------------------------------------------------------------
const DROGAS_BOLO = Object.keys(BOLOS) as DrogaBolo[];

export function Bolos({
  donanteId,
  infusiones,
  onInfusionesChange,
  soloLectura = false,
}: {
  donanteId: string;
  infusiones: InfusionFila[];
  onInfusionesChange: (f: InfusionFila[]) => void;
  soloLectura?: boolean; // vista del médico: cargar y anular bolos es solo de enfermería
}) {
  const [droga, setDroga] = useState<DrogaBolo | null>(null);
  const [dosisTexto, setDosisTexto] = useState("");
  const [horaTexto, setHoraTexto] = useState("");
  const [anulandoId, setAnulandoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bolos = ordenarPorHora(infusiones.filter((f) => f.tipo === "bolo")).reverse();

  function abrir(d: DrogaBolo) {
    setDroga(d);
    setDosisTexto("");
    setHoraTexto(aInputLocal(new Date(momentoActual()).toISOString()));
    setError(null);
  }

  async function registrar() {
    if (!droga) return;
    const dosis = aNumero(dosisTexto);
    if (dosis === null || Number.isNaN(dosis) || dosis <= 0) return setError(`Dosis inválida (${BOLOS[droga].unidad}).`);
    if (!horaTexto) return setError("Falta la hora.");
    const iso = new Date(horaTexto).toISOString();
    if (esFutura(iso)) return setError("La hora no puede ser futura.");
    setError(null);
    setGuardando(true);
    try {
      const fila: NuevaInfusion = {
        registrado_en: iso,
        droga,
        tipo: "bolo",
        motivo: null,
        cargado_por: null,
        ampollas: null,
        contenido_por_ampolla: null,
        unidad_contenido: null,
        volumen_final_ml: null,
        concentracion_calculada: null,
        unidad_concentracion: null,
        velocidad_ml_h: null,
        dosis_calculada: dosis,
        unidad_dosis: BOLOS[droga].unidad,
        peso_usado_kg: null,
      };
      const nueva = await guardarInfusion(supabase, donanteId, fila);
      onInfusionesChange([...infusiones, nueva]);
      setDroga(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el bolo.");
    } finally {
      setGuardando(false);
    }
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
      {!soloLectura && (
      <div className="btn-row" style={{ flexWrap: "wrap" }}>
        {DROGAS_BOLO.map((d) => (
          <button key={d} className={`btn btn-sm ${droga === d ? "btn-accent" : ""}`} onClick={() => abrir(d)}>
            {BOLOS[d].etiqueta} ({BOLOS[d].unidad})
          </button>
        ))}
      </div>
      )}
      {!soloLectura && droga && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, marginTop: 8 }}>
          <div className="field-row">
            <span className="field-label">
              {BOLOS[droga].etiqueta} — dosis ({BOLOS[droga].unidad})
            </span>
            <input className="mini-input" inputMode="decimal" style={{ width: 80 }} value={dosisTexto} onChange={(e) => setDosisTexto(e.target.value)} />
          </div>
          <div className="field-row">
            <span className="field-label">Hora</span>
            <input type="datetime-local" className="mini-input" value={horaTexto} onChange={(e) => setHoraTexto(e.target.value)} />
          </div>
          <div className="btn-row" style={{ marginTop: 6 }}>
            <button className="btn btn-sm btn-accent" disabled={guardando} onClick={registrar}>
              {guardando ? "Guardando…" : "Registrar bolo"}
            </button>
            <button className="btn btn-sm" disabled={guardando} onClick={() => setDroga(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      <div style={{ marginTop: 8 }}>
        {bolos.length === 0 && <div className="tiny muted">Sin bolos registrados.</div>}
        {bolos.slice(0, 20).map((f) => (
          <div key={f.id}>
            <div className="field-row" style={{ opacity: f.anulado ? 0.5 : 1 }}>
              <span className="field-label" style={{ textDecoration: f.anulado ? "line-through" : undefined }}>
                {fechaHora(f.registrado_en)} · {etiquetaDroga(f.droga)} · {num(f.dosis_calculada)} {f.unidad_dosis ?? ""}
                {f.anulado ? " (anulado)" : ""}
              </span>
              {!soloLectura && !f.anulado && (
                <button className="btn btn-sm" onClick={() => setAnulandoId(f.id)}>
                  Anular
                </button>
              )}
            </div>
            {!soloLectura && anulandoId === f.id && (
              <Confirmacion
                texto="¿Anular este bolo? Va a quedar tachado. Si fue un error de carga, volvé a registrar el correcto."
                textoSi="Sí, anular"
                ocupado={guardando}
                onSi={() => anular(f.id)}
                onNo={() => setAnulandoId(null)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Historial de seteos y cambios de velocidad. Anular: solo enfermería.
// ---------------------------------------------------------------------
export function HistorialSeteos({
  infusiones,
  onInfusionesChange,
  soloLectura = false,
}: {
  infusiones: InfusionFila[];
  onInfusionesChange: (f: InfusionFila[]) => void;
  soloLectura?: boolean;
}) {
  const [anulandoId, setAnulandoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const historial = ordenarPorHora(infusiones.filter((f) => f.tipo === "infusion")).reverse().slice(0, 20);
  return (
    <details style={{ marginTop: 8 }}>
      <summary className="tiny">Historial de seteos y cambios de velocidad</summary>
      <ErrorVisible mensaje={error} />
      {historial.length === 0 && <div className="tiny muted">Sin seteos cargados.</div>}
      {historial.map((f) => (
        <div key={f.id}>
          <div className="field-row" style={{ opacity: f.anulado ? 0.5 : 1 }}>
            <span className="field-label" style={{ textDecoration: f.anulado ? "line-through" : undefined }}>
              {fechaHora(f.registrado_en)} · {etiquetaDroga(f.droga)} · {textoInfusion(f)}
              {f.anulado ? " (anulado)" : ""}
            </span>
            {!soloLectura && !f.anulado && (
              <button className="btn btn-sm" onClick={() => setAnulandoId(f.id)}>
                Anular
              </button>
            )}
          </div>
          {!soloLectura && anulandoId === f.id && (
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
  );
}

// ---------------------------------------------------------------------
// Vista del médico: SOLO LECTURA (bombas en curso, bolos e historial).
// Cargar, cambiar la velocidad y anular es solo de enfermería.
// ---------------------------------------------------------------------
export default function MantenimientoInfusiones({
  pesoKg,
  donanteId,
  infusiones,
  estado,
  onInfusionesChange,
}: {
  pesoKg: number | null;
  donanteId: string;
  infusiones: InfusionFila[];
  estado: EstadoBombas;
  onInfusionesChange: (f: InfusionFila[]) => void;
}) {
  return (
    <div>
      <BombasEnCurso estado={estado} donanteId={donanteId} pesoKg={pesoKg} infusiones={infusiones} onInfusionesChange={onInfusionesChange} soloLectura />
      <div className="section-label" style={{ marginTop: 10 }}>Bolos</div>
      <Bolos donanteId={donanteId} infusiones={infusiones} onInfusionesChange={onInfusionesChange} soloLectura />
      {estado.ultimoBoloDesmopresina && (
        <div className="tiny muted" style={{ marginTop: 6 }}>
          Último bolo de desmopresina: {fechaHora(estado.ultimoBoloDesmopresina)} (informativo)
        </div>
      )}
      <HistorialSeteos infusiones={infusiones} onInfusionesChange={onInfusionesChange} soloLectura />
    </div>
  );
}
