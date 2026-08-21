"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  cargarBibliotecaAbierta,
  cargarCamposOP2Detectados,
  guardarValorLaboratorio,
  type BibliotecaRow,
  type CampoOP2Detectado,
  type LabParamOP2,
} from "@/lib/procuracion/laboratorio";

const supabase = createClient();

const MAX_DIM = 1600;

function comprimirImagen(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("No se pudo procesar la imagen."));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      resolve({ base64: dataUrl.split(",")[1], mediaType: "image/jpeg" });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen."));
    };
    img.src = url;
  });
}

function fmtFecha(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function LabImagenesPanel({ donanteId }: { donanteId: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [camposOP2, setCamposOP2] = useState<CampoOP2Detectado[]>([]);
  const [biblioteca, setBiblioteca] = useState<BibliotecaRow[]>([]);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bloqueados, setBloqueados] = useState<LabParamOP2[]>([]);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [op2, bib] = await Promise.all([
        cargarCamposOP2Detectados(supabase, donanteId),
        cargarBibliotecaAbierta(supabase, donanteId),
      ]);
      if (!vivo) return;
      setCamposOP2(op2);
      setBiblioteca(bib);
      setCargado(true);
    })();
    return () => {
      vivo = false;
    };
  }, [donanteId]);

  async function handleFile(file: File) {
    setError(null);
    setBloqueados([]);
    setProcesando(true);
    try {
      const { base64, mediaType } = await comprimirImagen(file);

      const path = `${donanteId}/${Date.now()}.jpg`;
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const { error: uploadError } = await supabase.storage
        .from("laboratorio-fotos")
        .upload(path, bytes, { contentType: mediaType, upsert: true });
      let imagenUrl: string | null = null;
      if (!uploadError) {
        const { data: pub } = supabase.storage.from("laboratorio-fotos").getPublicUrl(path);
        imagenUrl = pub.publicUrl;
      }

      const res = await fetch("/api/extraer-laboratorio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo extraer la información de la foto.");
        return;
      }

      const items: { parametro: string; valor: string; unidad: string | null }[] = data.items ?? [];
      if (items.length === 0) {
        setError("No se pudo leer ningún dato en la foto. Probá con mejor luz o encuadre.");
        return;
      }

      const bloqueadosEnEsteLote: LabParamOP2[] = [];
      for (const item of items) {
        const resultado = await guardarValorLaboratorio(supabase, donanteId, item, imagenUrl);
        if (resultado.tipo === "bloqueado") bloqueadosEnEsteLote.push(resultado.parametroCanonico);
      }
      setBloqueados(bloqueadosEnEsteLote);

      const [op2, bib] = await Promise.all([
        cargarCamposOP2Detectados(supabase, donanteId),
        cargarBibliotecaAbierta(supabase, donanteId),
      ]);
      setCamposOP2(op2);
      setBiblioteca(bib);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado al procesar la foto.");
    } finally {
      setProcesando(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const camposPorParametro = camposOP2.reduce<Record<string, CampoOP2Detectado[]>>((acc, c) => {
    (acc[c.parametro] ??= []).push(c);
    return acc;
  }, {});

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <button
        className="btn btn-accent"
        style={{ width: "100%", marginBottom: 8 }}
        disabled={procesando}
        onClick={() => fileInputRef.current?.click()}
      >
        {procesando ? "Procesando foto…" : "Cargar foto de laboratorio o estudio"}
      </button>

      {error && (
        <div className="tiny" style={{ color: "var(--red)", marginBottom: 8 }}>
          {error}
        </div>
      )}

      {bloqueados.length > 0 && (
        <div className="tiny" style={{ color: "var(--amber, #b45309)", marginBottom: 8 }}>
          {bloqueados.map((p) => p.replace(/_/g, " ")).join(", ")}: ya tiene las 5 extracciones completas en el OP2.
          El valor nuevo no se guardó — hay que resolver manualmente dónde va.
        </div>
      )}

      <div className="section-label" style={{ marginTop: 4 }}>
        Campos OP2 detectados
      </div>
      {cargado && Object.keys(camposPorParametro).length === 0 && (
        <div className="tiny">Sin valores de laboratorio del OP2 cargados todavía.</div>
      )}
      {Object.entries(camposPorParametro).map(([parametro, filas]) => (
        <div className="field-row" key={parametro}>
          <span className="field-label">{parametro.replace(/_/g, " ")}</span>
          <span className="field-value">
            {filas.map((f) => f.valor).join(" · ")} ({filas.length}/5)
          </span>
        </div>
      ))}

      <div className="section-label" style={{ marginTop: 14 }}>
        Biblioteca abierta
      </div>
      {cargado && biblioteca.length === 0 && (
        <div className="tiny">Sin estudios ni parámetros fuera del OP2 cargados todavía.</div>
      )}
      {biblioteca.map((b) => (
        <div className="field-row" key={b.id}>
          <span className="field-label">{b.parametro}</span>
          <span className="field-value">
            {b.valor ?? "—"}
            {b.unidad ? ` ${b.unidad}` : ""} · {fmtFecha(b.created_at)}
          </span>
        </div>
      ))}
      {biblioteca.length > 0 && (
        <div className="tiny" style={{ marginTop: 8 }}>
          Historial de consulta — no alimenta ningún PDF por ahora.
        </div>
      )}
    </div>
  );
}
