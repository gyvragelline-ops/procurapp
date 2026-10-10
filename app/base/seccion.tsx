"use client";

import { useState, type ReactNode } from "react";
import { textoWhatsApp, type ContenidoSeccion, type ImagenSeccion, type Revision } from "@/lib/procuracion/base-secciones";
import { abrirWhatsApp, compartir, copiarImagen, copiarTexto, descargarBlob, descargarTexto, imagenAPng, nombreArchivo } from "./compartir";
import { COLOR, horaCorta } from "./ui";
import styles from "./base.module.css";

// Tarjeta de sección del Expediente: título + marca de la Base, barra de 4
// acciones (Marcar revisada · Copiar · Compartir · Ver ordenado) y el
// contenido. Copiar y compartir dejan su línea en la línea de tiempo.

export function SoloBase() {
  return <span className={styles.soloBase}>Solo Base · no se exporta</span>;
}

export type Acciones = {
  revision: Revision | null;
  revisionesDisponibles: boolean;
  onRevisar: () => Promise<void>;
  onQuitarRevision: (id: string) => Promise<void>;
  onRegistrar: (accion: "copió" | "compartió", extra?: string) => Promise<void>;
  // gráficas u otros archivos generados por la app (sin aviso de imagen)
  archivosExtra?: () => Promise<File[]>;
};

const AVISO_IMAGEN = "Revisá que la imagen no muestre nombre ni DNI";

