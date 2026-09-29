"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  borrarEstudioImagen,
  cargarEstudiosImagenes,
  guardarEstudioImagen,
  rutaMiniaturaVideo,
  TIPOS_ESTUDIO_INFO,
  type EstudioImagenRow,
  type TipoEstudio,
} from "@/lib/procuracion/estudios-imagenes";
import { capturarFotogramaDeVideo, comprimirVideoSiHaceFalta } from "@/lib/procuracion/comprimir-video";

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

type Modo = "foto" | "video" | "galeria";

export default function ImagenesVideosPanel({ donanteId }: { donanteId: string }) {
  const camaraFotoInputRef = useRef<HTMLInputElement>(null);
  const camaraVideoInputRef = useRef<HTMLInputElement>(null);
  const galeriaInputRef = useRef<HTMLInputElement>(null);

  const [estudios, setEstudios] = useState<EstudioImagenRow[]>([]);
  const [cargado, setCargado] = useState(false);
  const [categoriaActiva, setCategoriaActiva] = useState<TipoEstudio | null>(null);
  const [procesandoEstudio, setProcesandoEstudio] = useState(false);
  const [errorEstudio, setErrorEstudio] = useState<string | null>(null);
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

  function iniciarCarga(tipo: TipoEstudio, modo: Modo) {
    if (procesandoEstudio) return;
    setCategoriaActiva(tipo);
    if (modo === "foto") camaraFotoInputRef.current?.click();
    else if (modo === "video") camaraVideoInputRef.current?.click();
    else galeriaInputRef.current?.click();
  }

  async function handleEstudioFile(file: File, esVideo: boolean, esDeCamara: boolean) {
    const tipoEstudio = categoriaActiva;
    setErrorEstudio(null);
    if (!tipoEstudio) return;
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

      const stamp = Date.now();
      const path = `${donanteId}/${stamp}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("estudios-imagenes")
        .upload(path, uploadBody, { contentType, upsert: true });
      if (uploadError) {
        setErrorEstudio(`No se pudo subir el archivo: ${uploadError.message}`);
        return;
      }
      const { data: pub } = supabase.storage.from("estudios-imagenes").getPublicUrl(path);

      if (esVideo) {
        // Miniatura para el carrusel: best-effort, no bloquea la subida
        // del video si falla (ver capturarFotogramaDeVideo).
        const fotograma = await capturarFotogramaDeVideo(uploadBody as Blob);
        if (fotograma) {
          const rutaThumb = `${donanteId}/${stamp}-thumb.jpg`;
          await supabase.storage.from("estudios-imagenes").upload(rutaThumb, fotograma, {
            contentType: "image/jpeg",
            upsert: true,
          });
        }
      }

      await guardarEstudioImagen(supabase, donanteId, {
        tipoEstudio,
        archivoUrl: pub.publicUrl,
        archivoTipo: esVideo ? "video" : "image",
        mimeType: contentType,
      });

      setEstudios(await cargarEstudiosImagenes(supabase, donanteId));
    } catch (e) {
      setErrorEstudio(e instanceof Error ? e.message : "Error inesperado al procesar el archivo.");
    } finally {
      setProcesandoEstudio(false);
      setCategoriaActiva(null);
      if (camaraFotoInputRef.current) camaraFotoInputRef.current.value = "";
      if (camaraVideoInputRef.current) camaraVideoInputRef.current.value = "";
      if (galeriaInputRef.current) galeriaInputRef.current.value = "";
    }
  }

  async function handleBorrar(estudio: EstudioImagenRow) {
    const resultado = await borrarEstudioImagen(supabase, estudio);
    if (!resultado.ok) {
      setErrorEstudio(`No se pudo borrar: ${resultado.error}`);
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

      {errorEstudio && (
        <div className="tiny" style={{ color: "var(--red)", marginBottom: 8 }}>
          {errorEstudio}
        </div>
      )}

      {TIPOS_ESTUDIO_INFO.map((info) => (
        <TarjetaCategoria
          key={info.valor}
          info={info}
          estudios={porTipo.get(info.valor) ?? []}
          bloqueado={procesandoEstudio}
          subiendoAca={procesandoEstudio && categoriaActiva === info.valor}
          onElegir={(modo) => iniciarCarga(info.valor, modo)}
          onAbrir={setVisorAbierto}
        />
      ))}

      {visorAbierto && (
        <VisorEstudio estudio={visorAbierto} onCerrar={() => setVisorAbierto(null)} onBorrar={handleBorrar} />
      )}

      {cargado && estudios.length === 0 && (
        <div className="tiny" style={{ marginTop: 4 }}>
          Sin imágenes ni videos cargados todavía.
        </div>
      )}
    </div>
  );
}

function Botones3({
  onElegir,
  disabled,
  compacto,
}: {
  onElegir: (modo: Modo) => void;
  disabled: boolean;
  compacto?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 8, marginTop: compacto ? 8 : 0 }}>
      <button className="btn btn-accent" style={{ flex: 1 }} disabled={disabled} onClick={() => onElegir("foto")}>
        Cámara
      </button>
      <button className="btn btn-accent" style={{ flex: 1 }} disabled={disabled} onClick={() => onElegir("video")}>
        Video
      </button>
      <button className="btn btn-accent" style={{ flex: 1 }} disabled={disabled} onClick={() => onElegir("galeria")}>
        Galería
      </button>
    </div>
  );
}

function MiniaturaChica({ estudio, onClick }: { estudio: EstudioImagenRow; onClick: () => void }) {
  const [posterFallo, setPosterFallo] = useState(false);
  const srcMiniatura = estudio.archivo_tipo === "video" ? rutaMiniaturaVideo(estudio.archivo_url) : estudio.archivo_url;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: "0 0 auto",
        width: 64,
        height: 64,
        borderRadius: 10,
        overflow: "hidden",
        border: "1px solid var(--border-soft)",
        padding: 0,
        position: "relative",
        background: "var(--border-soft)",
      }}
    >
      {!posterFallo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={srcMiniatura}
          alt=""
          onError={() => setPosterFallo(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <div className="tiny" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
          {estudio.archivo_tipo === "video" ? "Video" : "—"}
        </div>
      )}
    </button>
  );
}

function TarjetaCategoria({
  info,
  estudios,
  bloqueado,
  subiendoAca,
  onElegir,
  onAbrir,
}: {
  info: { valor: TipoEstudio; etiqueta: string; nota?: string };
  estudios: EstudioImagenRow[];
  bloqueado: boolean;
  subiendoAca: boolean;
  onElegir: (modo: Modo) => void;
  onAbrir: (estudio: EstudioImagenRow) => void;
}) {
  const [agregando, setAgregando] = useState(false);
  const carruselRef = useRef<HTMLDivElement>(null);
  const hero = estudios.length > 0 ? estudios[estudios.length - 1] : null;

  useLayoutEffect(() => {
    const el = carruselRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [estudios.length]);

  function elegir(modo: Modo) {
    setAgregando(false);
    onElegir(modo);
  }

  return (
    <div style={{ border: "1px solid var(--border-soft)", borderRadius: 12, padding: 12, marginBottom: 12 }}>
      <div className="section-label" style={{ marginTop: 0 }}>
        {info.etiqueta}
      </div>
      {info.nota && (
        <div className="tiny" style={{ color: "var(--amber, #b45309)", marginBottom: 6 }}>
          {info.nota}
        </div>
      )}

      {!hero ? (
        <div>
          <p className="tiny" style={{ marginBottom: 6 }}>
            Sin cargas todavía.
          </p>
          <Botones3 onElegir={elegir} disabled={bloqueado} />
          {subiendoAca && (
            <p className="tiny" style={{ marginTop: 6 }}>
              Subiendo…
            </p>
          )}
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => onAbrir(hero)}
            style={{
              display: "block",
              width: "100%",
              padding: 0,
              border: "1px solid var(--border-soft)",
              borderRadius: 10,
              overflow: "hidden",
              background: "none",
              textAlign: "left",
            }}
          >
            {hero.archivo_tipo === "video" ? (
              <video src={hero.archivo_url} controls style={{ width: "100%", maxHeight: 220, display: "block" }} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={hero.archivo_url}
                alt=""
                style={{ width: "100%", maxHeight: 220, objectFit: "cover", display: "block" }}
              />
            )}
          </button>
          <p className="tiny" style={{ marginTop: 4 }}>
            {fmtFecha(hero.created_at)}
          </p>

          <div ref={carruselRef} style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginTop: 8 }}>
            {estudios.map((e) => (
              <MiniaturaChica key={e.id} estudio={e} onClick={() => onAbrir(e)} />
            ))}
            <button
              type="button"
              disabled={bloqueado}
              onClick={() => setAgregando((v) => !v)}
              aria-label={`Agregar en ${info.etiqueta}`}
              style={{
                flex: "0 0 auto",
                width: 64,
                height: 64,
                borderRadius: 10,
                border: "2px dashed var(--border-soft)",
                background: "none",
                color: "var(--accent)",
                fontSize: 22,
                cursor: "pointer",
              }}
            >
              +
            </button>
          </div>

          {agregando && <Botones3 onElegir={elegir} disabled={bloqueado} compacto />}
          {subiendoAca && (
            <p className="tiny" style={{ marginTop: 6 }}>
              Subiendo…
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function VisorEstudio({
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
              marginTop: 12,
              background: "none",
              border: "none",
              color: "var(--red)",
              fontSize: 13,
              cursor: "pointer",
              padding: 0,
            }}
          >
            Eliminar
          </button>
        ) : (
          <div style={{ marginTop: 12 }}>
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
