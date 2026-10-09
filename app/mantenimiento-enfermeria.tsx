"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  anularRegistro,
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
  horasAnterioresSinCargar,
  horasDelCaso,
  inicioDeHora,
  ordenarPorHora,
  perdidasDeFila,
  registroDeLaHora,
  totalesHora,
  type BombaHora,
  type CampoLiquido,
  type EstadoBombas,
  type FilaHoraria,
  type InfusionFila,
} from "@/lib/procuracion/mantenimiento-calculos";
import { LIQUIDOS_ENFERMERIA } from "@/lib/procuracion/mantenimiento-metas";
import { BombasDeLaHora, avisosDosisDeFila, bombasFormDesde, bombasParaGuardar, type BombasForm } from "./mantenimiento-dilucion";
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

const textoHora = (ms: number) => `${String(new Date(ms).getHours()).padStart(2, "0")}:00`;
const aTexto = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));
const numeroO = (t: string): number | null => {
  const n = aNumero(t);
  return n === null || Number.isNaN(n) ? null : n;
};

// ---------------------------------------------------------------------
// Horas salteadas: por ahora recordadas en el dispositivo (no viajan a la
// base). Si el navegador no deja guardar, se sigue funcionando.
// ---------------------------------------------------------------------
const claveSalteadas = (donanteId: string) => `procurapp:mantenimiento:salteadas:${donanteId}`;
function leerLocal<T>(clave: string, porDefecto: T): T {
  try {
    const v = window.localStorage.getItem(clave);
    return v === null ? porDefecto : (JSON.parse(v) as T);
  } catch {
    return porDefecto;
  }
}
function escribirLocal(clave: string, valor: unknown) {
  try {
    window.localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // sin almacenamiento: no se recuerda, pero la carga sigue
  }
}

type Comunes = {
  donanteId: string;
  pesoKg: number | null;
  registros: RegistroMantenimiento[];
  infusiones: InfusionFila[];
  bombas: BombaHora[];
  lab: ValorLaboratorio[];
  onRegistrosChange: (r: RegistroMantenimiento[]) => void;
  onInfusionesChange: (f: InfusionFila[]) => void;
  onBombasChange: (b: BombaHora[]) => void;
  onLabChange: (v: ValorLaboratorio[]) => void;
  onGuardarPeso: (pesoKg: number) => Promise<void>;
};

