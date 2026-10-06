"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { guardarInfusion, guardarRegistro, type DatosRegistro, type RegistroMantenimiento } from "@/lib/procuracion/mantenimiento";
import {
  alarmasEnfermeria,
  calcularBalance,
  camposFueraDeRango,
  dosisDesdeVelocidad,
  estadoInfusiones,
  horasDelCaso,
  inicioDeHora,
  liquidosPrecargados,
  ordenarPorHora,
  perdidasInsensiblesHora,
  registroDeLaHora,
  temperaturaParaPerdidas,
  totalesFila,
  totalesParaGuardar,
  ultimaDilucion,
  volumenBombasEnHora,
  type InfusionFila,
  type LiquidosFila,
} from "@/lib/procuracion/mantenimiento-calculos";
import {
  BOMBAS_ENFERMERIA,
  BOTONES_RAPIDOS_ML,
  DROGAS_INFUSION,
  LIQUIDOS_ENFERMERIA,
  PASO_BOMBA_ML_H,
} from "@/lib/procuracion/mantenimiento-metas";
import DilucionBomba, { type DrogaInfusion, type EstadoDilucion } from "./mantenimiento-dilucion";
import { dilucionVigente } from "./mantenimiento-infusiones";
import { Confirmacion, ErrorVisible, PedirPeso, aNumero, hora, momentoActual, num } from "./mantenimiento-ui";

const supabase = createClient();

type CampoLiquido = keyof LiquidosFila;
type Signo = "pam" | "temperatura" | "fc" | "pvc" | "sat_o2";
const SIGNOS: { campo: Signo; etiqueta: string; unidad: string }[] = [
  { campo: "pam", etiqueta: "TAM", unidad: "mmHg" },
  { campo: "temperatura", etiqueta: "Temperatura", unidad: "°C" },
  { campo: "fc", etiqueta: "FC", unidad: "lpm" },
  { campo: "pvc", etiqueta: "PVC", unidad: "cmH2O" },
  { campo: "sat_o2", etiqueta: "Sat O2", unidad: "%" },
];

type CambioBomba = { velocidadTexto: string; dilucion: EstadoDilucion; iniciando: boolean };

const textoHora = (ms: number) => `${String(new Date(ms).getHours()).padStart(2, "0")}:00`;
const aTexto = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));

