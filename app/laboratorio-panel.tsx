"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  actualizarItemDeCarga,
  cargarCargasLaboratorio,
  guardarValorLaboratorio,
  registrarCargaLaboratorio,
  type CargaItemGuardado,
  type CargaLab,
  type FechaHoraManual,
  type LabParamOP2,
  type PerfilLab,
  type ValorExtraido,
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

function ahoraParaInputLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fechaHoraDeInputLocal(v: string): FechaHoraManual {
  const d = new Date(v);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    dia: pad(d.getDate()),
    mes: pad(d.getMonth() + 1),
    anio: String(d.getFullYear()),
    hora: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--border-soft)",
  borderRadius: 6,
  padding: "6px 8px",
  fontSize: 13,
  minWidth: 0,
};

type ItemPendiente = ValorExtraido;

export type LaboratorioPanelHandle = { abrirCarga: () => void };

const LaboratorioPanel = forwardRef<LaboratorioPanelHandle, { donanteId: string }>(function LaboratorioPanel(
  { donanteId },
  ref
) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cargado, setCargado] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bloqueados, setBloqueados] = useState<LabParamOP2[]>([]);
  const [cargas, setCargas] = useState<CargaLab[]>([]);
  const [cargaAbiertaId, setCargaAbiertaId] = useState<string | null>(null);

  // Revisión antes de guardar (fecha/hora + valores editables) -- ver
  // guardarValorLaboratorio en lib/procuracion/laboratorio.ts.
  const [pendientes, setPendientes] = useState<ItemPendiente[] | null>(null);
  const [imagenUrlPendiente, setImagenUrlPendiente] = useState<string | null>(null);
  const [fechaHoraInput, setFechaHoraInput] = useState(ahoraParaInputLocal());
  const [guardando, setGuardando] = useState(false);

  // El botón propio ("Cargar foto de laboratorio") se sacó de acá -- la
  // carga arranca siempre desde el selector único "¿Qué vas a subir?" de
  // ImagenesVideosPanel (ver page.tsx), que dispara esto por ref.
  useImperativeHandle(ref, () => ({
    abrirCarga: () => {
      if (procesando || pendientes !== null) return;
      fileInputRef.current?.click();
    },
  }));

  useEffect(() => {
    let vivo = true;
    (async () => {
      const cargasDb = await cargarCargasLaboratorio(supabase, donanteId);
      if (!vivo) return;
      setCargas(cargasDb);
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

      const items: ItemPendiente[] = (
        data.items as { parametro: string; valor: string; unidad: string | null; grupo_sugerido: PerfilLab | null }[]
      ).map((it) => ({ parametro: it.parametro, valor: it.valor, unidad: it.unidad, grupoSugerido: it.grupo_sugerido }));

      if (items.length === 0) {
        setError("No se pudo leer ningún dato en la foto. Probá con mejor luz o encuadre.");
        return;
      }

      setPendientes(items);
      setImagenUrlPendiente(imagenUrl);
      setFechaHoraInput(ahoraParaInputLocal());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado al procesar la foto.");
    } finally {
      setProcesando(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function actualizarPendiente(idx: number, campo: "parametro" | "valor" | "unidad", texto: string) {
    setPendientes((prev) =>
      prev
        ? prev.map((it, i) => (i === idx ? { ...it, [campo]: campo === "unidad" ? texto || null : texto } : it))
        : prev
    );
  }

  function quitarPendiente(idx: number) {
    setPendientes((prev) => (prev ? prev.filter((_, i) => i !== idx) : prev));
  }

  function descartarPendientes() {
    setPendientes(null);
    setImagenUrlPendiente(null);
  }

  async function confirmarGuardado() {
    if (!pendientes || pendientes.length === 0) return;
    setGuardando(true);
    const fechaHora = fechaHoraDeInputLocal(fechaHoraInput);

    const bloqueadosEnEsteLote: LabParamOP2[] = [];
    const itemsGuardados: CargaItemGuardado[] = [];
    for (const item of pendientes) {
      const resultado = await guardarValorLaboratorio(supabase, donanteId, item, imagenUrlPendiente, fechaHora);
      if (resultado.tipo === "bloqueado") {
        bloqueadosEnEsteLote.push(resultado.parametroCanonico);
        itemsGuardados.push({
          parametro: item.parametro,
          valor: item.valor,
          unidad: item.unidad,
          destino: { tipo: "bloqueado" },
        });
      } else if (resultado.tipo === "op2") {
        itemsGuardados.push({
          parametro: item.parametro,
          valor: item.valor,
          unidad: item.unidad,
          destino: { tipo: "op2", parametroCanonico: resultado.parametroCanonico, columna: resultado.columna },
        });
      } else {
        itemsGuardados.push({
          parametro: item.parametro,
          valor: item.valor,
          unidad: item.unidad,
          destino: { tipo: "biblioteca", bibliotecaId: resultado.id },
        });
      }
    }
    setBloqueados(bloqueadosEnEsteLote);
    await registrarCargaLaboratorio(supabase, donanteId, imagenUrlPendiente, fechaHora, itemsGuardados);
    setPendientes(null);
    setImagenUrlPendiente(null);

    setCargas(await cargarCargasLaboratorio(supabase, donanteId));
    setGuardando(false);
  }

  async function refrescarTrasEdicionCarga() {
    setCargas(await cargarCargasLaboratorio(supabase, donanteId));
  }

  const cargaAbierta = cargas.find((c) => c.id === cargaAbiertaId) ?? null;

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
      {procesando && (
        <div className="tiny" style={{ marginBottom: 8 }}>
          Procesando foto…
        </div>
      )}

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

      {pendientes && (
        <div style={{ border: "1px solid var(--border-soft)", borderRadius: 12, padding: 12, marginBottom: 12 }}>
          <div className="section-label" style={{ marginTop: 0 }}>
            Revisar antes de guardar
          </div>

          <div className="field-row">
            <span className="field-label">Fecha y hora del estudio</span>
            <input
              type="datetime-local"
              value={fechaHoraInput}
              onChange={(e) => setFechaHoraInput(e.target.value)}
              style={inputStyle}
            />
          </div>

          {pendientes.map((it, idx) => (
            <div key={idx} style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8 }}>
              <input
                value={it.parametro}
                onChange={(e) => actualizarPendiente(idx, "parametro", e.target.value)}
                style={{ ...inputStyle, flex: "1 1 32%" }}
              />
              <input
                value={it.valor}
                onChange={(e) => actualizarPendiente(idx, "valor", e.target.value)}
                style={{ ...inputStyle, flex: "1 1 24%" }}
              />
              <input
                value={it.unidad ?? ""}
                placeholder="unidad"
                onChange={(e) => actualizarPendiente(idx, "unidad", e.target.value)}
                style={{ ...inputStyle, flex: "1 1 20%" }}
              />
              <button
                type="button"
                onClick={() => quitarPendiente(idx)}
                style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 14, padding: 4 }}
                aria-label="Quitar"
              >
                ✕
              </button>
            </div>
          ))}

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              className="btn btn-accent"
              style={{ flex: 1 }}
              disabled={guardando || pendientes.length === 0}
              onClick={confirmarGuardado}
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            <button
              type="button"
              className="chip chip-gray"
              style={{ flex: 1, border: "none", cursor: "pointer" }}
              disabled={guardando}
              onClick={descartarPendientes}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
          {cargado && cargas.length === 0 && <div className="tiny">Sin fotos cargadas todavía.</div>}
          {cargas.length > 0 && (
            <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8 }}>
              {cargas.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCargaAbiertaId(c.id)}
                  style={{
                    flex: "0 0 auto",
                    width: 100,
                    textAlign: "left",
                    background: "none",
                    border: "2px solid #4a5b70",
                    borderRadius: 12,
                    overflow: "hidden",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  {c.imagen_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.imagen_url}
                      alt=""
                      style={{ width: "100%", height: 76, objectFit: "cover", display: "block" }}
                    />
                  ) : (
                    <div style={{ width: "100%", height: 76, background: "var(--border-soft)" }} />
                  )}
                  <div style={{ padding: "4px 6px" }}>
                    <div className="tiny" style={{ fontWeight: 600 }}>
                      {c.etiqueta}
                    </div>
                    <div className="tiny">{c.items.length} valor(es)</div>
                  </div>
                </button>
              ))}
            </div>
          )}
      </div>

      {cargaAbierta && (
        <DetalleCargaModal
          key={cargaAbierta.id}
          carga={cargaAbierta}
          onCerrar={() => setCargaAbiertaId(null)}
          onActualizado={refrescarTrasEdicionCarga}
        />
      )}
    </div>
  );
});

