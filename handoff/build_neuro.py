# NOTA (2026-08-21): historia_clinica_neurologica.pdf (el AcroForm ya
# desplegado en public/forms/documentos/) tiene 4 correcciones de
# posición de widget aplicadas DIRECTAMENTE sobre el PDF con pdf-lib,
# que no están reflejadas en las coordenadas de este script:
# - causa_coma (P1): estaba pisando la línea de "Observaciones" --
#   se corrigió con y += 12 y x = 230 (en vez de 138.24) en el PDF final.
# - fecha_1a/2a, hora_1a/2a, ta_tam_1a/2a (P3): cada una aparecía un
#   renglón más abajo de lo que le correspondía (fecha en la línea de
#   HORA, hora en la de TA/TAM, etc.) -- se corrigieron con y += 19.68
#   c/u en el PDF final.
# - t_central_1a/2a (P3): y += 6 (ajuste menor, caja muy baja: 9.12pt).
# Si se regenera este PDF desde cero con este script, hay que volver a
# calibrar esas filas contra el PDF ya corregido (o repetir el parche
# con pdf-lib) antes de reemplazar el archivo servido.
import formkit as fk

SRC = "/mnt/project/FPrO750201Historiaclinicaneurológica1.pdf"
sizes = fk.extract_page_images(SRC, "neuro")

# ================= PÁGINA 1 =================
P1 = [
    ("fecha_dia", "text", 438, 320, 551, 382, "Día"),
    ("fecha_mes", "text", 553, 320, 666, 382, "Mes"),
    ("fecha_anio", "text", 668, 320, 780, 382, "Año"),
    ("fecha_hora_top", "text", 783, 320, 896, 382, "Hora"),
    ("pd_numero", "text", 1010, 350, 1350, 382, "PD Nº"),
    ("nombre", "text", 485, 480, 1000, 515, "Nombre y Apellido"),
    ("edad", "text", 1070, 480, 1390, 515, "Edad"),
    ("causa_coma", "text", 290, 605, 1350, 635, "Causa del coma"),
    ("observaciones_l1", "text", 305, 650, 1350, 680, "Observaciones (línea 1)"),
    ("observaciones_resto", "text", 180, 685, 1350, 800, "Observaciones (continuación)"),
    ("estudios_complementarios", "text", 180, 970, 1350, 1210, "Estudios complementarios"),
    ("droga1", "text", 300, 1365, 730, 1395, "Droga depresora 1"),
    ("droga2", "text", 300, 1405, 730, 1435, "Droga depresora 2"),
    ("otra_med_resto", "text", 180, 1535, 1350, 1650, "Otra medicación de importancia neurológica"),
    ("arm_obligada", "text", 420, 1695, 740, 1725, "ARM obligada desde"),
    ("arm_fecha_hs", "text", 740, 1695, 1070, 1725, "ARM — fecha / hs"),
    ("fondo_ojo", "text", 340, 1735, 1370, 1765, "Fondo de ojo"),
    ("cb_union_neuromuscular", "checkbox", 214, 1764, 246, 1796, "Evaluación de la unión neuromuscular"),
    ("cb_reflejos_osteotendinosos", "checkbox", 214, 1807, 246, 1839, "Reflejos osteotendinosos"),
    ("cb_reflejos_idiomusculares", "checkbox", 214, 1850, 246, 1882, "Reflejos idiomusculares"),
    ("cb_electroestimulacion", "checkbox", 214, 1891, 246, 1923, "Electroestimulación"),
]

# ================= PÁGINA 2 =================
def fecha_hora(prefix, y0, y1, wide=False):
    if wide:
        fx0, fx1, hx0, hx1 = 645, 820, 890, 945
    else:
        fx0, fx1, hx0, hx1 = 520, 610, 800, 875
    return [
        (f"{prefix}_fecha", "text", fx0, y0, fx1, y1, f"{prefix} — fecha"),
        (f"{prefix}_hora", "text", hx0, y0, hx1, y1, f"{prefix} — hora"),
    ]