// ------------------------------------------------------- contenido
export function ContenidoVista({ c, grande = false }: { c: ContenidoSeccion; grande?: boolean }) {
  const tam = grande ? 15 : 13;
  return (
    <div>
      {c.grupos
        .filter((g) => g.filas.length)
        .map((g, i) => (
          <div key={i}>
            {g.titulo && (
              <div className={styles.cardFila} style={{ fontWeight: 600, background: "#F7FAFA", fontSize: tam }}>
                {g.titulo}
              </div>
            )}
            {g.filas.map((f, k) => (
              <div key={k} className={styles.par} style={{ fontSize: tam }}>
                <span>{f.etiqueta}</span>
                <span>
                  <span style={{ fontWeight: 600, whiteSpace: "pre-wrap" }}>{f.valor}</span>
                  {f.detalle && (
                    <span className={`${styles.chico} ${styles.mu}`} style={{ display: "block", fontWeight: 400 }}>
                      {f.detalle}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        ))}
      {c.soloBase.map((g, i) => (
        <div key={`sb${i}`}>
          <div className={styles.cardFila} style={{ fontWeight: 600, fontSize: tam }}>
            {g.titulo} <SoloBase />
          </div>
          {g.filas.map((f, k) => (
            <div key={k} className={styles.par} style={{ fontSize: tam }}>
              <span>{f.etiqueta}</span>
              <span style={{ fontWeight: 600 }}>{f.valor}</span>
            </div>
          ))}
        </div>
      ))}
      {c.vacio && c.grupos.every((g) => !g.filas.length) && !c.imagenes.length && <div className={`${styles.cardFila} ${styles.mu}`}>{c.vacio}</div>}
    </div>
  );
}

// ---------------------------------------------- imágenes de la sección
function Imagenes({ c, ahora, onRegistrar }: { c: ContenidoSeccion; ahora: number; onRegistrar: Acciones["onRegistrar"] }) {
  const [aviso, setAviso] = useState<{ img: ImagenSeccion; accion: "compartir" | "copiar" | "descargar" } | null>(null);
  const [msj, setMsj] = useState<string | null>(null);
  if (!c.imagenes.length) return null;

  async function hacer(img: ImagenSeccion, accion: "compartir" | "copiar" | "descargar") {
    setAviso(null);
    setMsj(null);
    try {
      if (!img.url) throw new Error("La imagen no tiene archivo.");
      const png = await imagenAPng(img.url);
      if (accion === "copiar") {
        await copiarImagen(png);
        setMsj("Imagen copiada.");
        await onRegistrar("copió", img.etiqueta);
      } else if (accion === "descargar") {
        descargarBlob(png, nombreArchivo(img.etiqueta, "png"));
        await onRegistrar("compartió", `${img.etiqueta} (descarga)`);
      } else {
        const archivo = new File([png], nombreArchivo(img.etiqueta, "png"), { type: "image/png" });
        const r = await compartir(img.etiqueta, [archivo]);
        if (r === "no_soportado") {
          setMsj("Este navegador no comparte imágenes: usá Copiar imagen o Descargar.");
          return;
        }
        if (r === "compartido") await onRegistrar("compartió", img.etiqueta);
      }
    } catch (e) {
      setMsj(e instanceof Error ? e.message : "No se pudo.");
    }
  }

  return (
    <div className={styles.cardFila}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {c.imagenes.map((img) => (
          <div key={img.id} style={{ width: 180, display: "flex", flexDirection: "column", gap: 4 }}>
            {img.url && !img.video ? (
              <a href={img.url} target="_blank" rel="noreferrer" title="Ver">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.etiqueta} style={{ width: 180, height: 120, objectFit: "cover", borderRadius: 8, border: "1px solid var(--bd)" }} />
              </a>
            ) : (
              <div style={{ width: 180, height: 120, borderRadius: 8, border: "1px solid var(--bd)", display: "flex", alignItems: "center", justifyContent: "center" }} className={styles.mu}>
                {img.video ? "Video" : "Sin archivo"}
              </div>
            )}
            <span className={styles.chico} style={{ fontWeight: 600 }}>
              {img.etiqueta}
            </span>
            <span className={`${styles.chico} ${styles.mu}`}>{horaCorta(img.en, ahora)}</span>
            {img.compartible ? (
              <span className={styles.renglon} style={{ gap: 4 }}>
                {img.url && img.video ? (
                  <a className={styles.enlace} href={img.url} target="_blank" rel="noreferrer">
                    ver video
                  </a>
                ) : (
                  <>
                    <button type="button" className={styles.enlace} onClick={() => setAviso({ img, accion: "compartir" })}>
                      compartir
                    </button>
                    <button type="button" className={styles.enlace} onClick={() => setAviso({ img, accion: "copiar" })}>
                      copiar imagen
                    </button>
                    <button type="button" className={styles.enlace} onClick={() => setAviso({ img, accion: "descargar" })}>
                      descargar
                    </button>
                  </>
                )}
              </span>
            ) : (
              <SoloBase />
            )}
          </div>
        ))}
      </div>
      {aviso && (
        <div className={styles.avisoImagen} role="alertdialog">
          <span>{AVISO_IMAGEN}</span>
          <button type="button" className={`${styles.btn} ${styles.btnChico} ${styles.btnAcento}`} onClick={() => hacer(aviso.img, aviso.accion)}>
            Continuar
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnChico}`} onClick={() => setAviso(null)}>
            Cancelar
          </button>
        </div>
      )}
      {msj && <div className={`${styles.chico} ${styles.mu}`}>{msj}</div>}
    </div>
  );
}

// ------------------------------------------------------- barra de acciones
function BarraAcciones({ c, ident, ahora, a, onVer }: { c: ContenidoSeccion; ident: string; ahora: number; a: Acciones; onVer?: () => void }) {
  const [msj, setMsj] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [avisoSeccion, setAvisoSeccion] = useState(false);
  const [sinShare, setSinShare] = useState(false);
  const texto = () => textoWhatsApp(c, ident, ahora);
  const conImagenes = c.imagenes.some((i) => i.compartible && i.url && !i.video);

  async function envolver(fn: () => Promise<void>) {
    setMsj(null);
    setOcupado(true);
    try {
      await fn();
    } catch (e) {
      setMsj(e instanceof Error ? e.message : "No se pudo.");
    } finally {
      setOcupado(false);
    }
  }

  const copiar = () =>
    envolver(async () => {
      await copiarTexto(texto());
      setMsj("Copiado.");
      await a.onRegistrar("copió");
    });

  const compartirSeccion = () =>
    envolver(async () => {
      setAvisoSeccion(false);
      const imgs = await Promise.all(
        c.imagenes.filter((i) => i.compartible && i.url && !i.video).map(async (i) => new File([await imagenAPng(i.url!)], nombreArchivo(i.etiqueta, "png"), { type: "image/png" }))
      );
      const extra = a.archivosExtra ? await a.archivosExtra() : [];
      const r = await compartir(texto(), [...imgs, ...extra]);
      if (r === "no_soportado") {
        setSinShare(true);
        return;
      }
      if (r === "compartido") await a.onRegistrar("compartió");
    });

  return (
    <div className={`${styles.barraAcciones} ${styles.noImprimir}`}>
      {a.revision ? (
        <button type="button" className={`${styles.btn} ${styles.btnChico} ${styles.revisada}`} disabled={ocupado} onClick={() => envolver(() => a.onQuitarRevision(a.revision!.id))} title="Tocar para quitar la marca">
          ✓ Revisada · {a.revision.revisado_por ?? "Base"} {horaCorta(a.revision.revisado_en, ahora)}
        </button>
      ) : (
        <button type="button" className={`${styles.btn} ${styles.btnChico}`} disabled={ocupado || !a.revisionesDisponibles} onClick={() => envolver(a.onRevisar)}>
          ✓ Marcar revisada
        </button>
      )}
      {c.acciones.copiar && (
        <button type="button" className={`${styles.btn} ${styles.btnChico}`} disabled={ocupado} onClick={copiar}>
          Copiar
        </button>
      )}
      {c.acciones.compartir && (
        <button type="button" className={`${styles.btn} ${styles.btnChico}`} disabled={ocupado} onClick={() => (conImagenes ? setAvisoSeccion(true) : compartirSeccion())}>
          Compartir
        </button>
      )}
      {onVer && (
        <button type="button" className={`${styles.btn} ${styles.btnChico}`} onClick={onVer}>
          Ver ordenado ⤢
        </button>
      )}
      {!a.revisionesDisponibles && <span className={`${styles.chico} ${styles.mu}`}>marca de revisada no disponible (falta el SQL)</span>}
      {msj && <span className={`${styles.chico} ${styles.mu}`}>{msj}</span>}
      {avisoSeccion && (
        <span className={styles.avisoImagen} role="alertdialog">
          <span>{AVISO_IMAGEN}</span>
          <button type="button" className={`${styles.btn} ${styles.btnChico} ${styles.btnAcento}`} onClick={compartirSeccion}>
            Continuar
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnChico}`} onClick={() => setAvisoSeccion(false)}>
            Cancelar
          </button>
        </span>
      )}
      {sinShare && (
        <span className={styles.avisoImagen}>
          <span>Este navegador no tiene «compartir».</span>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnChico} ${styles.btnAcento}`}
            onClick={async () => {
              abrirWhatsApp(texto());
              setSinShare(false);
              await a.onRegistrar("compartió", "WhatsApp");
            }}
          >
            Abrir WhatsApp
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnChico}`}
            onClick={async () => {
              descargarTexto(texto(), nombreArchivo(`${ident}_${c.numero}_${c.titulo}`, "txt"));
              setSinShare(false);
              await a.onRegistrar("compartió", "descarga");
            }}
          >
            Descargar
          </button>
          <button type="button" className={styles.enlace} onClick={() => setSinShare(false)}>
            cerrar
          </button>
        </span>
      )}
    </div>
  );
}

