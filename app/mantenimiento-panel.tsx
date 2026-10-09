"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Donante } from "@/lib/procuracion/types";
import {
  cargarMantenimiento,
  guardarConfig,
  guardarPesoDonante,
  marcarMantenimientoCompleto,
  type ConfigMantenimiento,
  type RegistroMantenimiento,
} from "@/lib/procuracion/mantenimiento";
import { cargarLaboratorioValores, type ValorLaboratorio } from "@/lib/procuracion/laboratorio-valores";
import {
  estadoBombas,
  type BombaHora,
  type EventoRespirador,
  type InfusionFila,
  type MedicionMedico,
} from "@/lib/procuracion/mantenimiento-calculos";
import MantenimientoMedico from "./mantenimiento-medico";
import MantenimientoEnfermeria from "./mantenimiento-enfermeria";
import { ErrorVisible, hora, num } from "./mantenimiento-ui";

const supabase = createClient();

// Panel de Mantenimiento (etapa 09): apoyo a la decisión para sostener
// perfusión y oxigenación, por reglas fijas (sin IA), como referencia
// general a verificar con protocolo. Números en mantenimiento-metas.ts.
// Dos vistas sobre los mismos datos: Médico (pantalla de análisis) y
// Enfermería (la única que carga signos, líquidos, egresos y bombas).
export default function MantenimientoPanel({
  donante,
  onDonanteChange,
  completo,
  onCompletoChange,
}: {
  donante: Donante;
  onDonanteChange: (d: Donante) => void;
  completo: boolean;
  onCompletoChange: (v: boolean) => void;
}) {
  const [registros, setRegistros] = useState<RegistroMantenimiento[]>([]);
  const [infusiones, setInfusiones] = useState<InfusionFila[]>([]);
  const [bombas, setBombas] = useState<BombaHora[]>([]);
  const [respirador, setRespirador] = useState<EventoRespirador[]>([]);
  const [mediciones, setMediciones] = useState<MedicionMedico[]>([]);
  const [config, setConfig] = useState<ConfigMantenimiento | null>(null);
  const [lab, setLab] = useState<ValorLaboratorio[]>([]);
  const [cargado, setCargado] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [vista, setVista] = useState<"medico" | "enfermeria">("medico");

  useEffect(() => {
    let vivo = true;
    Promise.all([cargarMantenimiento(supabase, donante.id), cargarLaboratorioValores(supabase, donante.id)])
      .then(([m, l]) => {
        if (!vivo) return;
        setRegistros(m.registros);
        setInfusiones(m.infusiones);
        setBombas(m.bombas);
        setRespirador(m.respirador);
        setMediciones(m.mediciones);
        setConfig(m.config);
        setLab(l);
        setErrorCarga(null);
        setCargado(true);
      })
      .catch((e) => {
        if (vivo) setErrorCarga(e instanceof Error ? e.message : "No se pudieron cargar los datos.");
      });
    return () => {
      vivo = false;
    };
  }, [donante.id]);

  // "Ahora" se refresca cada minuto: alarmas de registro viejo, hora
  // pendiente y datos desactualizados.
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  async function cambiarConfig(cambios: Partial<Omit<ConfigMantenimiento, "donante_id">>) {
    setError(null);
    try {
      setConfig(await guardarConfig(supabase, donante.id, cambios));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la configuración.");
    }
  }

  async function guardarPeso(pesoKg: number) {
    onDonanteChange(await guardarPesoDonante(supabase, donante.id, pesoKg));
  }

  async function marcarCompleto(v: boolean) {
    setError(null);
    try {
      await marcarMantenimientoCompleto(supabase, donante.id, v);
      onCompletoChange(v);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo marcar.");
    }
  }

  if (errorCarga) return <ErrorVisible mensaje={errorCarga} />;
  if (!cargado) return <div className="tiny muted">Cargando Mantenimiento…</div>;

  // Gammas en vivo: de la última fila horaria (o de un "cambié la
  // velocidad" posterior). Más de 70 min sin dato nuevo: desactualizado.
  const estado = estadoBombas({ registros, bombas, infusiones, pesoKg: donante.peso, ahora });

  return (
    <div>
      <ErrorVisible mensaje={error} />
      {/* Encabezado: "Mantenimiento", hora actual y peso; pestañas. */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Mantenimiento</div>
        <div className="tiny" style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
          {hora(new Date(ahora).toISOString())} · {donante.peso ? `${num(donante.peso, 1)} kg` : "sin peso"}
        </div>
      </div>
      <div className="btn-row" style={{ marginBottom: 12 }}>
        <button
          className={`btn ${vista === "medico" ? "btn-accent" : ""}`}
          style={{ minHeight: 44, flex: 1 }}
          aria-pressed={vista === "medico"}
          onClick={() => setVista("medico")}
        >
          Médico
        </button>
        <button
          className={`btn ${vista === "enfermeria" ? "btn-accent" : ""}`}
          style={{ minHeight: 44, flex: 1 }}
          aria-pressed={vista === "enfermeria"}
          onClick={() => setVista("enfermeria")}
        >
          Enfermería
        </button>
      </div>

      {vista === "enfermeria" ? (
        <MantenimientoEnfermeria
          donanteId={donante.id}
          pesoKg={donante.peso}
          registros={registros}
          infusiones={infusiones}
          bombas={bombas}
          lab={lab}
          estado={estado}
          ahora={ahora}
          onRegistrosChange={setRegistros}
          onInfusionesChange={setInfusiones}
          onBombasChange={setBombas}
          onLabChange={setLab}
          onGuardarPeso={guardarPeso}
        />
      ) : (
        <MantenimientoMedico
          donante={donante}
          registros={registros}
          infusiones={infusiones}
          bombas={bombas}
          lab={lab}
          respirador={respirador}
          mediciones={mediciones}
          config={config}
          estado={estado}
          ahora={ahora}
          completo={completo}
          onInfusionesChange={setInfusiones}
          onLabChange={setLab}
          onRespiradorChange={setRespirador}
          onMedicionesChange={setMediciones}
          onCambiarConfig={cambiarConfig}
          onMarcarCompleto={marcarCompleto}
          onGuardarPeso={guardarPeso}
        />
      )}
    </div>
  );
}
