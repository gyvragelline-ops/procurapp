"use client";

import { createClient } from "@/lib/supabase/client";
import { METODOS_CERT_AUX, type CertAuxCampos } from "@/lib/procuracion/constants";

const supabase = createClient();

const ORDEN: Record<string, string> = { pendiente: "completo", completo: "no_corresponde", no_corresponde: "pendiente" };
const TEXTO: Record<string, string> = { pendiente: "Pendiente", completo: "Completo", no_corresponde: "No corresponde" };
const TONO: Record<string, string> = { pendiente: "chip-amber", completo: "chip-green", no_corresponde: "chip-gray" };

export default function CertAuxPanel({
  donanteId,
  campos,
  onChange,
}: {
  donanteId: string;
  campos: CertAuxCampos;
  onChange: (c: CertAuxCampos) => void;
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

  return (
    <>
      <div className="tiny" style={{ marginBottom: 4, textTransform: "uppercase", letterSpacing: ".5px" }}>
        Neurofisiológicos
      </div>
      {METODOS_CERT_AUX.filter((m) => m.grupo === "neurofisiologicos").map((m) => renderMetodo(m.key, m.label))}

      <div className="tiny" style={{ marginTop: 10, marginBottom: 4, textTransform: "uppercase", letterSpacing: ".5px" }}>
        Flujo
      </div>
      {METODOS_CERT_AUX.filter((m) => m.grupo === "flujo").map((m) => renderMetodo(m.key, m.label))}
    </>
  );
}
