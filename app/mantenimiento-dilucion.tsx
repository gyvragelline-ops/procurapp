"use client";

import { useState } from "react";
import {
  avisoDosisBomba,
  avisosSeteoBomba,
  bombasQueArrancan,
  concentracion,
  dilucionPorId,
  dosisDesdeVelocidad,
  seteoDesdeCampos,
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
  BOMBAS_VASOACTIVAS,
  DROGAS_INFUSION,
  OTRAS_INFUSIONES,
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

// Seteo de una bomba, en orden:
//   a) "¿Ampollas?" [cantidad] de [mg] mg (U para vasopresina e insulina,
//      mEq para potasio). La cantidad es OBLIGATORIA, sin valor por
//      defecto (al cambiar un seteo existente se muestra la actual).
//   b) "¿En cuánto la diluiste?" [mL]
// La solución es una opción chica plegada. Se confirma con "Listo"; sin
// fórmulas a la vista. Fuera de rango plausible: "¿seguro?" (no bloquea).
export function SeteoBomba({
  droga,
  inicial,
  nuevo,
  solucionInicial,
  onListo,
  onCancelar,
}: {
  droga: DrogaInfusion;
  inicial: Dilucion | null; // seteo actual, o el último del caso como guía del contenido por ampolla
  nuevo: boolean; // arranque o reinicio: la cantidad arranca vacía
  solucionInicial: Solucion;
  onListo: (estado: NonNullable<EstadoDilucion>, solucion: Solucion) => void;
  onCancelar?: () => void;
}) {
  const unidad = unidadesContenidoPara(droga)[0];
  const base: Dilucion | null = inicial ?? (droga === "noradrenalina" ? PRESET_NORADRENALINA : null);
  const [cantidad, setCantidad] = useState(nuevo ? "" : aTexto(base?.ampollas));
  const [ampolla, setAmpolla] = useState(aTexto(base?.contenidoPorAmpolla));
  const [volumen, setVolumen] = useState(nuevo ? "" : aTexto(base?.volumenFinalMl));
  const [solucion, setSolucion] = useState<Solucion>(solucionInicial);
  const [seguro, setSeguro] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function listo(confirmado = false) {
    setError(null);
    const r = seteoDesdeCampos(droga, { cantidad: aNumero(cantidad), contenidoPorAmpolla: aNumero(ampolla), volumenMl: aNumero(volumen) });
    if (!r.ok) return setError(r.error);
    const avisos = avisosSeteoBomba(droga, r.dilucion);
    if (avisos.length > 0 && !confirmado) return setSeguro(avisos);
    setSeguro(null);
    onListo({ dilucion: r.dilucion, concentracion: r.concentracion, unidad: r.unidad }, solucion);
  }

  const cambio = (set: (x: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    set(e.target.value);
    setSeguro(null);
  };

  return (
    <div style={{ padding: "6px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
        <span className="tiny" style={{ minWidth: 150 }}>¿Ampollas?</span>
        <input className="mini-input" inputMode="decimal" style={{ width: 52 }} value={cantidad} onChange={cambio(setCantidad)} aria-label="Cantidad de ampollas" />
        <span className="tiny">de</span>
        <input className="mini-input" inputMode="decimal" style={{ width: 60 }} value={ampolla} onChange={cambio(setAmpolla)} aria-label={`${unidad} por ampolla`} />
        <span className="tiny">{unidad === "U" ? "UI" : unidad}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span className="tiny" style={{ minWidth: 150 }}>¿En cuánto la diluiste?</span>
        <input className="mini-input" inputMode="decimal" style={{ width: 70 }} value={volumen} onChange={cambio(setVolumen)} aria-label="Volumen de dilución en mL" />
        <span className="tiny">mL</span>
      </div>
      {droga === "noradrenalina" && <div className="tiny muted">{PRESET_NORADRENALINA.aviso}</div>}
      <details style={{ marginTop: 4 }}>
        <summary className="tiny muted">Solución{textoSolucion(solucion) ? `: ${textoSolucion(solucion)}` : " (opcional)"}</summary>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", marginTop: 4 }}>
          {SOLUCIONES_DILUCION.map((s) => (
            <button
              key={s.valor}
              className={`btn btn-sm ${solucion?.tipo === s.valor ? "btn-accent" : ""}`}
              onClick={() => setSolucion(solucion?.tipo === s.valor ? null : { tipo: s.valor, otra: solucion?.otra ?? "" })}
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
      </details>
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
// La droga se marca una sola vez y se setea; en las horas siguientes
// queda marcada con su seteo guardado y solo se anota la velocidad
// (precargada con la de la hora anterior, "copiado"). Esa velocidad es
// el ingreso de la hora.
export type FilaBombaForm = {
  velocidadTexto: string;
  dilucionId: string | null; // seteo ya guardado que usa esta bomba
  dilucionNueva: EstadoDilucion; // seteo confirmado en este formulario (se guarda con la fila)
  solucion?: Solucion; // la elegida en este formulario; si no, la guardada con el seteo
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
  const cambiar = (d: DrogaInfusion, cambios: Partial<FilaBombaForm>) =>
    onChange({ ...form, [d]: { ...(form[d] ?? { velocidadTexto: "", dilucionId: null, dilucionNueva: null }), ...cambios, copiado: false } });
  const quitar = (d: DrogaInfusion) => {
    const resto = { ...form };
    delete resto[d];
    onChange(resto);
  };
  const marcar = (d: DrogaInfusion) => cambiar(d, { velocidadTexto: "", dilucionId: null, dilucionNueva: null });

  const filaDe = (d: DrogaInfusion) => {
    const f = form[d]!;
    const { velocidad, dil, dosis } = dosisDeFila(d, f, infusiones, pesoKg);
    const solucion = f.solucion !== undefined ? f.solucion : solucionPorId(infusiones, f.dilucionId);
    // Arranca o se reinicia (no venía corriendo en la hora anterior) y no
    // tiene seteo: se abre el seteo solo.
    const arranca = velocidad !== 0 && !precarga.some((p) => p.droga === d && p.velocidad_ml_h > 0);
    return { d, f, velocidad, dil, dosis, solucion, pideSeteo: arranca && !f.dilucionNueva && !f.dilucionId };
  };
  const marcadas = BOMBAS_ENFERMERIA.filter((d) => form[d]).map(filaDe);
  const faltaPeso = marcadas.some((x) => x.dosis && !x.dosis.ok && x.dosis.motivo === "sin_peso");

  const resultado = (velocidad: number | null, dil: Dilucion | null, dosis: DosisFila) => {
    if (velocidad === 0) return "suspendida";
    if (velocidad === null || !dil || !dosis) return "";
    if (!dosis.ok) return dosis.motivo === "sin_peso" ? "falta peso" : "";
    const u = unidadCorta(dosis.unidad);
    return `${num(dosis.dosis, u === "U/min" ? 3 : u === "γ" ? 2 : 1)} ${u}`;
  };

  const bloque = (d: DrogaInfusion) => {
    const { f, velocidad, dil, dosis, solucion, pideSeteo } = filaDe(d);
    const abierto = pideSeteo || seteando === d;
    return (
      <div key={d} style={{ borderBottom: "1px solid var(--border-soft)", padding: "6px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{DROGAS_INFUSION[d].etiqueta}</span>
          <button className="btn btn-sm" title="Desmarcar (sacar de esta hora)" onClick={() => quitar(d)}>
            ×
          </button>
        </div>

        {abierto ? (
          <div style={{ paddingLeft: 8, borderLeft: `2px solid ${pideSeteo ? "var(--amber)" : "var(--border)"}` }}>
            <SeteoBomba
              key={`${d}-${pideSeteo ? "nuevo" : "cambio"}`}
              droga={d}
              inicial={dil ?? ultimaDilucion(infusiones, d)}
              nuevo={pideSeteo}
              solucionInicial={solucion}
              onListo={(estado, sol) => {
                cambiar(d, { dilucionNueva: estado, solucion: sol });
                setSeteando(null);
              }}
              onCancelar={pideSeteo ? undefined : () => setSeteando(null)}
            />
          </div>
        ) : dil ? (
          <div className="tiny muted">
            {lineaSeteo(d, dil, solucion)}{" "}
            <button className="btn btn-sm" style={{ fontSize: 11, padding: "0 6px" }} onClick={() => setSeteando(d)}>
              cambiar
            </button>
          </div>
        ) : (
          <div className="tiny" style={{ color: "var(--amber)" }}>
            Sin seteo: suma al balance, sin dosis ni alarmas de dosis.{" "}
            <button className="btn btn-sm" style={{ fontSize: 11, padding: "0 6px" }} onClick={() => setSeteando(d)}>
              setear
            </button>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
          <span className="tiny" style={{ minWidth: 150 }}>
            ¿A cuánto tenés la bomba?
            {f.copiado && <span className="muted" style={{ display: "block" }}>copiado de la hora anterior</span>}
          </span>
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
            style={{ width: 76, fontSize: 20, fontWeight: 700, textAlign: "center", border: "2px solid var(--accent)" }}
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
          <span className="tiny">
            mL/h
            <span className="muted" style={{ display: "block" }}>
              {resultado(velocidad, dil, dosis)}
            </span>
          </span>
        </div>
      </div>
    );
  };

  const botonesMarcar = (lista: DrogaInfusion[]) => {
    const libres = lista.filter((d) => !form[d]);
    if (libres.length === 0) return null;
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
        {libres.map((d) => (
          <button key={d} className="btn btn-sm" onClick={() => marcar(d)}>
            + {DROGAS_INFUSION[d].etiqueta}
          </button>
        ))}
      </div>
    );
  };

  const otrasMarcadas = OTRAS_INFUSIONES.filter((d) => form[d]);

  return (
    <div>
      {BOMBAS_VASOACTIVAS.filter((d) => form[d]).map(bloque)}
      {botonesMarcar(BOMBAS_VASOACTIVAS)}
      <details open={otrasMarcadas.length > 0 || undefined} style={{ marginTop: 8 }}>
        <summary className="tiny">Otras infusiones{otrasMarcadas.length ? ` (${otrasMarcadas.length})` : ""}</summary>
        {otrasMarcadas.map(bloque)}
        {botonesMarcar(OTRAS_INFUSIONES)}
      </details>
      {faltaPeso && <PedirPeso onGuardar={onGuardarPeso} />}
    </div>
  );
}
