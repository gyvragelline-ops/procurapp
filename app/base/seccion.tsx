"use client";

import { useState, type ReactNode } from "react";
import { textoWhatsApp, type ContenidoSeccion, type FilaSeccion, type ImagenSeccion, type Revision } from "@/lib/procuracion/base-secciones";
import type { EstadoTarjeta } from "@/lib/procuracion/base-compacto";
import { abrirWhatsApp, compartir, copiarImagen, copiarTexto, descargarBlob, descargarTexto, imagenAPng, nombreArchivo } from "./compartir";
import { COLOR, horaCorta } from "./ui";
import styles from "./base.module.css";

// Tarjeta de sección del Expediente compacto (diseño handoff/disenos/
// Base-Expediente-Compacto.dc.html): encabezado con solo Copiar y
// Compartir; filas bajas (dato · valor · hora). Copiar y compartir dejan
// su línea en la línea de tiempo.
//
// "Marcar revisada" y "Ver ordenado" salieron de la pantalla; la lógica y
// la tabla base_revisiones quedan (Acciones.revision / onRevisar).

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

// ------------------------------------------------ contenido (panel grande)
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

// ---------------------------------------------------- contenido compacto
// Valores que se pintan: verde lo hecho, ámbar lo que falta o está pendiente.
function colorValor(v: string): string | undefined {
  if (/^(Sí|Tomada|Negativo|Aceptado|Hecha)\b/.test(v)) return COLOR.g;
  if (/^(Pendiente|No tomada|Sin cargar|Sin marcar|Sin definir|Ninguno)\b/.test(v)) return COLOR.a;
  if (/^(Positivo|No aceptado)\b/.test(v)) return COLOR.r;
  return undefined;
}

// La hora (o un detalle corto) va en gris a la derecha; un detalle largo
// va debajo del valor, para no partir la columna de la hora.
const DETALLE_CORTO = 14;
export function FilaCompacta({ f, color }: { f: FilaSeccion; color?: string }) {
  const largo = !!f.detalle && f.detalle.length > DETALLE_CORTO;
  return (
    <div className={styles.filaC}>
      <span className={styles.mu}>{f.etiqueta}</span>
      <span className={styles.filaCValor}>
        <span style={{ color: color ?? colorValor(f.valor) }}>{f.valor}</span>
        {largo && <span className={styles.filaCDetalle}>{f.detalle}</span>}
      </span>
      <span className={`${styles.num} ${styles.filaCHora}`}>{largo ? "" : (f.detalle ?? "")}</span>
    </div>
  );
}

export function ContenidoCompacto({ c, filas }: { c: ContenidoSeccion; filas?: FilaSeccion[] }) {
  if (filas) return <>{filas.length ? filas.map((f, k) => <FilaCompacta key={k} f={f} />) : c.vacio && <div className={`${styles.filaC} ${styles.mu}`}>{c.vacio}</div>}</>;
  const grupos = c.grupos.filter((g) => g.filas.length);
  return (
    <>
      {grupos.map((g, i) => (
        <div key={i}>
          {g.titulo && <div className={styles.subC}>{g.titulo}</div>}
          {g.filas.map((f, k) => (
            <FilaCompacta key={k} f={f} />
          ))}
        </div>
      ))}
      {c.soloBase.map((g, i) => (
        <div key={`sb${i}`}>
          <div className={styles.subC}>
            {g.titulo} <SoloBase />
          </div>
          {g.filas.map((f, k) => (
            <FilaCompacta key={k} f={f} />
          ))}
        </div>
      ))}
      {c.vacio && !grupos.length && !c.imagenes.length && <div className={`${styles.filaC} ${styles.mu}`}>{c.vacio}</div>}
    </>
  );
}

