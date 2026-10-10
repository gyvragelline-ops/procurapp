"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { anularAntibiotico, cargarAntibioticos, crearAntibiotico } from "@/lib/procuracion/antibioticos";
import { MAX_ANTIBIOTICO, MAX_FOCO, antibioticosVigentes, validarAntibiotico, type Antibiotico } from "@/lib/procuracion/antibioticos-calculos";
import { Confirmacion, ErrorVisible, aInputLocal, fechaHora, momentoActual } from "./mantenimiento-ui";

const supabase = createClient();

// Sección "Antibióticos" de la etapa "Cultivos y antibióticos": qué
// antibiótico, desde cuándo y a qué foco. Nada se borra: se anula.
export default function AntibioticosPanel({
  donanteId,
  cargar = (id: string) => cargarAntibioticos(supabase, id),
}: {
  donanteId: string;
  cargar?: (donanteId: string) => Promise<Antibiotico[]>; // por defecto, la base (se reemplaza solo en pruebas)
}) {
  const [lista, setLista] = useState<Antibiotico[] | null>(null);
  const [alta, setAlta] = useState(false);
  const [antibiotico, setAntibiotico] = useState("");
  const [desdeTexto, setDesdeTexto] = useState("");
  const [foco, setFoco] = useState("");
  const [anulandoId, setAnulandoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    cargar(donanteId)
      .then((xs) => vivo && setLista(xs))
      .catch((e) => {
        if (!vivo) return;
        setLista([]);
        setError(e instanceof Error ? e.message : "No se pudieron cargar los antibióticos.");
      });
    return () => {
      vivo = false;
    };
    // `cargar` es fija en la app; recargar solo si cambia el donante.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [donanteId]);

  function abrirAlta() {
    setAntibiotico("");
    setFoco("");
    setDesdeTexto(aInputLocal(new Date(momentoActual()).toISOString()));
    setError(null);
    setAlta(true);
  }

  async function guardar() {
    setError(null);
    const v = validarAntibiotico({ antibiotico, desdeIso: desdeTexto ? new Date(desdeTexto).toISOString() : null, foco }, momentoActual());
    if (!v.ok) return setError(v.error);
    setGuardando(true);
    try {
      const nuevo = await crearAntibiotico(supabase, donanteId, v.datos);
      setLista((xs) => [nuevo, ...(xs ?? [])]);
      setAlta(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el antibiótico.");
    } finally {
      setGuardando(false);
    }
  }

  async function anular(id: string) {
    setError(null);
    setGuardando(true);
    try {
      await anularAntibiotico(supabase, id);
      setLista((xs) => (xs ?? []).map((x) => (x.id === id ? { ...x, anulado: true } : x)));
      setAnulandoId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo anular.");
    } finally {
      setGuardando(false);
    }
  }

  const vigentes = antibioticosVigentes(lista ?? []);

  return (
    <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--border-soft)" }}>
      <div className="section-label" style={{ marginTop: 0 }}>
        Antibióticos
      </div>
      {!alta && <ErrorVisible mensaje={error} />}

      {!alta ? (
        <button className="btn btn-accent" style={{ minHeight: 44 }} onClick={abrirAlta} disabled={lista === null}>
          Cargar antibiótico
        </button>
      ) : (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, marginBottom: 10 }}>
          <div className="field-row">
            <span className="field-label">Antibiótico</span>
            <input className="mini-input" maxLength={MAX_ANTIBIOTICO} style={{ width: 190, textAlign: "left" }} placeholder="Qué antibiótico" value={antibiotico} onChange={(e) => setAntibiotico(e.target.value)} />
          </div>
          <div className="field-row">
            <span className="field-label">Desde</span>
            <input type="datetime-local" className="mini-input" value={desdeTexto} onChange={(e) => setDesdeTexto(e.target.value)} />
          </div>
          <div className="field-row">
            <span className="field-label">Foco</span>
            <input className="mini-input" maxLength={MAX_FOCO} style={{ width: 190, textAlign: "left" }} placeholder="A qué foco" value={foco} onChange={(e) => setFoco(e.target.value)} />
          </div>
          <ErrorVisible mensaje={error} />
          <div className="btn-row">
            <button className="btn btn-sm btn-accent" style={{ minHeight: 44 }} disabled={guardando} onClick={guardar}>
              Guardar
            </button>
            <button className="btn btn-sm" style={{ minHeight: 44 }} onClick={() => setAlta(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {lista === null && <div className="tiny muted" style={{ marginTop: 8 }}>Cargando…</div>}
      {lista !== null && vigentes.length === 0 && !alta && (
        <div className="tiny muted" style={{ marginTop: 8 }}>
          Sin antibióticos cargados.
        </div>
      )}
      {vigentes.map((a) => (
        <div key={a.id} className="field-row" style={{ alignItems: "flex-start" }}>
          <span>
            <span style={{ fontWeight: 600 }}>{a.antibiotico}</span>
            <span className="tiny muted" style={{ display: "block" }}>
              desde {fechaHora(a.desde)}
              {a.foco ? ` · foco: ${a.foco}` : ""}
            </span>
          </span>
          {anulandoId === a.id ? (
            <Confirmacion texto="¿Anular este antibiótico?" textoSi="Sí, anular" ocupado={guardando} onSi={() => anular(a.id)} onNo={() => setAnulandoId(null)} />
          ) : (
            <button className="btn btn-sm" style={{ minHeight: 44 }} onClick={() => setAnulandoId(a.id)}>
              Anular
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
