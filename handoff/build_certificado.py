import pymupdf as fitz

SRC_IMG = "page_image.jpg"
OUT = "certificado_interactivo.pdf"

# tamaño de página real del formulario original (en puntos)
PAGE_W, PAGE_H = 693, 987

# escala: el mapeo de coordenadas se hizo sobre un render a 150 dpi -> factor a puntos PDF (72dpi)
SCALE = 72 / 150

def pt(px0, py0, px1, py1, pad_top=-6, pad_bot=10):
    x0 = px0 * SCALE
    x1 = px1 * SCALE
    y0 = (py0 + pad_top) * SCALE
    y1 = (py1 + pad_bot) * SCALE
    return fitz.Rect(x0, y0, x1, y1)

FIELDS = [
    # (nombre_campo, x0,y0,x1,y1 en px @150dpi, texto de ayuda)
    ("medico1_nombre",       566, 384, 1330, 407, "Médico 1"),
    ("medico2_nombre",       202, 451, 1005, 478, "Médico 2"),
    ("nombre_fallecido",     140, 691, 1145, 711, "Nombre del fallecido"),
    ("documento_identidad",  307, 757, 598,  778, "DNI"),
    ("sexo",                 661, 757, 1000, 778, "Sexo"),
    ("hora_fallecimiento",  1057, 757, 1240, 778, "Hora"),
    ("fecha_fallecimiento",  226, 827, 1340, 847, "Fecha (día completo)"),
    ("archivo_lugar",        784, 893, 1230, 914, "Lugar de archivo"),
    ("ciudad_firma",         829, 961, 1340, 988, "Ciudad"),
    ("dia_num",              243,1029,  365,1050, "Día"),
    ("mes_nombre",           558,1029,  810,1050, "Mes"),
    ("anio",                 850,1029, 1340,1050, "Año"),
]

# 1) construir un PDF real desde cero, con la imagen del formulario como fondo
doc = fitz.open()
page = doc.new_page(width=PAGE_W, height=PAGE_H)
page.insert_image(fitz.Rect(0, 0, PAGE_W, PAGE_H), filename=SRC_IMG)

# 2) agregar los campos de formulario (AcroForm) sobre esa página
for name, x0, y0, x1, y1, tooltip in FIELDS:
    rect = pt(x0, y0, x1, y1)
    widget = fitz.Widget()
    widget.field_name = name
    widget.field_type = fitz.PDF_WIDGET_TYPE_TEXT
    widget.field_label = tooltip
    widget.rect = rect
    widget.text_font = "helv"
    widget.text_fontsize = 0  # 0 = autoajuste, evita que el texto se corte si es largo
    widget.border_color = None
    widget.fill_color = (0.94, 0.98, 0.97)  # resalta apenas dónde va cada dato
    page.add_widget(widget)

doc.save(OUT)
print("Campos agregados:", len(FIELDS))
print("Guardado:", OUT)
