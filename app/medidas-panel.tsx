"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Donante } from "@/lib/procuracion/types";
import MedidasCompleto from "./medidas-completo";

const supabase = createClient();

const PLANILLA_KEY = "op2_p2";

// Mismos nombres de campo_pdf que campo_mapeo (planilla_key='op2_p2',
// sección Antropometría) -- por prolijidad, no porque se vaya a generar
// ningún PDF de OP2 con esto: es solo la base de datos, el flujo es
// 100% digital.
const CAMPOS_PLANILLA: { key: string; label: string; ayuda: string }[] = [
  { key: "l_esternal", label: "Línea esternal", ayuda: "Longitud del esternón, desde el manubrio hasta el apéndice xifoides" },
  { key: "p_axilar", label: "Perímetro axilar", ayuda: "Circunferencia torácica completa, cinta métrica a la altura de ambas axilas" },
  { key: "p_xif", label: "Perímetro xifoideo", ayuda: "Circunferencia completa a la altura del apéndice xifoides" },
  { key: "p_umbilic", label: "Perímetro umbilical", ayuda: "Circunferencia completa a la altura del ombligo" },
  { key: "biliaco", label: "Biilíaco", ayuda: "Distancia entre ambas crestas ilíacas (no circunferencia)" },
  { key: "xifopubiano", label: "Xifopubiano", ayuda: "Distancia entre el apéndice xifoides y la sínfisis del pubis" },
  {
    key: "d_ventral",
    label: "Dorso ventral",
    ayuda: "Diámetro anteroposterior del abdomen: paciente en decúbito supino, desde el plano de la camilla hasta el punto más prominente de la pared abdominal",
  },
  { key: "femur", label: "Fémur", ayuda: "Longitud del fémur" },
];

export default function MedidasPanel({
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
  const [campos, setCampos] = useState<Record<string, string | null>>({});
  const [cargado, setCargado] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

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
    await supabase
      .from("planilla_valores")
      .upsert({ donante_id: donante.id, planilla_key: PLANILLA_KEY, campo_pdf: key, valor }, { onConflict: "donante_id,planilla_key,campo_pdf" });
    setCampos((prev) => ({ ...prev, [key]: valor }));
  }

  // Peso/Talla van a donantes.peso/donantes.talla (no a planilla_valores)
  // -- el cálculo de gamma en Mantenimiento ya lee esas columnas en vivo.
  async function guardarDonante(campo: "peso" | "talla") {
    const texto = draft.trim().replace(",", ".");
    const num = texto ? Number(texto) : null;
    const value = num != null && !Number.isNaN(num) ? num : null;
    setEditingField(null);
    const { data, error } = await supabase.from("donantes").update({ [campo]: value }).eq("id", donante.id).select("*").single();
    if (!error && data) onDonanteChange(data as Donante);
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

      <MedidasCompleto donanteId={donante.id} completo={completo} onChange={onCompletoChange} />
    </div>
  );
}
