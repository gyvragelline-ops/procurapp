"use client";

import { useEffect, useMemo, useState } from "react";
import type { ExpedienteDatos, FuenteBase } from "@/lib/procuracion/base-armado";
import { horaTexto, identificacionCorta } from "@/lib/procuracion/base-secciones";
import {
  SIMBOLO,
  datosHastaFicha,
  eleccionInicial,
  fichasDistribucion,
  lineaEnvioFicha,
  mensajeFicha,
  type EleccionFicha,
  type EnvioFicha,
  type Evaluado,
  type FichaOrgano,
  type Marca,
} from "@/lib/procuracion/distribucion";
import { dataUrlOrgano } from "@/lib/procuracion/organos-svg";
import { abrirWhatsApp, compartir, copiarTexto, descargarBlob, nombreArchivo, puedeCompartir } from "./compartir";
import { imagenCabeceraFicha } from "./imagen-ficha";
import { useNombre } from "./nombre-base";
import { COLOR } from "./ui";
import styles from "./base.module.css";

// Distribución por órgano (solo Base; diseño handoff/disenos/
// Base-Expediente-Compacto y Base-Ficha-Organo). Requisitos en
// lib/procuracion/distribucion-requisitos.ts (A VALIDAR CON PROTOCOLO
// CUCAIBA/INCUCAI). Se manda SOLO lo tildado; los tildes no se guardan.
// Cada envío deja su línea en la línea de tiempo (con nombre).

const COLOR_MARCA: Record<Marca, string> = { listo: COLOR.g, falta: COLOR.r, info: COLOR.a };
const COLOR_ESTADO = { g: COLOR.g, a: COLOR.a, r: COLOR.r, mu: "#8EA0A4" } as const;

// hora real del envío (no la de la pantalla)
const horaDelEnvio = () => Date.now();

type Envio = (f: FichaOrgano, e: EleccionFicha, texto: string, accion: "copiar" | "imagen" | "whatsapp") => Promise<string | null>;

