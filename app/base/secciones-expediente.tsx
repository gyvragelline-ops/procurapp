"use client";

import { useRef, useState, type ReactNode } from "react";
import type { ExpedienteDatos, FuenteBase } from "@/lib/procuracion/base-armado";
import type { EtapaBarra } from "@/lib/procuracion/base-tablero";
import {
  ORGANOS_BASE,
  autorizacionVigente,
  grillaMantenimiento,
  identificacionCorta,
  organosVigentes,
  revisionesVigentes,
  seccionComunicacion,
  seccionCultivos,
  seccionDocumentacion,
  seccionImagenes,
  seccionJudicial,
  seccionLaboratorios,
  seccionMantenimiento,
  seccionMedidas,
  seccionMetodos,
  seccionMuestras,
  seccionNeurologico,
  seccionPotencial,
  seccionQuirofano,
  textoLineaAccion,
  type ContenidoSeccion,
  type FilaGrilla,
} from "@/lib/procuracion/base-secciones";
import { ANESTESISTA, MEDIOS_AVISO, ORGANOS_EQUIPO, validarEquipo, validarHora, type Anestesista, type MedioAviso, type OrganoEquipo } from "@/lib/procuracion/quirofano-calculos";
import SeccionTarjeta, { ContenidoVista, type Acciones } from "./seccion";
import { svgAPng, nombreArchivo } from "./compartir";
import { COLOR, dosCifras, horaCorta, hhmm, leerNombre } from "./ui";
import styles from "./base.module.css";

const quien = () => leerNombre().trim();

// ------------------------------------------------- 11 gráfica simple
// Colores fijos (no variables de tema) para poder exportarla como PNG.
function GraficoLinea({ titulo, unidad, puntos, color, desde, hasta }: { titulo: string; unidad: string; puntos: { t: number; v: number }[]; color: string; desde: number; hasta: number }) {
  const W = 360;
  const H = 120;
  const pad = { l: 34, r: 8, t: 22, b: 18 };
  const vs = puntos.map((p) => p.v);
  const min = vs.length ? Math.min(...vs) : 0;
  const max = vs.length ? Math.max(...vs) : 1;
  const rango = max - min || Math.max(1, Math.abs(max) * 0.1);
  const x = (t: number) => pad.l + ((t - desde) / Math.max(1, hasta - desde)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - (min - rango * 0.1)) / (rango * 1.2)) * (H - pad.t - pad.b);
  const ultimo = puntos[puntos.length - 1];
  const fmt = (v: number) => String(Math.round(v * 100) / 100).replace(".", ",");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ background: "#fff", border: "1px solid #E7EDEF", borderRadius: 8 }} data-grafica={titulo}>
      <rect x="0" y="0" width={W} height={H} fill="#fff" />
      <text x={pad.l} y={14} fontSize="12" fontFamily="sans-serif" fontWeight="600" fill="#1B2A2E">
        {titulo} ({unidad}){ultimo ? ` · último ${fmt(ultimo.v)} a las ${hhmm(new Date(ultimo.t).toISOString())}` : " · sin datos"}
      </text>
      {vs.length > 0 && (
        <>
          <text x={2} y={y(max) + 4} fontSize="10" fontFamily="sans-serif" fill="#5E7378">
            {fmt(max)}
          </text>
          <text x={2} y={y(min) + 4} fontSize="10" fontFamily="sans-serif" fill="#5E7378">
            {fmt(min)}
          </text>
        </>
      )}
      <text x={pad.l} y={H - 4} fontSize="10" fontFamily="sans-serif" fill="#5E7378">
        {hhmm(new Date(desde).toISOString())}
      </text>
      <text x={W - pad.r} y={H - 4} fontSize="10" fontFamily="sans-serif" fill="#5E7378" textAnchor="end">
        {hhmm(new Date(hasta).toISOString())}
      </text>
      {puntos.length > 1 && <polyline fill="none" stroke={color} strokeWidth="2" points={puntos.map((p) => `${x(p.t)},${y(p.v)}`).join(" ")} />}
      {puntos.map((p, i) => (
        <circle key={i} cx={x(p.t)} cy={y(p.v)} r="2.5" fill={color} />
      ))}
    </svg>
  );
}

