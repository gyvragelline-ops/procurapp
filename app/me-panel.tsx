"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { REFLEJOS_ME, type MeCampos } from "@/lib/procuracion/constants";
import HoraInput, { parseHoraMinutos } from "./hora-input";

const supabase = createClient();

// Campos de la 1ª evaluación que se copian a la 2ª automáticamente si la
// 2ª todavía está vacía -- el procurador puede editarla después si en la
// práctica fue distinta.
const COPIA_1A_A_2A: Record<string, string> = {
  ta_tam_1a: "ta_tam_2a",
  t_central_1a: "t_central_2a",
  pupilas_1a: "pupilas_2a",
};

function sumarUnaHora(hora: string): string | null {
  const m = hora.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  let h = Number(m[1]) + 1;
  if (h > 23) h -= 24;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

export default function MePanel({
  donanteId,
  campos,
  onChange,
}: {
  donanteId: string;
  campos: MeCampos;
  onChange: (c: MeCampos) => void;
}) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [savingTipo, setSavingTipo] = useState(false);
  const [savingBulk, setSavingBulk] = useState(false);
  const [reflejosOpen, setReflejosOpen] = useState(false);
  const [evalOpen, setEvalOpen] = useState(false);

  async function saveCampo(campo_pdf: string, valor: string | null, planillaKey: string = "neuro") {
    await supabase
      .from("planilla_valores")
      .upsert(
        { donante_id: donanteId, planilla_key: planillaKey, campo_pdf, valor },
        { onConflict: "donante_id,planilla_key,campo_pdf" }
      );
  }

  function startEdit(field: string) {
    setDraft(campos[field] ?? "");
    setEditingField(field);
  }

  async function saveField(field: string, planillaKey: string = "neuro") {
    const valor = draft || null;
    setEditingField(null);
    await saveCampo(field, valor, planillaKey);
    const actualizados: MeCampos = { ...campos, [field]: valor };

    const campo2a = COPIA_1A_A_2A[field];
    if (campo2a && valor && !campos[campo2a]) {
      await saveCampo(campo2a, valor);
      actualizados[campo2a] = valor;
    }
    if (field === "hora_1a" && valor && !campos.hora_2a) {
      const auto = sumarUnaHora(valor);
      if (auto) {
        await saveCampo("hora_2a", auto);
        actualizados.hora_2a = auto;
      }
    }
    onChange(actualizados);
  }

  function renderHoraRow(field: string, label: string) {
    return (
      <div className="field-row" key={field}>
        <span className="field-label">{label}</span>
        {editingField === field ? (
          <HoraInput
            value={draft}
            onChangeValue={setDraft}
            autoFocus
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

  function renderNumRow(field: string, label: string, placeholder: string) {
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

  function renderTextRow(field: string, label: string, opts?: { multiline?: boolean; planillaKey?: string }) {
    const planillaKey = opts?.planillaKey ?? "neuro";
    return (
      <div className="field-row" key={field} style={opts?.multiline ? { flexDirection: "column", alignItems: "stretch", gap: 4 } : undefined}>
        <span className="field-label">{label}</span>
        {editingField === field ? (
          opts?.multiline ? (
            <textarea
              className="mini-input"
              style={{ width: "100%", minHeight: 60 }}
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => saveField(field, planillaKey)}
            />
          ) : (
            <input
              type="text"
              className="mini-input"
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => saveField(field, planillaKey)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveField(field, planillaKey);
                if (e.key === "Escape") setEditingField(null);
              }}
            />
          )
        ) : (
          <span className="field-value" style={{ cursor: "pointer" }} onClick={() => startEdit(field)}>
            {campos[field] ?? "Tocar para completar"}
          </span>
        )}
      </div>
    );
  }

  async function setSiNoPar(base: string, valor: "si" | "no") {
    const campoElegido = `${base}_${valor}`;
    const campoOpuesto = `${base}_${valor === "si" ? "no" : "si"}`;
    await saveCampo(campoElegido, "si");
    await saveCampo(campoOpuesto, null);
    const actualizados: MeCampos = { ...campos, [campoElegido]: "si", [campoOpuesto]: null };

    if (base === "diabetes_insipida_1a" && campos["diabetes_insipida_2a_si"] !== "si" && campos["diabetes_insipida_2a_no"] !== "si") {
      const elegido2a = `diabetes_insipida_2a_${valor}`;
      const opuesto2a = `diabetes_insipida_2a_${valor === "si" ? "no" : "si"}`;
      await saveCampo(elegido2a, "si");
      await saveCampo(opuesto2a, null);
      actualizados[elegido2a] = "si";
      actualizados[opuesto2a] = null;
    }

    onChange(actualizados);
  }

  function renderSiNoPar(base: string, label: string) {
    const esSi = campos[`${base}_si`] === "si";
    const esNo = campos[`${base}_no`] === "si";
    return (
      <div className="field-row" key={base}>
        <span className="field-label">{label}</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button className={`btn btn-sm ${esSi ? "btn-accent" : ""}`} onClick={() => setSiNoPar(base, "si")}>
            Sí
          </button>
          <button className={`btn btn-sm ${esNo ? "btn-accent" : ""}`} onClick={() => setSiNoPar(base, "no")}>
            No
          </button>
        </div>
      </div>
    );
  }

  async function setResultadoApnea(valor: "positiva" | "negativa" | "indeterminada") {
    await saveCampo("apneica1_resultado", valor);
    onChange({ ...campos, apneica1_resultado: valor });
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

  const min1 = parseHoraMinutos(campos.hora_1a);
  const min2 = parseHoraMinutos(campos.hora_2a);
  const horasMuyCercanas = min1 != null && min2 != null && min2 - min1 < 60;

  const cumpleMe = campos.cumple_me_si === "si" ? "si" : campos.cumple_me_no === "si" ? "no" : null;

  return (
    <>
      {renderHoraRow("hora_1a", "Hora 1ª evaluación")}
      {renderHoraRow("hora_2a", "Hora 2ª evaluación")}
      {horasMuyCercanas && (
        <div className="tiny" style={{ color: "var(--amber)", marginTop: -2, marginBottom: 6 }}>
          Debe haber al menos 1 hora de diferencia entre evaluaciones
        </div>
      )}

      <div className="check-row" style={{ cursor: "pointer" }} onClick={() => setReflejosOpen((v) => !v)}>
        <span>Reflejos {reflejosOpen ? "▾" : "▸"}</span>
        <span className={`chip ${reflejosDefinidos === 12 ? "chip-green" : "chip-gray"}`}>{reflejosDefinidos}/12</span>
      </div>

      {reflejosOpen && (
        <div style={{ marginTop: 6, marginBottom: 6 }}>
          <button className="btn btn-sm btn-accent" disabled={savingBulk} onClick={marcarTodosAusentes}>
            Marcar todos ausentes
          </button>

          {REFLEJOS_ME.map((r) => (
            <div className="field-row" key={r.key}>
              <span className="field-label">{r.label}</span>
              <button
                className={`chip ${campos[r.key] === "ausente" ? "chip-green" : campos[r.key] === "presente" ? "chip-red" : "chip-gray"}`}
                style={{ border: "none", cursor: "pointer" }}
                onClick={() => toggleReflejo(r.key)}
              >
                {campos[r.key] === "ausente" ? "Ausente" : campos[r.key] === "presente" ? "Presente" : "Sin marcar"}
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border-soft)" }}>
        {renderTextRow("causa_coma", "Causa del coma")}
      </div>

      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border-soft)" }}>
        {renderTextRow("arm_obligada", "ARM obligada desde")}
        {renderTextRow("arm_fecha_hs", "Fecha y hora")}
      </div>

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
            {renderTextRow("apneica1_duracion", "Duración")}
            <div className="field-row">
              <span className="field-label">Resultado</span>
              <div style={{ display: "flex", gap: 4 }}>
                {(["positiva", "negativa", "indeterminada"] as const).map((r) => (
                  <button
                    key={r}
                    className={`btn btn-sm ${(campos.apneica1_resultado ?? "positiva") === r ? "btn-accent" : ""}`}
                    onClick={() => setResultadoApnea(r)}
                  >
                    {r === "positiva" ? "Positiva" : r === "negativa" ? "Negativa" : "Indeterminada"}
                  </button>
                ))}
              </div>
            </div>
            <div className="tiny">Por defecto se marca "Positiva" en el documento -- cambiala solo si corresponde.</div>
          </>
        )}
        {esAtropina && (
          <>
            {renderNumRow("fc_inicial", "FC inicial", "lpm")}
            {renderNumRow("fc_final", "FC final", "lpm")}
            {renderTextRow("atropina_fecha", "Fecha")}
            {renderHoraRow("atropina_hora", "Hora")}
            {renderTextRow("atropina_duracion", "Duración")}
            <div className="tiny">El formulario no tiene casillero propio para atropina -- se vuelca en "Otros exámenes".</div>
          </>
        )}
        {!esApnea && !esAtropina && (
          <div className="tiny" style={{ marginTop: 6 }}>
            Elegí apnea o atropina para cargar los valores del test.
          </div>
        )}
      </div>

      <div className="check-row" style={{ cursor: "pointer", marginTop: 10 }} onClick={() => setEvalOpen((v) => !v)}>
        <span>Datos por evaluación (1ª / 2ª) {evalOpen ? "▾" : "▸"}</span>
      </div>
      {evalOpen && (
        <div style={{ marginTop: 6 }}>
          <div className="tiny" style={{ marginBottom: 4, textTransform: "uppercase", letterSpacing: ".5px" }}>
            1ª evaluación
          </div>
          {renderTextRow("ta_tam_1a", "TAM")}
          {renderTextRow("t_central_1a", "Temperatura central")}
          {renderSiNoPar("diabetes_insipida_1a", "Diabetes insípida")}
          {renderTextRow("pupilas_1a", "Pupilas")}

          <div className="tiny" style={{ marginTop: 10, marginBottom: 4, textTransform: "uppercase", letterSpacing: ".5px" }}>
            2ª evaluación <span style={{ textTransform: "none", fontWeight: 400 }}>(se copia de la 1ª, editable)</span>
          </div>
          {renderTextRow("ta_tam_2a", "TAM")}
          {renderTextRow("t_central_2a", "Temperatura central")}
          {renderSiNoPar("diabetes_insipida_2a", "Diabetes insípida")}
          {renderTextRow("pupilas_2a", "Pupilas")}
        </div>
      )}

      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border-soft)" }}>
        {renderTextRow("estudios_complementarios", "Estudios complementarios (TAC u otro método de imagen)", { multiline: true })}
      </div>

      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border-soft)" }}>
        <div className="tiny" style={{ marginBottom: 8, textTransform: "uppercase", letterSpacing: ".5px" }}>
          ¿Cumple criterios de muerte encefálica?
        </div>
        <div className="btn-row" style={{ marginTop: 0 }}>
          <button className={`btn btn-sm ${cumpleMe === "si" ? "btn-accent" : ""}`} onClick={() => setSiNoPar("cumple_me", "si")}>
            Sí
          </button>
          <button className={`btn btn-sm ${cumpleMe === "no" ? "btn-accent" : ""}`} onClick={() => setSiNoPar("cumple_me", "no")}>
            No
          </button>
        </div>
        {cumpleMe === "no" && renderTextRow("no_cumple_motivo", "Motivo y conducta sugerida", { multiline: true })}
      </div>

      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border-soft)" }}>
        <div className="tiny" style={{ marginBottom: 8, textTransform: "uppercase", letterSpacing: ".5px" }}>
          Cierre del certificado de fallecimiento
        </div>
        {renderTextRow("medico1_nombre", "Médico 1 (nombre)", { planillaKey: "certificado" })}
        {renderTextRow("medico2_nombre", "Médico 2 (nombre) -- se etiqueta como Neurólogo/Neurocirujano en el PDF", { planillaKey: "certificado" })}
        {renderTextRow("archivo_lugar", "Lugar donde se archiva la documentación", { planillaKey: "certificado" })}
      </div>
    </>
  );
}
