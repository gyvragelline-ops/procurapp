"use client";

import { useState } from "react";
import localFont from "next/font/local";
import type { Donante } from "@/lib/procuracion/types";
import type { ConfigMantenimiento, RegistroMantenimiento } from "@/lib/procuracion/mantenimiento";
import type { ValorLaboratorio } from "@/lib/procuracion/laboratorio-valores";
import {
  avisosDeEnfermeria,
  balancePorHora,
  calcularDiuresis,
  colorDe,
  disfuncionMiocardica,
  dosisPorFila,
  evaluarDiabetesInsipida,
  evaluarVolemia,
  indiceCardiaco,
  minutosDesdeUltimoRegistro,
  ordenarPorHora,
  pafiConRespirador,
  ultimoLabConRespaldo,
  ultimoValorLab,
  ultimoValorMedico,
  type BombaHora,
  type EstadoBombas,
  type EventoRespirador,
  type InfusionFila,
  type MedicionMedico,
  type Punto,
} from "@/lib/procuracion/mantenimiento-calculos";
import {
  alertasFueraDeRango,
  bandaMeta,
  cambioEnVentana,
  heroeRitmoDiuretico,
  numFijo,
  serieHoraria,
  tarjetaTendencia,
  textoVacio,
  type Tarjeta,
} from "@/lib/procuracion/mantenimiento-tendencias";
import { generarSugerencias, type Sugerencia } from "@/lib/procuracion/mantenimiento-sugerencias";
import { lineasCultivosMedico, type Cultivo } from "@/lib/procuracion/cultivos-calculos";
import { tensionesEntreReglas } from "@/lib/procuracion/mantenimiento-tensiones";
import {
  CAMBIO_MINIMO_FLECHA,
  EJE_Y,
  LEYENDA_VERIFICACION,
  META_RITMO_DIURETICO,
  MINUTOS_ALARMA_SIN_REGISTRO,
  VENTANA_TENDENCIA_INICIAL_H,
  VENTANAS_TENDENCIA_H,
  type ClaveMeta,
  type ClaveTendencia,
} from "@/lib/procuracion/mantenimiento-metas";
import { BarrasHora, COLOR_GRAFICO, Sparkline } from "./mantenimiento-graficos";
import DatosDelMedico from "./mantenimiento-datos-medico";
import MantenimientoInfusiones from "./mantenimiento-infusiones";
import { PedirPeso, hora, num } from "./mantenimiento-ui";
import styles from "./mantenimiento-medico.module.css";

// IBM Plex Sans guardada en el repositorio (sin descarga en el build).
const plexSans = localFont({ src: "./fonts/ibm-plex-sans-latin-var.woff2", weight: "400 600", variable: "--font-plex-sans", display: "swap" });

const CLASE_COLOR = { verde: styles.ok, amarillo: styles.fuera, rojo: styles.critico, sin_dato: styles.sinDato } as const;

// Las 6 tarjetas de tendencia (orden del diseño).
const TARJETAS: { clave: ClaveTendencia; meta: ClaveMeta; nombre: string; unidad: string; dec: number }[] = [
  { clave: "pam", meta: "pam", nombre: "PAM", unidad: "mmHg", dec: 0 },
  { clave: "fc", meta: "fc", nombre: "FC", unidad: "lpm", dec: 0 },
  { clave: "temperatura", meta: "temperatura", nombre: "Temperatura", unidad: "°C", dec: 1 },
  { clave: "sat_o2", meta: "sat_o2", nombre: "Saturación", unidad: "%", dec: 0 },
  { clave: "glucemia", meta: "glucemia", nombre: "Glucemia", unidad: "mg/dL", dec: 0 },
  { clave: "noradrenalina", meta: "noradrenalina", nombre: "Noradrenalina", unidad: "γ", dec: 2 },
];