P2 = []
P2 += fecha_hora("eeg1", 381, 405)
P2 += [("eeg1_informe", "text", 180, 448, 1350, 496, "EEG 1 — informe")]
P2 += fecha_hora("eeg2", 531, 555)
P2 += [("eeg2_informe", "text", 180, 598, 1350, 646, "EEG 2 — informe")]
P2 += [
    ("potenciales_fecha", "text", 595, 681, 770, 705, "Potenciales — fecha"),
    ("potenciales_hora", "text", 840, 681, 920, 705, "Potenciales — hora"),
]
P2 += [
    ("peat", "text", 395, 716, 1350, 738, "PEAT"),
    ("pess", "text", 395, 746, 1350, 768, "PESS"),
    ("pev", "text", 395, 776, 1350, 798, "PEV"),
]
P2 += fecha_hora("apneica1", 836, 860, wide=True)
P2 += [
    ("apneica1_positiva", "checkbox", 215, 888, 245, 918, "Test 1 — positiva"),
    ("apneica1_negativa", "checkbox", 396, 888, 427, 918, "Test 1 — negativa"),
    ("apneica1_indeterminada", "checkbox", 567, 888, 597, 918, "Test 1 — indeterminada"),
    ("apneica1_co2_si", "checkbox", 988, 888, 1019, 918, "Test 1 — con CO2 sí"),
    ("apneica1_co2_no", "checkbox", 1089, 888, 1119, 918, "Test 1 — con CO2 no"),
    ("apneica1_pco2_inicial", "text", 295, 928, 465, 953, "Test 1 — PCO2 inicial"),
    ("apneica1_pco2_final", "text", 605, 928, 730, 953, "Test 1 — PCO2 final"),
    ("apneica1_duracion", "text", 878, 928, 1350, 953, "Test 1 — duración"),
    ("apneica1_complicaciones", "text", 335, 958, 1350, 983, "Test 1 — complicaciones"),
]
P2 += fecha_hora("apneica2", 1021, 1045, wide=True)
P2 += [
    ("apneica2_positiva", "checkbox", 215, 1073, 245, 1104, "Test 2 — positiva"),
    ("apneica2_negativa", "checkbox", 396, 1073, 427, 1104, "Test 2 — negativa"),
    ("apneica2_indeterminada", "checkbox", 567, 1073, 597, 1104, "Test 2 — indeterminada"),
    ("apneica2_co2_si", "checkbox", 988, 1073, 1019, 1104, "Test 2 — con CO2 sí"),
    ("apneica2_co2_no", "checkbox", 1089, 1073, 1119, 1104, "Test 2 — con CO2 no"),
    ("apneica2_pco2_inicial", "text", 295, 1113, 465, 1138, "Test 2 — PCO2 inicial"),
    ("apneica2_pco2_final", "text", 605, 1113, 730, 1138, "Test 2 — PCO2 final"),
    ("apneica2_duracion", "text", 878, 1113, 1350, 1138, "Test 2 — duración"),
    ("apneica2_complicaciones", "text", 335, 1143, 1350, 1168, "Test 2 — complicaciones"),
]
P2 += fecha_hora("otros_examenes", 1200, 1225)
P2 += [("otros_examenes_resto", "text", 180, 1235, 1350, 1338, "Otros exámenes")]
P2 += [
    ("cumple_me_si", "checkbox", 849, 1380, 879, 1410, "Cumple criterios ME — sí"),
    ("cumple_me_no", "checkbox", 939, 1380, 969, 1410, "Cumple criterios ME — no"),
    ("no_cumple_motivo", "text", 180, 1485, 1350, 1655, "En caso de NO — motivo y conducta"),
]

# ================= PÁGINA 3 =================
COL1_X = (200, 770)
COL2_X = (790, 1400)

P3 = [
    ("fecha_1a", "text", COL1_X[0], 397, COL1_X[1], 434, "1a Evaluación — fecha"),
    ("fecha_2a", "text", COL2_X[0], 397, COL2_X[1], 434, "2a Evaluación — fecha"),
    ("hora_1a", "text", COL1_X[0], 438, COL1_X[1], 475, "1a Evaluación — hora"),
    ("hora_2a", "text", COL2_X[0], 438, COL2_X[1], 475, "2a Evaluación — hora"),
    ("ta_tam_1a", "text", 300, 479, COL1_X[1], 516, "1a Evaluación — TA/TAM"),
    ("ta_tam_2a", "text", COL2_X[0], 479, COL2_X[1], 516, "2a Evaluación — TA/TAM"),
    ("t_central_1a", "text", 320, 520, COL1_X[1], 535, "1a Evaluación — T. central"),
    ("t_central_2a", "text", COL2_X[0], 520, COL2_X[1], 535, "2a Evaluación — T. central"),
    ("pupilas_1a", "text", 300, 579, COL1_X[1], 615, "1a Evaluación — pupilas"),
    ("pupilas_2a", "text", COL2_X[0], 579, COL2_X[1], 615, "2a Evaluación — pupilas"),
    ("observaciones_1a", "text", 110, 1225, COL1_X[1], 1900, "1a Evaluación — observaciones"),
    ("observaciones_2a", "text", COL2_X[0], 1225, COL2_X[1], 1900, "2a Evaluación — observaciones"),
]

REFLEJOS = [
    (537, "diabetes_insipida"),
    (620, "reflejo_fotomotor"),
    (659, "reflejo_corneano"),
    (701, "reflejo_oculocefalico"),
    (745, "reflejo_oculovestibulares"),
    (786, "reflejo_nauseoso"),
    (827, "reflejo_deglutorio"),
    (868, "reflejo_maseterino"),
    (908, "respuesta_dolor"),
    (949, "reflejos_osteotendinosos"),
    (991, "reflejo_plantar"),
    (1034, "reflejo_cremasteriano"),
    (1075, "reflejos_cutaneo_abdominales"),
    (1117, "movimientos_atipicos"),
]
for y, key in REFLEJOS:
    P3 += [
        (f"{key}_1a_si", "checkbox", 576, y, 602, y + 27, f"{key} 1a — sí"),
        (f"{key}_1a_no", "checkbox", 665, y, 691, y + 27, f"{key} 1a — no"),
        (f"{key}_2a_si", "checkbox", 1000, y, 1026, y + 27, f"{key} 2a — sí"),
        (f"{key}_2a_no", "checkbox", 1090, y, 1116, y + 27, f"{key} 2a — no"),
    ]

fk.build_interactive(
    ["neuro_p1.jpg", "neuro_p2.jpg", "neuro_p3.jpg"],
    sizes,
    [P1, P2, P3],
    "neuro_interactiva.pdf",
)
print("OK — p1:", len(P1), "| p2:", len(P2), "| p3:", len(P3))
