"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { REFLEJOS_ME, type MeCampos } from "@/lib/procuracion/constants";

const supabase = createClient();

type TextField = "hora_evaluacion_1" | "hora_evaluacion_2" | "apneica1_pco2_inicial" | "apneica1_pco2_final" | "fc_inicial" | "fc_final";

export default function MePanel({
  donanteId,
  campos,
  onChange,
}: {
  donanteId: string;
  campos: MeCampos;
  onChange: (c: MeCampos) => void;
}) {
  const [editingField, setEditingField] = useState<TextField | null>(null);
  const [draft, setDraft] = useState("");
  const [savingTipo, setSavingTipo] = useState(false);
  const [savingBulk, setSavingBulk] = useState(false);
  const [reflejosOpen, setReflejosOpen] = useState(false);

  async function saveCampo(campo_pdf: string, valor: string | null) {
    await supabase
      .from("planilla_valores")
      .upsert(
        { donante_id: donanteId, planilla_key: "neuro", campo_pdf, valor },
        { onConflict: "donante_id,planilla_key,campo_pdf" }
      );
  }

  function startEdit(field: TextField) {
    setDraft(campos[field] ?? "");
    setEditingField(field);
  }

  async function saveField(field: TextField) {
    const valor = draft || null;
    setEditingField(null);
    await saveCampo(field, valor);
    onChange({ ...campos, [field]: valor });
  }

  function renderTimeRow(field: TextField, label: string) {
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
            onBlur={() => saveField(field)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveField(field);
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

  function renderNumRow(field: TextField, label: string, placeholder: string) {
    return (
      <div className="field-row" key={field}>
        <span className="field-label">{label}</span>
        {editingField === field ? (
          <input
            type="text"
            inputMode="numeric"
            className="mini-input"
            style={{ width: 90 }}
            value={draft}
            placeholder={placeholder}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => saveField(field)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveField(field);
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

  async function marcarTodosAusentes() {
    setSavingBulk(true);
    const rows = REFLEJOS_ME.map((r) => ({
      donante_id: donanteId,
      planilla_key: "neuro",
      campo_pdf: r.key,
      valor: "ausente",
    }));
    await supabase.from("planilla_valores").upsert(rows, { onConflict: "donante_id,planilla_key,campo_pdf" });
    const next = { ...campos };
    REFLEJOS_ME.forEach((r) => {
      next[r.key] = "ausente";
    });
    onChange(next);
    setSavingBulk(false);
  }

  async function toggleReflejo(key: string) {
    const nextVal = campos[key] === "ausente" ? "presente" : "ausente";
    await saveCampo(key, nextVal);
    onChange({ ...campos, [key]: nextVal });
  }

  async function setTipoTest(tipo: "apnea" | "atropina") {
    setSavingTipo(true);
    await saveCampo("tipo_test_confirmacion", tipo);
    onChange({ ...campos, tipo_test_confirmacion: tipo });
    setSavingTipo(false);
  }

  const reflejosDefinidos = REFLEJOS_ME.filter((r) => campos[r.key] === "ausente" || campos[r.key] === "presente").length;
  const esApnea = campos.tipo_test_confirmacion === "apnea";
  const esAtropina = campos.tipo_test_confirmacion === "atropina";

  return (
    <>
      {renderTimeRow("hora_evaluacion_1", "Hora 1ª evaluación")}
      {renderTimeRow("hora_evaluacion_2", "Hora 2ª evaluación")}

      <div
        className="check-row"
        style={{ cursor: "pointer" }}
        onClick={() => setReflejosOpen((v) => !v)}
      >
        <span>Reflejos troncoencefálicos {reflejosOpen ? "▾" : "▸"}</span>
        <span className={`chip ${reflejosDefinidos === 12 ? "chip-green" : "chip-gray"}`}>
          {reflejosDefinidos}/12
        </span>
      </div>

      {reflejosOpen && (
        <div style={{ marginTop: 6, marginBottom: 6 }}>
          <button className="btn btn-sm btn-accent" disabled={savingBulk} onClick={marcarTodosAusentes}>
            Marcar todos ausentes
          </button>
          <div style={{ marginTop: 8 }}>
            {REFLEJOS_ME.map((r) => {
              const v = campos[r.key];
              const tone = v === "ausente" ? "chip-green" : v === "presente" ? "chip-red" : "chip-gray";
              const texto = v === "ausente" ? "Ausente" : v === "presente" ? "Presente" : "Sin marcar";
              return (
                <div className="field-row" key={r.key}>
                  <span className="field-label">{r.label}</span>
                  <button className={`chip ${tone}`} style={{ border: "none", cursor: "pointer" }} onClick={() => toggleReflejo(r.key)}>
                    {texto}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border-soft)" }}>
        <div className="tiny" style={{ marginBottom: 8, textTransform: "uppercase", letterSpacing: ".5px" }}>
          Test de confirmación
        </div>
        <div className="btn-row" style={{ marginTop: 0 }}>
          <button className={`btn btn-sm ${esApnea ? "btn-accent" : ""}`} disabled={savingTipo} onClick={() => setTipoTest("apnea")}>
            Apnea
          </button>
          <button className={`btn btn-sm ${esAtropina ? "btn-accent" : ""}`} disabled={savingTipo} onClick={() => setTipoTest("atropina")}>
            Atropina
          </button>
        </div>

        {esApnea && (
          <>
            {renderNumRow("apneica1_pco2_inicial", "CO2 inicial", "mmHg")}
            {renderNumRow("apneica1_pco2_final", "CO2 final", "mmHg")}
          </>
        )}
        {esAtropina && (
          <>
            {renderNumRow("fc_inicial", "FC inicial", "lpm")}
            {renderNumRow("fc_final", "FC final", "lpm")}
          </>
        )}
        {!esApnea && !esAtropina && (
          <div className="tiny" style={{ marginTop: 6 }}>
            Elegí apnea o atropina para cargar los valores del test.
          </div>
        )}
      </div>
    </>
  );
}
