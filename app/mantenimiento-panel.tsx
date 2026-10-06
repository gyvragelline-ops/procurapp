"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Donante } from "@/lib/procuracion/types";
import {
  cargarMantenimiento,
  guardarConfig,
  guardarPesoDonante,
  marcarMantenimientoCompleto,
  type ConfigMantenimiento,
  type RegistroMantenimiento,
} from "@/lib/procuracion/mantenimiento";
import { cargarLaboratorioValores, type ValorLaboratorio } from "@/lib/procuracion/laboratorio-valores";
import {
  armarAlarmas,
  calcularBalance,
  calcularDiuresis,
  colorDe,
  contarFueraDeMeta,
  estadoInfusiones,
  evaluarDiabetesInsipida,
  evaluarVolemia,
  indiceCardiaco,
  minutosDesdeUltimoRegistro,
  ordenarPorHora,
  resistenciaVascularSistemica,
  scoreCalidad,
  tendencia,
  ultimaPafi,
  ultimoValorLab,
  type Color,
  type InfusionFila,
  type ParametroTablero,
} from "@/lib/procuracion/mantenimiento-calculos";
import { generarSugerencias } from "@/lib/procuracion/mantenimiento-sugerencias";
import { LEYENDA_VERIFICACION, METAS, MINUTOS_ALARMA_SIN_REGISTRO, REGISTROS_TENDENCIA, type ClaveMeta } from "@/lib/procuracion/mantenimiento-metas";
import MantenimientoRegistros from "./mantenimiento-registros";
import MantenimientoLaboratorio from "./mantenimiento-laboratorio";
import MantenimientoInfusiones from "./mantenimiento-infusiones";
import { CHIP_COLOR, COLOR_CSS, ErrorVisible, MiniTendencia, PedirPeso, hora, num } from "./mantenimiento-ui";

const supabase = createClient();

