import formkit as fk

SRC = "/mnt/project/FPrO750401HistoriaClínicadelPotencialDonanteOP21.pdf"
sizes = fk.extract_page_images(SRC, "op2")

P3 = [
    # Electrocardiograma
    ("ecg_ingreso_dia", "text", 475, 320, 550, 375, "ECG ingreso — día"),
    ("ecg_ingreso_mes", "text", 555, 320, 620, 375, "ECG ingreso — mes"),
    ("ecg_ingreso_anio", "text", 625, 318, 695, 373, "ECG ingreso — año"),
    ("ecg_ingreso_desc", "text", 875, 328, 1400, 398, "ECG ingreso — descripción"),
    ("ecg_actual_dia", "text", 475, 395, 550, 450, "ECG actual — día"),
    ("ecg_actual_mes", "text", 555, 395, 620, 450, "ECG actual — mes"),
    ("ecg_actual_anio", "text", 625, 393, 695, 448, "ECG actual — año"),
    ("ecg_actual_desc", "text", 875, 403, 1400, 473, "ECG actual — descripción"),

    # Rx de tórax
    ("rx_ingreso_dia", "text", 475, 485, 550, 538, "Rx ingreso — día"),
    ("rx_ingreso_mes", "text", 555, 485, 620, 538, "Rx ingreso — mes"),
    ("rx_ingreso_anio", "text", 625, 483, 695, 536, "Rx ingreso — año"),
    ("rx_ingreso_desc", "text", 875, 490, 1400, 560, "Rx ingreso — descripción"),
    ("rx_actual_dia", "text", 475, 550, 550, 602, "Rx actual — día"),
    ("rx_actual_mes", "text", 555, 550, 620, 602, "Rx actual — mes"),
    ("rx_actual_anio", "text", 625, 548, 695, 600, "Rx actual — año"),
    ("rx_actual_desc", "text", 875, 556, 1400, 626, "Rx actual — descripción"),

    # Otros estudios
    ("ecografia", "text", 570, 632, 1400, 660, "Ecografía"),
    ("ecocardiografia", "text", 570, 677, 1400, 705, "Ecocardiografía"),
    ("otros_estudio", "text", 570, 722, 1400, 750, "Otros estudios"),
]

# Tabla de Laboratorio: 25 filas x 5 columnas de fecha (cada columna = una extracción distinta)
LAB_ROWS = [
    "Hematocrito", "Leucocitos", "Hemoglobina", "Neutrofilos", "Plaquetas",
    "Urea", "Creatinina", "Glucemia", "Na", "K", "Cl",
    "Bilirrubina_T", "Bilirrubina_D", "TGO", "TGP", "FA", "LDH",
    "Gama_GT", "Amilasa", "CPK", "CPK_MB", "KPTT",
    "Protombina", "Proteinuria", "Sedimento",
]
ROW_Y = [1010, 1050, 1089, 1128, 1168, 1210, 1250, 1289, 1328, 1368, 1408,
         1447, 1489, 1529, 1568, 1608, 1647, 1686, 1726, 1766, 1805, 1847,
         1888, 1929, 1981, 2023]
COL_GROUPS = [
    ("extraccion1", 226, 463),
    ("extraccion2", 463, 701),
    ("extraccion3", 701, 940),
    ("extraccion4", 940, 1174),
    ("extraccion5", 1174, 1350),
]
# cajas de fecha del encabezado de cada columna (Día/Mes/Año/Hora), fila ~800-855
DATE_HEADER_Y = (800, 855)
for colkey, x0, x1 in COL_GROUPS:
    w = (x1 - x0) / 4
    for i, sub in enumerate(["dia", "mes", "anio", "hora"]):
        P3.append((f"lab_{colkey}_fecha_{sub}", "text",
                   int(x0 + i * w) + 3, DATE_HEADER_Y[0], int(x0 + (i + 1) * w) - 3, DATE_HEADER_Y[1],
                   f"Laboratorio {colkey} — {sub}"))

for i, rowname in enumerate(LAB_ROWS):
    y0, y1 = ROW_Y[i], ROW_Y[i + 1]
    for colkey, x0, x1 in COL_GROUPS:
        P3.append((f"lab_{rowname}_{colkey}", "text", x0 + 4, y0 + 2, x1 - 4, y1 - 2,
                   f"{rowname} — {colkey}"))

fk.build_interactive(
    ["op2_p3.jpg"],
    [sizes[2]],
    [P3],
    "op2_p3_interactiva.pdf",
)
print("OK — campos p3:", len(P3))
