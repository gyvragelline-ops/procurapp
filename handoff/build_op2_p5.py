import formkit as fk

SRC = "/mnt/project/FPrO750401HistoriaClínicadelPotencialDonanteOP21.pdf"
sizes = fk.extract_page_images(SRC, "op2")

P5 = [
    ("indicaciones_medicas", "text", 140, 448, 1350, 1975, "Indicaciones médicas (aclarar hora, firma y sello en cada indicación)"),
]

fk.build_interactive(
    ["op2_p5.jpg"],
    [sizes[4]],
    [P5],
    "op2_p5_interactiva.pdf",
)
print("OK — campos p5:", len(P5))
