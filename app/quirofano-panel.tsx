"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  anularEquipo,
  anularHoraQuirofano,
  anularMensaje,
  cargarEquiposYMensajes,
  crearEquipo,
  editarEquipo,
  enviarMensaje,
  guardarHoraQuirofano,
} from "@/lib/procuracion/quirofano";
import {
  ANESTESISTA,
  MAX_MENSAJE,
  MEDIOS_AVISO,
  ORGANOS_EQUIPO,
  ROLES_CHAT,
  equiposVigentes,
  historialHora,
  horaVigente,
  mensajesOrdenados,
  textoOrganos,
  validarEquipo,
  validarHora,
  validarMensaje,
  type Anestesista,
  type EquipoQuirofano,
  type HorarioQuirofano,
  type MedioAviso,
  type MensajeCaso,
  type OrganoEquipo,
  type RolChat,
} from "@/lib/procuracion/quirofano-calculos";
import { Confirmacion, ErrorVisible, aInputLocal, fechaHora, hora, momentoActual } from "./mantenimiento-ui";

const supabase = createClient();
const ETIQ_ANEST: Record<Anestesista, string> = { si: "Sí", no: "No", sin_confirmar: "Sin confirmar" };
const ETIQ_MEDIO = Object.fromEntries(MEDIOS_AVISO.map((m) => [m.valor, m.etiqueta])) as Record<MedioAviso, string>;
const ETIQ_ROL = Object.fromEntries(ROLES_CHAT.map((r) => [r.valor, r.etiqueta])) as Record<RolChat, string>;

// Etapa "Hora de quirófano": SOLO la hora (la carga la Base; cada cambio
// queda en el historial), el aviso de los equipos (bidireccional, cargado
// por la Base en nombre del equipo) y, al pie, el chat del caso. Nada de
// esto genera avisos fuera de la etapa.
export default function QuirofanoPanel({
  donanteId,
  horarios,
  onHorariosChange,
}: {
  donanteId: string;
  horarios: HorarioQuirofano[];
  onHorariosChange: (h: HorarioQuirofano[]) => void;
}) {
  const [equipos, setEquipos] = useState<EquipoQuirofano[]>([]);
  const [mensajes, setMensajes] = useState<MensajeCaso[]>([]);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    cargarEquiposYMensajes(supabase, donanteId)
      .then((r) => {
        if (!vivo) return;
        setEquipos(r.equipos);
        setMensajes(r.mensajes);
      })
      .catch((e) => vivo && setErrorCarga(e instanceof Error ? e.message : "No se pudieron cargar los equipos y el chat."));
    return () => {
      vivo = false;
    };
  }, [donanteId]);

  return (
    <div>
      <ErrorVisible mensaje={errorCarga} />
      <HoraQuirofano donanteId={donanteId} horarios={horarios} onChange={onHorariosChange} />
      <div className="section-label" style={{ marginTop: 14 }}>Aviso de los equipos</div>
      <AvisoEquipos donanteId={donanteId} equipos={equipos} onChange={setEquipos} />
      <div className="section-label" style={{ marginTop: 14 }}>Comunicación</div>
      <ChatCaso donanteId={donanteId} mensajes={mensajes} onChange={setMensajes} />
    </div>
  );
}

