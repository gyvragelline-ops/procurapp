"use client";

import { useState } from "react";
import {
  avisoDosisBomba,
  avisosSeteoBomba,
  bombasQueArrancan,
  concentracion,
  dilucionPorId,
  dosisDesdeVelocidad,
  fraseSeteo,
  ordenarBombas,
  seteoDesdeCampos,
  solucionPorId,
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
  EJEMPLO_AMPOLLA,
  OTRAS_INFUSIONES,
  PASO_BOMBA_ML_H,
  SOLUCIONES_DILUCION,
  type DrogaInfusion,
} from "@/lib/procuracion/mantenimiento-metas";
import { Confirmacion, ErrorVisible, PedirPeso, aNumero, num } from "./mantenimiento-ui";

export type { DrogaInfusion, Solucion };
export type EstadoDilucion = { dilucion: Dilucion; concentracion: number; unidad: string } | null;

const aTexto = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));
// Unidad del contenido de la ampolla, como se muestra (U -> UI).
const unidadVisible = (droga: DrogaInfusion) => {
  const u = unidadesContenidoPara(droga)[0];
  return u === "U" ? "UI" : u;
};

export function textoSolucion(s: Solucion): string | null {
  if (!s) return null;
  if (s.tipo === "otra") return s.otra.trim() || "Otra";
  return SOLUCIONES_DILUCION.find((x) => x.valor === s.tipo)?.etiqueta ?? null;
}

// "Noradrenalina · 2 ampollas de 4 mg en 100 mL · Dextrosa 5 %"
export function lineaSeteo(droga: DrogaInfusion, d: Dilucion, solucion: Solucion): string {
  const frase = fraseSeteo({ cantidad: d.ampollas, contenidoPorAmpolla: d.contenidoPorAmpolla, volumenMl: d.volumenFinalMl }, unidadVisible(droga));
  const sol = textoSolucion(solucion);
  return `${DROGAS_INFUSION[droga].etiqueta} · ${frase}${sol ? ` · ${sol}` : ""}`;
}

// Pregunta numerada con su campo debajo, centrado y sin partirse en dos
// renglones (el campo y su unidad van juntos).
function Pregunta({ n, texto, children }: { n: number; texto: string; children: React.ReactNode }) {
  return (
    <div style={{ textAlign: "center", margin: "8px 0" }}>
      <div className="tiny" style={{ marginBottom: 4 }}>
        {n}. {texto}
      </div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>{children}</div>
    </div>
  );
}