// Panel de Mantenimiento (etapa 09): apoyo a la decisión para sostener
// perfusión y oxigenación. Tablero por sistemas verde/amarillo/rojo,
// alarmas y sugerencias por reglas fijas (sin IA) -- todo como referencia
// general, a verificar con protocolo. Números en mantenimiento-metas.ts.
export default function MantenimientoPanel({
  donante,
  onDonanteChange,
  completo,
  onCompletoChange,
}: {
  donante: Donante;
  onDonanteChange: (d: Donante) => void;
  completo: boolean;
  onCompletoChange: (v: boolean) => void;
}) {
  const [registros, setRegistros] = useState<RegistroMantenimiento[]>([]);
  const [infusiones, setInfusiones] = useState<InfusionFila[]>([]);
  const [config, setConfig] = useState<ConfigMantenimiento | null>(null);
  const [lab, setLab] = useState<ValorLaboratorio[]>([]);
  const [cargado, setCargado] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    let vivo = true;
    Promise.all([cargarMantenimiento(supabase, donante.id), cargarLaboratorioValores(supabase, donante.id)])
      .then(([m, l]) => {
        if (!vivo) return;
        setRegistros(m.registros);
        setInfusiones(m.infusiones);
        setConfig(m.config);
        setLab(l);
        setErrorCarga(null);
        setCargado(true);
      })
      .catch((e) => {
        if (vivo) setErrorCarga(e instanceof Error ? e.message : "No se pudieron cargar los datos.");
      });
    return () => {
      vivo = false;
    };
  }, [donante.id]);

  // "Ahora" se refresca cada minuto: alarma de registro viejo y datos de
  // laboratorio desactualizados.
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  async function cambiarConfig(cambios: Partial<Omit<ConfigMantenimiento, "donante_id">>) {
    setError(null);
    try {
      setConfig(await guardarConfig(supabase, donante.id, cambios));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la configuración.");
    }
  }

  async function guardarPeso(pesoKg: number) {
    onDonanteChange(await guardarPesoDonante(supabase, donante.id, pesoKg));
  }

  async function marcarCompleto(v: boolean) {
    setError(null);
    try {
      await marcarMantenimientoCompleto(supabase, donante.id, v);
      onCompletoChange(v);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo marcar.");
    }
  }

  if (errorCarga) return <ErrorVisible mensaje={errorCarga} />;
  if (!cargado) return <div className="tiny muted">Cargando Mantenimiento…</div>;

  // ------------------------------------------------------------ derivados
  const peso = donante.peso;
  const avanzado = config?.monitoreo_avanzado_activo ?? false;
  const vigentes = ordenarPorHora(registros.filter((r) => !r.anulado));
  const ultimo = vigentes[vigentes.length - 1] ?? null;
  const diuresis = calcularDiuresis(registros, peso);
  const ultimaDiuresis = diuresis[diuresis.length - 1] ?? null;
  const inf = estadoInfusiones(infusiones);

  const labDe = (p: string) => ultimoValorLab(lab, p, ahora);
  const na = labDe("na");
  const k = labDe("k");
  const glu = labDe("glucemia");
  const ph = labDe("ph");
  const hb = labDe("hb");
  const pafi = ultimaPafi(lab, ahora);

  const ic = ultimo ? indiceCardiaco(ultimo.ic_medido, ultimo.gc, peso, donante.talla) : null;
  const rvs = ultimo ? resistenciaVascularSistemica(ultimo.pam, ultimo.pvc, ultimo.gc) : null;

  type Fila = ParametroTablero & { hora: string | null; desactualizado: boolean; tendencia: number[] };
  const fila = (
    clave: ClaveMeta,
    valor: number | null,
    opciones: { hora?: string | null; desactualizado?: boolean; tendencia?: number[]; avanzado?: boolean } = {}
  ): Fila => ({
    clave,
    etiqueta: METAS[clave].etiqueta,
    valor,
    // Laboratorio de más de 6 h: gris "desactualizado", sin color.
    color: opciones.desactualizado ? "sin_dato" : colorDe(clave, valor),
    avanzado: opciones.avanzado ?? false,
    hora: opciones.hora ?? null,
    desactualizado: opciones.desactualizado ?? false,
    tendencia: opciones.tendencia ?? [],
  });
  const tend = (campo: keyof RegistroMantenimiento) =>
    tendencia(registros, (r) => r[campo] as number | null, REGISTROS_TENDENCIA).map((p) => p.valor);

  const sistemas: { titulo: string; filas: Fila[] }[] = [
    {
      titulo: "Hemodinamia",
      filas: [
        fila("fc", ultimo?.fc ?? null, { hora: ultimo?.registrado_en, tendencia: tend("fc") }),
        fila("pam", ultimo?.pam ?? null, { hora: ultimo?.registrado_en, tendencia: tend("pam") }),
        fila("noradrenalina", inf.noradrenalinaGamma, { hora: inf.porDroga.noradrenalina?.registrado_en }),
        fila("pvc", ultimo?.pvc ?? null, { hora: ultimo?.registrado_en, tendencia: tend("pvc"), avanzado: true }),
        fila("ic", ic?.valor ?? null, { hora: ultimo?.registrado_en, avanzado: true }),
        fila("rvs", rvs, { hora: ultimo?.registrado_en, avanzado: true }),
      ],
    },
    {
      titulo: "Respiratorio",
      filas: [fila("pafi", pafi?.valor ?? null, { hora: pafi?.medido_en, desactualizado: pafi?.desactualizado })],
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
    {
      titulo: "Temperatura",
      filas: [fila("temperatura", ultimo?.temperatura ?? null, { hora: ultimo?.registrado_en, tendencia: tend("temperatura") })],
    },
  ];
  const filaDiuresis = fila("diuresis", ultimaDiuresis?.mlKgH ?? null, {
    hora: ultimaDiuresis?.registrado_en,
    tendencia: diuresis.map((d) => d.mlKgH).filter((x): x is number => x !== null).slice(-REGISTROS_TENDENCIA),
  });
  const todas = [...sistemas.flatMap((s) => s.filas), filaDiuresis];

  const minutos = minutosDesdeUltimoRegistro(registros, ahora);
  const fueraDeMeta = contarFueraDeMeta(todas, avanzado);
  const score = scoreCalidad({
    glucemia: glu && !glu.desactualizado ? glu.valor : null,
    sodio: na && !na.desactualizado ? na.valor : null,
    ph: ph && !ph.desactualizado ? ph.valor : null,
    pafi: pafi && !pafi.desactualizado ? pafi.valor : null,
  });
  const di = evaluarDiabetesInsipida({
    diuresis,
    pamUltima: ultimo?.pam ?? null,
    sodio: na?.valor ?? null,
    osmUrinaria: ultimo?.osm_urinaria ?? null,
    densidadUrinaria: ultimo?.densidad_urinaria ?? null,
    osmSerica: ultimo?.osm_serica ?? null,
  });
  const alarmas = armarAlarmas({ parametros: todas, monitoreoAvanzadoActivo: avanzado, minutosSinRegistro: minutos, estadoDI: di.estado });
  const volemia = ultimo
    ? evaluarVolemia({
        delta_pp: ultimo.delta_pp,
        delta_vs: ultimo.delta_vs,
        resultado_pasivo_miembros: ultimo.resultado_pasivo_miembros,
        indice_vena_cava: ultimo.indice_vena_cava,
        delta_co2_espirado: ultimo.delta_co2_espirado,
      })
    : { cargadas: 0, positivas: 0, detalle: [] };
  const sugerencias = generarSugerencias({
    pam: ultimo?.pam ?? null,
    fc: ultimo?.fc ?? null,
    noradrenalinaGamma: inf.noradrenalinaGamma,
    vasopresinaActiva: inf.vasopresinaActiva,
    disfuncionMiocardica: ultimo?.disfuncion_miocardica ?? false,
    ic: ic?.valor ?? null,
    corazonCandidato: config?.corazon_candidato ?? "sin_definir",
    sodio: na?.valor ?? null,
    volemia: { cargadas: volemia.cargadas, positivas: volemia.positivas },
    estadoDI: di.estado,
    nutricionPrevia: config?.nutricion_previa ?? null,
  });
  const balance = calcularBalance(registros);

  const chip = (c: Color, texto: string) => <span className={`chip ${CHIP_COLOR[c]}`}>{texto}</span>;
  const avisoDiuresis = (a: string | null | undefined) =>
    a === "intervalo_corto" ? "intervalo corto" : a === "intervalo_largo" ? "intervalo largo, velocidad subestimada" : a === "sin_dato" ? "sin dato" : null;

  return (
    <div>
      <ErrorVisible mensaje={error} />

      {/* ------------------------------------------------ cabecera */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        {chip(
          minutos === null ? "sin_dato" : minutos > MINUTOS_ALARMA_SIN_REGISTRO ? "rojo" : "verde",
          minutos === null ? "Sin registros" : `Último registro ${hora(ultimo!.registrado_en)} (hace ${Math.floor(minutos)} min)`
        )}
        {chip(fueraDeMeta === 0 ? "verde" : "amarillo", `${fueraDeMeta} fuera de meta`)}
        {chip(score.cumplidos === 4 ? "verde" : score.cumplidos >= 2 ? "amarillo" : "rojo", `Score órgano ${score.cumplidos}/4`)}
        <span className="tiny muted" style={{ alignSelf: "center" }}>
          Vasopresor: {inf.algunVasopresorActivo ? "sí" : "no"} (informativo, fuera del score)
        </span>
      </div>
      <div className="tiny muted" style={{ marginBottom: 10 }}>
        Score: {score.items.map((i) => `${i.etiqueta} ${i.cumple === null ? "sin dato" : i.cumple ? "✓" : "✗"}`).join(" · ")}
      </div>

      {/* ------------------------------------------------ nutrición */}
      {config?.nutricion_previa == null && (
        <div style={{ padding: "8px 10px", border: "1px solid var(--amber)", borderRadius: 8, marginBottom: 10 }}>
          <div className="tiny" style={{ marginBottom: 6 }}>¿Recibía nutrición antes?</div>
          <div className="btn-row">
            <button className="btn btn-sm" onClick={() => cambiarConfig({ nutricion_previa: "si" })}>Sí</button>
            <button className="btn btn-sm" onClick={() => cambiarConfig({ nutricion_previa: "no" })}>No</button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ diuresis destacada */}
      <div style={{ padding: "10px 12px", border: `2px solid ${COLOR_CSS[filaDiuresis.color]}`, borderRadius: 10, marginBottom: 10 }}>
        <div className="section-label" style={{ marginBottom: 4 }}>Diuresis (el parámetro más importante)</div>
        {!peso && <PedirPeso onGuardar={guardarPeso} />}
        {ultimaDiuresis ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 20, color: COLOR_CSS[filaDiuresis.color] }}>
              {ultimaDiuresis.mlKgH !== null ? `${num(ultimaDiuresis.mlKgH)} mL/kg/h` : "—"}
            </strong>
            <span className="tiny">
              {ultimaDiuresis.mlH !== null ? `${num(ultimaDiuresis.mlH, 0)} mL/h` : ""} · {hora(ultimaDiuresis.registrado_en)}
            </span>
            {avisoDiuresis(ultimaDiuresis.aviso) && <span className="chip chip-amber">{avisoDiuresis(ultimaDiuresis.aviso)}</span>}
            <MiniTendencia valores={filaDiuresis.tendencia} color={COLOR_CSS[filaDiuresis.color]} />
          </div>
        ) : (
          <div className="tiny muted">Sin diuresis cargada.</div>
        )}
      </div>

      {/* ------------------------------------------------ alarmas */}
      {alarmas.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div className="section-label">Alarmas</div>
          {alarmas.map((a, i) => (
            <div key={i} className="tiny" style={{ color: COLOR_CSS[a.nivel], padding: "2px 0" }}>
              ● {a.texto}
            </div>
          ))}
        </div>
      )}

      {/* ------------------------------------------------ tablero por sistemas */}
      {sistemas.map((s) => {
        const visibles = s.filas.filter((f) => !f.avanzado || (avanzado && f.valor !== null));
        if (visibles.length === 0) return null;
        return (
          <div key={s.titulo} style={{ marginBottom: 8 }}>
            <div className="section-label">{s.titulo}</div>
            {visibles.map((f) => (
              <div className="field-row" key={f.clave}>
                <span className="field-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: COLOR_CSS[f.color], display: "inline-block" }} />
                  {f.etiqueta}
                  {f.clave === "ic" && ic ? ` (${ic.origen})` : ""}
                </span>
                <span className="field-value" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <MiniTendencia valores={f.tendencia} color={COLOR_CSS[f.color]} />
                  <span style={{ color: f.desactualizado ? "var(--text-faint)" : undefined }}>
                    {f.valor === null ? "—" : `${num(f.valor, f.clave === "noradrenalina" ? 3 : 2)} ${METAS[f.clave].unidad}`}
                  </span>
                  <span className="tiny muted">
                    {f.hora ? hora(f.hora) : ""}
                    {f.desactualizado ? " · desactualizado" : ""}
                  </span>
                </span>
              </div>
            ))}
          </div>
        );
      })}
      {hb && (
        <div className="field-row">
          <span className="field-label">Hb</span>
          <span className="field-value" style={{ color: hb.desactualizado ? "var(--text-faint)" : undefined }}>
            {num(hb.valor)} g/dL <span className="tiny muted">{hora(hb.medido_en)}{hb.desactualizado ? " · desactualizado" : ""}</span>
          </span>
        </div>
      )}

      {/* ------------------------------------------------ sugerencias */}
      {sugerencias.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="section-label">Sugerencias (apoyo, no orden)</div>
          {sugerencias.map((s) => (
            <div
              key={s.id}
              style={{
                borderLeft: `3px solid ${s.nivel === "info" ? "var(--text-faint)" : COLOR_CSS[s.nivel]}`,
                padding: "4px 8px",
                margin: "6px 0",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13 }}>{s.titulo}</div>
              {s.lineas.map((l, i) => (
                <div key={i} className="tiny">
                  {l}
                </div>
              ))}
              <div className="tiny muted" style={{ fontStyle: "italic" }}>
                {s.leyenda}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ------------------------------------------------ diabetes insípida */}
      <div style={{ marginTop: 12 }}>
        <div className="section-label">Diabetes insípida</div>
        <div className="tiny">
          {di.estado === "probable" ? chip("rojo", "Probable") : di.estado === "sospecha" ? chip("amarillo", "Sospecha") : chip("verde", "Sin criterios")}{" "}
          {di.motivos.join(" ")}
        </div>
        {(!ultimo || ultimo.osm_urinaria === null || ultimo.osm_serica === null || ultimo.densidad_urinaria === null) && (
          <div className="tiny muted">Para evaluarla: diuresis horaria, osmolaridad urinaria, osmolaridad sérica y densidad urinaria.</div>
        )}
        {inf.ultimoBoloDesmopresina && (
          <div className="tiny muted">Último bolo de desmopresina: {hora(inf.ultimoBoloDesmopresina)} (informativo)</div>
        )}
      </div>

      {/* ------------------------------------------------ volemia */}
      <div style={{ marginTop: 12 }}>
        <div className="section-label">¿Responde a volumen?</div>
        <div className="tiny">
          Estáticas: PAM {num(ultimo?.pam, 0)} · FC {num(ultimo?.fc, 0)} · Sat {num(ultimo?.sat_o2, 0)}%
          {avanzado ? ` · PVC ${num(ultimo?.pvc)} · GC ${num(ultimo?.gc)} · Sat venosa ${num(ultimo?.sat_venosa, 0)}%` : ""}
        </div>
        {volemia.cargadas === 0 ? (
          <div className="tiny muted">
            Sin variables dinámicas cargadas{avanzado ? "." : " (se cargan con el monitoreo avanzado activo)."}
          </div>
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

      {/* ------------------------------------------------ balance hídrico */}
      <div style={{ marginTop: 12 }}>
        <div className="section-label">Balance hídrico</div>
        {balance.length === 0 ? (
          <div className="tiny muted">Sin registros.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="tiny" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "right" }}>
                  <th style={{ textAlign: "left" }}>Hora</th>
                  <th>Diuresis mL/h</th>
                  <th>Parcial</th>
                  <th>Acumulado</th>
                </tr>
              </thead>
              <tbody>
                {balance
                  .slice()
                  .reverse()
                  .map((b) => {
                    const d = diuresis.find((x) => x.id === b.id);
                    return (
                      <tr key={b.id} style={{ textAlign: "right" }}>
                        <td style={{ textAlign: "left" }}>{hora(b.registrado_en)}</td>
                        <td>{d?.mlH !== null && d?.mlH !== undefined ? num(d.mlH, 0) : avisoDiuresis(d?.aviso) ?? "—"}</td>
                        <td>{num(b.parcial, 0)} mL</td>
                        <td>{num(b.acumulado, 0)} mL</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ------------------------------------------------ carga */}
      <MantenimientoRegistros
        donanteId={donante.id}
        registros={registros}
        monitoreoAvanzado={avanzado}
        onRegistrosChange={setRegistros}
      />
      <MantenimientoInfusiones
        pesoKg={peso}
        donanteId={donante.id}
        infusiones={infusiones}
        onInfusionesChange={setInfusiones}
        onGuardarPeso={guardarPeso}
      />
      <MantenimientoLaboratorio donanteId={donante.id} valores={lab} fio2Ultima={ultimo?.fio2 ?? null} onValoresChange={setLab} />

      {/* ------------------------------------------------ configuración */}
      <div style={{ marginTop: 14 }}>
        <div className="section-label">Configuración del caso</div>
        <label className="check-row" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={avanzado} onChange={(e) => cambiarConfig({ monitoreo_avanzado_activo: e.target.checked })} /> Monitoreo
          avanzado (PVC, GC, IC, RVS, saturación venosa, variables dinámicas)
        </label>
        <div className="field-row">
          <span className="field-label">Corazón candidato</span>
          <select
            className="mini-input"
            value={config?.corazon_candidato ?? "sin_definir"}
            onChange={(e) => cambiarConfig({ corazon_candidato: e.target.value as ConfigMantenimiento["corazon_candidato"] })}
          >
            <option value="sin_definir">Sin definir</option>
            <option value="si">Sí</option>
            <option value="no">No</option>
          </select>
        </div>
        {config?.nutricion_previa != null && (
          <div className="field-row">
            <span className="field-label">¿Recibía nutrición antes?</span>
            <select
              className="mini-input"
              value={config.nutricion_previa}
              onChange={(e) => cambiarConfig({ nutricion_previa: e.target.value as "si" | "no" })}
            >
              <option value="si">Sí</option>
              <option value="no">No</option>
            </select>
          </div>
        )}
      </div>

      {/* ------------------------------------------------ completo */}
      <div className="field-row" style={{ marginTop: 14 }}>
        <span className="field-label">Mantenimiento</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button className={`btn btn-sm ${completo ? "btn-accent" : ""}`} onClick={() => marcarCompleto(true)}>
            Marcar como completo
          </button>
          <button className={`btn btn-sm ${!completo ? "btn-accent" : ""}`} onClick={() => marcarCompleto(false)}>
            Marcar como pendiente
          </button>
        </div>
      </div>
    </div>
  );
}