// ------------------------------------------------ imágenes de la sección
type AccionImagen = "compartir" | "copiar" | "descargar";
async function hacerConImagen(img: ImagenSeccion, accion: AccionImagen, onRegistrar: Acciones["onRegistrar"]): Promise<string | null> {
  if (!img.url) throw new Error("La imagen no tiene archivo.");
  const png = await imagenAPng(img.url);
  if (accion === "copiar") {
    await copiarImagen(png);
    await onRegistrar("copió", img.etiqueta);
    return "Imagen copiada.";
  }
  if (accion === "descargar") {
    descargarBlob(png, nombreArchivo(img.etiqueta, "png"));
    await onRegistrar("compartió", `${img.etiqueta} (descarga)`);
    return null;
  }
  const archivo = new File([png], nombreArchivo(img.etiqueta, "png"), { type: "image/png" });
  const r = await compartir(img.etiqueta, [archivo]);
  if (r === "no_soportado") return "Este navegador no comparte imágenes: usá Copiar imagen o Descargar.";
  if (r === "compartido") await onRegistrar("compartió", img.etiqueta);
  return null;
}

// Una fila por imagen ("Foto cargada · hora"); al tocarla se abre la vista
// previa con sus acciones (siempre con el aviso de nombre y DNI).
function FilaImagen({ img, ahora, onRegistrar }: { img: ImagenSeccion; ahora: number; onRegistrar: Acciones["onRegistrar"] }) {
  const [abierta, setAbierta] = useState(false);
  const [aviso, setAviso] = useState<AccionImagen | null>(null);
  const [msj, setMsj] = useState<string | null>(null);
  async function hacer(accion: AccionImagen) {
    setAviso(null);
    setMsj(null);
    try {
      setMsj(await hacerConImagen(img, accion, onRegistrar));
    } catch (e) {
      setMsj(e instanceof Error ? e.message : "No se pudo.");
    }
  }
  const valor = !img.url ? "Sin archivo" : img.video ? "Video cargado" : "Foto cargada";
  return (
    <>
      <button type="button" className={`${styles.filaC} ${styles.filaCBoton}`} onClick={() => setAbierta((x) => !x)} aria-expanded={abierta}>
        <span className={styles.mu}>{img.etiqueta}</span>
        <span className={styles.filaCValor} style={{ color: img.url ? (img.compartible ? COLOR.g : COLOR.mu) : COLOR.a }}>
          {valor}
          {!img.compartible && " · solo Base"} {abierta ? "▾" : "›"}
        </span>
        <span className={`${styles.num} ${styles.filaCHora}`}>{horaCorta(img.en, ahora)}</span>
      </button>
      {abierta && (
        <div className={styles.imagenAbierta}>
          {img.url && !img.video ? (
            <a href={img.url} target="_blank" rel="noreferrer" title="Ver en grande">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.etiqueta} className={styles.miniatura} />
            </a>
          ) : (
            <div className={`${styles.miniatura} ${styles.mu}`} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              {img.video ? "Video" : "Sin archivo"}
            </div>
          )}
          <span className={styles.renglon} style={{ gap: 6 }}>
            {!img.compartible ? (
              <SoloBase />
            ) : img.url && img.video ? (
              <a className={styles.enlace} href={img.url} target="_blank" rel="noreferrer">
                ver video
              </a>
            ) : (
              <>
                <button type="button" className={styles.enlace} onClick={() => setAviso("compartir")}>
                  compartir
                </button>
                <button type="button" className={styles.enlace} onClick={() => setAviso("copiar")}>
                  copiar imagen
                </button>
                <button type="button" className={styles.enlace} onClick={() => setAviso("descargar")}>
                  descargar
                </button>
              </>
            )}
          </span>
          {aviso && (
            <div className={styles.avisoImagen} role="alertdialog">
              <span>{AVISO_IMAGEN}</span>
              <button type="button" className={`${styles.btn} ${styles.btnChico} ${styles.btnAcento}`} onClick={() => hacer(aviso)}>
                Continuar
              </button>
              <button type="button" className={`${styles.btn} ${styles.btnChico}`} onClick={() => setAviso(null)}>
                Cancelar
              </button>
            </div>
          )}
          {msj && <div className={`${styles.chico} ${styles.mu}`}>{msj}</div>}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------- Copiar y Compartir
function useCopiarCompartir(c: ContenidoSeccion, ident: string, ahora: number, a: Acciones) {
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

  const botones = (
    <>
      <button type="button" className={styles.btnCab} disabled={ocupado || !c.acciones.copiar} onClick={copiar} title={c.acciones.copiar ? "Copiar el texto de la tarjeta" : "Esta tarjeta no se copia"}>
        Copiar
      </button>
      <button
        type="button"
        className={styles.btnCab}
        disabled={ocupado || !c.acciones.compartir}
        onClick={() => (conImagenes ? setAvisoSeccion(true) : compartirSeccion())}
        title={c.acciones.compartir ? "Compartir el texto de la tarjeta" : "Esta tarjeta no se comparte"}
      >
        Compartir
      </button>
    </>
  );

  const avisos =
    msj || avisoSeccion || sinShare ? (
      <div className={`${styles.avisosCab} ${styles.noImprimir}`}>
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
    ) : null;

  return { botones, avisos };
}

// ------------------------------------------------------------ tarjeta
const COLOR_ESTADO: Record<EstadoTarjeta["color"], string> = { g: COLOR.g, a: COLOR.a, r: COLOR.r, mu: COLOR.nd };

export default function SeccionTarjeta({
  c,
  ident,
  ahora,
  acciones,
  estado,
  filas,
  cuerpo,
  detalle,
  controles,
}: {
  c: ContenidoSeccion;
  ident: string;
  ahora: number;
  acciones: Acciones;
  estado?: EstadoTarjeta;
  filas?: FilaSeccion[]; // filas propias (si no, las de la sección)
  cuerpo?: ReactNode; // contenido propio (si no, el estándar)
  detalle?: ReactNode; // "Detalle ›": panel lateral (solo Mantenimiento)
  controles?: { etiqueta: string; contenido: ReactNode }; // acciones de la Base, plegadas
}) {
  const [abierto, setAbierto] = useState(false);
  const [conControles, setConControles] = useState(false);
  const { botones, avisos } = useCopiarCompartir(c, ident, ahora, acciones);
  const punto = estado ? COLOR_ESTADO[estado.color] : COLOR.nd;
  return (
    <div id={`sec-${c.clave}`} className={`${styles.cardC} ${styles.ancla}`}>
      <div className={styles.cabC}>
        <span className={styles.punto} style={{ width: 8, height: 8, background: punto }} />
        {c.numero && <span className={`${styles.num} ${styles.cabCNum}`}>{c.numero}</span>}
        <span className={styles.cabCTitulo}>{c.titulo}</span>
        {c.datosHasta ? (
          <span className={styles.cabCEstado} style={{ color: COLOR.mu, fontWeight: 400 }}>
            datos hasta {horaCorta(c.datosHasta, ahora)}
          </span>
        ) : (
          estado?.texto && (
            <span className={styles.cabCEstado} style={{ color: COLOR_ESTADO[estado.color] }} title={estado.detalle.length ? `Falta: ${estado.detalle.join(" · ")}` : undefined}>
              {estado.texto}
            </span>
          )
        )}
        {detalle && (
          <button type="button" className={styles.enlaceCab} onClick={() => setAbierto(true)}>
            Detalle ›
          </button>
        )}
        <span className={styles.noImprimir} style={{ display: "contents" }}>
          {botones}
        </span>
      </div>
      {avisos}
      {cuerpo ?? <ContenidoCompacto c={c} filas={filas} />}
      {c.imagenes.map((img) => (
        <FilaImagen key={img.id} img={img} ahora={ahora} onRegistrar={acciones.onRegistrar} />
      ))}
      {controles && (
        <div className={styles.noImprimir}>
          <button type="button" className={`${styles.filaC} ${styles.filaCBoton} ${styles.controlesToggle}`} onClick={() => setConControles((x) => !x)} aria-expanded={conControles}>
            <span>
              {controles.etiqueta} {conControles ? "▾" : "›"}
            </span>
          </button>
          {conControles && controles.contenido}
        </div>
      )}

      {abierto && detalle && (
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
            <div className={`${styles.chico} ${styles.mu}`} style={{ padding: "6px 16px" }}>
              {ident} · {c.datosHasta ? `datos hasta ${horaCorta(c.datosHasta, ahora)}` : `generado ${horaCorta(new Date(ahora).toISOString(), ahora)}`}
            </div>
            <ContenidoVista c={c} grande />
            {detalle}
          </aside>
        </div>
      )}
    </div>
  );
}

export { COLOR };
