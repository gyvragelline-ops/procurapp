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
  balancePorHora,
  bombasDeFila,
  camposFueraDeRango,
  filaPrecargada,
  horaPendiente,
  inicioDeHora,
  ordenarPorHora,
  perdidasDeFila,
  registroDeLaHora,
  textoHuecos,
  totalesHora,
  type BombaHora,
  type CampoLiquido,
  type EstadoBombas,
  type FilaHoraria,
  type InfusionFila,
} from "@/lib/procuracion/mantenimiento-calculos";
import { LIQUIDOS_ENFERMERIA } from "@/lib/procuracion/mantenimiento-metas";
import { BombasDeLaHora, avisosDosisDeFila, bombasFormDesde, bombasParaGuardar, type BombasForm } from "./mantenimiento-dilucion";
import { Bolos, BombasEnCurso, HistorialSeteos } from "./mantenimiento-infusiones";
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

// Vista de ENFERMERÍA: la pantalla muestra solo la próxima hora
// pendiente. Si ya llegó y no está cargada: "Hora HH:00 pendiente" con el
// botón para cargarla (alarma roja pasados 15 minutos); si no, "Próxima
// carga HH:00". Una hora no cargada es un hueco y listo: si queda ENTRE
// dos horas cargadas, se avisa en gris junto al balance acumulado.
// "Corregir una hora anterior" (plegado) solo edita o anula horas ya
// cargadas.
export default function MantenimientoEnfermeria(props: Comunes & { estado: EstadoBombas; ahora: number }) {
  const { donanteId, pesoKg, registros, infusiones, bombas, estado, ahora, onInfusionesChange } = props;
  const [solapa, setSolapa] = useState<"hora" | "bolos">("hora");
  const [abierta, setAbierta] = useState<number | null>(null); // hora con el formulario abierto

  const horaActual = inicioDeHora(ahora);
  const pendiente = horaPendiente(registros, ahora);
  const balance = balancePorHora(registros, bombas, pesoKg, ahora);
  const cargadas = balance.horas.filter((h) => h.estado === "cargada");
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

      {solapa === "bolos" ? (
        <Bolos donanteId={donanteId} infusiones={infusiones} onInfusionesChange={onInfusionesChange} />
      ) : (
        <>
          {abierta !== null ? (
            <FilaHora
              key={abierta}
              {...props}
              inicio={abierta}
              esHoraActual={abierta === horaActual}
              acumuladoPrevio={acumuladoAntesDe(abierta)}
              huecos={balance.huecos}
              onListo={() => setAbierta(null)}
            />
          ) : pendiente.estado === "pendiente" ? (
            <div
              style={{
                border: `2px solid ${pendiente.alarma ? "var(--red)" : "var(--amber)"}`,
                borderRadius: 10,
                padding: 12,
                marginBottom: 12,
                textAlign: "center",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 18, color: pendiente.alarma ? "var(--red)" : undefined }}>
                Hora {textoHora(pendiente.inicio)} pendiente
              </div>
              <button className="btn btn-accent" style={{ fontSize: 16, padding: "10px 18px", marginTop: 8 }} onClick={() => setAbierta(pendiente.inicio)}>
                Cargar hora {textoHora(pendiente.inicio)}
              </button>
              <ResumenBalance acumulado={balance.acumulado} huecos={balance.huecos} />
            </div>
          ) : (
            <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, marginBottom: 12, textAlign: "center" }}>
              <div style={{ fontWeight: 700 }}>Próxima carga {textoHora(pendiente.inicio)}</div>
              <ResumenBalance acumulado={balance.acumulado} huecos={balance.huecos} />
            </div>
          )}

          <details style={{ marginBottom: 10 }}>
            <summary className="tiny">Bombas en curso (dosis en vivo){estado.filaDato ? ` · última fila ${hora(estado.filaDato)}` : ""}</summary>
            <BombasEnCurso estado={estado} donanteId={donanteId} pesoKg={pesoKg} infusiones={infusiones} onInfusionesChange={onInfusionesChange} />
          </details>
          <HistorialSeteos infusiones={infusiones} onInfusionesChange={onInfusionesChange} />

          {/* ------------------------------------------------ corregir (solo horas ya cargadas) */}
          {cargadas.length > 0 && (
            <details>
              <summary className="tiny">Corregir una hora anterior</summary>
              <div style={{ overflowX: "auto" }}>
                <table className="tiny" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    {[...cargadas].reverse().map((b) =>
                      b.estado !== "cargada" ? null : (
                        <tr key={b.inicio} style={{ cursor: "pointer" }} onClick={() => setAbierta(b.inicio)}>
                          <td>{textoHora(b.inicio)}</td>
                          <td style={{ textAlign: "right" }}>+{num(b.ingresos, 0)}</td>
                          <td style={{ textAlign: "right" }}>
                            −{num(b.egresos, 0)}
                            {b.perdidas.valor === null ? "*" : ""}
                          </td>
                          <td style={{ textAlign: "right" }}>= {num(b.parcial, 0)}</td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
              {balance.horasSinPerdidas > 0 && <div className="tiny muted">* sin pérdidas insensibles (falta peso).</div>}
            </details>
          )}
        </>
      )}
    </div>
  );
}

function ResumenBalance({ acumulado, huecos }: { acumulado: number; huecos: number }) {
  const hueco = textoHuecos(huecos);
  return (
    <div className="tiny" style={{ marginTop: 8 }}>
      Balance acumulado: <strong>{num(acumulado, 0)} mL</strong>
      {hueco && <span className="muted"> · {hueco}</span>}
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
  acumuladoPrevio,
  huecos,
  onListo,
}: Comunes & {
  inicio: number;
  esHoraActual: boolean;
  acumuladoPrevio: number;
  huecos: number;
  onListo: () => void; // cerrar el formulario (después de guardar, anular o cancelar)
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
      onListo(); // cierra el formulario: la pantalla vuelve a la hora pendiente
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la hora.");
    } finally {
      setGuardando(false);
    }
  }

  async function anular() {
    if (!reg) return;
    setError(null);
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
        {!guardando && (
          <button className="btn btn-sm" onClick={onListo}>
            Cerrar
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
        {textoHuecos(huecos) && <> · {textoHuecos(huecos)}</>}
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
