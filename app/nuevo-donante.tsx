"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TipoProcuracion } from "@/lib/procuracion/constants";

const supabase = createClient();

export default function NuevoDonante({
  onCreated,
  onCancel,
}: {
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [dni, setDni] = useState("");
  const [tipo, setTipo] = useState<TipoProcuracion | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCrear() {
    if (!tipo) return;
    setSaving(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("donantes")
      .insert({
        nombre_completo: nombre.trim() || null,
        dni: dni.trim() || null,
        tipo_procuracion: tipo,
      })
      .select("id")
      .single();
    setSaving(false);
    if (err || !data) {
      setError(err?.message ?? "No se pudo crear el donante.");
      return;
    }
    onCreated(data.id);
  }

  return (
    <div className="card">
      <div className="card-title">Nuevo donante</div>

      <div className="field-row">
        <span className="field-label">Nombre completo</span>
        <input
          className="mini-input"
          style={{ width: 170, textAlign: "left" }}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Opcional"
        />
      </div>
      <div className="field-row">
        <span className="field-label">DNI</span>
        <input
          className="mini-input"
          style={{ width: 170, textAlign: "left" }}
          value={dni}
          onChange={(e) => setDni(e.target.value)}
          placeholder="Opcional"
        />
      </div>

      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border-soft)" }}>
        <div className="tiny" style={{ marginBottom: 8, textTransform: "uppercase", letterSpacing: ".5px" }}>
          Tipo de procuración
        </div>
        <div className="btn-row" style={{ marginTop: 0 }}>
          <button
            className={`btn btn-sm ${tipo === "multiorganico" ? "btn-accent" : ""}`}
            onClick={() => setTipo("multiorganico")}
          >
            Multiorgánico
          </button>
          <button className={`btn btn-sm ${tipo === "corneas" ? "btn-accent" : ""}`} onClick={() => setTipo("corneas")}>
            Solo córneas
          </button>
        </div>
        {!tipo && <div className="tiny" style={{ marginTop: 6 }}>Elegí un tipo para poder crear el donante.</div>}
      </div>

      {error && (
        <div className="tiny" style={{ color: "var(--red)", marginTop: 10 }}>
          {error}
        </div>
      )}

      <div className="btn-row">
        <button className="btn" onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
        <button className="btn btn-accent" style={{ flex: 1 }} onClick={handleCrear} disabled={!tipo || saving}>
          {saving ? "Creando…" : "Crear donante"}
        </button>
      </div>
    </div>
  );
}
