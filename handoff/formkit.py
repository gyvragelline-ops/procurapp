import pymupdf as fitz

SCALE = 72 / 150  # coordenadas mapeadas sobre un render de referencia a 150 dpi

def px2pt(x0, y0, x1, y1, pad=0):
    return fitz.Rect((x0-pad)*SCALE, (y0-pad)*SCALE, (x1+pad)*SCALE, (y1+pad)*SCALE)

def extract_page_images(src_path, out_prefix):
    """Extrae la imagen de cada página del PDF 'plano' original."""
    doc = fitz.open(src_path)
    sizes = []
    for i, page in enumerate(doc):
        d = page.get_text("dict")
        b = d["blocks"][0]
        img_path = f"{out_prefix}_p{i+1}.jpg"
        with open(img_path, "wb") as f:
            f.write(b["image"])
        sizes.append((page.rect.width, page.rect.height))
    return sizes

def build_interactive(image_paths, page_sizes, fields_by_page, out_path):
    """
    image_paths: lista de rutas de imagen, una por página
    page_sizes: lista de (width_pt, height_pt), una por página
    fields_by_page: lista de listas de tuplas
        (nombre, tipo, x0,y0,x1,y1, label)  -- tipo: 'text' | 'checkbox'
        coordenadas en px @150dpi
    """
    doc = fitz.open()
    for img_path, (w, h), fields in zip(image_paths, page_sizes, fields_by_page):
        page = doc.new_page(width=w, height=h)
        page.insert_image(fitz.Rect(0, 0, w, h), filename=img_path)
        for name, ftype, x0, y0, x1, y1, label in fields:
            rect = px2pt(x0, y0, x1, y1, pad=2)
            widget = fitz.Widget()
            widget.field_name = name
            widget.field_label = label
            widget.rect = rect
            if ftype == "checkbox":
                widget.field_type = fitz.PDF_WIDGET_TYPE_CHECKBOX
                widget.field_value = False
                widget.border_color = (0.55, 0.6, 0.65)
                widget.border_width = 0.8
            else:
                widget.field_type = fitz.PDF_WIDGET_TYPE_TEXT
                widget.text_font = "helv"
                widget.text_fontsize = 0  # autoajuste
                widget.border_color = None
                widget.fill_color = (0.94, 0.98, 0.97)
            page.add_widget(widget)
    doc.save(out_path)
    return doc

def fill_and_export(interactive_path, values, out_path, render_preview=None):
    """values: dict nombre_campo -> valor (str o bool para checkbox)"""
    doc = fitz.open(interactive_path)
    for page in doc:
        for w in page.widgets() or []:
            if w.field_name in values:
                w.field_value = values[w.field_name]
                w.update()
    doc.save(out_path)
    if render_preview:
        doc2 = fitz.open(out_path)
        pix = doc2[0].get_pixmap(dpi=150)
        pix.save(render_preview)
    return doc
