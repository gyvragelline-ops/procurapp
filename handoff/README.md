# Motor de generación de planillas interactivas — CUCAIBA

Este código convierte los PDF planos (escaneados/imagen) de CUCAIBA en formularios
interactivos (AcroForm), y permite completarlos automáticamente a partir de un
modelo de datos. Es el motor detrás de las 6 planillas entregadas.

## Qué es cada archivo

- **formkit.py** — el módulo reutilizable. Tiene 3 funciones:
  - `extract_page_images(src_path, out_prefix)`: saca la imagen de cada página
    del PDF original de CUCAIBA (estos PDF no son PDF reales, son un
    contenedor con una imagen adentro — por eso hay que reconstruirlos).
  - `build_interactive(image_paths, page_sizes, fields_by_page, out_path)`:
    arma un PDF nuevo, genuino, con la imagen de fondo y los campos de
    formulario (texto o checkbox) encima, en las coordenadas indicadas.
  - `fill_and_export(interactive_path, values, out_path)`: toma el PDF
    interactivo y un diccionario `{nombre_campo: valor}`, lo completa y
    exporta el PDF final listo para imprimir/firmar.

- **build_*.py** — uno por planilla. Cada uno define la lista de campos
  (`nombre`, `tipo`, `x0,y0,x1,y1`, `etiqueta`) medidos sobre la imagen
  original a 150dpi, y llama a `formkit.build_interactive(...)`.

- **fill_demo.py** — ejemplo de cómo completar el Certificado de Fallecimiento
  con datos del caso demo #0247. Sirve de plantilla para escribir el paso
  "modelo de datos → PDF completado" en la app real.

## Cómo se conecta con la app final

Cada `nombre_campo` en los `build_*.py` (ej. `documento_identidad`,
`hora_fallecimiento`, `lab_Hematocrito_extraccion1`) es, en los hechos, una
variable del modelo de datos del operativo. La app real debería:

1. Mantener un modelo de datos único por donante (un diccionario o tabla),
   con esos mismos nombres de campo como claves.
2. Cuando el procurador complete un dato (por voz, texto o selección), guardarlo
   en ese modelo — nunca directamente en un PDF.
3. Al momento de generar una planilla para CUCAIBA, tomar el PDF interactivo
   correspondiente (ya generado, no hace falta regenerarlo cada vez) y llamar
   a `fill_and_export()` con los valores del modelo que apliquen a esa planilla.

Los PDF interactivos (`*_interactiva.pdf` / los que ya te entregué) **no
necesitan regenerarse**: se generan una sola vez y quedan como plantilla fija.
Lo único que corre en producción, por cada caso, es el paso 3 (rellenar y
exportar).

## Requisitos

```
pip install pymupdf
```

(Se usó pymupdf / fitz. Todo el código corre con esa única dependencia.)

## Si hace falta ajustar o agregar una planilla

El patrón para mapear una planilla nueva:

1. `formkit.extract_page_images(...)` para sacar las imágenes.
2. Renderizarlas (`page.get_pixmap(dpi=150)`) para poder medir coordenadas
   a ojo con una grilla superpuesta, o mejor: usar detección de contornos
   (`cv2.findContours` sobre la imagen binarizada) para encontrar checkboxes
   y cajas de fecha con precisión — es mucho más confiable que medir a ojo.
3. Para líneas de puntos con texto (ej. "Nombre:......."), conviene medir el
   final de la etiqueta con un perfil de densidad en una banda angosta
   (altura del texto, sin tocar la línea/puntos) — mezclar texto y línea en
   la misma banda da lecturas erróneas.
4. Escribir el `build_*.py` con la lista de campos y generar.
5. Renderizar el resultado y revisar visualmente contra el original antes
   de darlo por bueno.
