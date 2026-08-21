"use client";

import { createClient } from "@/lib/supabase/client";
import { METODOS_CERT_AUX, type CertAuxCampos, type MeCampos } from "@/lib/procuracion/constants";
import HoraInput from "./hora-input";

const supabase = createClient();

const ORDEN: Record<string, string> = { pendiente: "completo", completo: "no_corresponde", no_corresponde: "pendiente" };
const TEXTO: Record<string, string> = { pendiente: "Pendiente", completo: "Completo", no_corresponde: "No corresponde" };
const TONO: Record<string, string> = { pendiente: "chip-amber", completo: "chip-green", no_corresponde: "chip-gray" };

type AngioMeta = { fecha?: string; hora?: string; informe?: string };

export default function CertAuxPanel({
  donanteId,
  campos,
  onChange,
  neuroDetalle,
  onNeuroDetalleChange,
  dopplerDetalle,
  onDopplerDetalleChange,
  angiografiaMeta,
  onAngiografiaMetaChange,
}: {
  donanteId: string;
  campos: CertAuxCampos;
  onChange: (c: CertAuxCampos) => void;
  neuroDetalle: MeCampos;
  onNeuroDetalleChange: (c: MeCampos) => void;
  dopplerDetalle: Record<string, string | null>;
  onDopplerDetalleChange: (c: Record<string, string | null>) => void;
  angiografiaMeta: AngioMeta;
  onAngiografiaMetaChange: (m: AngioMeta) => void;
}) {
  async function ciclar(key: string) {
    const actual = campos[key] ?? "pendiente";
    const siguiente = ORDEN[actual];
    await supabase
      .from("documentacion_estado")
      .upsert(
        { donante_id: donanteId, categoria: "certificacion", item_key: key, estado: siguiente },
        { onConflict: "donante_id,categoria,item_key" }
      );
    onChange({ ...campos, [key]: siguiente });
  }

  async function guardarNeuro(campo_pdf: string, valor: string | null) {
    await supabase
      .from("planilla_valores")
      .upsert(
        { donante_id: donanteId, planilla_key: "neuro", campo_pdf, valor },
        { onConflict: "donante_id,planilla_key,campo_pdf" }
      );
    onNeuroDetalleChange({ ...neuroDetalle, [campo_pdf]: valor });
  }

  async function guardarDoppler(campo_pdf: string, valor: string | null) {
    await supabase
      .from("planilla_valores")
      .upsert(
        { donante_id: donanteId, planilla_key: "doppler", campo_pdf, valor },
        { onConflict: "donante_id,planilla_key,campo_pdf" }
      );
    onDopplerDetalleChange({ ...dopplerDetalle, [campo_pdf]: valor });
  }

  async function guardarAngioMeta(campo: keyof AngioMeta, valor: string) {
    const nuevo = { ...angiografiaMeta, [campo]: valor };
    await supabase
      .from("documentacion_estado")
      .upsert(
        {
          donante_id: donanteId,
          categoria: "certificacion",
          item_key: "angiografia_cerebral",
          estado: campos.angiografia_cerebral ?? "pendiente",
          meta: nuevo,
        },
        { onConflict: "donante_id,categoria,item_key" }
      );
    onAngiografiaMetaChange(nuevo);
  }

  function renderMetodo(key: string, label: string) {
    const estado = campos[key] ?? "pendiente";
    return (
      <div className="field-row" key={key}>
        <span className="field-label" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span>{label}</span>
          {key === "doppler_transcraneano" && (
            <a href="/forms/documentos/doppler_transcraneano.pdf" target="_blank" rel="noopener" className="tiny" style={{ color: "var(--accent)" }}>
              Formulario en blanco
            </a>
          )}
        </span>
        <button className={`chip ${TONO[estado]}`} style={{ border: "none", cursor: "pointer" }} onClick={() => ciclar(key)}>
          {TEXTO[estado]}
        </button>
      </div>
    );
  }

  function TextoInline({ valor, onSave, placeholder }: { valor: string | null | undefined; onSave: (v: string) => void; placeholder?: string }) {
    return (
      <input
        type="text"
        className="mini-input"
        style={{ width: "100%" }}
        defaultValue={valor ?? ""}
        placeholder={placeholder}
        key={valor ?? ""}
        onBlur={(e) => {
          if (e.target.value !== (valor ?? "")) onSave(e.target.value || "");
        }}
      />
    );
  }

  function renderDetalleEEG() {
    return (
      <div style={{ marginTop: 4, marginBottom: 8, paddingLeft: 8, borderLeft: "2px solid var(--border-soft)" }}>
        <div className="field-row">
          <span className="field-label">Fecha</span>
          <TextoInline valor={neuroDetalle.eeg1_fecha} onSave={(v) => guardarNeuro("eeg1_fecha", v || null)} placeholder="dd/mm/aaaa" />
        </div>
        <div className="field-row">
          <span className="field-label">Hora</span>
          <HoraInput value={neuroDetalle.eeg1_hora ?? ""} onChangeValue={(v) => onNeuroDetalleChange({ ...neuroDetalle, eeg1_hora: v })} onBlur={() => guardarNeuro("eeg1_hora", neuroDetalle.eeg1_hora || null)} />
        </div>
        <div className="field-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
          <span className="field-label">Informe</span>
          <TextoInline valor={neuroDetalle.eeg1_informe} onSave={(v) => guardarNeuro("eeg1_informe", v || null)} placeholder="Resultado / interpretación" />
        </div>
      </div>
    );
  }

  function renderDetallePotenciales() {
    return (
      <div style={{ marginTop: 4, marginBottom: 8, paddingLeft: 8, borderLeft: "2px solid var(--border-soft)" }}>
        <div className="field-row">
          <span className="field-label">Fecha</span>
          <TextoInline valor={neuroDetalle.potenciales_fecha} onSave={(v) => guardarNeuro("potenciales_fecha", v || null)} placeholder="dd/mm/aaaa" />
        </div>
        <div className="field-row">
          <span className="field-label">Hora</span>
          <HoraInput value={neuroDetalle.potenciales_hora ?? ""} onChangeValue={(v) => onNeuroDetalleChange({ ...neuroDetalle, potenciales_hora: v })} onBlur={() => guardarNeuro("potenciales_hora", neuroDetalle.potenciales_hora || null)} />
        </div>
        <div className="tiny" style={{ marginTop: 4, marginBottom: 2 }}>
          Informe (el formulario pide cada modalidad por separado):
        </div>
        {(["peat", "pess", "pev"] as const).map((k) => (
          <div className="field-row" key={k}>
            <span className="field-label">{{ peat: "PEAT (auditivos)", pess: "PESS (somato-sensitivos)", pev: "PEV (visuales)" }[k]}</span>
            <TextoInline valor={neuroDetalle[k]} onSave={(v) => guardarNeuro(k, v || null)} />
          </div>
        ))}
      </div>
    );
  }

  function renderDetalleDoppler() {
    return (
      <div style={{ marginTop: 4, marginBottom: 8, paddingLeft: 8, borderLeft: "2px solid var(--border-soft)" }}>
        <div className="field-row">
          <span className="field-label">Fecha (día/mes/año)</span>
          <div style={{ display: "flex", gap: 4 }}>
            <TextoInline valor={dopplerDetalle.fecha_dia} onSave={(v) => guardarDoppler("fecha_dia", v || null)} placeholder="DD" />
            <TextoInline valor={dopplerDetalle.fecha_mes} onSave={(v) => guardarDoppler("fecha_mes", v || null)} placeholder="MM" />
            <TextoInline valor={dopplerDetalle.fecha_anio} onSave={(v) => guardarDoppler("fecha_anio", v || null)} placeholder="AAAA" />
          </div>
        </div>
        <div className="field-row">
          <span className="field-label">Hora</span>
          <HoraInput value={dopplerDetalle.fecha_hora_top ?? ""} onChangeValue={(v) => onDopplerDetalleChange({ ...dopplerDetalle, fecha_hora_top: v })} onBlur={() => guardarDoppler("fecha_hora_top", dopplerDetalle.fecha_hora_top || null)} />
        </div>
        <div className="field-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
          <span className="field-label">Informe (interpretación general — el detalle vascular por arteria lo completa el especialista en papel)</span>
          <textarea
            className="mini-input"
            style={{ width: "100%", minHeight: 50 }}
            defaultValue={dopplerDetalle.interpretacion_resto ?? ""}
            key={dopplerDetalle.interpretacion_resto ?? ""}
            onBlur={(e) => {
              if (e.target.value !== (dopplerDetalle.interpretacion_resto ?? "")) guardarDoppler("interpretacion_resto", e.target.value || null);
            }}
          />
        </div>
      </div>
    );
  }

  function renderDetalleAngiografia() {
    return (
      <div style={{ marginTop: 4, marginBottom: 8, paddingLeft: 8, borderLeft: "2px solid var(--border-soft)" }}>
        <div className="field-row">
          <span className="field-label">Fecha</span>
          <TextoInline valor={angiografiaMeta.fecha} onSave={(v) => guardarAngioMeta("fecha", v)} placeholder="dd/mm/aaaa" />
        </div>
        <div className="field-row">
          <span className="field-label">Hora</span>
          <HoraInput value={angiografiaMeta.hora ?? ""} onChangeValue={(v) => onAngiografiaMetaChange({ ...angiografiaMeta, hora: v })} onBlur={() => guardarAngioMeta("hora", angiografiaMeta.hora ?? "")} />
        </div>
        <div className="field-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
          <span className="field-label">Informe</span>
          <TextoInline valor={angiografiaMeta.informe} onSave={(v) => guardarAngioMeta("informe", v)} />
        </div>
        <div className="tiny" style={{ marginTop: 4 }}>
          Se guarda en la app -- todavía no hay plantilla de PDF para Angiografía cerebral.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="tiny" style={{ marginBottom: 4, textTransform: "uppercase", letterSpacing: ".5px" }}>
        Neurofisiológicos
      </div>
      {METODOS_CERT_AUX.filter((m) => m.grupo === "neurofisiologicos").map((m) => (
        <div key={m.key}>
          {renderMetodo(m.key, m.label)}
          {m.key === "eeg" && renderDetalleEEG()}
          {m.key === "potenciales_evocados" && renderDetallePotenciales()}
        </div>
      ))}

      <div className="tiny" style={{ marginTop: 10, marginBottom: 4, textTransform: "uppercase", letterSpacing: ".5px" }}>
        Flujo
      </div>
      {METODOS_CERT_AUX.filter((m) => m.grupo === "flujo").map((m) => (
        <div key={m.key}>
          {renderMetodo(m.key, m.label)}
          {m.key === "doppler_transcraneano" && renderDetalleDoppler()}
          {m.key === "angiografia_cerebral" && renderDetalleAngiografia()}
        </div>
      ))}
    </>
  );
}
