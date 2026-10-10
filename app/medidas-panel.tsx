"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { guardarConReintento } from "@/lib/procuracion/guardar";
import type { Donante } from "@/lib/procuracion/types";

const supabase = createClient();

import { CAMPOS_PLANILLA, PLANILLA_MEDIDAS } from "@/lib/procuracion/medidas-campos";

const PLANILLA_KEY = PLANILLA_MEDIDAS;

// Mismos nombres de campo_pdf que campo_mapeo (planilla_key='op2_p2',
// sección Antropometría) -- por prolijidad, no porque se vaya a generar
// ningún PDF de OP2 con esto: es solo la base de datos, el flujo es
// 100% digital.
// El número al frente de cada label es el mismo que la imagen de
// referencia de arriba -- Peso/Talla no llevan número, no están en el
// diagrama.

export default function MedidasPanel({
  donante,
  onDonanteChange,
}: {
  donante: Donante;
  onDonanteChange: (d: Donante) => void;
}) {
  const [campos, setCampos] = useState<Record<string, string | null>>({});
  const [cargado, setCargado] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data } = await supabase
        .from("planilla_valores")
        .select("campo_pdf, valor")
        .eq("donante_id", donante.id)
        .eq("planilla_key", PLANILLA_KEY)
        .in("campo_pdf", CAMPOS_PLANILLA.map((c) => c.key));
      if (!vivo) return;
      const map: Record<string, string | null> = {};
      ((data as { campo_pdf: string; valor: string | null }[]) ?? []).forEach((r) => {
        map[r.campo_pdf] = r.valor;
      });
      setCampos(map);
      setCargado(true);
    })();
    return () => {
      vivo = false;
    };
  }, [donante.id]);

  function startEdit(key: string, valorActual: string | null) {
    setDraft(valorActual ?? "");
    setEditingField(key);
  }

  async function guardarPlanilla(key: string) {
    const valor = draft.trim() || null;
    setEditingField(null);
    const r = await guardarConReintento(() =>
      supabase
        .from("planilla_valores")
        .upsert({ donante_id: donante.id, planilla_key: PLANILLA_KEY, campo_pdf: key, valor }, { onConflict: "donante_id,planilla_key,campo_pdf" })
    );
    if (!r.ok) return setErrorGuardado(r.mensaje);
    setErrorGuardado(null);
    setCampos((prev) => ({ ...prev, [key]: valor }));
  }

  // Peso/Talla van a donantes.peso/donantes.talla (no a planilla_valores)
  // -- el cálculo de gamma en Mantenimiento ya lee esas columnas en vivo.
  async function guardarDonante(campo: "peso" | "talla") {
    const texto = draft.trim().replace(",", ".");
    const num = texto ? Number(texto) : null;
    const value = num != null && !Number.isNaN(num) ? num : null;
    setEditingField(null);
    const r = await guardarConReintento(() =>
      supabase.from("donantes").update({ [campo]: value }).eq("id", donante.id).select("*").single()
    );
    if (!r.ok) return setErrorGuardado(r.mensaje);
    setErrorGuardado(null);
    if (r.resultado.data) onDonanteChange(r.resultado.data as Donante);
  }

  function renderCampoDonante(campo: "peso" | "talla", label: string, unidad: string) {
    const valorActual = donante[campo];
    return (
      <div className="field-row" key={campo}>
        <span className="field-label">
          {label} ({unidad})
        </span>
        {editingField === campo ? (
          <input
            type="text"
            inputMode="decimal"
            className="mini-input"
            style={{ width: 110 }}
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => guardarDonante(campo)}
            onKeyDown={(e) => {
              if (e.key === "Enter") guardarDonante(campo);
              if (e.key === "Escape") setEditingField(null);
            }}
          />
        ) : (
          <span
            className="field-value"
            style={{ cursor: "pointer" }}
            onClick={() => startEdit(campo, valorActual != null ? String(valorActual) : null)}
          >
            {valorActual ?? "Tocar para completar"}
          </span>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/medidas-antropometricas.png"
        alt="Referencia de puntos de medición antropométrica"
        style={{ width: "100%", borderRadius: 10, marginBottom: 14, display: "block" }}
      />

      {errorGuardado && (
        <div className="tiny" style={{ color: "var(--red)", marginBottom: 8, padding: "6px 8px", background: "rgba(220,38,38,0.08)", borderRadius: 6 }}>
          {errorGuardado}
        </div>
      )}
      {renderCampoDonante("peso", "Peso", "kg")}
      {renderCampoDonante("talla", "Talla", "cm")}

      {CAMPOS_PLANILLA.map((c) => (
        <div key={c.key} style={{ marginBottom: 10 }}>
          <div className="field-row">
            <span className="field-label">{c.label} (cm)</span>
            {editingField === c.key ? (
              <input
                type="text"
                inputMode="decimal"
                className="mini-input"
                style={{ width: 110 }}
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => guardarPlanilla(c.key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") guardarPlanilla(c.key);
                  if (e.key === "Escape") setEditingField(null);
                }}
              />
            ) : (
              <span
                className="field-value"
                style={{ cursor: "pointer" }}
                onClick={() => startEdit(c.key, cargado ? campos[c.key] ?? null : null)}
              >
                {cargado ? campos[c.key] ?? "Tocar para completar" : "Cargando…"}
              </span>
            )}
          </div>
          <div className="tiny" style={{ marginTop: -2, opacity: 0.7 }}>
            {c.ayuda}
          </div>
        </div>
      ))}

    </div>
  );
}
