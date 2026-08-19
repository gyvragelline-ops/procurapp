"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Donante } from "@/lib/procuracion/types";

const supabase = createClient();

type Campo = "servicio" | "pd_numero" | "fecha_ingreso" | "nombre_completo" | "edad" | "institucion" | "cama";

function fmtFecha(v: string | null) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function toDatetimeLocalValue(v: string | null) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PotencialPanel({
  donante,
  judicialAplica,
  onDonanteChange,
  onJudicialChange,
}: {
  donante: Donante;
  judicialAplica: boolean;
  onDonanteChange: (d: Donante) => void;
  onJudicialChange: (aplica: boolean) => void;
}) {
  const [editingField, setEditingField] = useState<Campo | null>(null);
  const [draft, setDraft] = useState("");
  const [savingJudicial, setSavingJudicial] = useState(false);

  function startEdit(field: Campo) {
    if (field === "fecha_ingreso") setDraft(toDatetimeLocalValue(donante.fecha_ingreso));
    else if (field === "edad") setDraft(donante.edad != null ? String(donante.edad) : "");
    else setDraft(donante[field] ?? "");
    setEditingField(field);
  }

  async function saveField(field: Campo) {
    let value: string | number | null;
    if (field === "fecha_ingreso") value = draft ? new Date(draft).toISOString() : null;
    else if (field === "edad") value = draft.trim() && !Number.isNaN(Number(draft.trim())) ? Number(draft.trim()) : null;
    else value = draft.trim() || null;
    setEditingField(null);
    const { data, error } = await supabase
      .from("donantes")
      .update({ [field]: value })
      .eq("id", donante.id)
      .select("*")
      .single();
    if (!error && data) {
      onDonanteChange(data as Donante);
    }
  }

  async function setJudicial(aplica: boolean) {
    setSavingJudicial(true);
    await supabase
      .from("documentacion_estado")
      .upsert(
        { donante_id: donante.id, categoria: "judicial", item_key: "aplica", estado: aplica ? "si" : "no" },
        { onConflict: "donante_id,categoria,item_key" }
      );
    onJudicialChange(aplica);
    setSavingJudicial(false);
  }

  const rows: { key: Campo; label: string; display: string | null }[] = [
    { key: "nombre_completo", label: "Potencial donante", display: donante.nombre_completo },
    { key: "pd_numero", label: "PD Nº", display: donante.pd_numero },
    { key: "edad", label: "Edad", display: donante.edad != null ? String(donante.edad) : null },
    { key: "institucion", label: "Establecimiento", display: donante.institucion },
    { key: "servicio", label: "Servicio", display: donante.servicio },
    { key: "cama", label: "Cama", display: donante.cama },
    { key: "fecha_ingreso", label: "Fecha de ingreso", display: fmtFecha(donante.fecha_ingreso) },
  ];

  return (
    <>
      {rows.map((r) => (
        <div className="field-row" key={r.key}>
          <span className="field-label">{r.label}</span>
          {editingField === r.key ? (
            <input
              type={r.key === "fecha_ingreso" ? "datetime-local" : "text"}
              inputMode={r.key === "edad" ? "numeric" : undefined}
              className="mini-input"
              style={{ width: r.key === "fecha_ingreso" ? 170 : 130, textAlign: "left" }}
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => saveField(r.key)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveField(r.key);
                if (e.key === "Escape") setEditingField(null);
              }}
            />
          ) : (
            <span className="field-value" style={{ cursor: "pointer" }} onClick={() => startEdit(r.key)}>
              {r.display ?? "Tocar para completar"}
            </span>
          )}
        </div>
      ))}
      <div className="field-row">
        <span className="field-label">Intervención judicial</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            className={`btn btn-sm ${judicialAplica ? "btn-accent" : ""}`}
            disabled={savingJudicial}
            onClick={() => setJudicial(true)}
          >
            Aplica
          </button>
          <button
            className={`btn btn-sm ${!judicialAplica ? "btn-accent" : ""}`}
            disabled={savingJudicial}
            onClick={() => setJudicial(false)}
          >
            No aplica
          </button>
        </div>
      </div>
    </>
  );
}
