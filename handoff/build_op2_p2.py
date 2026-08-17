import formkit as fk

SRC = "/mnt/project/FPrO750401HistoriaClínicadelPotencialDonanteOP21.pdf"
sizes = fk.extract_page_images(SRC, "op2")

P2 = [
    # Antropometría
    ("grupo_sanguineo", "text", 340, 335, 495, 365, "Grupo sanguíneo"),
    ("grupo_confirmado", "text", 535, 335, 650, 365, "Grupo confirmado"),
    ("peso", "text", 180, 395, 280, 425, "Peso"),
    ("talla", "text", 505, 395, 600, 425, "Talla"),
    ("l_esternal", "text", 845, 395, 940, 425, "L. Esternal"),
    ("p_axilar", "text", 1155, 395, 1250, 425, "P. Axilar"),
    ("p_xif", "text", 180, 450, 280, 480, "P. Xif"),
    ("p_umbilic", "text", 505, 450, 600, 480, "P. Umbilic"),
    ("biliaco", "text", 845, 450, 940, 480, "Bilíaco"),
    ("xifopubiano", "text", 505, 505, 600, 535, "Xifopubiano"),
    ("d_ventral", "text", 845, 505, 940, 535, "D. Ventral"),
    ("femur", "text", 1155, 505, 1250, 535, "Fémur"),

    # Exámen físico
    ("lesiones_globos", "text", 385, 685, 462, 712, "Globos oculares — lesiones (SI/NO)"),
    ("cirugia_globos", "text", 645, 685, 730, 712, "Globos oculares — cirugía (SI/NO)"),
    ("otorragia", "text", 1070, 685, 1350, 712, "Otorragia"),
    ("trauma_torax", "text", 305, 725, 400, 750, "Tórax — trauma (marca)"),
    ("torax_desc", "text", 410, 725, 1350, 750, "Tórax — descripción"),
    ("trauma_abdomen", "text", 350, 770, 445, 795, "Abdomen — trauma (marca)"),
    ("abdomen_desc", "text", 455, 770, 1350, 795, "Abdomen — descripción"),
    ("trauma_miembros", "text", 350, 815, 445, 840, "Miembros — trauma (marca)"),
    ("miembros_desc", "text", 455, 815, 940, 840, "Miembros — descripción"),
    ("piel", "text", 1000, 815, 1350, 840, "Piel"),
    ("otros_datos_positivos", "text", 335, 860, 1350, 885, "Otros datos positivos"),

    # Perfil hemodinámico y ARM
    ("arm_dia", "text", 228, 1085, 315, 1140, "ARM desde — día"),
    ("arm_mes", "text", 325, 1085, 410, 1140, "ARM desde — mes"),
    ("arm_anio", "text", 425, 1085, 500, 1140, "ARM desde — año"),
    ("arm_hora", "text", 510, 1085, 600, 1140, "ARM desde — hora"),
    ("tubo_nro", "text", 735, 1085, 810, 1140, "Tubo Nro"),
    ("respirador", "text", 985, 1095, 1300, 1125, "Respirador"),
    ("volumen", "text", 180, 1168, 405, 1192, "Volumen"),
    ("frecuencia", "text", 415, 1168, 780, 1192, "Frecuencia"),
    ("peep", "text", 790, 1168, 1035, 1192, "Peep"),
    ("fio2", "text", 1045, 1168, 1300, 1192, "FIO2"),
    ("traqueostomia", "text", 205, 1205, 365, 1235, "Traqueostomía (SI/NO)"),
    ("secreciones", "text", 505, 1205, 665, 1235, "Secreciones (si/no)"),
    ("tipo_secrecion", "text", 805, 1205, 1280, 1235, "Tipo (purulento/mucosa/hemática/otro)"),
    ("tubo_torax", "text", 210, 1255, 335, 1285, "Tubo tórax (izq/der)"),
    ("t_reanimacion", "text", 450, 1305, 485, 1335, "T. reanimación (marca)"),
    ("drogas_l1", "text", 585, 1305, 1300, 1335, "Drogas (línea 1)"),
    ("paro_cardiaco", "text", 110, 1355, 245, 1390, "Paro Cardíaco (SI/NO)"),
    ("desfibrilacion", "text", 460, 1355, 495, 1390, "Desfibrilación (marca)"),
    ("drogas_l2", "text", 585, 1355, 1300, 1390, "Drogas (línea 2)"),
    ("intracardiaca", "text", 460, 1405, 495, 1435, "Intracardíaca (marca)"),
    ("drogas_l3", "text", 585, 1405, 1300, 1435, "Drogas (línea 3)"),
    ("foco_septico", "text", 220, 1450, 375, 1480, "Foco Séptico (SI/NO)"),
    ("cual_foco", "text", 445, 1450, 1300, 1480, "Foco séptico — cuál"),
    ("foco_septico_resto", "text", 65, 1505, 1300, 1535, "Foco séptico — continuación"),
    ("antibioticos_l1", "text", 245, 1550, 1300, 1580, "Antibióticos (línea 1)"),
    ("antibioticos_l2", "text", 65, 1600, 1300, 1630, "Antibióticos (línea 2)"),
]

# Tabla de Cultivos: 4 filas x 6 columnas (Fecha unificada en un solo campo)
CULTIVO_ROWS = [
    (1755, "sangre"),
    (1795, "orina"),
    (1835, "secreciones_resp"),
    (1875, "otros_cultivo"),
]
CULTIVO_COLS = [
    ("sn", 230, 320),
    ("fecha", 330, 600),
    ("centro", 610, 795),
    ("mas_menos", 800, 895),
    ("tipificacion", 900, 1100),
    ("antibiograma", 1105, 1300),
]
for y, rowkey in CULTIVO_ROWS:
    for colkey, x0, x1 in CULTIVO_COLS:
        P2.append((f"cultivo_{rowkey}_{colkey}", "text", x0, y, x1, y + 35, f"Cultivo {rowkey} — {colkey}"))

fk.build_interactive(
    ["op2_p2.jpg"],
    [sizes[1]],
    [P2],
    "op2_p2_interactiva.pdf",
)
print("OK — campos p2:", len(P2))