const ID_GRAFICAS = "graficas-mantenimiento";

function MantenimientoVivo({ grilla, ahora, idGraficas }: { grilla: FilaGrilla[]; ahora: number; idGraficas?: string }) {
  const desde = ahora - 12 * 3_600_000;
  const serie = (f: (x: FilaGrilla) => number | null) => grilla.flatMap((x) => (f(x) === null ? [] : [{ t: new Date(x.en).getTime(), v: f(x)! }]));
  const nora = (x: FilaGrilla) => x.drogas.find((d) => d.droga === "Noradrenalina")?.dosis ?? null;
  const n = (v: number | null, dec = 0) => (v === null ? "—" : v.toFixed(dec).replace(".", ","));
  return (
    <div>
      <div className={`${styles.chico} ${styles.mu}`} style={{ padding: "6px 16px 0" }}>
        Hoja de enfermería, hora a hora (últimas 12 h). «—» = sin cargar en esa hora.
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className={styles.grilla}>
          <thead>
            <tr>
              <th>Hora</th>
              <th>TAM</th>
              <th>FC</th>
              <th>T °C</th>
              <th>SatO2 %</th>
              <th>Diuresis mL</th>
              <th>Glucemia</th>
              <th style={{ textAlign: "left" }}>Vasoactivos</th>
            </tr>
          </thead>
          <tbody>
            {grilla.length === 0 && (
              <tr>
                <td colSpan={8} className={styles.mu}>
                  Sin registros de enfermería en las últimas 12 h.
                </td>
              </tr>
            )}
            {[...grilla].reverse().map((x) => (
              <tr key={x.en}>
                <td className={styles.num}>{horaCorta(x.en, ahora)}</td>
                <td className={styles.num}>{n(x.tam)}</td>
                <td className={styles.num}>{n(x.fc)}</td>
                <td className={styles.num}>{n(x.temperatura, 1)}</td>
                <td className={styles.num}>{n(x.sat)}</td>
                <td className={styles.num}>{n(x.diuresis)}</td>
                <td className={styles.num}>{n(x.glucemia)}</td>
                <td style={{ textAlign: "left", whiteSpace: "normal" }} className={styles.chico}>
                  {x.drogas.map((d) => `${d.droga} ${d.dosis === null ? "" : `${n(d.dosis, 2)} ${d.unidad} · `}${n(d.mlh, 1)} mL/h`).join(" · ") || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div id={idGraficas} style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, padding: "10px 16px" }}>
        <GraficoLinea titulo="TAM" unidad="mmHg" puntos={serie((x) => x.tam)} color="#0F8F83" desde={desde} hasta={ahora} />
        <GraficoLinea titulo="FC" unidad="lpm" puntos={serie((x) => x.fc)} color="#C8402F" desde={desde} hasta={ahora} />
        <GraficoLinea titulo="Diuresis" unidad="mL" puntos={serie((x) => x.diuresis)} color="#1F9D6B" desde={desde} hasta={ahora} />
        <GraficoLinea titulo="Noradrenalina" unidad="mcg/kg/min" puntos={serie(nora)} color="#C98512" desde={desde} hasta={ahora} />
      </div>
    </div>
  );
}

// ------------------------------------------------- 12 judicial (Base)
function ControlesJudicial({ datos, fuente, donanteId, accion, numero }: { datos: ExpedienteDatos; fuente: FuenteBase; donanteId: string; accion: (fn: () => Promise<void>, linea: string) => Promise<void>; numero: string }) {
  const vigente = autorizacionVigente(datos.autorizacionJudicial ?? []);
  const disponible = datos.autorizacionJudicial !== null;
  const ref = useRef<HTMLInputElement>(null);
  const linea = (t: string) => `Base · ${quien() || "sin nombre"} · ${t} (${numero} Intervención judicial, ${hhmm(new Date().toISOString())})`;
  return (
    <div className={`${styles.cardFila} ${styles.renglon} ${styles.noImprimir}`}>
      <span style={{ fontWeight: 600 }}>Autorizado:</span>
      {[true, false].map((v) => (
        <button
          key={String(v)}
          type="button"
          className={`${styles.chip} ${vigente?.autorizado === v ? styles.chipActivo : ""}`}
          disabled={!disponible}
          onClick={() => accion(() => fuente.marcarAutorizacion(donanteId, v, quien() || null, vigente?.id ?? null), linea(`marcó autorizado: ${v ? "sí" : "no"}`))}
        >
          {v ? "Sí" : "No"}
        </button>
      ))}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void accion(() => fuente.subirFotoJudicial(donanteId, f), linea("subió la foto de la autorización del juez"));
        }}
      />
      <button type="button" className={`${styles.btn} ${styles.btnChico}`} onClick={() => ref.current?.click()}>
        Subir foto de la autorización del juez
      </button>
      {!disponible && <span className={`${styles.chico} ${styles.mu}`}>marca no disponible (falta el SQL)</span>}
    </div>
  );
}

