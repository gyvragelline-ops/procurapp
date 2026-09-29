"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  borrarEstudioImagen,
  cargarEstudiosImagenes,
  guardarEstudioImagen,
  TIPOS_ESTUDIO_INFO,
  type EstudioImagenRow,
  type TipoEstudio,
} from "@/lib/procuracion/estudios-imagenes";
import { comprimirVideoSiHaceFalta } from "@/lib/procuracion/comprimir-video";

const supabase = createClient();

const MAX_DIM = 1600;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100MB

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

export default function ImagenesVideosPanel({ donanteId }: { donanteId: string }) {
  const camaraFotoInputRef = useRef<HTMLInputElement>(null);
  const camaraVideoInputRef = useRef<HTMLInputElement>(null);
  const galeriaInputRef = useRef<HTMLInputElement>(null);
  const [tipoEstudioSel, setTipoEstudioSel] = useState<TipoEstudio>(TIPOS_ESTUDIO_INFO[0].valor);
  const [estudios, setEstudios] = useState<EstudioImagenRow[]>([]);
  const [cargado, setCargado] = useState(false);
  const [procesandoEstudio, setProcesandoEstudio] = useState(false);
  const [errorEstudio, setErrorEstudio] = useState<string | null>(null);
  const [borrandoId, setBorrandoId] = useState<string | null>(null);
  const [confirmandoBorrarId, setConfirmandoBorrarId] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const est = await cargarEstudiosImagenes(supabase, donanteId);
      if (!vivo) return;
      setEstudios(est);
      setCargado(true);
    })();
    return () => {
      vivo = false;
    };
  }, [donanteId]);

  async function handleEstudioFile(file: File, esVideo: boolean, esDeCamara: boolean) {
    setErrorEstudio(null);
    // Obligatorio: sin tipo elegido, no se sube nada (el select siempre
    // arranca con un valor por defecto, pero esto lo blinda igual).
    if (!tipoEstudioSel) {
      setErrorEstudio("Elegí un tipo de estudio antes de cargar el archivo.");
      return;
    }
    setProcesandoEstudio(true);
    try {
      if (esVideo && file.size > MAX_VIDEO_BYTES) {
        setErrorEstudio("El video pesa más de 100MB — grabá un clip más corto.");
        return;
      }

      let uploadBody: Blob | Uint8Array = file;
      let contentType = file.type || (esVideo ? "video/mp4" : "image/jpeg");
      let ext = esVideo ? file.name.split(".").pop() || "mp4" : "jpg";

      if (esVideo) {
        const comprimido = await comprimirVideoSiHaceFalta(file, esDeCamara);
        uploadBody = comprimido.blob;
        if (comprimido.extension) {
          ext = comprimido.extension;
          contentType = ext === "mp4" ? "video/mp4" : "video/webm";
        }
      } else {
        const comprimida = await comprimirImagen(file);
        uploadBody = Uint8Array.from(atob(comprimida.base64), (c) => c.charCodeAt(0));
        contentType = comprimida.mediaType;
        ext = "jpg";
      }

      const path = `${donanteId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("estudios-imagenes")
        .upload(path, uploadBody, { contentType, upsert: true });
      if (uploadError) {
        setErrorEstudio(`No se pudo subir el archivo: ${uploadError.message}`);
        return;
      }
      const { data: pub } = supabase.storage.from("estudios-imagenes").getPublicUrl(path);

      await guardarEstudioImagen(supabase, donanteId, {
        tipoEstudio: tipoEstudioSel,
        archivoUrl: pub.publicUrl,
        archivoTipo: esVideo ? "video" : "image",
        mimeType: contentType,
      });

      setEstudios(await cargarEstudiosImagenes(supabase, donanteId));
    } catch (e) {
      setErrorEstudio(e instanceof Error ? e.message : "Error inesperado al procesar el archivo.");
    } finally {
      setProcesandoEstudio(false);
      if (camaraFotoInputRef.current) camaraFotoInputRef.current.value = "";
      if (camaraVideoInputRef.current) camaraVideoInputRef.current.value = "";
      if (galeriaInputRef.current) galeriaInputRef.current.value = "";
    }
  }

  async function handleBorrarEstudio(estudio: EstudioImagenRow) {
    setBorrandoId(estudio.id);
    const resultado = await borrarEstudioImagen(supabase, estudio);
    setBorrandoId(null);
    setConfirmandoBorrarId(null);
    if (!resultado.ok) {
      setErrorEstudio(`No se pudo borrar: ${resultado.error}`);
      return;
    }
    setEstudios((prev) => prev.filter((e) => e.id !== estudio.id));
  }

  return (
    <div>
      <input
        ref={camaraFotoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleEstudioFile(f, false, true);
        }}
      />
      <input
        ref={camaraVideoInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleEstudioFile(f, true, true);
        }}
      />
      {/* Galería: sin "capture" -- accept mixto solo es seguro acá
          (si se mezcla con capture, varios navegadores mobile ignoran
          la cámara y muestran el picker genérico de todos modos). */}
      <input
        ref={galeriaInputRef}
        type="file"
        accept="image/*,video/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleEstudioFile(f, f.type.startsWith("video/"), false);
        }}
      />

      <div className="field-row">
        <span className="field-label">Tipo de estudio</span>
        <select
          className="field-value"
          value={tipoEstudioSel}
          onChange={(e) => setTipoEstudioSel(e.target.value as TipoEstudio)}
          style={{ border: "1px solid var(--border-soft)", borderRadius: 6, padding: "2px 4px" }}
        >
          {TIPOS_ESTUDIO_INFO.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.etiqueta}
            </option>
          ))}
        </select>
      </div>
      {TIPOS_ESTUDIO_INFO.find((t) => t.valor === tipoEstudioSel)?.nota && (
        <div className="tiny" style={{ color: "var(--amber, #b45309)", marginTop: 2 }}>
          {TIPOS_ESTUDIO_INFO.find((t) => t.valor === tipoEstudioSel)?.nota}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 8, marginBottom: 8 }}>
        <button
          className="btn btn-accent"
          style={{ flex: 1 }}
          disabled={procesandoEstudio}
          onClick={() => camaraFotoInputRef.current?.click()}
        >
          {procesandoEstudio ? "Subiendo…" : "Cámara"}
        </button>
        <button
          className="btn btn-accent"
          style={{ flex: 1 }}
          disabled={procesandoEstudio}
          onClick={() => camaraVideoInputRef.current?.click()}
        >
          {procesandoEstudio ? "Subiendo…" : "Video"}
        </button>
        <button
          className="btn btn-accent"
          style={{ flex: 1 }}
          disabled={procesandoEstudio}
          onClick={() => galeriaInputRef.current?.click()}
        >
          {procesandoEstudio ? "Subiendo…" : "Galería"}
        </button>
      </div>

      {errorEstudio && (
        <div className="tiny" style={{ color: "var(--red)", marginBottom: 8 }}>
          {errorEstudio}
        </div>
      )}

      <div className="section-label" style={{ marginTop: 4 }}>
        Cargados
      </div>
      {cargado && estudios.length === 0 && <div className="tiny">Sin imágenes ni videos cargados todavía.</div>}
      {estudios.map((e) => (
        <div className="field-row" key={e.id} style={{ alignItems: "center" }}>
          <span className="field-label">{TIPOS_ESTUDIO_INFO.find((t) => t.valor === e.tipo_estudio)?.etiqueta ?? e.tipo_estudio}</span>
          <span className="field-value" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {e.archivo_tipo === "video" ? "Video" : "Imagen"} · {fmtFecha(e.created_at)}{" "}
            <a href={e.archivo_url} target="_blank" rel="noopener noreferrer">
              ver
            </a>
            <button
              type="button"
              onClick={() => setConfirmandoBorrarId(e.id)}
              disabled={borrandoId === e.id}
              style={{ background: "none", border: "none", color: "var(--red)", fontSize: 12, cursor: "pointer", padding: 0 }}
            >
              eliminar
            </button>
          </span>
        </div>
      ))}

      {confirmandoBorrarId && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.6)",
            padding: 24,
          }}
        >
          <div style={{ width: "100%", maxWidth: 320, borderRadius: 16, background: "var(--bg, #111)", border: "1px solid var(--border-soft)", padding: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 600 }}>¿Seguro que querés borrar este archivo?</p>
            <p className="tiny" style={{ marginTop: 4 }}>
              No se puede deshacer.
            </p>
            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => setConfirmandoBorrarId(null)}
                disabled={borrandoId !== null}
                className="chip chip-gray"
                style={{ flex: 1, border: "none", cursor: "pointer" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const est = estudios.find((e) => e.id === confirmandoBorrarId);
                  if (est) handleBorrarEstudio(est);
                }}
                disabled={borrandoId !== null}
                className="chip"
                style={{ flex: 1, border: "none", cursor: "pointer", background: "var(--red)", color: "#fff" }}
              >
                {borrandoId ? "Borrando…" : "Borrar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