export default LaboratorioPanel;

function DetalleCargaModal({
  carga,
  onCerrar,
  onActualizado,
}: {
  carga: CargaLab;
  onCerrar: () => void;
  onActualizado: () => Promise<void>;
}) {
  // El padre monta este componente con key={carga.id}: cada carga
  // distinta arranca con su propio estado, sin necesidad de un effect
  // para resincronizar "items" cuando cambia la prop.
  const [items, setItems] = useState(carga.items);
  const [guardandoIdx, setGuardandoIdx] = useState<number | null>(null);
  const [errorDetalle, setErrorDetalle] = useState<string | null>(null);

  function actualizarCampo(idx: number, campo: "parametro" | "valor" | "unidad", texto: string) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [campo]: campo === "unidad" ? texto || null : texto } : it)));
  }

  async function guardarItem(idx: number) {
    setGuardandoIdx(idx);
    setErrorDetalle(null);
    const it = items[idx];
    const resultado = await actualizarItemDeCarga(supabase, carga, idx, {
      parametro: it.parametro,
      valor: it.valor,
      unidad: it.unidad,
    });
    setGuardandoIdx(null);
    if (!resultado.ok) {
      setErrorDetalle(resultado.error);
      return;
    }
    await onActualizado();
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
        background: "rgba(0,0,0,0.6)",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 360,
          maxHeight: "80vh",
          overflowY: "auto",
          borderRadius: 16,
          background: "var(--bg, #111)",
          border: "1px solid var(--border-soft)",
          padding: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ fontSize: 14, fontWeight: 600 }}>{carga.etiqueta}</p>
          <button
            type="button"
            onClick={onCerrar}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: 4 }}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        {carga.imagen_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={carga.imagen_url} alt="" style={{ width: "100%", borderRadius: 8, marginTop: 8 }} />
        )}
        <p className="tiny" style={{ marginTop: 8 }}>
          {fmtFecha(carga.fecha_hora_estudio)}
        </p>

        {errorDetalle && (
          <div className="tiny" style={{ color: "var(--red)", marginTop: 8 }}>
            {errorDetalle}
          </div>
        )}

        {items.length === 0 && (
          <div className="tiny" style={{ marginTop: 8 }}>
            Sin valores registrados en esta carga.
          </div>
        )}

        {items.map((it, idx) => (
          <div key={idx} style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8 }}>
            <input
              value={it.parametro}
              onChange={(e) => actualizarCampo(idx, "parametro", e.target.value)}
              style={{ ...inputStyle, flex: "1 1 32%" }}
            />
            <input
              value={it.valor}
              onChange={(e) => actualizarCampo(idx, "valor", e.target.value)}
              style={{ ...inputStyle, flex: "1 1 24%" }}
            />
            <input
              value={it.unidad ?? ""}
              placeholder="unidad"
              onChange={(e) => actualizarCampo(idx, "unidad", e.target.value)}
              style={{ ...inputStyle, flex: "1 1 20%" }}
            />
            <button
              type="button"
              onClick={() => guardarItem(idx)}
              disabled={guardandoIdx === idx}
              style={{
                background: "none",
                border: "1px solid var(--border-soft)",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 13,
                padding: "4px 8px",
              }}
            >
              {guardandoIdx === idx ? "…" : "✓"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