// Preguntas 1 a 3 (el seteo). Arrancan vacías (los ejemplos son solo
// placeholder); al reabrir con "cambiar" muestran el seteo actual. Con los
// tres datos, una frase en lenguaje común. "Listo" lo confirma; fuera de
// rango, "¿seguro?" (no bloquea).
export function SeteoBomba({
  droga,
  actual,
  solucionInicial,
  onListo,
  onCancelar,
}: {
  droga: DrogaInfusion;
  actual: Dilucion | null; // seteo vigente (al "cambiar"); null = nuevo, todo vacío
  solucionInicial: Solucion;
  onListo: (estado: NonNullable<EstadoDilucion>, solucion: Solucion) => void;
  onCancelar?: () => void;
}) {
  const unidad = unidadVisible(droga);
  const [cantidad, setCantidad] = useState(aTexto(actual?.ampollas));
  const [contenido, setContenido] = useState(aTexto(actual?.contenidoPorAmpolla));
  const [volumen, setVolumen] = useState(aTexto(actual?.volumenFinalMl));
  const [solucion, setSolucion] = useState<Solucion>(solucionInicial);
  const [seguro, setSeguro] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const campos = { cantidad: aNumero(cantidad), contenidoPorAmpolla: aNumero(contenido), volumenMl: aNumero(volumen) };
  const frase = fraseSeteo(campos, unidad);

  function listo(confirmado = false) {
    setError(null);
    const r = seteoDesdeCampos(droga, campos);
    if (!r.ok) return setError(r.error);
    const avisos = avisosSeteoBomba(droga, r.dilucion);
    if (avisos.length > 0 && !confirmado) return setSeguro(avisos);
    setSeguro(null);
    onListo({ dilucion: r.dilucion, concentracion: r.concentracion, unidad: r.unidad }, solucion);
  }
  const input = (valor: string, set: (x: string) => void, placeholder: string, etiqueta: string, ancho = 64) => (
    <input
      className="mini-input"
      inputMode="decimal"
      placeholder={placeholder}
      aria-label={etiqueta}
      style={{ width: ancho, textAlign: "center" }}
      value={valor}
      onChange={(e) => {
        set(e.target.value);
        setSeguro(null);
      }}
    />
  );

  return (
    <div>
      <Pregunta n={1} texto="¿Cuántas ampollas usaste?">
        {input(cantidad, setCantidad, "ej. 2", "Cantidad de ampollas")}
        <span className="tiny">ampollas</span>
      </Pregunta>
      <Pregunta n={2} texto={`¿De cuántos ${unidad} es cada ampolla?`}>
        {input(contenido, setContenido, EJEMPLO_AMPOLLA[droga], `${unidad} por ampolla`)}
        <span className="tiny">{unidad}</span>
      </Pregunta>
      <Pregunta n={3} texto="¿En cuántos mL la diluiste?">
        {input(volumen, setVolumen, "ej. 100", "Volumen de dilución", 72)}
        <span className="tiny">mL</span>
      </Pregunta>
      {frase && (
        <div className="tiny" style={{ textAlign: "center", fontWeight: 600 }}>
          {frase}
        </div>
      )}
      <details style={{ textAlign: "center", marginTop: 4 }}>
        <summary className="tiny muted">Solución{textoSolucion(solucion) ? `: ${textoSolucion(solucion)}` : ""}</summary>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center", marginTop: 4 }}>
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
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 6 }}>
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
// La droga se elige una sola vez y se setea; en las horas siguientes
// queda con su seteo guardado (línea corta) y la velocidad precargada de
// la hora anterior. Esa velocidad es el ingreso de la hora.
export type FilaBombaForm = {
  velocidadTexto: string;
  dilucionId: string | null; // seteo ya guardado que usa esta bomba
  dilucionNueva: EstadoDilucion; // seteo confirmado con "Listo" en este formulario
  solucion?: Solucion; // la elegida en este formulario; si no, la guardada con el seteo
  copiado: boolean;
};
export type BombasForm = Partial<Record<DrogaInfusion, FilaBombaForm>>;

export function bombasFormDesde(filas: BombaFormulario[], copiado: boolean): BombasForm {
  const form: BombasForm = {};
  for (const f of filas) form[f.droga] = { velocidadTexto: aTexto(f.velocidad_ml_h), dilucionId: f.dilucion_id, dilucionNueva: null, copiado };
  return form;
}

