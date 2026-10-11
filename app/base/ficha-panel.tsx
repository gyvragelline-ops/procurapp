"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ExpedienteDatos, EnvioFichaFila, FuenteBase } from "@/lib/procuracion/base-armado";
import {
  armarFicha,
  camposOrgano,
  donanteFicha,
  editadosTexto,
  instantanea,
  lineaAccionFicha,
  lineaEdicionFicha,
  textoFicha,
  tildesIniciales,
  validarEdicion,
  valoresCampos,
  versionPropuesta,
  type Campo,
  type Ediciones,
  type EnvioPrevio,
  type Tildes,
  type ValorCampo,
} from "@/lib/procuracion/ficha";
import type { FichaOrgano } from "@/lib/procuracion/distribucion";
import { dataUrlOrgano } from "@/lib/procuracion/organos-svg";
import { horaTexto } from "@/lib/procuracion/base-secciones";
import { rutaMiniaturaVideo } from "@/lib/procuracion/estudios-imagenes";
import { copiarTexto, descargarBlob, nombreArchivo } from "./compartir";
import { imagenJpeg } from "./imagen-jpeg";
import { useNombre } from "./nombre-base";
import { COLOR } from "./ui";
import type { ImagenesPdf } from "./ficha-pdf";
import styles from "./base.module.css";

// Ficha para el equipo (solo Base; diseño handoff/disenos/preview-ficha.png):
// 1 qué se incluye y valores (editables; los calculados se recalculan),
// 2 vista previa del PDF real (se regenera al tildar o editar),
// 3 compartir (Etapa 1: descargar el PDF y copiar el texto).
// Un valor editado vive SOLO en la ficha: no toca el registro clínico.
// Cada edición y cada envío dejan su línea en la línea de tiempo.

const reloj = () => Date.now(); // hora real de la acción (no la de la pantalla)
const AVISO_IMAGENES = "Revisá que las imágenes y el video no muestren nombre ni DNI.";

type Props = {
  datos: ExpedienteDatos;
  ficha: FichaOrgano;
  fuente: FuenteBase;
  donanteId: string;
  ahora: number;
  recargar: () => Promise<void>;
  onCerrar: () => void;
};

