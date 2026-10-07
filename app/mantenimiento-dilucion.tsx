"use client";

import { useState } from "react";
import {
  avisoDosisBomba,
  avisosSeteoBomba,
  bombasQueArrancan,
  concentracion,
  dilucionPorId,
  dosisDesdeVelocidad,
  solucionPorId,
  ultimaDilucion,
  unidadCorta,
  unidadesContenidoPara,
  type BombaFormulario,
  type Dilucion,
  type InfusionFila,
  type Solucion,
} from "@/lib/procuracion/mantenimiento-calculos";
import type { BombaParaGuardar } from "@/lib/procuracion/mantenimiento";
import {
  BOMBAS_ENFERMERIA,
  DROGAS_INFUSION,
  PASO_BOMBA_ML_H,
  PRESET_NORADRENALINA,
  SOLUCIONES_DILUCION,
  type DrogaInfusion,
} from "@/lib/procuracion/mantenimiento-metas";
import { Confirmacion, ErrorVisible, PedirPeso, aNumero, num } from "./mantenimiento-ui";

export type { DrogaInfusion, Solucion };
export type EstadoDilucion = { dilucion: Dilucion; concentracion: number; unidad: string } | null;

const aTexto = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));

export function textoSolucion(s: Solucion): string | null {
  if (!s) return null;
  if (s.tipo === "otra") return s.otra.trim() || "Otra";
  return SOLUCIONES_DILUCION.find((x) => x.valor === s.tipo)?.etiqueta ?? null;
}

// "Noradrenalina · 4 mg × 2 en 100 mL · Dextrosa 5 %"
export function lineaSeteo(droga: DrogaInfusion, d: Dilucion, solucion: Solucion): string {
  const sol = textoSolucion(solucion);
  return `${DROGAS_INFUSION[droga].etiqueta} · ${num(d.contenidoPorAmpolla)} ${d.unidadContenido} × ${num(d.ampollas)} en ${num(d.volumenFinalMl)} mL${sol ? ` · ${sol}` : ""}`;
}