// Vista de ENFERMERÍA: la pantalla muestra la HORA ACTUAL. Las horas
// anteriores sin cargar se resumen en una línea ("Faltan N horas
// anteriores") que abre "Horas anteriores", donde se cargan, se saltan
// (quedan sin dato, no cero), se corrigen o se anulan. La alarma roja es
// solo para la hora en curso, pasados 15 minutos.
export default function MantenimientoEnfermeria(props: Comunes & { estado: EstadoBombas; ahora: number }) {
  const { donanteId, pesoKg, registros, infusiones, bombas, estado, ahora, onInfusionesChange } = props;
  const [solapa, setSolapa] = useState<"hora" | "bolos">("hora");
  const [horaElegida, setHoraElegida] = useState<number | null>(null); // hora anterior abierta a mano
  const [salteadas, setSalteadas] = useState<number[]>(() => leerLocal<number[]>(claveSalteadas(donanteId), []));
  const [anterioresAbiertas, setAnterioresAbiertas] = useState(false);

  const horaActual = inicioDeHora(ahora);
  const grilla = horasDelCaso(registros, ahora);
  const alarmas = alarmasEnfermeria(grilla, salteadas);
  const balance = balancePorHora(registros, bombas, pesoKg, ahora);
  const faltanAnteriores = horasAnterioresSinCargar(grilla);
  const actualCargada = registroDeLaHora(registros, horaActual) !== null;
  const abierta = horaElegida ?? (actualCargada ? null : horaActual);

  function saltar(inicio: number) {
    const nuevas = [...new Set([...salteadas, inicio])];
    setSalteadas(nuevas);
    escribirLocal(claveSalteadas(donanteId), nuevas);
    setHoraElegida(null);
  }
  const acumuladoAntesDe = (inicio: number) =>
    balance.horas.reduce((acc, h) => (h.estado === "cargada" && h.inicio < inicio ? h.acumulado : acc), 0);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{hora(new Date(ahora).toISOString())}</div>
        <div className="btn-row">
          <button className={`btn btn-sm ${solapa === "hora" ? "btn-accent" : ""}`} onClick={() => setSolapa("hora")}>
            Hora
          </button>
          <button className={`btn btn-sm ${solapa === "bolos" ? "btn-accent" : ""}`} onClick={() => setSolapa("bolos")}>
            Bolos
          </button>
        </div>
      </div>

      {alarmas.map((a) => (
        <div key={a.inicio} className="tiny" style={{ color: "var(--red)", fontWeight: 600, marginBottom: 6 }}>
          ● {a.texto}
        </div>
      ))}
      {faltanAnteriores > 0 && (
        <button
          className="btn btn-sm"
          style={{ fontSize: 11, marginBottom: 8 }}
          onClick={() => {
            setSolapa("hora");
            setAnterioresAbiertas(true);
          }}
        >
          Faltan {faltanAnteriores} {faltanAnteriores === 1 ? "hora anterior" : "horas anteriores"}
        </button>
      )}

      {solapa === "bolos" ? (
        <Bolos donanteId={donanteId} infusiones={infusiones} onInfusionesChange={onInfusionesChange} />
      ) : (
        <>
          {abierta === null ? (
            <div style={{ border: "1px solid var(--green)", borderRadius: 10, padding: 12, marginBottom: 12, textAlign: "center" }}>
              <div style={{ fontWeight: 700 }}>Hora {textoHora(horaActual)} cargada ✓</div>
              <div className="tiny muted">
                Próxima carga {textoHora(horaActual + 3_600_000)} ·{" "}
                <button className="btn btn-sm" style={{ fontSize: 11, padding: "0 6px" }} onClick={() => setHoraElegida(horaActual)}>
                  corregir
                </button>
              </div>
              <ResumenBalance acumulado={balance.acumulado} faltan={balance.faltan} />
            </div>
          ) : (
            <FilaHora
              key={abierta}
              {...props}
              inicio={abierta}
              esHoraActual={abierta === horaActual}
              esProxima={horaElegida === null}
              puedeSaltar={abierta < horaActual}
              acumuladoPrevio={acumuladoAntesDe(abierta)}
              faltan={balance.faltan}
              onFijar={() => setHoraElegida(abierta)}
              onListo={() => setHoraElegida(null)}
              onSaltar={() => saltar(abierta)}
            />
          )}

          <details style={{ marginBottom: 10 }}>
            <summary className="tiny">Bombas en curso (dosis en vivo){estado.filaDato ? ` · última fila ${hora(estado.filaDato)}` : ""}</summary>
            <BombasEnCurso estado={estado} donanteId={donanteId} pesoKg={pesoKg} infusiones={infusiones} onInfusionesChange={onInfusionesChange} />
          </details>

          {/* ------------------------------------------------ horas anteriores */}
          <details open={anterioresAbiertas} onToggle={(e) => setAnterioresAbiertas((e.target as HTMLDetailsElement).open)}>
            <summary className="tiny">Horas anteriores</summary>
            {balance.horas.length === 0 && <div className="tiny muted">Todavía no hay horas.</div>}
            <div style={{ overflowX: "auto" }}>
              <table className="tiny" style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {[...balance.horas].filter((b) => b.inicio < horaActual).reverse().map((b) => {
                    const salteada = b.estado !== "cargada" && salteadas.includes(b.inicio);
                    const r = b.estado === "cargada" ? registros.find((x) => x.id === b.registroId) : null;
                    return (
                      <tr
                        key={b.inicio}
                        style={{ cursor: "pointer", color: b.estado === "faltante" && !salteada ? "var(--red)" : undefined }}
                        onClick={() => setHoraElegida(b.inicio)}
                      >
                        <td>{textoHora(b.inicio)}</td>
                        {b.estado === "cargada" ? (
                          <>
                            <td style={{ textAlign: "right" }}>+{num(b.ingresos, 0)}</td>
                            <td style={{ textAlign: "right" }}>
                              −{num(b.egresos, 0)}
                              {b.perdidas.valor === null ? "*" : ""}
                            </td>
                            <td style={{ textAlign: "right" }}>= {num(b.parcial, 0)}</td>
                            <td className="muted">{r?.aviso_medico ? `⚠ ${r.aviso_medico}` : ""}</td>
                          </>
                        ) : (
                          <td colSpan={4} className="muted">
                            {salteada ? (
                              "salteada (sin datos)"
                            ) : (
                              <>
                                sin cargar ·{" "}
                                <button
                                  className="btn btn-sm"
                                  style={{ fontSize: 11, padding: "0 6px" }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    saltar(b.inicio);
                                  }}
                                >
                                  saltar (sin datos)
                                </button>
                              </>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {balance.horasSinPerdidas > 0 && <div className="tiny muted">* sin pérdidas insensibles (falta peso).</div>}
          </details>
        </>
      )}
    </div>
  );
}

function ResumenBalance({ acumulado, faltan }: { acumulado: number; faltan: number }) {
  return (
    <div className="tiny" style={{ marginTop: 4 }}>
      Balance acumulado: <strong>{num(acumulado, 0)} mL</strong>
      {faltan > 0 && (
        <span style={{ color: "var(--red)" }}>
          {" "}
          · faltan {faltan} {faltan === 1 ? "hora" : "horas"}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// La fila de UNA hora. Se monta de nuevo (key) cada vez que cambia la
// hora, así arranca limpia: bombas precargadas de la hora anterior
// ("copiado"), líquidos, signos, diuresis y SNG vacíos.
// ---------------------------------------------------------------------
function FilaHora({
  donanteId,
  pesoKg,
  registros,
  infusiones,
  bombas,
  lab,
  onRegistrosChange,
  onInfusionesChange,
  onBombasChange,
  onLabChange,
  onGuardarPeso,
  inicio,
  esHoraActual,
  esProxima,
  puedeSaltar,
  acumuladoPrevio,
  faltan,
  onFijar,
  onListo,
  onSaltar,
}: Comunes & {
  inicio: number;
  esHoraActual: boolean;
  esProxima: boolean; // la hora actual; si no, una hora anterior abierta a mano
  puedeSaltar: boolean; // hora anterior sin cargar
  acumuladoPrevio: number;
  faltan: number;
  // Mientras se guarda, la hora queda fija: al aparecer su registro, "la
  // próxima sin cargar" cambiaría y el formulario se iría antes de
  // terminar (y un error de las bombas no se vería).
  onFijar: () => void;
  onListo: () => void;
  onSaltar: () => void;
}) {
  const reg = registroDeLaHora(registros, inicio);
  const [precarga] = useState(() => filaPrecargada(registros, bombas, infusiones, inicio).bombas);
  const [liquidos, setLiquidos] = useState<Record<CampoLiquido, string>>(
    () => Object.fromEntries(LIQUIDOS_ENFERMERIA.map((l) => [l.campo, reg ? aTexto(reg[l.campo]) : ""])) as Record<CampoLiquido, string>
  );
  const [bombasForm, setBombasForm] = useState<BombasForm>(() =>
    reg
      ? bombasFormDesde(
          bombasDeFila(bombas, reg.id).map((b) => ({ droga: b.droga, velocidad_ml_h: b.velocidad_ml_h, dilucion_id: b.dilucion_id })),
          false
        )
      : bombasFormDesde(precarga, true)
  );
  const [diuresis, setDiuresis] = useState(aTexto(reg?.diuresis_ml));
  const [sng, setSng] = useState(aTexto(reg?.egr_sng_drenajes_ml));
  const [perdidasManual, setPerdidasManual] = useState<string | null>(reg?.perdidas_insensibles_editadas ? aTexto(reg.perdidas_insensibles_ml) : null);
  const [signos, setSignos] = useState<Partial<Record<Signo, string>>>(() =>
    reg ? Object.fromEntries(SIGNOS.map((s) => [s.campo, aTexto(reg[s.campo])])) : {}
  );
  const [glucemia, setGlucemia] = useState("");
  const [glucemiaHora, setGlucemiaHora] = useState(() => aInputLocal(new Date(momentoActual()).toISOString()));
  const [aviso, setAviso] = useState(reg?.aviso_medico ?? "");
  const [pendiente, setPendiente] = useState<string | null>(null);
  const [anulando, setAnulando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ultimaGlucemia =
    ordenarPorHora(lab.filter((v) => v.parametro === "glucemia" && !v.anulado).map((v) => ({ ...v, registrado_en: v.medido_en }))).pop() ?? null;

  // ---------------------------------------------------------- totales en vivo
  const otros = registros.filter((r) => r.id !== reg?.id);
  const filaForm: FilaHoraria = {
    id: reg?.id ?? "nueva",
    registrado_en: reg?.registrado_en ?? new Date(inicio).toISOString(),
    anulado: false,
    temperatura: numeroO(signos.temperatura ?? ""),
    diuresis_ml: numeroO(diuresis),
    egr_sng_drenajes_ml: numeroO(sng),
    perdidas_insensibles_ml: perdidasManual !== null ? numeroO(perdidasManual) : null,
    perdidas_insensibles_editadas: perdidasManual !== null,
    ...(Object.fromEntries(LIQUIDOS_ENFERMERIA.map((l) => [l.campo, numeroO(liquidos[l.campo])])) as Record<CampoLiquido, number | null>),
  };
  const perdidas = perdidasDeFila(filaForm, [...otros, filaForm], pesoKg);
  const totales = totalesHora(
    filaForm,
    Object.values(bombasForm).map((f) => ({ velocidad_ml_h: numeroO(f?.velocidadTexto ?? "") ?? 0 })),
    perdidas.valor
  );

  // ---------------------------------------------------------- guardar
  async function guardar(confirmadoPlausible = false) {
    setError(null);
    const valores: Record<string, number | null> = {};
    for (const l of LIQUIDOS_ENFERMERIA) {
      const n = aNumero(liquidos[l.campo]);
      if (n !== null && (Number.isNaN(n) || n < 0)) return setError(`Valor inválido en ${l.etiqueta}.`);
      valores[l.campo] = n;
    }
    for (const [campo, texto, etiqueta] of [
      ["diuresis_ml", diuresis, "Diuresis"],
      ["egr_sng_drenajes_ml", sng, "SNG / drenajes"],
    ] as const) {
      const n = aNumero(texto);
      if (n !== null && (Number.isNaN(n) || n < 0)) return setError(`Valor inválido en ${etiqueta}.`);
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
    const avisosBombas = avisosDosisDeFila(bombasForm, infusiones, pesoKg);
    if ((fuera.length > 0 || avisosBombas.length > 0) && !confirmadoPlausible) {
      const etiqueta = (campo: string) =>
        LIQUIDOS_ENFERMERIA.find((l) => l.campo === campo)?.etiqueta ??
        SIGNOS.find((s) => s.campo === campo)?.etiqueta ??
        ({ diuresis_ml: "Diuresis", egr_sng_drenajes_ml: "SNG / drenajes", perdidas_insensibles_ml: "Pérdidas insensibles", glucemia: "Glucemia" } as Record<string, string>)[campo] ??
        campo;
      const textos = [...fuera.map((f) => `${etiqueta(f.campo)} ${num(f.valor)} (${num(f.min)}-${num(f.max)})`), ...avisosBombas];
      return setPendiente(`¿Seguro? Fuera del rango esperable: ${textos.join("; ")}.`);
    }

    onFijar();
    setGuardando(true);
    try {
      // 1) La fila de la hora (completa la existente o crea una a hh:00).
      const registradoEn = reg?.registrado_en ?? new Date(inicio).toISOString();
      const anteriorVigente = otros.some((r) => !r.anulado && r.registrado_en < registradoEn);
      const datos: DatosRegistro = {
        registrado_en: registradoEn,
        ...valores,
        diuresis_es_ultima_hora: !anteriorVigente,
        perdidas_insensibles_ml: perdidasEditadas,
        perdidas_insensibles_editadas: perdidasEditadas !== null,
        aviso_medico: aviso.trim() || null,
      };
      const guardado = await guardarRegistro(supabase, donanteId, datos, reg?.id ?? null);
      onRegistrosChange(reg ? registros.map((r) => (r.id === reg.id ? guardado : r)) : [...registros, guardado]);

      // 2) Bombas de la hora (y los seteos confirmados con "Listo").
      const instante = esHoraActual ? new Date(momentoActual()).toISOString() : registradoEn;
      const { nuevasInfusiones, bombas: deLaFila } = await guardarBombasDeFila(supabase, donanteId, guardado.id, pb.filas, instante, null);
      if (nuevasInfusiones.length) onInfusionesChange([...infusiones, ...nuevasInfusiones]);
      onBombasChange([...bombas.filter((b) => b.registro_id !== guardado.id), ...deLaFila]);

      // 3) Glucemia: a laboratorio_valores (una sola fuente), con su hora de medición.
      if (glu !== null && gluIso) {
        const v = await guardarGlucemia(supabase, donanteId, glu, gluIso, "enfermeria");
        onLabChange([v, ...lab]);
      }
      onListo(); // vuelve a la hora actual
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la hora.");
    } finally {
      setGuardando(false);
    }
  }

  async function anular() {
    if (!reg) return;
    setError(null);
    onFijar();
    setGuardando(true);
    try {
      await anularRegistro(supabase, reg.id);
      onRegistrosChange(registros.map((r) => (r.id === reg.id ? { ...r, anulado: true } : r)));
      onListo();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo anular la hora.");
    } finally {
      setGuardando(false);
    }
  }

  // "Corregir" glucemia: un toque anula el valor y lo abre para cargarlo de nuevo.
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

  const campoMl = (etiqueta: string, valor: string, set: (x: string) => void) => (
    <div className="field-row" key={etiqueta}>
      <span className="field-label">{etiqueta}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <input className="mini-input" inputMode="decimal" placeholder="ej. 500" style={{ width: 80 }} value={valor} onChange={(e) => set(e.target.value)} />
        <span className="tiny">mL</span>
      </span>
    </div>
  );

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>
          Hora {textoHora(inicio)}
          {reg ? <span className="tiny muted"> · ya cargada a las {hora(reg.registrado_en)}</span> : null}
        </div>
        {!esProxima && !guardando && (
          <button className="btn btn-sm" onClick={onListo}>
            Volver a la hora actual
          </button>
        )}
      </div>
      <ErrorVisible mensaje={error} />

      <div className="section-label">Signos</div>
      {SIGNOS.map((s) => (
        <div className="field-row" key={s.campo}>
          <span className="field-label">
            {s.etiqueta} ({s.unidad})
          </span>
          <input
            className="mini-input"
            inputMode="decimal"
            style={{ width: 80 }}
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
        <input className="mini-input" inputMode="decimal" style={{ width: 80 }} value={glucemia} onChange={(e) => setGlucemia(e.target.value)} />
      </div>
      {glucemia.trim() !== "" && (
        <div className="field-row">
          <span className="field-label">Hora de medición de la glucemia</span>
          <input type="datetime-local" className="mini-input" value={glucemiaHora} onChange={(e) => setGlucemiaHora(e.target.value)} />
        </div>
      )}

      <div className="section-label" style={{ marginTop: 8 }}>Líquidos de esta hora</div>
      {LIQUIDOS_ENFERMERIA.map((l) => campoMl(l.etiqueta, liquidos[l.campo], (x) => setLiquidos((v) => ({ ...v, [l.campo]: x }))))}

      <div className="section-label" style={{ marginTop: 8 }}>Bombas</div>
      <BombasDeLaHora form={bombasForm} onChange={setBombasForm} infusiones={infusiones} pesoKg={pesoKg} onGuardarPeso={onGuardarPeso} />

      <div className="section-label" style={{ marginTop: 8 }}>Egresos</div>
      {campoMl("Diuresis", diuresis, setDiuresis)}
      {campoMl("SNG / drenajes", sng, setSng)}
      <div className="field-row">
        <span className="field-label">
          Pérdidas insensibles
          {perdidasManual !== null && (
            <span className="chip chip-amber" style={{ marginLeft: 6 }}>
              editado
            </span>
          )}
          {perdidasManual === null && perdidas.faltaPeso && (
            <span className="tiny" style={{ display: "block", color: "var(--amber)" }}>
              Falta peso: balance sin pérdidas insensibles.
            </span>
          )}
        </span>
        <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <input
            className="mini-input"
            inputMode="decimal"
            style={{ width: 80 }}
            value={perdidasManual ?? aTexto(perdidas.valor === null ? null : Number(perdidas.valor.toFixed(1)))}
            onChange={(e) => setPerdidasManual(e.target.value)}
          />
          <span className="tiny">mL</span>
          {perdidasManual !== null && (
            <button className="btn btn-sm" onClick={() => setPerdidasManual(null)}>
              Usar cálculo
            </button>
          )}
        </span>
      </div>
      {perdidas.faltaPeso && perdidasManual === null && <PedirPeso onGuardar={onGuardarPeso} />}

      {/* ------------------------------------------------ final de la fila */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: 8,
          marginTop: 12,
          padding: "10px 0",
          borderTop: "1px solid var(--border)",
        }}
      >
        <div>
          <div className="tiny muted">Ingresos</div>
          <div style={{ fontWeight: 600 }}>{num(totales.ingresos, 0)} mL</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div className="tiny muted">Balance acumulado</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{num(acumuladoPrevio + totales.parcial, 0)} mL</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="tiny muted">Egresos</div>
          <div style={{ fontWeight: 600 }}>{num(totales.egresos, 0)} mL</div>
        </div>
      </div>
      <div className="tiny muted" style={{ textAlign: "center" }}>
        Balance de esta hora: {num(totales.parcial, 0)} mL
        {faltan > 0 && (
          <span style={{ color: "var(--red)" }}>
            {" "}
            · faltan {faltan} {faltan === 1 ? "hora" : "horas"}
          </span>
        )}
      </div>

      {/* ------------------------------------------------ aviso */}
      <details style={{ marginTop: 10 }} open={aviso.trim() !== "" || undefined}>
        <summary className="tiny">Aviso al médico (opcional)</summary>
        <input className="mini-input" style={{ width: "100%", maxWidth: 320, marginTop: 4 }} value={aviso} onChange={(e) => setAviso(e.target.value)} placeholder="Nota corta" />
      </details>

      {pendiente ? (
        <Confirmacion texto={pendiente} textoSi="Sí, guardar" ocupado={guardando} onSi={() => guardar(true)} onNo={() => setPendiente(null)} />
      ) : anulando ? (
        <Confirmacion
          texto={`¿Anular la hora ${textoHora(inicio)}? Va a quedar tachada y sin dato (no cero). Si fue un error, volvé a cargarla.`}
          textoSi="Sí, anular"
          ocupado={guardando}
          onSi={anular}
          onNo={() => setAnulando(false)}
        />
      ) : (
        <div className="btn-row" style={{ marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn btn-accent" style={{ fontSize: 16, padding: "10px 18px" }} disabled={guardando} onClick={() => guardar()}>
            {guardando ? "Guardando…" : `Guardar hora ${textoHora(inicio)}`}
          </button>
          {puedeSaltar && !reg && (
            <button className="btn btn-sm" style={{ fontSize: 11 }} disabled={guardando} onClick={onSaltar}>
              Saltar esta hora (sin datos)
            </button>
          )}
          {reg && (
            <button className="btn btn-sm" style={{ fontSize: 11 }} disabled={guardando} onClick={() => setAnulando(true)}>
              Anular esta hora
            </button>
          )}
        </div>
      )}
    </div>
  );
}
