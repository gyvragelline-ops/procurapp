import formkit as fk

SRC = "/mnt/project/FPrO750202Protocolodeevaluaciónpordopplertranscraneano1.pdf"
sizes = fk.extract_page_images(SRC, "dop")

ROW_TYPES = [
    ("ausencia", "Ausencia de señal", 27, 1028),
    ("espiga", "Espiga sistólica", 21, 1000),
    ("diastole", "Diástole reverberante", 22, 1058),
    ("otro", "Otro", 18, 869),
]
LINE_X_END = 1224

def artery_fields(prefix, top_y, label):
    fields = []
    row_offsets = [0, 40, 79, 120]
    for (key, sublabel, ydelta, x0), roff in zip(ROW_TYPES, row_offsets):
        cb_y = top_y + roff
        fields.append((f"{prefix}_{key}_check", "checkbox", 740, cb_y, 772, cb_y + 32, f"{label} — {sublabel}"))
        line_y = cb_y + ydelta
        fields.append((f"{prefix}_{key}_valor", "text", x0, line_y - 13, LINE_X_END, line_y + 11, f"{label} — {sublabel} (valor)"))
    return fields

# ---------------- Página 1 ----------------
P1 = [
    ("fecha_dia", "text", 431, 305, 544, 366, "Día"),
    ("fecha_mes", "text", 547, 305, 659, 366, "Mes"),
    ("fecha_anio", "text", 661, 303, 774, 365, "Año"),
    ("fecha_hora_top", "text", 776, 304, 889, 366, "Hora"),
    ("pd_numero", "text", 940, 335, 1360, 366, "PD Nº"),
    ("hospital", "text", 245, 415, 1355, 443, "Hospital"),
    ("paciente", "text", 255, 470, 930, 498, "Paciente"),
    ("edad", "text", 1005, 470, 1355, 498, "Edad"),
    ("tam", "text", 300, 520, 1020, 553, "TAM"),
    ("paco2", "text", 1110, 520, 1355, 553, "PaCO2"),
    ("inicio_fecha", "text", 250, 608, 440, 640, "Inicio — fecha"),
    ("inicio_hora", "text", 500, 608, 835, 640, "Inicio — hora"),
    ("final_fecha", "text", 910, 608, 1095, 640, "Final — fecha"),
    ("final_hora", "text", 1160, 608, 1355, 640, "Final — hora"),
    ("equipo", "text", 240, 675, 585, 706, "Equipo"),
    ("filtro", "text", 655, 675, 1000, 706, "Filtro"),
]
P1 += artery_fields("der_media", 800, "V. Transtemporal Der. — A. Cerebral Media")
P1 += artery_fields("der_anterior", 977, "V. Transtemporal Der. — A. Cerebral Anterior")
P1 += artery_fields("der_posterior", 1163, "V. Transtemporal Der. — A. Cerebral Posterior")
P1 += artery_fields("izq_media", 1416, "V. Transtemporal Izq. — A. Cerebral Media")
P1 += artery_fields("izq_anterior", 1591, "V. Transtemporal Izq. — A. Cerebral Anterior")
P1 += artery_fields("izq_posterior", 1772, "V. Transtemporal Izq. — A. Cerebral Posterior")

# ---------------- Página 2 ----------------
P2 = []
P2 += artery_fields("basilar", 340, "V. Suboccipital — A. Basilar")
P2 += artery_fields("vert_der", 543, "V. Suboccipital — A. Vertebral derecha")
P2 += artery_fields("vert_izq", 751, "V. Suboccipital — A. Vertebral izquierda")
P2 += artery_fields("carotida_der", 1005, "A. Carótida Interna Extracraneana Derecha")
P2 += artery_fields("carotida_izq", 1208, "A. Carótida Interna Extracraneana Izquierda")
P2 += [
    ("interpretacion_l1", "text", 407, 1467, 1353, 1493, "Interpretación (línea 1)"),
    ("interpretacion_resto", "text", 169, 1513, 1354, 1678, "Interpretación (continuación)"),
    ("comentarios_l1", "text", 367, 1709, 1354, 1735, "Comentarios (línea 1)"),
    ("comentarios_resto", "text", 169, 1756, 1354, 1874, "Comentarios (continuación)"),
]

# ---------------- Página 3 ----------------
# "REGISTROS": espacio para pegar las tiras impresas del equipo de doppler; sin campos.
P3 = []

fk.build_interactive(
    ["dop_p1.jpg", "dop_p2.jpg", "dop_p3.jpg"],
    sizes,
    [P1, P2, P3],
    "doppler_interactiva.pdf",
)
print("OK — p1:", len(P1), "| p2:", len(P2), "| p3:", len(P3))