// Formulario -> lo que se guarda. Cada bomba elegida necesita las cuatro
// respuestas: el seteo (confirmado con "Listo") y la velocidad. 0 =
// suspendida (queda anotada, no se precarga después).
export function bombasParaGuardar(
  form: BombasForm,
  precarga: BombaFormulario[]
): { ok: true; filas: BombaParaGuardar[] } | { ok: false; error: string } {
  const filas: BombaParaGuardar[] = [];
  for (const d of BOMBAS_ENFERMERIA) {
    const f = form[d];
    if (!f) continue;
    const etiqueta = DROGAS_INFUSION[d].etiqueta;
    if (!f.dilucionNueva && !f.dilucionId) return { ok: false, error: `${etiqueta}: completá las preguntas 1 a 3 y tocá "Listo".` };
    const v = aNumero(f.velocidadTexto);
    if (v === null) return { ok: false, error: `${etiqueta}: falta "¿A cuánto tenés la bomba?".` };
    if (Number.isNaN(v) || v < 0) return { ok: false, error: `${etiqueta}: velocidad inválida (mL/h).` };
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
  infusiones,
  pesoKg,
  onGuardarPeso,
}: {
  form: BombasForm;
  onChange: (f: BombasForm) => void;
  precarga?: BombaFormulario[];
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
  const elegir = (d: DrogaInfusion) => cambiar(d, { velocidadTexto: "", dilucionId: null, dilucionNueva: null });

  const elegidas = ordenarBombas(BOMBAS_ENFERMERIA.filter((d) => form[d]));
  const datos = elegidas.map((d) => {
    const f = form[d]!;
    const { velocidad, dil, dosis } = dosisDeFila(d, f, infusiones, pesoKg);
    const solucion = f.solucion !== undefined ? f.solucion : solucionPorId(infusiones, f.dilucionId);
    return { d, f, velocidad, dil, dosis, solucion };
  });
  const faltaPeso = datos.some((x) => x.dosis && !x.dosis.ok && x.dosis.motivo === "sin_peso");
  const hayCopiadas = datos.some((x) => x.f.copiado);

  const resultado = (velocidad: number | null, dosis: DosisFila) => {
    if (velocidad === 0) return "suspendida";
    if (!dosis) return "";
    if (!dosis.ok) return dosis.motivo === "sin_peso" ? "falta peso" : "";
    const u = unidadCorta(dosis.unidad);
    return `${num(dosis.dosis, u === "U/min" ? 3 : u === "γ" ? 2 : 1)} ${u}`;
  };

  const tarjeta = ({ d, f, velocidad, dil, dosis, solucion }: (typeof datos)[number]) => {
    // Sin seteo (recién elegida o reiniciada): las preguntas 1 a 3 abiertas.
    const sinSeteo = !f.dilucionNueva && !f.dilucionId;
    const abierto = sinSeteo || seteando === d;
    return (
      <div
        key={d}
        style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px", margin: "8px auto", maxWidth: 380, position: "relative" }}
      >
        <div style={{ textAlign: "center", fontWeight: 700 }}>{DROGAS_INFUSION[d].etiqueta}</div>
        <button
          className="btn btn-sm"
          title="Sacar esta bomba de la hora"
          aria-label={`Sacar ${DROGAS_INFUSION[d].etiqueta}`}
          style={{ position: "absolute", top: 6, right: 6 }}
          onClick={() => quitar(d)}
        >
          ×
        </button>

        {abierto ? (
          <SeteoBomba
            key={`${d}-${sinSeteo ? "nuevo" : "cambio"}`}
            droga={d}
            actual={sinSeteo ? null : dil}
            solucionInicial={solucion}
            onListo={(estado, sol) => {
              cambiar(d, { dilucionNueva: estado, solucion: sol });
              setSeteando(null);
            }}
            onCancelar={sinSeteo ? undefined : () => setSeteando(null)}
          />
        ) : (
          dil && (
            <div className="tiny muted" style={{ textAlign: "center", marginTop: 2 }}>
              {lineaSeteo(d, dil, solucion)}{" "}
              <button className="btn btn-sm" style={{ fontSize: 11, padding: "0 6px" }} onClick={() => setSeteando(d)}>
                cambiar
              </button>
            </div>
          )
        )}

        <Pregunta n={4} texto="¿A cuánto tenés la bomba?">
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
            placeholder="ej. 10"
            style={{ width: 80, fontSize: 20, fontWeight: 700, textAlign: "center", border: "2px solid var(--accent)" }}
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
          <span className="tiny">mL/h</span>
        </Pregunta>
        {resultado(velocidad, dosis) && (
          <div className="tiny muted" style={{ textAlign: "center" }}>
            {resultado(velocidad, dosis)}
          </div>
        )}
      </div>
    );
  };

  const botones = (lista: DrogaInfusion[]) => {
    const libres = lista.filter((d) => !form[d]);
    if (libres.length === 0) return null;
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", margin: "6px 0" }}>
        {libres.map((d) => (
          <button key={d} className="btn btn-sm" onClick={() => elegir(d)}>
            {DROGAS_INFUSION[d].etiqueta}
          </button>
        ))}
      </div>
    );
  };

  const otrasElegidas = datos.filter((x) => OTRAS_INFUSIONES.includes(x.d));
  return (
    <div>
      {hayCopiadas && (
        <div className="tiny muted" style={{ textAlign: "center" }}>
          Velocidades copiadas de la hora anterior.
        </div>
      )}
      {botones(BOMBAS_VASOACTIVAS)}
      {datos.filter((x) => BOMBAS_VASOACTIVAS.includes(x.d)).map(tarjeta)}
      <details open={otrasElegidas.length > 0 || undefined} style={{ marginTop: 8 }}>
        <summary className="tiny">Otras infusiones{otrasElegidas.length ? ` (${otrasElegidas.length})` : ""}</summary>
        {botones(OTRAS_INFUSIONES)}
        {otrasElegidas.map(tarjeta)}
      </details>
      {faltaPeso && <PedirPeso onGuardar={onGuardarPeso} />}
    </div>
  );
}