// Vista de ENFERMERÍA (planilla horaria del OP2). Poca fricción: una fila
// por hora de reloj, botones y números, todo precargado con la hora
// anterior; la app calcula totales, pérdidas insensibles y balance (el
// enfermero nunca suma). Una sola fuente: si ya hay un registro en esa
// hora (aunque sea del médico) se completa ese mismo.
export default function MantenimientoEnfermeria({
  donanteId,
  pesoKg,
  registros,
  infusiones,
  ahora,
  onRegistrosChange,
  onInfusionesChange,
  onGuardarPeso,
}: {
  donanteId: string;
  pesoKg: number | null;
  registros: RegistroMantenimiento[];
  infusiones: InfusionFila[];
  ahora: number;
  onRegistrosChange: (r: RegistroMantenimiento[]) => void;
  onInfusionesChange: (f: InfusionFila[]) => void;
  onGuardarPeso: (pesoKg: number) => Promise<void>;
}) {
  const [horaSel, setHoraSel] = useState<number | null>(null);
  const [liquidos, setLiquidos] = useState<Record<CampoLiquido, string>>({
    ing_sol_medio_ml: "",
    ing_sol_09_ml: "",
    ing_ringer_ml: "",
    ing_dextrosa_ml: "",
  });
  const [diuresis, setDiuresis] = useState("");
  const [sng, setSng] = useState("");
  const [perdidasManual, setPerdidasManual] = useState<string | null>(null); // null = usar el cálculo
  const [signos, setSignos] = useState<Partial<Record<Signo, string>>>({});
  const [cargadoPor, setCargadoPor] = useState("");
  const [aviso, setAviso] = useState("");
  const [boloMcg, setBoloMcg] = useState("");
  const [bombas, setBombas] = useState<Partial<Record<DrogaInfusion, CambioBomba>>>({});
  const [pendiente, setPendiente] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const horaActual = inicioDeHora(ahora);
  const grilla = horasDelCaso(registros, ahora);
  const alarmas = alarmasEnfermeria(grilla);
  const balance = calcularBalance(registros);
  const acumulado = balance.length ? balance[balance.length - 1].acumulado : 0;
  const estadoBombas = estadoInfusiones(infusiones);

  // ---------------------------------------------------------- abrir una hora
  function abrirHora(inicio: number) {
    const reg = registroDeLaHora(registros, inicio);
    const anterior = ordenarPorHora(registros.filter((r) => !r.anulado && inicioDeHora(new Date(r.registrado_en).getTime()) < inicio)).pop() ?? null;
    const liq = reg
      ? { ing_sol_medio_ml: reg.ing_sol_medio_ml, ing_sol_09_ml: reg.ing_sol_09_ml, ing_ringer_ml: reg.ing_ringer_ml, ing_dextrosa_ml: reg.ing_dextrosa_ml }
      : liquidosPrecargados(anterior);
    setLiquidos({
      ing_sol_medio_ml: aTexto(liq.ing_sol_medio_ml),
      ing_sol_09_ml: aTexto(liq.ing_sol_09_ml),
      ing_ringer_ml: aTexto(liq.ing_ringer_ml),
      ing_dextrosa_ml: aTexto(liq.ing_dextrosa_ml),
    });
    setDiuresis(aTexto(reg?.diuresis_ml));
    setSng(aTexto(reg?.egr_sng_drenajes_ml));
    setPerdidasManual(reg?.perdidas_insensibles_editadas ? aTexto(reg.perdidas_insensibles_ml) : null);
    setSignos({});
    setCargadoPor(reg?.cargado_por ?? anterior?.cargado_por ?? "");
    setAviso(reg?.aviso_medico ?? "");
    setBoloMcg("");
    setBombas({});
    setPendiente(null);
    setError(null);
    setHoraSel(inicio);
  }

  // ---------------------------------------------------------- derivados de la fila abierta
  const reg = horaSel !== null ? registroDeLaHora(registros, horaSel) : null;
  const esHoraActual = horaSel === horaActual;
  const valorSigno = (s: Signo): number | null => {
    if (reg && reg[s] !== null) return reg[s];
    const n = aNumero(signos[s] ?? "");
    return n === null || Number.isNaN(n) ? null : n;
  };
  const temp = horaSel !== null ? temperaturaParaPerdidas(registros, horaSel, valorSigno("temperatura")) : null;
  const perdidasCalculadas = perdidasInsensiblesHora(temp?.valor ?? null);
  const perdidas = perdidasManual !== null ? aNumero(perdidasManual) : perdidasCalculadas;

  // Bombas de esta fila: para la hora en curso se pueden cambiar (+/−);
  // las horas pasadas muestran lo que corría (estimado, solo lectura).
  const velocidadFila = (d: DrogaInfusion): number => {
    const cambio = bombas[d];
    if (esHoraActual && cambio) {
      const n = aNumero(cambio.velocidadTexto);
      return n === null || Number.isNaN(n) ? 0 : n;
    }
    if (esHoraActual) return estadoBombas.porDroga[d]?.activa ? (estadoBombas.porDroga[d]?.velocidad_ml_h ?? 0) : 0;
    return volumenBombasEnHora(infusiones, (horaSel ?? 0) + 3_600_000 - 1).detalle.find((x) => x.droga === d)?.velocidadMlH ?? 0;
  };
  const bombasMl = horaSel === null ? 0 : BOMBAS_ENFERMERIA.reduce((s, d) => s + velocidadFila(d), 0);

  const num0 = (t: string) => {
    const n = aNumero(t);
    return n === null || Number.isNaN(n) ? null : n;
  };
  const totales = totalesFila({
    ing_sol_medio_ml: num0(liquidos.ing_sol_medio_ml),
    ing_sol_09_ml: num0(liquidos.ing_sol_09_ml),
    ing_ringer_ml: num0(liquidos.ing_ringer_ml),
    ing_dextrosa_ml: num0(liquidos.ing_dextrosa_ml),
    bombasMl,
    diuresis_ml: num0(diuresis),
    egr_sng_drenajes_ml: num0(sng),
    perdidas_insensibles_ml: perdidas !== null && !Number.isNaN(perdidas) ? perdidas : null,
  });
  // Acumulado hasta esta hora: el de las filas anteriores + la parcial de esta.
  const acumuladoPrevio =
    horaSel === null
      ? 0
      : balance.filter((b) => inicioDeHora(new Date(b.registrado_en).getTime()) < horaSel).reduce((_, b) => b.acumulado, 0);

  // ---------------------------------------------------------- guardar
  async function guardar(confirmadoPlausible = false) {
    if (horaSel === null) return;
    setError(null);
    const valores: Record<string, number | null> = {};
    for (const l of LIQUIDOS_ENFERMERIA) {
      const n = aNumero(liquidos[l.campo]);
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
    if (perdidasManual !== null) {
      const n = aNumero(perdidasManual);
      if (n === null || Number.isNaN(n)) return setError("Pérdidas insensibles inválidas.");
      valores.perdidas_insensibles_ml = n;
    }
    for (const s of SIGNOS) {
      if (reg && reg[s.campo] !== null) continue; // ya cargado: una sola fuente
      const n = aNumero(signos[s.campo] ?? "");
      if (n !== null && Number.isNaN(n)) return setError(`Valor inválido en ${s.etiqueta}.`);
      if (n !== null) valores[s.campo] = n;
    }
    const mcg = aNumero(boloMcg);
    if (mcg !== null && (Number.isNaN(mcg) || mcg <= 0)) return setError("Dosis de desmopresina inválida (mcg).");

    // Bombas: las que se inician necesitan la dilución confirmada.
    const cambiosBombas: { droga: DrogaInfusion; velocidad: number; dil: EstadoDilucion }[] = [];
    for (const d of BOMBAS_ENFERMERIA) {
      const c = bombas[d];
      if (!c || !esHoraActual) continue;
      const v = aNumero(c.velocidadTexto);
      if (v === null || Number.isNaN(v) || v < 0) return setError(`Velocidad inválida en ${DROGAS_INFUSION[d].etiqueta}.`);
      const dil = c.dilucion ?? dilucionVigente(infusiones, d);
      if (!dil) return setError(`Confirmá la dilución de ${DROGAS_INFUSION[d].etiqueta} antes de guardar.`);
      const actual = estadoBombas.porDroga[d];
      const sinCambio = actual?.activa && actual.velocidad_ml_h === v && !c.dilucion;
      if (!sinCambio) cambiosBombas.push({ droga: d, velocidad: v, dil });
    }

    const fuera = camposFueraDeRango(valores);
    if (fuera.length > 0 && !confirmadoPlausible) {
      const etiqueta = (campo: string) =>
        LIQUIDOS_ENFERMERIA.find((l) => l.campo === campo)?.etiqueta ??
        SIGNOS.find((s) => s.campo === campo)?.etiqueta ??
        ({ diuresis_ml: "Diuresis", egr_sng_drenajes_ml: "SNG / drenajes", perdidas_insensibles_ml: "Pérdidas insensibles" } as Record<string, string>)[campo] ??
        campo;
      return setPendiente(
        `¿Seguro? Fuera del rango esperable: ${fuera.map((f) => `${etiqueta(f.campo)} ${num(f.valor)} (${num(f.min)}-${num(f.max)})`).join("; ")}.`
      );
    }

    setGuardando(true);
    try {
      // 1) Bombas y bolo primero (los totales usan las velocidades nuevas).
      let infus = infusiones;
      const instante = esHoraActual ? new Date(momentoActual()).toISOString() : new Date(horaSel + 30 * 60_000).toISOString();
      for (const cb of cambiosBombas) {
        const r = dosisDesdeVelocidad(cb.droga, cb.velocidad, cb.dil!.concentracion, pesoKg);
        if (!r.ok) throw new Error(`${DROGAS_INFUSION[cb.droga].etiqueta}: ${r.error}`);
        const nueva = await guardarInfusion(supabase, donanteId, {
          registrado_en: instante,
          droga: cb.droga,
          tipo: "infusion",
          ampollas: cb.dil!.dilucion.ampollas,
          contenido_por_ampolla: cb.dil!.dilucion.contenidoPorAmpolla,
          unidad_contenido: cb.dil!.dilucion.unidadContenido,
          volumen_final_ml: cb.dil!.dilucion.volumenFinalMl,
          concentracion_calculada: cb.dil!.concentracion,
          unidad_concentracion: cb.dil!.unidad,
          velocidad_ml_h: cb.velocidad,
          dosis_calculada: r.dosis,
          unidad_dosis: r.unidad,
          peso_usado_kg: DROGAS_INFUSION[cb.droga].unidadDosis === "mcg/kg/min" ? pesoKg : null,
        });
        infus = [...infus, nueva];
        onInfusionesChange(infus);
      }
      if (mcg !== null) {
        const bolo = await guardarInfusion(supabase, donanteId, {
          registrado_en: instante,
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
        });
        infus = [...infus, bolo];
        onInfusionesChange(infus);
      }

      // 2) La fila de la hora (completa la existente o crea una a hh:00).
      const combinado = { ...(reg ?? {}), ...valores } as Partial<RegistroMantenimiento>;
      const otros = registros.filter((r) => r.id !== reg?.id);
      const tot = totalesParaGuardar(
        {
          ing_sol_medio_ml: combinado.ing_sol_medio_ml ?? null,
          ing_sol_09_ml: combinado.ing_sol_09_ml ?? null,
          ing_ringer_ml: combinado.ing_ringer_ml ?? null,
          ing_dextrosa_ml: combinado.ing_dextrosa_ml ?? null,
          temperatura: combinado.temperatura ?? null,
          diuresis_ml: combinado.diuresis_ml ?? null,
          egr_sng_drenajes_ml: combinado.egr_sng_drenajes_ml ?? null,
          perdidas_insensibles_ml: perdidasManual !== null ? (valores.perdidas_insensibles_ml ?? null) : null,
          perdidas_insensibles_editadas: perdidasManual !== null,
        },
        horaSel,
        otros,
        infus
      );
      const registradoEn = reg?.registrado_en ?? new Date(horaSel).toISOString();
      const anteriorVigente = otros.some((r) => !r.anulado && r.registrado_en < registradoEn);
      const datos: DatosRegistro = {
        registrado_en: registradoEn,
        ...valores,
        diuresis_es_ultima_hora: !anteriorVigente,
        perdidas_insensibles_ml: tot.perdidas_insensibles_ml,
        perdidas_insensibles_editadas: perdidasManual !== null,
        ingresos_ml: tot.ingresos_ml,
        egresos_ml: tot.egresos_ml,
        egresos_incluye_diuresis: true,
        cargado_por: cargadoPor.trim() || null,
        aviso_medico: aviso.trim() || null,
      };
      const guardado = await guardarRegistro(supabase, donanteId, datos, reg?.id ?? null);
      onRegistrosChange(reg ? registros.map((r) => (r.id === reg.id ? guardado : r)) : [...registros, guardado]);
      setHoraSel(null);
      setPendiente(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la hora.");
    } finally {
      setGuardando(false);
    }
  }

  // ---------------------------------------------------------- UI
  const cambiarLiquido = (campo: CampoLiquido, valor: string) => setLiquidos((l) => ({ ...l, [campo]: valor }));
  const sumarLiquido = (campo: CampoLiquido, ml: number) =>
    setLiquidos((l) => ({ ...l, [campo]: aTexto((num0(l[campo]) ?? 0) + ml) }));
  const cambiarBomba = (d: DrogaInfusion, cambios: Partial<CambioBomba>) =>
    setBombas((b) => {
      const actual = b[d] ?? {
        velocidadTexto: aTexto(estadoBombas.porDroga[d]?.activa ? estadoBombas.porDroga[d]?.velocidad_ml_h : 0),
        dilucion: null,
        iniciando: !estadoBombas.porDroga[d]?.activa,
      };
      return { ...b, [d]: { ...actual, ...cambios } };
    });
  const pasoBomba = (d: DrogaInfusion, signo: 1 | -1) =>
    cambiarBomba(d, { velocidadTexto: aTexto(Math.max(0, velocidadFila(d) + signo * PASO_BOMBA_ML_H)) });

  return (
    <div>
      {/* ------------------------------------------------ arriba: hora y botón grande */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{hora(new Date(ahora).toISOString())}</div>
          <div className="tiny muted">Balance acumulado: {num(acumulado, 0)} mL</div>
        </div>
        <button className="btn btn-accent" style={{ fontSize: 16, padding: "12px 18px" }} onClick={() => abrirHora(horaActual)}>
          Cargar hora {textoHora(horaActual)}
        </button>
      </div>

      {alarmas.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {alarmas.map((a) => (
            <button key={a.inicio} className="btn btn-sm" style={{ color: "var(--red)", marginRight: 6, marginBottom: 4 }} onClick={() => abrirHora(a.inicio)}>
              ● {a.texto}
            </button>
          ))}
        </div>
      )}

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
      {horaSel !== null && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            Hora {textoHora(horaSel)}
            {reg ? <span className="tiny muted"> · completa el registro de las {hora(reg.registrado_en)}</span> : null}
          </div>

          <div className="section-label">Ingresos (mL)</div>
          {LIQUIDOS_ENFERMERIA.map((l) => (
            <div className="field-row" key={l.campo}>
              <span className="field-label">{l.etiqueta}</span>
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
                  value={liquidos[l.campo]}
                  onChange={(e) => cambiarLiquido(l.campo, e.target.value)}
                />
              </span>
            </div>
          ))}
          <div className="tiny muted">Bombas: {num(bombasMl, 1)} mL (estimado: la velocidad puede cambiar dentro de la hora)</div>
          <div className="field-row">
            <span className="field-label" style={{ fontWeight: 600 }}>Total ingresos</span>
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
              <span className="tiny muted" style={{ display: "block" }}>
                {perdidasCalculadas === null
                  ? "Sin temperatura: cargala para calcularlas."
                  : `Calculado: ${num(perdidasCalculadas, 1)} mL (T ${num(temp!.valor, 1)} °C${temp!.propia ? "" : `, de las ${hora(temp!.registrado_en!)}`}). Editable.`}
              </span>
            </span>
            <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <input
                className="mini-input"
                inputMode="decimal"
                style={{ width: 70 }}
                value={perdidasManual ?? aTexto(perdidasCalculadas === null ? null : Number(perdidasCalculadas.toFixed(1)))}
                onChange={(e) => setPerdidasManual(e.target.value)}
              />
              {perdidasManual !== null && (
                <button className="btn btn-sm" onClick={() => setPerdidasManual(null)}>
                  Usar cálculo
                </button>
              )}
            </span>
          </div>
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

          <div className="section-label" style={{ marginTop: 8 }}>Bombas (mL/h)</div>
          {!esHoraActual && <div className="tiny muted">Hora pasada: se muestran las bombas que corrían (estimado). Los cambios se cargan en la hora en curso.</div>}
          {BOMBAS_ENFERMERIA.map((d) => {
            const activa = estadoBombas.porDroga[d]?.activa ?? false;
            const cambio = bombas[d];
            const v = velocidadFila(d);
            if (!esHoraActual && v === 0) return null;
            const dil = cambio?.dilucion ?? dilucionVigente(infusiones, d);
            const dosis = dil && v > 0 ? dosisDesdeVelocidad(d, v, dil.concentracion, pesoKg) : null;
            const usaPeso = DROGAS_INFUSION[d].unidadDosis === "mcg/kg/min";
            return (
              <div key={d} style={{ borderBottom: "1px solid var(--border-soft)", padding: "4px 0" }}>
                <div className="field-row">
                  <span className="field-label">
                    {DROGAS_INFUSION[d].etiqueta}
                    {dosis?.ok && (
                      <span className="tiny muted" style={{ display: "block" }}>
                        = {dosis.cuenta}
                      </span>
                    )}
                    {dosis && !dosis.ok && dosis.motivo !== "sin_peso" && <span className="tiny" style={{ color: "var(--red)", display: "block" }}>{dosis.error}</span>}
                  </span>
                  {esHoraActual ? (
                    activa || cambio ? (
                      <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <button className="btn btn-sm" onClick={() => pasoBomba(d, -1)}>−</button>
                        <input
                          className="mini-input"
                          inputMode="decimal"
                          style={{ width: 56 }}
                          value={cambio ? cambio.velocidadTexto : aTexto(v)}
                          onChange={(e) => cambiarBomba(d, { velocidadTexto: e.target.value })}
                        />
                        <button className="btn btn-sm" onClick={() => pasoBomba(d, 1)}>+</button>
                      </span>
                    ) : (
                      <button className="btn btn-sm" onClick={() => cambiarBomba(d, { iniciando: true, velocidadTexto: "" })}>
                        Iniciar
                      </button>
                    )
                  ) : (
                    <span className="field-value">{num(v)} mL/h</span>
                  )}
                </div>
                {esHoraActual && dosis && !dosis.ok && dosis.motivo === "sin_peso" && usaPeso && <PedirPeso onGuardar={onGuardarPeso} />}
                {esHoraActual && cambio && (cambio.iniciando || !activa) && (
                  <DilucionBomba
                    droga={d}
                    inicial={ultimaDilucion(infusiones, d)}
                    vigente={false}
                    onConfirmada={(est) => cambiarBomba(d, { dilucion: est })}
                  />
                )}
                {esHoraActual && activa && cambio && !cambio.iniciando && (
                  <details className="tiny">
                    <summary>Cambió la dilución</summary>
                    <DilucionBomba droga={d} inicial={dilucionVigente(infusiones, d)?.dilucion ?? null} vigente={false} onConfirmada={(est) => cambiarBomba(d, { dilucion: est })} />
                  </details>
                )}
              </div>
            );
          })}
          <div className="field-row">
            <span className="field-label">Desmopresina (bolo en esta hora, mcg)</span>
            <input className="mini-input" inputMode="decimal" style={{ width: 70 }} value={boloMcg} onChange={(e) => setBoloMcg(e.target.value)} />
          </div>

          <div className="section-label" style={{ marginTop: 8 }}>Signos vitales (opcionales)</div>
          {SIGNOS.map((s) =>
            reg && reg[s.campo] !== null ? (
              <div className="field-row" key={s.campo}>
                <span className="field-label">{s.etiqueta}</span>
                <span className="field-value">
                  {num(reg[s.campo])} {s.unidad} <span className="tiny muted">(ya cargado)</span>
                </span>
              </div>
            ) : (
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
            )
          )}

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

      {/* ------------------------------------------------ horas cargadas */}
      <div className="section-label">Horas cargadas</div>
      {balance.length === 0 ? (
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
              {[...balance].reverse().map((b) => {
                const r = registros.find((x) => x.id === b.id);
                const egresos = r?.egresos_incluye_diuresis ? (r.egresos_ml ?? 0) : (r?.egresos_ml ?? 0) + (r?.diuresis_ml ?? 0);
                return (
                  <tr key={b.id} style={{ textAlign: "right", cursor: "pointer" }} onClick={() => abrirHora(inicioDeHora(new Date(b.registrado_en).getTime()))}>
                    <td style={{ textAlign: "left" }}>{hora(b.registrado_en)}</td>
                    <td>{num(r?.ingresos_ml ?? 0, 0)}</td>
                    <td>{num(egresos, 0)}</td>
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
        </div>
      )}
    </div>
  );
}
