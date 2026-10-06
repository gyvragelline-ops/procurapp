"use client";

import { useState } from "react";
import {
  concentracion,
  textoConfirmacionDilucion,
  unidadesContenidoPara,
  type Dilucion,
} from "@/lib/procuracion/mantenimiento-calculos";
import { DROGAS_INFUSION, PRESET_NORADRENALINA, type Droga } from "@/lib/procuracion/mantenimiento-metas";
import { Confirmacion, ErrorVisible, aNumero, num } from "./mantenimiento-ui";

export type DrogaInfusion = Exclude<Droga, "desmopresina">;
export type EstadoDilucion = { dilucion: Dilucion; concentracion: number; unidad: string } | null;

// Dilución de una bomba, compartida por la vista del médico y la de
// enfermería. Regla: NUNCA se calcula sin una dilución confirmada con un
// toque ("8 mg en 100 mL = 80 mcg/mL. ¿Correcto?").
// - Iniciar una droga: arranca sin confirmar (precargada con la última
//   dilución del caso o, para noradrenalina, el preset) -> pide el toque.
// - Droga en curso con su dilución vigente (`vigente`): arranca
//   confirmada; cambiar solo la velocidad no repregunta. Tocar cualquier
//   dato de la dilución la desconfirma y vuelve a pedir el toque.
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
