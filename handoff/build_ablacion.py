import formkit as fk

SRC = "/mnt/project/FPrO750502AblacióndeglobosocularesOP51.pdf"
sizes = fk.extract_page_images(SRC, "ab")

P1 = [
    ("fecha_dia", "text", 453, 294, 566, 356, "Día"),
    ("fecha_mes", "text", 569, 294, 681, 356, "Mes"),
    ("fecha_anio", "text", 683, 292, 796, 354, "Año"),
    ("fecha_hora", "text", 798, 294, 911, 355, "Hora"),
    ("pd_numero", "text", 975, 335, 1350, 370, "PD Nº"),
    ("establecimiento", "text", 352, 485, 1350, 512, "Establecimiento"),
    ("localidad", "text", 277, 541, 1350, 568, "Localidad"),
    ("servicio_denunciante_otro", "text", 877, 595, 1350, 623, "Servicio denunciante (otro, cuál)"),
    ("lugar_domicilio", "checkbox", 158, 649, 191, 682, "Domicilio particular"),
    ("lugar_morgue_judicial", "checkbox", 452, 649, 485, 682, "Morgue judicial"),
    ("lugar_morgue_hospitalaria", "checkbox", 716, 649, 749, 682, "Morgue hospitalaria"),
    ("lugar_casa_velatoria", "checkbox", 1019, 649, 1052, 682, "Casa velatoria"),
    ("edad", "text", 336, 704, 555, 732, "Edad del donante"),
    ("sexo_masculino", "checkbox", 566, 704, 599, 737, "Masculino"),
    ("sexo_femenino", "checkbox", 753, 704, 785, 737, "Femenino"),
    ("ojo_derecho", "checkbox", 389, 760, 422, 793, "Ojo derecho"),
    ("ojo_izquierdo", "checkbox", 643, 761, 675, 793, "Ojo izquierdo"),
    ("fallecido_me", "checkbox", 381, 815, 413, 848, "Fallecido en ME"),
    ("fallecido_pcr", "checkbox", 556, 815, 589, 848, "Fallecido en PCR"),
    ("causas_muerte", "text", 499, 880, 1350, 903, "Causas originaria de muerte"),
    ("parada_cardiaca_fecha", "text", 440, 936, 680, 959, "Parada cardíaca — fecha"),
    ("parada_cardiaca_hora", "text", 755, 936, 851, 959, "Parada cardíaca — hora"),
    ("antec_neoplasias", "checkbox", 309, 1131, 342, 1164, "Neoplasias"),
    ("antec_enf_oculares", "checkbox", 545, 1131, 577, 1164, "Enfermedades oculares"),
    ("antec_cirugia_ocular", "checkbox", 969, 1131, 1002, 1164, "Cirugía ocular"),
    ("antec_diabetes", "checkbox", 311, 1199, 343, 1231, "Diabetes"),
    ("antec_neurologicos", "checkbox", 565, 1198, 598, 1231, "Neurológicos"),
    ("antec_infecciosos", "checkbox", 825, 1198, 858, 1231, "Infecciosos"),
    ("antec_otros", "checkbox", 1089, 1198, 1122, 1231, "Otros antecedentes"),
    ("protocolo_fecha", "text", 225, 1412, 475, 1438, "Protocolo — fecha"),
    ("protocolo_hora", "text", 545, 1412, 700, 1438, "Protocolo — hora"),
    ("medico_ablacionista_nombre", "text", 584, 1485, 940, 1521, "Médico ablacionista"),
    ("medico_ablacionista_mat", "text", 1002, 1485, 1140, 1521, "Matrícula"),
    ("medico_tipo_prov", "checkbox", 1204, 1484, 1236, 1517, "Matrícula provincial"),
    ("medico_tipo_nac", "checkbox", 1298, 1485, 1331, 1517, "Matrícula nacional"),
    ("ayudante_nombre", "text", 494, 1563, 855, 1598, "Ayudante"),
    ("ayudante_mat", "text", 912, 1563, 1055, 1598, "Matrícula ayudante"),
    ("ayudante_tipo_prov", "checkbox", 1126, 1562, 1159, 1595, "Matrícula prov. (ayudante)"),
    ("ayudante_tipo_nac", "checkbox", 1228, 1562, 1261, 1595, "Matrícula nac. (ayudante)"),
    ("ablaciona_od", "checkbox", 292, 1640, 324, 1673, "Ablaciona OD"),
    ("ablaciona_oi", "checkbox", 386, 1640, 419, 1673, "Ablaciona OI"),
    ("ablaciona_ambos", "checkbox", 471, 1640, 504, 1673, "Ablaciona ambos"),
    ("tel_contacto", "text", 963, 1636, 1350, 1676, "Tel. de contacto"),
]

P2 = [
    ("examen_od", "text", 218, 835, 1315, 865, "Examen macroscópico — ojo derecho"),
    ("examen_oi", "text", 231, 905, 1310, 935, "Examen macroscópico — ojo izquierdo"),
]

fk.build_interactive(
    ["ab_p1.jpg", "ab_p2.jpg"],
    sizes,
    [P1, P2],
    "ablacion_interactiva.pdf",
)
print("OK — campos p1:", len(P1), "| p2:", len(P2))
