"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  guardarBombasDeFila,
  guardarRegistro,
  type DatosRegistro,
  type RegistroMantenimiento,
} from "@/lib/procuracion/mantenimiento";
import { anularValorLaboratorio, guardarGlucemia, type ValorLaboratorio } from "@/lib/procuracion/laboratorio-valores";
import {
  alarmasEnfermeria,
  balancePorHora,
  bombasDeFila,
  camposFueraDeRango,
  filaPrecargada,
  horasDelCaso,
  inicioDeHora,
  ordenarPorHora,
  perdidasDeFila,
  registroDeLaHora,
  totalesHora,
  type BombaFormulario,
  type BombaHora,
  type CampoLiquido,
  type EstadoBombas,
  type FilaHoraria,
  type InfusionFila,
} from "@/lib/procuracion/mantenimiento-calculos";
import { BOTONES_RAPIDOS_ML, LIQUIDOS_ENFERMERIA } from "@/lib/procuracion/mantenimiento-metas";
import { BombasDeLaHora, bombasFormDesde, bombasParaGuardar, type BombasForm } from "./mantenimiento-dilucion";
import { Bolos, BombasEnCurso } from "./mantenimiento-infusiones";
import { Confirmacion, ErrorVisible, PedirPeso, aInputLocal, aNumero, esFutura, fechaHora, hora, momentoActual, num } from "./mantenimiento-ui";

const supabase = createClient();

// Signos de enfermería (PVC queda solo en la vista del médico).
type Signo = "temperatura" | "pam" | "fc" | "sat_o2";
const SIGNOS: { campo: Signo; etiqueta: string; unidad: string }[] = [
  { campo: "temperatura", etiqueta: "Temperatura", unidad: "°C" },
  { campo: "pam", etiqueta: "TAM", unidad: "mmHg" },
  { campo: "fc", etiqueta: "FC", unidad: "lpm" },
  { campo: "sat_o2", etiqueta: "Saturación", unidad: "%" },
];

type Liquido = { texto: string; copiado: boolean };
const LIQUIDOS_VACIOS = Object.fromEntries(LIQUIDOS_ENFERMERIA.map((l) => [l.campo, { texto: "", copiado: false }])) as Record<CampoLiquido, Liquido>;

const textoHora = (ms: number) => `${String(new Date(ms).getHours()).padStart(2, "0")}:00`;
const aTexto = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));
const numeroO = (t: string): number | null => {
  const n = aNumero(t);
  return n === null || Number.isNaN(n) ? null : n;
};

