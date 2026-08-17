import formkit as fk

SRC = "/mnt/project/FPrO750301ProtocolodeCoordinadordeDonanteRev_03.pdf"
sizes = fk.extract_page_images(SRC, "coord")

# Solo la sección "Comunicación Familiar" de la página 1 se vuelve interactiva;
# el resto de la página (Datos del Fallecido, Expresión de Voluntad) queda como
# imagen de fondo, sin campos, y las páginas 2 a 4 no se incluyen.
P1 = [
    ("nombre_familiar", "text", 455, 1495, 1310, 1530, "Nombre del familiar"),
    ("dni_familiar", "text", 225, 1565, 580, 1600, "DNI del familiar"),
    ("edad_familiar", "text", 660, 1565, 760, 1600, "Edad del familiar"),
    ("parentesco", "text", 908, 1565, 1335, 1600, "Parentesco"),
    ("direccion_familiar", "text", 290, 1635, 1025, 1670, "Dirección del familiar"),
    ("telefono_familiar", "text", 1145, 1635, 1335, 1670, "Teléfono del familiar"),
]

fk.build_interactive(
    ["coord_p1.jpg"],
    [sizes[0]],
    [P1],
    "coord_comunicacion_familiar.pdf",
)
print("OK — campos:", len(P1))
