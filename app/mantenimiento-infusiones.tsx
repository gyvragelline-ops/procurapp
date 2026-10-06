"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { anularInfusion, guardarInfusion, type NuevaInfusion } from "@/lib/procuracion/mantenimiento";
import {
  concentracion,
  dosisDesdeVelocidad,
  estadoInfusiones,
  ordenarPorHora,
  textoConfirmacionDilucion,
  ultimaDilucion,
  velocidadDesdeDosis,
  type Dilucion,
  type InfusionFila,
} from "@/lib/procuracion/mantenimiento-calculos";
import { DROGAS_INFUSION, PRESET_NORADRENALINA, type Droga } from "@/lib/procuracion/mantenimiento-metas";
import { Confirmacion, ErrorVisible, PedirPeso, aInputLocal, aNumero, esFutura, fechaHora, hora, num } from "./mantenimiento-ui";

const supabase = createClient();

type DrogaInfusion = Exclude<Droga, "desmopresina">;
const DROGAS = Object.keys(DROGAS_INFUSION) as DrogaInfusion[];

// Infusiones y cálculo de dosis. Regla central: NUNCA se calcula sin que
// el procurador confirme con un toque la dilución ("8 mg en 100 mL = 80
// mcg/mL. ¿Correcto?") cada vez que inicia o cambia una droga; la cuenta
// se muestra siempre. Desmopresina: solo bolos en mcg, sin bomba.
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
  const [dil, setDil] = useState<{ ampollas: string; contenido: string; unidad: "mg" | "mcg" | "U"; volumen: string }>({
    ampollas: "",
    contenido: "",
    unidad: "mg",
    volumen: "",
  });
  const [dilucionConfirmada, setDilucionConfirmada] = useState(false);
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
    const previa = ultimaDilucion(infusiones, d);
    const base: Dilucion | null = previa ?? (d === "noradrenalina" ? PRESET_NORADRENALINA : null);
    setDroga(d);
    setDil({
      ampollas: base ? String(base.ampollas) : "",
      contenido: base ? String(base.contenidoPorAmpolla).replace(".", ",") : "",
      unidad: d === "vasopresina" ? "U" : (base?.unidadContenido ?? "mg"),
      volumen: base ? String(base.volumenFinalMl) : "",
    });
    // Cada vez que se inicia o cambia una droga se vuelve a confirmar.
    setDilucionConfirmada(false);
    setVelocidadTexto("");
    setDosisObjetivoTexto("");
    setHoraTexto(aInputLocal(new Date().toISOString()));
    setError(null);
  }

  function cambiarDil(cambios: Partial<typeof dil>) {
    setDil((d) => ({ ...d, ...cambios }));
    setDilucionConfirmada(false); // cambió la dilución: hay que confirmar de nuevo
  }

  const dilucion: Dilucion | null = (() => {
    const a = aNumero(dil.ampollas);
    const c = aNumero(dil.contenido);
    const v = aNumero(dil.volumen);
    if (a === null || c === null || v === null || [a, c, v].some(Number.isNaN)) return null;
    return { ampollas: a, contenidoPorAmpolla: c, unidadContenido: dil.unidad, volumenFinalMl: v };
  })();
  const conc = droga && dilucion ? concentracion(droga, dilucion) : null;
  const textoConf = droga && dilucion ? textoConfirmacionDilucion(droga, dilucion) : null;
  const usaPeso = droga ? DROGAS_INFUSION[droga].unidadDosis === "mcg/kg/min" : false;
  const velocidad = aNumero(velocidadTexto);
  const resultado =
    droga && conc?.ok && dilucionConfirmada && velocidad !== null && !Number.isNaN(velocidad)
      ? dosisDesdeVelocidad(droga, velocidad, conc.valor, pesoKg)
      : null;
  const dosisObjetivo = aNumero(dosisObjetivoTexto);
  const inversa =
    droga && conc?.ok && dilucionConfirmada && dosisObjetivo !== null && !Number.isNaN(dosisObjetivo)
      ? velocidadDesdeDosis(droga, dosisObjetivo, conc.valor, pesoKg)
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
    if (!droga || !dilucion || !conc?.ok) return setError("Completá la dilución.");
    if (!dilucionConfirmada) return setError("Confirmá la dilución antes de guardar.");
    if (!resultado?.ok) return setError(resultado?.error ?? "Cargá la velocidad en mL/h.");
    if (!horaTexto) return setError("Falta la hora.");
    const iso = new Date(horaTexto).toISOString();
    if (esFutura(iso)) return setError("La hora no puede ser futura.");
    insertar(
      {
        registrado_en: iso,
        droga,
        tipo: "infusion",
        ampollas: dilucion.ampollas,
        contenido_por_ampolla: dilucion.contenidoPorAmpolla,
        unidad_contenido: dilucion.unidadContenido,
        volumen_final_ml: dilucion.volumenFinalMl,
        concentracion_calculada: conc.valor,
        unidad_concentracion: conc.unidad,
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

  const textoDosis = (f: InfusionFila) =>
    f.tipo === "bolo"
      ? `bolo ${num(f.dosis_calculada)} mcg`
      : (f.velocidad_ml_h ?? 0) === 0
        ? "suspendida"
        : `${num(f.velocidad_ml_h)} mL/h · ${num(f.dosis_calculada, f.unidad_dosis === "U/min" ? 4 : 3)} ${f.unidad_dosis ?? ""}${
            f.unidad_dosis === "U/min" && f.dosis_calculada !== null ? ` (${num(f.dosis_calculada * 60)} U/h)` : ""
          }`;

  return (
    <div style={{ marginTop: 14 }}>
      <div className="section-label">Infusiones</div>
      <ErrorVisible mensaje={error} />

      {enCurso.length === 0 && <div className="tiny muted">Sin infusiones en curso.</div>}
      {enCurso.map((d) => {
        const f = estado.porDroga[d]!;
        return (
          <div key={d}>
            <div className="field-row">
              <span className="field-label">
                {DROGAS_INFUSION[d].etiqueta} · {textoDosis(f)} <span className="muted">desde {hora(f.registrado_en)}</span>
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
            {DROGAS_INFUSION[droga].etiqueta} — dosis en {DROGAS_INFUSION[droga].unidadDosis}
            {droga === "vasopresina" ? " (y U/h)" : ""}
          </div>
          <div className="field-row">
            <span className="field-label">Ampollas</span>
            <input className="mini-input" inputMode="decimal" style={{ width: 80 }} value={dil.ampollas} onChange={(e) => cambiarDil({ ampollas: e.target.value })} />
          </div>
          <div className="field-row">
            <span className="field-label">Contenido por ampolla</span>
            <span style={{ display: "flex", gap: 4 }}>
              <input className="mini-input" inputMode="decimal" style={{ width: 80 }} value={dil.contenido} onChange={(e) => cambiarDil({ contenido: e.target.value })} />
              {droga === "vasopresina" ? (
                <span className="tiny">U</span>
              ) : (
                <select className="mini-input" value={dil.unidad} onChange={(e) => cambiarDil({ unidad: e.target.value as "mg" | "mcg" })}>
                  <option value="mg">mg</option>
                  <option value="mcg">mcg</option>
                </select>
              )}
            </span>
          </div>
          {droga === "noradrenalina" && <div className="tiny muted">{PRESET_NORADRENALINA.aviso}</div>}
          <div className="field-row">
            <span className="field-label">Volumen final (mL)</span>
            <input className="mini-input" inputMode="decimal" style={{ width: 80 }} value={dil.volumen} onChange={(e) => cambiarDil({ volumen: e.target.value })} />
          </div>

          {conc && !conc.ok && <ErrorVisible mensaje={conc.error} />}
          {textoConf && !dilucionConfirmada && (
            <Confirmacion texto={textoConf} textoSi="Sí, correcto" onSi={() => setDilucionConfirmada(true)} onNo={() => setDroga(null)} />
          )}

          {dilucionConfirmada && conc?.ok && (
            <>
              <div className="tiny" style={{ margin: "6px 0", color: "var(--green)" }}>
                Dilución confirmada: {num(conc.valor, 3)} {conc.unidad}
              </div>
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
                <span className="field-label">¿Qué velocidad para una dosis? ({DROGAS_INFUSION[droga].unidadDosis})</span>
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
            <button className="btn btn-sm btn-accent" disabled={guardando || !dilucionConfirmada || !resultado?.ok} onClick={guardar}>
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
                  {fechaHora(f.registrado_en)} · {f.droga === "desmopresina" ? "Desmopresina" : DROGAS_INFUSION[f.droga].etiqueta} · {textoDosis(f)}
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
