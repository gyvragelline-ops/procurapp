"use client";

import { useState } from "react";
import {
  bombasQueArrancan,
  concentracion,
  dilucionPorId,
  dosisDesdeVelocidad,
  textoConfirmacionDilucion,
  ultimaDilucion,
  unidadesContenidoPara,
  type BombaFormulario,
  type Dilucion,
  type InfusionFila,
} from "@/lib/procuracion/mantenimiento-calculos";
import type { BombaParaGuardar } from "@/lib/procuracion/mantenimiento";
import {
  BOMBAS_ENFERMERIA,
  DROGAS_INFUSION,
  PASO_BOMBA_ML_H,
  PRESET_NORADRENALINA,
  type DrogaInfusion,
} from "@/lib/procuracion/mantenimiento-metas";
import { Confirmacion, ErrorVisible, PedirPeso, aNumero, num } from "./mantenimiento-ui";

export type { DrogaInfusion };
export type EstadoDilucion = { dilucion: Dilucion; concentracion: number; unidad: string } | null;

// Dilución de una bomba, compartida por la vista del médico y la de
// enfermería. Regla: NUNCA se calcula sin una dilución confirmada con un
// toque ("8 mg en 100 mL = 80 mcg/mL. ¿Correcto?").
// - Iniciar o reiniciar una droga: arranca sin confirmar (precargada con
//   la última dilución del caso o, para noradrenalina, el preset) -> pide
//   el toque.
// - Cambiar la dilución de una droga en curso: también pide el toque.
//   Cambiar solo la velocidad no la repregunta.
// Avisa al padre con onConfirmada(estado) / onConfirmada(null).
export default function DilucionBomba({
  droga,
  inicial,
  vigente,
  onConfirmada,
}: {
  droga: DrogaInfusion;
  inicial: Dilucion | null;
  vigente: boolean;
  onConfirmada: (estado: EstadoDilucion) => void;
}) {
  const unidades = unidadesContenidoPara(droga);
  const base: Dilucion | null = inicial ?? (droga === "noradrenalina" ? PRESET_NORADRENALINA : null);
  const [ampollas, setAmpollas] = useState(base ? String(base.ampollas).replace(".", ",") : "");
  const [contenido, setContenido] = useState(base ? String(base.contenidoPorAmpolla).replace(".", ",") : "");
  const [unidad, setUnidad] = useState<Dilucion["unidadContenido"]>(
    base && unidades.includes(base.unidadContenido) ? base.unidadContenido : unidades[0]
  );
  const [volumen, setVolumen] = useState(base ? String(base.volumenFinalMl).replace(".", ",") : "");
  const [confirmada, setConfirmada] = useState(vigente && inicial !== null);

  const a = aNumero(ampollas);
  const c = aNumero(contenido);
  const v = aNumero(volumen);
  const dilucion: Dilucion | null =
    a === null || c === null || v === null || [a, c, v].some(Number.isNaN)
      ? null
      : { ampollas: a, contenidoPorAmpolla: c, unidadContenido: unidad, volumenFinalMl: v };
  const conc = dilucion ? concentracion(droga, dilucion) : null;
  const texto = dilucion ? textoConfirmacionDilucion(droga, dilucion) : null;

  function cambio(set: (x: string) => void, valor: string) {
    set(valor);
    if (confirmada) {
      setConfirmada(false); // cambió la dilución: hay que confirmar de nuevo
      onConfirmada(null);
    }
  }

  function confirmar() {
    if (!dilucion || !conc?.ok) return;
    setConfirmada(true);
    onConfirmada({ dilucion, concentracion: conc.valor, unidad: conc.unidad });
  }

  return (
    <div style={{ padding: "6px 0" }}>
      <div className="field-row">
        <span className="field-label">Ampollas</span>
        <input className="mini-input" inputMode="decimal" style={{ width: 80 }} value={ampollas} onChange={(e) => cambio(setAmpollas, e.target.value)} />
      </div>
      <div className="field-row">
        <span className="field-label">Contenido por ampolla</span>
        <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <input className="mini-input" inputMode="decimal" style={{ width: 80 }} value={contenido} onChange={(e) => cambio(setContenido, e.target.value)} />
          {unidades.length === 1 ? (
            <span className="tiny">{unidades[0]}</span>
          ) : (
            <select
              className="mini-input"
              value={unidad}
              onChange={(e) => cambio((x) => setUnidad(x as Dilucion["unidadContenido"]), e.target.value)}
            >
              {unidades.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          )}
        </span>
      </div>
      {droga === "noradrenalina" && <div className="tiny muted">{PRESET_NORADRENALINA.aviso}</div>}
      <div className="field-row">
        <span className="field-label">Volumen final (mL)</span>
        <input className="mini-input" inputMode="decimal" style={{ width: 80 }} value={volumen} onChange={(e) => cambio(setVolumen, e.target.value)} />
      </div>

      {conc && !conc.ok && <ErrorVisible mensaje={conc.error} />}
      {!confirmada && texto && <Confirmacion texto={texto} textoSi="Sí, correcto" onSi={confirmar} onNo={() => onConfirmada(null)} />}
      {confirmada && conc?.ok && (
        <div className="tiny" style={{ color: "var(--green)" }}>
          Dilución confirmada ({DROGAS_INFUSION[droga].etiqueta}): {num(conc.totalDroga)} {conc.unidadTotal} en {num(dilucion!.volumenFinalMl)} mL ={" "}
          {num(conc.valor, 3)} {conc.unidad}
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
// guarde); guardar equivale a confirmar. La dilución se confirma con un
// toque solo al iniciar o reiniciar una bomba o al cambiar la dilución.
export type FilaBombaForm = {
  velocidadTexto: string;
  dilucionId: string | null; // dilución ya guardada que usa esta bomba
  dilucionNueva: EstadoDilucion; // confirmada en este formulario (se guarda con la fila)
  copiado: boolean;
};
export type BombasForm = Partial<Record<DrogaInfusion, FilaBombaForm>>;

const aTexto = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));

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
      dilucionNueva: f.dilucionNueva ? { ...f.dilucionNueva, motivo: arranca ? "inicio" : "cambio_dilucion" } : null,
    });
  }
  return { ok: true, filas };
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
  const [cambiandoDilucion, setCambiandoDilucion] = useState<DrogaInfusion | null>(null);
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
    const v = aNumero(f.velocidadTexto);
    const velocidad = v === null || Number.isNaN(v) ? null : v;
    const arranca = velocidad !== null && bombasQueArrancan(precarga, [{ droga: d, velocidad_ml_h: velocidad, dilucion_id: null }]).length > 0;
    const dil = f.dilucionNueva?.dilucion ?? dilucionPorId(infusiones, f.dilucionId);
    const conc = dil ? concentracion(d, dil) : null;
    const dosis = conc?.ok && velocidad !== null && velocidad > 0 ? dosisDesdeVelocidad(d, velocidad, conc.valor, pesoKg) : null;
    return { d, f, velocidad, dil, dosis, pideDilucion: arranca && !f.dilucionNueva && !f.dilucionId };
  });
  const faltaPeso = filas.some((x) => x.dosis && !x.dosis.ok && x.dosis.motivo === "sin_peso");

  return (
    <div>
      {presentes.length === 0 && <div className="tiny muted">Sin bombas en esta hora.</div>}
      {filas.map(({ d, f, velocidad, dil, dosis, pideDilucion }) => {
        return (
          <div key={d} style={{ borderBottom: "1px solid var(--border-soft)", padding: "4px 0" }}>
            <div className="field-row">
              <span className="field-label">
                {DROGAS_INFUSION[d].etiqueta}
                {f.copiado && <span className="tiny muted"> · copiado de la hora anterior</span>}
                <span className="tiny muted" style={{ display: "block" }}>
                  {velocidad === 0
                    ? "Suspendida (0 mL/h): no se precarga la hora siguiente."
                    : dosis?.ok
                      ? `= ${dosis.cuenta}`
                      : dosis && !dosis.ok && dosis.motivo === "sin_peso"
                        ? "Falta peso: dosis sin calcular."
                        : velocidad !== null && !dil
                          ? "Sin dilución confirmada: suma al balance, sin dosis ni alarmas de dosis."
                          : ""}
                </span>
              </span>
              <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <button className="btn btn-sm" onClick={() => cambiar(d, { velocidadTexto: aTexto(Math.max(0, (velocidad ?? 0) - PASO_BOMBA_ML_H)) })}>
                  −
                </button>
                <input
                  className="mini-input"
                  inputMode="decimal"
                  style={{ width: 56 }}
                  value={f.velocidadTexto}
                  onChange={(e) => cambiar(d, { velocidadTexto: e.target.value })}
                  aria-label={`${DROGAS_INFUSION[d].etiqueta} mL/h`}
                />
                <button className="btn btn-sm" onClick={() => cambiar(d, { velocidadTexto: aTexto((velocidad ?? 0) + PASO_BOMBA_ML_H) })}>
                  +
                </button>
                <button className="btn btn-sm" title="Sacar de esta hora" onClick={() => quitar(d)}>
                  ×
                </button>
              </span>
            </div>
            {pideDilucion && (
              <div style={{ paddingLeft: 8, borderLeft: "2px solid var(--amber)" }}>
                <div className="tiny" style={{ color: "var(--amber)" }}>Arranca en esta hora: confirmá la dilución.</div>
                <DilucionBomba
                  key={`${d}-arranque`}
                  droga={d}
                  inicial={ultimaDilucion(infusiones, d)}
                  vigente={false}
                  onConfirmada={(est) => cambiar(d, { dilucionNueva: est })}
                />
              </div>
            )}
            {!pideDilucion && (
              <>
                {f.dilucionNueva && (
                  <div className="tiny" style={{ color: "var(--green)" }}>
                    Dilución nueva confirmada: {num(f.dilucionNueva.concentracion, 3)} {f.dilucionNueva.unidad} (se guarda con la hora).
                  </div>
                )}
                {cambiandoDilucion === d ? (
                  <div style={{ paddingLeft: 8, borderLeft: "2px solid var(--border)" }}>
                    <DilucionBomba
                      key={`${d}-cambio`}
                      droga={d}
                      inicial={dil}
                      vigente={false}
                      onConfirmada={(est) => {
                        cambiar(d, { dilucionNueva: est });
                        if (est) setCambiandoDilucion(null);
                      }}
                    />
                    <button className="btn btn-sm" onClick={() => setCambiandoDilucion(null)}>
                      Cerrar
                    </button>
                  </div>
                ) : (
                  <button className="btn btn-sm" style={{ fontSize: 11 }} onClick={() => setCambiandoDilucion(d)}>
                    {dil ? "Cambió la dilución" : "Confirmar dilución"}
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}
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
              {DROGAS_INFUSION[d].etiqueta} ({DROGAS_INFUSION[d].unidadDosis})
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
