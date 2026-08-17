import pymupdf as fitz

# Estos valores son los que ya viven en el modelo de datos del caso #0247
# dentro del prototipo (institución, fecha de ingreso, hora de ME, sexo, etc.)
# más los datos identificatorios del fallecido (ficticios, para la demo).
DATOS_0247 = {
    "medico1_nombre": "Dr. Martín Sosa — Mat. 45.812",
    "medico2_nombre": "Dra. Valentina Ríos — Mat. 51.230",
    "nombre_fallecido": "Roberto Daniel Guzmán",
    "documento_identidad": "28.541.902",
    "sexo": "Masculino",
    "hora_fallecimiento": "08:42",
    "fecha_fallecimiento": "11 de agosto de 2026",
    "archivo_lugar": "Archivo Serv. de Procuración — Htal. San Martín",
    "ciudad_firma": "La Plata",
    "dia_num": "11",
    "mes_nombre": "agosto",
    "anio": "2026",
}

doc = fitz.open("certificado_interactivo.pdf")
page = doc[0]

for widget in page.widgets():
    if widget.field_name in DATOS_0247:
        widget.field_value = DATOS_0247[widget.field_name]
        widget.update()

doc.save("certificado_0247_completo.pdf")
print("PDF completado generado.")

# render para verificación visual
doc2 = fitz.open("certificado_0247_completo.pdf")
pix = doc2[0].get_pixmap(dpi=150)
pix.save("certificado_0247_completo_render.png")
