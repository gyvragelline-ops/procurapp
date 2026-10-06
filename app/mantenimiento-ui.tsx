"use client";

import { useState } from "react";
import type { Color } from "@/lib/procuracion/mantenimiento-calculos";

// Piezas chicas compartidas por los paneles de Mantenimiento.

export const COLOR_CSS: Record<Color, string> = {
  verde: "var(--green)",
  amarillo: "var(--amber)",
  rojo: "var(--red)",
  sin_dato: "var(--text-faint)",
};

export const CHIP_COLOR: Record<Color, string> = {
  verde: "chip-green",
  amarillo: "chip-amber",
  rojo: "chip-red",
  sin_dato: "chip-gray",
};

export function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

export function fechaHora(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })} ${hora(iso)}`;
}

// Reloj leído en el momento de una acción (guardar), fuera del render:
// las validaciones de hora futura usan esto, no Date.now() en el cuerpo
// del componente (regla de pureza de los hooks).
export function momentoActual(): number {
  return Date.now();
}

export function esFutura(iso: string): boolean {
  return new Date(iso).getTime() > momentoActual();
}

// Número con coma decimal, sin ceros de más.
export function num(n: number | null | undefined, decimales = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n.toFixed(decimales)).toLocaleString("es-AR", { maximumFractionDigits: decimales });
}

// "12,5" o "12.5" -> 12.5; vacío -> null; texto inválido -> NaN.
export function aNumero(texto: string): number | null {
  const t = texto.trim().replace(",", ".");
  if (t === "") return null;
  return Number(t);
}

// Valor para <input type="datetime-local"> en hora local.
export function aInputLocal(iso: string): string {
  const d = new Date(iso);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function ErrorVisible({ mensaje }: { mensaje: string | null }) {
  if (!mensaje) return null;
  return (
    <div
      className="tiny"
      role="alert"
      style={{ color: "var(--red)", marginBottom: 8, padding: "6px 8px", background: "rgba(220,38,38,0.08)", borderRadius: 6 }}
    >
      {mensaje}
    </div>
  );
}

// Confirmación en el lugar (sin window.confirm): pide un toque activo.
export function Confirmacion({
  texto,
  textoSi = "Sí, confirmar",
  onSi,
  onNo,
  ocupado = false,
}: {
  texto: React.ReactNode;
  textoSi?: string;
  onSi: () => void;
  onNo: () => void;
  ocupado?: boolean;
}) {
  return (
    <div style={{ margin: "8px 0", padding: "8px 10px", border: "1px solid var(--amber)", borderRadius: 8, background: "var(--amber-dim)" }}>
      <div className="tiny" style={{ color: "var(--text)", marginBottom: 6 }}>
        {texto}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn btn-sm btn-accent" disabled={ocupado} onClick={onSi}>
          {ocupado ? "Guardando…" : textoSi}
        </button>
        <button className="btn btn-sm" disabled={ocupado} onClick={onNo}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

// Peso faltante: se pide ahí mismo y se guarda en donantes.peso (el mismo
// que edita Medidas antropométricas -- un único peso por caso).
export function PedirPeso({ onGuardar }: { onGuardar: (pesoKg: number) => Promise<void> }) {
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  async function guardar() {
    const peso = aNumero(texto);
    if (peso === null || Number.isNaN(peso) || peso <= 0 || peso > 400) {
      setError("Peso inválido (kg).");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await onGuardar(peso);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el peso.");
    } finally {
      setGuardando(false);
    }
  }
  return (
    <div style={{ margin: "6px 0", padding: "8px 10px", border: "1px solid var(--amber)", borderRadius: 8 }}>
      <div className="tiny" style={{ marginBottom: 6 }}>
        Sin peso cargado no se calcula. Cargalo acá (se guarda en Medidas antropométricas):
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          className="mini-input"
          inputMode="decimal"
          placeholder="kg"
          style={{ width: 90 }}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <button className="btn btn-sm btn-accent" disabled={guardando} onClick={guardar}>
          {guardando ? "Guardando…" : "Guardar peso"}
        </button>
      </div>
      <ErrorVisible mensaje={error} />
    </div>
  );
}

// Mini tendencia (últimos N valores) en un SVG chico.
export function MiniTendencia({ valores, color }: { valores: number[]; color: string }) {
  if (valores.length < 2) return <span className="tiny muted">—</span>;
  const ancho = 64;
  const alto = 18;
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const rango = max - min || 1;
  const puntos = valores
    .map((v, i) => `${(i / (valores.length - 1)) * ancho},${alto - ((v - min) / rango) * (alto - 2) - 1}`)
    .join(" ");
  return (
    <svg width={ancho} height={alto} aria-label={`Tendencia: ${valores.map((v) => num(v)).join(", ")}`}>
      <polyline points={puntos} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}
