"use client";

import { useImperativeHandle, useState, type Ref } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CAMPOS_REGISTRO,
  anularRegistro,
  guardarBombasDeFila,
  guardarRegistro,
  type CampoNumericoRegistro,
  type DatosRegistro,
  type RegistroMantenimiento,
} from "@/lib/procuracion/mantenimiento";
import {
  bombasDeFila,
  camposFueraDeRango,
  filaPrecargada,
  inicioDeHora,
  ordenarPorHora,
  registroDeLaHora,
  validarHoraRegistro,
  type BombaFormulario,
  type BombaHora,
  type InfusionFila,
} from "@/lib/procuracion/mantenimiento-calculos";
import { BombasDeLaHora, avisosDosisDeFila, bombasFormDesde, bombasParaGuardar, type BombasForm } from "./mantenimiento-dilucion";
import { Confirmacion, ErrorVisible, aInputLocal, aNumero, fechaHora, hora, momentoActual, num } from "./mantenimiento-ui";

const supabase = createClient();

const mismaHoraQueAhora = (iso: string) => inicioDeHora(new Date(iso).getTime()) === inicioDeHora(momentoActual());

type Pendiente = { tipo: "orden" | "plausibilidad"; texto: string };

// Lo que el panel puede pedirle desde afuera (botón fijo "+ Nuevo registro").
export type ControlRegistros = { abrirNuevo: () => void };

