"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  anularEventoRespirador,
  anularMedicionMedico,
  guardarEventoRespirador,
  guardarMedicionMedico,
  type ConfigMantenimiento,
  type NuevaMedicion,
  type RegistroMantenimiento,
} from "@/lib/procuracion/mantenimiento";
import type { ValorLaboratorio } from "@/lib/procuracion/laboratorio-valores";
import styles from "./mantenimiento-medico.module.css";
import {
  camposFueraDeRango,
  disfuncionMiocardica,
  ordenarPorHora,
  respiradorVigenteEn,
  ultimoValorLab,
  ultimoValorMedico,
  type CampoMedico,
  type PafiCalculada,
  type EventoRespirador,
  type MedicionMedico,
} from "@/lib/procuracion/mantenimiento-calculos";
import { HORAS_LAB_DESACTUALIZADO, MODOS_RESPIRADOR, type ModoRespirador } from "@/lib/procuracion/mantenimiento-metas";
import MantenimientoLaboratorio from "./mantenimiento-laboratorio";
import { Confirmacion, ErrorVisible, aInputLocal, aNumero, esFutura, fechaHora, hora, momentoActual, num } from "./mantenimiento-ui";

const supabase = createClient();

const aTexto = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));

// ---------------------------------------------------------------------
// Respirador
// ---------------------------------------------------------------------
type CampoResp = "fio2" | "peep" | "volumen_corriente" | "frecuencia" | "presion_plateau" | "presion_pico";
const CAMPOS_RESP: { campo: CampoResp; etiqueta: string; unidad: string; opcional?: true }[] = [
  { campo: "fio2", etiqueta: "FiO2", unidad: "%" },
  { campo: "peep", etiqueta: "PEEP", unidad: "cmH2O" },
  { campo: "volumen_corriente", etiqueta: "Volumen corriente", unidad: "mL" },
  { campo: "frecuencia", etiqueta: "Frecuencia", unidad: "/min" },
  { campo: "presion_plateau", etiqueta: "Presión plateau (opcional)", unidad: "cmH2O", opcional: true },
  { campo: "presion_pico", etiqueta: "Presión pico (opcional)", unidad: "cmH2O", opcional: true },
];

export function textoRespirador(e: EventoRespirador): string {
  const modo = e.modo === "otro" ? e.modo_otro || "Otro" : e.modo ?? "—";
  const partes = [
    modo,
    `FiO2 ${num(e.fio2, 0)} %`,
    `PEEP ${num(e.peep, 0)}`,
    `VT ${num(e.volumen_corriente, 0)} mL`,
    `FR ${num(e.frecuencia, 0)}`,
    e.presion_plateau !== null ? `Pplat ${num(e.presion_plateau, 0)}` : null,
    e.presion_pico !== null ? `Ppico ${num(e.presion_pico, 0)}` : null,
  ];
  return partes.filter(Boolean).join(" · ");
}

