"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  borrarEstudioImagen,
  cargarEstudiosImagenes,
  compartirEstudios,
  guardarEstudioImagen,
  rutaMiniaturaVideo,
  TIPOS_ESTUDIO_INFO,
  type EstudioImagenRow,
  type TipoEstudio,
} from "@/lib/procuracion/estudios-imagenes";
import { useSubidasVideo } from "./subidas-video-context";

const supabase = createClient();

const MAX_DIM = 1600;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100MB

// Borde de las miniaturas (destacado + carrusel) -- antes 1px
// var(--border-soft), casi invisible sobre el fondo oscuro del panel.
const BORDE_MINIATURA = "2px solid #4a5b70";

function comprimirImagen(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      // Todo lo que pasa acá adentro corre en un callback del navegador,
      // no en el executor del Promise -- si algo tira (canvas 0x0,
      // toDataURL con canvas "tainted", etc.) sin este try/catch la
      // promesa queda colgada para siempre (nunca resuelve NI rechaza),
      // que es exactamente el síntoma de "Procesando..." que no termina.
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

// Nunca dejar que "Subiendo..." quede colgado para siempre: si algo se
// cuelga (conexión cortada, un callback que nunca dispara, etc.) esto
// fuerza el error a los TIMEOUT_MS en vez de esperar indefinidamente.
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

type Modo = "foto" | "video" | "galeria";
type PasoCarga = "cerrado" | "categoria" | "modo";

export default function ImagenesVideosPanel({ donanteId }: { donanteId: string }) {
  const camaraFotoInputRef = useRef<HTMLInputElement>(null);
  const camaraVideoInputRef = useRef<HTMLInputElement>(null);
  const galeriaInputRef = useRef<HTMLInputElement>(null);
  const { subidas, iniciarSubidaVideo, descartar: descartarSubidaVideo } = useSubidasVideo();

  const [estudios, setEstudios] = useState<EstudioImagenRow[]>([]);
  const [cargado, setCargado] = useState(false);
  const [categoriaActiva, setCategoriaActiva] = useState<TipoEstudio | null>(null);
  const [procesandoEstudio, setProcesandoEstudio] = useState(false);
  const [errorEstudio, setErrorEstudio] = useState<string | null>(null);
  const [visorAbierto, setVisorAbierto] = useState<EstudioImagenRow | null>(null);
  const [confirmarAlAbrir, setConfirmarAlAbrir] = useState(false);

  // Selección múltiple entre categorías, para compartir/exportar en
  // lote -- mismo patrón que TimelineEstudios en PASE.
  const [modoSeleccion, setModoSeleccion] = useState(false);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [compartiendoLote, setCompartiendoLote] = useState(false);
  const [errorCompartirLote, setErrorCompartirLote] = useState<string | null>(null);

  // Punto único de carga (punto 3 del rediseño): paso 1 elige categoría,
  // paso 2 -- recién ahí -- elige Cámara/Video/Galería.
  const [pasoCarga, setPasoCarga] = useState<PasoCarga>("cerrado");
  const [categoriaParaCarga, setCategoriaParaCarga] = useState<TipoEstudio | null>(null);

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
  // global (las que quedan en error se ven ahí para reintentar/
  // descartar a mano; ver subidas-video-indicator.tsx).
  useEffect(() => {
    const listas = Object.values(subidas).filter((s) => s.donanteId === donanteId && s.etapa === "listo");
    if (listas.length === 0) return;
    (async () => {
      setEstudios(await cargarEstudiosImagenes(supabase, donanteId));
      for (const s of listas) descartarSubidaVideo(s.id);
    })();
  }, [subidas, donanteId, descartarSubidaVideo]);

  function elegirCategoriaParaCarga(tipo: TipoEstudio) {
    setCategoriaParaCarga(tipo);
    setPasoCarga("modo");
  }

  function abrirParaBorrar(estudio: EstudioImagenRow) {
    setVisorAbierto(estudio);
    setConfirmarAlAbrir(true);
  }

  // Dispara la carga directo a una categoría ya conocida -- usado tanto
  // por el paso 2 del selector (categoriaParaCarga) como por el "+" de
  // una tarjeta que ya tiene contenido (agregar otro sin volver a elegir
  // categoría desde cero, ver TarjetaCategoria).
  function iniciarCargaDirecta(tipo: TipoEstudio, modo: Modo) {
    setCategoriaActiva(tipo);
    if (modo === "foto") camaraFotoInputRef.current?.click();
    else if (modo === "video") camaraVideoInputRef.current?.click();
    else galeriaInputRef.current?.click();
  }

  function elegirModoParaCarga(modo: Modo) {
    if (!categoriaParaCarga) return;
    setPasoCarga("cerrado");
    iniciarCargaDirecta(categoriaParaCarga, modo);
  }

  // Solo fotos -- el video ya no pasa por acá, ver handleEstudioFile.
  // Tira si algo falla; separado para poder envolverlo en conTimeout()
  // sin mezclar el manejo de estado (procesando/error) con la subida.
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
    setErrorEstudio(null);
    if (!tipoEstudio) return;

    // Video: se dispara y se suelta -- comprime+sube en segundo plano en
    // SubidasVideoProvider (layout.tsx), sin bloquear este panel ni
    // depender de que siga montado (el procurador puede cambiar de
    // donante mientras tanto). Progreso real y reintentar/descartar
    // manual desde el indicador global; sin cola offline -- si no hay
    // señal, termina en error ahí, no en silencio.
    if (esVideo) {
      if (file.size > MAX_VIDEO_BYTES) {
        setErrorEstudio("El video pesa más de 100MB — grabá un clip más corto.");
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
      setCategoriaParaCarga(null);
      if (camaraFotoInputRef.current) camaraFotoInputRef.current.value = "";
      if (camaraVideoInputRef.current) camaraVideoInputRef.current.value = "";
      if (galeriaInputRef.current) galeriaInputRef.current.value = "";
      return;
    }

    setProcesandoEstudio(true);
    try {
      await conTimeout(
        subirFoto(file, tipoEstudio),
        "La carga está tardando demasiado -- puede haberse cortado la conexión. Probá de nuevo."
      );
      setEstudios(await cargarEstudiosImagenes(supabase, donanteId));
    } catch (e) {
      console.error("[ImagenesVideosPanel] Error al cargar estudio:", e);
      setErrorEstudio(e instanceof Error ? e.message : "Error inesperado al procesar el archivo.");
    } finally {
      setProcesandoEstudio(false);
      setCategoriaActiva(null);
      setCategoriaParaCarga(null);
      if (camaraFotoInputRef.current) camaraFotoInputRef.current.value = "";
      if (camaraVideoInputRef.current) camaraVideoInputRef.current.value = "";
      if (galeriaInputRef.current) galeriaInputRef.current.value = "";
    }
  }

  function alternarSeleccion(estudioId: string) {
    setSeleccionados((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(estudioId)) nuevo.delete(estudioId);
      else nuevo.add(estudioId);
      return nuevo;
    });
  }

  function cancelarSeleccion() {
    setModoSeleccion(false);
    setSeleccionados(new Set());
    setErrorCompartirLote(null);
  }

  async function compartirSeleccionados() {
    const elegidos = estudios.filter((e) => seleccionados.has(e.id));
    if (elegidos.length === 0) return;
    setCompartiendoLote(true);
    setErrorCompartirLote(null);
    const resultado = await compartirEstudios(elegidos);
    setCompartiendoLote(false);
    if (!resultado.ok) {
      setErrorCompartirLote(resultado.error);
      return;
    }
    cancelarSeleccion();
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

      <button
        className="btn btn-accent"
        style={{ width: "100%", marginBottom: 12 }}
        disabled={procesandoEstudio}
        onClick={() => setPasoCarga("categoria")}
      >
        {procesandoEstudio ? "Subiendo…" : "Agregar estudio"}
      </button>

      {errorEstudio && (
        <div className="tiny" style={{ color: "var(--red)", marginBottom: 8 }}>
          {errorEstudio}
        </div>
      )}

      {estudios.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {!modoSeleccion ? (
            <button
              type="button"
              onClick={() => setModoSeleccion(true)}
              className="tiny"
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", padding: 0 }}
            >
              Seleccionar
            </button>
          ) : (
            <>
              <p className="tiny" style={{ marginBottom: 6 }}>
                {seleccionados.size === 0
                  ? "Elegí uno o más estudios, de cualquier categoría"
                  : `${seleccionados.size} seleccionado${seleccionados.size === 1 ? "" : "s"}`}
              </p>
              <button
                className="btn btn-accent"
                style={{ width: "100%", marginBottom: 6 }}
                disabled={seleccionados.size === 0 || compartiendoLote}
                onClick={compartirSeleccionados}
              >
                {compartiendoLote ? "Compartiendo…" : `Compartir${seleccionados.size > 0 ? ` (${seleccionados.size})` : ""}`}
              </button>
              <button
                type="button"
                onClick={cancelarSeleccion}
                disabled={compartiendoLote}
                className="chip chip-gray"
                style={{ width: "100%", border: "none", cursor: "pointer" }}
              >
                Cancelar
              </button>
              {errorCompartirLote && (
                <div className="tiny" style={{ color: "var(--red)", marginTop: 6 }}>
                  {errorCompartirLote}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {TIPOS_ESTUDIO_INFO.map((info) => (
        <TarjetaCategoria
          key={info.valor}
          info={info}
          estudios={porTipo.get(info.valor) ?? []}
          onAbrir={setVisorAbierto}
          onBorrar={abrirParaBorrar}
          onAgregarDirecto={(modo) => iniciarCargaDirecta(info.valor, modo)}
          modoSeleccion={modoSeleccion}
          seleccionados={seleccionados}
          onAlternarSeleccion={alternarSeleccion}
        />
      ))}

      {cargado && estudios.length === 0 && (
        <div className="tiny" style={{ marginTop: 4 }}>
          Sin imágenes ni videos cargados todavía.
        </div>
      )}

      {pasoCarga === "categoria" && (
        <SelectorCarga titulo="¿Qué vas a subir?" onCerrar={() => setPasoCarga("cerrado")}>
          {TIPOS_ESTUDIO_INFO.map((info) => (
            <button
              key={info.valor}
              type="button"
              onClick={() => elegirCategoriaParaCarga(info.valor)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                border: "1px solid var(--border-soft)",
                background: "var(--bg-elev, #181f27)",
                borderRadius: 10,
                cursor: "pointer",
                padding: "10px 12px",
                whiteSpace: "normal",
                wordBreak: "break-word",
                overflowWrap: "break-word",
              }}
            >
              {info.etiqueta}
              {info.nota && (
                <div
                  className="tiny"
                  style={{ color: "var(--amber, #b45309)", marginTop: 2, whiteSpace: "normal", wordBreak: "break-word" }}
                >
                  {info.nota}
                </div>
              )}
            </button>
          ))}
        </SelectorCarga>
      )}

      {pasoCarga === "modo" && categoriaParaCarga && (
        <SelectorCarga
          titulo={TIPOS_ESTUDIO_INFO.find((i) => i.valor === categoriaParaCarga)?.etiqueta ?? ""}
          onCerrar={() => setPasoCarga("cerrado")}
          onVolver={() => setPasoCarga("categoria")}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-accent" style={{ flex: 1 }} onClick={() => elegirModoParaCarga("foto")}>
              Cámara
            </button>
            <button className="btn btn-accent" style={{ flex: 1 }} onClick={() => elegirModoParaCarga("video")}>
              Video
            </button>
            <button className="btn btn-accent" style={{ flex: 1 }} onClick={() => elegirModoParaCarga("galeria")}>
              Galería
            </button>
          </div>
        </SelectorCarga>
      )}

      {visorAbierto && (
        <VisorEstudio
          key={visorAbierto.id}
          estudio={visorAbierto}
          confirmarInicial={confirmarAlAbrir}
          onCerrar={() => {
            setVisorAbierto(null);
            setConfirmarAlAbrir(false);
          }}
          onBorrar={handleBorrar}
        />
      )}
    </div>
  );
}

function SelectorCarga({
  titulo,
  onCerrar,
  onVolver,
  children,
}: {
  titulo: string;
  onCerrar: () => void;
  onVolver?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        background: "rgba(0,0,0,0.6)",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 16,
          background: "var(--bg, #111)",
          border: "1px solid var(--border-soft)",
          padding: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <p style={{ fontSize: 14, fontWeight: 600 }}>{titulo}</p>
          <button
            type="button"
            onClick={onCerrar}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: 4 }}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>

        {onVolver && (
          <button
            type="button"
            onClick={onVolver}
            className="tiny"
            style={{ background: "none", border: "none", cursor: "pointer", marginTop: 10, padding: 0, color: "var(--accent)" }}
          >
            ← Elegir otra categoría
          </button>
        )}
      </div>
    </div>
  );
}

function MarcaSeleccion({ seleccionado }: { seleccionado: boolean }) {
  return (
    <span
      style={{
        position: "absolute",
        top: 4,
        right: 4,
        width: 18,
        height: 18,
        borderRadius: "50%",
        border: "2px solid #fff",
        background: seleccionado ? "var(--accent)" : "rgba(0,0,0,0.35)",
        color: "#fff",
        fontSize: 11,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 1,
      }}
    >
      {seleccionado ? "✓" : ""}
    </span>
  );
}

function MiniaturaChica({
  estudio,
  onAbrir,
  onBorrar,
  modoSeleccion,
  seleccionado,
  onAlternarSeleccion,
}: {
  estudio: EstudioImagenRow;
  onAbrir: () => void;
  onBorrar: () => void;
  modoSeleccion: boolean;
  seleccionado: boolean;
  onAlternarSeleccion: () => void;
}) {
  const [posterFallo, setPosterFallo] = useState(false);
  const srcMiniatura = estudio.archivo_tipo === "video" ? rutaMiniaturaVideo(estudio.archivo_url) : estudio.archivo_url;

  return (
    <div style={{ flex: "0 0 auto", width: 64 }}>
      <button
        type="button"
        onClick={modoSeleccion ? onAlternarSeleccion : onAbrir}
        style={{
          display: "block",
          width: 64,
          height: 64,
          borderRadius: 10,
          overflow: "hidden",
          border: BORDE_MINIATURA,
          padding: 0,
          background: "var(--border-soft)",
          position: "relative",
        }}
      >
        {modoSeleccion && <MarcaSeleccion seleccionado={seleccionado} />}
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
      {!modoSeleccion && (
        <button
          type="button"
          onClick={onBorrar}
          aria-label="Eliminar"
          style={{
            display: "block",
            width: "100%",
            marginTop: 4,
            background: "none",
            border: "none",
            color: "var(--text-dim, #8e99a6)",
            fontSize: 10,
            cursor: "pointer",
            padding: 0,
            textAlign: "center",
          }}
        >
          Eliminar
        </button>
      )}
    </div>
  );
}

// Tile "+" al final del carrusel de una categoría que ya tiene contenido
// -- agrega otro archivo a ESA categoría sin volver a pasar por "¿Qué
// vas a subir?" (punto 3 del ajuste: antes no existía, era un paso
// atrás respecto del pedido original de este carrusel).
function TileAgregar({ onElegir }: { onElegir: (modo: Modo) => void }) {
  const [abierto, setAbierto] = useState(false);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Agregar otro a esta categoría"
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
    );
  }

  return (
    <div
      style={{
        flex: "0 0 auto",
        display: "flex",
        gap: 4,
        border: "1px solid var(--border-soft)",
        borderRadius: 10,
        padding: 4,
        background: "var(--bg-elev, #181f27)",
      }}
    >
      {(["foto", "video", "galeria"] as const).map((modo) => (
        <button
          key={modo}
          type="button"
          onClick={() => {
            setAbierto(false);
            onElegir(modo);
          }}
          className="tiny"
          style={{
            background: "none",
            border: "1px solid var(--border-soft)",
            borderRadius: 6,
            cursor: "pointer",
            padding: "4px 6px",
            whiteSpace: "nowrap",
          }}
        >
          {modo === "foto" ? "Cámara" : modo === "video" ? "Video" : "Galería"}
        </button>
      ))}
    </div>
  );
}