// ------------------------------------------------------------ tarjeta
export default function SeccionTarjeta({
  c,
  ident,
  ahora,
  acciones,
  cuerpo,
  ordenado,
}: {
  c: ContenidoSeccion;
  ident: string;
  ahora: number;
  acciones: Acciones;
  cuerpo?: ReactNode; // contenido propio (si no, el estándar)
  ordenado?: ReactNode; // lo extra que se ve en "Ver ordenado"
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div id={`sec-${c.clave}`} className={`${styles.card} ${styles.ancla}`}>
      <div className={styles.cardCab}>
        <span>
          {c.numero} · {c.titulo}
        </span>
        <span className={styles.mu} style={{ fontWeight: 400 }}>
          {c.datosHasta ? `datos hasta ${horaCorta(c.datosHasta, ahora)}` : ""}
        </span>
      </div>
      <BarraAcciones c={c} ident={ident} ahora={ahora} a={acciones} onVer={() => setAbierto(true)} />
      {cuerpo ?? <ContenidoVista c={c} />}
      <Imagenes c={c} ahora={ahora} onRegistrar={acciones.onRegistrar} />

      {abierto && (
        <div className={styles.fondoPanel} onClick={() => setAbierto(false)}>
          <aside className={styles.panelLateral} role="dialog" aria-label={`${c.numero} ${c.titulo}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.cardCab} style={{ fontSize: 18 }}>
              <span>
                {c.numero} · {c.titulo}
              </span>
              <button type="button" className={`${styles.btn} ${styles.btnChico}`} onClick={() => setAbierto(false)} aria-label="Cerrar">
                ✕
              </button>
            </div>
            <BarraAcciones c={c} ident={ident} ahora={ahora} a={acciones} />
            <div className={`${styles.chico} ${styles.mu}`} style={{ padding: "6px 16px" }}>
              {ident} · {c.datosHasta ? `datos hasta ${horaCorta(c.datosHasta, ahora)}` : `generado ${horaCorta(new Date(ahora).toISOString(), ahora)}`}
            </div>
            <ContenidoVista c={c} grande />
            {ordenado}
            <Imagenes c={c} ahora={ahora} onRegistrar={acciones.onRegistrar} />
          </aside>
        </div>
      )}
    </div>
  );
}

export { COLOR };