// ---------------------------------------------------------------------
// Hora de quirófano
// ---------------------------------------------------------------------
function HoraQuirofano({ donanteId, horarios, onChange }: { donanteId: string; horarios: HorarioQuirofano[]; onChange: (h: HorarioQuirofano[]) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [anulandoId, setAnulandoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vigente = horaVigente(horarios);
  const historial = historialHora(horarios);

  async function guardar() {
    setError(null);
    const v = validarHora(texto ? new Date(texto).toISOString() : null);
    if (!v.ok) return setError(v.error);
    setGuardando(true);
    try {
      const nueva = await guardarHoraQuirofano(supabase, donanteId, v.hora);
      onChange([...horarios, nueva]);
      setAbierto(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la hora.");
    } finally {
      setGuardando(false);
    }
  }

  async function anular(id: string) {
    setError(null);
    setGuardando(true);
    try {
      await anularHoraQuirofano(supabase, id);
      onChange(horarios.map((h) => (h.id === id ? { ...h, anulado: true } : h)));
      setAnulandoId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo anular.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <div className="field-row">
        <span className="field-label">
          Hora de quirófano <span className="tiny muted">(la carga la Base)</span>
        </span>
        <span className="field-value" style={{ fontSize: 18, fontWeight: 700 }}>
          {vigente ? fechaHora(vigente.hora) : "Sin hora"}
        </span>
      </div>
      {!abierto ? (
        <button
          className="btn btn-sm btn-accent"
          style={{ minHeight: 44 }}
          onClick={() => {
            setTexto(aInputLocal(vigente?.hora ?? new Date(momentoActual()).toISOString()));
            setError(null);
            setAbierto(true);
          }}
        >
          {vigente ? "Cambiar hora" : "Cargar hora"}
        </button>
      ) : (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, marginTop: 6 }}>
          <div className="field-row">
            <span className="field-label">Fecha y hora</span>
            <input type="datetime-local" className="mini-input" value={texto} onChange={(e) => setTexto(e.target.value)} />
          </div>
          <ErrorVisible mensaje={error} />
          <div className="btn-row" style={{ marginTop: 6 }}>
            <button className="btn btn-sm btn-accent" disabled={guardando} onClick={guardar}>
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            <button className="btn btn-sm" disabled={guardando} onClick={() => setAbierto(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {!abierto && <ErrorVisible mensaje={error} />}
      {historial.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary className="tiny">Cambios de hora ({historial.length})</summary>
          {historial.map((h) => (
            <div key={h.id}>
              <div className="field-row">
                <span className="field-label tiny">{h.texto}</span>
                <button className="btn btn-sm" onClick={() => setAnulandoId(h.id)}>
                  Anular
                </button>
              </div>
              {anulandoId === h.id && (
                <Confirmacion texto="¿Anular esta hora? Queda la anterior como vigente." textoSi="Sí, anular" ocupado={guardando} onSi={() => anular(h.id)} onNo={() => setAnulandoId(null)} />
              )}
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Aviso de los equipos (lo carga la Base en nombre del equipo)
// ---------------------------------------------------------------------
type FormEquipo = { equipo: string; organos: OrganoEquipo[]; organoOtro: string; anestesista: Anestesista | null; informadoPor: string; medio: MedioAviso | null };
const FORM_VACIO: FormEquipo = { equipo: "", organos: [], organoOtro: "", anestesista: null, informadoPor: "", medio: null };

function AvisoEquipos({ donanteId, equipos, onChange }: { donanteId: string; equipos: EquipoQuirofano[]; onChange: (e: EquipoQuirofano[]) => void }) {
  const [editando, setEditando] = useState<string | "nuevo" | null>(null);
  const [form, setForm] = useState<FormEquipo>(FORM_VACIO);
  const [anulandoId, setAnulandoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vigentes = equiposVigentes(equipos);

  function abrir(e: EquipoQuirofano | null) {
    setForm(
      e
        ? { equipo: e.equipo, organos: e.organos, organoOtro: e.organo_otro ?? "", anestesista: e.anestesista, informadoPor: e.informado_por ?? "", medio: e.medio }
        : FORM_VACIO
    );
    setError(null);
    setEditando(e ? e.id : "nuevo");
  }

  async function guardar() {
    setError(null);
    const v = validarEquipo(form);
    if (!v.ok) return setError(v.error);
    setGuardando(true);
    try {
      if (editando === "nuevo") {
        const nuevo = await crearEquipo(supabase, donanteId, v.datos);
        onChange([...equipos, nuevo]);
      } else if (editando) {
        const act = await editarEquipo(supabase, editando, v.datos, new Date(momentoActual()).toISOString());
        onChange(equipos.map((e) => (e.id === editando ? act : e)));
      }
      setEditando(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el equipo.");
    } finally {
      setGuardando(false);
    }
  }

  async function anular(id: string) {
    setError(null);
    setGuardando(true);
    try {
      await anularEquipo(supabase, id);
      onChange(equipos.map((e) => (e.id === id ? { ...e, anulado: true } : e)));
      setAnulandoId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo anular.");
    } finally {
      setGuardando(false);
    }
  }

  const alternarOrgano = (o: OrganoEquipo) =>
    setForm((f) => ({ ...f, organos: f.organos.includes(o) ? f.organos.filter((x) => x !== o) : [...f.organos, o] }));

  const formulario = (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, margin: "6px 0" }}>
      <div className="field-row">
        <span className="field-label">Equipo</span>
        <input className="mini-input" maxLength={80} style={{ width: 180 }} value={form.equipo} onChange={(e) => setForm({ ...form, equipo: e.target.value })} />
      </div>
      <div className="tiny" style={{ margin: "6px 0 4px" }}>Órganos que va a procurar</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {ORGANOS_EQUIPO.map((o) => (
          <button key={o.valor} className={`btn btn-sm ${form.organos.includes(o.valor) ? "btn-accent" : ""}`} style={{ minHeight: 44 }} onClick={() => alternarOrgano(o.valor)}>
            {o.etiqueta}
          </button>
        ))}
      </div>
      {form.organos.includes("otro") && (
        <div className="field-row">
          <span className="field-label">¿Cuál?</span>
          <input className="mini-input" maxLength={60} style={{ width: 160 }} value={form.organoOtro} onChange={(e) => setForm({ ...form, organoOtro: e.target.value })} />
        </div>
      )}
      <div className="tiny" style={{ margin: "8px 0 4px" }}>¿Lleva anestesista?</div>
      <div style={{ display: "flex", gap: 6 }}>
        {ANESTESISTA.map((a) => (
          <button
            key={a.valor}
            className={`btn btn-sm ${(form.anestesista ?? "sin_confirmar") === a.valor ? "btn-accent" : ""}`}
            style={{ minHeight: 44 }}
            onClick={() => setForm({ ...form, anestesista: a.valor })}
          >
            {a.etiqueta}
          </button>
        ))}
      </div>
      <div className="field-row" style={{ marginTop: 8 }}>
        <span className="field-label">Informado por</span>
        <input className="mini-input" maxLength={80} style={{ width: 180 }} placeholder="Quién del equipo" value={form.informadoPor} onChange={(e) => setForm({ ...form, informadoPor: e.target.value })} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {MEDIOS_AVISO.map((m) => (
          <button
            key={m.valor}
            className={`btn btn-sm ${form.medio === m.valor ? "btn-accent" : ""}`}
            style={{ minHeight: 44 }}
            onClick={() => setForm({ ...form, medio: form.medio === m.valor ? null : m.valor })}
          >
            {m.etiqueta}
          </button>
        ))}
      </div>
      <ErrorVisible mensaje={error} />
      <div className="btn-row" style={{ marginTop: 8 }}>
        <button className="btn btn-sm btn-accent" disabled={guardando} onClick={guardar}>
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        <button className="btn btn-sm" disabled={guardando} onClick={() => setEditando(null)}>
          Cancelar
        </button>
      </div>
    </div>
  );

  return (
    <div>
      {editando === null && <ErrorVisible mensaje={error} />}
      {vigentes.length === 0 && editando !== "nuevo" && <div className="tiny muted">Sin equipos avisados.</div>}
      {vigentes.map((e) =>
        editando === e.id ? (
          <div key={e.id}>{formulario}</div>
        ) : (
          <div key={e.id} style={{ borderBottom: "1px solid var(--border-soft)", padding: "8px 0" }}>
            <div style={{ fontWeight: 600 }}>{e.equipo}</div>
            <div className="tiny">{textoOrganos(e)}</div>
            <div className="tiny">Anestesista: {ETIQ_ANEST[e.anestesista]}</div>
            {(e.informado_por || e.medio) && (
              <div className="tiny muted">
                Informado por {e.informado_por ?? "—"}
                {e.medio ? ` · ${ETIQ_MEDIO[e.medio]}` : ""} · {hora(e.creado_en)}
                {e.modificado_en ? ` · corregido ${hora(e.modificado_en)}` : ""}
              </div>
            )}
            {anulandoId === e.id ? (
              <Confirmacion texto="¿Anular este equipo? Va a quedar tachado y no cuenta." textoSi="Sí, anular" ocupado={guardando} onSi={() => anular(e.id)} onNo={() => setAnulandoId(null)} />
            ) : (
              <div className="btn-row" style={{ marginTop: 6 }}>
                <button className="btn btn-sm" style={{ minHeight: 44 }} onClick={() => abrir(e)}>
                  Editar
                </button>
                <button className="btn btn-sm" style={{ minHeight: 44 }} onClick={() => setAnulandoId(e.id)}>
                  Anular
                </button>
              </div>
            )}
          </div>
        )
      )}
      {editando === "nuevo" ? (
        formulario
      ) : (
        <button className="btn btn-sm btn-accent" style={{ minHeight: 44, marginTop: 6 }} onClick={() => abrir(null)}>
          + Agregar equipo
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Chat del caso (rol elegido a mano; sin avisos fuera de la etapa)
// ---------------------------------------------------------------------
function ChatCaso({ donanteId, mensajes, onChange }: { donanteId: string; mensajes: MensajeCaso[]; onChange: (m: MensajeCaso[]) => void }) {
  const [rol, setRol] = useState<RolChat | null>(null);
  const [autor, setAutor] = useState("");
  const [texto, setTexto] = useState("");
  const [anulandoId, setAnulandoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    setError(null);
    const v = validarMensaje({ rol, autor, texto });
    if (!v.ok) return setError(v.error);
    setGuardando(true);
    try {
      const nuevo = await enviarMensaje(supabase, donanteId, v.datos);
      onChange([...mensajes, nuevo]);
      setTexto("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar el mensaje.");
    } finally {
      setGuardando(false);
    }
  }

  async function anular(id: string) {
    setError(null);
    setGuardando(true);
    try {
      await anularMensaje(supabase, id);
      onChange(mensajes.map((m) => (m.id === id ? { ...m, anulado: true } : m)));
      setAnulandoId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo anular.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      {mensajes.length === 0 && <div className="tiny muted">Sin mensajes.</div>}
      {mensajesOrdenados(mensajes).map((m) => (
        <div key={m.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--border-soft)", opacity: m.anulado ? 0.5 : 1 }}>
          <div className="tiny muted">
            <strong>{ETIQ_ROL[m.rol]}</strong>
            {m.autor ? ` · ${m.autor}` : ""} · {fechaHora(m.creado_en)}
            {m.anulado ? " · anulado" : ""}
          </div>
          <div style={{ whiteSpace: "pre-wrap", textDecoration: m.anulado ? "line-through" : undefined }}>{m.texto}</div>
          {!m.anulado &&
            (anulandoId === m.id ? (
              <Confirmacion texto="¿Anular este mensaje? Queda tachado." textoSi="Sí, anular" ocupado={guardando} onSi={() => anular(m.id)} onNo={() => setAnulandoId(null)} />
            ) : (
              <button className="btn btn-sm" style={{ fontSize: 11 }} onClick={() => setAnulandoId(m.id)}>
                Anular
              </button>
            ))}
        </div>
      ))}
      <div style={{ marginTop: 8 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {ROLES_CHAT.map((r) => (
            <button key={r.valor} className={`btn btn-sm ${rol === r.valor ? "btn-accent" : ""}`} style={{ minHeight: 44 }} onClick={() => setRol(r.valor)}>
              {r.etiqueta}
            </button>
          ))}
          <input className="mini-input" maxLength={80} style={{ width: 140 }} placeholder="Nombre (opcional)" value={autor} onChange={(e) => setAutor(e.target.value)} />
        </div>
        <textarea
          className="mini-input"
          rows={2}
          maxLength={MAX_MENSAJE}
          style={{ width: "100%", marginTop: 6 }}
          placeholder="Mensaje"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <ErrorVisible mensaje={error} />
        <button className="btn btn-sm btn-accent" style={{ minHeight: 44, marginTop: 4 }} disabled={guardando} onClick={enviar}>
          {guardando ? "Enviando…" : "Enviar"}
        </button>
      </div>
    </div>
  );
}
