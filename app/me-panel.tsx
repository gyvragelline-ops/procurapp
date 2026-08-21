"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { REFLEJOS_ME, reflejoKey, type MeCampos } from "@/lib/procuracion/constants";
import HoraInput, { parseHoraMinutos } from "./hora-input";
import FechaHoraInput from "./fecha-hora-input";

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
  const [savingBulk1a, setSavingBulk1a] = useState(false);
  const [savingBulk2a, setSavingBulk2a] = useState(false);
  const [eval1Open, setEval1Open] = useState(false);
  const [eval2Open, setEval2Open] = useState(false);

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

  // "ARM obligada desde" en el PDF real son 2 casilleros contiguos en la
  // misma línea (arm_obligada + arm_fecha_hs), pero para el procurador es
  // un solo dato: la fecha/hora desde que la ARM se volvió obligada. Un
  // único campo alcanza -- arm_obligada se completa solo con "Sí" en
  // cuanto hay fecha cargada, y se vacía si se borra.
  async function saveArmFechaHora() {
    const valor = draft || null;
    setEditingField(null);
    await saveCampo("arm_fecha_hs", valor);
    await saveCampo("arm_obligada", valor ? "Sí" : null);
    onChange({ ...campos, arm_fecha_hs: valor, arm_obligada: valor ? "Sí" : null });
  }

  function renderArmFechaHoraRow() {
    const field = "arm_fecha_hs";
    return (
      <div className="field-row" key={field}>
        <span className="field-label">ARM obligada desde</span>
        {editingField === field ? (
          <FechaHoraInput
            value={draft}
            onChangeValue={setDraft}
            autoFocus
            onBlur={saveArmFechaHora}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveArmFechaHora();
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

  async function marcarTodosAusentes(momento: "1a" | "2a") {
    const setSaving = momento === "1a" ? setSavingBulk1a : setSavingBulk2a;
    setSaving(true);
    const rows = REFLEJOS_ME.map((r) => ({
      donante_id: donanteId,
      planilla_key: "neuro",
      campo_pdf: reflejoKey(r.key, momento),
      valor: "ausente",
    }));
    await supabase.from("planilla_valores").upsert(rows, { onConflict: "donante_id,planilla_key,campo_pdf" });
    const next = { ...campos };
    REFLEJOS_ME.forEach((r) => {
      next[reflejoKey(r.key, momento)] = "ausente";
    });
    onChange(next);
    setSaving(false);
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

  const esApnea = campos.tipo_test_confirmacion === "apnea";
  const esAtropina = campos.tipo_test_confirmacion === "atropina";

  const min1 = parseHoraMinutos(campos.hora_1a);
  const min2 = parseHoraMinutos(campos.hora_2a);
  const horasMuyCercanas = min1 != null && min2 != null && min2 - min1 < 60;

  const cumpleMe = campos.cumple_me_si === "si" ? "si" : campos.cumple_me_no === "si" ? "no" : null;

  function renderReflejosBlock(momento: "1a" | "2a") {
    const savingBulk = momento === "1a" ? savingBulk1a : savingBulk2a;
    const definidos = REFLEJOS_ME.filter((r) => {
      const v = campos[reflejoKey(r.key, momento)];
      return v === "ausente" || v === "presente";
    }).length;
    return (
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border-soft)" }}>
        <div className="check-row" style={{ borderBottom: "none", padding: "0 0 8px" }}>
          <span>Reflejos</span>
          <span className={`chip ${definidos === 12 ? "chip-green" : "chip-gray"}`}>{definidos}/12</span>
        </div>
        <button className="btn btn-sm btn-accent" disabled={savingBulk} onClick={() => marcarTodosAusentes(momento)}>
          Marcar todos ausentes
        </button>

        {REFLEJOS_ME.map((r) => {
          const key = reflejoKey(r.key, momento);
          return (
            <div className="field-row" key={key}>
              <span className="field-label">{r.label}</span>
              <button
                className={`chip ${campos[key] === "ausente" ? "chip-green" : campos[key] === "presente" ? "chip-red" : "chip-gray"}`}
                style={{ border: "none", cursor: "pointer" }}
                onClick={() => toggleReflejo(key)}
              >
                {campos[key] === "ausente" ? "Ausente" : campos[key] === "presente" ? "Presente" : "Sin marcar"}
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  function renderEvalFields(momento: "1a" | "2a") {
    return (
      <>
        {renderHoraRow(`hora_${momento}`, "Hora")}
        {momento === "2a" && horasMuyCercanas && (
          <div className="tiny" style={{ color: "var(--amber)", marginTop: -2, marginBottom: 6 }}>
            Recordá que debe ser mayor a 1 hora
          </div>
        )}
        {renderTextRow(`ta_tam_${momento}`, "TAM")}
        {renderTextRow(`t_central_${momento}`, "Temperatura central")}
        {renderSiNoPar(`diabetes_insipida_${momento}`, "Diabetes insípida")}
        {renderTextRow(`pupilas_${momento}`, "Pupilas")}
        {renderReflejosBlock(momento)}
      </>
    );
  }

  return (
    <>
      {renderTextRow("fecha_examen", "Fecha del examen")}
      <div className="tiny" style={{ marginTop: -6, marginBottom: 6 }}>
        Única para las 2 evaluaciones -- ocurren el mismo día.
      </div>

      <button
        type="button"
        className="check-row"
        style={{ cursor: "pointer", width: "100%", textAlign: "left", background: "none" }}
        onClick={() => setEval1Open((v) => !v)}
      >
        <span>1ª Evaluación {eval1Open ? "▾" : "▸"}</span>
      </button>
      {eval1Open && <div style={{ marginTop: 6, marginBottom: 6 }}>{renderEvalFields("1a")}</div>}

      <button
        type="button"
        className="check-row"
        style={{ cursor: "pointer", width: "100%", textAlign: "left", background: "none", marginTop: 10 }}
        onClick={() => setEval2Open((v) => !v)}
      >
        <span>
          2ª Evaluación <span style={{ fontWeight: 400 }}>(se copia de la 1ª, editable)</span> {eval2Open ? "▾" : "▸"}
        </span>
      </button>
      {eval2Open && <div style={{ marginTop: 6, marginBottom: 6 }}>{renderEvalFields("2a")}</div>}

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

      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border-soft)" }}>
        {renderTextRow("causa_coma", "Causa del coma")}
      </div>

      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border-soft)" }}>
        {renderArmFechaHoraRow()}
      </div>

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
        {renderTextRow("medico2_nombre", "Médico 2 (nombre)", { planillaKey: "certificado" })}
        <div className="tiny" style={{ marginTop: -6, marginBottom: 6 }}>
          (neurólogo) -- se agrega automáticamente en el PDF
        </div>
        {renderTextRow("archivo_lugar", "Lugar donde se archiva la documentación", { planillaKey: "certificado" })}
      </div>
    </>
  );
}