function TarjetaCategoria({
  info,
  estudios,
  onAbrir,
  onBorrar,
  onAgregarDirecto,
  modoSeleccion,
  seleccionados,
  onAlternarSeleccion,
}: {
  info: { valor: TipoEstudio; etiqueta: string; nota?: string };
  estudios: EstudioImagenRow[];
  onAbrir: (estudio: EstudioImagenRow) => void;
  onBorrar: (estudio: EstudioImagenRow) => void;
  onAgregarDirecto: (modo: Modo) => void;
  modoSeleccion: boolean;
  seleccionados: Set<string>;
  onAlternarSeleccion: (estudioId: string) => void;
}) {
  const carruselRef = useRef<HTMLDivElement>(null);
  const hero = estudios.length > 0 ? estudios[estudios.length - 1] : null;

  useLayoutEffect(() => {
    const el = carruselRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [estudios.length]);

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
        <p className="tiny">Sin cargas todavía.</p>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => (modoSeleccion ? onAlternarSeleccion(hero.id) : onAbrir(hero))}
            style={{
              display: "block",
              width: "100%",
              padding: 0,
              border: BORDE_MINIATURA,
              borderRadius: 10,
              overflow: "hidden",
              background: "none",
              textAlign: "left",
              position: "relative",
            }}
          >
            {modoSeleccion && <MarcaSeleccion seleccionado={seleccionados.has(hero.id)} />}
            {hero.archivo_tipo === "video" ? (
              <video src={hero.archivo_url} controls={!modoSeleccion} style={{ width: "100%", maxHeight: 220, display: "block" }} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={hero.archivo_url}
                alt=""
                style={{ width: "100%", maxHeight: 220, objectFit: "cover", display: "block" }}
              />
            )}
          </button>
          <p className="tiny" style={{ margin: "4px 0 0" }}>
            {fmtFecha(hero.created_at)}
            {!modoSeleccion && (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={() => onBorrar(hero)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-dim, #8e99a6)",
                    fontSize: 11,
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  Eliminar
                </button>
              </>
            )}
          </p>

          <div
            ref={carruselRef}
            style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginTop: 8, alignItems: "flex-start" }}
          >
            {estudios.map((e) => (
              <MiniaturaChica
                key={e.id}
                estudio={e}
                onAbrir={() => onAbrir(e)}
                onBorrar={() => onBorrar(e)}
                modoSeleccion={modoSeleccion}
                seleccionado={seleccionados.has(e.id)}
                onAlternarSeleccion={() => onAlternarSeleccion(e.id)}
              />
            ))}
            {!modoSeleccion && <TileAgregar onElegir={onAgregarDirecto} />}
          </div>
        </div>
      )}
    </div>
  );
}

