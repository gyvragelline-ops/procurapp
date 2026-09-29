"use client";

// Panel "Laboratorio e imágenes" -- reescrito desde cero, versión
// mínima. SIN IA: es solo carga y almacenamiento de archivos, para las
// 5 categorías fijas. Nada de esto llama a ningún endpoint de IA --
// confirmado con grep, ver commit.

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  borrarEstudioImagen,
  cargarEstudiosImagenes,
  guardarEstudioImagen,
  rutaMiniaturaVideo,
  TIPOS_ESTUDIO_INFO,
  type EstudioImagenRow,
  type Modo,
  type TipoEstudio,
} from "@/lib/procuracion/estudios-imagenes";
import { useSubidasVideo } from "./subidas-video-context";

const supabase = createClient();

const MAX_DIM = 1600;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100MB

function comprimirImagen(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      // try/catch a propósito: esto corre en un callback del navegador,
      // no en el executor del Promise -- si algo tira sin este
      // try/catch la promesa queda colgada para siempre.
      try {
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
      } catch (e) {
        reject(e instanceof Error ? e : new Error("No se pudo procesar la imagen."));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen."));
    };
    img.src = url;
  });
}

const TIMEOUT_MS = 45000;

function conTimeout<T>(promesa: Promise<T>, mensaje: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(mensaje)), TIMEOUT_MS);
    promesa.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function fmtFecha(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const ETIQUETA_MODO: Record<Modo, string> = { foto: "Cámara", video: "Video", galeria: "Galería" };

export default function ImagenesVideosPanel({ donanteId }: { donanteId: string }) {
  const camaraFotoInputRef = useRef<HTMLInputElement>(null);
  const camaraVideoInputRef = useRef<HTMLInputElement>(null);
  const galeriaInputRef = useRef<HTMLInputElement>(null);
  const { subidas, iniciarSubidaVideo, descartar: descartarSubidaVideo } = useSubidasVideo();

  const [estudios, setEstudios] = useState<EstudioImagenRow[]>([]);
  const [cargado, setCargado] = useState(false);
  const [categoriaActiva, setCategoriaActiva] = useState<TipoEstudio | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visorAbierto, setVisorAbierto] = useState<EstudioImagenRow | null>(null);

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

  // Las subidas de video corren en SubidasVideoProvider (layout.tsx),
  // fuera de este panel -- acá solo se escucha cuándo una de ESTE
  // donante terminó, para refrescar la lista y sacarla del indicador
  // global.
  useEffect(() => {
    const listas = Object.values(subidas).filter((s) => s.donanteId === donanteId && s.etapa === "listo");
    if (listas.length === 0) return;
    (async () => {
      setEstudios(await cargarEstudiosImagenes(supabase, donanteId));
      for (const s of listas) descartarSubidaVideo(s.id);
    })();
  }, [subidas, donanteId, descartarSubidaVideo]);

  function iniciarCarga(tipo: TipoEstudio, modo: Modo) {
    setCategoriaActiva(tipo);
    if (modo === "foto") camaraFotoInputRef.current?.click();
    else if (modo === "video") camaraVideoInputRef.current?.click();
    else galeriaInputRef.current?.click();
  }

  // Solo fotos -- el video se dispara y se suelta en SubidasVideoProvider
  // (ver handleEstudioFile). Tira si algo falla; separado para poder
  // envolverlo en conTimeout() sin mezclar con el manejo de estado.
  async function subirFoto(file: File, tipoEstudio: TipoEstudio): Promise<void> {
    const comprimida = await comprimirImagen(file);
    const uploadBody = Uint8Array.from(atob(comprimida.base64), (c) => c.charCodeAt(0));
    const contentType = comprimida.mediaType;

    const stamp = Date.now();
    const path = `${donanteId}/${stamp}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from("estudios-imagenes")
      .upload(path, uploadBody, { contentType, upsert: true });
    if (uploadError) {
      throw new Error(`No se pudo subir el archivo: ${uploadError.message}`);
    }
    const { data: pub } = supabase.storage.from("estudios-imagenes").getPublicUrl(path);

    await guardarEstudioImagen(supabase, donanteId, {
      tipoEstudio,
      archivoUrl: pub.publicUrl,
      archivoTipo: "image",
      mimeType: contentType,
    });
  }

  async function handleEstudioFile(file: File, esVideo: boolean, esDeCamara: boolean) {
    const tipoEstudio = categoriaActiva;
    setError(null);
    if (!tipoEstudio) return;

    if (esVideo) {
      if (file.size > MAX_VIDEO_BYTES) {
        setError("El video pesa más de 100MB — grabá un clip más corto.");
      } else {
        iniciarSubidaVideo({
          donanteId,
          tipoEstudio,
          archivo: file,
          extensionOriginal: file.name.split(".").pop() || "mp4",
          esDeCamara,
        });
      }
      setCategoriaActiva(null);
      if (camaraFotoInputRef.current) camaraFotoInputRef.current.value = "";
      if (camaraVideoInputRef.current) camaraVideoInputRef.current.value = "";
      if (galeriaInputRef.current) galeriaInputRef.current.value = "";
      return;
    }

    setProcesando(true);
    try {
      await conTimeout(
        subirFoto(file, tipoEstudio),
        "La carga está tardando demasiado -- puede haberse cortado la conexión. Probá de nuevo."
      );
      setEstudios(await cargarEstudiosImagenes(supabase, donanteId));
    } catch (e) {
      console.error("[ImagenesVideosPanel] Error al cargar estudio:", e);
      setError(e instanceof Error ? e.message : "Error inesperado al procesar el archivo.");
    } finally {
      setProcesando(false);
      setCategoriaActiva(null);
      if (camaraFotoInputRef.current) camaraFotoInputRef.current.value = "";
      if (camaraVideoInputRef.current) camaraVideoInputRef.current.value = "";
      if (galeriaInputRef.current) galeriaInputRef.current.value = "";
    }
  }

  async function handleBorrar(estudio: EstudioImagenRow): Promise<boolean> {
    const resultado = await borrarEstudioImagen(supabase, estudio);
    if (!resultado.ok) {
      setError(`No se pudo borrar: ${resultado.error}`);
      return false;
    }
    setEstudios((prev) => prev.filter((e) => e.id !== estudio.id));
    return true;
  }

  const porTipo = new Map<TipoEstudio, EstudioImagenRow[]>();
  for (const info of TIPOS_ESTUDIO_INFO) porTipo.set(info.valor, []);
  for (const e of estudios) porTipo.get(e.tipo_estudio)?.push(e);
  for (const lista of porTipo.values()) lista.sort((a, b) => a.created_at.localeCompare(b.created_at));

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
      {/* Galería: sin "capture" -- accept mixto solo es seguro acá (si
          se mezcla con capture, varios navegadores móviles ignoran la
          cámara y muestran el picker genérico de todos modos). */}
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

      {error && (
        <div className="tiny" style={{ color: "var(--red)", marginBottom: 8 }}>
          {error}
        </div>
      )}
      {procesando && (
        <div className="tiny" style={{ marginBottom: 8 }}>
          Subiendo…
        </div>
      )}

      {TIPOS_ESTUDIO_INFO.map((info) => (
        <FilaCategoria
          key={info.valor}
          info={info}
          estudios={porTipo.get(info.valor) ?? []}
          bloqueado={procesando}
          onElegirModo={(modo) => iniciarCarga(info.valor, modo)}
          onAbrir={setVisorAbierto}
          onBorrar={handleBorrar}
        />
      ))}

      {cargado && estudios.length === 0 && (
        <div className="tiny" style={{ marginTop: 4 }}>
          Sin imágenes ni videos cargados todavía.
        </div>
      )}

      {visorAbierto && (
        <Visor estudio={visorAbierto} onCerrar={() => setVisorAbierto(null)} onBorrar={handleBorrar} />
      )}
    </div>
  );
}

function FilaCategoria({
  info,
  estudios,
  bloqueado,
  onElegirModo,
  onAbrir,
  onBorrar,
}: {
  info: { valor: TipoEstudio; etiqueta: string; nota?: string; modos: Modo[] };
  estudios: EstudioImagenRow[];
  bloqueado: boolean;
  onElegirModo: (modo: Modo) => void;
  onAbrir: (estudio: EstudioImagenRow) => void;
  onBorrar: (estudio: EstudioImagenRow) => Promise<boolean>;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div style={{ paddingBottom: 10, marginBottom: 10, borderBottom: "1px solid var(--border-soft)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{info.etiqueta}</span>
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          disabled={bloqueado}
          className="chip chip-gray"
          style={{ border: "none", cursor: "pointer", flexShrink: 0 }}
        >
          Subir
        </button>
      </div>

      {info.nota && (
        <div className="tiny" style={{ color: "var(--amber, #b45309)", marginTop: 2 }}>
          {info.nota}
        </div>
      )}

      {abierto && (
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          {info.modos.map((modo) => (
            <button
              key={modo}
              type="button"
              onClick={() => {
                setAbierto(false);
                onElegirModo(modo);
              }}
              className="tiny"
              style={{ background: "none", border: "1px solid var(--border-soft)", borderRadius: 6, cursor: "pointer", padding: "4px 8px" }}
            >
              {ETIQUETA_MODO[modo]}
            </button>
          ))}
        </div>
      )}

      {estudios.length === 0 ? (
        <p className="tiny" style={{ marginTop: 6 }}>
          Sin cargas.
        </p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
          {estudios.map((e) => (
            <Miniatura key={e.id} estudio={e} onAbrir={() => onAbrir(e)} onBorrar={() => onBorrar(e)} />
          ))}
        </div>
      )}
    </div>
  );
}

function Miniatura({
  estudio,
  onAbrir,
  onBorrar,
}: {
  estudio: EstudioImagenRow;
  onAbrir: () => void;
  onBorrar: () => Promise<boolean>;
}) {
  const [posterFallo, setPosterFallo] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const src = estudio.archivo_tipo === "video" ? rutaMiniaturaVideo(estudio.archivo_url) : estudio.archivo_url;

  async function confirmar() {
    setBorrando(true);
    await onBorrar();
    setBorrando(false);
  }

  return (
    <div style={{ position: "relative", width: 44, height: 44 }}>
      <button
        type="button"
        onClick={onAbrir}
        style={{
          display: "block",
          width: 44,
          height: 44,
          borderRadius: 6,
          overflow: "hidden",
          border: "1px solid #4a5b70",
          padding: 0,
          background: "var(--border-soft)",
        }}
      >
        {!posterFallo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            onError={() => setPosterFallo(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div className="tiny" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
            {estudio.archivo_tipo === "video" ? "▶" : "—"}
          </div>
        )}
      </button>

      {!confirmando ? (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          aria-label="Eliminar"
          style={{
            position: "absolute",
            top: -5,
            right: -5,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: "rgba(0,0,0,0.65)",
            color: "#fff",
            border: "1px solid #fff",
            fontSize: 9,
            lineHeight: 1,
            cursor: "pointer",
            padding: 0,
          }}
        >
          ✕
        </button>
      ) : (
        <div
          style={{
            position: "absolute",
            top: -8,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 2,
            background: "var(--bg, #111)",
            border: "1px solid var(--border-soft)",
            borderRadius: 6,
            padding: 2,
            whiteSpace: "nowrap",
            zIndex: 5,
          }}
        >
          <button
            type="button"
            onClick={confirmar}
            disabled={borrando}
            style={{ fontSize: 9, padding: "2px 5px", background: "var(--red)", color: "#fff", border: "none", borderRadius: 3, cursor: "pointer" }}
          >
            {borrando ? "…" : "Sí"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmando(false)}
            disabled={borrando}
            style={{ fontSize: 9, padding: "2px 5px", background: "none", border: "1px solid var(--border-soft)", borderRadius: 3, cursor: "pointer" }}
          >
            No
          </button>
        </div>
      )}
    </div>
  );
}

function Visor({
  estudio,
  onCerrar,
  onBorrar,
}: {
  estudio: EstudioImagenRow;
  onCerrar: () => void;
  onBorrar: (estudio: EstudioImagenRow) => Promise<boolean>;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [borrando, setBorrando] = useState(false);

  async function confirmarBorrado() {
    setBorrando(true);
    const ok = await onBorrar(estudio);
    setBorrando(false);
    if (ok) onCerrar();
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.7)",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          maxHeight: "85vh",
          overflowY: "auto",
          borderRadius: 16,
          background: "var(--bg, #111)",
          border: "1px solid var(--border-soft)",
          padding: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <p style={{ fontSize: 14, fontWeight: 600 }}>{fmtFecha(estudio.created_at)}</p>
          <button
            type="button"
            onClick={onCerrar}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: 4 }}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {estudio.archivo_tipo === "video" ? (
          <video src={estudio.archivo_url} controls autoPlay style={{ width: "100%", borderRadius: 8 }} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={estudio.archivo_url} alt="" style={{ width: "100%", borderRadius: 8 }} />
        )}

        {!confirmando ? (
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            style={{
              marginTop: 10,
              background: "none",
              border: "none",
              color: "var(--text-dim, #8e99a6)",
              fontSize: 12,
              cursor: "pointer",
              padding: 0,
            }}
          >
            Eliminar
          </button>
        ) : (
          <div style={{ marginTop: 10 }}>
            <p className="tiny">¿Seguro que querés borrar este archivo? No se puede deshacer.</p>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setConfirmando(false)}
                disabled={borrando}
                className="chip chip-gray"
                style={{ flex: 1, border: "none", cursor: "pointer" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarBorrado}
                disabled={borrando}
                className="chip"
                style={{ flex: 1, border: "none", cursor: "pointer", background: "var(--red)", color: "#fff" }}
              >
                {borrando ? "Borrando…" : "Borrar"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
