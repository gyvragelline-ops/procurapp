"use client";

// Fotos de DNI y de Grupo y factor -- mismo patrón compacto de carga
// que "Laboratorio e imágenes" (botón "Subir" -> Cámara o Galería,
// miniaturas chicas con cruz para borrar), pero acá son solo 2
// categorías fijas y sin video (son fotos de documentos).

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  borrarDocumentacionFoto,
  cargarDocumentacionFotos,
  guardarDocumentacionFoto,
  sincronizarEstadoFotoDoc,
  type DocumentacionFotoRow,
  type TipoFotoDoc,
} from "@/lib/procuracion/documentacion-fotos";

const supabase = createClient();

const MAX_DIM = 1600;
const TIMEOUT_MS = 45000;

const CATEGORIAS: { valor: TipoFotoDoc; etiqueta: string }[] = [
  { valor: "dni", etiqueta: "Foto de DNI del potencial donante" },
  { valor: "grupo_factor", etiqueta: "Foto de grupo y factor" },
];

function comprimirImagen(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
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

type Modo = "foto" | "galeria";

export default function DocumentacionFotosPanel({ donanteId }: { donanteId: string }) {
  const camaraInputRef = useRef<HTMLInputElement>(null);
  const galeriaInputRef = useRef<HTMLInputElement>(null);

  const [fotos, setFotos] = useState<DocumentacionFotoRow[]>([]);
  const [cargado, setCargado] = useState(false);
  const [categoriaActiva, setCategoriaActiva] = useState<TipoFotoDoc | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const f = await cargarDocumentacionFotos(supabase, donanteId);
      if (!vivo) return;
      setFotos(f);
      setCargado(true);
    })();
    return () => {
      vivo = false;
    };
  }, [donanteId]);

  function iniciarCarga(tipo: TipoFotoDoc, modo: Modo) {
    setCategoriaActiva(tipo);
    if (modo === "foto") camaraInputRef.current?.click();
    else galeriaInputRef.current?.click();
  }

  async function subir(file: File, tipo: TipoFotoDoc): Promise<void> {
    const comprimida = await comprimirImagen(file);
    const uploadBody = Uint8Array.from(atob(comprimida.base64), (c) => c.charCodeAt(0));
    const contentType = comprimida.mediaType;

    const stamp = Date.now();
    const path = `${donanteId}/doc-${tipo}-${stamp}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from("estudios-imagenes")
      .upload(path, uploadBody, { contentType, upsert: true });
    if (uploadError) throw new Error(`No se pudo subir el archivo: ${uploadError.message}`);
    const { data: pub } = supabase.storage.from("estudios-imagenes").getPublicUrl(path);

    await guardarDocumentacionFoto(supabase, donanteId, tipo, pub.publicUrl, contentType);
    await sincronizarEstadoFotoDoc(supabase, donanteId, tipo, true);
  }

  async function handleFile(file: File) {
    const tipo = categoriaActiva;
    setError(null);
    if (!tipo) return;
    setProcesando(true);
    try {
      await conTimeout(subir(file, tipo), "La carga está tardando demasiado -- puede haberse cortado la conexión. Probá de nuevo.");
      setFotos(await cargarDocumentacionFotos(supabase, donanteId));
    } catch (e) {
      console.error("[DocumentacionFotosPanel] Error al cargar foto:", e);
      setError(e instanceof Error ? e.message : "Error inesperado al procesar la foto.");
    } finally {
      setProcesando(false);
      setCategoriaActiva(null);
      if (camaraInputRef.current) camaraInputRef.current.value = "";
      if (galeriaInputRef.current) galeriaInputRef.current.value = "";
    }
  }

  async function handleBorrar(foto: DocumentacionFotoRow, tipo: TipoFotoDoc) {
    const resultado = await borrarDocumentacionFoto(supabase, foto);
    if (!resultado.ok) {
      setError(`No se pudo borrar: ${resultado.error}`);
      return;
    }
    const restantes = fotos.filter((f) => f.id !== foto.id);
    setFotos(restantes);
    const quedanDeEsteTipo = restantes.some((f) => f.tipo === tipo);
    await sincronizarEstadoFotoDoc(supabase, donanteId, tipo, quedanDeEsteTipo);
  }

  const porTipo = new Map<TipoFotoDoc, DocumentacionFotoRow[]>();
  for (const c of CATEGORIAS) porTipo.set(c.valor, []);
  for (const f of fotos) porTipo.get(f.tipo)?.push(f);

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border-soft)" }}>
      <input
        ref={camaraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <input
        ref={galeriaInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />

      {error && (
        <div className="tiny" style={{ color: "var(--red)", marginBottom: 8 }}>
          {error}
        </div>
      )}

      {CATEGORIAS.map((c) => (
        <FilaFoto
          key={c.valor}
          etiqueta={c.etiqueta}
          fotos={cargado ? porTipo.get(c.valor) ?? [] : []}
          bloqueado={procesando}
          onElegirModo={(modo) => iniciarCarga(c.valor, modo)}
          onBorrar={(foto) => handleBorrar(foto, c.valor)}
        />
      ))}
    </div>
  );
}

function FilaFoto({
  etiqueta,
  fotos,
  bloqueado,
  onElegirModo,
  onBorrar,
}: {
  etiqueta: string;
  fotos: DocumentacionFotoRow[];
  bloqueado: boolean;
  onElegirModo: (modo: Modo) => void;
  onBorrar: (foto: DocumentacionFotoRow) => void;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div style={{ paddingBottom: 10, marginBottom: 10, borderBottom: "1px solid var(--border-soft)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{etiqueta}</span>
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

      {abierto && (
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button
            type="button"
            onClick={() => {
              setAbierto(false);
              onElegirModo("foto");
            }}
            className="tiny"
            style={{ background: "none", border: "1px solid var(--border-soft)", borderRadius: 6, cursor: "pointer", padding: "4px 8px" }}
          >
            Cámara
          </button>
          <button
            type="button"
            onClick={() => {
              setAbierto(false);
              onElegirModo("galeria");
            }}
            className="tiny"
            style={{ background: "none", border: "1px solid var(--border-soft)", borderRadius: 6, cursor: "pointer", padding: "4px 8px" }}
          >
            Galería
          </button>
        </div>
      )}

      {fotos.length === 0 ? (
        <p className="tiny" style={{ marginTop: 6 }}>
          Sin cargas.
        </p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
          {fotos.map((f) => (
            <Miniatura key={f.id} foto={f} onBorrar={() => onBorrar(f)} />
          ))}
        </div>
      )}
    </div>
  );
}

function Miniatura({ foto, onBorrar }: { foto: DocumentacionFotoRow; onBorrar: () => void }) {
  const [confirmando, setConfirmando] = useState(false);

  return (
    <div style={{ position: "relative", width: 44, height: 44 }}>
      <a
        href={foto.archivo_url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "block",
          width: 44,
          height: 44,
          borderRadius: 6,
          overflow: "hidden",
          border: "1px solid #4a5b70",
          background: "var(--border-soft)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={foto.archivo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </a>

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
            onClick={onBorrar}
            style={{ fontSize: 9, padding: "2px 5px", background: "var(--red)", color: "#fff", border: "none", borderRadius: 3, cursor: "pointer" }}
          >
            Sí
          </button>
          <button
            type="button"
            onClick={() => setConfirmando(false)}
            style={{ fontSize: 9, padding: "2px 5px", background: "none", border: "1px solid var(--border-soft)", borderRadius: 3, cursor: "pointer" }}
          >
            No
          </button>
        </div>
      )}
    </div>
  );
}