export default function FichaPanel({ datos, ficha, fuente, donanteId, ahora, recargar, onCerrar }: Props) {
  const cfg = ficha.cfg;
  const co = useMemo(() => camposOrgano(cfg, datos, ahora), [cfg, datos, ahora]);
  const [tildes, setTildes] = useState<Tildes>(() => tildesIniciales(co));
  const [ediciones, setEdiciones] = useState<Ediciones>({});
  const [envios, setEnvios] = useState<EnvioFichaFila[] | null | undefined>(undefined); // undefined: cargando; null: falta el SQL
  const [confirmadoImagenes, setConfirmadoImagenes] = useState(false);
  const [pidiendoConfirmacion, setPidiendoConfirmacion] = useState<null | "descargar">(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const asegurarNombre = useNombre();

  useEffect(() => {
    let vivo = true;
    fuente
      .cargarEnviosFicha(donanteId, cfg.clave)
      .then((e) => vivo && setEnvios(e))
      .catch((e) => vivo && (setEnvios([]), setError(e instanceof Error ? e.message : "No se pudieron cargar las versiones.")));
    return () => {
      vivo = false;
    };
  }, [fuente, donanteId, cfg.clave]);

  const valores = useMemo(() => valoresCampos(co.campos, ediciones), [co, ediciones]);
  const inst = useMemo(() => instantanea(valores, co, tildes, ahora), [valores, co, tildes, ahora]);
  const previos: EnvioPrevio[] = useMemo(
    () => (envios ?? []).map((e) => ({ version: e.version, creado_en: e.creado_en, anulado: e.anulado, valores: e.valores, incluye: e.incluye })),
    [envios]
  );
  const ver = useMemo(() => versionPropuesta(previos, inst), [previos, inst]);
  const armada = useMemo(
    () =>
      armarFicha({
        cfg,
        nombreEquipo: ficha.nombreEquipo,
        donante: donanteFicha(datos.donante),
        co,
        valores,
        tildes,
        version: ver.version,
        anterior: ver.anterior,
        instantaneaActual: inst,
        ahora,
      }),
    [cfg, ficha.nombreEquipo, datos.donante, co, valores, tildes, ver, inst, ahora]
  );
  const conImagenes = armada.imagenes.length > 0;

  // ------------------------------------------------ imágenes para el PDF (JPEG ≤ 1600 px)
  const [jpegs, setJpegs] = useState<ImagenesPdf>({});
  useEffect(() => {
    let vivo = true;
    for (const i of armada.imagenes) {
      if (!i.enPdf || !i.url || jpegs[i.id]) continue;
      imagenJpeg(i.url)
        .then((d) => vivo && setJpegs((x) => ({ ...x, [i.id]: d })))
        .catch(() => vivo && setAviso(`No se pudo preparar la imagen ${i.etiqueta} para el PDF.`));
    }
    return () => {
      vivo = false;
    };
  }, [armada.imagenes, jpegs]);

  // ------------------------------------------------ PDF real y su vista previa
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [generando, setGenerando] = useState(false);
  useEffect(() => {
    let vivo = true;
    const t = setTimeout(async () => {
      setGenerando(true);
      try {
        const { generarPdfFicha } = await import("./ficha-pdf");
        const b = await generarPdfFicha(armada, jpegs);
        if (vivo) setPdfBlob(b);
      } catch (e) {
        if (vivo) setError(e instanceof Error ? `No se pudo generar el PDF: ${e.message}` : "No se pudo generar el PDF.");
      } finally {
        if (vivo) setGenerando(false);
      }
    }, 350);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [armada, jpegs]);

  // ------------------------------------------------ editar
  async function guardarEdicion(c: Campo, texto: string): Promise<string | null> {
    const v = validarEdicion(c, texto);
    if (!v.ok) return v.error;
    const antes = ediciones[c.clave]?.valor ?? c.original;
    if (v.valor === antes) return null;
    const quien = await asegurarNombre();
    if (!quien) return "Sin nombre no se edita.";
    const en = new Date(reloj()).toISOString();
    const previo = ediciones;
    // volver al valor del registro: se quita la edición
    const vuelta = v.valor === c.original;
    setEdiciones((x) => {
      const n = { ...x };
      if (vuelta) delete n[c.clave];
      else n[c.clave] = { valor: v.valor, numero: v.numero, en, por: quien };
      return n;
    });
    try {
      await fuente.registrarEnLinea(donanteId, lineaEdicionFicha(cfg.etiqueta, c, antes, v.valor, quien, reloj()));
      void recargar(); // la línea aparece en el expediente; la ficha no espera
      return null;
    } catch (e) {
      setEdiciones(previo); // sin la línea de tiempo, la edición no queda
      return e instanceof Error ? `No quedó en la línea de tiempo: ${e.message}` : "No se pudo registrar la edición.";
    }
  }

  // ------------------------------------------------ descargar y copiar
  async function descargar(confirmado = confirmadoImagenes) {
    setError(null);
    setAviso(null);
    const quien = await asegurarNombre();
    if (!quien) return;
    if (conImagenes && !confirmado) return setPidiendoConfirmacion("descargar");
    setOcupado(true);
    try {
      // primero se guarda la versión (si es nueva); el PDF lleva ESA versión
      let final = armada;
      if (envios !== null && ver.nueva) {
        const version = await fuente.crearEnvioFicha(donanteId, {
          organo_key: cfg.clave,
          valores: inst.valores,
          editados: editadosTexto(valores),
          incluye: { campos: Object.keys(inst.valores), estudios: inst.estudios },
          creado_por: quien,
          estado: "descargado",
        });
        final = { ...armada, version };
        setEnvios(await fuente.cargarEnviosFicha(donanteId, cfg.clave));
      }
      const { generarPdfFicha } = await import("./ficha-pdf");
      const b = await generarPdfFicha(final, jpegs);
      descargarBlob(b, nombreArchivo(`${final.pd.replace(/\s/g, "_")}_ficha_${cfg.etiqueta}_v${final.version}`, "pdf"));
      const adjuntos = final.imagenes.filter((i) => i.enPdf).length;
      await fuente.registrarEnLinea(donanteId, lineaAccionFicha("descargó", final, adjuntos, editadosTexto(valores), quien, reloj()));
      await recargar();
      setAviso(envios === null ? `PDF v${final.version} descargado. La versión no se guardó: falta aplicar handoff/ficha_envios.sql.` : `PDF v${final.version} descargado.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo descargar el PDF.");
    } finally {
      setOcupado(false);
    }
  }

  async function copiar() {
    setError(null);
    setAviso(null);
    const quien = await asegurarNombre();
    if (!quien) return;
    try {
      await copiarTexto(textoFicha(armada));
      await fuente.registrarEnLinea(donanteId, lineaAccionFicha("copió el texto de", armada, 0, editadosTexto(valores), quien, reloj()));
      await recargar();
      setAviso("Texto copiado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo copiar.");
    }
  }

  const tildar = (k: string, v: boolean) => setTildes((x) => ({ ...x, [k]: v }));

  return (
    <div className={styles.fondoPanel} onClick={onCerrar}>
      <div className={styles.fichaModal} role="dialog" aria-label={`Ficha ${cfg.etiqueta}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.fichaModalCab}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dataUrlOrgano(cfg.clave, cfg.color, 26)} alt="" width={26} height={26} />
          <span style={{ fontSize: 17, fontWeight: 600 }}>
            Distribución · Ficha para el equipo ({ficha.nombreEquipo}, {armada.prueba ? "PRUEBA · " : ""}
            {armada.pd})
          </span>
          <span className={`${styles.chico} ${styles.mu}`} style={{ flex: 1 }}>
            Tildás qué va, editás valores si algo cambió y ves el PDF tal cual sale.
          </span>
          <button type="button" className={styles.btnCab} onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>
        {error && (
          <div className={styles.error} role="alert" style={{ margin: "0 16px" }}>
            {error}
          </div>
        )}

        <div className={styles.fichaColumnas}>
          {/* ---------------------------------------------- 1 */}
          <section className={styles.fichaCol}>
            <div className={styles.fichaColTitulo}>1 · Qué se incluye y valores</div>
            <div className={`${styles.chico} ${styles.mu}`} style={{ padding: "0 14px 6px" }}>
              Tocá un valor para editarlo. Los calculados se recalculan solos.
            </div>
            {valores.map((v) => (
              <FilaCampo key={v.campo.clave} v={v} tildado={!!tildes[v.campo.clave]} onTildar={(x) => tildar(v.campo.clave, x)} onGuardar={(t) => guardarEdicion(v.campo, t)} />
            ))}

            <div className={styles.fichaTitulo} style={{ paddingTop: 12 }}>
              Imágenes y estudios cargados
            </div>
            {co.estudios.length === 0 && co.faltanEstudios.length === 0 && <div className={`${styles.chico} ${styles.mu}`} style={{ padding: "0 14px" }}>Sin estudios para este órgano.</div>}
            {co.estudios.map((e) => (
              <label key={e.id} className={styles.fichaEstudio}>
                <input type="checkbox" checked={!!tildes[`est:${e.id}`]} onChange={(x) => tildar(`est:${e.id}`, x.target.checked)} />
                {e.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.video ? rutaMiniaturaVideo(e.url) : e.url} alt="" className={styles.fichaMiniatura} />
                ) : (
                  <span className={styles.fichaMiniatura} />
                )}
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 600 }}>
                    {e.etiqueta} · {horaTexto(e.en, ahora)}
                  </span>
                  <span className={`${styles.chico} ${styles.mu}`}>{e.video ? "video: va como enlace aparte (no pesa el PDF)" : "va en el PDF como imagen (JPEG comprimido)"}</span>
                </span>
                <span className={styles.fichaChip}>{e.video ? "enlace" : "en el PDF"}</span>
              </label>
            ))}
            {co.faltanEstudios.map((f) => (
              <label key={f.clave} className={styles.fichaEstudio}>
                <input type="checkbox" checked={!!tildes[`falta:${f.clave}`]} onChange={(x) => tildar(`falta:${f.clave}`, x.target.checked)} />
                <span className={styles.fichaMiniatura} style={{ background: "transparent", border: 0 }} />
                <span style={{ color: COLOR.a }}>{f.etiqueta} — no cargada {tildes[`falta:${f.clave}`] ? "(sale como Pendiente)" : ""}</span>
              </label>
            ))}
            <div className={styles.fichaAvisoImagen}>
              <strong>Antes de enviar imágenes o video:</strong> revisá que no muestren nombre ni DNI. Se pide confirmar una vez por envío.
            </div>
          </section>

          {/* ---------------------------------------------- 2 */}
          <section className={styles.fichaColPdf}>
            <div className={styles.fichaColTitulo} style={{ display: "flex", justifyContent: "space-between" }}>
              <span>2 · Vista previa del PDF (es lo que se envía)</span>
              <span className={`${styles.chico} ${styles.mu}`} style={{ fontWeight: 400 }}>
                {generando ? "generando…" : pdfBlob ? `${Math.round(pdfBlob.size / 1024)} KB` : ""}
              </span>
            </div>
            <VistaPdf blob={pdfBlob} />
          </section>

          {/* ---------------------------------------------- 3 */}
          <section className={styles.fichaCol}>
            <div className={styles.fichaColTitulo}>3 · Compartir</div>
            <div style={{ padding: "0 14px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div className={styles.fichaVersion}>
                <strong>Versión {ver.version}</strong>{" "}
                <span className={styles.mu}>
                  {envios === undefined
                    ? "cargando versiones…"
                    : envios === null
                      ? "(las versiones no se guardan: falta aplicar handoff/ficha_envios.sql)"
                      : ver.nueva
                        ? ver.anterior
                          ? `· nueva: cambia respecto de la v${ver.anterior.version}`
                          : "· primera versión"
                        : "· igual a la ya descargada"}
                </span>
              </div>
              <button type="button" className={styles.fichaAccion} disabled={ocupado || !pdfBlob} onClick={() => descargar()}>
                <strong>Descargar PDF</strong>
                <span>archivo para guardar o adjuntar a mano</span>
              </button>
              <button type="button" className={styles.fichaAccion} disabled={ocupado} onClick={copiar}>
                <strong>Copiar texto</strong>
                <span>la misma ficha, como texto</span>
              </button>
              {["WhatsApp", "Correo", "Copiar enlace"].map((x) => (
                <button key={x} type="button" className={styles.fichaAccion} disabled title="Etapa 2: envío por enlace seguro">
                  <strong>{x}</strong>
                  <span>disponible con el envío por enlace (Etapa 2)</span>
                </button>
              ))}
              {pidiendoConfirmacion && (
                <div className={styles.avisoImagen} role="alertdialog" style={{ display: "flex" }}>
                  <span>{AVISO_IMAGENES}</span>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnChico} ${styles.btnAcento}`}
                    onClick={() => {
                      setConfirmadoImagenes(true);
                      setPidiendoConfirmacion(null);
                      void descargar(true);
                    }}
                  >
                    Revisé: continuar
                  </button>
                  <button type="button" className={`${styles.btn} ${styles.btnChico}`} onClick={() => setPidiendoConfirmacion(null)}>
                    Cancelar
                  </button>
                </div>
              )}
              {aviso && <div className={styles.chico}>{aviso}</div>}
              <div className={styles.fichaNota}>
                Cada descarga o copia queda en la línea de tiempo: quién, cuándo, equipo, versión y valores editados. Un valor editado vive solo en la ficha: el
                registro clínico no cambia. Si algo cambia, la próxima descarga es una versión nueva y el PDF marca qué cambió.
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------- una fila editable
function FilaCampo({ v, tildado, onTildar, onGuardar }: { v: ValorCampo; tildado: boolean; onTildar: (x: boolean) => void; onGuardar: (t: string) => Promise<string | null> }) {
  const c = v.campo;
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const bloqueado = !!c.calculo || c.informativo;
  const mostrado = v.aVerificar ? "a verificar" : (v.valor ?? (c.calculo === "pafi" && v.nota ? "no se calcula" : "pendiente"));
  const ambar = !!v.editado || v.aVerificar || v.valor === null;

  async function guardar() {
    setGuardando(true);
    const e = await onGuardar(texto);
    setGuardando(false);
    if (e) return setError(e);
    setError(null);
    setEditando(false);
  }

  return (
    <div className={styles.fichaFila}>
      <input type="checkbox" checked={tildado} onChange={(e) => onTildar(e.target.checked)} aria-label={`Incluir ${c.etiqueta}`} />
      <span className={styles.fichaFilaEtiqueta} style={{ color: v.valor === null && !c.calculo ? COLOR.a : undefined }}>
        {c.etiqueta}
        {v.editado && <span className={styles.fichaAntes}>editado · antes {v.editado.antes ?? "sin dato"}</span>}
        {c.calculo === "pafi" && <span className={styles.fichaAntes} style={{ color: COLOR.mu }}>{v.nota ?? "calculada: se edita la PaO₂ o la FiO₂"}</span>}
        {c.calculo === "bloqueado" && <span className={styles.fichaAntes} style={{ color: COLOR.mu }}>calculado: no se edita en la ficha</span>}
      </span>
      {editando ? (
        <span className={styles.fichaEditor}>
          <input
            ref={ref}
            autoFocus
            className={styles.campoC}
            inputMode={c.tipo === "texto" ? "text" : "decimal"}
            placeholder={c.tipo === "fio2" ? "0,21 – 1" : undefined}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void guardar();
              if (e.key === "Escape") setEditando(false);
            }}
            aria-label={`Editar ${c.etiqueta}`}
          />
          <button type="button" className={styles.btnCab} disabled={guardando} onClick={guardar} aria-label="Guardar">
            ✓
          </button>
          <button type="button" className={styles.btnCab} onClick={() => setEditando(false)} aria-label="Cancelar">
            ✕
          </button>
        </span>
      ) : (
        <button
          type="button"
          className={`${styles.fichaValor} ${ambar ? styles.fichaValorAmbar : ""}`}
          disabled={bloqueado}
          title={bloqueado ? (c.calculo ? "Calculado: no se edita a mano" : "Informativo") : "Editar (solo en la ficha; el registro clínico no cambia)"}
          onClick={() => {
            setTexto(v.editado ? v.valor ?? "" : c.original ?? "");
            setError(null);
            setEditando(true);
          }}
        >
          <span>
            {mostrado}
            {v.valor !== null && !v.aVerificar && c.unidad ? ` ${c.unidad}` : ""}
          </span>
          <span aria-hidden>{bloqueado ? "🔒" : "✎"}</span>
        </button>
      )}
      {error && <span className={styles.fichaError}>{error}</span>}
    </div>
  );
}

// ------------------------------------------------------- vista previa: el PDF real
function VistaPdf({ blob }: { blob: Blob | null }) {
  const caja = useRef<HTMLDivElement>(null);
  const [paginas, setPaginas] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!blob || !caja.current) return;
    let vivo = true;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
        if (!vivo || !caja.current) return;
        const ancho = caja.current.clientWidth - 2;
        const lienzos: HTMLCanvasElement[] = [];
        for (let n = 1; n <= doc.numPages; n++) {
          const pag = await doc.getPage(n);
          const base = pag.getViewport({ scale: 1 });
          const escala = (ancho / base.width) * (window.devicePixelRatio || 1);
          const vp = pag.getViewport({ scale: escala });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(vp.width);
          canvas.height = Math.floor(vp.height);
          canvas.style.width = `${ancho}px`;
          canvas.className = styles.fichaPagina;
          await pag.render({ canvas, viewport: vp }).promise;
          lienzos.push(canvas);
        }
        if (!vivo || !caja.current) return;
        caja.current.replaceChildren(...lienzos);
        setPaginas(doc.numPages);
        setError(null);
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : "No se pudo mostrar el PDF.");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [blob]);
  return (
    <div className={styles.fichaPdfMarco}>
      {error && <div className={styles.error}>{error}</div>}
      <div ref={caja} aria-label={`Vista previa del PDF${paginas ? `, ${paginas} página${paginas === 1 ? "" : "s"}` : ""}`} />
      {!blob && <div className={`${styles.chico} ${styles.mu}`}>Generando el PDF…</div>}
    </div>
  );
}
