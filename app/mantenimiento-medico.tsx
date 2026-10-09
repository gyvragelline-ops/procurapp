"use client";

import type { Donante } from "@/lib/procuracion/types";
import type { ConfigMantenimiento, RegistroMantenimiento } from "@/lib/procuracion/mantenimiento";
import type { ValorLaboratorio } from "@/lib/procuracion/laboratorio-valores";
import {
  alarmasDosis,
  armarAlarmas,
  avisosDeEnfermeria,
  balancePorHora,
  calcularDiuresis,
  colorDe,
  contarFueraDeMeta,
  disfuncionMiocardica,
  dosisPorFila,
  evaluarDiabetesInsipida,
  evaluarVolemia,
  horaMinutos,
  indiceCardiaco,
  minutosDesdeUltimoRegistro,
  ordenarPorHora,
  pafiConRespirador,
  resistenciaVascularSistemica,
  scoreCalidad,
  serieMedico,
  textoHuecos,
  ultimoLabConRespaldo,
  ultimoValorLab,
  ultimoValorMedico,
  type Alarma,
  type BombaHora,
  type Color,
  type EstadoBombas,
  type EventoRespirador,
  type InfusionFila,
  type MedicionMedico,
  type ParametroTablero,
  type Punto,
} from "@/lib/procuracion/mantenimiento-calculos";
import { generarSugerencias } from "@/lib/procuracion/mantenimiento-sugerencias";
import { tensionesEntreReglas } from "@/lib/procuracion/mantenimiento-tensiones";
import {
  HORAS_RESPIRADOR_VIEJO,
  LEYENDA_VERIFICACION,
  METAS,
  MINUTOS_ALARMA_SIN_REGISTRO,
  type ClaveMeta,
  type ClaveTendencia,
} from "@/lib/procuracion/mantenimiento-metas";
import Tendencias, { type SerieTendencia } from "./mantenimiento-tendencias";
import DatosDelMedico from "./mantenimiento-datos-medico";
import MantenimientoInfusiones from "./mantenimiento-infusiones";
import { CHIP_COLOR, COLOR_CSS, PedirPeso, hora, num } from "./mantenimiento-ui";