function VisorEstudio({
  estudio,
  confirmarInicial,
  onCerrar,
  onBorrar,
}: {
  estudio: EstudioImagenRow;
  confirmarInicial?: boolean;
  onCerrar: () => void;
  onBorrar: (estudio: EstudioImagenRow) => Promise<boolean>;
}) {
  const [confirmando, setConfirmando] = useState(confirmarInicial ?? false);
  const [borrando, setBorrando] = useState(false);
  const [compartiendo, setCompartiendo] = useState(false);
  const [errorCompartir, setErrorCompartir] = useState<string | null>(null);

  async function confirmarBorrado() {
    setBorrando(true);
    const ok = await onBorrar(estudio);
    setBorrando(false);
    if (ok) onCerrar();
  }

  async function compartir() {
    setCompartiendo(true);
    setErrorCompartir(null);
    const resultado = await compartirEstudios([estudio]);
    setCompartiendo(false);
    if (!resultado.ok) setErrorCompartir(resultado.error);
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

        <button type="button" className="btn btn-accent" style={{ width: "100%", marginTop: 12 }} disabled={compartiendo} onClick={compartir}>
          {compartiendo ? "Compartiendo…" : "Compartir"}
        </button>
        {errorCompartir && (
          <div className="tiny" style={{ color: "var(--red)", marginTop: 6 }}>
            {errorCompartir}
          </div>
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