// ------------------------------------- 13 órganos y quirófano (Base)
function ControlesQuirofano({ datos, fuente, donanteId, accion, numero }: { datos: ExpedienteDatos; fuente: FuenteBase; donanteId: string; accion: (fn: () => Promise<void>, linea: string) => Promise<void>; numero: string }) {
  const marcas = organosVigentes(datos.organosAceptados ?? []);
  const equipos = datos.equipos.filter((e) => !e.anulado);
  const [equipoDe, setEquipoDe] = useState<Record<string, string>>({});
  const [hora, setHora] = useState("");
  const [nuevo, setNuevo] = useState(false);
  const [nombre, setNombre] = useState("");
  const [organos, setOrganos] = useState<OrganoEquipo[]>([]);
  const [anest, setAnest] = useState<Anestesista | null>(null);
  const [medio, setMedio] = useState<MedioAviso | null>(null);
  const [error, setError] = useState<string | null>(null);
  const disponible = datos.organosAceptados !== null;
  const linea = (t: string) => `Base · ${quien() || "sin nombre"} · ${t} (${numero} Órganos y quirófano, ${hhmm(new Date().toISOString())})`;

  return (
    <div className={styles.noImprimir}>
      <div className={styles.cardFila} style={{ fontWeight: 600 }}>
        Marcar órganos (Base)
      </div>
      {ORGANOS_BASE.map((o) => {
        const m = marcas.get(o.valor);
        const eq = equipoDe[o.valor] ?? m?.equipo_id ?? "";
        return (
          <div key={o.valor} className={`${styles.cardFila} ${styles.renglon}`}>
            <span style={{ width: 90, fontWeight: 600 }}>{o.etiqueta}</span>
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                className={`${styles.chip} ${m?.aceptado === v ? styles.chipActivo : ""}`}
                disabled={!disponible}
                onClick={() =>
                  accion(
                    () => fuente.marcarOrgano(donanteId, o.valor, v, eq || null, quien() || null, m?.id ?? null),
                    linea(`marcó ${o.etiqueta}: ${v ? "aceptado" : "no aceptado"}${eq ? ` (${equipos.find((e) => e.id === eq)?.equipo ?? ""})` : ""}`)
                  )
                }
              >
                {v ? "Aceptado" : "No aceptado"}
              </button>
            ))}
            <select className={styles.campo} style={{ width: 220, minHeight: 36 }} aria-label={`Equipo de ${o.etiqueta}`} value={eq} onChange={(e) => setEquipoDe((x) => ({ ...x, [o.valor]: e.target.value }))}>
              <option value="">(equipo)</option>
              {equipos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.equipo}
                </option>
              ))}
            </select>
          </div>
        );
      })}
      {!disponible && <div className={`${styles.cardFila} ${styles.mu}`}>Marca de órganos no disponible (falta el SQL).</div>}

      <div className={`${styles.cardFila} ${styles.renglon}`}>
        <span style={{ fontWeight: 600 }}>Hora de quirófano:</span>
        <input type="datetime-local" className={styles.campo} style={{ width: 220, minHeight: 36 }} value={hora} onChange={(e) => setHora(e.target.value)} aria-label="Hora de quirófano" />
        <button
          type="button"
          className={`${styles.btn} ${styles.btnChico}`}
          onClick={() => {
            const v = validarHora(hora ? new Date(hora).toISOString() : null);
            if (!v.ok) return setError(v.error);
            setError(null);
            void accion(() => fuente.guardarHoraQuirofano(donanteId, v.hora), linea(`cargó hora de quirófano ${hora.replace("T", " ")}`)).then(() => setHora(""));
          }}
        >
          Guardar hora
        </button>
      </div>

      <div className={styles.cardFila}>
        {!nuevo ? (
          <button type="button" className={`${styles.btn} ${styles.btnChico}`} onClick={() => setNuevo(true)}>
            + Equipo avisado
          </button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input className={styles.campo} maxLength={80} placeholder="Equipo (nombre)" value={nombre} onChange={(e) => setNombre(e.target.value)} aria-label="Equipo" />
            <div className={styles.renglon}>
              {ORGANOS_EQUIPO.filter((o) => o.valor !== "otro").map((o) => (
                <button key={o.valor} type="button" className={`${styles.chip} ${organos.includes(o.valor) ? styles.chipActivo : ""}`} onClick={() => setOrganos((xs) => (xs.includes(o.valor) ? xs.filter((x) => x !== o.valor) : [...xs, o.valor]))}>
                  {o.etiqueta}
                </button>
              ))}
            </div>
            <div className={styles.renglon}>
              <span className={styles.chico}>Anestesista:</span>
              {ANESTESISTA.map((a) => (
                <button key={a.valor} type="button" className={`${styles.chip} ${anest === a.valor ? styles.chipActivo : ""}`} onClick={() => setAnest(a.valor)}>
                  {a.etiqueta}
                </button>
              ))}
              <span className={styles.chico}>Medio:</span>
              <select className={styles.campo} style={{ width: 150, minHeight: 36 }} value={medio ?? ""} onChange={(e) => setMedio((e.target.value || null) as MedioAviso | null)} aria-label="Medio del aviso">
                <option value="">(medio)</option>
                {MEDIOS_AVISO.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.renglon}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnChico} ${styles.btnAcento}`}
                onClick={() => {
                  const v = validarEquipo({ equipo: nombre, organos, organoOtro: "", anestesista: anest, informadoPor: quien() ? `Base (${quien()})` : "Base", medio });
                  if (!v.ok) return setError(v.error);
                  setError(null);
                  void accion(() => fuente.crearEquipo(donanteId, v.datos), linea(`cargó equipo avisado ${v.datos.equipo}`)).then(() => {
                    setNuevo(false);
                    setNombre("");
                    setOrganos([]);
                    setAnest(null);
                    setMedio(null);
                  });
                }}
              >
                Guardar equipo
              </button>
              <button type="button" className={`${styles.btn} ${styles.btnChico}`} onClick={() => setNuevo(false)}>
                Cancelar
              </button>
            </div>
          </div>
        )}
        {error && (
          <div className={styles.error} role="alert" style={{ marginTop: 6 }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------- todas las secciones, en orden
export default function SeccionesExpediente({
  datos,
  barra,
  ahora,
  fuente,
  donanteId,
  recargar,
  sistemasOrdenado,
}: {
  datos: ExpedienteDatos;
  barra: EtapaBarra[];
  ahora: number;
  fuente: FuenteBase;
  donanteId: string;
  recargar: () => Promise<void>;
  sistemasOrdenado: ReactNode; // tarjetas por sistema (Mantenimiento) para "Ver ordenado"
}) {
  const [error, setError] = useState<string | null>(null);
  const ident = identificacionCorta(datos.donante);
  const revisiones = revisionesVigentes(datos.revisiones ?? []);

  async function accion(fn: () => Promise<void>, linea: string) {
    setError(null);
    try {
      await fn();
      await fuente.registrarEnLinea(donanteId, linea);
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    }
  }

  const acciones = (c: ContenidoSeccion, extra?: Partial<Acciones>): Acciones => ({
    revision: revisiones.get(c.clave) ?? null,
    revisionesDisponibles: datos.revisiones !== null,
    onRevisar: () => accion(() => fuente.marcarRevision(donanteId, c.clave, quien() || null), textoLineaAccion("marcó revisada", c, quien(), Date.now())),
    onQuitarRevision: (id) => accion(() => fuente.anularRevision(id), textoLineaAccion("quitó la marca de revisada", c, quien(), Date.now())),
    onRegistrar: async (a, detalle) => {
      try {
        await fuente.registrarEnLinea(donanteId, textoLineaAccion(a, c, quien(), Date.now(), detalle));
        await recargar();
      } catch (e) {
        setError(e instanceof Error ? `Se ${a === "copió" ? "copió" : "compartió"}, pero no se pudo registrar en la línea de tiempo: ${e.message}` : "No se pudo registrar.");
      }
    },
    ...extra,
  });

  const tarjeta = (c: ContenidoSeccion, opciones: { cuerpo?: ReactNode; ordenado?: ReactNode; extra?: Partial<Acciones> } = {}) => (
    <SeccionTarjeta key={c.clave} c={c} ident={ident} ahora={ahora} acciones={acciones(c, opciones.extra)} cuerpo={opciones.cuerpo} ordenado={opciones.ordenado} />
  );

  const secciones = barra.map((e) => {
    const num = dosCifras(e.numero);
    switch (e.key) {
      case "potencial":
        return tarjeta(seccionPotencial(datos, num));
      case "me":
        return tarjeta(seccionNeurologico(datos, num));
      case "certificacion":
        return tarjeta(seccionMetodos(datos, num));
      case "comMuerte":
      case "comDonacion":
        return tarjeta(seccionComunicacion(datos, num, e.key));
      case "muestras":
        return tarjeta(seccionMuestras(datos, num));
      case "medidas":
        return tarjeta(seccionMedidas(datos, num));
      case "labImagenes":
        return (
          <div key="lab" style={{ display: "contents" }}>
            {tarjeta(seccionLaboratorios(datos, num, ahora))}
            {tarjeta(seccionImagenes(datos, num))}
          </div>
        );
      case "cultivos":
        return tarjeta(seccionCultivos(datos, num));
      case "documentacion":
        return tarjeta(seccionDocumentacion(num));
      case "mantenimiento": {
        const c = seccionMantenimiento(datos, num, ahora);
        const grilla = grillaMantenimiento(datos, ahora);
        return tarjeta(c, {
          cuerpo: (
            <>
              <ContenidoVista c={c} />
              <MantenimientoVivo grilla={grilla} ahora={ahora} idGraficas={ID_GRAFICAS} />
            </>
          ),
          ordenado: (
            <>
              <MantenimientoVivo grilla={grilla} ahora={ahora} />
              <div style={{ padding: "0 16px 16px" }}>{sistemasOrdenado}</div>
            </>
          ),
          extra: {
            // las gráficas van como imagen al compartir (las genera la app: sin aviso)
            archivosExtra: async () => {
              const svgs = [...document.querySelectorAll(`#${ID_GRAFICAS} svg`)] as SVGSVGElement[];
              return Promise.all(svgs.map(async (s) => new File([await svgAPng(s)], nombreArchivo(`${ident}_${s.getAttribute("data-grafica") ?? "grafica"}`, "png"), { type: "image/png" })));
            },
          },
        });
      }
      case "judicial": {
        const c = seccionJudicial(datos, num, ahora);
        return tarjeta(c, {
          cuerpo: (
            <>
              <ContenidoVista c={c} />
              <ControlesJudicial datos={datos} fuente={fuente} donanteId={donanteId} accion={accion} numero={num} />
            </>
          ),
        });
      }
      case "quirofano": {
        const c = seccionQuirofano(datos, num, ahora);
        return tarjeta(c, {
          cuerpo: (
            <>
              <ContenidoVista c={c} />
              <ControlesQuirofano datos={datos} fuente={fuente} donanteId={donanteId} accion={accion} numero={num} />
            </>
          ),
        });
      }
      default:
        return null;
    }
  });

  return (
    <>
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
      {secciones}
    </>
  );
}

export { COLOR };