// Vista del MÉDICO: pantalla de análisis. Enfermería es la única fuente
// de signos, glucemia, líquidos, egresos y bombas; acá se VEN. El médico
// carga pocas cosas, plegadas al final (respirador, laboratorio,
// evaluación clínica, monitoreo avanzado, configuración). De arriba hacia
// abajo: (1) franja de estado, (2) tendencias, (3) sistemas, (4)
// sugerencias y tensiones, (5) datos del médico.
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
  completo,
  onInfusionesChange,
  onLabChange,
  onRespiradorChange,
  onMedicionesChange,
  onCambiarConfig,
  onMarcarCompleto,
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
  completo: boolean;
  onInfusionesChange: (f: InfusionFila[]) => void;
  onLabChange: (v: ValorLaboratorio[]) => void;
  onRespiradorChange: (e: EventoRespirador[]) => void;
  onMedicionesChange: (m: MedicionMedico[]) => void;
  onCambiarConfig: (c: Partial<Omit<ConfigMantenimiento, "donante_id">>) => void;
  onMarcarCompleto: (v: boolean) => void;
  onGuardarPeso: (pesoKg: number) => Promise<void>;
}) {
  // ------------------------------------------------------------ derivados
  const peso = donante.peso;
  const avanzado = config?.monitoreo_avanzado_activo ?? false;
  const vigentes = ordenarPorHora(registros.filter((r) => !r.anulado));
  const ultimo = vigentes[vigentes.length - 1] ?? null;
  const diuresis = calcularDiuresis(registros, peso);
  const ultimaDiuresis = diuresis[diuresis.length - 1] ?? null;
  const inf = estado;
  const nora = inf.noradrenalina;

  const labDe = (p: string) => ultimoValorLab(lab, p, ahora);
  const na = labDe("na");
  const k = labDe("k");
  const glu = labDe("glucemia");
  const ph = labDe("ph");
  const hb = labDe("hb");
  const pafi = pafiConRespirador(lab, respirador, registros, ahora);

  const pvc = ultimoValorMedico("pvc", mediciones, registros);
  const gc = ultimoValorMedico("gc", mediciones, registros);
  const icMedido = ultimoValorMedico("ic_medido", mediciones, registros);
  const ic = indiceCardiaco(icMedido?.valor ?? null, gc?.valor ?? null, peso, donante.talla);
  const rvs = resistenciaVascularSistemica(ultimo?.pam ?? null, pvc?.valor ?? null, gc?.valor ?? null);
  const disfuncion = disfuncionMiocardica(mediciones);

  type Fila = ParametroTablero & { hora: string | null; desactualizado: boolean };
  const fila = (clave: ClaveMeta, valor: number | null, opciones: { hora?: string | null; desactualizado?: boolean; avanzado?: boolean } = {}): Fila => ({
    clave,
    etiqueta: METAS[clave].etiqueta,
    valor,
    color: opciones.desactualizado ? "sin_dato" : colorDe(clave, valor),
    avanzado: opciones.avanzado ?? false,
    hora: opciones.hora ?? null,
    desactualizado: opciones.desactualizado ?? false,
  });

  const sistemas: { titulo: string; filas: Fila[] }[] = [
    {
      titulo: "Hemodinamia",
      filas: [
        fila("fc", ultimo?.fc ?? null, { hora: ultimo?.registrado_en }),
        fila("pam", ultimo?.pam ?? null, { hora: ultimo?.registrado_en }),
        fila("noradrenalina", nora?.estado === "ok" ? nora.dosis!.dosis : null, { hora: nora?.momento, desactualizado: nora?.desactualizado }),
        fila("pvc", pvc?.valor ?? null, { hora: pvc?.registrado_en, avanzado: true }),
        fila("ic", ic?.valor ?? null, { hora: icMedido?.registrado_en ?? gc?.registrado_en, avanzado: true }),
        fila("rvs", rvs, { hora: gc?.registrado_en, avanzado: true }),
      ],
    },
    {
      titulo: "Respiratorio",
      filas: [
        fila("sat_o2", ultimo?.sat_o2 ?? null, { hora: ultimo?.registrado_en }),
        fila("pafi", pafi?.valor ?? null, { hora: pafi?.medido_en, desactualizado: pafi?.desactualizado }),
      ],
    },
    {
      titulo: "Medio interno",
      filas: [
        fila("sodio", na?.valor ?? null, { hora: na?.medido_en, desactualizado: na?.desactualizado }),
        fila("potasio", k?.valor ?? null, { hora: k?.medido_en, desactualizado: k?.desactualizado }),
        fila("glucemia", glu?.valor ?? null, { hora: glu?.medido_en, desactualizado: glu?.desactualizado }),
        fila("ph", ph?.valor ?? null, { hora: ph?.medido_en, desactualizado: ph?.desactualizado }),
      ],
    },
    { titulo: "Temperatura", filas: [fila("temperatura", ultimo?.temperatura ?? null, { hora: ultimo?.registrado_en })] },
  ];
  const filaDiuresis = fila("diuresis", ultimaDiuresis?.mlKgH ?? null, { hora: ultimaDiuresis?.registrado_en });
  const todas = [...sistemas.flatMap((s) => s.filas), filaDiuresis];

  const minutos = minutosDesdeUltimoRegistro(registros, ahora);
  const fueraDeMeta = contarFueraDeMeta(todas, avanzado);
  const score = scoreCalidad({
    glucemia: glu && !glu.desactualizado ? glu.valor : null,
    sodio: na && !na.desactualizado ? na.valor : null,
    ph: ph && !ph.desactualizado ? ph.valor : null,
    pafi: pafi && !pafi.desactualizado ? pafi.valor : null,
  });
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
    noradrenalinaGamma: inf.noradrenalinaGamma,
    noradrenalinaSinDosis:
      nora && inf.noradrenalinaGamma === null
        ? nora.desactualizado
          ? "dato desactualizado"
          : nora.estado === "sin_dilucion"
            ? "sin dilución confirmada"
            : "falta peso"
        : null,
    vasopresinaActiva: inf.vasopresinaActiva,
    disfuncionMiocardica: disfuncion.estado === "si",
    disfuncionEvaluada: disfuncion.estado !== "sin_evaluar",
    ic: ic?.valor ?? null,
    corazonCandidato: config?.corazon_candidato ?? "sin_definir",
    sodio: na?.valor ?? null,
    sodioHaceHoras: na ? (ahora - new Date(na.medido_en).getTime()) / 3_600_000 : null,
    volemia: { cargadas: volemia.cargadas, positivas: volemia.positivas },
    estadoDI: di.estado,
    nutricionPrevia: config?.nutricion_previa ?? null,
  });
  const balance = balancePorHora(registros, bombas, peso, ahora);
  const tensiones = tensionesEntreReglas({
    estadoDI: di.estado,
    volemiaPositivas: volemia.positivas,
    pafi: pafi && !pafi.desactualizado ? pafi.valor : null,
    pulmonCandidato: config?.pulmon_candidato ?? "sin_definir",
    sodio: na?.valor ?? null,
    glucemia: glu && !glu.desactualizado ? glu.valor : null,
    corazonCandidato: config?.corazon_candidato ?? "sin_definir",
    pam: ultimo?.pam ?? null,
    noradrenalinaGamma: inf.noradrenalinaGamma,
    vasopresinaActiva: inf.vasopresinaActiva,
    balanceAcumulado: balance.horas.length ? balance.acumulado : null,
  });

  // Franja de estado: alarmas priorizadas (rojas primero) + avisos de
  // enfermería (uno de cada uno) + aviso de respirador viejo (solo con PaFi).
  const enfermeria = avisosDeEnfermeria(registros, ahora);
  const alarmasTodas: Alarma[] = [
    ...armarAlarmas({ parametros: todas, monitoreoAvanzadoActivo: avanzado, minutosSinRegistro: minutos, estadoDI: di.estado }),
    ...alarmasDosis(inf),
    ...(enfermeria.pendiente ? [{ nivel: "amarillo" as const, texto: enfermeria.pendiente.texto }] : []),
    ...(pafi?.respiradorViejo
      ? [{ nivel: "amarillo" as const, texto: `Respirador: último cambio cargado hace más de ${HORAS_RESPIRADOR_VIEJO} h (revisar la FiO2 de la PaFi).` }]
      : []),
  ];
  const alarmas = [...alarmasTodas.filter((a) => a.nivel === "rojo"), ...alarmasTodas.filter((a) => a.nivel === "amarillo")];

  // Tendencias
  const deRegistros = (campo: "pam" | "fc" | "temperatura" | "sat_o2"): Punto[] =>
    vigentes.filter((r) => r[campo] !== null).map((r) => ({ t: new Date(r.registrado_en).getTime(), valor: r[campo] as number }));
  const banda = (clave: ClaveMeta) => {
    const v = METAS[clave].verde[0];
    return v ? { desde: v.desde, hasta: v.hasta } : null;
  };
  const serie = (clave: ClaveTendencia, etiqueta: string, unidad: string, puntos: Punto[], decimales: number, meta: ClaveMeta | null, sueltos = false): SerieTendencia => ({
    clave,
    etiqueta,
    unidad,
    puntos,
    decimales,
    banda: meta ? banda(meta) : null,
    sueltos,
  });
  const series: SerieTendencia[] = [
    serie("pam", "PAM", "mmHg", deRegistros("pam"), 0, "pam"),
    serie("fc", "FC", "lpm", deRegistros("fc"), 0, "fc"),
    serie("temperatura", "Temperatura", "°C", deRegistros("temperatura"), 1, "temperatura"),
    serie("sat_o2", "Saturación", "%", deRegistros("sat_o2"), 0, "sat_o2"),
    serie(
      "glucemia",
      "Glucemia",
      "mg/dL",
      lab.filter((v) => v.parametro === "glucemia" && !v.anulado && v.valor !== null).map((v) => ({ t: new Date(v.medido_en).getTime(), valor: v.valor! })),
      0,
      "glucemia"
    ),
    serie(
      "diuresis",
      "Diuresis",
      "mL/kg/h",
      diuresis.filter((d) => d.mlKgH !== null).map((d) => ({ t: new Date(d.registrado_en).getTime(), valor: d.mlKgH! })),
      2,
      "diuresis"
    ),
    serie(
      "balance",
      "Balance acumulado",
      "mL",
      balance.horas.flatMap((b) => (b.estado === "cargada" ? [{ t: new Date(b.registrado_en).getTime(), valor: b.acumulado }] : [])),
      0,
      null
    ),
    serie("noradrenalina", "Noradrenalina", "γ", dosisPorFila("noradrenalina", registros, bombas, infusiones, peso), 3, "noradrenalina"),
  ];
  if (avanzado) {
    series.push(serie("pvc", "PVC", "cmH2O", serieMedico("pvc", mediciones, registros), 1, "pvc", true));
    series.push(serie("gc", "Gasto cardíaco", "L/min", serieMedico("gc", mediciones, registros), 1, null, true));
  }

  const chip = (c: Color, texto: string) => <span className={`chip ${CHIP_COLOR[c]}`}>{texto}</span>;
  const avisoDiuresis = (a: string | null | undefined) =>
    a === "intervalo_corto" ? "intervalo corto" : a === "intervalo_largo" ? "intervalo largo, velocidad subestimada" : a === "sin_dato" ? "sin dato" : null;

  return (
    <div>
      {/* ------------------------------------------------ (1) franja de estado */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
        {chip(score.cumplidos === 4 ? "verde" : score.cumplidos >= 2 ? "amarillo" : "rojo", `Score órgano ${score.cumplidos}/4`)}
        {chip(fueraDeMeta === 0 ? "verde" : "amarillo", `${fueraDeMeta} fuera de meta`)}
        {chip(
          minutos === null ? "sin_dato" : minutos > MINUTOS_ALARMA_SIN_REGISTRO ? "rojo" : "verde",
          minutos === null ? "Sin registros de enfermería" : `Último registro ${hora(ultimo!.registrado_en)} (hace ${Math.floor(minutos)} min)`
        )}
        <span className="tiny muted" style={{ alignSelf: "center" }}>
          Vasopresor: {inf.algunVasopresorActivo ? "sí" : "no"} (informativo, fuera del score)
        </span>
      </div>
      <div className="tiny muted" style={{ marginBottom: 6 }}>
        Score: {score.items.map((i) => `${i.etiqueta} ${i.cumple === null ? "sin dato" : i.cumple ? "✓" : "✗"}`).join(" · ")}
      </div>
      {alarmas.map((a, i) => (
        <div key={i} className="tiny" style={{ color: COLOR_CSS[a.nivel], padding: "1px 0" }}>
          ● {a.texto}
        </div>
      ))}
      {enfermeria.nota && (
        <div className="tiny" style={{ marginTop: 2 }}>
          Aviso de enfermería ({hora(enfermeria.nota.registrado_en)}): {enfermeria.nota.texto}
        </div>
      )}
      {config?.nutricion_previa == null && (
        <div style={{ padding: "6px 10px", border: "1px solid var(--amber)", borderRadius: 8, margin: "8px 0" }}>
          <span className="tiny" style={{ marginRight: 8 }}>¿Recibía nutrición antes?</span>
          <button className="btn btn-sm" onClick={() => onCambiarConfig({ nutricion_previa: "si" })}>
            Sí
          </button>{" "}
          <button className="btn btn-sm" onClick={() => onCambiarConfig({ nutricion_previa: "no" })}>
            No
          </button>
        </div>
      )}
      {!peso && <PedirPeso onGuardar={onGuardarPeso} />}

      {/* ------------------------------------------------ (2) tendencias */}
      <div className="section-label" style={{ marginTop: 12 }}>Tendencias</div>
      <Tendencias series={series} ahora={ahora} />

      {/* ------------------------------------------------ (3) sistemas */}
      <div className="section-label" style={{ marginTop: 12 }}>Evaluación por sistemas</div>
      <div style={{ padding: "8px 10px", border: `2px solid ${COLOR_CSS[filaDiuresis.color]}`, borderRadius: 10, marginBottom: 8 }}>
        <div className="tiny" style={{ fontWeight: 600 }}>Diuresis (el parámetro más importante)</div>
        {ultimaDiuresis ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 20, color: COLOR_CSS[filaDiuresis.color] }}>
              {ultimaDiuresis.mlKgH !== null ? `${num(ultimaDiuresis.mlKgH)} mL/kg/h` : "—"}
            </strong>
            <span className="tiny">
              {ultimaDiuresis.mlH !== null ? `${num(ultimaDiuresis.mlH, 0)} mL/h` : ""} · {hora(ultimaDiuresis.registrado_en)}
            </span>
            {avisoDiuresis(ultimaDiuresis.aviso) && <span className="chip chip-amber">{avisoDiuresis(ultimaDiuresis.aviso)}</span>}
          </div>
        ) : (
          <div className="tiny muted">Sin diuresis cargada.</div>
        )}
      </div>
      {sistemas.map((s) => {
        const visibles = s.filas.filter((f) => !f.avanzado || (avanzado && f.valor !== null));
        return (
          <div key={s.titulo} style={{ marginBottom: 8 }}>
            <div className="tiny" style={{ fontWeight: 600 }}>
              {s.titulo}
            </div>
            {visibles.map((f) => (
              <div className="field-row" key={f.clave}>
                <span className="field-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: COLOR_CSS[f.color], display: "inline-block" }} />
                  {f.etiqueta}
                  {f.clave === "ic" && ic ? ` (${ic.origen})` : ""}
                </span>
                <span className="field-value">
                  <span style={{ color: f.desactualizado ? "var(--text-faint)" : undefined }}>
                    {f.valor === null ? "—" : `${num(f.valor, f.clave === "noradrenalina" ? 3 : 2)} ${METAS[f.clave].unidad}`}
                  </span>{" "}
                  <span className="tiny muted">
                    {f.hora ? hora(f.hora) : ""}
                    {f.desactualizado ? " · desactualizado" : ""}
                  </span>
                </span>
              </div>
            ))}
            {s.titulo === "Respiratorio" && pafi && (
              <div className="tiny muted" style={{ textAlign: "right", color: pafi.respiradorViejo ? "var(--amber)" : undefined }}>
                FiO2 {num(pafi.fio2, 0)} %{pafi.peep !== null ? `, PEEP ${num(pafi.peep, 0)}` : ""} de las {horaMinutos(pafi.fio2Desde)}
                {pafi.origen === "registro" ? " (registro viejo)" : pafi.origen === "toma" ? " (cargada con la gasometría)" : ""}
              </div>
            )}
          </div>
        );
      })}
      {hb && (
        <div className="field-row">
          <span className="field-label">Hb</span>
          <span className="field-value" style={{ color: hb.desactualizado ? "var(--text-faint)" : undefined }}>
            {num(hb.valor)} g/dL{" "}
            <span className="tiny muted">
              {hora(hb.medido_en)}
              {hb.desactualizado ? " · desactualizado" : ""}
            </span>
          </span>
        </div>
      )}
      <div className="field-row">
        <span className="field-label">Balance acumulado</span>
        <span className="field-value">
          {num(balance.acumulado, 0)} mL
          {textoHuecos(balance.huecos) && <span className="tiny muted"> · {textoHuecos(balance.huecos)}</span>}
        </span>
      </div>
      <div style={{ marginTop: 6 }}>
        <div className="tiny" style={{ fontWeight: 600 }}>Diabetes insípida</div>
        <div className="tiny">
          {di.estado === "probable" ? chip("rojo", "Probable") : di.estado === "sospecha" ? chip("amarillo", "Sospecha") : chip("verde", "Sin criterios")}{" "}
          {di.motivos.join(" ")}
        </div>
        <div className="tiny muted">
          Osm urinaria {osmU ? `${num(osmU.valor, 0)} (${hora(osmU.medido_en)})` : "—"} · Osm sérica {osmS ? `${num(osmS.valor, 0)} (${hora(osmS.medido_en)})` : "—"} ·
          Densidad {dens ? `${num(dens.valor, 0)} (${hora(dens.medido_en)})` : "—"}
        </div>
      </div>
      <div style={{ marginTop: 6 }}>
        <div className="tiny" style={{ fontWeight: 600 }}>¿Responde a volumen?</div>
        {volemia.cargadas === 0 ? (
          <div className="tiny muted">Sin variables dinámicas cargadas{avanzado ? "." : " (se cargan con el monitoreo avanzado activo)."}</div>
        ) : (
          <>
            <div className="tiny">
              Dinámicas: {volemia.positivas} de {volemia.cargadas} cargadas sugieren respuesta a volumen.
            </div>
            {volemia.detalle.map((d) => (
              <div key={d.clave} className="tiny muted">
                {d.etiqueta}: {num(d.valor)}% — {d.positiva === null ? "sin referencia definida" : d.positiva ? "positiva" : "negativa"}
              </div>
            ))}
          </>
        )}
        <div className="tiny muted" style={{ fontStyle: "italic" }}>{LEYENDA_VERIFICACION}</div>
      </div>

      {/* ------------------------------------------------ (4) sugerencias y tensiones */}
      {(sugerencias.length > 0 || tensiones.length > 0) && (
        <div style={{ marginTop: 12 }}>
          <div className="section-label">Sugerencias (apoyo, no orden)</div>
          {tensiones.map((t) => (
            <div key={t.id} style={{ border: "1px dashed var(--amber)", borderRadius: 8, padding: "6px 8px", margin: "6px 0" }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Tensión: {t.titulo}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {t.lados.map((l, i) => (
                  <div key={i} className="tiny" style={{ flex: "1 1 140px" }}>
                    {l}
                  </div>
                ))}
              </div>
              {t.notas.map((n, i) => (
                <div key={i} className="tiny muted">
                  {n}
                </div>
              ))}
              <div className="tiny muted" style={{ fontStyle: "italic" }}>
                {t.leyenda}
              </div>
            </div>
          ))}
          {sugerencias.map((s) => (
            <div
              key={s.id}
              style={{ borderLeft: `3px solid ${s.nivel === "info" ? "var(--text-faint)" : COLOR_CSS[s.nivel]}`, padding: "4px 8px", margin: "6px 0" }}
            >
              <div style={{ fontWeight: 600, fontSize: 13 }}>{s.titulo}</div>
              {s.lineas.map((l, i) => (
                <div key={i} className="tiny">
                  {l}
                </div>
              ))}
              {s.notas?.map((n, i) => (
                <div key={`n${i}`} className="tiny" style={n.destacada ? { color: "var(--amber)", fontWeight: 700 } : { color: "var(--text-faint)" }}>
                  {n.texto}
                  {n.destacada ? " (más de 6 h)" : ""}
                </div>
              ))}
              <div className="tiny muted" style={{ fontStyle: "italic" }}>
                {s.leyenda}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ------------------------------------------------ (5) datos del médico */}
      <details style={{ marginTop: 14 }}>
        <summary className="section-label">Datos del médico</summary>
        <DatosDelMedico
          donanteId={donante.id}
          respirador={respirador}
          mediciones={mediciones}
          registros={registros}
          config={config}
          lab={lab}
          onRespiradorChange={onRespiradorChange}
          onMedicionesChange={onMedicionesChange}
          onCambiarConfig={onCambiarConfig}
          onLabChange={onLabChange}
        />
      </details>
      <details style={{ marginTop: 8 }}>
        <summary className="section-label">Bombas y bolos (solo lectura)</summary>
        <MantenimientoInfusiones pesoKg={peso} donanteId={donante.id} infusiones={infusiones} estado={inf} onInfusionesChange={onInfusionesChange} />
      </details>

      <div className="field-row" style={{ marginTop: 14 }}>
        <span className="field-label">Mantenimiento</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button className={`btn btn-sm ${completo ? "btn-accent" : ""}`} onClick={() => onMarcarCompleto(true)}>
            Marcar como completo
          </button>
          <button className={`btn btn-sm ${!completo ? "btn-accent" : ""}`} onClick={() => onMarcarCompleto(false)}>
            Marcar como pendiente
          </button>
        </div>
      </div>
    </div>
  );
}
