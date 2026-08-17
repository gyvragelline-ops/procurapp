"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MeCampos } from "@/lib/procuracion/constants";

const supabase = createClient();

type HoraField = "hora_evaluacion_1" | "hora_evaluacion_2";

export default function MePanel({
  donanteId,
  campos,
  onChange,
}: {
  donanteId: string;
  campos: MeCampos;
  onChange: (c: MeCampos) => void;
}) {
  const [editingField, setEditingField] = useState<HoraField | null>(null);
  const [draft, setDraft] = useState("");
  const [savingTipo, setSavingTipo] = useState(false);

  async function saveCampo(campo_pdf: string, valor: string | null) {
    await supabase
      .from("planilla_valores")
      .upsert(
        { donante_id: donanteId, planilla_key: "neuro", campo_pdf, valor },
        { onConflict: "donante_id,planilla_key,campo_pdf" }
      );
  }

  async function setTipo(tipo: "neurologica" | "circulatoria") {
    setSavingTipo(true);
    await saveCampo("tipo_diagnostico", tipo);
    onChange({ ...campos, tipo_diagnostico: tipo });
    setSavingTipo(false);
  }

  function startEdit(field: HoraField) {
    setDraft(campos[field] ?? "");
    setEditingField(field);
  }

  async function saveHora(field: HoraField) {
    const valor = draft || null;
    setEditingField(null);
    await saveCampo(field, valor);
    onChange({ ...campos, [field]: valor });
  }

  function renderHoraRow(field: HoraField, label: string) {
    return (
      <div className="field-row" key={field}>
        <span className="field-label">{label}</span>
        {editingField === field ? (
          <input
            type="time"
            className="mini-input"
            style={{ width: 100 }}
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => saveHora(field)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveHora(field);
              if (e.key === "Escape") setEditingField(null);
            }}
          />
        ) : (
          <span className="field-value" style={{ cursor: "pointer" }} onClick={() => startEdit(field)}>
            {campos[field] ?? "Tocar para completar"}
          </span>
        )}
      </div>
    );
  }

  const esNeurologica = campos.tipo_diagnostico === "neurologica";
  const esCirculatoria = campos.tipo_diagnostico === "circulatoria";

  return (
    <>
      <div className="field-row">
        <span className="field-label">Tipo de diagnóstico</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            className={`btn btn-sm ${esNeurologica ? "btn-accent" : ""}`}
            disabled={savingTipo}
            onClick={() => setTipo("neurologica")}
          >
            Criterios neurológicos
          </button>
          <button
            className={`btn btn-sm ${esCirculatoria ? "btn-accent" : ""}`}
            disabled={savingTipo}
            onClick={() => setTipo("circulatoria")}
          >
            Criterios circulatorios
          </button>
        </div>
      </div>

      {esNeurologica && (
        <>
          {renderHoraRow("hora_evaluacion_1", "Hora 1ª evaluación")}
          {renderHoraRow("hora_evaluacion_2", "Hora 2ª evaluación")}
        </>
      )}
      {esCirculatoria && renderHoraRow("hora_evaluacion_1", "Hora de evaluación")}

      {!campos.tipo_diagnostico && (
        <div className="tiny" style={{ marginTop: 8 }}>
          Elegí el tipo de diagnóstico para cargar la hora de evaluación.
        </div>
      )}
    </>
  );
}