export default function DistribucionOrganos({ datos, fuente, donanteId, ahora, recargar }: { datos: ExpedienteDatos; fuente: FuenteBase; donanteId: string; ahora: number; recargar: () => Promise<void> }) {
  const fichas = useMemo(() => fichasDistribucion(datos, ahora), [datos, ahora]);
  const [editando, setEditando] = useState<string | null>(null);
  const [msj, setMsj] = useState<{ organo: string; texto: string } | null>(null);
  const asegurarNombre = useNombre();
  const ident = identificacionCorta(datos.donante);
  const pd = identificacionCorta({ ...datos.donante, es_prueba: false });
  const esPrueba = datos.donante.es_prueba === true;

  const imagen = (f: FichaOrgano, e: EleccionFicha) => {
    const h = datosHastaFicha(f, e);
    return imagenCabeceraFicha({ cfg: f.cfg, equipo: f.nombreEquipo, pd, esPrueba, datosHasta: h ? horaTexto(h, ahora) : null });
  };

  // Copiar, descargar la imagen o enviar: primero el nombre; después la
  // acción y su línea en la línea de tiempo. Devuelve un aviso o null.
  async function enviar(f: FichaOrgano, e: EleccionFicha, texto: string, accion: "copiar" | "imagen" | "whatsapp"): Promise<string | null> {
    const quien = await asegurarNombre();
    if (!quien) return null;
    let tipo: EnvioFicha;
    let adjuntos = 0;
    let aviso: string | null = null;
    if (accion === "copiar") {
      await copiarTexto(texto);
      tipo = "copió";
      aviso = "Texto copiado.";
    } else if (accion === "imagen") {
      descargarBlob(await imagen(f, e), nombreArchivo(`${pd}_ficha_${f.cfg.etiqueta}`, "png"));
      tipo = "descargó la imagen de";
      adjuntos = 1;
    } else {
      const archivo = new File([await imagen(f, e)], nombreArchivo(`${pd}_ficha_${f.cfg.etiqueta}`, "png"), { type: "image/png" });
      tipo = "envió por WhatsApp";
      if (puedeCompartir([archivo])) {
        // celular: compartir del navegador, con el texto y la imagen
        const r = await compartir(texto, [archivo]);
        if (r !== "compartido") return r === "cancelado" ? null : "Este navegador no pudo compartir.";
        adjuntos = 1;
      } else {
        // computadora: WhatsApp (Web) con el texto; la imagen se descarga aparte
        abrirWhatsApp(texto);
        aviso = "Se abrió WhatsApp con el texto. La imagen no va: si la querés, «Descargar imagen» y arrastrala al chat.";
      }
    }
    await fuente.registrarEnLinea(donanteId, lineaEnvioFicha(tipo, f, adjuntos, quien, horaDelEnvio()));
    await recargar();
    return aviso;
  }

  const ficha = fichas.find((f) => f.cfg.clave === editando) ?? null;
  return (
    <div className={styles.cardC}>
      <div className={styles.cabDistribucion}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Distribución por órgano</span>
        <span className={styles.soloBaseChip}>Solo Base</span>
        <span className={`${styles.chico} ${styles.mu}`}>Lo que pide cada equipo, cruzado con lo cargado. Editás la ficha y la mandás por WhatsApp.</span>
      </div>
      <div className={styles.organos}>
        {fichas.map((f) => (
          <div key={f.cfg.clave} className={styles.organo}>
            <div className={styles.organoCab}>
              <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={dataUrlOrgano(f.cfg.clave, f.cfg.color, 24)} alt="" width={24} height={24} style={{ flex: "none" }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>{f.cfg.etiqueta}</span>
              </span>
              <span className={styles.organoEstado} style={{ color: COLOR_ESTADO[f.estado.color] }} title={f.estado.texto}>
                {f.estado.texto}
              </span>
            </div>
            {f.requisitos.map((r) => (
              <FilaRequisito key={r.clave} r={r} />
            ))}
            <div className={styles.organoPie}>
              <span style={{ fontSize: 11, fontWeight: 600, color: f.listos === f.total ? COLOR.g : COLOR.a }}>
                {f.listos} de {f.total} listos
              </span>
              <span style={{ display: "flex", gap: 5 }}>
                <button type="button" className={styles.btnCab} onClick={() => setEditando(f.cfg.clave)}>
                  Editar ficha
                </button>
                <button
                  type="button"
                  className={styles.btnWhatsApp}
                  title="Manda la ficha como está (todo lo tildado de entrada)"
                  onClick={async () => {
                    setMsj(null);
                    try {
                      const e = eleccionInicial(f);
                      const a = await enviar(f, e, mensajeFicha(f, e, ident, ahora), "whatsapp");
                      if (a) setMsj({ organo: f.cfg.clave, texto: a });
                    } catch (err) {
                      setMsj({ organo: f.cfg.clave, texto: err instanceof Error ? err.message : "No se pudo enviar." });
                    }
                  }}
                >
                  WhatsApp
                </button>
              </span>
            </div>
            {msj?.organo === f.cfg.clave && <div className={`${styles.chico} ${styles.mu}`} style={{ padding: "0 10px 8px" }}>{msj.texto}</div>}
          </div>
        ))}
      </div>
      {ficha && <PanelFicha key={ficha.cfg.clave} f={ficha} ident={ident} ahora={ahora} imagen={imagen} enviar={enviar} onCerrar={() => setEditando(null)} />}
    </div>
  );
}

function FilaRequisito({ r }: { r: Evaluado }) {
  return (
    <div className={styles.filaRequisito} title={r.nota ?? undefined}>
      <span style={{ color: COLOR_MARCA[r.marca], fontWeight: 700 }}>{SIMBOLO[r.marca]}</span>
      <span>{r.etiqueta}</span>
      <span className={styles.num} style={{ color: r.marca === "falta" ? COLOR.r : COLOR.mu, fontSize: 10.5, textAlign: "right" }}>
        {r.valor}
      </span>
    </div>
  );
}

// ------------------------------------------------------- Editar ficha
function PanelFicha({
  f,
  ident,
  ahora,
  imagen,
  enviar,
  onCerrar,
}: {
  f: FichaOrgano;
  ident: string;
  ahora: number;
  imagen: (f: FichaOrgano, e: EleccionFicha) => Promise<Blob>;
  enviar: Envio;
  onCerrar: () => void;
}) {
  const [e, setE] = useState<EleccionFicha>(() => eleccionInicial(f));
  const generado = mensajeFicha(f, e, ident, ahora);
  // El texto es editable. Si la Base lo editó, los tildes ya no lo pisan.
  const [editado, setEditado] = useState<string | null>(null);
  const texto = editado ?? generado;
  const [completar, setCompletar] = useState<Record<string, boolean>>({});
  const [vista, setVista] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const hasta = datosHastaFicha(f, e);
  useEffect(() => {
    let url: string | null = null;
    let vivo = true;
    imagen(f, e)
      .then((b) => {
        if (!vivo) return;
        url = URL.createObjectURL(b);
        setVista(url);
      })
      .catch(() => setVista(null));
    return () => {
      vivo = false;
      if (url) URL.revokeObjectURL(url);
    };
    // la imagen cambia solo con el equipo o la hora de los datos
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.cfg.clave, f.nombreEquipo, hasta]);

  const tildar = (clave: string, v: boolean) => setE((x) => ({ ...x, tildes: { ...x.tildes, [clave]: v } }));
  const escribir = (clave: string, v: string) => setE((x) => ({ ...x, textos: { ...x.textos, [clave]: v } }));

  async function hacer(accion: "copiar" | "imagen" | "whatsapp") {
    setAviso(null);
    setOcupado(true);
    try {
      setAviso(await enviar(f, e, texto, accion));
    } catch (err) {
      setAviso(err instanceof Error ? err.message : "No se pudo.");
    } finally {
      setOcupado(false);
    }
  }

  const fila = (r: Evaluado) => {
    const conCampo = r.tipo === "texto" || completar[r.clave];
    return (
      <div key={r.clave}>
        <label className={styles.filaFicha}>
          <input type="checkbox" checked={!!e.tildes[r.clave]} onChange={(ev) => tildar(r.clave, ev.target.checked)} />
          <span style={{ color: r.marca === "falta" && !e.textos[r.clave]?.trim() ? "#8A5A00" : COLOR.tx }}>
            <span style={{ color: COLOR_MARCA[r.marca], fontWeight: 700, marginRight: 6 }}>{SIMBOLO[r.marca]}</span>
            {r.etiqueta}
          </span>
          <span className={styles.num} style={{ fontSize: 11.5, color: r.marca === "falta" ? COLOR.a : COLOR.mu, textAlign: "right" }}>
            {r.marca === "falta" && e.tildes[r.clave] && !e.textos[r.clave]?.trim() ? "pendiente" : r.valor}
            {r.tipo !== "comun" && r.tipo !== "texto" && !completar[r.clave] && (
              <button type="button" className={styles.enlace} style={{ marginLeft: 6, fontSize: 11 }} onClick={(ev) => (ev.preventDefault(), setCompletar((x) => ({ ...x, [r.clave]: true })))}>
                ✎
              </button>
            )}
          </span>
        </label>
        {conCampo && (
          <div style={{ padding: "0 14px 4px 40px" }}>
            <input
              className={styles.campoC}
              maxLength={300}
              placeholder={r.tipo === "texto" ? "Escribilo acá (sale en el mensaje; no se guarda)" : "Agregar o completar (sale en el mensaje; no se guarda)"}
              aria-label={`Texto para ${r.etiqueta}`}
              value={e.textos[r.clave] ?? ""}
              onChange={(ev) => escribir(r.clave, ev.target.value)}
            />
          </div>
        )}
        {r.nota && <div className={`${styles.chico} ${styles.mu}`} style={{ padding: "0 14px 3px 40px", fontSize: 11 }}>{r.nota}</div>}
      </div>
    );
  };

  return (
    <div className={styles.fondoPanel} onClick={onCerrar}>
      <aside className={styles.panelLateral} style={{ width: "min(560px, 94vw)" }} role="dialog" aria-label={`Ficha ${f.cfg.etiqueta}`} onClick={(ev) => ev.stopPropagation()}>
        <div className={styles.fichaCab}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dataUrlOrgano(f.cfg.clave, f.cfg.color, 30)} alt="" width={30} height={30} />
          <span style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>Ficha · {f.nombreEquipo}</span>
          <span className={`${styles.chico} ${styles.mu}`}>{f.estado.texto}</span>
          <button type="button" className={styles.btnCab} onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className={styles.fichaTitulo}>Qué se incluye (tildá o destildá)</div>
        {fila(f.donante)}
        {f.requisitos.map(fila)}
        {fila(f.quirofano)}

        <div className={styles.fichaTitulo} style={{ display: "flex", justifyContent: "space-between", paddingTop: 12 }}>
          <span>Así se ve en WhatsApp</span>
          <span style={{ textTransform: "none", letterSpacing: 0, color: COLOR.tx, fontWeight: 600 }}>Texto editable ✎</span>
        </div>
        <div className={styles.vistaWhatsApp}>
          <div className={styles.burbujaWhatsApp}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {vista ? <img src={vista} alt={`Cabecera: ${f.nombreEquipo}`} style={{ width: "100%", display: "block" }} /> : <div style={{ height: 100 }} />}
            <textarea
              className={styles.textoWhatsApp}
              value={texto}
              aria-label="Texto del mensaje"
              rows={Math.min(22, texto.split("\n").length + 1)}
              onChange={(ev) => setEditado(ev.target.value)}
            />
          </div>
        </div>
        {editado !== null && editado !== generado && (
          <div className={`${styles.chico}`} style={{ padding: "6px 14px 0", color: COLOR.a }}>
            Editaste el texto: los cambios de tildes ya no se aplican.{" "}
            <button type="button" className={styles.enlace} onClick={() => setEditado(null)}>
              Volver a generarlo
            </button>
          </div>
        )}

        <div className={styles.renglon} style={{ padding: "12px 14px", gap: 8 }}>
          <button type="button" className={styles.btn} disabled={ocupado} onClick={() => hacer("copiar")}>
            Copiar texto
          </button>
          <button type="button" className={styles.btn} disabled={ocupado} onClick={() => hacer("imagen")}>
            Descargar imagen
          </button>
          <button type="button" className={styles.btnWhatsAppGrande} disabled={ocupado} onClick={() => hacer("whatsapp")}>
            Enviar por WhatsApp
          </button>
        </div>
        {aviso && <div className={`${styles.chico}`} style={{ padding: "0 14px 8px" }}>{aviso}</div>}
        <div className={`${styles.chico} ${styles.mu}`} style={{ padding: "0 14px 16px", lineHeight: 1.4 }}>
          Cada envío queda en la línea de tiempo: quién, hora, equipo y adjuntos. Se manda solo lo tildado; lo tildado que falta sale como «Pendiente». No incluye nombre ni DNI. Los tildes y
          lo escrito no se guardan. Requisitos a validar con el protocolo CUCAIBA/INCUCAI.
        </div>
      </aside>
    </div>
  );
}