function Respirador({
  donanteId,
  eventos,
  onChange,
}: {
  donanteId: string;
  eventos: EventoRespirador[];
  onChange: (e: EventoRespirador[]) => void;
}) {
  const vigente = respiradorVigenteEn(eventos, Infinity);
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<ModoRespirador | null>(null);
  const [modoOtro, setModoOtro] = useState("");
  const [valores, setValores] = useState<Partial<Record<CampoResp, string>>>({});
  const [horaTexto, setHoraTexto] = useState("");
  const [pendiente, setPendiente] = useState<string | null>(null);
  const [anulandoId, setAnulandoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function abrir() {
    // Cada cambio es un evento completo: arranca con el seteo vigente.
    setModo(vigente?.modo ?? null);
    setModoOtro(vigente?.modo_otro ?? "");
    setValores(vigente ? Object.fromEntries(CAMPOS_RESP.map((c) => [c.campo, aTexto(vigente[c.campo])])) : {});
    setHoraTexto(aInputLocal(new Date(momentoActual()).toISOString()));
    setPendiente(null);
    setError(null);
    setAbierto(true);
  }

  async function guardar(confirmado = false) {
    setError(null);
    if (!modo) return setError("Elegí el modo.");
    if (modo === "otro" && !modoOtro.trim()) return setError("Escribí cuál es el modo.");
    const nums: Partial<Record<CampoResp, number | null>> = {};
    for (const c of CAMPOS_RESP) {
      const n = aNumero(valores[c.campo] ?? "");
      if (n !== null && (Number.isNaN(n) || n < 0)) return setError(`Valor inválido en ${c.etiqueta}.`);
      if (n === null && !c.opcional) return setError(`Falta ${c.etiqueta}.`);
      nums[c.campo] = n;
    }
    if (nums.fio2! < 21 || nums.fio2! > 100) return setError("La FiO2 va de 21 a 100 %.");
    if (!horaTexto) return setError("Falta la hora del cambio.");
    const iso = new Date(horaTexto).toISOString();
    if (esFutura(iso)) return setError("La hora no puede ser futura.");
    const fuera = camposFueraDeRango(nums);
    if (fuera.length > 0 && !confirmado) {
      const etiqueta = (c: string) => CAMPOS_RESP.find((x) => x.campo === c)?.etiqueta ?? c;
      return setPendiente(`¿Seguro? Fuera del rango esperable: ${fuera.map((f) => `${etiqueta(f.campo)} ${num(f.valor)} (${num(f.min)}-${num(f.max)})`).join("; ")}.`);
    }
    setGuardando(true);
    try {
      const nuevo = await guardarEventoRespirador(supabase, donanteId, {
        registrado_en: iso,
        modo,
        modo_otro: modo === "otro" ? modoOtro.trim().slice(0, 40) : null,
        fio2: nums.fio2 ?? null,
        peep: nums.peep ?? null,
        volumen_corriente: nums.volumen_corriente ?? null,
        frecuencia: nums.frecuencia ?? null,
        presion_plateau: nums.presion_plateau ?? null,
        presion_pico: nums.presion_pico ?? null,
      });
      onChange([...eventos, nuevo]);
      setAbierto(false);
      setPendiente(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el respirador.");
    } finally {
      setGuardando(false);
    }
  }

  async function anular(id: string) {
    setError(null);
    setGuardando(true);
    try {
      await anularEventoRespirador(supabase, id);
      onChange(eventos.map((e) => (e.id === id ? { ...e, anulado: true } : e)));
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
      <div className="field-row">
        <span className="field-label">
          {vigente ? textoRespirador(vigente) : "Sin respirador cargado."}
          {vigente && (
            <span className={`${styles.apagado} ${styles.chico}`} style={{ display: "block" }}>
              seteado <span className={styles.num}>{hora(vigente.registrado_en)}</span>
            </span>
          )}
        </span>
        {!abierto && (
          <button className="btn btn-sm btn-accent" onClick={abrir}>
            {vigente ? "Cambiar ajuste del respirador" : "Setear respirador"}
          </button>
        )}
      </div>
      {abierto && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, margin: "6px 0" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", marginBottom: 6 }}>
            {MODOS_RESPIRADOR.map((m) => (
              <button key={m.valor} className={`btn btn-sm ${modo === m.valor ? "btn-accent" : ""}`} onClick={() => setModo(m.valor)}>
                {m.etiqueta}
              </button>
            ))}
            {modo === "otro" && (
              <input className="mini-input" style={{ width: 120 }} maxLength={40} placeholder="¿Cuál?" value={modoOtro} onChange={(e) => setModoOtro(e.target.value)} />
            )}
          </div>
          {CAMPOS_RESP.map((c) => (
            <div className="field-row" key={c.campo}>
              <span className="field-label">
                {c.etiqueta} ({c.unidad})
              </span>
              <input
                className="mini-input"
                inputMode="decimal"
                style={{ width: 80 }}
                value={valores[c.campo] ?? ""}
                onChange={(e) => setValores((v) => ({ ...v, [c.campo]: e.target.value }))}
              />
            </div>
          ))}
          <div className="field-row">
            <span className="field-label">Hora del cambio</span>
            <input type="datetime-local" className="mini-input" value={horaTexto} onChange={(e) => setHoraTexto(e.target.value)} />
          </div>
          {pendiente ? (
            <Confirmacion texto={pendiente} textoSi="Sí, guardar" ocupado={guardando} onSi={() => guardar(true)} onNo={() => setPendiente(null)} />
          ) : (
            <div className="btn-row" style={{ marginTop: 6 }}>
              <button className="btn btn-sm btn-accent" disabled={guardando} onClick={() => guardar()}>
                {guardando ? "Guardando…" : "Guardar"}
              </button>
              <button className="btn btn-sm" disabled={guardando} onClick={() => setAbierto(false)}>
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}
      {eventos.length > 0 && (
        <details>
          <summary className="tiny">Cambios del respirador</summary>
          {ordenarPorHora(eventos)
            .reverse()
            .map((e) => (
              <div key={e.id}>
                <div className="field-row" style={{ opacity: e.anulado ? 0.5 : 1 }}>
                  <span className="field-label tiny" style={{ textDecoration: e.anulado ? "line-through" : undefined }}>
                    {fechaHora(e.registrado_en)} · {textoRespirador(e)}
                    {e.anulado ? " (anulado)" : ""}
                  </span>
                  {!e.anulado && (
                    <button className="btn btn-sm" onClick={() => setAnulandoId(e.id)}>
                      Anular
                    </button>
                  )}
                </div>
                {anulandoId === e.id && (
                  <Confirmacion
                    texto="¿Anular este cambio del respirador? Va a quedar tachado y no cuenta para la PaFi."
                    textoSi="Sí, anular"
                    ocupado={guardando}
                    onSi={() => anular(e.id)}
                    onNo={() => setAnulandoId(null)}
                  />
                )}
              </div>
            ))}
        </details>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Monitoreo avanzado y volemia (mantenimiento_medico)
// ---------------------------------------------------------------------
const CAMPOS_AVANZADO: { campo: CampoMedico; etiqueta: string; unidad: string }[] = [
  { campo: "pvc", etiqueta: "PVC", unidad: "cmH2O" },
  { campo: "gc", etiqueta: "Gasto cardíaco", unidad: "L/min" },
  { campo: "ic_medido", etiqueta: "IC medido (si se mide directo)", unidad: "L/min/m²" },
  { campo: "sat_venosa", etiqueta: "Sat venosa", unidad: "%" },
  { campo: "delta_pp", etiqueta: "Δ variabilidad de pulso", unidad: "%" },
  { campo: "delta_vs", etiqueta: "Δ volumen sistólico", unidad: "%" },
  { campo: "delta_co2_espirado", etiqueta: "Δ CO2 espirado", unidad: "%" },
  { campo: "indice_vena_cava", etiqueta: "Índice de vena cava", unidad: "%" },
  { campo: "resultado_pasivo_miembros", etiqueta: "Elevación pasiva de miembros", unidad: "% del VS o GC" },
];

function MonitoreoAvanzado({
  donanteId,
  mediciones,
  registros,
  onChange,
}: {
  donanteId: string;
  mediciones: MedicionMedico[];
  registros: RegistroMantenimiento[];
  onChange: (m: MedicionMedico[]) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [valores, setValores] = useState<Partial<Record<CampoMedico, string>>>({});
  const [horaTexto, setHoraTexto] = useState("");
  const [pendiente, setPendiente] = useState<string | null>(null);
  const [anulandoId, setAnulandoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(confirmado = false) {
    setError(null);
    const datos: NuevaMedicion = { registrado_en: "" };
    let alguno = false;
    for (const c of CAMPOS_AVANZADO) {
      const n = aNumero(valores[c.campo] ?? "");
      if (n === null) continue;
      if (Number.isNaN(n)) return setError(`Valor inválido en ${c.etiqueta}.`);
      datos[c.campo] = n;
      alguno = true;
    }
    if (!alguno) return setError("Cargá al menos un valor.");
    if (!horaTexto) return setError("Falta la hora.");
    const iso = new Date(horaTexto).toISOString();
    if (esFutura(iso)) return setError("La hora no puede ser futura.");
    datos.registrado_en = iso;
    const fuera = camposFueraDeRango(Object.fromEntries(CAMPOS_AVANZADO.map((c) => [c.campo, datos[c.campo] ?? null])));
    if (fuera.length > 0 && !confirmado) {
      const etiqueta = (c: string) => CAMPOS_AVANZADO.find((x) => x.campo === c)?.etiqueta ?? c;
      return setPendiente(`¿Seguro? Fuera del rango esperable: ${fuera.map((f) => `${etiqueta(f.campo)} ${num(f.valor)} (${num(f.min)}-${num(f.max)})`).join("; ")}.`);
    }
    setGuardando(true);
    try {
      const nueva = await guardarMedicionMedico(supabase, donanteId, datos);
      onChange([...mediciones, nueva]);
      setAbierto(false);
      setPendiente(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  async function anular(id: string) {
    setError(null);
    setGuardando(true);
    try {
      await anularMedicionMedico(supabase, id);
      onChange(mediciones.map((m) => (m.id === id ? { ...m, anulado: true } : m)));
      setAnulandoId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo anular.");
    } finally {
      setGuardando(false);
    }
  }

  const conDatos = ordenarPorHora(mediciones.filter((m) => CAMPOS_AVANZADO.some((c) => m[c.campo] !== null))).reverse();

  return (
    <div>
      <ErrorVisible mensaje={error} />
      {CAMPOS_AVANZADO.map((c) => {
        const u = ultimoValorMedico(c.campo, mediciones, registros);
        return u ? (
          <div className="field-row" key={c.campo}>
            <span className="field-label">{c.etiqueta}</span>
            <span className="field-value">
              {num(u.valor)} {c.unidad} <span className="tiny muted">{fechaHora(u.registrado_en)}</span>
            </span>
          </div>
        ) : null;
      })}
      {!abierto ? (
        <button
          className="btn btn-sm btn-accent"
          onClick={() => {
            setValores({});
            setHoraTexto(aInputLocal(new Date(momentoActual()).toISOString()));
            setPendiente(null);
            setError(null);
            setAbierto(true);
          }}
        >
          + Cargar monitoreo avanzado
        </button>
      ) : (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, margin: "6px 0" }}>
          {CAMPOS_AVANZADO.map((c) => (
            <div className="field-row" key={c.campo}>
              <span className="field-label">
                {c.etiqueta} ({c.unidad})
              </span>
              <input
                className="mini-input"
                inputMode="decimal"
                style={{ width: 80 }}
                value={valores[c.campo] ?? ""}
                onChange={(e) => setValores((v) => ({ ...v, [c.campo]: e.target.value }))}
              />
            </div>
          ))}
          <div className="field-row">
            <span className="field-label">Hora</span>
            <input type="datetime-local" className="mini-input" value={horaTexto} onChange={(e) => setHoraTexto(e.target.value)} />
          </div>
          {pendiente ? (
            <Confirmacion texto={pendiente} textoSi="Sí, guardar" ocupado={guardando} onSi={() => guardar(true)} onNo={() => setPendiente(null)} />
          ) : (
            <div className="btn-row" style={{ marginTop: 6 }}>
              <button className="btn btn-sm btn-accent" disabled={guardando} onClick={() => guardar()}>
                {guardando ? "Guardando…" : "Guardar"}
              </button>
              <button className="btn btn-sm" disabled={guardando} onClick={() => setAbierto(false)}>
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}
      {conDatos.length > 0 && (
        <details>
          <summary className="tiny">Cargas anteriores</summary>
          {conDatos.map((m) => (
            <div key={m.id}>
              <div className="field-row" style={{ opacity: m.anulado ? 0.5 : 1 }}>
                <span className="field-label tiny" style={{ textDecoration: m.anulado ? "line-through" : undefined }}>
                  {fechaHora(m.registrado_en)} ·{" "}
                  {CAMPOS_AVANZADO.filter((c) => m[c.campo] !== null)
                    .map((c) => `${c.etiqueta} ${num(m[c.campo])}`)
                    .join(" · ")}
                  {m.anulado ? " (anulado)" : ""}
                </span>
                {!m.anulado && (
                  <button className="btn btn-sm" onClick={() => setAnulandoId(m.id)}>
                    Anular
                  </button>
                )}
              </div>
              {anulandoId === m.id && (
                <Confirmacion texto="¿Anular esta carga?" textoSi="Sí, anular" ocupado={guardando} onSi={() => anular(m.id)} onNo={() => setAnulandoId(null)} />
              )}
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Datos del médico: tarjetas plegadas (respirador, laboratorio,
// evaluación clínica, monitoreo avanzado).
// ---------------------------------------------------------------------
const LAB_RESUMEN: { parametro: string; etiqueta: string; unidad: string; dec: number }[] = [
  { parametro: "na", etiqueta: "Na", unidad: "mEq/L", dec: 0 },
  { parametro: "k", etiqueta: "K", unidad: "mEq/L", dec: 1 },
  { parametro: "ph", etiqueta: "pH", unidad: "", dec: 2 },
  { parametro: "pao2", etiqueta: "PaO₂", unidad: "mmHg", dec: 0 },
  { parametro: "hb", etiqueta: "Hb", unidad: "g/dL", dec: 1 },
];

function edad(iso: string, ahora: number): string {
  const h = (ahora - new Date(iso).getTime()) / 3_600_000;
  return h < 1 ? `hace ${Math.max(0, Math.round(h * 60))} min` : `hace ${num(h, h < 10 ? 1 : 0)} h`;
}

export default function DatosDelMedico({
  donanteId,
  respirador,
  mediciones,
  registros,
  config,
  lab,
  pafi,
  ahora,
  onRespiradorChange,
  onMedicionesChange,
  onCambiarConfig,
  onLabChange,
}: {
  donanteId: string;
  respirador: EventoRespirador[];
  mediciones: MedicionMedico[];
  registros: RegistroMantenimiento[];
  config: ConfigMantenimiento | null;
  lab: ValorLaboratorio[];
  pafi: PafiCalculada | null;
  ahora: number;
  onRespiradorChange: (e: EventoRespirador[]) => void;
  onMedicionesChange: (m: MedicionMedico[]) => void;
  onCambiarConfig: (c: Partial<Omit<ConfigMantenimiento, "donante_id">>) => void;
  onLabChange: (v: ValorLaboratorio[]) => void;
}) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disfuncion = disfuncionMiocardica(mediciones);
  const avanzado = config?.monitoreo_avanzado_activo ?? false;

  async function marcarDisfuncion(valor: boolean) {
    setError(null);
    setGuardando(true);
    try {
      const nueva = await guardarMedicionMedico(supabase, donanteId, {
        registrado_en: new Date(momentoActual()).toISOString(),
        disfuncion_miocardica: valor,
      });
      onMedicionesChange([...mediciones, nueva]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  const tresEstados = (valor: "si" | "no" | "sin_definir", onCambio: (v: "si" | "no" | "sin_definir") => void) => (
    <span style={{ display: "flex", gap: 4 }}>
      {(["si", "no", "sin_definir"] as const).map((v) => (
        <button key={v} className={`btn btn-sm ${valor === v ? "btn-accent" : ""}`} onClick={() => onCambio(v)}>
          {v === "si" ? "Sí" : v === "no" ? "No" : "Sin definir"}
        </button>
      ))}
    </span>
  );
  const vencido = (iso: string) => (ahora - new Date(iso).getTime()) / 3_600_000 > HORAS_LAB_DESACTUALIZADO;

  return (
    <div>
      <ErrorVisible mensaje={error} />

      <details className={styles.tarjeta}>
        <summary className={styles.etiqueta}>Respirador</summary>
        <Respirador donanteId={donanteId} eventos={respirador} onChange={onRespiradorChange} />
      </details>

      <details className={styles.tarjeta}>
        <summary className={styles.etiqueta}>Laboratorio</summary>
        {LAB_RESUMEN.map((p) => {
          const v = ultimoValorLab(lab, p.parametro, ahora);
          return (
            <div className="field-row" key={p.parametro}>
              <span className="field-label">{p.etiqueta}</span>
              <span className="field-value">
                {v ? (
                  <>
                    <span className={styles.num}>
                      {num(v.valor, p.dec)}
                      {p.unidad ? ` ${p.unidad}` : ""}
                    </span>{" "}
                    <span className={`${styles.chico} ${vencido(v.medido_en) ? styles.fuera : styles.apagado}`}>
                      {edad(v.medido_en, ahora)}
                      {vencido(v.medido_en) ? " · vencido" : ""}
                    </span>
                  </>
                ) : (
                  <span className={styles.apagado}>sin dato</span>
                )}
              </span>
            </div>
          );
        })}
        <div className="field-row">
          <span className="field-label">PaFi</span>
          <span className="field-value">
            {pafi ? (
              <>
                <span className={styles.num}>{num(pafi.valor, 0)}</span>{" "}
                <span className={`${styles.chico} ${pafi.desactualizado ? styles.fuera : styles.apagado}`}>
                  {edad(pafi.medido_en, ahora)}
                  {pafi.desactualizado ? " · vencido" : ""} · FiO₂ {num(pafi.fio2, 0)} % de las {hora(pafi.fio2Desde)}
                </span>
              </>
            ) : (
              <span className={styles.apagado}>sin dato</span>
            )}
          </span>
        </div>
        <MantenimientoLaboratorio donanteId={donanteId} valores={lab} onValoresChange={onLabChange} />
      </details>

      <details className={styles.tarjeta}>
        <summary className={styles.etiqueta}>Evaluación clínica</summary>
        <div className="field-row">
          <span className="field-label">
            Disfunción miocárdica
            <span className={`${styles.chico} ${styles.apagado}`} style={{ display: "block" }}>
              {disfuncion.estado === "sin_evaluar" ? "sin evaluar" : `${disfuncion.estado === "si" ? "Sí" : "No"} · ${fechaHora(disfuncion.registrado_en)}`}
            </span>
          </span>
          <span style={{ display: "flex", gap: 4 }}>
            <button className={`btn btn-sm ${disfuncion.estado === "si" ? "btn-accent" : ""}`} disabled={guardando} onClick={() => marcarDisfuncion(true)}>
              Sí
            </button>
            <button className={`btn btn-sm ${disfuncion.estado === "no" ? "btn-accent" : ""}`} disabled={guardando} onClick={() => marcarDisfuncion(false)}>
              No
            </button>
          </span>
        </div>
        <div className="field-row">
          <span className="field-label">
            Nutrición previa
            {config?.nutricion_previa == null && (
              <span className={`${styles.chico} ${styles.apagado}`} style={{ display: "block" }}>
                sin definir
              </span>
            )}
          </span>
          <span style={{ display: "flex", gap: 4 }}>
            <button className={`btn btn-sm ${config?.nutricion_previa === "si" ? "btn-accent" : ""}`} onClick={() => onCambiarConfig({ nutricion_previa: "si" })}>
              Sí
            </button>
            <button className={`btn btn-sm ${config?.nutricion_previa === "no" ? "btn-accent" : ""}`} onClick={() => onCambiarConfig({ nutricion_previa: "no" })}>
              No
            </button>
          </span>
        </div>
        <div className="field-row">
          <span className="field-label">Corazón candidato</span>
          {tresEstados(config?.corazon_candidato ?? "sin_definir", (v) => onCambiarConfig({ corazon_candidato: v }))}
        </div>
        <div className="field-row">
          <span className="field-label">Pulmón candidato</span>
          {tresEstados(config?.pulmon_candidato ?? "sin_definir", (v) => onCambiarConfig({ pulmon_candidato: v }))}
        </div>
      </details>

      <details className={styles.tarjeta}>
        <summary className={styles.etiqueta}>Monitoreo avanzado (opcional)</summary>
        <label className="check-row" style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={avanzado} onChange={(e) => onCambiarConfig({ monitoreo_avanzado_activo: e.target.checked })} /> Activo (PVC, GC,
          IC, RVS, saturación venosa, variables de volemia)
        </label>
        {avanzado && <MonitoreoAvanzado donanteId={donanteId} mediciones={mediciones} registros={registros} onChange={onMedicionesChange} />}
      </details>
    </div>
  );
}
