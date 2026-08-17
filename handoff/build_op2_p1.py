import formkit as fk

SRC = "/mnt/project/FPrO750401HistoriaClínicadelPotencialDonanteOP21.pdf"
sizes = fk.extract_page_images(SRC, "op2")

P1 = [
    # identificación superior
    ("fecha_dia", "text", 437, 337, 550, 398, "Día"),
    ("fecha_mes", "text", 553, 337, 665, 398, "Mes"),
    ("fecha_anio", "text", 667, 336, 780, 397, "Año"),
    ("fecha_hora", "text", 783, 337, 893, 397, "Hora"),
    ("folio_numero", "text", 1044, 337, 1380, 399, "Folio Nº"),

    ("institucion", "text", 270, 439, 830, 459, "Institución"),
    ("localidad", "text", 960, 439, 1350, 459, "Localidad"),
    ("servicio", "text", 700, 494, 965, 512, "Servicio"),
    ("tel", "text", 1020, 494, 1350, 512, "Tel"),
    ("denunciante", "text", 300, 543, 1350, 562, "Denunciante"),
    ("potencial_donante", "text", 365, 599, 915, 618, "Potencial donante — nombre"),
    ("dni", "text", 980, 599, 1350, 618, "DNI"),

    ("nac_dia", "text", 383, 654, 496, 715, "Fecha nacimiento — día"),
    ("nac_mes", "text", 498, 654, 611, 715, "Fecha nacimiento — mes"),
    ("nac_anio", "text", 613, 653, 726, 714, "Fecha nacimiento — año"),
    ("edad", "text", 823, 650, 936, 711, "Edad"),
    ("sexo", "text", 1024, 650, 1137, 711, "Sexo"),
    ("cama", "text", 1263, 650, 1376, 711, "Cama"),

    ("causa_muerte", "text", 145, 895, 1350, 920, "Causa de muerte"),

    ("motivo_ingreso", "text", 390, 1148, 1370, 1170, "Motivo de ingreso"),
    ("cirugia_l1", "text", 260, 1213, 1370, 1235, "Cirugía (línea 1)"),
    ("cirugia_l2", "text", 145, 1270, 1370, 1292, "Cirugía (línea 2)"),
    ("ta", "text", 215, 1335, 480, 1358, "TA"),
    ("fc", "text", 530, 1335, 770, 1358, "FC"),
    ("temp", "text", 845, 1335, 1080, 1358, "TEMP"),
    ("tac", "text", 1140, 1335, 1370, 1358, "TAC"),

    ("cardiovasculares", "text", 350, 1580, 780, 1602, "Cardiovasculares"),
    ("respiratorios", "text", 950, 1580, 1370, 1602, "Respiratorios"),
    ("habitos", "text", 245, 1640, 780, 1662, "Hábitos"),
    ("neoplasias", "text", 930, 1640, 1370, 1662, "Neoplasias"),
    ("dbt", "text", 200, 1715, 575, 1737, "DBT"),
    ("hta", "text", 635, 1715, 1000, 1737, "HTA"),
    ("otros_ant", "text", 220, 1785, 1370, 1807, "Otros antecedentes"),
    ("tratamientos", "text", 315, 1865, 1370, 1887, "Tratamientos"),
]

fk.build_interactive(
    ["op2_p1.jpg"],
    [sizes[0]],
    [P1],
    "op2_p1_interactiva.pdf",
)
print("OK — campos p1:", len(P1))
