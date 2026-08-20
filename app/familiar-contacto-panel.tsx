"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Familiar } from "@/lib/procuracion/types";

const supabase = createClient();

type Campo = "nombre" | "dni" | "parentesco" | "direccion" | "telefono";

export default function FamiliarContactoPanel({
  donanteId,
  familiar,
  onChange,
}: {
  donanteId: string;
  familiar: Familiar | null;
  onChange: (f: Familiar) => void;
}) {
  const [editingField, setEditingField] = useState<Campo | null>(null);
  const [draft, setDraft] = useState("");

  function startEdit(field: Campo) {
    setDraft(familiar?.[field] ?? "");
    setEditingField(field);
  }

  async function saveField(field: Campo) {
    const value = draft.trim() || null;
    setEditingField(null);
    if (familiar) {
      const { data, error } = await supabase
        .from("familiares")
        .update({ [field]: value })
        .eq("id", familiar.id)
        .select("*")
        .single();
      if (!error && data) onChange(data as Familiar);
    } else {
      const { data, error } = await supabase
        .from("familiares")
        .insert({ donante_id: donanteId, [field]: value })
        .select("*")
        .single();
      if (!error && data) onChange(data as Familiar);
    }
  }

  const rows: { key: Campo; label: string }[] = [
    { key: "nombre", label: "Nombre y apellido" },
    { key: "dni", label: "DNI" },
    { key: "parentesco", label: "Parentesco" },
    { key: "direccion", label: "Dirección" },
    { key: "telefono", label: "Celular" },
  ];

  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border-soft)" }}>
      <div className="tiny" style={{ marginBottom: 8, textTransform: "uppercase", letterSpacing: ".5px" }}>
        Familiar de contacto
      </div>
      {rows.map((r) => (
        <div className="field-row" key={r.key}>
          <span className="field-label">{r.label}</span>
          {editingField === r.key ? (
            <input
              type="text"
              className="mini-input"
              style={{ width: 170, textAlign: "left" }}
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
              {familiar?.[r.key] ?? "Tocar para completar"}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