// Registro horario de Mantenimiento: carga, edición (hora y valores) y
// anulación. Validaciones antes de guardar: hora futura no se acepta; si
// la edición cambia el orden de los registros, pide confirmación; valores
// fuera de rango plausible piden "¿seguro?" (no bloquea).
// Las bombas van en la misma fila horaria que carga enfermería (una sola
// fuente): fila nueva precargada con la hora anterior; si el registro
// completa una hora que ya existe, las bombas se guardan solo si se
// tocaron (no se pisa lo que cargó enfermería).
export default function MantenimientoRegistros({
  donanteId,
  registros,
  infusiones,
  bombas,
  pesoKg,
  monitoreoAvanzado,
  onRegistrosChange,
  onInfusionesChange,
  onBombasChange,
  onGuardarPeso,
  ref,
}: {
  donanteId: string;
  registros: RegistroMantenimiento[];
  infusiones: InfusionFila[];
  bombas: BombaHora[];
  pesoKg: number | null;
  monitoreoAvanzado: boolean;
  onRegistrosChange: (r: RegistroMantenimiento[]) => void;
  onInfusionesChange: (f: InfusionFila[]) => void;
  onBombasChange: (b: BombaHora[]) => void;
  onGuardarPeso: (pesoKg: number) => Promise<void>;
  ref?: Ref<ControlRegistros>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [horaTexto, setHoraTexto] = useState("");
  const [textos, setTextos] = useState<Partial<Record<CampoNumericoRegistro, string>>>({});
  const [disfuncion, setDisfuncion] = useState(false);
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [confirmados, setConfirmados] = useState<{ orden: boolean; plausibilidad: boolean }>({ orden: false, plausibilidad: false });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anulandoId, setAnulandoId] = useState<string | null>(null);
  const [bombasForm, setBombasForm] = useState<BombasForm>({});
  const [precarga, setPrecarga] = useState<BombaFormulario[]>([]);
  const [bombasTocadas, setBombasTocadas] = useState(false);

  const vigentes = ordenarPorHora(registros.filter((r) => !r.anulado));

  // Bombas del formulario para una hora: las de esa fila si ya existe;
  // si no, las de la hora anterior ("copiado de la hora anterior").
  function prepararBombas(inicioHora: number, propio: RegistroMantenimiento | null) {
    const fila = propio ?? registroDeLaHora(registros, inicioHora);
    const pre = filaPrecargada(registros, bombas, infusiones, inicioHora);
    setPrecarga(pre.bombas);
    setBombasForm(
      fila
        ? bombasFormDesde(
            bombasDeFila(bombas, fila.id).map((b) => ({ droga: b.droga, velocidad_ml_h: b.velocidad_ml_h, dilucion_id: b.dilucion_id })),
            false
          )
        : bombasFormDesde(pre.bombas, true)
    );
    setBombasTocadas(false);
  }

  function cambiarHora(texto: string) {
    setHoraTexto(texto);
    if (!texto || bombasTocadas || editId) return;
    prepararBombas(inicioDeHora(new Date(texto).getTime()), null);
  }

  function abrirNuevo() {
    setEditId(null);
    setHoraTexto(aInputLocal(new Date().toISOString()));
    // FiO2 y disfunción se arrastran del último registro (editables).
    const ultimo = vigentes[vigentes.length - 1];
    setTextos(ultimo?.fio2 != null ? { fio2: String(ultimo.fio2) } : {});
    setDisfuncion(ultimo?.disfuncion_miocardica ?? false);
    setPendiente(null);
    setConfirmados({ orden: false, plausibilidad: false });
    setError(null);
    prepararBombas(inicioDeHora(momentoActual()), null);
    setAbierto(true);
  }

  useImperativeHandle(ref, () => ({ abrirNuevo }));

  function abrirEdicion(r: RegistroMantenimiento) {
    setEditId(r.id);
    setHoraTexto(aInputLocal(r.registrado_en));
    const t: Partial<Record<CampoNumericoRegistro, string>> = {};
    for (const c of CAMPOS_REGISTRO) if (r[c.campo] !== null) t[c.campo] = String(r[c.campo]).replace(".", ",");
    setTextos(t);
    setDisfuncion(r.disfuncion_miocardica);
    setPendiente(null);
    setConfirmados({ orden: false, plausibilidad: false });
    setError(null);
    prepararBombas(inicioDeHora(new Date(r.registrado_en).getTime()), r);
    setAbierto(true);
  }

  // Diuresis: el primer registro (sin otro vigente antes) carga "mL de la
  // última hora"; los demás, "mL desde el registro anterior".
  function anteriorA(isoHora: string): RegistroMantenimiento | null {
    const previos = vigentes.filter((r) => r.id !== editId && r.registrado_en < isoHora);
    return previos[previos.length - 1] ?? null;
  }
  const horaIso = horaTexto ? new Date(horaTexto).toISOString() : new Date().toISOString();
  const anterior = anteriorA(horaIso);
  // Una sola fila por hora de reloj: si ya hay un registro en esa hora
  // (del médico o de enfermería), un registro nuevo completa ese mismo.
  const existenteEnLaHora = editId ? null : registroDeLaHora(registros, inicioDeHora(new Date(horaIso).getTime()));

  async function guardar(conf = confirmados) {
    setError(null);
    if (!horaTexto) return setError("Falta la hora del registro.");
    const iso = new Date(horaTexto).toISOString();

    const v = validarHoraRegistro(iso, momentoActual(), registros, editId);
    if (v.estado === "futura") return setError("La hora no puede ser futura.");

    const valores: Partial<Record<CampoNumericoRegistro, number | null>> = {};
    for (const c of CAMPOS_REGISTRO) {
      if (c.avanzado && !monitoreoAvanzado && !editId) continue;
      const n = aNumero(textos[c.campo] ?? "");
      if (n !== null && Number.isNaN(n)) return setError(`Valor inválido en ${c.etiqueta}.`);
      valores[c.campo] = n;
    }
    const pb = bombasParaGuardar(bombasForm, precarga);
    if (!pb.ok) return setError(pb.error);
    if (Object.values(valores).every((x) => x === null) && pb.filas.length === 0) return setError("Cargá al menos un valor.");

    if (v.cambiaOrden && !conf.orden) {
      return setPendiente({ tipo: "orden", texto: "Con esta hora cambia el orden de los registros (y los intervalos de diuresis). ¿Confirmás?" });
    }
    const fuera = camposFueraDeRango(valores);
    const avisosBombas = avisosDosisDeFila(bombasForm, infusiones, pesoKg);
    if ((fuera.length > 0 || avisosBombas.length > 0) && !conf.plausibilidad) {
      const etiqueta = (campo: string) => CAMPOS_REGISTRO.find((c) => c.campo === campo)?.etiqueta ?? campo;
      const textos = [...fuera.map((f) => `${etiqueta(f.campo)} ${num(f.valor)} (${num(f.min)}-${num(f.max)})`), ...avisosBombas];
      return setPendiente({ tipo: "plausibilidad", texto: `¿Seguro? Fuera del rango esperable: ${textos.join("; ")}.` });
    }

    // Completar el registro existente de esa hora: solo se pisan los
    // valores cargados ahora (los vacíos no borran lo que ya había).
    const existente = editId
      ? registros.find((r) => r.id === editId) ?? null
      : registroDeLaHora(registros, inicioDeHora(new Date(iso).getTime()));
    const idDestino = editId ?? existente?.id ?? null;
    const aplicar: Partial<Record<CampoNumericoRegistro, number | null>> = editId
      ? valores
      : Object.fromEntries(Object.entries(valores).filter(([, x]) => x !== null));
    const registradoEn = existente && !editId ? existente.registrado_en : iso;
    // Fila nueva: guardar confirma las bombas precargadas. Fila que ya
    // existía: solo si se tocaron las bombas.
    const guardarBombas = idDestino === null || bombasTocadas;

    const datos: DatosRegistro = {
      registrado_en: registradoEn,
      ...aplicar,
      disfuncion_miocardica: disfuncion,
      diuresis_es_ultima_hora: anteriorA(registradoEn) === null,
    };
    setGuardando(true);
    try {
      const guardado = await guardarRegistro(supabase, donanteId, datos, idDestino);
      onRegistrosChange(idDestino ? registros.map((r) => (r.id === idDestino ? guardado : r)) : [...registros, guardado]);
      if (guardarBombas) {
        const instante = mismaHoraQueAhora(registradoEn) ? new Date(momentoActual()).toISOString() : registradoEn;
        const { nuevasInfusiones, bombas: deLaFila } = await guardarBombasDeFila(supabase, donanteId, guardado.id, pb.filas, instante, null);
        if (nuevasInfusiones.length) onInfusionesChange([...infusiones, ...nuevasInfusiones]);
        onBombasChange([...bombas.filter((b) => b.registro_id !== guardado.id), ...deLaFila]);
      }
      setAbierto(false);
      setPendiente(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el registro.");
    } finally {
      setGuardando(false);
    }
  }

  function confirmarPendiente() {
    if (!pendiente) return;
    const nuevos = { ...confirmados, [pendiente.tipo]: true };
    setConfirmados(nuevos);
    setPendiente(null);
    guardar(nuevos);
  }

  async function anular(id: string) {
    setError(null);
    setGuardando(true);
    try {
      await anularRegistro(supabase, id);
      onRegistrosChange(registros.map((r) => (r.id === id ? { ...r, anulado: true } : r)));
      setAnulandoId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo anular el registro.");
    } finally {
      setGuardando(false);
    }
  }

  const campos = CAMPOS_REGISTRO.filter((c) => !c.avanzado || monitoreoAvanzado);
  const recientes = ordenarPorHora(registros).reverse().slice(0, 12);

  return (
    <div>
      <ErrorVisible mensaje={error} />

      {!abierto && (
        <button className="btn btn-sm btn-accent" onClick={abrirNuevo}>
          + Nuevo registro
        </button>
      )}

      {abierto && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, marginBottom: 10 }}>
          <div className="field-row">
            <span className="field-label">{editId ? "Editar registro · hora" : "Hora del registro"}</span>
            <input type="datetime-local" className="mini-input" value={horaTexto} onChange={(e) => cambiarHora(e.target.value)} />
          </div>
          {existenteEnLaHora && (
            <div className="tiny" style={{ color: "var(--amber)", marginBottom: 6 }}>
              Ya hay un registro a las {hora(existenteEnLaHora.registrado_en)}: se completa ese mismo (los campos que dejes vacíos no se borran).
            </div>
          )}
          {campos.map((c) => (
            <div className="field-row" key={c.campo}>
              <span className="field-label">
                {c.campo === "diuresis_ml"
                  ? anterior
                    ? `Diuresis desde el registro anterior (${hora(anterior.registrado_en)})`
                    : "Diuresis de la última hora"
                  : c.etiqueta}
                {c.unidad ? ` (${c.unidad})` : ""}
              </span>
              <input
                className="mini-input"
                inputMode="decimal"
                style={{ width: 110 }}
                value={textos[c.campo] ?? ""}
                onChange={(e) => setTextos((t) => ({ ...t, [c.campo]: e.target.value }))}
              />
            </div>
          ))}
          <div className="section-label" style={{ marginTop: 8 }}>Bombas de esta hora (mL/h)</div>
          {existenteEnLaHora && !bombasTocadas && (
            <div className="tiny muted">Son las bombas ya cargadas en esa hora; si no las tocás, no se cambian.</div>
          )}
          <BombasDeLaHora
            form={bombasForm}
            onChange={(f) => {
              setBombasForm(f);
              setBombasTocadas(true);
            }}
            precarga={precarga}
            infusiones={infusiones}
            pesoKg={pesoKg}
            onGuardarPeso={onGuardarPeso}
          />
          <label className="check-row" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={disfuncion} onChange={(e) => setDisfuncion(e.target.checked)} /> Disfunción miocárdica
            (criterio clínico o ecocardiograma)
          </label>

          {pendiente && (
            <Confirmacion
              texto={pendiente.texto}
              textoSi="Sí, guardar"
              ocupado={guardando}
              onSi={confirmarPendiente}
              onNo={() => setPendiente(null)}
            />
          )}
          {!pendiente && (
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button className="btn btn-sm btn-accent" disabled={guardando} onClick={() => guardar()}>
                {guardando ? "Guardando…" : "Guardar registro"}
              </button>
              <button className="btn btn-sm" disabled={guardando} onClick={() => setAbierto(false)}>
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}

      {recientes.length === 0 && <div className="tiny muted">Sin registros todavía.</div>}
      {recientes.map((r) => (
        <div key={r.id}>
          <div className="field-row" style={{ opacity: r.anulado ? 0.5 : 1 }}>
            <span className="field-label" style={{ textDecoration: r.anulado ? "line-through" : undefined }}>
              {fechaHora(r.registrado_en)} · FC {num(r.fc, 0)} · PAM {num(r.pam, 0)} · Diuresis {num(r.diuresis_ml, 0)} mL
              {r.anulado ? " (anulado)" : ""}
            </span>
            {!r.anulado && (
              <span style={{ display: "flex", gap: 4 }}>
                <button className="btn btn-sm" onClick={() => abrirEdicion(r)}>
                  Editar
                </button>
                <button className="btn btn-sm" onClick={() => setAnulandoId(r.id)}>
                  Anular
                </button>
              </span>
            )}
          </div>
          {anulandoId === r.id && (
            <Confirmacion
              texto="¿Anular este registro? Va a quedar tachado y no cuenta en alarmas, score, tendencias ni balance. Si fue un error de carga, volvé a cargar el registro correcto."
              textoSi="Sí, anular"
              ocupado={guardando}
              onSi={() => anular(r.id)}
              onNo={() => setAnulandoId(null)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
