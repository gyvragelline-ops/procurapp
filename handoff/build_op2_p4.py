import formkit as fk

SRC = "/mnt/project/FPrO750401HistoriaClínicadelPotencialDonanteOP21.pdf"
sizes = fk.extract_page_images(SRC, "op2")

P4 = [
    ("gaso_dia", "text", 35, 455, 95, 515, "Gasometría — día"),
    ("gaso_mes", "text", 110, 455, 170, 515, "Gasometría — mes"),
]

HOUR_COLS_X = [265, 364, 462, 564, 660, 764, 854, 954, 1051, 1151, 1247, 1352]
PARAM_ROWS_Y = [535, 603, 681, 755, 831, 903, 977, 1069]
PARAMS = ["PO2", "PCO2", "pH", "CO3H", "EB", "SAT_O2", "Fio2"]

# Fila "Hora:" por columna (arriba de la tabla)
for i in range(11):
    x0, x1 = HOUR_COLS_X[i], HOUR_COLS_X[i + 1]
    P4.append((f"gaso_col{i+1}_hora", "text", x0 + 3, 430, x1 - 3, 465, f"Gasometría col {i+1} — hora"))

# Celdas de datos: 7 parámetros x 11 columnas
for r, param in enumerate(PARAMS):
    y0, y1 = PARAM_ROWS_Y[r], PARAM_ROWS_Y[r + 1]
    for i in range(11):
        x0, x1 = HOUR_COLS_X[i], HOUR_COLS_X[i + 1]
        P4.append((f"gaso_{param}_col{i+1}", "text", x0 + 3, y0 + 2, x1 - 3, y1 - 2, f"{param} — columna {i+1}"))

fk.build_interactive(
    ["op2_p4.jpg"],
    [sizes[3]],
    [P4],
    "op2_p4_interactiva.pdf",
)
print("OK — campos p4:", len(P4))