// Seteo de una bomba: "Ampolla [ ] mg", "Cantidad [ ]", "Volumen de
// dilución [ ] mL" y la solución. Se confirma con un toque ("Listo") al
// iniciar, reiniciar o cambiar la dilución; sin fórmulas a la vista. Si
// algo sale del rango plausible de la droga, "¿seguro?" (no bloquea).
export function SeteoBomba({
  droga,
  inicial,
  solucionInicial,
  onListo,
  onCancelar,
}: {
  droga: DrogaInfusion;
  inicial: Dilucion | null;
  solucionInicial: Solucion;
  onListo: (estado: NonNullable<EstadoDilucion>, solucion: Solucion) => void;
  onCancelar?: () => void;
}) {
  const unidad = unidadesContenidoPara(droga)[0]; // mg; U (vasopresina, insulina); mEq (potasio)
  const base: Dilucion | null = inicial ?? (droga === "noradrenalina" ? PRESET_NORADRENALINA : null);
  const [ampolla, setAmpolla] = useState(aTexto(base?.contenidoPorAmpolla));
  const [cantidad, setCantidad] = useState(aTexto(base?.ampollas));
  const [volumen, setVolumen] = useState(aTexto(base?.volumenFinalMl));
  const [solucion, setSolucion] = useState<Solucion>(solucionInicial);
  const [seguro, setSeguro] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function listo(confirmado = false) {
    setError(null);
    const a = aNumero(ampolla);
    const c = aNumero(cantidad);
    const v = aNumero(volumen);
    if (a === null || c === null || v === null || [a, c, v].some(Number.isNaN) || !(a > 0) || !(c > 0) || !(v > 0)) {
      return setError("Completá ampolla, cantidad y volumen de dilución.");
    }
    const dilucion: Dilucion = { ampollas: c, contenidoPorAmpolla: a, unidadContenido: unidad, volumenFinalMl: v };
    const conc = concentracion(droga, dilucion);
    if (!conc.ok) return setError(conc.error);
    const avisos = avisosSeteoBomba(droga, dilucion);
    if (avisos.length > 0 && !confirmado) return setSeguro(avisos);
    setSeguro(null);
    onListo({ dilucion, concentracion: conc.valor, unidad: conc.unidad }, solucion);
  }

  const campo = (etiqueta: string, valor: string, set: (x: string) => void, sufijo: string) => (
    <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span className="tiny">{etiqueta}</span>
      <input
        className="mini-input"
        inputMode="decimal"
        style={{ width: 60 }}
        value={valor}
        onChange={(e) => {
          set(e.target.value);
          setSeguro(null);
        }}
      />
      {sufijo && <span className="tiny">{sufijo}</span>}
    </label>
  );

  return (
    <div style={{ padding: "6px 0" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        {campo("Ampolla", ampolla, setAmpolla, unidad)}
        {campo("Cantidad", cantidad, setCantidad, "")}
        {campo("Volumen de dilución", volumen, setVolumen, "mL")}
      </div>
      {droga === "noradrenalina" && <div className="tiny muted">{PRESET_NORADRENALINA.aviso}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", marginTop: 6 }}>
        {SOLUCIONES_DILUCION.map((s) => (
          <button
            key={s.valor}
            className={`btn btn-sm ${solucion?.tipo === s.valor ? "btn-accent" : ""}`}
            onClick={() => setSolucion({ tipo: s.valor, otra: solucion?.otra ?? "" })}
          >
            {s.etiqueta}
          </button>
        ))}
        {solucion?.tipo === "otra" && (
          <input
            className="mini-input"
            style={{ width: 120 }}
            maxLength={40}
            placeholder="¿Cuál?"
            value={solucion.otra}
            onChange={(e) => setSolucion({ tipo: "otra", otra: e.target.value })}
          />
        )}
      </div>
      <ErrorVisible mensaje={error} />
      {seguro ? (
        <Confirmacion texto={`¿Seguro? Fuera de lo esperable: ${seguro.join("; ")}.`} textoSi="Sí, está bien" onSi={() => listo(true)} onNo={() => setSeguro(null)} />
      ) : (
        <div className="btn-row" style={{ marginTop: 6 }}>
          <button className="btn btn-sm btn-accent" onClick={() => listo()}>
            Listo
          </button>
          {onCancelar && (
            <button className="btn btn-sm" onClick={onCancelar}>
              Cancelar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Bombas de la fila horaria (médico y enfermería: la misma fuente)
// =====================================================================
// Cada hora se anota la velocidad (mL/h) de cada bomba; ese valor es el
// ingreso de esa hora. La fila nueva arranca con las bombas de la hora
// anterior ("copiado de la hora anterior" hasta que se toquen o se
// guarde); guardar equivale a confirmar. El seteo (dilución) se confirma
// con "Listo" solo al iniciar o reiniciar una bomba o al cambiarlo.
export type FilaBombaForm = {
  velocidadTexto: string;
  dilucionId: string | null; // dilución ya guardada que usa esta bomba
  dilucionNueva: EstadoDilucion; // seteo confirmado en este formulario (se guarda con la fila)
  solucion?: Solucion; // la elegida en este formulario; si no, la guardada con la dilución
  copiado: boolean;
};
export type BombasForm = Partial<Record<DrogaInfusion, FilaBombaForm>>;

export function bombasFormDesde(filas: BombaFormulario[], copiado: boolean): BombasForm {
  const form: BombasForm = {};
  for (const f of filas) form[f.droga] = { velocidadTexto: aTexto(f.velocidad_ml_h), dilucionId: f.dilucion_id, dilucionNueva: null, copiado };
  return form;
}

// Formulario -> lo que se guarda. Una bomba con la velocidad vacía se
// saca de la fila; 0 = suspendida (queda anotado, no se precarga después).
export function bombasParaGuardar(
  form: BombasForm,
  precarga: BombaFormulario[]
): { ok: true; filas: BombaParaGuardar[] } | { ok: false; error: string } {
  const filas: BombaParaGuardar[] = [];
  for (const d of BOMBAS_ENFERMERIA) {
    const f = form[d];
    if (!f || f.velocidadTexto.trim() === "") continue;
    const v = aNumero(f.velocidadTexto);
    if (v === null || Number.isNaN(v) || v < 0) return { ok: false, error: `Velocidad inválida en ${DROGAS_INFUSION[d].etiqueta} (mL/h).` };
    const arranca = bombasQueArrancan(precarga, [{ droga: d, velocidad_ml_h: v, dilucion_id: f.dilucionId }]).length > 0;
    filas.push({
      droga: d,
      velocidad_ml_h: v,
      dilucion_id: f.dilucionId,
      dilucionNueva: f.dilucionNueva ? { ...f.dilucionNueva, motivo: arranca ? "inicio" : "cambio_dilucion", solucion: f.solucion ?? null } : null,
    });
  }
  return { ok: true, filas };
}

type DosisFila = ReturnType<typeof dosisDesdeVelocidad> | null;

function dosisDeFila(d: DrogaInfusion, f: FilaBombaForm, infusiones: InfusionFila[], pesoKg: number | null) {
  const v = aNumero(f.velocidadTexto);
  const velocidad = v === null || Number.isNaN(v) ? null : v;
  const dil = f.dilucionNueva?.dilucion ?? dilucionPorId(infusiones, f.dilucionId);
  const conc = dil ? concentracion(d, dil) : null;
  const dosis: DosisFila = conc?.ok && velocidad !== null && velocidad > 0 ? dosisDesdeVelocidad(d, velocidad, conc.valor, pesoKg) : null;
  return { velocidad, dil, dosis };
}

// "¿Seguro?" de las dosis resultantes de la fila (no bloquea): se suma al
// "¿seguro?" de plausibilidad al guardar la hora.
export function avisosDosisDeFila(form: BombasForm, infusiones: InfusionFila[], pesoKg: number | null): string[] {
  const out: string[] = [];
  for (const d of BOMBAS_ENFERMERIA) {
    const f = form[d];
    if (!f) continue;
    const { dosis } = dosisDeFila(d, f, infusiones, pesoKg);
    if (dosis?.ok) {
      const a = avisoDosisBomba(d, dosis.dosis);
      if (a) out.push(a);
    }
  }
  return out;
}

export function BombasDeLaHora({
  form,
  onChange,
  precarga,
  infusiones,
  pesoKg,
  onGuardarPeso,
}: {
  form: BombasForm;
  onChange: (f: BombasForm) => void;
  precarga: BombaFormulario[]; // bombas de la hora anterior (para saber cuáles arrancan)
  infusiones: InfusionFila[];
  pesoKg: number | null;
  onGuardarPeso: (pesoKg: number) => Promise<void>;
}) {
  const [seteando, setSeteando] = useState<DrogaInfusion | null>(null);
  const presentes = BOMBAS_ENFERMERIA.filter((d) => form[d]);
  const faltantes = BOMBAS_ENFERMERIA.filter((d) => !form[d]);
  const cambiar = (d: DrogaInfusion, cambios: Partial<FilaBombaForm>) =>
    onChange({ ...form, [d]: { ...(form[d] ?? { velocidadTexto: "", dilucionId: null, dilucionNueva: null }), ...cambios, copiado: false } });
  const quitar = (d: DrogaInfusion) => {
    const resto = { ...form };
    delete resto[d];
    onChange(resto);
  };

  const filas = presentes.map((d) => {
    const f = form[d]!;
    const { velocidad, dil, dosis } = dosisDeFila(d, f, infusiones, pesoKg);
    // Solución: la elegida ahora o, si no, la guardada con esa dilución.
    const solucion = f.solucion !== undefined ? f.solucion : solucionPorId(infusiones, f.dilucionId);
    // Arranca o se reinicia (no venía corriendo en la hora anterior) y no
    // tiene seteo: se abre el seteo solo.
    const arranca = velocidad !== 0 && !precarga.some((p) => p.droga === d && p.velocidad_ml_h > 0);
    const pideSeteo = arranca && !f.dilucionNueva && !f.dilucionId;
    return { d, f, velocidad, dil, dosis, solucion, pideSeteo };
  });
  const faltaPeso = filas.some((x) => x.dosis && !x.dosis.ok && x.dosis.motivo === "sin_peso");

  const textoDosis = (d: DrogaInfusion, velocidad: number | null, dil: Dilucion | null, dosis: DosisFila) => {
    if (velocidad === 0) return "suspendida";
    if (velocidad === null) return "";
    if (!dil) return "sin seteo";
    if (!dosis) return "";
    if (!dosis.ok) return dosis.motivo === "sin_peso" ? "falta peso" : "";
    const u = unidadCorta(dosis.unidad);
    return `${num(dosis.dosis, u === "U/min" ? 3 : u === "γ" ? 2 : 1)} ${u}`;
  };

  return (
    <div>
      {presentes.length === 0 && <div className="tiny muted">Sin bombas en esta hora.</div>}
      {filas.map(({ d, f, velocidad, dil, dosis, solucion, pideSeteo }) => (
        <div key={d} style={{ borderBottom: "1px solid var(--border-soft)", padding: "6px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>
              {DROGAS_INFUSION[d].etiqueta}
              {f.copiado && <span className="tiny muted" style={{ fontWeight: 400 }}> · copiado de la hora anterior</span>}
            </span>
            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button
                className="btn"
                style={{ minWidth: 40, fontSize: 18 }}
                aria-label="Bajar velocidad"
                onClick={() => cambiar(d, { velocidadTexto: aTexto(Math.max(0, (velocidad ?? 0) - PASO_BOMBA_ML_H)) })}
              >
                −
              </button>
              <input
                className="mini-input"
                inputMode="decimal"
                style={{ width: 72, fontSize: 20, fontWeight: 700, textAlign: "center", border: "2px solid var(--accent)" }}
                value={f.velocidadTexto}
                onChange={(e) => cambiar(d, { velocidadTexto: e.target.value })}
                aria-label={`${DROGAS_INFUSION[d].etiqueta} mL/h`}
              />
              <button
                className="btn"
                style={{ minWidth: 40, fontSize: 18 }}
                aria-label="Subir velocidad"
                onClick={() => cambiar(d, { velocidadTexto: aTexto((velocidad ?? 0) + PASO_BOMBA_ML_H) })}
              >
                +
              </button>
              <span className="tiny" style={{ minWidth: 70 }}>
                mL/h
                <span className="muted" style={{ display: "block" }}>
                  {textoDosis(d, velocidad, dil, dosis)}
                </span>
              </span>
              <button className="btn btn-sm" title="Sacar de esta hora" onClick={() => quitar(d)}>
                ×
              </button>
            </span>
          </div>

          {pideSeteo || seteando === d ? (
            <div style={{ paddingLeft: 8, borderLeft: `2px solid ${pideSeteo ? "var(--amber)" : "var(--border)"}`, marginTop: 4 }}>
              {pideSeteo && <div className="tiny" style={{ color: "var(--amber)" }}>Arranca en esta hora: seteo de la bomba.</div>}
              <SeteoBomba
                key={`${d}-${pideSeteo ? "arranque" : "cambio"}`}
                droga={d}
                inicial={dil ?? ultimaDilucion(infusiones, d)}
                solucionInicial={solucion}
                onListo={(estado, solucion) => {
                  cambiar(d, { dilucionNueva: estado, solucion });
                  setSeteando(null);
                }}
                onCancelar={pideSeteo ? undefined : () => setSeteando(null)}
              />
            </div>
          ) : dil ? (
            <div className="tiny muted" style={{ marginTop: 2 }}>
              {lineaSeteo(d, dil, solucion)}{" "}
              <button className="btn btn-sm" style={{ fontSize: 11, padding: "0 6px" }} onClick={() => setSeteando(d)}>
                cambiar
              </button>
            </div>
          ) : (
            <div className="tiny" style={{ marginTop: 2, color: "var(--amber)" }}>
              Sin seteo: suma al balance, sin dosis ni alarmas de dosis.{" "}
              <button className="btn btn-sm" style={{ fontSize: 11, padding: "0 6px" }} onClick={() => setSeteando(d)}>
                setear
              </button>
            </div>
          )}
        </div>
      ))}
      {faltaPeso && <PedirPeso onGuardar={onGuardarPeso} />}
      {faltantes.length > 0 && (
        <select
          className="mini-input"
          style={{ marginTop: 6 }}
          value=""
          onChange={(e) => e.target.value && cambiar(e.target.value as DrogaInfusion, { velocidadTexto: "", dilucionId: null, dilucionNueva: null })}
        >
          <option value="">+ Agregar bomba…</option>
          {faltantes.map((d) => (
            <option key={d} value={d}>
              {DROGAS_INFUSION[d].etiqueta}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