// Vista de ENFERMERÍA (planilla horaria del OP2). Una fila por hora de
// reloj, precargada con las bombas y los líquidos de la hora anterior;
// guardar equivale a confirmar. La app calcula totales, pérdidas
// insensibles y balance (el enfermero nunca suma). Una sola fuente: si
// ya hay un registro en esa hora (aunque sea del médico) se completa ese.
export default function MantenimientoEnfermeria({
  donanteId,
  pesoKg,
  registros,
  infusiones,
  bombas,
  lab,
  estado,
  ahora,
  onRegistrosChange,
  onInfusionesChange,
  onBombasChange,
  onLabChange,
  onGuardarPeso,
}: {
  donanteId: string;
  pesoKg: number | null;
  registros: RegistroMantenimiento[];
  infusiones: InfusionFila[];
  bombas: BombaHora[];
  lab: ValorLaboratorio[];
  estado: EstadoBombas;
  ahora: number;
  onRegistrosChange: (r: RegistroMantenimiento[]) => void;
  onInfusionesChange: (f: InfusionFila[]) => void;
  onBombasChange: (b: BombaHora[]) => void;
  onLabChange: (v: ValorLaboratorio[]) => void;
  onGuardarPeso: (pesoKg: number) => Promise<void>;
}) {
  const [solapa, setSolapa] = useState<"hora" | "bolos">("hora");
  const [horaSel, setHoraSel] = useState<number | null>(null);
  const [liquidos, setLiquidos] = useState<Record<CampoLiquido, Liquido>>(LIQUIDOS_VACIOS);
  const [diuresis, setDiuresis] = useState("");
  const [sng, setSng] = useState("");
  const [perdidasManual, setPerdidasManual] = useState<string | null>(null); // null = usar el cálculo
  const [signos, setSignos] = useState<Partial<Record<Signo, string>>>({});
  const [glucemia, setGlucemia] = useState("");
  const [glucemiaHora, setGlucemiaHora] = useState("");
  const [bombasForm, setBombasForm] = useState<BombasForm>({});
  const [precarga, setPrecarga] = useState<BombaFormulario[]>([]);
  const [cargadoPor, setCargadoPor] = useState("");
  const [aviso, setAviso] = useState("");
  const [pendiente, setPendiente] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const horaActual = inicioDeHora(ahora);
  const grilla = horasDelCaso(registros, ahora);
  const alarmas = alarmasEnfermeria(grilla);
  const balance = balancePorHora(registros, bombas, pesoKg, ahora);
  const ultimaGlucemia = ordenarPorHora(
    lab.filter((v) => v.parametro === "glucemia" && !v.anulado).map((v) => ({ ...v, registrado_en: v.medido_en }))
  ).pop() ?? null;

  // ---------------------------------------------------------- abrir una hora
  function abrirHora(inicio: number) {
    const reg = registroDeLaHora(registros, inicio);
    const pre = filaPrecargada(registros, bombas, infusiones, inicio);
    const anterior = ordenarPorHora(registros.filter((r) => !r.anulado && inicioDeHora(new Date(r.registrado_en).getTime()) < inicio)).pop() ?? null;
    const liq = { ...LIQUIDOS_VACIOS };
    for (const l of LIQUIDOS_ENFERMERIA) {
      liq[l.campo] = reg
        ? { texto: aTexto(reg[l.campo]), copiado: false }
        : { texto: aTexto(pre.liquidos[l.campo] ?? null), copiado: pre.liquidos[l.campo] !== undefined };
    }
    setLiquidos(liq);
    setPrecarga(pre.bombas);
    setBombasForm(
      reg
        ? bombasFormDesde(
            bombasDeFila(bombas, reg.id).map((b) => ({ droga: b.droga, velocidad_ml_h: b.velocidad_ml_h, dilucion_id: b.dilucion_id })),
            false
          )
        : bombasFormDesde(pre.bombas, true)
    );
    setDiuresis(aTexto(reg?.diuresis_ml));
    setSng(aTexto(reg?.egr_sng_drenajes_ml));
    setPerdidasManual(reg?.perdidas_insensibles_editadas ? aTexto(reg.perdidas_insensibles_ml) : null);
    setSignos(reg ? Object.fromEntries(SIGNOS.map((s) => [s.campo, aTexto(reg[s.campo])])) : {});
    setGlucemia("");
    setGlucemiaHora(aInputLocal(new Date(momentoActual()).toISOString()));
    setCargadoPor(reg?.cargado_por ?? anterior?.cargado_por ?? "");
    setAviso(reg?.aviso_medico ?? "");
    setPendiente(null);
    setError(null);
    setHoraSel(inicio);
  }

  // ---------------------------------------------------------- derivados de la fila abierta
  const reg = horaSel !== null ? registroDeLaHora(registros, horaSel) : null;
  const esHoraActual = horaSel === horaActual;
  const filaForm: FilaHoraria | null =
    horaSel === null
      ? null
      : {
          id: reg?.id ?? "nueva",
          registrado_en: reg?.registrado_en ?? new Date(horaSel).toISOString(),
          anulado: false,
          temperatura: numeroO(signos.temperatura ?? ""),
          diuresis_ml: numeroO(diuresis),
          egr_sng_drenajes_ml: numeroO(sng),
          perdidas_insensibles_ml: perdidasManual !== null ? numeroO(perdidasManual) : null,
          perdidas_insensibles_editadas: perdidasManual !== null,
          ...(Object.fromEntries(LIQUIDOS_ENFERMERIA.map((l) => [l.campo, numeroO(liquidos[l.campo].texto)])) as Record<CampoLiquido, number | null>),
        };
  const otros = registros.filter((r) => r.id !== reg?.id);
  const perdidas = filaForm ? perdidasDeFila(filaForm, [...otros, filaForm], pesoKg) : null;
  const velocidadesForm = Object.values(bombasForm).map((f) => ({ velocidad_ml_h: numeroO(f?.velocidadTexto ?? "") ?? 0 }));
  const totales = filaForm ? totalesHora(filaForm, velocidadesForm, perdidas?.valor ?? null) : null;
  const acumuladoPrevio =
    horaSel === null
      ? 0
      : balance.horas.reduce((acc, h) => (h.estado === "cargada" && h.inicio < horaSel ? h.acumulado : acc), 0);

  // ---------------------------------------------------------- guardar
  async function guardar(confirmadoPlausible = false) {
    if (horaSel === null) return;
    setError(null);
    const valores: Record<string, number | null> = {};
    for (const l of LIQUIDOS_ENFERMERIA) {
      const n = aNumero(liquidos[l.campo].texto);
      if (n !== null && Number.isNaN(n)) return setError(`Valor inválido en ${l.etiqueta}.`);
      valores[l.campo] = n;
    }
    for (const [campo, texto, etiqueta] of [
      ["diuresis_ml", diuresis, "Diuresis"],
      ["egr_sng_drenajes_ml", sng, "SNG / drenajes"],
    ] as const) {
      const n = aNumero(texto);
      if (n !== null && Number.isNaN(n)) return setError(`Valor inválido en ${etiqueta}.`);
      valores[campo] = n;
    }
    let perdidasEditadas: number | null = null;
    if (perdidasManual !== null) {
      const n = aNumero(perdidasManual);
      if (n === null || Number.isNaN(n) || n < 0) return setError("Pérdidas insensibles inválidas.");
      perdidasEditadas = n;
    }
    for (const s of SIGNOS) {
      const n = aNumero(signos[s.campo] ?? "");
      if (n !== null && Number.isNaN(n)) return setError(`Valor inválido en ${s.etiqueta}.`);
      valores[s.campo] = n;
    }
    const glu = aNumero(glucemia);
    if (glu !== null && (Number.isNaN(glu) || glu <= 0)) return setError("Glucemia inválida (mg/dL).");
    let gluIso: string | null = null;
    if (glu !== null) {
      if (!glucemiaHora) return setError("Falta la hora de medición de la glucemia.");
      gluIso = new Date(glucemiaHora).toISOString();
      if (esFutura(gluIso)) return setError("La hora de medición de la glucemia no puede ser futura.");
    }
    const pb = bombasParaGuardar(bombasForm, precarga);
    if (!pb.ok) return setError(pb.error);

    const fuera = camposFueraDeRango({
      ...valores,
      ...(perdidasEditadas !== null ? { perdidas_insensibles_ml: perdidasEditadas } : {}),
      ...(glu !== null ? { glucemia: glu } : {}),
    });
    if (fuera.length > 0 && !confirmadoPlausible) {
      const etiqueta = (campo: string) =>
        LIQUIDOS_ENFERMERIA.find((l) => l.campo === campo)?.etiqueta ??
        SIGNOS.find((s) => s.campo === campo)?.etiqueta ??
        ({ diuresis_ml: "Diuresis", egr_sng_drenajes_ml: "SNG / drenajes", perdidas_insensibles_ml: "Pérdidas insensibles", glucemia: "Glucemia" } as Record<string, string>)[campo] ??
        campo;
      return setPendiente(
        `¿Seguro? Fuera del rango esperable: ${fuera.map((f) => `${etiqueta(f.campo)} ${num(f.valor)} (${num(f.min)}-${num(f.max)})`).join("; ")}.`
      );
    }

    setGuardando(true);
    try {
      // 1) La fila de la hora (completa la existente o crea una a hh:00).
      const registradoEn = reg?.registrado_en ?? new Date(horaSel).toISOString();
      const anteriorVigente = otros.some((r) => !r.anulado && r.registrado_en < registradoEn);
      const datos: DatosRegistro = {
        registrado_en: registradoEn,
        ...valores,
        diuresis_es_ultima_hora: !anteriorVigente,
        perdidas_insensibles_ml: perdidasEditadas,
        perdidas_insensibles_editadas: perdidasEditadas !== null,
        cargado_por: cargadoPor.trim() || null,
        aviso_medico: aviso.trim() || null,
      };
      const guardado = await guardarRegistro(supabase, donanteId, datos, reg?.id ?? null);
      onRegistrosChange(reg ? registros.map((r) => (r.id === reg.id ? guardado : r)) : [...registros, guardado]);

      // 2) Bombas de la hora (y las diluciones confirmadas con el toque).
      const instante = esHoraActual ? new Date(momentoActual()).toISOString() : registradoEn;
      const { nuevasInfusiones, bombas: deLaFila } = await guardarBombasDeFila(
        supabase,
        donanteId,
        guardado.id,
        pb.filas,
        instante,
        cargadoPor.trim() || null
      );
      if (nuevasInfusiones.length) onInfusionesChange([...infusiones, ...nuevasInfusiones]);
      onBombasChange([...bombas.filter((b) => b.registro_id !== guardado.id), ...deLaFila]);

      // 3) Glucemia: va a laboratorio_valores (una sola fuente), con su hora de medición.
      if (glu !== null && gluIso) {
        const v = await guardarGlucemia(supabase, donanteId, glu, gluIso, "enfermeria");
        onLabChange([v, ...lab]);
      }
      setHoraSel(null);
      setPendiente(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la hora.");
    } finally {
      setGuardando(false);
    }
  }

  // "Corregir" glucemia: un toque anula el valor y abre uno nuevo con
  // el valor y la hora anteriores para editar.
  async function corregirGlucemia(v: ValorLaboratorio) {
    setError(null);
    try {
      await anularValorLaboratorio(supabase, v.id);
      onLabChange(lab.map((x) => (x.id === v.id ? { ...x, anulado: true } : x)));
      setGlucemia(aTexto(v.valor));
      setGlucemiaHora(aInputLocal(v.medido_en));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo anular la glucemia.");
    }
  }

  // ---------------------------------------------------------- UI
  const cambiarLiquido = (campo: CampoLiquido, texto: string) => setLiquidos((l) => ({ ...l, [campo]: { texto, copiado: false } }));
  const sumarLiquido = (campo: CampoLiquido, ml: number) =>
    setLiquidos((l) => ({ ...l, [campo]: { texto: aTexto((numeroO(l[campo].texto) ?? 0) + ml), copiado: false } }));

  return (
    <div>
      {/* ------------------------------------------------ arriba: hora y botón grande */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{hora(new Date(ahora).toISOString())}</div>
          <div className="tiny muted">
            Balance acumulado: {num(balance.acumulado, 0)} mL
            {balance.faltan > 0 && (
              <span style={{ color: "var(--red)" }}>
                {" "}
                · faltan {balance.faltan} {balance.faltan === 1 ? "hora" : "horas"}
              </span>
            )}
            {balance.horasSinPerdidas > 0 && !pesoKg && <span style={{ color: "var(--amber)" }}> · falta peso: balance sin pérdidas insensibles</span>}
          </div>
        </div>
        <button
          className="btn btn-accent"
          style={{ fontSize: 16, padding: "12px 18px" }}
          onClick={() => {
            setSolapa("hora");
            abrirHora(horaActual);
          }}
        >
          Cargar hora {textoHora(horaActual)}
        </button>
      </div>

      {alarmas.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {alarmas.map((a) => (
            <button
              key={a.inicio}
              className="btn btn-sm"
              style={{ color: "var(--red)", marginRight: 6, marginBottom: 4 }}
              onClick={() => {
                setSolapa("hora");
                abrirHora(a.inicio);
              }}
            >
              ● {a.texto}
            </button>
          ))}
        </div>
      )}

      <div className="btn-row" style={{ marginBottom: 10 }}>
        <button className={`btn btn-sm ${solapa === "hora" ? "btn-accent" : ""}`} onClick={() => setSolapa("hora")}>
          Hora
        </button>
        <button className={`btn btn-sm ${solapa === "bolos" ? "btn-accent" : ""}`} onClick={() => setSolapa("bolos")}>
          Bolos
        </button>
      </div>

      {solapa === "bolos" ? (
        <Bolos donanteId={donanteId} infusiones={infusiones} onInfusionesChange={onInfusionesChange} />
      ) : (
        <>
          <details style={{ marginBottom: 10 }}>
            <summary className="tiny">Bombas en curso (dosis en vivo){estado.filaDato ? ` · última fila ${hora(estado.filaDato)}` : ""}</summary>
            <BombasEnCurso estado={estado} donanteId={donanteId} pesoKg={pesoKg} infusiones={infusiones} onInfusionesChange={onInfusionesChange} />
          </details>

          {/* ------------------------------------------------ grilla de horas */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
            {grilla.map((g) => (
              <button
                key={g.inicio}
                className="btn btn-sm"
                title={g.estado === "cargada" ? "Cargada" : g.estado === "faltante" ? "Sin cargar" : "En curso"}
                onClick={() => abrirHora(g.inicio)}
                style={{
                  minWidth: 48,
                  borderColor: g.estado === "cargada" ? "var(--green)" : g.estado === "faltante" ? "var(--red)" : "var(--border)",
                  color: g.estado === "faltante" ? "var(--red)" : undefined,
                  background: horaSel === g.inicio ? "var(--accent-dim)" : undefined,
                }}
              >
                {textoHora(g.inicio)} {g.estado === "cargada" ? "✓" : g.estado === "faltante" ? "!" : ""}
              </button>
            ))}
          </div>

          <ErrorVisible mensaje={error} />

          {/* ------------------------------------------------ fila de la hora */}
          {horaSel !== null && totales && (
            <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                Hora {textoHora(horaSel)}
                {reg ? <span className="tiny muted"> · completa el registro de las {hora(reg.registrado_en)}</span> : null}
              </div>

              <div className="section-label">Signos</div>
              {SIGNOS.map((s) => (
                <div className="field-row" key={s.campo}>
                  <span className="field-label">
                    {s.etiqueta} ({s.unidad})
                  </span>
                  <input
                    className="mini-input"
                    inputMode="decimal"
                    style={{ width: 70 }}
                    value={signos[s.campo] ?? ""}
                    onChange={(e) => setSignos((x) => ({ ...x, [s.campo]: e.target.value }))}
                  />
                </div>
              ))}
              <div className="field-row">
                <span className="field-label">
                  Glucemia (mg/dL)
                  {ultimaGlucemia && (
                    <span className="tiny muted" style={{ display: "block" }}>
                      Última: {num(ultimaGlucemia.valor, 0)} · {fechaHora(ultimaGlucemia.medido_en)} ·{" "}
                      {ultimaGlucemia.origen === "enfermeria" ? "enfermería" : "laboratorio"}{" "}
                      <button className="btn btn-sm" style={{ fontSize: 11 }} onClick={() => corregirGlucemia(ultimaGlucemia)}>
                        Corregir
                      </button>
                    </span>
                  )}
                </span>
                <input className="mini-input" inputMode="decimal" style={{ width: 70 }} value={glucemia} onChange={(e) => setGlucemia(e.target.value)} />
              </div>
              {glucemia.trim() !== "" && (
                <div className="field-row">
                  <span className="field-label">Hora de medición de la glucemia</span>
                  <input type="datetime-local" className="mini-input" value={glucemiaHora} onChange={(e) => setGlucemiaHora(e.target.value)} />
                </div>
              )}

              <div className="section-label" style={{ marginTop: 8 }}>Ingresos (mL)</div>
              {LIQUIDOS_ENFERMERIA.map((l) => (
                <div className="field-row" key={l.campo}>
                  <span className="field-label">
                    {l.etiqueta}
                    {liquidos[l.campo].copiado && <span className="tiny muted"> · copiado de la hora anterior</span>}
                  </span>
                  <span style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                    {BOTONES_RAPIDOS_ML.map((ml) => (
                      <button key={ml} className="btn btn-sm" onClick={() => sumarLiquido(l.campo, ml)}>
                        +{ml}
                      </button>
                    ))}
                    <input
                      className="mini-input"
                      inputMode="decimal"
                      style={{ width: 70 }}
                      value={liquidos[l.campo].texto}
                      onChange={(e) => cambiarLiquido(l.campo, e.target.value)}
                    />
                  </span>
                </div>
              ))}

              <div className="section-label" style={{ marginTop: 8 }}>Bombas (mL/h; suman al ingreso de la hora)</div>
              <BombasDeLaHora
                form={bombasForm}
                onChange={setBombasForm}
                precarga={precarga}
                infusiones={infusiones}
                pesoKg={pesoKg}
                onGuardarPeso={onGuardarPeso}
              />
              <div className="field-row" style={{ marginTop: 6 }}>
                <span className="field-label" style={{ fontWeight: 600 }}>
                  Total ingresos
                  <span className="tiny muted" style={{ display: "block" }}>
                    Líquidos {num(totales.liquidosMl, 0)} + bombas {num(totales.bombasMl, 1)} mL
                  </span>
                </span>
                <span className="field-value">{num(totales.ingresos, 1)} mL</span>
              </div>

              <div className="section-label" style={{ marginTop: 8 }}>Egresos (mL)</div>
              <div className="field-row">
                <span className="field-label">Diuresis</span>
                <input className="mini-input" inputMode="decimal" style={{ width: 70 }} value={diuresis} onChange={(e) => setDiuresis(e.target.value)} />
              </div>
              <div className="field-row">
                <span className="field-label">SNG / drenajes</span>
                <input className="mini-input" inputMode="decimal" style={{ width: 70 }} value={sng} onChange={(e) => setSng(e.target.value)} />
              </div>
              <div className="field-row">
                <span className="field-label">
                  Pérdidas insensibles
                  {perdidasManual !== null && <span className="chip chip-amber" style={{ marginLeft: 6 }}>editado</span>}
                  <span className="tiny muted" style={{ display: "block" }}>
                    {perdidasManual !== null
                      ? "Editado a mano."
                      : perdidas?.faltaPeso
                        ? "Falta peso: balance sin pérdidas insensibles."
                        : `Calculado: ${num(perdidas?.valor, 1)} mL/h${
                            perdidas?.temperatura
                              ? ` (T ${num(perdidas.temperatura.valor, 1)} °C${perdidas.temperatura.propia ? "" : `, de las ${hora(perdidas.temperatura.registrado_en!)}`})`
                              : " (sin temperatura: base 37 °C)"
                          }. Editable.`}
                  </span>
                </span>
                <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <input
                    className="mini-input"
                    inputMode="decimal"
                    style={{ width: 70 }}
                    value={perdidasManual ?? aTexto(perdidas?.valor === null || perdidas?.valor === undefined ? null : Number(perdidas.valor.toFixed(1)))}
                    onChange={(e) => setPerdidasManual(e.target.value)}
                  />
                  {perdidasManual !== null && (
                    <button className="btn btn-sm" onClick={() => setPerdidasManual(null)}>
                      Usar cálculo
                    </button>
                  )}
                </span>
              </div>
              {perdidas?.faltaPeso && perdidasManual === null && <PedirPeso onGuardar={onGuardarPeso} />}
              <div className="field-row">
                <span className="field-label" style={{ fontWeight: 600 }}>Total egresos</span>
                <span className="field-value">{num(totales.egresos, 1)} mL</span>
              </div>

              <div className="field-row" style={{ marginTop: 6 }}>
                <span className="field-label" style={{ fontWeight: 600 }}>Balance de la hora</span>
                <span className="field-value">{num(totales.parcial, 1)} mL</span>
              </div>
              <div className="field-row">
                <span className="field-label" style={{ fontWeight: 600 }}>Balance acumulado</span>
                <span className="field-value">{num(acumuladoPrevio + totales.parcial, 0)} mL</span>
              </div>

              <div className="field-row" style={{ marginTop: 8 }}>
                <span className="field-label">Cargado por</span>
                <input className="mini-input" style={{ width: 160 }} value={cargadoPor} onChange={(e) => setCargadoPor(e.target.value)} placeholder="Nombre" />
              </div>
              <div className="field-row">
                <span className="field-label">Aviso al médico</span>
                <input className="mini-input" style={{ width: 200 }} value={aviso} onChange={(e) => setAviso(e.target.value)} placeholder="Nota corta" />
              </div>

              {pendiente ? (
                <Confirmacion texto={pendiente} textoSi="Sí, guardar" ocupado={guardando} onSi={() => guardar(true)} onNo={() => setPendiente(null)} />
              ) : (
                <div className="btn-row" style={{ marginTop: 10 }}>
                  <button className="btn btn-accent" disabled={guardando} onClick={() => guardar()}>
                    {guardando ? "Guardando…" : `Guardar hora ${textoHora(horaSel)}`}
                  </button>
                  <button className="btn btn-sm" disabled={guardando} onClick={() => setHoraSel(null)}>
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ------------------------------------------------ horas */}
          <div className="section-label">Horas</div>
          {balance.horas.length === 0 ? (
            <div className="tiny muted">Todavía no hay horas cargadas.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="tiny" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "right" }}>
                    <th style={{ textAlign: "left" }}>Hora</th>
                    <th>Ingresos</th>
                    <th>Egresos</th>
                    <th>Parcial</th>
                    <th>Acumulado</th>
                    <th style={{ textAlign: "left" }}>Cargó / aviso</th>
                  </tr>
                </thead>
                <tbody>
                  {[...balance.horas].reverse().map((b) => {
                    if (b.estado !== "cargada") {
                      return (
                        <tr key={b.inicio} style={{ cursor: "pointer", color: b.estado === "faltante" ? "var(--red)" : undefined }} onClick={() => abrirHora(b.inicio)}>
                          <td>{textoHora(b.inicio)}</td>
                          <td colSpan={5} className="muted">
                            {b.estado === "faltante" ? "sin dato (hora sin cargar)" : "en curso"}
                          </td>
                        </tr>
                      );
                    }
                    const r = registros.find((x) => x.id === b.registroId);
                    return (
                      <tr key={b.inicio} style={{ textAlign: "right", cursor: "pointer" }} onClick={() => abrirHora(b.inicio)}>
                        <td style={{ textAlign: "left" }}>{hora(b.registrado_en)}</td>
                        <td>{num(b.ingresos, 0)}</td>
                        <td>
                          {num(b.egresos, 0)}
                          {b.perdidas.valor === null ? "*" : ""}
                        </td>
                        <td>{num(b.parcial, 0)}</td>
                        <td>{num(b.acumulado, 0)}</td>
                        <td style={{ textAlign: "left" }}>
                          {r?.cargado_por ?? ""}
                          {r?.aviso_medico ? ` · ⚠ ${r.aviso_medico}` : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {balance.horasSinPerdidas > 0 && <div className="tiny muted">* sin pérdidas insensibles (falta peso).</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