// Vista del MÉDICO: pantalla de análisis. Lee lo que carga enfermería
// (fuente única) y lo analiza; el médico carga poco (respirador,
// laboratorio, evaluación clínica). Alarmas y sugerencias por reglas
// fijas. Diseño para celular (390 px), tema oscuro propio.
export default function MantenimientoMedico({
  donante,
  registros,
  infusiones,
  bombas,
  lab,
  respirador,
  mediciones,
  config,
  estado,
  ahora,
  cultivos = [],
  onIrACultivos,
  onInfusionesChange,
  onLabChange,
  onRespiradorChange,
  onMedicionesChange,
  onCambiarConfig,
  onGuardarPeso,
}: {
  donante: Donante;
  registros: RegistroMantenimiento[];
  infusiones: InfusionFila[];
  bombas: BombaHora[];
  lab: ValorLaboratorio[];
  respirador: EventoRespirador[];
  mediciones: MedicionMedico[];
  config: ConfigMantenimiento | null;
  estado: EstadoBombas;
  ahora: number;
  cultivos?: Cultivo[];
  onIrACultivos?: () => void;
  onInfusionesChange: (f: InfusionFila[]) => void;
  onLabChange: (v: ValorLaboratorio[]) => void;
  onRespiradorChange: (e: EventoRespirador[]) => void;
  onMedicionesChange: (m: MedicionMedico[]) => void;
  onCambiarConfig: (c: Partial<Omit<ConfigMantenimiento, "donante_id">>) => void;
  onGuardarPeso: (pesoKg: number) => Promise<void>;
}) {
  const [ventana, setVentana] = useState<number>(VENTANA_TENDENCIA_INICIAL_H);

  // ------------------------------------------------------------ datos
  const peso = donante.peso;
  const vigentes = ordenarPorHora(registros.filter((r) => !r.anulado));
  const ultimo = vigentes[vigentes.length - 1] ?? null;
  const diuresis = calcularDiuresis(registros, peso);
  const nora = estado.noradrenalina;
  const labDe = (p: string) => ultimoValorLab(lab, p, ahora);
  const na = labDe("na");
  const glu = labDe("glucemia");
  const ph = labDe("ph");
  const pafi = pafiConRespirador(lab, respirador, registros, ahora);
  const disfuncion = disfuncionMiocardica(mediciones);
  const gc = ultimoValorMedico("gc", mediciones, registros);
  const icMedido = ultimoValorMedico("ic_medido", mediciones, registros);
  const ic = indiceCardiaco(icMedido?.valor ?? null, gc?.valor ?? null, peso, donante.talla);

  // ------------------------------------------------------------ tarjetas de tendencia
  const deRegistros = (campo: "pam" | "fc" | "temperatura" | "sat_o2"): Punto[] =>
    vigentes.filter((r) => r[campo] !== null).map((r) => ({ t: new Date(r.registrado_en).getTime(), valor: r[campo] as number }));
  const puntosDe = (clave: ClaveTendencia): Punto[] => {
    if (clave === "glucemia")
      return lab.filter((v) => v.parametro === "glucemia" && !v.anulado && v.valor !== null).map((v) => ({ t: new Date(v.medido_en).getTime(), valor: v.valor! }));
    if (clave === "noradrenalina") return dosisPorFila("noradrenalina", registros, bombas, infusiones, peso);
    return deRegistros(clave as "pam" | "fc" | "temperatura" | "sat_o2");
  };
  const tarjetas: (Tarjeta & (typeof TARJETAS)[number])[] = TARJETAS.map((t) => ({
    ...t,
    ...tarjetaTendencia({
      clave: t.clave,
      meta: t.meta,
      puntos: puntosDe(t.clave),
      ahora,
      horas: ventana,
      cambioMinimo: CAMBIO_MINIMO_FLECHA[t.clave],
      decimales: t.dec,
      // Dosis de bomba con más de 70 min, o glucemia de laboratorio con más de 6 h.
      desactualizado: t.clave === "noradrenalina" ? (nora?.desactualizado ?? false) : t.clave === "glucemia" ? (glu?.desactualizado ?? false) : false,
    }),
  }));
  const desdeVentana = ahora - ventana * 3_600_000;
  const heroe = heroeRitmoDiuretico(diuresis, ahora, ventana);
  const balance = balancePorHora(registros, bombas, peso, ahora);
  const balanceValores = serieHoraria(
    balance.horas.flatMap((b) => (b.estado === "cargada" ? [{ t: new Date(b.registrado_en).getTime(), valor: b.acumulado }] : [])),
    ahora,
    ventana
  );
  const balanceCambio = cambioEnVentana(balanceValores);

  // ------------------------------------------------------------ reglas
  const osmU = ultimoLabConRespaldo(lab, "osm_urinaria", registros, "osm_urinaria", ahora);
  const osmS = ultimoLabConRespaldo(lab, "osm_serica", registros, "osm_serica", ahora);
  const dens = ultimoLabConRespaldo(lab, "densidad_urinaria", registros, "densidad_urinaria", ahora);
  const di = evaluarDiabetesInsipida({
    diuresis,
    pamUltima: ultimo?.pam ?? null,
    sodio: na?.valor ?? null,
    osmUrinaria: osmU?.valor ?? null,
    densidadUrinaria: dens?.valor ?? null,
    osmSerica: osmS?.valor ?? null,
  });
  const dinamica = (c: "delta_pp" | "delta_vs" | "resultado_pasivo_miembros" | "indice_vena_cava" | "delta_co2_espirado") =>
    ultimoValorMedico(c, mediciones, registros)?.valor ?? null;
  const volemia = evaluarVolemia({
    delta_pp: dinamica("delta_pp"),
    delta_vs: dinamica("delta_vs"),
    resultado_pasivo_miembros: dinamica("resultado_pasivo_miembros"),
    indice_vena_cava: dinamica("indice_vena_cava"),
    delta_co2_espirado: dinamica("delta_co2_espirado"),
  });
  const sugerencias = generarSugerencias({
    pam: ultimo?.pam ?? null,
    fc: ultimo?.fc ?? null,
    noradrenalinaGamma: estado.noradrenalinaGamma,
    noradrenalinaSinDosis:
      nora && estado.noradrenalinaGamma === null
        ? nora.desactualizado
          ? "dato desactualizado"
          : nora.estado === "sin_dilucion"
            ? "sin dilución confirmada"
            : "falta peso"
        : null,
    vasopresinaActiva: estado.vasopresinaActiva,
    disfuncionMiocardica: disfuncion.estado === "si",
    disfuncionEvaluada: disfuncion.estado !== "sin_evaluar",
    ic: ic?.valor ?? null,
    corazonCandidato: config?.corazon_candidato ?? "sin_definir",
    sodio: na?.valor ?? null,
    sodioHaceHoras: na ? (ahora - new Date(na.medido_en).getTime()) / 3_600_000 : null,
    volemia: { cargadas: volemia.cargadas, positivas: volemia.positivas },
    estadoDI: di.estado,
  });
  const tensiones = tensionesEntreReglas({
    estadoDI: di.estado,
    volemiaPositivas: volemia.positivas,
    pafi: pafi && !pafi.desactualizado ? pafi.valor : null,
    pulmonCandidato: config?.pulmon_candidato ?? "sin_definir",
    sodio: na?.valor ?? null,
    glucemia: glu && !glu.desactualizado ? glu.valor : null,
    corazonCandidato: config?.corazon_candidato ?? "sin_definir",
    pam: ultimo?.pam ?? null,
    noradrenalinaGamma: estado.noradrenalinaGamma,
    vasopresinaActiva: estado.vasopresinaActiva,
    balanceAcumulado: balance.horas.length ? balance.acumulado : null,
  });

  // Tarjeta de ALERTAS: solo lo fuera de rango (las 6 tarjetas y el
  // laboratorio reciente: Na, pH, PaFi, glucemia), de más a menos grave.
  // Laboratorio vencido: línea gris aparte.
  const enfermeria = avisosDeEnfermeria(registros, ahora);
  const minutos = minutosDesdeUltimoRegistro(registros, ahora);
  const { alertas, vencidos } = alertasFueraDeRango(
    tarjetas,
    [
      { meta: "sodio", etiqueta: "Na", unidad: "mEq/L", dec: 0, dato: na },
      { meta: "ph", etiqueta: "pH", unidad: "", dec: 2, dato: ph },
      { meta: "pafi", etiqueta: "PaFi", unidad: "", dec: 0, dato: pafi },
      { meta: "glucemia", etiqueta: "Glucemia", unidad: "mg/dL", dec: 0, dato: glu },
    ],
    ahora
  );
  // Cultivos: positivo = línea en ALERTAS; pendiente = línea gris con las
  // horas sin resultado. Tocarlas lleva a la etapa Cultivos.
  const lineasCultivos = lineasCultivosMedico(cultivos, ahora);
  const irA = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el instanceof HTMLDetailsElement) el.open = true;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const horaDato = (s: Sugerencia): string | null =>
    s.datoDe === "sodio" ? (na?.medido_en ?? null) : s.datoDe === "evaluacion" ? (disfuncion.estado !== "sin_evaluar" ? disfuncion.registrado_en : null) : (ultimo?.registrado_en ?? null);

  return (
    <div className={`${styles.medico} ${plexSans.variable}`}>
      {/* ------------------------------------------------ 2. alertas */}
      <section className={styles.tarjeta} aria-label="Alertas">
        <div className={styles.etiqueta}>Alertas</div>
        {alertas.length === 0 && lineasCultivos.alertas.length === 0 ? (
          <div className={styles.ok} style={{ padding: "8px 0" }}>
            ✓ Todo en meta
          </div>
        ) : (
          alertas.map((a) => (
            <button key={a.id} className={`${styles.alerta} ${a.nivel === "rojo" ? styles.critico : styles.fuera}`} onClick={() => irA(a.destino)}>
              <span className={styles.num}>{a.texto}</span>
            </button>
          ))
        )}
        {lineasCultivos.alertas.map((c) => (
          <button key={`cult-${c.id}`} className={`${styles.alerta} ${styles.fuera}`} onClick={onIrACultivos}>
            <span className={styles.num}>{c.texto}</span>
          </button>
        ))}
        {lineasCultivos.pendientes.map((c) => (
          <button key={`cultp-${c.id}`} className={`${styles.alerta} ${styles.apagado} ${styles.chico}`} onClick={onIrACultivos}>
            {c.texto}
          </button>
        ))}
        {vencidos.map((v) => (
          <button key={v.id} className={`${styles.alerta} ${styles.apagado} ${styles.chico}`} onClick={() => irA(v.destino)}>
            {v.texto}
          </button>
        ))}
        {enfermeria.nota && (
          <div className={styles.chico} style={{ marginTop: 6 }}>
            <span className={styles.apagado}>
              Enfermería <span className={styles.num}>{hora(enfermeria.nota.registrado_en)}</span>:
            </span>{" "}
            {enfermeria.nota.texto}
          </div>
        )}
        {!peso && <PedirPeso onGuardar={onGuardarPeso} />}
      </section>

      {/* ------------------------------------------------ 3. ventana */}
      <div className={styles.selector} style={{ margin: "4px 0 10px" }}>
        {VENTANAS_TENDENCIA_H.map((h) => (
          <button key={h} aria-pressed={ventana === h} onClick={() => setVentana(h)}>
            {h} h
          </button>
        ))}
        <span className={`${styles.chico} ${styles.apagado}`} style={{ marginLeft: "auto" }}>
          último dato <span className={styles.num}>{ultimo ? hora(ultimo.registrado_en) : "—"}</span>
          {minutos !== null && minutos > MINUTOS_ALARMA_SIN_REGISTRO ? <span className={styles.critico}> · hace más de 1 h</span> : null}
        </span>
      </div>

      {/* ------------------------------------------------ 4. héroe */}
      <section className={styles.tarjeta} aria-label="Ritmo diurético">
        <div className={styles.etiqueta}>Ritmo diurético</div>
        {heroe.vacio ? (
          <div className={styles.apagado} style={{ padding: "12px 0" }}>
            {heroe.vacio}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span className={styles.valorUnidad}>
                <span className={`${styles.num} ${styles.valorHeroe} ${CLASE_COLOR[colorDe("diuresis", heroe.actual!.valor)]}`}>
                  {numFijo(heroe.actual!.valor, 1)}
                </span>
                <span className={styles.apagado}>mL/kg/h</span>
              </span>
              {heroe.textoDireccion && <span style={{ fontWeight: 600 }}>{heroe.textoDireccion}</span>}
              {heroe.textoInicio && <span className={`${styles.num} ${styles.chico} ${styles.apagado}`}>{heroe.textoInicio}</span>}
            </div>
            <div style={{ marginTop: 8 }}>
              <BarrasHora barras={heroe.barras} clave="diuresis" meta={META_RITMO_DIURETICO} />
            </div>
            <div className={`${styles.chico} ${styles.apagado}`} style={{ marginTop: 4 }}>
              {heroe.textoPie} · meta {numFijo(META_RITMO_DIURETICO, 1)} (línea punteada)
            </div>
          </>
        )}
      </section>

      {/* ------------------------------------------------ 5. grilla de tendencias */}
      <div className={styles.grilla}>
        {tarjetas.map((t) => {
          const color = COLOR_GRAFICO[t.color];
          return (
            <section key={t.clave} id={`tarjeta-${t.clave}`} className={styles.tarjeta} style={{ marginBottom: 0 }} aria-label={t.nombre}>
              <div className={styles.etiqueta}>{t.nombre}</div>
              {t.vacio ? (
                <div className={`${styles.chico} ${styles.apagado}`} style={{ padding: "10px 0" }}>
                  {textoVacio(ventana)}
                </div>
              ) : (
                <>
                  <div className={`${styles.valorUnidad} ${CLASE_COLOR[t.color]}`}>
                    <span className={`${styles.num} ${styles.valorGrande}`}>{numFijo(t.ultimo!.valor, t.dec)}</span>
                    <span className={styles.chico}>{t.unidad}</span>
                  </div>
                  {t.desactualizado ? (
                    <div className={`${styles.chico} ${styles.apagado}`}>
                      {t.clave === "noradrenalina" ? "Dato desactualizado (más de 70 min)" : "Dato desactualizado (más de 6 h)"}
                    </div>
                  ) : (
                    <div className={`${styles.chico} ${t.enMeta ? styles.ok : styles.fuera}`}>
                      {t.enMeta ? "✓" : "✕"} {t.estado}
                    </div>
                  )}
                  <Sparkline
                    valores={t.valores}
                    clave={t.clave}
                    banda={bandaMeta(t.meta, EJE_Y[t.clave])}
                    color={color}
                    desde={desdeVentana}
                    hasta={ahora}
                    etiqueta={t.nombre}
                  />
                  {t.chip && <span className={`${styles.chip} ${styles.num}`}>{t.chip}</span>}
                </>
              )}
            </section>
          );
        })}
      </div>

      {/* ------------------------------------------------ 6. balance acumulado */}
      <section className={styles.tarjeta} style={{ marginTop: 10 }} aria-label="Balance acumulado">
        <div className={styles.etiqueta}>Balance acumulado</div>
        {balance.horas.length === 0 ? (
          <div className={styles.apagado} style={{ padding: "10px 0" }}>
            {textoVacio(ventana)}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span className={`${styles.num} ${styles.valorGrande}`}>
                {balance.acumulado > 0 ? "+" : balance.acumulado < 0 ? "−" : ""}
                {num(Math.abs(balance.acumulado), 0)} mL
              </span>
              {balanceCambio !== null && (
                <span className={`${styles.chip} ${styles.num}`}>
                  {balanceCambio > 0 ? "↑ +" : balanceCambio < 0 ? "↓ −" : "→ "}
                  {num(Math.abs(balanceCambio), 0)} en {ventana} h
                </span>
              )}
            </div>
            <Sparkline
              valores={balanceValores}
              clave="balance"
              banda={null}
              color="var(--m-acento)"
              desde={desdeVentana}
              hasta={ahora}
              ancho={340}
              etiqueta="Balance acumulado"
            />
            {balance.huecos > 0 && (
              <div className={`${styles.chico} ${styles.apagado}`}>
                {balance.huecos === 1 ? "falta 1 hora intermedia" : `faltan ${balance.huecos} horas intermedias`}
              </div>
            )}
          </>
        )}
      </section>

      {/* ------------------------------------------------ 7. sugerencias activas */}
      <div className={styles.etiqueta} style={{ margin: "14px 0 6px" }}>
        Sugerencias activas
      </div>
      {sugerencias.length === 0 && tensiones.length === 0 && <div className={`${styles.chico} ${styles.apagado}`}>Sin sugerencias activas.</div>}
      {sugerencias.map((s) => {
        const h = horaDato(s);
        return (
          <section key={s.id} className={styles.tarjeta} aria-label={s.titulo}>
            <div className={styles.etiqueta}>
              <span className={s.nivel === "rojo" ? styles.critico : s.nivel === "amarillo" ? styles.fuera : styles.apagado}>
                {s.nivel === "rojo" ? "✕" : s.nivel === "amarillo" ? "!" : "·"}
              </span>{" "}
              {s.area}
            </div>
            <div style={{ fontWeight: 600, margin: "2px 0 4px" }}>{s.titulo}</div>
            {s.lineas.map((l, i) => (
              <div key={i} className={styles.chico}>
                {l}
              </div>
            ))}
            {s.notas?.map((n, i) => (
              <div key={`n${i}`} className={`${styles.chico} ${n.destacada ? styles.fuera : styles.apagado}`}>
                {n.texto}
                {n.destacada ? " (más de 6 h)" : ""}
              </div>
            ))}
            <div className={`${styles.chico} ${styles.apagado}`} style={{ marginTop: 6 }}>
              {LEYENDA_VERIFICACION.replace(".", "")}
              {h ? (
                <>
                  {" "}
                  · dato de las <span className={styles.num}>{hora(h)}</span>
                </>
              ) : null}
            </div>
          </section>
        );
      })}
      {tensiones.map((t) => (
        <section key={t.id} className={`${styles.tarjeta} ${styles.tension}`} aria-label={t.titulo}>
          <div className={styles.etiqueta}>Tensión · a criterio médico</div>
          <div style={{ fontWeight: 600, margin: "2px 0 4px" }}>{t.titulo}</div>
          {t.lados.map((l, i) => (
            <div key={i} className={styles.chico}>
              {i === 0 ? "◐" : "◑"} {l}
            </div>
          ))}
          {t.notas.map((n, i) => (
            <div key={`n${i}`} className={styles.chico}>
              {n}
            </div>
          ))}
        </section>
      ))}

      {/* ------------------------------------------------ 8. datos del médico */}
      <div className={styles.etiqueta} style={{ margin: "14px 0 6px" }}>
        Datos del médico
      </div>
      <DatosDelMedico
        donanteId={donante.id}
        respirador={respirador}
        mediciones={mediciones}
        registros={registros}
        config={config}
        lab={lab}
        pafi={pafi}
        ahora={ahora}
        onRespiradorChange={onRespiradorChange}
        onMedicionesChange={onMedicionesChange}
        onCambiarConfig={onCambiarConfig}
        onLabChange={onLabChange}
      />
      <details className={styles.tarjeta}>
        <summary className={styles.etiqueta}>Bombas y bolos (solo lectura)</summary>
        <MantenimientoInfusiones pesoKg={peso} donanteId={donante.id} infusiones={infusiones} estado={estado} onInfusionesChange={onInfusionesChange} />
      </details>

      {/* ------------------------------------------------ 9. pie */}
      <div className={`${styles.chico} ${styles.apagado}`} style={{ textAlign: "center", marginTop: 14 }}>
        Referencia general; la decisión clínica es del equipo médico.
      </div>
    </div>
  );
}
